import { connect } from './backend.js';

const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AVATARS = ['🐱', '🐶', '🐼', '🦊', '🐸', '🐵', '🐧', '🐰', '🐯', '🦄', '🐙', '🐲', '🦖', '🐝', '🦉', '🐨'];
const COLORS = ['#ff7a93', '#2fb59c', '#f5a031', '#7b8cff'];
const SHAPES = ['▲', '◆', '●', '■'];

const store = s => ({
  get(k, d) { try { const v = s.getItem('classgame.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { s.setItem('classgame.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { s.removeItem('classgame.' + k); } catch {} },
});
const LS = store(localStorage), SS = store(sessionStorage);

const SAMPLE = `# Mỗi dòng 1 câu:  Câu hỏi | đáp án ĐÚNG | sai | sai | sai
She ___ to school every day. | goes | go | going | gone
They ___ football on Sundays. | play | plays | playing | is play
___ he like pizza? | Does | Do | Is | Are
I ___ like fish. | don't | doesn't | not | isn't
My mum ___ TV in the evening. | watches | watch | watchs | watching
Which word is a fruit? | banana | table | pencil | river
"Thư viện" in English is… | library | bookstore | classroom | museum
Opposite of "hot"? | cold | warm | big | wet
Where ___ you live? | do | does | are | is
The sun ___ in the east. | rises | rise | rising | rose
We ___ English on Monday and Friday. | have | has | having | haves
How ___ apples are there? | many | much | any | lot`;

let api;
let unsubs = [], timers = [];
function stopAll() { unsubs.forEach(u => { try { u(); } catch {} }); unsubs = []; timers.forEach(clearInterval); timers = []; }
const listen = (p, cb) => unsubs.push(api.listen(p, cb));
const every = (ms, fn) => timers.push(setInterval(fn, ms));

function toast(html, ms = 2800) {
  const box = document.getElementById('toast');
  const d = document.createElement('div');
  d.className = 'toast-item'; d.innerHTML = html; box.appendChild(d);
  setTimeout(() => d.classList.add('out'), ms);
  setTimeout(() => d.remove(), ms + 400);
}

const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtTime = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const fmtPin = p => String(p).replace(/(\d{3})(\d{3})/, '$1 $2');
const medal = i => ['🥇', '🥈', '🥉'][i] || '#' + (i + 1);
const joinUrl = pin => location.origin + location.pathname + '?pin=' + pin + (api.local ? '&demo' : '');
const playersOf = g => Object.entries(g?.players || {})
  .filter(([, p]) => p && p.name)
  .map(([id, p]) => ({ id, name: p.name, avatar: p.avatar || '🙂', score: p.score || 0, right: p.right || 0, wrong: p.wrong || 0, online: p.online !== false, joinedAt: p.joinedAt || 0 }))
  .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);

function parseQuestions(text) {
  const qs = [], errors = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s || s.startsWith('#')) return;
    const parts = s.split('|').map(x => x.trim()).filter(Boolean);
    if (parts.length < 3) { errors.push(i + 1); return; }
    qs.push({ q: parts[0], a: parts.slice(1, 5) });
  });
  return { qs, errors };
}

// ---------- Rương ----------
const PRIZES = [
  { type: 'add', n: 10, w: 18, icon: '🪙', label: '+10 điểm' },
  { type: 'add', n: 20, w: 16, icon: '🪙', label: '+20 điểm' },
  { type: 'add', n: 30, w: 12, icon: '💰', label: '+30 điểm' },
  { type: 'add', n: 50, w: 8, icon: '💰', label: '+50 điểm' },
  { type: 'add', n: 100, w: 3, icon: '💎', label: '+100 điểm' },
  { type: 'mul', n: 2, w: 6, icon: '✨', label: 'Nhân đôi điểm!' },
  { type: 'mul', n: 3, w: 2, icon: '🌟', label: 'Nhân ba điểm!' },
  { type: 'steal', w: 12, icon: '🦝', label: 'Cướp 25% điểm của 1 bạn' },
  { type: 'swap', w: 4, icon: '🔄', label: 'Đổi điểm với 1 bạn' },
  { type: 'lose', w: 6, icon: '💸', label: 'Mất 10% điểm' },
  { type: 'none', w: 8, icon: '🕸️', label: 'Rương trống' },
];
function rollPrize() {
  let r = Math.random() * PRIZES.reduce((s, p) => s + p.w, 0);
  for (const p of PRIZES) if ((r -= p.w) < 0) return p;
  return PRIZES[0];
}

