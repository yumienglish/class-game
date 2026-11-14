// Âm thanh tự tạo bằng Web Audio (không cần file). Hiệu ứng + nhạc nền (chỉ màn giáo viên).
let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
const ls = (k, d) => { try { const v = localStorage.getItem('classgame.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem('classgame.' + k, JSON.stringify(v)); } catch {} };
let muted = ls('muted', false), musicOn = ls('music', true);

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 1;
  const comp = ctx.createDynamicsCompressor();
  comp.connect(master); master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(comp);
  musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.22 : 0; musicBus.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
// Trình duyệt chỉ cho phát tiếng sau khi người dùng chạm/bấm lần đầu.
function unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); }
['pointerdown', 'touchstart', 'keydown'].forEach(e => addEventListener(e, unlock, { capture: true, passive: true }));

const N = m => 440 * 2 ** ((m - 69) / 12);
function tone(f, t, d, { type = 'square', vol = 0.3, slide = 0, attack = 0.005, bus = sfxBus, vib = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
  if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 6; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + d + 0.05); }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(bus); o.start(t); o.stop(t + d + 0.05);
}
function noise(t, d, { vol = 0.3, f = 2000, type = 'bandpass', to = 0, q = 1, bus = sfxBus } = {}) {
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl).connect(g).connect(bus); s.start(t); s.stop(t + d + 0.05);
}
const seq = (t, notes, step, opt) => notes.forEach((m, i) => m && tone(N(m), t + i * step, (opt?.len || step * 1.6), opt));

const FX = {
  click: t => tone(1100, t, 0.05, { type: 'sine', vol: 0.12, slide: 700 }),
  pop: t => { tone(380, t, 0.14, { type: 'sine', vol: 0.35, slide: 1000 }); tone(N(84), t + 0.08, 0.12, { type: 'triangle', vol: 0.15 }); },
  start: t => { [0, 0.35, 0.7].forEach(x => tone(N(72), t + x, 0.18, { type: 'square', vol: 0.18 })); seq(t + 1.05, [84, 88, 91, 96], 0.07, { type: 'square', vol: 0.2, len: 0.35 }); },
  correct: t => seq(t, [79, 84, 88, 91], 0.06, { type: 'square', vol: 0.16, len: 0.18 }),
  wrong: t => { tone(196, t, 0.16, { type: 'sawtooth', vol: 0.16 }); tone(147, t + 0.17, 0.32, { type: 'sawtooth', vol: 0.16, vib: 6 }); },
  chests: t => seq(t, [72, 76, 79], 0.05, { type: 'triangle', vol: 0.2, len: 0.12 }),
  open: t => { noise(t, 0.25, { f: 500, to: 3000, vol: 0.25, q: 2 }); tone(N(88), t + 0.18, 0.25, { type: 'sine', vol: 0.15 }); },
  coin: t => { tone(N(83), t, 0.08, { type: 'square', vol: 0.18 }); tone(N(88), t + 0.08, 0.35, { type: 'square', vol: 0.18 }); },
  coins: t => { for (let i = 0; i < 4; i++) { tone(N(83 + i * 2), t + i * 0.09, 0.07, { type: 'square', vol: 0.15 }); tone(N(88 + i * 2), t + i * 0.09 + 0.05, 0.2, { type: 'square', vol: 0.15 }); } },
  jackpot: t => { seq(t, [72, 76, 79, 84, 88, 91, 96], 0.06, { type: 'square', vol: 0.15, len: 0.2 }); [84, 88, 91].forEach(m => tone(N(m), t + 0.5, 0.8, { type: 'triangle', vol: 0.15, vib: 4 })); for (let i = 0; i < 8; i++) tone(N(96 + (i % 3) * 4), t + 0.5 + i * 0.07, 0.08, { type: 'sine', vol: 0.08 }); },
  magic: t => { seq(t, [72, 76, 79, 83, 86, 91, 95, 98], 0.045, { type: 'sine', vol: 0.2, len: 0.25 }); noise(t, 0.6, { type: 'highpass', f: 6000, vol: 0.06 }); },
  steal: t => { seq(t, [64, 0, 63, 0, 62, 0, 61], 0.08, { type: 'triangle', vol: 0.25, len: 0.06 }); tone(N(67), t + 0.6, 0.25, { type: 'square', vol: 0.15, slide: N(79) }); },
  swap: t => { noise(t, 0.3, { f: 300, to: 4000, vol: 0.3, q: 3 }); noise(t + 0.3, 0.3, { f: 4000, to: 300, vol: 0.3, q: 3 }); tone(N(79), t + 0.6, 0.15, { type: 'square', vol: 0.12 }); tone(N(84), t + 0.7, 0.2, { type: 'square', vol: 0.12 }); },
  lose: t => { [67, 66, 65].forEach((m, i) => tone(N(m), t + i * 0.32, 0.3, { type: 'sawtooth', vol: 0.12 })); tone(N(64), t + 0.96, 0.8, { type: 'sawtooth', vol: 0.12, vib: 8, slide: N(62) }); },
  empty: t => { tone(160, t, 0.22, { type: 'sine', vol: 0.45, slide: 60 }); tone(420, t + 0.15, 0.4, { type: 'triangle', vol: 0.12, slide: 280, vib: 20 }); },
  robbed: t => { for (let i = 0; i < 3; i++) { tone(N(81), t + i * 0.26, 0.12, { type: 'square', vol: 0.15 }); tone(N(76), t + i * 0.26 + 0.13, 0.12, { type: 'square', vol: 0.15 }); } },
  tick: t => tone(1250, t, 0.04, { type: 'square', vol: 0.07 }),
  timeup: t => { seq(t, [84, 79, 76, 72], 0.12, { type: 'square', vol: 0.17, len: 0.18 }); tone(N(60), t + 0.5, 0.7, { type: 'triangle', vol: 0.3 }); },
  win: t => {
    for (let i = 0; i < 22; i++) noise(t + i * 0.055, 0.05, { f: 1200, vol: 0.05 + i * 0.012, q: 0.7 });
    const s = t + 1.3;
    seq(s, [67, 72, 76, 79, 0, 76, 79], 0.13, { type: 'square', vol: 0.17, len: 0.2 });
    [72, 76, 79, 84].forEach(m => tone(N(m), s + 0.95, 1.1, { type: 'triangle', vol: 0.14, vib: 3 }));
    noise(s + 0.95, 0.8, { type: 'highpass', f: 5000, vol: 0.12 });
  },
};
export function sfx(name) {
  if (muted || !FX[name] || !ensure() || ctx.state !== 'running') return;
  try { FX[name](ctx.currentTime + 0.01); } catch {}
}

