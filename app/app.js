'use strict';
/* 汉字 тренажёр — spaced repetition + games over the words from the notebook. */

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rand = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const DAY = 864e5;
const INTERVALS = [0, 1, 2, 4, 8, 16, 32, 64]; // days until next review, by box
const MASTERED = 4;
const ymd = d => d.toLocaleDateString('sv'); // YYYY-MM-DD
const today = () => ymd(new Date());
const yesterday = () => ymd(new Date(Date.now() - DAY));
const isHan = c => /\p{Script=Han}/u.test(c);
const noTones = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const app = $('#app');

// ---------- data ----------
const LESSONS = window.ZH_DATA.lessons;
const LATEST = Math.max(...LESSONS.map(l => l.n));
const WORDS = new Map(); // a word that reappears belongs to its newest lesson
for (const l of LESSONS) for (const w of l.words) WORDS.set(w.hz, { ...w, lesson: l.n });
const LIST = [...WORDS.values()];
const SENT = LESSONS.flatMap(l => l.sentences.map(s => ({ ...s, lesson: l.n })));
const tierOf = n => n === LATEST ? 'green' : n >= LATEST - 3 ? 'orange' : 'red';
const TIER = {
  green: { name: 'Зелёные', sub: `урок ${LATEST}` },
  orange: { name: 'Оранжевые', sub: `уроки ${LATEST - 3}–${LATEST - 1}` },
  red: { name: 'Красные', sub: `уроки 1–${LATEST - 4}` }
};
const lessonWords = l => [...new Set(l.words.map(w => w.hz))].map(h => WORDS.get(h));
const fmtDate = d => d ? new Date(d + 'T12:00').toLocaleDateString('ru', { day: 'numeric', month: 'short', year: '2-digit' }) : 'без даты';

// ---------- state ----------
const LS = 'zh-trainer-v1';
const fresh = () => ({ w: {}, xp: 0, streak: { n: 0, last: null }, daily: { date: null, n: 0 }, boss: {},
  settings: { size: 20, goal: 30, en: true }, updated: 0 });
let S = (() => {
  try { const s = JSON.parse(localStorage.getItem(LS)); if (s) { const f = fresh(); return { ...f, ...s, settings: { ...f.settings, ...s.settings } }; } } catch (e) {}
  return fresh();
})();
function localSave() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
function save() { S.updated = Date.now(); localSave(); scheduleSync(); }
const ws = hz => S.w[hz] || { b: 0, d: 0, c: 0, x: 0, t: 0 };
function grade(hz, ok) {
  const s = { ...ws(hz) }, now = Date.now();
  if (ok) { s.b = Math.min(s.b + 1, INTERVALS.length - 1); s.c++; s.d = now + INTERVALS[s.b] * DAY; }
  else { s.b = 0; s.x++; s.d = now; }
  s.t = now; S.w[hz] = s;
}
function bumpDaily() { if (S.daily.date !== today()) S.daily = { date: today(), n: 0 }; S.daily.n++; }
const dailyN = () => S.daily.date === today() ? S.daily.n : 0;
const streakN = () => (S.streak.last === today() || S.streak.last === yesterday()) ? S.streak.n : 0;
function markStreak() {
  const d = today(); if (S.streak.last === d) return;
  S.streak = { n: S.streak.last === yesterday() ? S.streak.n + 1 : 1, last: d };
}
const mastery = words => words.length ? Math.round(100 * words.reduce((a, w) => a + Math.min(ws(w.hz).b, MASTERED), 0) / (words.length * MASTERED)) : 0;

