(() => {
'use strict';

/* ---------- Tunables ---------- */
const MASTER_STREAK = 3;      // correct answers in a row (from Learning) needed to reach Mastered
const SIZES = [10, 20, 50];   // session length choices
const LEARNING_SHARE = 0.5;   // up to this share of a session is drawn from Learning
const MASTERED_SHARE = 0.1;   // reserved share of a session for re-checking Mastered cards
const STORE_KEY = 'ccna-drill:v1';
const QCACHE_KEY = 'ccna-drill:questions';

const DOMAINS = [
  ['network-fundamentals', 'Fundamentals'],
  ['network-access', 'Network Access'],
  ['ip-connectivity', 'IP Connectivity'],
  ['ip-services', 'IP Services'],
  ['security-fundamentals', 'Security'],
  ['automation-programmability', 'Automation']
];
const DOMAIN_LABEL = Object.fromEntries(DOMAINS);
const BOX_LABEL = { new: 'New', learning: 'Learning', mastered: 'Mastered' };

/* ---------- Storage (localStorage with in-memory fallback) ---------- */
const mem = {};
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v === null ? (mem[k] ?? null) : v; } catch (e) { return mem[k] ?? null; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
};

function loadState() {
  let s = null;
  try { s = JSON.parse(store.get(STORE_KEY) || 'null'); } catch (e) { s = null; }
  if (!s || typeof s !== 'object') s = {};
  if (!s.cards || typeof s.cards !== 'object') s.cards = {};
  if (!Array.isArray(s.domains)) s.domains = [];
  if (!SIZES.includes(s.size)) s.size = 10;
  return s;
}
const state = loadState();
const save = () => store.set(STORE_KEY, JSON.stringify(state));

/* ---------- Helpers ---------- */
function h(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
}
// Text with `backticks` rendered as <code>. Uses text nodes only, never innerHTML.
function rich(text) {
  const f = document.createDocumentFragment();
  String(text).split('`').forEach((part, i) => {
    if (!part) return;
    f.append(i % 2 ? h('code', {}, part) : document.createTextNode(part));
  });
  return f;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Questions ---------- */
let questions = [];
let byId = {};

function validQuestion(q) {
  return q && typeof q.id === 'string' && DOMAIN_LABEL[q.domain] && typeof q.question === 'string' &&
    Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.every((c) => typeof c === 'string') &&
    Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.choices.length;
}
function setQuestions(list) {
  const seen = new Set();
  questions = list.filter((q) => {
    const ok = validQuestion(q) && !seen.has(q.id);
    if (!ok) console.warn('Skipping invalid or duplicate question', q && q.id);
    else seen.add(q.id);
    return ok;
  });
  byId = Object.fromEntries(questions.map((q) => [q.id, q]));
}
async function loadQuestions() {
  try {
    const res = await fetch('questions.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    setQuestions(JSON.parse(text));
    store.set(QCACHE_KEY, text);
    return;
  } catch (e) {
    console.warn('questions.json fetch failed, trying local copy', e);
  }
  try {
    setQuestions(JSON.parse(store.get(QCACHE_KEY) || '[]'));
  } catch (e) {
    setQuestions([]);
  }
}

/* ---------- Leitner logic ---------- */
const boxOf = (id) => (state.cards[id] ? state.cards[id].box : 'new');

function countBoxes(pool) {
  const c = { new: 0, learning: 0, mastered: 0 };
  pool.forEach((q) => { c[boxOf(q.id)]++; });
  return c;
}
function poolFor(domains) {
  return domains.length ? questions.filter((q) => domains.includes(q.domain)) : questions;
}
function buildSession(pool, n) {
  const g = { new: [], learning: [], mastered: [] };
  pool.forEach((q) => g[boxOf(q.id)].push(q));
  Object.values(g).forEach(shuffle);
  const take = (arr, k) => arr.splice(0, Math.max(0, k));
  const size = Math.min(n, pool.length);
  const out = [];
  const reserve = g.mastered.length ? Math.min(g.mastered.length, Math.max(1, Math.round(size * MASTERED_SHARE))) : 0;
  out.push(...take(g.learning, Math.ceil(size * LEARNING_SHARE)));
  out.push(...take(g.new, size - reserve - out.length));
  out.push(...take(g.learning, size - reserve - out.length));
  out.push(...take(g.mastered, size - out.length));
  out.push(...take(g.new, size - out.length));
  out.push(...take(g.learning, size - out.length));
  return shuffle(out);
}
// Returns { from, to } box names.
function record(id, ok) {
  const c = state.cards[id] || (state.cards[id] = { box: 'new', streak: 0, right: 0, wrong: 0 });
  const from = c.box;
  if (ok) {
    c.right++;
    if (c.box === 'new') { c.box = 'mastered'; c.streak = MASTER_STREAK; }
    else if (c.box === 'learning') {
      c.streak++;
      if (c.streak >= MASTER_STREAK) c.box = 'mastered';
    }
  } else {
    c.wrong++;
    c.box = 'learning';
    c.streak = 0;
  }
  c.last = Date.now();
  save();
  return { from, to: c.box };
}

/* ---------- Views ---------- */
const app = document.getElementById('app');
let view = 'home';
let session = null;
let swStatus = 'checking';

function render() {
  const fn = { home: viewHome, quiz: viewQuiz, done: viewDone, more: viewMore }[view];
  app.replaceChildren(...fn());
}
function go(v) { view = v; render(); window.scrollTo(0, 0); }

function legend(counts) {
  const total = counts.new + counts.learning + counts.mastered || 1;
  return [
    h('div', { class: 'bar', role: 'img', 'aria-label': `${counts.new} new, ${counts.learning} learning, ${counts.mastered} mastered` },
      ['new', 'learning', 'mastered'].map((b) => h('span', { class: 'b-' + b, style: `width:${(counts[b] / total) * 100}%` }))),
    h('div', { class: 'legend' },
      ['new', 'learning', 'mastered'].map((b) =>
        h('div', {}, h('b', {}, String(counts[b])), h('small', {}, h('span', { class: 'dot b-' + b }), BOX_LABEL[b]))))
  ];
}

function viewHome() {
  const pool = poolFor(state.domains);
  const counts = countBoxes(pool);
  const allOn = state.domains.length === 0;
  const toggle = (id) => {
    const set = new Set(state.domains);
    set.has(id) ? set.delete(id) : set.add(id);
    state.domains = set.size === DOMAINS.length ? [] : [...set];
    save(); render();
  };
  const n = Math.min(state.size, pool.length);
  return [
    h('div', { class: 'top' },
      h('div', { class: 'brand' }, 'CCNA ', h('span', {}, 'Drill')),
      h('button', { class: 'link-btn', onclick: () => go('more') }, 'More')),
    h('section', { class: 'card' },
      h('div', { class: 'label' }, allOn ? 'All domains' : 'Selected domains'),
      ...legend(counts),
      h('p', { class: 'hint' }, `${pool.length} questions. Missed ones return until you get them right ${MASTER_STREAK} times in a row.`)),
    h('section', { class: 'card' },
      h('div', { class: 'label' }, 'Domains'),
      h('div', { class: 'chips' },
        h('button', { class: 'chip', 'aria-pressed': String(allOn), onclick: () => { state.domains = []; save(); render(); } }, 'All'),
        DOMAINS.map(([id, name]) =>
          h('button', { class: 'chip', 'aria-pressed': String(state.domains.includes(id)), onclick: () => toggle(id) }, name))),
      h('div', { class: 'label' }, 'Questions per session'),
      h('div', { class: 'seg' },
        SIZES.map((s) => h('button', { 'aria-pressed': String(state.size === s), onclick: () => { state.size = s; save(); render(); } }, String(s))))),
    h('button', { class: 'btn', disabled: pool.length === 0, onclick: start },
      pool.length ? `Start (${n} questions)` : 'No questions loaded')
  ];
}

function start() {
  const items = buildSession(poolFor(state.domains), state.size);
  if (!items.length) return;
  session = { items, i: 0, results: [], chosen: null, perm: null, note: '' };
  session.perm = shuffle(items[0].choices.map((_, i) => i));
  go('quiz');
}

function choose(slot) {
  const s = session;
  if (s.chosen != null) return;
  const q = s.items[s.i];
  const orig = s.perm[slot];
  const ok = orig === q.correctIndex;
  const { from, to } = record(q.id, ok);
  s.chosen = orig;
  s.results.push({ id: q.id, ok, from, to });
  if (ok) s.note = to === 'mastered' && from !== 'mastered' ? 'Moved to Mastered' : from === 'learning' ? `Learning: ${state.cards[q.id].streak} of ${MASTER_STREAK} in a row` : '';
  else s.note = from === 'learning' ? 'Streak reset, stays in Learning' : 'Moved to Learning, it will come back';
  render();
  const fb = app.querySelector('.fb');
  if (fb) fb.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
}

function next() {
  const s = session;
  if (s.i + 1 >= s.items.length) { go('done'); return; }
  s.i++;
  s.chosen = null;
  s.note = '';
  s.perm = shuffle(s.items[s.i].choices.map((_, i) => i));
  go('quiz');
}

function viewQuiz() {
  const s = session, q = s.items[s.i];
  const answered = s.chosen != null;
  const ok = answered && s.chosen === q.correctIndex;
  const box = answered ? s.results[s.results.length - 1].from : boxOf(q.id);
  const last = s.i + 1 >= s.items.length;
  return [
    h('div', { class: 'top' },
      h('button', { class: 'link-btn', onclick: () => go(s.results.length ? 'done' : 'home') }, s.results.length ? 'Finish' : 'Quit'),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(s.items.length), 'aria-valuenow': String(s.i + (answered ? 1 : 0)) },
        h('i', { style: `width:${((s.i + (answered ? 1 : 0)) / s.items.length) * 100}%` })),
      h('div', { class: 'count' }, `${s.i + 1} / ${s.items.length}`)),
    h('div', { class: 'tags' },
      h('span', { class: 'tag' }, DOMAIN_LABEL[q.domain]),
      h('span', { class: 'tag ' + box }, BOX_LABEL[box])),
    h('p', { class: 'q' }, rich(q.question)),
    h('div', { class: 'choices', role: 'group', 'aria-label': 'Answer choices' },
      s.perm.map((orig, slot) => {
        let cls = 'choice';
        if (answered) {
          if (orig === q.correctIndex) cls += ' correct';
          else if (orig === s.chosen) cls += ' wrong';
          else cls += ' dim';
        }
        return h('button', { class: cls, disabled: answered, onclick: () => choose(slot) },
          h('span', { class: 'k', 'aria-hidden': 'true' }, String(slot + 1)),
          h('span', {}, rich(q.choices[orig])));
      })),
    answered && h('div', { class: 'fb ' + (ok ? 'ok' : 'bad'), role: 'status' },
      h('strong', { class: ok ? 'ok' : 'bad' }, ok ? 'Correct' : 'Not quite'),
      q.explanation && h('p', {}, rich(q.explanation)),
      s.note && h('p', { class: 'note' }, s.note)),
    h('div', { class: 'dock' },
      answered && h('button', { class: 'btn', id: 'next', onclick: next }, last ? 'See results' : 'Next'))
  ];
}

function viewDone() {
  const r = session.results;
  const right = r.filter((x) => x.ok).length;
  const pct = r.length ? Math.round((right / r.length) * 100) : 0;
  const missed = r.filter((x) => !x.ok).map((x) => byId[x.id]).filter(Boolean);
  const promoted = r.filter((x) => x.to === 'mastered' && x.from !== 'mastered').length;
  const counts = countBoxes(poolFor(state.domains));
  return [
    h('div', { class: 'top' }, h('div', { class: 'brand' }, 'Results'), h('span')),
    h('section', { class: 'card' },
      h('div', { class: 'score' }, `${right}/${r.length}`),
      h('p', { class: 'hint' }, `${pct}% correct. ${promoted} moved to Mastered, ${missed.length} sent to Learning.`),
      ...legend(counts)),
    missed.length > 0 && h('section', { class: 'card' },
      h('div', { class: 'label' }, 'Review misses'),
      missed.map((q) => h('div', { class: 'missed' },
        h('p', { class: 'q' }, rich(q.question)),
        h('p', {}, h('strong', {}, 'Answer: '), rich(q.choices[q.correctIndex])),
        q.explanation && h('p', { class: 'hint' }, rich(q.explanation))))),
    h('button', { class: 'btn', onclick: start }, 'Another session'),
    h('button', { class: 'btn secondary', onclick: () => go('home') }, 'Home')
  ];
}

let resetArmed = false;
let moreMsg = '';
function viewMore() {
  const ta = h('textarea', { 'aria-label': 'Progress backup', readonly: true, spellcheck: 'false' });
  ta.value = JSON.stringify({ app: 'ccna-drill', version: 1, cards: state.cards });
  const imp = h('textarea', { 'aria-label': 'Paste backup to import', placeholder: 'Paste a backup here', spellcheck: 'false' });
  const msg = h('p', { class: 'msg', role: 'status' }, moreMsg);
  const say = (t) => { moreMsg = t; msg.textContent = t; };
  const perDomain = DOMAINS.map(([id, name]) => {
    const c = countBoxes(poolFor([id]));
    const total = c.new + c.learning + c.mastered;
    return h('div', { class: 'row' }, h('span', {}, name), h('small', {}, `${c.mastered}/${total} mastered, ${c.learning} learning`));
  });
  const swText = { checking: 'Checking...', ready: 'Ready. The quiz works offline.', none: 'Not available in this browser.', error: 'Setup failed. Reload while online.' }[swStatus];
  return [
    h('div', { class: 'top' }, h('button', { class: 'link-btn', onclick: () => go('home') }, 'Back'), h('div', { class: 'brand' }, 'More'), h('span')),
    h('section', { class: 'card' }, h('div', { class: 'label' }, 'Progress by domain'), h('div', { class: 'rows' }, perDomain)),
    h('section', { class: 'card' },
      h('div', { class: 'label' }, 'Offline'),
      h('p', {}, swText),
      h('p', { class: 'hint' }, 'To install: Safari share menu, Add to Home Screen. Chrome menu, Install app. Open it once online so it can cache everything. New questions download automatically the next time you open it online.')),
    h('section', { class: 'card' },
      h('div', { class: 'label' }, 'Backup progress'),
      h('p', { class: 'hint' }, 'Progress lives only in this browser. Copy the backup to move it to another device or keep a copy.'),
      ta,
      h('button', { class: 'btn secondary', onclick: async () => {
        try { await navigator.clipboard.writeText(ta.value); say('Copied.'); }
        catch (e) { ta.select(); say('Select and copy the text above.'); }
      } }, 'Copy backup'),
      imp,
      h('button', { class: 'btn secondary', onclick: () => {
        try {
          const data = JSON.parse(imp.value);
          if (!data || data.app !== 'ccna-drill' || typeof data.cards !== 'object' || data.cards === null) throw new Error('bad');
          state.cards = data.cards; save();
          say('Imported.'); render();
        } catch (e) { say('That is not a valid backup.'); }
      } }, 'Import backup'),
      msg),
    h('section', { class: 'card' },
      h('div', { class: 'label' }, 'Reset'),
      h('button', { class: 'btn danger', onclick: (e) => {
        if (!resetArmed) {
          resetArmed = true; e.target.textContent = 'Tap again to erase all progress';
          setTimeout(() => { resetArmed = false; if (view === 'more') render(); }, 4000);
        } else {
          resetArmed = false; state.cards = {}; save(); say('Progress erased.'); render();
        }
      } }, 'Reset progress'))
  ];
}

/* ---------- Keyboard (desktop convenience) ---------- */
document.addEventListener('keydown', (e) => {
  if (view !== 'quiz' || e.metaKey || e.ctrlKey || e.altKey) return;
  const s = session;
  if (/^[1-9]$/.test(e.key) && s.chosen == null) {
    const slot = Number(e.key) - 1;
    if (slot < s.perm.length) choose(slot);
  } else if (e.key === 'Enter' && s.chosen != null && e.target === document.body) {
    next();
  }
});

/* ---------- Service worker ---------- */
function setupSW() {
  if (!('serviceWorker' in navigator)) { swStatus = 'none'; return; }
  navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready)
    .then(() => { swStatus = 'ready'; if (view === 'more') render(); })
    .catch(() => { swStatus = 'error'; if (view === 'more') render(); });
}

/* ---------- Boot ---------- */
loadQuestions().then(() => { render(); setupSW(); });
})();