// ---------- Bảng xếp hạng (các hàng trượt lên/xuống khi đổi hạng) ----------
function renderBoard(el, list, me, rowH = 58) {
  const max = Math.max(1, ...list.map(p => p.score));
  el.style.height = list.length * rowH + 'px';
  const keep = new Set();
  list.forEach((p, i) => {
    keep.add(p.id);
    let r = [...el.children].find(c => c.dataset.id === p.id);
    if (!r) {
      r = document.createElement('div');
      r.className = 'lb-row'; r.dataset.id = p.id;
      r.innerHTML = '<span class="rk"></span><span class="av"></span><div class="bar"><div class="fill"></div><span class="nm"></span></div><b class="sc"></b>';
      r.style.transform = `translateY(${i * rowH}px)`;
      el.appendChild(r);
    }
    r.style.transform = `translateY(${i * rowH}px)`;
    r.style.height = rowH - 8 + 'px';
    r.querySelector('.rk').textContent = medal(i);
    r.querySelector('.av').textContent = p.avatar;
    r.querySelector('.nm').textContent = p.name;
    r.querySelector('.fill').style.width = Math.max(3, (p.score / max) * 100) + '%';
    const sc = r.querySelector('.sc');
    if (sc.textContent !== String(p.score)) {
      sc.textContent = p.score;
      r.classList.remove('bump'); void r.offsetWidth; r.classList.add('bump');
    }
    r.classList.toggle('me', p.id === me);
    r.classList.toggle('off', !p.online);
  });
  [...el.children].forEach(c => { if (!keep.has(c.dataset.id)) c.remove(); });
}

function podiumHtml(list) {
  const slots = [list[1], list[0], list[2]];
  return `<div class="podium">${slots.map((p, k) => p ? `
    <div class="pod pod${[2, 1, 3][k]}">
      <div class="pav">${p.avatar}</div><div class="pnm">${esc(p.name)}</div><div class="psc">${p.score}</div>
      <div class="pblock">${medal([1, 0, 2][k])}</div>
    </div>` : '<div class="pod"></div>').join('')}</div>`;
}