// ---------- choosing words ----------
function priority(w) {
  const s = ws(w.hz), now = Date.now();
  let p = Math.random() * 25;
  if (!s.t) p += 40;                 // never seen
  if (s.d <= now) p += 100;          // due
  if (s.t && s.b === 0) p += 60;     // just got it wrong
  p += (INTERVALS.length - s.b) * 8; // weaker box → higher
  return p;
}
const byPriority = words => words.map(w => [priority(w), w]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
function pickWords(n, tier) {
  if (tier) return shuffle(byPriority(LIST.filter(w => tierOf(w.lesson) === tier)).slice(0, n));
  const quota = { green: Math.round(n * .6), orange: Math.round(n * .25) };
  quota.red = n - quota.green - quota.orange;
  let out = [];
  for (const t of ['green', 'orange', 'red']) out.push(...byPriority(LIST.filter(w => tierOf(w.lesson) === t)).slice(0, quota[t]));
  if (out.length < n) out.push(...byPriority(LIST.filter(w => !out.includes(w))).slice(0, n - out.length));
  return shuffle(out);
}
function example(w) {
  const hits = SENT.filter(s => s.zh.includes(w.hz.replace(/…/g, '')));
  return hits.find(s => s.lesson === w.lesson) || hits[0] || null;
}
function distractors(w, key, n = 3) {
  const len = [...w.hz].length;
  const pool = shuffle(LIST.filter(x => x.hz !== w.hz && x[key] !== w[key]));
  const out = [];
  for (const x of [...pool.filter(x => [...x.hz].length === len), ...pool]) {
    if (out.length >= n) break;
    if (!out.some(o => o[key] === x[key])) out.push(x);
  }
  return out;
}
const TONES = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };
const MARK = {}; for (const [v, s] of Object.entries(TONES)) [...s].forEach((c, i) => MARK[c] = [v, i]);
const hasTones = py => [...py].some(c => MARK[c]);
function toneVariants(py) {
  const chars = [...py], idx = chars.map((c, i) => MARK[c] ? i : -1).filter(i => i >= 0);
  const set = new Set([py]);
  for (let tries = 0; idx.length && set.size < 4 && tries < 80; tries++) {
    const c = [...chars];
    const k = 1 + (idx.length > 1 && Math.random() < .5 ? 1 : 0);
    for (const p of shuffle(idx).slice(0, k)) {
      const [v, t] = MARK[c[p]]; let nt; do nt = Math.floor(Math.random() * 4); while (nt === t);
      c[p] = TONES[v][nt];
    }
    set.add(c.join(''));
  }
  const arr = [...set];
  while (arr.length < 4) { const o = rand(LIST).py; if (!arr.includes(o)) arr.push(o); }
  return shuffle(arr);
}

// ---------- speech ----------
let zhVoice = null;
function loadVoice() { const v = speechSynthesis.getVoices(); zhVoice = v.find(x => /zh[-_]CN/i.test(x.lang)) || v.find(x => /^zh/i.test(x.lang)) || null; }
if ('speechSynthesis' in window) { loadVoice(); speechSynthesis.onvoiceschanged = loadVoice; }
function speak(text) {
  if (!('speechSynthesis' in window)) return toast('Озвучка недоступна в этом браузере');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/…/g, '，'));
  u.lang = 'zh-CN'; if (zhVoice) u.voice = zhVoice; u.rate = .8;
  speechSynthesis.speak(u);
}

// ---------- UI bits ----------
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
const tag = w => `<div class="tag"><span class="dot t-${tierOf(w.lesson)}"></span>урок ${w.lesson}${ws(w.hz).t ? '' : ' · новое'}</div>`;
const enLine = w => S.settings.en && w.en ? `<div class="prompt-en">${esc(w.en)}</div>` : '';
const hzClass = hz => [...hz].length > 3 ? 'hz-big long' : 'hz-big';
function feedback(w, ok) {
  const ex = example(w);
  return `<div class="fb ${ok ? 'ok' : 'bad'}">
    <div class="fb-h">${ok ? 'Верно! +10' : 'Не совсем — запомни:'}</div>
    <div class="fb-w"><span class="hz-m">${esc(w.hz)}</span><span class="py">${esc(w.py)}</span>
      <button class="spk" data-say="${esc(w.hz)}">🔊</button></div>
    <div>${esc(w.ru)}</div>
    ${ex ? `<div class="ex"><span class="zh">${esc(ex.zh)}</span> <button class="spk" data-say="${esc(ex.zh)}">🔊</button><br><span class="py">${esc(ex.py)}</span><br>${esc(ex.ru)}</div>` : ''}
    <button class="btn primary" data-a="next">Дальше →</button></div>`;
}