// ---------- Nhạc nền (8 nốt mỗi ô nhịp, lặp 8 ô) ----------
const SONGS = {
  lobby: { bpm: 100, lead: 'triangle', drums: false,
    chords: [[65, 69, 72], [62, 65, 69], [58, 62, 65], [60, 64, 67], [65, 69, 72], [62, 65, 69], [58, 62, 65], [60, 64, 67]],
    mel: [77, 0, 0, 72, 0, 74, 77, 0, 81, 0, 77, 0, 74, 0, 0, 0, 74, 0, 0, 70, 0, 74, 77, 0, 79, 0, 76, 0, 72, 0, 0, 0,
      77, 0, 81, 0, 84, 0, 81, 77, 81, 0, 0, 77, 74, 0, 0, 0, 74, 0, 77, 0, 82, 0, 81, 79, 79, 0, 0, 0, 76, 0, 72, 0] },
  game: { bpm: 144, lead: 'square', drums: true,
    chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62], [57, 60, 64], [55, 59, 62]],
    mel: [72, 0, 76, 79, 76, 0, 72, 74, 74, 0, 79, 0, 83, 81, 79, 0, 76, 0, 72, 76, 81, 0, 79, 76, 77, 76, 74, 72, 74, 0, 0, 0,
      79, 0, 79, 81, 79, 76, 72, 0, 74, 76, 79, 0, 79, 0, 83, 0, 84, 0, 83, 81, 79, 0, 76, 0, 77, 0, 79, 0, 83, 0, 84, 0] },
};
let song = null, step = 0, nextT = 0, timer = null, speed = 1;
function playStep(i, t, len) {
  const bar = Math.floor(i / 8) % 8, s = i % 8, ch = song.chords[bar], o = { bus: musicBus };
  if (song.drums) {
    if (s % 4 === 0) tone(150, t, 0.16, { ...o, type: 'sine', vol: 0.7, slide: 45 });
    if (s % 4 === 2) noise(t, 0.1, { ...o, f: 1800, vol: 0.25 });
    noise(t, 0.03, { ...o, type: 'highpass', f: 7000, vol: s % 2 ? 0.05 : 0.09 });
  } else if (s === 0) noise(t, 0.04, { ...o, type: 'highpass', f: 6000, vol: 0.05 });
  if (s % 2 === 0) tone(N(ch[0] - 24 + (s === 6 && song.drums ? 7 : 0)), t, len * 0.9, { ...o, type: 'triangle', vol: 0.5 });
  if (s % 2 === 1) ch.forEach(m => tone(N(m), t, len * 0.6, { ...o, type: song.drums ? 'square' : 'triangle', vol: song.drums ? 0.045 : 0.08 }));
  const m = song.mel[bar * 8 + s];
  if (m) tone(N(m), t, len * (song.drums ? 0.85 : 1.6), { ...o, type: song.lead, vol: song.drums ? 0.13 : 0.22 });
}
function schedule() {
  if (!song || !ctx || ctx.state !== 'running') return;
  const len = 60 / (song.bpm * speed) / 2;
  if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05; // tab bị ẩn → bỏ qua, không phát dồn
  while (nextT < ctx.currentTime + 0.15) { playStep(step++, nextT, len); nextT += len; }
}
export function music(name) {
  if ((song && song.name === name) || (!song && !name)) return;
  clearInterval(timer); timer = null; song = null;
  if (!name || !SONGS[name]) return;
  song = { ...SONGS[name], name }; step = 0; speed = 1; nextT = 0;
  ensure(); timer = setInterval(schedule, 30);
}
export function musicSpeed(x) { speed = x; }

// ---------- Nút bật/tắt ----------
export function controls(withMusic, parent = document.body) {
  let box = document.getElementById('sndctl');
  if (!box) { box = document.createElement('div'); box.id = 'sndctl'; }
  if (box.parentNode !== parent) parent.appendChild(box);
  box.classList.toggle('inline', parent !== document.body);
  const draw = () => {
    box.innerHTML = (withMusic ? `<button data-k="music" title="Music" class="${musicOn && !muted ? '' : 'off'}">🎵</button>` : '') +
      `<button data-k="mute" title="Sound">${muted ? '🔇' : '🔊'}</button>`;
  };
  box.onclick = e => {
    const k = e.target.closest('button')?.dataset.k; if (!k) return;
    ensure();
    if (k === 'mute') { muted = !muted; lsSet('muted', muted); if (master) master.gain.value = muted ? 0 : 1; }
    else { musicOn = !musicOn; lsSet('music', musicOn); if (musicBus) musicBus.gain.value = musicOn ? 0.22 : 0; if (musicOn && muted) { muted = false; lsSet('muted', false); master.gain.value = 1; } }
    draw(); if (!muted) sfx('click');
  };
  draw();
}
