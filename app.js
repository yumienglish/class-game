import { connect } from './backend.js?v=2';
import { sfx, music, musicSpeed, controls } from './sound.js?v=1';

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

const SAMPLE = `# One question per line:  Question | RIGHT answer | wrong | wrong | wrong
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

// ---------- Bộ từ vựng có tranh ----------
const DECKS = { u8: { title: 'Unit 8 – Get Set, Go! (PET B1)', file: './decks/unit8.js?v=3' } };
const QTYPES = { pic: '🖼️ Picture → word', vi: '💬 Vietnamese → word', def: '📖 Meaning → word', word2pic: '🔤 Word → picture' };
const deckCache = {};
function loadDeck(id) {
  if (!DECKS[id]) return Promise.reject(new Error('Word set not found: ' + id));
  return deckCache[id] ||= import(DECKS[id].file).then(m => m.DECK);
}
function pickDistractors(deck, word, n, pool) {
  const bad = new Set([word.w]);
  deck.confuse.forEach(g => { if (g.includes(word.w)) g.forEach(x => bad.add(x)); });
  const ok = w => !bad.has(w.w);
  const out = shuffle(deck.words.filter(w => w.c === word.c && ok(w))).slice(0, n);
  for (const src of [pool, deck.words]) {
    if (out.length >= n) break;
    shuffle(src.filter(w => ok(w) && !out.includes(w))).slice(0, n - out.length).forEach(w => out.push(w));
  }
  return out;
}
const imgTag = (src, cls = '') => `<img src="${esc(src)}" alt="" class="${cls}" draggable="false">`;
function deckQuestion(deck, word, type, pool) {
  const opts = shuffle([word, ...pickDistractors(deck, word, 3, pool)]);
  const answer = `${imgTag(word.img, 'mini')} <b>${esc(word.w)}</b> – ${esc(word.vi)}`;
  if (type === 'word2pic') return {
    pics: true, answer,
    prompt: `<div class="qsub">🔤 Find the picture:</div><div class="qtext">${esc(word.w)}</div>`,
    opts: opts.map(w => ({ html: imgTag(w.img), ok: w === word })),
  };
  const prompt = type === 'pic' ? `${imgTag(word.img, 'qimg')}<div class="qsub">What is this?</div>`
    : type === 'vi' ? `<div class="qsub">💬 Which word is…</div><div class="qtext">${esc(word.vi)}</div>`
    : `<div class="qsub">📖 Which word means…</div><div class="qtext def">“${esc(word.en)}”</div>`;
  return { prompt, answer, opts: opts.map(w => ({ html: esc(w.w), ok: w === word })) };
}
function textQuestion(q) {
  return { prompt: `<div class="qtext">${esc(q.q)}</div>`, answer: `<b>${esc(q.a[0])}</b>`, opts: shuffle(q.a.map((t, i) => ({ html: esc(t), ok: i === 0 }))) };
}

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
  { type: 'add', n: 10, w: 18, icon: '🪙', label: '+10' },
  { type: 'add', n: 20, w: 16, icon: '🪙', label: '+20' },
  { type: 'add', n: 30, w: 12, icon: '💰', label: '+30' },
  { type: 'add', n: 50, w: 8, icon: '💰', label: '+50' },
  { type: 'add', n: 100, w: 3, icon: '💎', label: '+100' },
  { type: 'mul', n: 2, w: 6, icon: '✨', label: 'Double!' },
  { type: 'mul', n: 3, w: 2, icon: '🌟', label: 'Triple!' },
  { type: 'steal', w: 12, icon: '🦝', label: 'Steal!' },
  { type: 'swap', w: 4, icon: '🔄', label: 'Swap!' },
  { type: 'lose', w: 6, icon: '💸', label: 'Oops! -10%' },
  { type: 'none', w: 8, icon: '🕸️', label: 'Empty' },
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
  let deckTypes = LS.get('deckTypes', Object.keys(QTYPES));
  let deckCats = LS.get('deckCats', null);
  let deck = null;
  music(null); controls(true);
  $app.innerHTML = `
    <div class="card">
      <h1>🎓 New game</h1>
      <label class="lbl">📚 Questions <select id="sel"></select></label>
      <div id="pasteBox">
        <input id="title" placeholder="Set name (e.g. Unit 2 – Present Simple)">
        <textarea id="qs" rows="12" spellcheck="false"></textarea>
        <div class="hint">One question per line: <code>Question | RIGHT answer | wrong | wrong | wrong</code> (2–4 answers). Lines starting with # are skipped. Answers are shuffled.</div>
        <div id="info" class="info"></div>
        <div class="row"><button id="save" class="ghost">💾 Save set</button><button id="del" class="ghost">🗑️ Delete set</button></div>
      </div>
      <div id="deckBox" hidden>
        <div id="deckPrev" class="deckprev"></div>
        <div class="lbl">❓ Question types (mixed)</div>
        <div class="chips" id="dTypes">${Object.entries(QTYPES).map(([k, v]) => `<button data-t="${k}" class="chip">${v}</button>`).join('')}</div>
        <div class="lbl">🏷️ Topics</div>
        <div class="chips" id="dCats"></div>
        <div id="dInfo" class="info"></div>
      </div>
      <div class="lbl">⏱️ Game time</div>
      <div class="chips" id="mins">${[3, 5, 7, 10, 15].map(m => `<button data-m="${m}" class="chip">${m} min</button>`).join('')}</div>
      <button id="create" class="big">🚀 Create game</button>
    </div>`;
  const sel = $('#sel'), title = $('#title'), ta = $('#qs'), info = $('#info');
  const fillSel = id => {
    sel.innerHTML = `<optgroup label="Picture word sets">${Object.entries(DECKS).map(([k, d]) => `<option value="deck:${k}">🖼️ ${esc(d.title)}</option>`).join('')}</optgroup>` +
      `<optgroup label="My question sets"><option value="">📘 Sample set</option>` +
      sets.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('') +
      `<option value="__new">➕ New set (empty)</option></optgroup>`;
    sel.value = id && (sets.some(s => s.id === id) || DECKS[id.slice(5)]) ? id : '';
  };
  const deckWords = () => deck ? deck.words.filter(w => deckCats.includes(w.c)) : [];
  const showDeck = () => {
    $('#dTypes').querySelectorAll('.chip').forEach(b => b.classList.toggle('on', deckTypes.includes(b.dataset.t)));
    $('#dCats').querySelectorAll('.chip').forEach(b => b.classList.toggle('on', deckCats.includes(b.dataset.c)));
    const n = deckWords().length;
    $('#dInfo').innerHTML = n >= 4 && deckTypes.length ? `✅ <b>${n}</b> words · ${deckTypes.length} question type${deckTypes.length > 1 ? 's' : ''}` : '⚠️ Pick at least 1 question type and 4 words';
  };
  const load = async () => {
    const isDeck = sel.value.startsWith('deck:');
    $('#pasteBox').hidden = isDeck; $('#deckBox').hidden = !isDeck;
    LS.set('lastSet', sel.value);
    if (isDeck) {
      deck = await loadDeck(sel.value.slice(5));
      if (!deckCats || !deckCats.some(c => deck.cats[c])) deckCats = Object.keys(deck.cats);
      $('#dCats').innerHTML = Object.entries(deck.cats).map(([k, v]) => `<button data-c="${k}" class="chip">${esc(v)} <small>${deck.words.filter(w => w.c === k).length}</small></button>`).join('');
      $('#deckPrev').innerHTML = shuffle(deck.words).slice(0, 8).map(w => `<img src="${w.img}" alt="" title="${esc(w.w)}">`).join('');
      showDeck();
      return;
    }
    const s = sets.find(s => s.id === sel.value);
    if (sel.value === '__new') { title.value = ''; ta.value = ''; }
    else if (s) { title.value = s.title; ta.value = s.text; }
    else { title.value = 'Sample – Present Simple'; ta.value = SAMPLE; }
    LS.set('lastSet', sel.value);
    showInfo();
  };
  const showInfo = () => {
    const { qs, errors } = parseQuestions(ta.value);
    info.innerHTML = `✅ <b>${qs.length}</b> questions` + (errors.length ? ` · ⚠️ line ${errors.join(', ')}: wrong format (need at least: question | right | wrong)` : '');
  };
  const setMins = m => { mins = m; LS.set('mins', m); $('#mins').querySelectorAll('.chip').forEach(b => b.classList.toggle('on', +b.dataset.m === m)); };
  fillSel(LS.get('lastSet', '')); load(); setMins(mins);
  sel.onchange = load;
  ta.oninput = showInfo;
  $('#dTypes').onclick = e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    deckTypes = deckTypes.includes(b.dataset.t) ? deckTypes.filter(t => t !== b.dataset.t) : [...deckTypes, b.dataset.t];
    LS.set('deckTypes', deckTypes); showDeck();
  };
  $('#dCats').onclick = e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    deckCats = deckCats.includes(b.dataset.c) ? deckCats.filter(c => c !== b.dataset.c) : [...deckCats, b.dataset.c];
    LS.set('deckCats', deckCats); showDeck();
  };
  $('#mins').onclick = e => { const b = e.target.closest('[data-m]'); if (b) setMins(+b.dataset.m); };
  $('#save').onclick = () => {
    const t = title.value.trim() || 'Untitled set';
    let s = sets.find(s => s.id === sel.value);
    if (!s) { s = { id: 's' + Date.now().toString(36) }; sets.push(s); }
    s.title = t; s.text = ta.value;
    LS.set('sets', sets); fillSel(s.id); LS.set('lastSet', s.id);
    toast('💾 Saved');
  };
  $('#del').onclick = () => {
    const i = sets.findIndex(s => s.id === sel.value);
    if (i < 0) return toast('This set can’t be deleted');
    if (!confirm('Delete "' + sets[i].title + '"?')) return;
    sets.splice(i, 1); LS.set('sets', sets); fillSel(''); load();
  };
  $('#create').onclick = async () => {
    let room;
    if (sel.value.startsWith('deck:')) {
      const n = deckWords().length;
      if (n < 4 || !deckTypes.length) return toast('⚠️ Pick at least 1 question type and 4 words');
      room = { title: deck.title, deck: deck.id, types: deckTypes, cats: deckCats, qcount: n };
    } else {
      const { qs } = parseQuestions(ta.value);
      if (qs.length < 2) return toast('⚠️ Need at least 2 questions');
      room = { title: title.value.trim() || 'Treasure Quiz', questions: qs, qcount: qs.length };
    }
    const btn = $('#create'); btn.disabled = true;
    try {
      let pin;
      for (let i = 0; i < 10; i++) {
        pin = String(100000 + Math.floor(Math.random() * 900000));
        if (!(await api.get(`games/${pin}/host`))) break;
      }
      await api.set(`games/${pin}`, { ...room, host: api.uid, status: 'lobby', duration: mins * 60, createdAt: api.now() });
      hostGame(pin);
    } catch (e) { console.error(e); toast('❌ Could not create the game: ' + esc(e.message)); btn.disabled = false; }
  };
}

function hostGame(pin) {
  stopAll();
  SS.set('hostPin', pin);
  const P = `games/${pin}`;
  let game = null, view = null, ending = false, lastEv = null, lastSec = null, evReady = false;
  const seenChips = new Set();
  controls(true);

  listen(P, g => {
    if (!g || g.host !== api.uid) { toast('Game closed'); return hostSetup(); }
    game = g;
    if (view !== g.status) { const from = view; view = g.status; build(from); }
    update();
  });
  every(250, () => {
    if (!game || game.status !== 'playing') return;
    const left = game.endsAt - api.now();
    const t = $('#htimer'); if (t) { t.textContent = '⏱️ ' + fmtTime(left); t.classList.toggle('hurry', left < 30000); }
    musicSpeed(left < 30000 ? 1.15 : 1);
    const sec = Math.ceil(left / 1000);
    if (sec !== lastSec) { if (sec > 0 && sec <= 10 && lastSec !== null) sfx('tick'); lastSec = sec; }
    if (left <= 0 && !ending) { ending = true; api.update(P, { status: 'ended' }); }
  });

  function build(from) {
    if (view === 'lobby') {
      ending = false;
      music('lobby');
      $app.innerHTML = `
        <div class="card center">
          <div class="htitle">${esc(game.title)}</div>
          <div>Open the link and type the game PIN:</div>
          <div class="pin">${fmtPin(pin)}</div>
          <div class="linkrow"><code id="link">${esc(joinUrl(pin))}</code><button id="copy" class="ghost small">📋 Copy</button></div>
          <div class="sub">${game.deck ? `🖼️ ${game.qcount} words · ${game.types.map(t => QTYPES[t]?.split(' ')[0] || '').join(' ')}` : `${game.qcount || game.questions?.length || 0} questions`} · ${Math.round(game.duration / 60)} min</div>
          <div id="lobby" class="lobby"></div>
          <button id="start" class="big">▶️ Start!</button>
          <button id="cancel" class="ghost">Cancel game</button>
        </div>`;
      $('#copy').onclick = () => navigator.clipboard?.writeText(joinUrl(pin)).then(() => toast('📋 Link copied'));
      $('#start').onclick = () => {
        if (!playersOf(game).length) return toast('No players yet');
        api.update(P, { status: 'playing', endsAt: api.now() + game.duration * 1000, startedAt: api.now() });
      };
      $('#cancel').onclick = () => { if (confirm('Cancel this game?')) api.remove(P); };
      $('#lobby').onclick = e => {
        const b = e.target.closest('[data-kick]');
        if (b && confirm('Remove this player?')) api.remove(`${P}/players/${b.dataset.kick}`);
      };
    } else if (view === 'playing') {
      lastEv = null; lastSec = null; evReady = false;
      music('game');
      if (from === 'lobby') sfx('start');
      $app.innerHTML = `
        <div class="hplay">
          <div class="htop"><div class="htitle">${esc(game.title)}</div><div class="hpin">PIN ${fmtPin(pin)}</div><div id="htimer" class="htimer"></div></div>
          <div id="board" class="board"></div>
          <div id="feed" class="feed"></div>
          <div class="row"><button id="plus" class="ghost">➕ 1 min</button><button id="stop" class="ghost">⏹ End now</button></div>
        </div>`;
      $('#plus').onclick = () => api.update(P, { endsAt: Math.max(game.endsAt, api.now()) + 60000 });
      $('#stop').onclick = () => { if (confirm('End the game now?')) api.update(P, { status: 'ended' }); };
    } else if (view === 'ended') {
      const list = playersOf(game);
      music(null); musicSpeed(1);
      if (from) sfx('win');
      $app.innerHTML = `
        <div class="card center">
          <h1>🏆 Results</h1>
          ${podiumHtml(list)}
          <table class="res"><tr><th>#</th><th>Name</th><th>Points</th><th>✅ Right</th><th>❌ Wrong</th><th>Score</th></tr>
          ${list.map((p, i) => `<tr><td>${medal(i)}</td><td>${p.avatar} ${esc(p.name)}</td><td><b>${p.score}</b></td><td>${p.right}</td><td>${p.wrong}</td><td>${p.right + p.wrong ? Math.round(p.right * 100 / (p.right + p.wrong)) + '%' : '–'}</td></tr>`).join('')}
          </table>
          <button id="again" class="big">🔁 Play again (same players)</button>
          <button id="newroom" class="ghost">🆕 New game</button>
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
        ? list.map(p => `<div class="pchip ${p.online ? '' : 'off'} ${seenChips.has(p.id) ? '' : 'new'}"><span>${p.avatar}</span>${esc(p.name)}<button data-kick="${esc(p.id)}" title="Remove">×</button></div>`).join('')
        : '<div class="sub">Waiting for players… 👀</div>';
      if (list.some(p => !seenChips.has(p.id))) sfx('pop');
      list.forEach(p => seenChips.add(p.id));
    } else if (view === 'playing') {
      renderBoard($('#board'), list, null, 66);
      const evs = Object.entries(game.events || {}).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-6).reverse();
      const top = evs[0]?.[0] || null;
      if (top !== lastEv) {
        $('#feed').innerHTML = evs.map(([k, e], i) => `<div class="ev ${i === 0 && k !== lastEv ? 'new' : ''}">${esc(e.text)}</div>`).join('');
        if (evReady && evs[0]) sfx({ steal: 'steal', swap: 'swap', big: 'coins', mul: 'magic', lose: 'lose' }[evs[0][1].kind] || 'pop');
        lastEv = top;
      }
      evReady = true;
    }
  }
}