// ---------- session ----------
let SES = null, timer = null;
const MIX = ['meaning', 'reverse', 'tones', 'listen', 'pen', 'flash'];
function kindFor(mode, w) {
  let k = mode === 'mix' ? rand(MIX) : mode;
  if (mode === 'mix' && !ws(w.hz).t && Math.random() < .5) k = rand(['flash', 'pen']); // meet new words first
  if (k === 'tones' && !hasTones(w.py)) k = 'meaning';
  if (k === 'trace' && !traceable(w)) k = 'pen';
  return k;
}
function start(mode, words, extra = {}) {
  if (!words.length) return toast('Нет слов для тренировки');
  clearInterval(timer);
  SES = { mode, words, i: 0, res: [], xp: 0, ...extra };
  if (mode === 'match') { SES.round = 0; return renderMatch(); }
  SES.items = words.map(w => ({ w, kind: kindFor(mode, w) }));
  renderCard();
}
function record(w, ok) {
  grade(w.hz, ok); SES.res.push({ w, ok });
  const g = ok ? 10 : 2; SES.xp += g; S.xp += g; bumpDaily(); save();
}
function answer(ok) {
  const it = SES.items[SES.i]; if (it.done) return; it.done = true; record(it.w, ok);
}
function next() { SES.i++; renderCard(); }
function header() {
  const n = SES.items.length;
  return `<div class="top"><button class="x" data-a="quit" aria-label="Выйти">✕</button>
    <div class="bar"><i style="width:${SES.i / n * 100}%"></i></div><span class="cnt">${Math.min(SES.i + 1, n)}/${n}</span></div>`;
}
function renderCard() {
  if (SES.i >= SES.items.length) return finish();
  const { w, kind } = SES.items[SES.i];
  CARDS[kind](w);
  window.scrollTo(0, 0);
}
function cardShell(inner) { app.innerHTML = header() + `<div class="card">${inner}</div>`; return $('.card'); }

function mcCard(w, prompt, options, correct, cls = '') {
  const card = cardShell(`${tag(w)}${prompt}
    <div class="opts ${cls.includes('hzo') ? 'grid2' : ''}">${options.map((o, i) =>
      `<button class="opt ${cls}" data-v="${esc(o)}"><span class="muted" style="font-size:12px;float:left">${i + 1}</span>${esc(o)}</button>`).join('')}</div>`);
  $$('.opt', card).forEach(b => b.onclick = () => {
    const ok = b.dataset.v === correct;
    $$('.opt', card).forEach(x => { x.disabled = true; if (x.dataset.v === correct) x.classList.add('right'); });
    if (!ok) b.classList.add('wrong');
    answer(ok);
    card.insertAdjacentHTML('beforeend', feedback(w, ok));
    if (ok) speak(w.hz);
  });
}
function selfCard(w, front, back, revealLabel = 'Показать ответ') {
  const card = cardShell(`${tag(w)}${front}<div id="back"></div>
    <button class="btn primary" data-a="reveal" style="margin-top:18px">${revealLabel}</button>`);
  $('[data-a=reveal]', card).onclick = e => {
    e.target.remove();
    const ex = example(w);
    $('#back').innerHTML = `<div class="reveal">${back}
      ${ex ? `<div class="ex" style="text-align:left"><span class="zh">${esc(ex.zh)}</span> <button class="spk" data-say="${esc(ex.zh)}">🔊</button><br><span class="py">${esc(ex.py)}</span><br>${esc(ex.ru)}</div>` : ''}
      <div class="row"><button class="btn no" data-g="0">✗ Не вспомнила</button><button class="btn yes" data-g="1">✓ Знаю</button></div></div>`;
    speak(w.hz);
    $$('[data-g]', card).forEach(b => b.onclick = () => { answer(b.dataset.g === '1'); next(); });
  };
}

