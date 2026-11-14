// Lớp dữ liệu dùng chung: Firebase Realtime Database (chơi thật) hoặc localStorage (chế độ thử, các tab cùng máy).
import { FIREBASE_CONFIG } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

export async function connect() {
  const demo = new URLSearchParams(location.search).has('demo');
  if (!demo && FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey) return firebaseBackend(FIREBASE_CONFIG);
  return localBackend();
}

async function firebaseBackend(cfg) {
  const [appM, authM, dbM] = await Promise.all([
    import(FB + 'firebase-app.js'),
    import(FB + 'firebase-auth.js'),
    import(FB + 'firebase-database.js'),
  ]);
  const app = appM.initializeApp(cfg);
  // Mỗi tab là một người chơi riêng; tải lại trang vẫn giữ nguyên người chơi.
  const auth = authM.initializeAuth(app, { persistence: authM.browserSessionPersistence });
  const cred = await authM.signInAnonymously(auth);
  const db = dbM.getDatabase(app);
  const R = p => dbM.ref(db, p);
  let offset = 0;
  dbM.onValue(R('.info/serverTimeOffset'), s => { offset = s.val() || 0; });
  return {
    local: false,
    uid: cred.user.uid,
    now: () => Date.now() + offset,
    get: async p => (await dbM.get(R(p))).val(),
    set: (p, v) => dbM.set(R(p), v),
    update: (p, v) => dbM.update(R(p), v),
    remove: p => dbM.remove(R(p)),
    push: (p, v) => dbM.push(R(p), v),
    listen: (p, cb) => dbM.onValue(R(p), s => cb(s.val())),
    transaction: (p, fn) => dbM.runTransaction(R(p), fn).then(r => ({ committed: r.committed, value: r.snapshot.val() })),
    presence(p) {
      const r = R(p);
      const un = dbM.onValue(R('.info/connected'), s => {
        if (s.val() === true) dbM.onDisconnect(r).set(false).then(() => dbM.set(r, true)).catch(() => {});
      });
      return () => { un(); dbM.onDisconnect(r).cancel().catch(() => {}); };
    },
  };
}

function localBackend() {
  const KEY = 'classgame.local';
  let uid = sessionStorage.getItem('classgame.localUid');
  if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('classgame.localUid', uid); }
  const clone = v => (v == null ? null : JSON.parse(JSON.stringify(v)));
  const keys = p => p.split('/').filter(Boolean);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const getAt = (t, p) => keys(p).reduce((o, k) => (o == null || typeof o !== 'object' ? null : (o[k] ?? null)), t);
  const setAt = (t, p, v) => {
    const ks = keys(p); let o = t;
    for (let i = 0; i < ks.length - 1; i++) {
      if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {};
      o = o[ks[i]];
    }
    const last = ks[ks.length - 1];
    if (v == null) delete o[last]; else o[last] = clone(v);
  };
  const listeners = new Set();
  const fire = () => {
    const t = read();
    listeners.forEach(l => {
      const v = getAt(t, l.path); const s = JSON.stringify(v);
      if (s !== l.last) { l.last = s; l.cb(clone(v)); }
    });
  };
  const write = t => { localStorage.setItem(KEY, JSON.stringify(t)); setTimeout(fire, 0); };
  window.addEventListener('storage', e => { if (e.key === KEY) fire(); });
  const api = {
    local: true,
    uid,
    now: () => Date.now(),
    get: async p => clone(getAt(read(), p)),
    set: async (p, v) => { const t = read(); setAt(t, p, v); write(t); },
    update: async (p, obj) => { const t = read(); Object.entries(obj).forEach(([k, v]) => setAt(t, p + '/' + k, v)); write(t); },
    remove: async p => { const t = read(); setAt(t, p, null); write(t); },
    push: async (p, v) => { const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await api.set(p + '/' + k, v); return k; },
    listen(p, cb) {
      const l = { path: p, cb, last: undefined };
      listeners.add(l);
      setTimeout(() => { if (listeners.has(l)) { const v = getAt(read(), p); l.last = JSON.stringify(v); cb(clone(v)); } }, 0);
      return () => listeners.delete(l);
    },
    async transaction(p, fn) {
      const t = read(); const nv = fn(clone(getAt(t, p)));
      if (nv === undefined) return { committed: false, value: getAt(t, p) };
      setAt(t, p, nv); write(t); return { committed: true, value: nv };
    },
    presence(p) {
      api.set(p, true);
      const off = () => { const t = read(); if (getAt(t, p.split('/').slice(0, -1).join('/'))) { setAt(t, p, false); localStorage.setItem(KEY, JSON.stringify(t)); } };
      window.addEventListener('pagehide', off);
      return () => window.removeEventListener('pagehide', off);
    },
  };
  return api;
}