// =================== GIÁO VIÊN ===================
function hostSetup() {
  stopAll();
  SS.del('hostPin');
  const sets = LS.get('sets', []);
  let mins = LS.get('mins', 5);
  $app.innerHTML = `
    <div class="card">
      <h1>🎓 Tạo phòng chơi</h1>
      <label class="lbl">📚 Bộ đề <select id="sel"></select></label>
      <input id="title" placeholder="Tên bộ đề (vd: Unit 2 – Present Simple)">
      <textarea id="qs" rows="12" spellcheck="false"></textarea>
      <div class="hint">Mỗi dòng 1 câu: <code>Câu hỏi | đáp án ĐÚNG | sai | sai | sai</code> (2–4 đáp án). Dòng bắt đầu bằng # bị bỏ qua. Đáp án sẽ được xáo trộn.</div>
      <div id="info" class="info"></div>
      <div class="row"><button id="save" class="ghost">💾 Lưu bộ đề</button><button id="del" class="ghost">🗑️ Xóa bộ đề</button></div>
      <div class="lbl">⏱️ Thời gian chơi</div>
      <div class="chips" id="mins">${[3, 5, 7, 10, 15].map(m => `<button data-m="${m}" class="chip">${m} phút</button>`).join('')}</div>
      <button id="create" class="big">🚀 Tạo phòng</button>
    </div>`;
  const sel = $('#sel'), title = $('#title'), ta = $('#qs'), info = $('#info');
  const fillSel = id => {
    sel.innerHTML = `<option value="">📘 Bộ đề mẫu</option>` +
      sets.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('') +
      `<option value="__new">➕ Bộ đề mới (trống)</option>`;
    sel.value = id && sets.some(s => s.id === id) ? id : '';
  };
  const load = () => {
    const s = sets.find(s => s.id === sel.value);
    if (sel.value === '__new') { title.value = ''; ta.value = ''; }
    else if (s) { title.value = s.title; ta.value = s.text; }
    else { title.value = 'Bộ đề mẫu – Present Simple'; ta.value = SAMPLE; }
    LS.set('lastSet', sel.value);
    showInfo();
  };
  const showInfo = () => {
    const { qs, errors } = parseQuestions(ta.value);
    info.innerHTML = `✅ <b>${qs.length}</b> câu hỏi` + (errors.length ? ` · ⚠️ dòng ${errors.join(', ')} chưa đúng mẫu (cần ít nhất: câu hỏi | đúng | sai)` : '');
  };
  const setMins = m => { mins = m; LS.set('mins', m); $('#mins').querySelectorAll('.chip').forEach(b => b.classList.toggle('on', +b.dataset.m === m)); };
  fillSel(LS.get('lastSet', '')); load(); setMins(mins);
  sel.onchange = load;
  ta.oninput = showInfo;
  $('#mins').onclick = e => { const b = e.target.closest('[data-m]'); if (b) setMins(+b.dataset.m); };
  $('#save').onclick = () => {
    const t = title.value.trim() || 'Bộ đề không tên';
    let s = sets.find(s => s.id === sel.value);
    if (!s) { s = { id: 's' + Date.now().toString(36) }; sets.push(s); }
    s.title = t; s.text = ta.value;
    LS.set('sets', sets); fillSel(s.id); LS.set('lastSet', s.id);
    toast('💾 Đã lưu bộ đề');
  };
  $('#del').onclick = () => {
    const i = sets.findIndex(s => s.id === sel.value);
    if (i < 0) return toast('Bộ đề mẫu không xóa được');
    if (!confirm('Xóa bộ đề "' + sets[i].title + '"?')) return;
    sets.splice(i, 1); LS.set('sets', sets); fillSel(''); load();
  };
  $('#create').onclick = async () => {
    const { qs } = parseQuestions(ta.value);
    if (qs.length < 2) return toast('⚠️ Cần ít nhất 2 câu hỏi');
    const btn = $('#create'); btn.disabled = true;
    try {
      let pin;
      for (let i = 0; i < 10; i++) {
        pin = String(100000 + Math.floor(Math.random() * 900000));
        if (!(await api.get(`games/${pin}/host`))) break;
      }
      await api.set(`games/${pin}`, {
        host: api.uid, title: title.value.trim() || 'Treasure Quiz', status: 'lobby',
        duration: mins * 60, questions: qs, createdAt: api.now(),
      });
      hostGame(pin);
    } catch (e) { console.error(e); toast('❌ Không tạo được phòng: ' + esc(e.message)); btn.disabled = false; }
  };
}