const CARDS = {
  meaning(w) {
    mcCard(w, `<div class="${hzClass(w.hz)}">${esc(w.hz)}</div><button class="spk" data-say="${esc(w.hz)}">🔊</button>`,
      shuffle([w.ru, ...distractors(w, 'ru').map(x => x.ru)]), w.ru);
  },
  reverse(w) {
    mcCard(w, `<div class="prompt-ru">${esc(w.ru)}</div>${enLine(w)}<p class="hint">Найди иероглиф</p>`,
      shuffle([w.hz, ...distractors(w, 'hz').map(x => x.hz)]), w.hz, 'hzo');
  },
  tones(w) {
    mcCard(w, `<div class="${hzClass(w.hz)}">${esc(w.hz)}</div><div class="muted">${esc(w.ru)}</div><p class="hint">Как это читается?</p>`,
      toneVariants(w.py), w.py, 'pyo');
  },
  listen(w) {
    mcCard(w, `<p class="hint">Послушай и найди слово</p><button class="spk huge" data-say="${esc(w.hz)}">🔊</button>`,
      shuffle([w.hz, ...distractors(w, 'hz').map(x => x.hz)]), w.hz, 'hzo');
    setTimeout(() => speak(w.hz), 250);
  },
  flash(w) {
    selfCard(w, `<div class="${hzClass(w.hz)}">${esc(w.hz)}</div><p class="hint">Вспомни чтение и значение</p>`,
      `<div class="py" style="font-size:24px">${esc(w.py)}</div><div class="prompt-ru">${esc(w.ru)}</div>${enLine(w)}`);
  },
  pen(w) {
    selfCard(w, `<div style="font-size:30px">✍️</div><div class="prompt-ru">${esc(w.ru)}</div>${enLine(w)}
      <div class="tools"><button data-say="${esc(w.hz)}">🔊 Послушать</button><button data-a="pyhint">Подсказка: пиньинь</button></div>
      <p class="hint" id="pyh">Напиши иероглиф в тетради, потом проверь себя</p>`,
      `<div class="${hzClass(w.hz)}">${esc(w.hz)}</div><div class="py" style="font-size:22px">${esc(w.py)}</div>`,
      'Я написала — проверить');
    $('[data-a=pyhint]').onclick = e => { $('#pyh').innerHTML = `<span class="py" style="font-size:22px">${esc(w.py)}</span>`; e.target.remove(); };
  },
  trace(w) { traceCard(w); }
};

// ---------- trace (Hanzi Writer, loaded on demand) ----------
const HW_SRC = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.5.0/dist/hanzi-writer.min.js';
const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
function traceable(w) { const c = [...w.hz].filter(isHan); return c.length > 0 && c.length <= 3; }
async function traceCard(w) {
  const chars = [...w.hz].filter(isHan);
  const card = cardShell(`${tag(w)}<div class="prompt-ru">${esc(w.ru)}</div><div class="py" style="font-size:20px">${esc(w.py)}</div>
    <div class="tr-info" id="tri">Нарисуй пальцем, черта за чертой</div><div id="hw"></div>
    <div class="tools"><button data-a="outline">👁 Подсказка</button><button data-say="${esc(w.hz)}">🔊</button><button data-a="skip">Не знаю</button></div>`);
  const hw = $('#hw');
  try { if (!window.HanziWriter) await loadScript(HW_SRC); }
  catch (e) { toast('Нет интернета для режима «Черти» — переключаю на «Ручку»'); return CARDS.pen(w); }
  const css = getComputedStyle(document.documentElement);
  const size = Math.min(280, window.innerWidth - 80);
  hw.style.width = hw.style.height = size + 'px';
  let idx = 0, mistakes = 0, hinted = false, writer = null;
  const done = () => {
    const ok = !hinted && mistakes <= chars.length * 2;
    answer(ok);
    $('.tools', card).remove();
    card.insertAdjacentHTML('beforeend', feedback(w, ok));
    speak(w.hz);
  };
  const go = () => {
    hw.innerHTML = '';
    $('#tri').textContent = chars.length > 1 ? `Иероглиф ${idx + 1} из ${chars.length}` : 'Нарисуй пальцем, черта за чертой';
    writer = HanziWriter.create(hw, chars[idx], {
      width: size, height: size, padding: 12, showOutline: false, showCharacter: false,
      strokeColor: css.getPropertyValue('--fg').trim() || '#222', drawingColor: css.getPropertyValue('--acc').trim() || '#c0392b',
      outlineColor: css.getPropertyValue('--line').trim() || '#ddd', drawingWidth: 18, showHintAfterMisses: 3,
      onLoadCharDataError: () => { toast('Не удалось загрузить черты — переключаю на «Ручку»'); CARDS.pen(w); }
    });
    writer.quiz({
      onMistake: () => mistakes++,
      onComplete: () => { idx++; if (idx < chars.length) setTimeout(go, 450); else setTimeout(done, 300); }
    });
  };
  $('[data-a=outline]', card).onclick = () => { hinted = true; writer && writer.showOutline(); };
  $('[data-a=skip]', card).onclick = () => { hinted = true; writer && writer.cancelQuiz(); done(); };
  go();
}