// =================== HỌC SINH ===================
function joinView(prefill = '', msg = '') {
  stopAll();
  SS.del('playerPin');
  const me = LS.get('me', { name: '', avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)] });
  let avatar = me.avatar;
  music(null); controls(false);
  $app.innerHTML = `
    <div class="card join center">
      <div class="logo">🏴‍☠️💰</div>
      <h1>Yumi Treasure Quiz</h1>
      ${msg ? `<div class="msg bad">${esc(msg)}</div>` : ''}
      <input id="pin" inputmode="numeric" maxlength="7" placeholder="Game PIN (6 numbers)" value="${esc(prefill)}">
      <input id="name" maxlength="14" placeholder="Your name" value="${esc(me.name)}">
      <div class="lbl">Pick your animal</div>
      <div class="avatars">${AVATARS.map(a => `<button class="avb" data-a="${a}">${a}</button>`).join('')}</div>
      <button id="join" class="big">Join! 🚀</button>
      <div id="err" class="err"></div>
      <a href="#host" class="teacher">🎓 For teachers</a>
    </div>`;
  const mark = () => $app.querySelectorAll('.avb').forEach(b => b.classList.toggle('on', b.dataset.a === avatar));
  mark();
  $app.querySelector('.avatars').onclick = e => { const b = e.target.closest('.avb'); if (b) { avatar = b.dataset.a; mark(); sfx('click'); } };
  const err = t => { $('#err').textContent = t; $('#join').disabled = false; sfx('wrong'); };
  $('#name').onkeydown = $('#pin').onkeydown = e => { if (e.key === 'Enter') $('#join').click(); };
  $('#join').onclick = async () => {
    const pin = $('#pin').value.replace(/\D/g, '');
    const name = $('#name').value.trim().replace(/\s+/g, ' ');
    if (pin.length !== 6) return err('The PIN has 6 numbers');
    if (!name) return err('Type your name');
    $('#join').disabled = true;
    try {
      const g = await api.get(`games/${pin}`);
      if (!g || !g.host) return err('No game with PIN ' + fmtPin(pin));
      if (g.status === 'ended') return err('This game is over');
      if (playersOf(g).some(p => p.id !== api.uid && p.name.toLowerCase() === name.toLowerCase())) return err('Someone has this name. Try another name!');
      const P = `games/${pin}/players/${api.uid}`;
      if (g.players?.[api.uid]?.name) await api.update(P, { name, avatar });
      else await api.set(P, { name, avatar, score: 0, right: 0, wrong: 0, joinedAt: api.now(), online: true });
      LS.set('me', { name, avatar });
      sfx('pop');
      playerGame(pin);
    } catch (e) { console.error(e); err('Connection problem: ' + e.message); }
  };
}