function hostGame(pin) {
  stopAll();
  SS.set('hostPin', pin);
  const P = `games/${pin}`;
  let game = null, view = null, ending = false, lastEv = null;
  const seenChips = new Set();

  listen(P, g => {
    if (!g || g.host !== api.uid) { toast('Phòng đã đóng'); return hostSetup(); }
    game = g;
    if (view !== g.status) { view = g.status; build(); }
    update();
  });
  every(250, () => {
    if (!game || game.status !== 'playing') return;
    const left = game.endsAt - api.now();
    const t = $('#htimer'); if (t) { t.textContent = '⏱️ ' + fmtTime(left); t.classList.toggle('hurry', left < 30000); }
    if (left <= 0 && !ending) { ending = true; api.update(P, { status: 'ended' }); }
  });

  function build() {
    if (view === 'lobby') {
      ending = false;
      $app.innerHTML = `
        <div class="card center">
          <div class="htitle">${esc(game.title)}</div>
          <div>Học sinh mở link rồi nhập mã phòng:</div>
          <div class="pin">${fmtPin(pin)}</div>
          <div class="linkrow"><code id="link">${esc(joinUrl(pin))}</code><button id="copy" class="ghost small">📋 Copy</button></div>
          <div class="sub">${game.questions.length} câu · ${Math.round(game.duration / 60)} phút</div>
          <div id="lobby" class="lobby"></div>
          <button id="start" class="big">▶️ Bắt đầu!</button>
          <button id="cancel" class="ghost">Hủy phòng</button>
        </div>`;
      $('#copy').onclick = () => navigator.clipboard?.writeText(joinUrl(pin)).then(() => toast('📋 Đã copy link'));
      $('#start').onclick = () => {
        if (!playersOf(game).length) return toast('Chưa có bạn nào vào phòng');
        api.update(P, { status: 'playing', endsAt: api.now() + game.duration * 1000, startedAt: api.now() });
      };
      $('#cancel').onclick = () => { if (confirm('Hủy phòng này?')) api.remove(P); };
      $('#lobby').onclick = e => {
        const b = e.target.closest('[data-kick]');
        if (b && confirm('Cho bạn này ra khỏi phòng?')) api.remove(`${P}/players/${b.dataset.kick}`);
      };
    } else if (view === 'playing') {
      lastEv = null;
      $app.innerHTML = `
        <div class="hplay">
          <div class="htop"><div class="htitle">${esc(game.title)}</div><div class="hpin">Mã ${fmtPin(pin)}</div><div id="htimer" class="htimer"></div></div>
          <div id="board" class="board"></div>
          <div id="feed" class="feed"></div>
          <div class="row"><button id="plus" class="ghost">➕ 1 phút</button><button id="stop" class="ghost">⏹ Kết thúc ngay</button></div>
        </div>`;
      $('#plus').onclick = () => api.update(P, { endsAt: Math.max(game.endsAt, api.now()) + 60000 });
      $('#stop').onclick = () => { if (confirm('Kết thúc ván ngay bây giờ?')) api.update(P, { status: 'ended' }); };
    } else if (view === 'ended') {
      const list = playersOf(game);
      $app.innerHTML = `
        <div class="card center">
          <h1>🏆 Kết quả</h1>
          ${podiumHtml(list)}
          <table class="res"><tr><th>#</th><th>Tên</th><th>Điểm</th><th>✅ Đúng</th><th>❌ Sai</th><th>Tỉ lệ</th></tr>
          ${list.map((p, i) => `<tr><td>${medal(i)}</td><td>${p.avatar} ${esc(p.name)}</td><td><b>${p.score}</b></td><td>${p.right}</td><td>${p.wrong}</td><td>${p.right + p.wrong ? Math.round(p.right * 100 / (p.right + p.wrong)) + '%' : '–'}</td></tr>`).join('')}
          </table>
          <button id="again" class="big">🔁 Chơi lại (cùng nhóm, cùng đề)</button>
          <button id="newroom" class="ghost">🆕 Phòng mới / đổi đề</button>
        </div>`;
      $('#again').onclick = () => {
        const u = { status: 'lobby', endsAt: null, startedAt: null, events: null };
        playersOf(game).forEach(p => { u[`players/${p.id}/score`] = 0; u[`players/${p.id}/right`] = 0; u[`players/${p.id}/wrong`] = 0; });
        api.update(P, u);
      };
      $('#newroom').onclick = hostSetup;
    }
  }

  function update() {
    const list = playersOf(game);
    if (view === 'lobby') {
      $('#lobby').innerHTML = list.length
        ? list.map(p => `<div class="pchip ${p.online ? '' : 'off'} ${seenChips.has(p.id) ? '' : 'new'}"><span>${p.avatar}</span>${esc(p.name)}<button data-kick="${esc(p.id)}" title="Cho ra">×</button></div>`).join('')
        : '<div class="sub">Đang chờ học sinh vào… 👀</div>';
      list.forEach(p => seenChips.add(p.id));
    } else if (view === 'playing') {
      renderBoard($('#board'), list, null, 66);
      const evs = Object.entries(game.events || {}).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-6).reverse();
      const top = evs[0]?.[0] || null;
      if (top !== lastEv) {
        $('#feed').innerHTML = evs.map(([k, e], i) => `<div class="ev ${i === 0 && k !== lastEv ? 'new' : ''}">${esc(e.text)}</div>`).join('');
        lastEv = top;
      }
    }
  }
}