// ---------- match (pairs on time) ----------
function renderMatch() {
  const rounds = Math.ceil(SES.words.length / 6);
  if (SES.round >= rounds) return finish();
  const words = SES.words.slice(SES.round * 6, SES.round * 6 + 6);
  const errs = new Set(); let sel = null, left = words.length; const t0 = Date.now();
  app.innerHTML = `<div class="top"><button class="x" data-a="quit">✕</button><div class="bar"><i style="width:${SES.round / rounds * 100}%"></i></div>
    <span class="cnt">раунд ${SES.round + 1}/${rounds}</span></div>
    <div class="timer" id="tm">0.0 с</div>
    <div class="match"><div class="col">${shuffle(words).map(w => `<button class="mt hzo" data-s="h" data-h="${esc(w.hz)}">${esc(w.hz)}</button>`).join('')}</div>
    <div class="col">${shuffle(words).map(w => `<button class="mt" data-s="r" data-h="${esc(w.hz)}">${esc(w.ru)}</button>`).join('')}</div></div>`;
  clearInterval(timer);
  timer = setInterval(() => { const el = $('#tm'); if (el) el.textContent = ((Date.now() - t0) / 1000).toFixed(1) + ' с'; }, 100);
  $$('.mt').forEach(b => b.onclick = () => {
    if (b.classList.contains('done')) return;
    if (!sel || sel.dataset.s === b.dataset.s) { $$('.mt.sel').forEach(x => x.classList.remove('sel')); sel = b; b.classList.add('sel'); if (b.dataset.s === 'h') speak(b.dataset.h); return; }
    const a = sel; sel = null; a.classList.remove('sel');
    if (a.dataset.h === b.dataset.h) {
      a.classList.add('done'); b.classList.add('done');
      const w = WORDS.get(b.dataset.h); record(w, !errs.has(w.hz));
      if (--left === 0) {
        clearInterval(timer);
        const secs = (Date.now() - t0) / 1000, bonus = secs < 20 ? 15 : secs < 35 ? 8 : 0;
        if (bonus) { S.xp += bonus; SES.xp += bonus; save(); }
        toast(`${secs.toFixed(1)} с${bonus ? ` · бонус +${bonus} XP ⚡` : ''}`);
        SES.round++; setTimeout(renderMatch, 700);
      }
    } else {
      errs.add(a.dataset.h); errs.add(b.dataset.h);
      [a, b].forEach(x => { x.classList.add('wrong'); setTimeout(() => x.classList.remove('wrong'), 400); });
    }
  });
}

// ---------- results ----------
function finish() {
  clearInterval(timer);
  const n = SES.res.length, ok = SES.res.filter(r => r.ok).length;
  if (n) markStreak();
  let boss = '';
  if (SES.boss && n) {
    const pct = ok / n;
    if (pct >= .9) { S.boss[SES.boss] = today(); boss = `<p style="font-size:20px">👑 Урок ${SES.boss} пройден!</p>`; }
    else boss = `<p class="muted">Для короны нужно 90% — у тебя ${Math.round(pct * 100)}%. Ещё разок?</p>`;
  }
  save();
  const wrong = [...new Map(SES.res.filter(r => !r.ok).map(r => [r.w.hz, r.w])).values()];
  const last = { mode: SES.mode, boss: SES.boss, tier: SES.tier };
  app.innerHTML = `<div class="card result">
    <div style="font-size:44px">${n && ok / n >= .9 ? '🎉' : ok / Math.max(n, 1) >= .6 ? '💪' : '📚'}</div>
    <div class="big-score">${ok}/${n}</div><div class="muted">+${SES.xp} XP · 🔥 ${streakN()} ${plural(streakN(), 'день', 'дня', 'дней')} подряд</div>${boss}
    ${wrong.length ? `<h2 style="text-align:left">Повтори эти слова</h2><div class="wl">${wrong.map(w =>
      `<div data-say="${esc(w.hz)}"><span class="hz">${esc(w.hz)}</span><span class="py">${esc(w.py)}</span><span>${esc(w.ru)}</span></div>`).join('')}</div>` : ''}
    <div class="stack">
      ${wrong.length ? `<button class="btn primary" data-a="redo">Ещё раз ошибки (${wrong.length})</button>` : ''}
      <button class="btn ${wrong.length ? '' : 'primary'}" data-a="again">Ещё раунд</button>
      <button class="btn ghost" data-a="home">Домой</button></div></div>`;
  $('[data-a=redo]') && ($('[data-a=redo]').onclick = () => start(SES.mode === 'match' ? 'mix' : SES.mode, shuffle(wrong)));
  $('[data-a=again]').onclick = () => {
    if (last.boss) return startBoss(last.boss);
    start(last.mode, pickWords(last.mode === 'match' ? 12 : S.settings.size, last.tier), { tier: last.tier });
  };
}
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };

// ---------- home ----------
const MODES = [
  ['pen', '✍️', 'Ручка', 'пиши в тетради'], ['flash', '🃏', 'Карточки', 'вспомни сам'],
  ['meaning', '🎯', 'Значение', 'выбери перевод'], ['reverse', '🔄', 'Обратно', 'найди иероглиф'],
  ['tones', '🎵', 'Тоны', 'выбери пиньинь'], ['listen', '👂', 'На слух', 'услышь и найди'],
  ['trace', '🖌️', 'Черти', 'пиши пальцем'], ['match', '⚡', 'Пары', 'на скорость']
];
function startBoss(n) {
  const words = byPriority(lessonWords(LESSONS.find(l => l.n === n))).slice(0, 25);
  start('mix', shuffle(words), { boss: n });
}
function home() {
  SES = null; clearInterval(timer);
  const goal = S.settings.goal, d = dailyN();
  const tierCard = t => {
    const ws_ = LIST.filter(w => tierOf(w.lesson) === t), m = mastery(ws_);
    return `<button class="tier t-${t}" data-a="tier" data-t="${t}"><b>${TIER[t].name}</b><span>${TIER[t].sub}</span>
      <span>${ws_.length} слов</span><div class="bar"><i style="width:${m}%"></i></div><span>освоено ${m}%</span></button>`;
  };
  app.innerHTML = `
    <header class="home-h"><h1>汉字 <small>тренажёр</small></h1>
      <div><button class="icon" data-a="dict" aria-label="Словарь">📖</button><button class="icon" data-a="settings" aria-label="Настройки">⚙︎</button></div></header>
    <div class="stats">
      <div><b>🔥 ${streakN()}</b><span>${plural(streakN(), 'день', 'дня', 'дней')} подряд</span></div>
      <div><b>⭐ ${S.xp}</b><span>XP</span></div>
      <div><b>${d}/${goal}</b><span>${d >= goal ? 'цель дня выполнена ✓' : 'карточек сегодня'}</span><div class="bar"><i style="width:${Math.min(100, d / goal * 100)}%"></i></div></div>
    </div>
    <button class="btn hero" data-a="daily">▶ Тренировка дня<small>${S.settings.size} слов · больше всего из последнего урока</small></button>
    <div class="tiers">${['green', 'orange', 'red'].map(tierCard).join('')}</div>
    <h2>Режимы</h2>
    <div class="modes">${MODES.map(([k, e, n, s]) => `<button class="mode" data-a="mode" data-m="${k}"><span class="e">${e}</span><b>${n}</b><span>${s}</span></button>`).join('')}</div>
    <h2>Уроки — получи 👑 за 90%</h2>
    <div class="lessons">${[...LESSONS].reverse().map(l => {
      const t = tierOf(l.n), words = lessonWords(l);
      return `<button class="lesson t-${t}" data-a="boss" data-n="${l.n}"><span class="dot"></span>
        <span><b>Урок ${l.n}</b><span class="sub">${fmtDate(l.date)} · ${words.length} слов</span></span>
        <span class="pct">${mastery(words)}%</span><span class="crown">${S.boss[l.n] ? '👑' : ''}</span></button>`;
    }).join('')}</div>
    <p class="sync-line" id="syncline">${syncLine()}</p>`;
  $('[data-a=daily]').onclick = () => start('mix', pickWords(S.settings.size));
  $$('[data-a=tier]').forEach(b => b.onclick = () => start('mix', pickWords(S.settings.size, b.dataset.t), { tier: b.dataset.t }));
  $$('[data-a=mode]').forEach(b => b.onclick = () => { const m = b.dataset.m; start(m, pickWords(m === 'match' ? 12 : S.settings.size)); });
  $$('[data-a=boss]').forEach(b => b.onclick = () => startBoss(+b.dataset.n));
  $('[data-a=dict]').onclick = dict;
  $('[data-a=settings]').onclick = settings;
}