function playerGame(pin) {
  stopAll();
  SS.set('playerPin', pin);
  const me = api.uid, G = `games/${pin}`, MY = `${G}/players/${me}`;
  unsubs.push(api.presence(`${MY}/online`));
  let game = null, view = null, seenEv = null, order = [], qi = 0, phase = null, deck = null, preloaded = null;
  const seenChips = new Set();
  // tải trước toàn bộ tranh ngay khi vào phòng để lúc chơi hiện tức thì
  const preload = id => {
    if (preloaded === id) return;
    preloaded = id;
    loadDeck(id).then(d => { deck = d; d.words.forEach(w => { const im = new Image(); im.src = w.img; }); }).catch(() => {});
  };

  const leave = msg => { stopAll(); joinView(pin, msg); };
  const myInfo = () => playersOf(game).find(p => p.id === me) || { name: '', avatar: '🙂', score: 0, right: 0, wrong: 0 };
  const who = p => `${p.avatar} ${p.name}`;

  controls(false);
  listen(G, g => {
    if (!g) return leave('The game is closed 👋');
    if (!g.players?.[me]?.name) return leave('You left the game');
    game = g;
    if (g.deck) preload(g.deck);
    checkEvents();
    const st = status();
    if (view !== st) { const from = view; view = st; build(from); }
    update();
  });
  every(250, () => {
    if (!game) return;
    const st = status();
    if (st !== view) { const from = view; view = st; build(from); update(); }
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
      if (e.target === me) { toast(esc(e.text), 4000); sfx('robbed'); }
    });
  }

  function build(from) {
    const m = myInfo();
    controls(false);
    if (view === 'lobby') {
      phase = null; order = []; qi = 0;
      $app.innerHTML = `
        <div class="card center">
          <div class="bigav">${m.avatar}</div>
          <h2>Hi ${esc(m.name)}! 👋</h2>
          <div class="sub">You are in game <b>${fmtPin(pin)}</b>. Wait for your teacher…</div>
          <div class="dots"><span></span><span></span><span></span></div>
          <div id="lobby" class="lobby"></div>
          <button id="quit" class="ghost small">Leave</button>
        </div>`;
      $('#quit').onclick = async () => { await api.remove(MY); };
    } else if (view === 'playing') {
      if (from === 'lobby') sfx('start');
      $app.innerHTML = `
        <div class="pbar"><span class="pme">${m.avatar} ${esc(m.name)}</span><span id="prank" class="prank"></span><span id="pscore" class="pscore"></span><span id="ptimer" class="ptimer"></span></div>
        <div id="stage" class="stage"></div>
        <div class="mini"><div id="board" class="board"></div></div>`;
      controls(false, $('.pbar'));
      nextQuestion();
    } else if (view === 'timeup') {
      if (from === 'playing') sfx('timeup');
      $app.innerHTML = `
        <div class="card center">
          <div class="bigav">⏰</div><h2>Time’s up!</h2>
          <div class="sub">Wait for the results…</div>
          <div id="board" class="board"></div>
        </div>`;
    } else if (view === 'ended') {
      const list = playersOf(game), rank = list.findIndex(p => p.id === me);
      if (from) sfx(rank < 3 ? 'win' : 'coins');
      $app.innerHTML = `
        <div class="card center">
          <div class="bigmedal">${rank < 3 ? medal(rank) : '🎉'}</div>
          <h2>You are #${rank + 1} of ${list.length}</h2>
          <div class="sub">💰 <b>${m.score}</b> points · ✅ ${m.right} right · ❌ ${m.wrong} wrong</div>
          ${podiumHtml(list)}
          <div class="sub">Wait for the next game, or</div>
          <button id="quit" class="ghost small">Leave</button>
        </div>`;
      $('#quit').onclick = () => leave('');
    }
  }

  function update() {
    const list = playersOf(game);
    if (view === 'lobby') {
      $('#lobby').innerHTML = list.map(p => `<div class="pchip ${p.id === me ? 'me' : ''} ${seenChips.has(p.id) ? '' : 'new'}"><span>${p.avatar}</span>${esc(p.name)}</div>`).join('');
      if (seenChips.size && list.some(p => !seenChips.has(p.id))) sfx('pop');
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
    const stage = $('#stage');
    if (!stage) return;
    if (game.deck && !deck) {
      stage.innerHTML = '<div class="msg">Loading pictures… 🖼️</div>';
      loadDeck(game.deck).then(d => { deck = d; nextQuestion(); }).catch(e => { stage.innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; });
      return;
    }
    const pool = game.deck ? deck.words.filter(w => (game.cats || []).includes(w.c)) : (game.questions || []);
    if (!pool.length) { stage.innerHTML = '<div class="msg">No questions yet</div>'; return; }
    if (qi >= order.length) {
      const last = order[order.length - 1];
      order = shuffle(pool.map((_, i) => i));
      if (order.length > 1 && order[0] === last) [order[0], order[1]] = [order[1], order[0]];
      qi = 0;
    }
    const item = pool[order[qi++]];
    const types = game.types?.length ? game.types : ['pic'];
    const Q = game.deck ? deckQuestion(deck, item, types[Math.floor(Math.random() * types.length)], pool) : textQuestion(item);
    const opts = Q.opts;
    phase = 'q';
    stage.innerHTML = `
      <div class="qcard">${Q.prompt}</div>
      <div class="answers ${Q.pics ? 'pics' : ''}">${opts.map((o, i) => `<button class="ans ${Q.pics ? 'pic' : ''}" data-i="${i}" style="--c:${COLORS[i]}">${Q.pics ? '' : `<span class="shape">${SHAPES[i]}</span>`}<span>${o.html}</span></button>`).join('')}</div>
      <div id="after"></div>`;
    stage.querySelectorAll('.ans').forEach(b => b.onclick = () => answer(+b.dataset.i));

    function answer(i) {
      if (phase !== 'q') return;
      phase = 'answered';
      const ok = opts[i].ok;
      stage.querySelectorAll('.ans').forEach((b, k) => b.classList.add(opts[k].ok ? 'right' : k === i ? 'wrong' : 'dim'));
      bumpStat(ok ? 'right' : 'wrong');
      sfx(ok ? 'correct' : 'wrong');
      if (ok) setTimeout(() => { if (phase === 'answered' && $('#stage') === stage) showChests(); }, 650);
      else {
        const after = $('#after');
        after.innerHTML = `<div class="msg bad">❌ Oops! The answer is: ${Q.answer}</div>`;
        nextButton(after, 1500);
      }
    }
  }

  function nextButton(box, delay = 0) {
    const b = document.createElement('button');
    b.className = 'big next'; b.textContent = 'Next ›'; b.disabled = delay > 0;
    b.onclick = () => nextQuestion();
    box.appendChild(b);
    if (delay) setTimeout(() => { b.disabled = false; }, delay);
  }

  function showChests() {
    phase = 'chest';
    const prizes = [rollPrize(), rollPrize(), rollPrize()];
    const stage = $('#stage');
    stage.innerHTML = `
      <div class="msg good">✅ Correct! Pick a box 👇</div>
      <div class="chests">${[0, 1, 2].map(i => `<button class="chest" data-i="${i}">🎁</button>`).join('')}</div>
      <div id="after"></div>`;
    sfx('chests');
    stage.querySelectorAll('.chest').forEach(b => b.onclick = () => {
      if (phase !== 'chest') return;
      phase = 'opened';
      sfx('open');
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
    if ((p.type === 'steal' || p.type === 'swap') && !others.length) p = { type: 'add', n: 20, label: '+20' };
    const m = myInfo();
    let line = '';
    const play = s => setTimeout(() => sfx(s), 250);
    if (p.type === 'add') {
      play(p.n >= 100 ? 'jackpot' : p.n >= 50 ? 'coins' : 'coin');
      await changeScore(s => s + p.n);
      line = `${p.icon} +${p.n} points!`;
      if (p.n >= 50) feed(`${who(m)} got ${p.n === 100 ? '💎' : '💰'} +${p.n}`, null, 'big');
    } else if (p.type === 'mul') {
      play('magic');
      const d = await changeScore(s => s * p.n);
      line = `${p.icon} ×${p.n}! +${d} points!`;
      if (d) feed(`${who(m)} ${p.icon} ×${p.n} (+${d})`, null, 'mul');
    } else if (p.type === 'lose') {
      play('lose');
      const d = await changeScore(s => s * 0.9);
      line = d ? `💸 Oh no! You lost ${-d} points` : '💸 Oh no! …but you have no points to lose 😅';
      if (d) feed(`${who(m)} 💸 lost ${-d} points`, null, 'lose');
    } else if (p.type === 'none') {
      play('empty');
      line = '🕸️ Empty! Nothing here…';
    } else {
      play(p.type === 'steal' ? 'steal' : 'swap');
      return chooseTarget(p, after);
    }
    after.innerHTML = `<div class="msg">${line}</div>`;
    nextButton(after);
  }

  function chooseTarget(p, after) {
    phase = 'target';
    const others = playersOf(game).filter(x => x.id !== me);
    after.innerHTML = `
      <div class="msg">${p.type === 'steal' ? '🦝 Steal points! Who?' : '🔄 Swap points! With who?'}</div>
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
      const m = myInfo(), t = playersOf(game).find(x => x.id === tid) || { avatar: '', name: 'your friend' };
      let line;
      if (!ok) line = 'That player left 😅';
      else if (p.type === 'steal') {
        line = amt ? `🦝 You took ${amt} points from ${esc(t.name)}!` : `🦝 ${esc(t.name)} has no points yet 😆`;
        if (amt) { sfx('coins'); feed(`${who(m)} 🦝 took ${amt} points from ${who(t)}`, tid, 'steal'); }
      } else {
        line = `🔄 Swapped with ${esc(t.name)}: ${mine} ⇄ ${theirs}`;
        sfx(theirs > mine ? 'coins' : 'empty');
        feed(`${who(m)} 🔄 swapped with ${who(t)} (${mine} ⇄ ${theirs})`, tid, 'swap');
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
  function feed(text, target, kind) {
    const e = { t: api.now(), by: me, text };
    if (target) e.target = target;
    if (kind) e.kind = kind;
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
    $app.innerHTML = `<div class="card center"><h2>😵 Can’t connect</h2><div class="sub">${
      code.includes('operation-not-allowed') || code.includes('admin-restricted')
        ? 'Firebase <b>Anonymous</b> sign-in is off (see HUONG-DAN.md, step 3).'
        : esc(e.message)}</div><button class="big" onclick="location.reload()">Try again</button></div>`;
    return;
  }
  if (api.local) {
    const b = document.createElement('div');
    b.className = 'demo-banner';
    b.textContent = '🧪 Demo mode — only works with tabs on this computer';
    document.body.prepend(b);
  }
  window.addEventListener('hashchange', route);
  route();
})();