// =================== HỌC SINH ===================
function joinView(prefill = '', msg = '') {
  stopAll();
  SS.del('playerPin');
  const me = LS.get('me', { name: '', avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)] });
  let avatar = me.avatar;
  $app.innerHTML = `
    <div class="card join center">
      <div class="logo">🏴‍☠️💰</div>
      <h1>Yumi Treasure Quiz</h1>
      ${msg ? `<div class="msg bad">${esc(msg)}</div>` : ''}
      <input id="pin" inputmode="numeric" maxlength="7" placeholder="Mã phòng (6 số)" value="${esc(prefill)}">
      <input id="name" maxlength="14" placeholder="Tên của em" value="${esc(me.name)}">
      <div class="lbl">Chọn nhân vật</div>
      <div class="avatars">${AVATARS.map(a => `<button class="avb" data-a="${a}">${a}</button>`).join('')}</div>
      <button id="join" class="big">Vào chơi 🚀</button>
      <div id="err" class="err"></div>
      <a href="#host" class="teacher">🎓 Dành cho giáo viên</a>
    </div>`;
  const mark = () => $app.querySelectorAll('.avb').forEach(b => b.classList.toggle('on', b.dataset.a === avatar));
  mark();
  $app.querySelector('.avatars').onclick = e => { const b = e.target.closest('.avb'); if (b) { avatar = b.dataset.a; mark(); } };
  const err = t => { $('#err').textContent = t; $('#join').disabled = false; };
  $('#name').onkeydown = $('#pin').onkeydown = e => { if (e.key === 'Enter') $('#join').click(); };
  $('#join').onclick = async () => {
    const pin = $('#pin').value.replace(/\D/g, '');
    const name = $('#name').value.trim().replace(/\s+/g, ' ');
    if (pin.length !== 6) return err('Mã phòng gồm 6 số nhé');
    if (!name) return err('Em nhập tên nhé');
    $('#join').disabled = true;
    try {
      const g = await api.get(`games/${pin}`);
      if (!g || !g.host) return err('Không tìm thấy phòng ' + fmtPin(pin));
      if (g.status === 'ended') return err('Phòng này đã kết thúc rồi');
      if (playersOf(g).some(p => p.id !== api.uid && p.name.toLowerCase() === name.toLowerCase())) return err('Tên này có bạn dùng rồi, em đổi tên khác nhé');
      const P = `games/${pin}/players/${api.uid}`;
      if (g.players?.[api.uid]?.name) await api.update(P, { name, avatar });
      else await api.set(P, { name, avatar, score: 0, right: 0, wrong: 0, joinedAt: api.now(), online: true });
      LS.set('me', { name, avatar });
      playerGame(pin);
    } catch (e) { console.error(e); err('Lỗi kết nối: ' + e.message); }
  };
}