// ---------- dictionary ----------
function dict() {
  app.innerHTML = `<div class="top"><button class="x" data-a="home">←</button><b style="flex:1">Все слова (${LIST.length})</b></div>
    <input class="search" id="q" placeholder="Поиск: 汉字, pinyin, по-русски…" autocomplete="off"><div class="dict" id="dl"></div>`;
  const draw = () => {
    const q = noTones($('#q').value.trim());
    const hits = LIST.filter(w => !q || w.hz.includes(q) || noTones(w.py).replace(/\s/g, '').includes(q.replace(/\s/g, '')) || w.ru.toLowerCase().includes(q) || w.en.toLowerCase().includes(q))
      .sort((a, b) => b.lesson - a.lesson).slice(0, 300);
    $('#dl').innerHTML = hits.map(w => { const s = ws(w.hz);
      return `<div data-say="${esc(w.hz)}"><span class="dot t-${tierOf(w.lesson)}"></span><span class="hz">${esc(w.hz)}</span><span class="py">${esc(w.py)}</span>
        <span>${esc(w.ru)}</span><span class="lv">${s.t ? '●'.repeat(Math.min(s.b, MASTERED)) + '○'.repeat(MASTERED - Math.min(s.b, MASTERED)) : 'новое'}</span></div>`; }).join('')
      || '<p class="muted">Ничего не найдено</p>';
  };
  $('#q').oninput = draw; draw();
}