function playerGame(pin) {
  stopAll();
  SS.set('playerPin', pin);
  const me = api.uid, G = `games/${pin}`, MY = `${G}/players/${me}`;
  unsubs.push(api.presence(`${MY}/online`));
  let game = null, view = null, seenEv = null, order = [], qi = 0, phase = null;
  const seenChips = new Set();

  const leave = msg => { stopAll(); joinView(pin, msg); };
  const myInfo = () => playersOf(game).find(p => p.id === me) || { name: '', avatar: '🙂', score: 0, right: 0, wrong: 0 };
  const who = p => `${p.avatar} ${p.name}`;

  listen(G, g => {
    if (!g) return leave('Phòng đã đóng 👋');
    if (!g.players?.[me]?.name) return leave('Em đã ra khỏi phòng');
    game = g;
    checkEvents();
    const st = status();
    if (view !== st) { view = st; build(); }
    update();
  });
  every(250, () => {
    if (!game) return;
    const st = status();
    if (st !== view) { view = st; build(); update(); }
    const t = $('#ptimer');
    if (t && game.endsAt) { const left = game.endsAt - api.now(); t.textContent = '⏱️ ' + fmtTime(left); t.classList.toggle('hurry', left < 30000); }
  });

  function status() {
    if (game.status === 'playing' && game.endsAt && api.now() >= game.endsAt) return 'timeup';
    return game.status;
  }

  function checkEvents() {
    const keys = Object.keys(game.events || {}).sort();
    if (seenEv === null) { seenEv = new Set(keys); return; }
    keys.forEach(k => {
      if (seenEv.has(k)) return;
      seenEv.add(k);
      const e = game.events[k];
      if (e.target === me) toast(esc(e.text), 4000);
    });
  }

  function build() {
    const m = myInfo();
    if (view === 'lobby') {
      phase = null; order = []; qi = 0;
      $app.innerHTML = `
        <div class="card center">
          <div class="bigav">${m.avatar}</div>
          <h2>Chào ${esc(m.name)}! 👋</h2>
          <div class="sub">Đã vào phòng <b>${fmtPin(pin)}</b>. Chờ cô bắt đầu nhé…</div>
          <div class="dots"><span></span><span></span><span></span></div>
          <div id="lobby" class="lobby"></div>
          <button id="quit" class="ghost small">Thoát</button>
        </div>`;
      $('#quit').onclick = async () => { await api.remove(MY); };
    } else if (view === 'playing') {
      $app.innerHTML = `
        <div class="pbar"><span class="pme">${m.avatar} ${esc(m.name)}</span><span id="prank" class="prank"></span><span id="pscore" class="pscore"></span><span id="ptimer" class="ptimer"></span></div>
        <div id="stage" class="stage"></div>
        <div class="mini"><div id="board" class="board"></div></div>`;
      nextQuestion();
    } else if (view === 'timeup') {
      $app.innerHTML = `
        <div class="card center">
          <div class="bigav">⏰</div><h2>Hết giờ!</h2>
          <div class="sub">Chờ cô công bố kết quả…</div>
          <div id="board" class="board"></div>
        </div>`;
    } else if (view === 'ended') {
      const list = playersOf(game), rank = list.findIndex(p => p.id === me);
      $app.innerHTML = `
        <div class="card center">
          <div class="bigmedal">${rank < 3 ? medal(rank) : '🎉'}</div>
          <h2>Em xếp hạng ${rank + 1}/${list.length}</h2>
          <div class="sub">💰 <b>${m.score}</b> điểm · ✅ ${m.right} câu đúng · ❌ ${m.wrong} câu sai</div>
          ${podiumHtml(list)}
          <div class="sub">Chờ cô mở ván mới, hoặc</div>
          <button id="quit" class="ghost small">Thoát</button>
        </div>`;
      $('#quit').onclick = () => leave('');
    }
  }

  function update() {
    const list = playersOf(game);
    if (view === 'lobby') {
      $('#lobby').innerHTML = list.map(p => `<div class="pchip ${p.id === me ? 'me' : ''} ${seenChips.has(p.id) ? '' : 'new'}"><span>${p.avatar}</span>${esc(p.name)}</div>`).join('');
      list.forEach(p => seenChips.add(p.id));
    } else if (view === 'playing' || view === 'timeup') {
      renderBoard($('#board'), list, me, view === 'playing' ? 44 : 58);
      const i = list.findIndex(p => p.id === me);
      if ($('#prank')) $('#prank').textContent = medal(i);
      const ps = $('#pscore');
      if (ps) {
        const t = '💰 ' + (list[i]?.score || 0);
        if (ps.textContent !== t) { ps.textContent = t; ps.classList.remove('bump'); void ps.offsetWidth; ps.classList.add('bump'); }
      }
    }
  }

  // ----- câu hỏi -----
  function nextQuestion() {
    const qs = game.questions || [];
    const stage = $('#stage');
    if (!stage) return;
    if (!qs.length) { stage.innerHTML = '<div class="msg">Chưa có câu hỏi</div>'; return; }
    if (qi >= order.length) {
      const last = order[order.length - 1];
      order = shuffle(qs.map((_, i) => i));
      if (order.length > 1 && order[0] === last) [order[0], order[1]] = [order[1], order[0]];
      qi = 0;
    }
    const q = qs[order[qi++]];
    const opts = shuffle(q.a.map((t, i) => ({ t, ok: i === 0 })));
    phase = 'q';
    stage.innerHTML = `
      <div class="qcard"><div class="qtext">${esc(q.q)}</div></div>
      <div class="answers">${opts.map((o, i) => `<button class="ans" data-i="${i}" style="--c:${COLORS[i]}"><span class="shape">${SHAPES[i]}</span><span>${esc(o.t)}</span></button>`).join('')}</div>
      <div id="after"></div>`;
    stage.querySelectorAll('.ans').forEach(b => b.onclick = () => answer(+b.dataset.i));

    function answer(i) {
      if (phase !== 'q') return;
      phase = 'answered';
      const ok = opts[i].ok;
      stage.querySelectorAll('.ans').forEach((b, k) => b.classList.add(opts[k].ok ? 'right' : k === i ? 'wrong' : 'dim'));
      bumpStat(ok ? 'right' : 'wrong');
      if (ok) setTimeout(() => { if (phase === 'answered' && $('#stage') === stage) showChests(); }, 650);
      else {
        const after = $('#after');
        after.innerHTML = `<div class="msg bad">❌ Chưa đúng! Đáp án: <b>${esc(q.a[0])}</b></div>`;
        nextButton(after, 1500);
      }
    }
  }

  function nextButton(box, delay = 0) {
    const b = document.createElement('button');
    b.className = 'big next'; b.textContent = 'Câu tiếp ›'; b.disabled = delay > 0;
    b.onclick = () => nextQuestion();
    box.appendChild(b);
    if (delay) setTimeout(() => { b.disabled = false; }, delay);
  }

  function showChests() {
    phase = 'chest';
    const prizes = [rollPrize(), rollPrize(), rollPrize()];
    const stage = $('#stage');
    stage.innerHTML = `
      <div class="msg good">✅ Đúng rồi! Chọn 1 rương 👇</div>
      <div class="chests">${[0, 1, 2].map(i => `<button class="chest" data-i="${i}">🎁</button>`).join('')}</div>
      <div id="after"></div>`;
    stage.querySelectorAll('.chest').forEach(b => b.onclick = () => {
      if (phase !== 'chest') return;
      phase = 'opened';
      const pick = +b.dataset.i;
      stage.querySelectorAll('.chest').forEach((c, k) => {
        const p = prizes[k];
        c.classList.add('open', k === pick ? 'picked' : 'other');
        c.innerHTML = `<span class="pi">${p.icon}</span><small>${esc(p.label)}</small>`;
      });
      applyPrize(prizes[pick]);
    });
  }

  async function applyPrize(p) {
    const after = $('#after');
    const others = playersOf(game).filter(x => x.id !== me);
    if ((p.type === 'steal' || p.type === 'swap') && !others.length) p = { type: 'add', n: 20, label: '+20 điểm' };
    const m = myInfo();
    let line = '';
    if (p.type === 'add') {
      await changeScore(s => s + p.n);
      line = `🪙 +${p.n} điểm!`;
      if (p.n >= 50) feed(`${who(m)} mở được ${p.n === 100 ? '💎' : '💰'} +${p.n}`);
    } else if (p.type === 'mul') {
      const d = await changeScore(s => s * p.n);
      line = `${p.icon} Nhân ${p.n}: +${d} điểm!`;
      if (d) feed(`${who(m)} ${p.icon} nhân ${p.n} điểm (+${d})`);
    } else if (p.type === 'lose') {
      const d = await changeScore(s => s * 0.9);
      line = `💸 Ối, mất ${-d} điểm`;
      if (d) feed(`${who(m)} 💸 làm rơi ${-d} điểm`);
    } else if (p.type === 'none') {
      line = '🕸️ Rương trống trơn…';
    } else {
      return chooseTarget(p, after);
    }
    after.innerHTML = `<div class="msg">${line}</div>`;
    nextButton(after);
  }

  function chooseTarget(p, after) {
    phase = 'target';
    const others = playersOf(game).filter(x => x.id !== me);
    after.innerHTML = `
      <div class="msg">${p.type === 'steal' ? '🦝 Chọn 1 bạn để cướp 25% điểm:' : '🔄 Chọn 1 bạn để đổi điểm:'}</div>
      <div class="targets">${others.map(o => `<button class="target" data-id="${esc(o.id)}"><span>${o.avatar}</span>${esc(o.name)}<b>${o.score}</b></button>`).join('')}</div>`;
    after.querySelectorAll('.target').forEach(b => b.onclick = async () => {
      if (phase !== 'target') return;
      phase = 'targeted';
      const tid = b.dataset.id;
      let mine = 0, theirs = 0, amt = 0, ok = false;
      await api.transaction(`${G}/players`, ps => {
        if (ps === null) return null;
        const a = ps[me], t = ps[tid];
        if (!a?.name || !t?.name) { ok = false; return; }
        ok = true; mine = a.score || 0; theirs = t.score || 0;
        if (p.type === 'steal') { amt = Math.floor(theirs * 0.25); t.score = theirs - amt; a.score = mine + amt; }
        else { a.score = theirs; t.score = mine; }
        return ps;
      });
      const m = myInfo(), t = playersOf(game).find(x => x.id === tid) || { avatar: '', name: 'bạn ấy' };
      let line;
      if (!ok) line = 'Bạn ấy không còn trong phòng 😅';
      else if (p.type === 'steal') {
        line = amt ? `🦝 Em cướp được ${amt} điểm của ${esc(t.name)}!` : `🦝 ${esc(t.name)} chưa có điểm nào để cướp 😆`;
        if (amt) feed(`${who(m)} 🦝 cướp ${amt} điểm của ${who(t)}`, tid);
      } else {
        line = `🔄 Đã đổi điểm với ${esc(t.name)}: ${mine} ⇄ ${theirs}`;
        feed(`${who(m)} 🔄 đổi điểm với ${who(t)} (${mine} ⇄ ${theirs})`, tid);
      }
      after.innerHTML = `<div class="msg">${line}</div>`;
      nextButton(after);
    });
  }

  function bumpStat(k) {
    return api.transaction(MY, p => { if (p === null) return null; if (!p.name) return; p[k] = (p[k] || 0) + 1; return p; });
  }
  async function changeScore(fn) {
    let before = 0, after = 0;
    await api.transaction(MY, p => {
      if (p === null) return null;
      if (!p.name) return;
      before = p.score || 0; after = Math.max(0, Math.round(fn(before)));
      p.score = after; return p;
    });
    return after - before;
  }
  function feed(text, target) {
    const e = { t: api.now(), by: me, text };
    if (target) e.target = target;
    api.push(`${G}/events`, e);
  }
}