// ---------- settings ----------
function settings() {
  const cfg = window.ZH_CONFIG || {}, configured = cfg.supabaseUrl && cfg.supabaseKey;
  app.innerHTML = `<div class="top"><button class="x" data-a="home">←</button><b style="flex:1">Настройки</b></div>
    <div class="set">
      <label>Слов в тренировке <select id="size">${[10, 15, 20, 30, 40].map(n => `<option ${n === S.settings.size ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Цель на день (карточек) <select id="goal">${[20, 30, 50, 80].map(n => `<option ${n === S.settings.goal ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Показывать английский <input type="checkbox" id="en" ${S.settings.en ? 'checked' : ''}></label>
    </div>
    <div class="set"><b>Синхронизация телефон ↔ ноутбук</b>
      ${!configured ? `<p>Пока прогресс хранится только на этом устройстве. Чтобы включить синхронизацию, заполни config.js (инструкция в SETUP.md).</p>`
      : user ? `<p>Вошла как <b>${esc(user.email)}</b>. ${esc(syncStatus)}</p>
          <button class="btn primary" data-a="syncnow">Синхронизировать сейчас</button><button class="btn ghost" data-a="logout">Выйти</button>`
      : `<p>Введи email — придёт ссылка для входа. Открой её на каждом устройстве.</p>
          <input type="email" id="email" placeholder="you@example.com" autocomplete="email"><button class="btn primary" data-a="login">Отправить ссылку</button>`}
    </div>
    <div class="set"><b>Резервная копия</b><p>Скачать прогресс в файл или загрузить его обратно.</p>
      <button class="btn" data-a="export">⬇ Скачать прогресс</button>
      <label class="btn" style="justify-content:center">⬆ Загрузить из файла<input type="file" id="imp" accept="application/json" hidden></label>
      <button class="btn ghost" data-a="reset" style="color:var(--bad)">Сбросить весь прогресс</button></div>
    <p class="muted" style="font-size:13px;text-align:center">${LESSONS.length} уроков · ${LIST.length} слов · ${SENT.length} предложений</p>`;
  $('#size').onchange = e => { S.settings.size = +e.target.value; save(); };
  $('#goal').onchange = e => { S.settings.goal = +e.target.value; save(); };
  $('#en').onchange = e => { S.settings.en = e.target.checked; save(); };
  $('[data-a=login]') && ($('[data-a=login]').onclick = login);
  $('[data-a=logout]') && ($('[data-a=logout]').onclick = async () => { await sb.auth.signOut(); settings(); });
  $('[data-a=syncnow]') && ($('[data-a=syncnow]').onclick = async () => { await syncNow(); settings(); });
  $('[data-a=export]').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
    a.download = `hanzi-progress-${today()}.json`; a.click();
  };
  $('#imp').onchange = async e => {
    try { const data = JSON.parse(await e.target.files[0].text()); if (!data.w) throw 0; S = merge(S, data); save(); toast('Прогресс загружен'); }
    catch (err) { toast('Не получилось прочитать файл'); }
  };
  $('[data-a=reset]').onclick = () => { if (confirm('Точно стереть весь прогресс на этом устройстве?')) { const st = S.settings; S = fresh(); S.settings = st; localSave(); toast('Прогресс сброшен'); home(); } };
}

// ---------- sync (Supabase, optional) ----------
let sb = null, user = null, syncStatus = '', syncT = null;
function syncLine() {
  if (!sb) return 'Прогресс сохраняется на этом устройстве';
  if (!user) return 'Синхронизация: войди в ⚙︎ настройках';
  return `☁︎ Синхронизировано с ${esc(user.email)}${syncStatus && syncStatus !== 'ok' ? ' · ' + esc(syncStatus) : ''}`;
}
function merge(a, b) {
  const out = { ...a, w: { ...a.w } };
  for (const [k, v] of Object.entries(b.w || {})) if (!out.w[k] || (v.t || 0) > (out.w[k].t || 0)) out.w[k] = v;
  out.xp = Math.max(a.xp || 0, b.xp || 0);
  const sa = a.streak || {}, sb_ = b.streak || {};
  out.streak = (sb_.last || '') > (sa.last || '') ? sb_ : (sb_.last === sa.last ? { last: sa.last, n: Math.max(sa.n || 0, sb_.n || 0) } : sa);
  const da = a.daily || {}, db = b.daily || {};
  out.daily = (db.date || '') > (da.date || '') ? db : (db.date === da.date ? { date: da.date, n: Math.max(da.n || 0, db.n || 0) } : da);
  out.boss = { ...(b.boss || {}), ...(a.boss || {}) };
  return out;
}
async function initSync() {
  const cfg = window.ZH_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseKey) return;
  try { await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'); }
  catch (e) { syncStatus = 'нет сети'; return; }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  const { data } = await sb.auth.getSession();
  user = data.session?.user || null;
  sb.auth.onAuthStateChange((_e, s) => { const was = user; user = s?.user || null; if (user && !was) syncNow().then(() => !SES && home()); });
  if (user) await syncNow();
  if (!SES) home();
}
async function syncNow() {
  if (!sb || !user) return;
  try {
    const { data, error } = await sb.from('progress').select('data').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (data?.data) { S = merge(S, data.data); localSave(); }
    const { error: e2 } = await sb.from('progress').upsert({ user_id: user.id, data: S, updated_at: new Date().toISOString() });
    if (e2) throw e2;
    syncStatus = 'ok';
  } catch (e) { syncStatus = 'ошибка синхронизации: ' + (e.message || e); }
  const l = $('#syncline'); if (l) l.innerHTML = syncLine();
}
function scheduleSync() { if (!sb || !user) return; clearTimeout(syncT); syncT = setTimeout(syncNow, 4000); }
async function login() {
  const email = $('#email').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Проверь email');
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  toast(error ? 'Ошибка: ' + error.message : 'Ссылка отправлена — проверь почту ✉️');
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow().then(() => !SES && home()); });

// ---------- global handlers ----------
document.addEventListener('click', e => {
  const say = e.target.closest('[data-say]'); if (say) { speak(say.dataset.say); }
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (a === 'next') next();
  else if (a === 'home') home();
  else if (a === 'quit') { if (!SES.res.length || confirm('Закончить тренировку? Ответы уже сохранены.')) SES.res.length ? finish() : home(); }
});
document.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) return;
  if (/^[1-4]$/.test(e.key)) { const o = $$('.opt:not(:disabled)')[+e.key - 1]; o && o.click(); }
  else if (e.key === 'Enter' || e.key === ' ') {
    const b = $('[data-a=next]') || $('[data-a=reveal]'); if (b) { e.preventDefault(); b.click(); }
  } else if (e.key === 'ArrowLeft') $('[data-g="0"]')?.click();
  else if (e.key === 'ArrowRight') $('[data-g="1"]')?.click();
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
home();
initSync();