// =================== KHỞI ĐỘNG ===================
function $(s) { return document.querySelector(s); }

function route() {
  stopAll();
  if (location.hash === '#host') {
    const pin = SS.get('hostPin', null);
    if (pin) return api.get(`games/${pin}/host`).then(h => (h === api.uid ? hostGame(pin) : hostSetup()));
    return hostSetup();
  }
  const pin = SS.get('playerPin', null);
  if (pin) return api.get(`games/${pin}/players/${api.uid}/name`).then(n => (n ? playerGame(pin) : joinView(pin)));
  joinView(new URLSearchParams(location.search).get('pin') || '');
}

(async function main() {
  try {
    api = await connect();
  } catch (e) {
    console.error(e);
    const code = e.code || '';
    $app.innerHTML = `<div class="card center"><h2>😵 Không kết nối được</h2><div class="sub">${
      code.includes('operation-not-allowed') || code.includes('admin-restricted')
        ? 'Firebase chưa bật đăng nhập <b>Anonymous</b> (xem HUONG-DAN.md bước 3).'
        : esc(e.message)}</div><button class="big" onclick="location.reload()">Thử lại</button></div>`;
    return;
  }
  if (api.local) {
    const b = document.createElement('div');
    b.className = 'demo-banner';
    b.textContent = '🧪 Chế độ thử — chỉ chơi được giữa các tab trên cùng 1 máy';
    document.body.prepend(b);
  }
  window.addEventListener('hashchange', route);
  route();
})();
