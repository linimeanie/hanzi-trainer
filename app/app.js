'use strict';
/* 汉字 — notebook vocabulary trainer: spaced repetition, full-screen cards, stroke order, character breakdown. */

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rand = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 864e5;
const INTERVALS = [0, 1, 2, 4, 8, 16, 32, 64];
const MASTERED = 4;
const ymd = d => d.toLocaleDateString('sv');
const today = () => ymd(new Date());
const isHan = c => /\p{Script=Han}/u.test(c);
const noTones = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const app = $('#app');
const SPK = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
const SPK_BIG = SPK.replace(/width="20" height="20"/, 'width="56" height="56"');
const PLAY = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>`;
const GRID = `<svg class="grid" viewBox="0 0 100 100" preserveAspectRatio="none"><rect x=".75" y=".75" width="98.5" height="98.5" fill="none" stroke="var(--grid)" stroke-width="1.5"/><g stroke="var(--grid)" stroke-width=".7" stroke-dasharray="3 3"><path d="M50 0V100M0 50H100"/><path d="M0 0L100 100M100 0L0 100" opacity=".55"/></g></svg>`;

// ---------- state ----------
const LS = 'zh-trainer-v1';
const fresh = () => ({ w: {}, custom: [], daily: { date: null, n: 0 }, boss: {}, settings: { size: 20, goal: 30, en: true, tc: true, rate: .8, voice: '' }, updated: 0 });
let S = (() => {
  try { const s = JSON.parse(localStorage.getItem(LS)); if (s) { const f = fresh(); return { ...f, ...s, settings: { ...f.settings, ...s.settings }, custom: s.custom || [] }; } } catch (e) {}
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
const mastery = words => words.length ? Math.round(100 * words.reduce((a, w) => a + Math.min(ws(w.hz).b, MASTERED), 0) / (words.length * MASTERED)) : 0;

// ---------- data (notebook + words added in the app) ----------
const BASE = window.ZH_DATA.lessons;
const DEC = window.ZH_DECOMP || { chars: {}, info: {} };
let LESSONS, LATEST, WORDS, LIST, SENT;
function rebuild() {
  const baseMax = Math.max(...BASE.map(l => l.n));
  const byDate = {};
  for (const c of S.custom) if (!c.del) (byDate[c.added] ||= []).push({ hz: c.hz, py: c.py, ru: c.ru, en: c.en || '', custom: true });
  const extra = Object.keys(byDate).sort().map((d, i) => ({ n: baseMax + 1 + i, key: 'C' + d, date: d, custom: true, words: byDate[d], sentences: [] }));
  LESSONS = [...BASE.map(l => ({ ...l, key: 'L' + l.n })), ...extra];
  LATEST = Math.max(...LESSONS.map(l => l.n));
  WORDS = new Map();
  for (const l of LESSONS) for (const w of l.words) WORDS.set(w.hz, { ...w, lesson: l.n });
  LIST = [...WORDS.values()];
  SENT = BASE.flatMap(l => l.sentences.map(s => ({ ...s, lesson: l.n })));
}
rebuild();
// green = newest notebook class + words added in the app since then; orange = the 3 lessons before; red = older
let TIERS = {};
function computeTiers() {
  const base = LESSONS.filter(l => !l.custom), latest = base[base.length - 1];
  const sorted = [...LESSONS].sort((x, y) => (y.date || '').localeCompare(x.date || '') || y.n - x.n);
  TIERS = {}; let orange = 0;
  for (const l of sorted) {
    const green = l === latest || (l.custom && (l.date || '') >= (latest.date || ''));
    TIERS[l.n] = green ? 'green' : orange++ < 3 ? 'orange' : 'red';
  }
}
computeTiers();
const tierOf = n => TIERS[n] || 'red';
const TIER = { green: 'Последний урок', orange: 'Недавние', red: 'Старые' };
const tierSub = t => { const ls = LESSONS.filter(l => tierOf(l.n) === t).map(l => l.custom ? 'мои слова' : l.n);
  const nums = ls.filter(x => typeof x === 'number'), extra = ls.filter(x => typeof x !== 'number');
  const r = nums.length ? (nums.length === 1 ? `урок ${nums[0]}` : `уроки ${Math.min(...nums)}–${Math.max(...nums)}`) : '';
  return [r, ...extra].filter(Boolean).join(' + '); };
const lessonWords = l => [...new Set(l.words.map(w => w.hz))].map(h => WORDS.get(h)).filter(Boolean);
const lessonName = l => l.custom ? 'Мои слова' : `Урок ${l.n}`;
const fmtDate = d => d ? new Date(d + 'T12:00').toLocaleDateString('ru', { day: 'numeric', month: 'long' }) : 'без даты';

// ---------- choosing words ----------
function priority(w) {
  const s = ws(w.hz), now = Date.now();
  let p = Math.random() * 25;
  if (!s.t) p += 40;
  if (s.d <= now) p += 100;
  if (s.t && s.b === 0) p += 60;
  p += (INTERVALS.length - s.b) * 8;
  return p;
}
const byPriority = words => words.map(w => [priority(w), w]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
function pickWords(n, tier) {
  if (tier) return shuffle(byPriority(LIST.filter(w => tierOf(w.lesson) === tier)).slice(0, n));
  const quota = { green: Math.round(n * .6), orange: Math.round(n * .25) };
  quota.red = n - quota.green - quota.orange;
  const out = [];
  for (const t of ['green', 'orange', 'red']) out.push(...byPriority(LIST.filter(w => tierOf(w.lesson) === t)).slice(0, quota[t]));
  if (out.length < n) out.push(...byPriority(LIST.filter(w => !out.includes(w))).slice(0, n - out.length));
  return shuffle(out);
}
function hasWord(zh, hz) { let i = 0; for (const part of hz.split('…').filter(Boolean)) { const j = zh.indexOf(part, i); if (j < 0) return false; i = j + part.length; } return true; }
const examples = w => SENT.filter(s => hasWord(s.zh, w.hz)).sort((a, b) => ((b.lesson === w.lesson) - (a.lesson === w.lesson)) || ((a.gen || 0) - (b.gen || 0)));
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
    for (const p of shuffle(idx).slice(0, 1 + (idx.length > 1 && Math.random() < .5 ? 1 : 0))) {
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
let zhVoice = null, ZH_VOICES = [];
function voiceScore(v) {
  let s = 0;
  if (/zh[-_]CN/i.test(v.lang)) s += 3; else if (/zh[-_]TW/i.test(v.lang)) s += 1;
  if (/premium|natural|neural/i.test(v.name)) s += 6;
  if (/enhanced|улучш|erweitert/i.test(v.name)) s += 5;
  if (/online|google/i.test(v.name)) s += 3;
  if (/xiaoxiao|yunxi|lili|lilian|yu-shu|tingting|meijia/i.test(v.name)) s += 1;
  return s;
}
function loadVoice() {
  ZH_VOICES = speechSynthesis.getVoices().filter(v => /^(zh|cmn)/i.test(v.lang) && !/HK|yue/i.test(v.lang + v.name)).sort((a, b) => voiceScore(b) - voiceScore(a));
  zhVoice = ZH_VOICES.find(v => v.name === S.settings.voice) || ZH_VOICES[0] || null;
}
if ('speechSynthesis' in window) { loadVoice(); speechSynthesis.onvoiceschanged = loadVoice; }
function speak(text, rate) {
  if (!('speechSynthesis' in window)) return toast('Озвучка недоступна в этом браузере');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/…/g, '，'));
  u.lang = 'zh-CN'; if (zhVoice) u.voice = zhVoice; u.rate = rate || S.settings.rate || .8;
  speechSynthesis.speak(u);
}

// ---------- character boxes, stroke order, breakdown ----------
const HW_SRC = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.5.0/dist/hanzi-writer.min.js';
const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
let hwReady = null;
const ensureHW = () => window.HanziWriter ? Promise.resolve() : (hwReady ||= loadScript(HW_SRC).catch(e => { hwReady = null; throw e; }));
function boxSize(hz, max) {
  const n = Math.max(1, [...hz].filter(isHan).length);
  const avail = Math.min(innerWidth, 640) - 40 - (n - 1) * 8;
  return Math.floor(Math.min(max, avail / n));
}
function charRow(hz, max = Math.min(300, innerHeight * .36), id = '') {
  const s = boxSize(hz, max);
  return `<div class="tzgrow" ${id ? `id="${id}"` : ''} style="--s:${s}px">${[...hz].map(c => isHan(c)
    ? `<div class="tzg" data-c="${esc(c)}">${GRID}<span class="ch">${esc(c)}</span></div>` : `<span class="nonhan">${esc(c)}</span>`).join('')}</div>`;
}
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
async function strokeOrder(row) {
  if (!row || row._busy) return;
  row._busy = true;
  try { await ensureHW(); } catch (e) { row._busy = false; return toast('Нужен интернет, чтобы показать порядок черт'); }
  const boxes = $$('.tzg', row);
  if (!row._w) {
    row._w = boxes.map(b => {
      const s = b.offsetWidth, h = document.createElement('div'); h.className = 'hw'; b.appendChild(h);
      const w = HanziWriter.create(h, b.dataset.c, {
        width: s, height: s, padding: Math.round(s * .07), showOutline: true, showCharacter: true,
        strokeColor: css('--ink'), radicalColor: css('--red'), outlineColor: css('--line'),
        strokeAnimationSpeed: 1.1, delayBetweenStrokes: 220,
        onLoadCharDataError: () => { h.remove(); b.querySelector('.ch').style.visibility = ''; }
      });
      b.querySelector('.ch').style.visibility = 'hidden';
      return w;
    });
  }
  for (const w of row._w) { if (!document.body.contains(row)) break; await new Promise(r => w.animateCharacter({ onComplete: r })); }
  row._busy = false;
}
function breakdown(hz) {
  const info = x => DEC.info[x] || { g: '', py: '' };
  const blocks = [];
  for (const c of new Set([...hz].filter(isHan))) {
    const r = DEC.chars[c]; if (!r) continue;
    const role = x => x === r.s ? 's' : x === r.m ? 'm' : '';
    const label = { s: 'звук', m: 'смысл' };
    let type = '';
    if (r.t === 'pp') type = `Смысл + звук: значение подсказывает <b class="hz">${esc(r.m || '')}</b> «${esc(info(r.m).g)}»` +
      (r.s ? `, а звучание взято от <b class="hz">${esc(r.s)}</b> <span class="py">${esc(info(r.s).py)}</span>.` : '.');
    else if (r.t === 'id') type = 'Смысловое сложение: значения частей вместе дают смысл иероглифа.';
    else if (r.t === 'pg') type = 'Пиктограмма — упрощённый рисунок предмета.';
    if (!r.p.length && !type) continue;
    blocks.push(`<div class="bd"><div class="bd-row">
      <div class="bd-c"><span class="hz">${esc(c)}</span><small class="py">${esc(info(c).py)}</small></div>
      ${r.p.length ? `<span class="bd-op">=</span>` + r.p.map(x => `<div class="bd-p ${role(x)}" data-open="${esc(x)}"><span class="hz">${esc(x)}</span>
        ${info(x).py ? `<small class="py">${esc(info(x).py)}</small>` : ''}<small>${esc(info(x).g)}</small>${role(x) ? `<em>${label[role(x)]}</em>` : ''}</div>`).join('<span class="bd-op">+</span>') : ''}
      </div>${type ? `<p class="bd-t">${type}</p>` : ''}${r.h && r.t !== 'pp' ? `<p class="bd-h">${esc(r.h)}</p>` : ''}</div>`);
  }
  return blocks.join('');
}
function exampleHtml(w, max = 2) {
  return examples(w).slice(0, max).map(ex => `<div class="ex" data-say="${esc(ex.zh)}"><span class="zh">${esc(ex.zh)}</span>
    <span class="ib" style="padding:4px 10px;vertical-align:middle">${SPK}</span>
    <div class="p">${pyHtml(ex.py)}</div><div class="r">${esc(ex.ru)}${ex.gen ? '' : ' <span class="src">· из тетради</span>'}</div></div>`).join('');
}

// ---------- pinyin: syllables, tone colours ----------
const PYV = 'aeiouüvāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';
const SYL = new RegExp(`(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?[${PYV}]+(?:ng(?![${PYV}])|n(?![${PYV}])|r(?![${PYV}]))?`, 'gi');
function toneOf(syl) { for (const ch of syl) { const m = MARK[ch.toLowerCase()]; if (m) return m[1] + 1; } return 5; }
const sylls = py => [...(py || '').matchAll(SYL)].map(m => m[0]);
function pyHtml(py) {
  py = py || '';
  if (!S.settings.tc) return esc(py);
  let out = '', last = 0;
  for (const m of py.matchAll(SYL)) { out += esc(py.slice(last, m.index)) + `<span class="t${toneOf(m[0])}">${esc(m[0])}</span>`; last = m.index + m[0].length; }
  return out + esc(py.slice(last));
}
// each character of a word on its own: its syllable from the word, its own meaning
function partsRow(w) {
  const cs = [...w.hz].filter(isHan); if (cs.length < 2) return '';
  const sy = sylls(w.py), aligned = sy.length === cs.length;
  return `<div class="pcs">${cs.map((c, i) => { const inf = DEC.info[c] || {};
    return `<button class="pc" data-open="${esc(c)}" data-say="${esc(c)}"><span class="hz">${esc(c)}</span>
      <span class="py">${pyHtml(aligned ? sy[i] : inf.py)}</span><small>${esc(inf.g || '')}</small></button>`; }).join('')}</div>`;
}
// up to 5 characters that look almost the same; the differing part is drawn in red
// characters the notebook data doesn't cover (e.g. words added in the app) load from chars/<block>.json
const shardCache = new Map();
const missingChars = hz => [...hz].filter(c => isHan(c) && !DEC.chars[c]);
const shardKey = c => (c.codePointAt(0) >> 7).toString(16);
async function ensureChars(hz) {
  const need = missingChars(hz); if (!need.length) return false;
  for (const k of new Set(need.map(shardKey)))
    if (!shardCache.has(k)) shardCache.set(k, fetch(`chars/${k}.json`).then(r => r.ok ? r.json() : {}).catch(() => { shardCache.delete(k); return {}; }));
  let added = false;
  for (const c of need) {
    const r = (await shardCache.get(shardKey(c)) || {})[c]; if (!r) continue;
    DEC.chars[c] = r.d; if (r.l && r.l.length) (DEC.look ||= {})[c] = r.l;
    for (const [x, i] of Object.entries(r.i)) if (!DEC.info[x]) DEC.info[x] = i;
    added = true;
  }
  return added;
}
function lookHtml(hz) {
  const cs = [...new Set([...hz].filter(isHan))].filter(c => (DEC.look || {})[c]);
  return cs.map(c => `<div class="la-row">${[...hz].length > 1 ? `<div class="la-for"><span class="hz">${esc(c)}</span> похож на:</div>` : ''}
    <div class="la-list">${DEC.look[c].map(([x, idx]) => { const inf = DEC.info[x] || {};
      return `<button class="la" data-open="${esc(x)}"><span class="la-g" data-glyph="${esc(x)}" data-idx="${idx}"><span class="hz">${esc(x)}</span></span>
        <span class="py">${pyHtml(inf.py)}</span><small>${esc(inf.g || '')}</small></button>`; }).join('')}</div></div>`).join('');
}
const glyphCache = new Map();
function strokeData(c) {
  if (!glyphCache.has(c)) glyphCache.set(c, fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(c)}.json`).then(r => r.ok ? r.json() : null).catch(() => null));
  return glyphCache.get(c);
}
async function paintGlyphs(root = document) {
  for (const el of $$('[data-glyph]', root)) {
    const c = el.dataset.glyph, idx = el.dataset.idx, m = (DEC.info[c] || {}).m;
    if (idx === '-1' || !m) continue;
    const d = await strokeData(c); if (!d || !document.body.contains(el)) continue;
    el.innerHTML = `<svg viewBox="0 0 1024 1024"><g transform="scale(1,-1) translate(0,-900)">${d.strokes.map((p, i) =>
      `<path d="${p}" fill="${m[i] === idx ? 'var(--red)' : 'var(--ink)'}"/>`).join('')}</g></svg>`;
  }
}

// ---------- UI bits ----------
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
const tag = w => `<div class="tag"><span class="dot c-${tierOf(w.lesson)}"></span>${w.custom ? 'мои слова' : 'урок ' + w.lesson}${ws(w.hz).t ? '' : ' · новое'}</div>`;
const enLine = w => S.settings.en && w.en ? `<div class="big-en">${esc(w.en)}</div>` : '';
const spkBtn = (t, label = 'Слушать') => `<button class="ib" data-say="${esc(t)}">${SPK}${label}</button>`;
const slowBtn = t => `<button class="ib" data-slow="${esc(t)}">Медленно</button>`;
const strokeBtn = id => `<button class="ib" data-stroke="${id}">${PLAY}Порядок черт</button>`;

// ---------- session ----------
let SES = null, timer = null;
const MIX = ['meaning', 'reverse', 'tones', 'listen', 'pen', 'flash'];
function kindFor(mode, w) {
  let k = mode === 'mix' ? rand(MIX) : mode;
  if (mode === 'mix' && !ws(w.hz).t && Math.random() < .5) k = rand(['flash', 'pen']);
  if (k === 'tones' && !hasTones(w.py)) k = 'meaning';
  if (k === 'trace' && !traceable(w)) k = 'pen';
  return k;
}
function start(mode, words, extra = {}) {
  if (!words.length) return toast('Нет слов для тренировки');
  clearInterval(timer);
  SES = { mode, words, i: 0, res: [], ...extra };
  if (mode === 'match') { SES.round = 0; return renderMatch(); }
  SES.items = words.map(w => ({ w, kind: kindFor(mode, w) }));
  renderCard();
}
function record(w, ok) { grade(w.hz, ok); SES.res.push({ w, ok }); bumpDaily(); save(); }
function answer(ok) { const it = SES.items[SES.i]; if (it.done) return; it.done = true; record(it.w, ok); }
function next() { SES.i++; renderCard(); }
function topBar(p, label) {
  return `<div class="top"><button class="x" data-a="quit" aria-label="Выйти">×</button>
    <div class="bar"><i style="width:${p * 100}%"></i></div><span class="cnt">${label}</span></div>`;
}
function screen(main, bottom = '', mainCls = '') {
  const n = SES.items.length;
  app.innerHTML = `<div class="scr">${topBar(SES.i / n, `${Math.min(SES.i + 1, n)}/${n}`)}
    <div class="main ${mainCls}">${main}</div><div class="bottom">${bottom}</div></div>`;
  window.scrollTo(0, 0);
}
function renderCard() {
  SES.view = null;
  if (SES.i >= SES.items.length) return finish();
  const { w, kind } = SES.items[SES.i];
  CARDS[kind](w);
}
// full explanation after a mistake: stroke order plays by itself
function sheet(w, ok) {
  const bd = breakdown(w.hz), ex = exampleHtml(w);
  screen(`<div class="status ${ok ? 'ok' : 'bad'}">${ok ? 'ВЕРНО' : 'ЗАПОМНИ'}</div>
    <div data-say="${esc(w.hz)}">${charRow(w.hz, Math.min(260, innerHeight * .3), 'sr')}</div>
    <div class="icons">${spkBtn(w.hz)}${slowBtn(w.hz)}${strokeBtn('sr')}</div>
    <div class="big-py" data-say="${esc(w.hz)}">${pyHtml(w.py)}</div><div class="info-ru">${esc(w.ru)}</div>${enLine(w)}
    ${partsRow(w)}
    ${ex ? `<div class="box"><h3>Пример</h3>${ex}</div>` : ''}
    ${bd ? `<div class="box"><h3>Из чего состоит</h3>${bd}</div>` : ''}
    ${lookHtml(w.hz) ? `<div class="box"><h3>Не перепутай — похожие</h3>${lookHtml(w.hz)}</div>` : ''}`,
    `<button class="btn primary" data-a="next">Дальше</button>`, 'top-al');
  SES.view = () => sheet(w, ok);
  paintGlyphs();
  speak(w.hz);
  if (!ok) setTimeout(() => strokeOrder($('#sr')), 350);
}
function mcCard(w, main, options, correct, cls = '') {
  screen(`${tag(w)}${main}`, `<div class="opts ${cls === 'hzo' || cls === 'pyo' ? 'g2' : ''}">${options.map(o =>
    `<button class="opt ${cls}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`);
  $$('.opt').forEach(b => b.onclick = () => {
    const ok = b.dataset.v === correct;
    $$('.opt').forEach(x => { x.disabled = true; if (x.dataset.v === correct) x.classList.add('right'); });
    if (!ok) { b.classList.add('wrong'); answer(false); return setTimeout(() => sheet(w, false), 650); }
    answer(true); speak(w.hz);
    $('.bottom').insertAdjacentHTML('afterbegin', `<div class="banner"><span class="hz">${esc(w.hz)}</span>
      <div class="t"><span class="py">${pyHtml(w.py)}</span><br>${esc(w.ru)}</div></div>`);
    $('.opts').outerHTML = `<div class="row2"><button class="btn" data-a="more">Подробнее</button><button class="btn primary" data-a="next">Дальше</button></div>`;
    $('[data-a=more]').onclick = () => sheet(w, true);
  });
}
function selfCard(w, front, back, revealLabel, onReveal) {
  screen(`${tag(w)}${front}<div id="back" style="display:contents"></div>`, `<button class="btn primary" data-a="reveal">${revealLabel}</button>`);
  $('[data-a=reveal]').onclick = () => {
    $('#back').innerHTML = back;
    $('.bottom').innerHTML = `<div class="row2"><button class="btn no" data-g="0">Не вспомнила</button><button class="btn yes" data-g="1">Знаю</button></div>`;
    speak(w.hz); onReveal && onReveal();
    $$('[data-g]').forEach(b => b.onclick = () => { const ok = b.dataset.g === '1'; answer(ok); ok ? next() : sheet(w, false); });
  };
}
const CARDS = {
  meaning(w) {
    mcCard(w, `${charRow(w.hz)}<div class="icons">${spkBtn(w.hz)}</div>`, shuffle([w.ru, ...distractors(w, 'ru').map(x => x.ru)]), w.ru);
  },
  reverse(w) {
    mcCard(w, `<div class="big-ru">${esc(w.ru)}</div>${enLine(w)}<div class="hint">Найди иероглиф</div>`,
      shuffle([w.hz, ...distractors(w, 'hz').map(x => x.hz)]), w.hz, 'hzo');
  },
  tones(w) {
    mcCard(w, `${charRow(w.hz, Math.min(240, innerHeight * .3))}<div class="hint">${esc(w.ru)} — как читается?</div>`, toneVariants(w.py), w.py, 'pyo');
  },
  listen(w) {
    mcCard(w, `<div class="hint">Послушай и найди слово</div><button class="spk-huge" data-say="${esc(w.hz)}">${SPK_BIG}</button>`,
      shuffle([w.hz, ...distractors(w, 'hz').map(x => x.hz)]), w.hz, 'hzo');
    setTimeout(() => speak(w.hz), 300);
  },
  flash(w) {
    selfCard(w, `${charRow(w.hz)}<div class="hint" id="fh">Вспомни чтение и значение</div>`,
      `<div class="big-py">${pyHtml(w.py)}</div><div class="big-ru">${esc(w.ru)}</div>${enLine(w)}${partsRow(w)}`, 'Показать',
      () => $('#fh').remove());
  },
  pen(w) {
    selfCard(w, `<div class="big-ru">${esc(w.ru)}</div>${enLine(w)}
      <div class="icons" id="penTools">${spkBtn(w.hz, 'Послушать')}<button class="ib" data-a="pyhint">Пиньинь</button></div>
      <div class="hint" id="pyh">Напиши в тетради, потом проверь</div>`,
      `<div data-say="${esc(w.hz)}">${charRow(w.hz, Math.min(280, innerHeight * .34), 'pr')}</div><div class="big-py">${pyHtml(w.py)}</div>${partsRow(w)}`,
      'Проверить', () => { $('#pyh').remove(); $('#penTools').innerHTML = strokeBtn('pr') + spkBtn(w.hz); setTimeout(() => strokeOrder($('#pr')), 300); });
    $('[data-a=pyhint]').onclick = e => { $('#pyh').innerHTML = `<span class="big-py">${pyHtml(w.py)}</span>`; e.currentTarget.remove(); };
  },
  trace(w) { traceCard(w); }
};

// ---------- trace (draw with finger) ----------
function traceable(w) { const c = [...w.hz].filter(isHan); return c.length > 0 && c.length <= 3; }
async function traceCard(w) {
  const chars = [...w.hz].filter(isHan);
  const s = Math.floor(Math.min(Math.min(innerWidth, 640) - 40, innerHeight * .46, 340));
  screen(`${tag(w)}<div class="big-ru" style="font-size:24px">${esc(w.ru)}</div><div class="big-py" style="font-size:22px">${pyHtml(w.py)}</div>
    <div class="hint" id="tri" style="font-size:13px">Рисуй пальцем, черта за чертой</div>
    <div class="tzg trace-box" style="--s:${s}px">${GRID}<div class="hw" id="hw"></div></div>`,
    `<div class="row2"><button class="btn" data-a="outline">Подсказка</button><button class="btn" data-a="skip">Не знаю</button></div>`);
  try { await ensureHW(); } catch (e) { toast('Нет интернета для этого режима — переключаю на «Тетрадь»'); return CARDS.pen(w); }
  let idx = 0, mistakes = 0, hinted = false, writer = null;
  const done = () => { const ok = !hinted && mistakes <= chars.length * 2; answer(ok); ok ? sheet(w, true) : sheet(w, false); };
  const go = () => {
    const hw = $('#hw'); if (!hw) return; hw.innerHTML = '';
    $('#tri').textContent = chars.length > 1 ? `Иероглиф ${idx + 1} из ${chars.length}` : 'Рисуй пальцем, черта за чертой';
    writer = HanziWriter.create(hw, chars[idx], {
      width: s, height: s, padding: Math.round(s * .07), showOutline: false, showCharacter: false,
      strokeColor: css('--ink'), drawingColor: css('--red'), outlineColor: css('--line'), highlightColor: css('--red'),
      drawingWidth: 20, showHintAfterMisses: 3,
      onLoadCharDataError: () => { toast('Не удалось загрузить черты'); CARDS.pen(w); }
    });
    writer.quiz({ onMistake: () => mistakes++, onComplete: () => { idx++; idx < chars.length ? setTimeout(go, 450) : setTimeout(done, 350); } });
  };
  $('[data-a=outline]').onclick = () => { hinted = true; writer && writer.showOutline(); };
  $('[data-a=skip]').onclick = () => { hinted = true; writer && writer.cancelQuiz(); done(); };
  go();
}

// ---------- match ----------
function renderMatch() {
  const rounds = Math.ceil(SES.words.length / 6);
  if (SES.round >= rounds) return finish();
  const words = SES.words.slice(SES.round * 6, SES.round * 6 + 6);
  const errs = new Set(); let sel = null, left = words.length; const t0 = Date.now();
  app.innerHTML = `<div class="scr">${topBar(SES.round / rounds, `${SES.round + 1}/${rounds}`)}
    <div class="main"><div class="timer" id="tm">0.0 с</div>
    <div class="match"><div class="col">${shuffle(words).map(w => `<button class="mt hzo" data-s="h" data-h="${esc(w.hz)}">${esc(w.hz)}</button>`).join('')}</div>
    <div class="col">${shuffle(words).map(w => `<button class="mt" data-s="r" data-h="${esc(w.hz)}">${esc(w.ru)}</button>`).join('')}</div></div></div></div>`;
  clearInterval(timer);
  timer = setInterval(() => { const el = $('#tm'); if (el) el.textContent = ((Date.now() - t0) / 1000).toFixed(1) + ' с'; }, 100);
  $$('.mt').forEach(b => b.onclick = () => {
    if (b.classList.contains('done')) return;
    if (!sel || sel.dataset.s === b.dataset.s) { $$('.mt.sel').forEach(x => x.classList.remove('sel')); sel = b; b.classList.add('sel'); if (b.dataset.s === 'h') speak(b.dataset.h); return; }
    const a = sel; sel = null; a.classList.remove('sel');
    if (a.dataset.h === b.dataset.h) {
      a.classList.add('done'); b.classList.add('done');
      const w = WORDS.get(b.dataset.h); record(w, !errs.has(w.hz));
      if (--left === 0) { clearInterval(timer); toast(((Date.now() - t0) / 1000).toFixed(1) + ' с'); SES.round++; setTimeout(renderMatch, 600); }
    } else {
      errs.add(a.dataset.h); errs.add(b.dataset.h);
      [a, b].forEach(x => { x.classList.add('wrong'); setTimeout(() => x.classList.remove('wrong'), 400); });
    }
  });
}

// ---------- results ----------
function finish() {
  clearInterval(timer);
  SES.view = () => finish();
  const n = SES.res.length, ok = SES.res.filter(r => r.ok).length;
  let boss = '';
  if (SES.boss && n) {
    if (ok / n >= .9) { S.boss[SES.boss] = today(); boss = `<div class="hint">Урок пройден — отмечен печатью <span class="done-seal" style="display:inline-block">过</span></div>`; }
    else boss = `<div class="hint">Чтобы отметить урок пройденным, нужно 90% — сейчас ${Math.round(ok / n * 100)}%</div>`;
  }
  save();
  const wrong = [...new Map(SES.res.filter(r => !r.ok).map(r => [r.w.hz, r.w])).values()];
  const last = { mode: SES.mode, boss: SES.boss, tier: SES.tier, lesson: SES.lesson };
  app.innerHTML = `<div class="scr"><div class="top"></div><div class="main ${wrong.length ? 'top-al' : ''}">
    <div class="score">${ok}<span class="muted" style="font-size:.5em"> / ${n}</span></div>
    <div class="hint">${n && ok / n >= .9 ? '很好！Отлично' : ok / Math.max(n, 1) >= .6 ? '不错 — неплохо' : '加油 — продолжай'}</div>${boss}
    ${wrong.length ? `<div class="box"><h3>Ошибки — нажми, чтобы разобрать</h3><div class="list">${wrong.map(w =>
      `<button class="wrow" data-word="${esc(w.hz)}"><span class="dot c-${tierOf(w.lesson)}"></span><span class="hz">${esc(w.hz)}</span>
        <span class="t"><span class="py">${pyHtml(w.py)}</span><span>${esc(w.ru)}</span></span><span></span></button>`).join('')}</div></div>` : ''}
    </div><div class="bottom">
      ${wrong.length ? `<button class="btn primary" data-a="redo">Повторить ошибки (${wrong.length})</button>` : ''}
      <button class="btn ${wrong.length ? '' : 'primary'}" data-a="again">Ещё раунд</button>
      <button class="btn ghost" data-a="home">Готово</button></div></div>`;
  $('[data-a=redo]') && ($('[data-a=redo]').onclick = () => start(SES.mode === 'match' ? 'mix' : SES.mode, shuffle(wrong)));
  $('[data-a=again]').onclick = () => {
    if (last.boss) return startLesson(LESSONS.find(l => l.key === last.boss), true);
    start(last.mode, pickWords(last.mode === 'match' ? 12 : S.settings.size, last.tier), { tier: last.tier });
  };
}

// ---------- tabs ----------
let TAB = 'learn';
const NAV = [['learn', '学', 'Учить'], ['lessons', '课', 'Уроки'], ['words', '词', 'Слова'], ['settings', '设', 'Настройки']];
function page(html) {
  SES = null; clearInterval(timer);
  app.innerHTML = `<div class="page">${html}</div><nav class="tabs"><div>${NAV.map(([k, i, l]) =>
    `<button class="${k === TAB ? 'on' : ''}" data-tab="${k}"><span class="i">${i}</span><span class="l">${l}</span></button>`).join('')}</div></nav>`;
  window.scrollTo(0, 0);
}
function go(tab) { TAB = tab; PREV.length = 0; ({ learn: home, lessons, words: wordsTab, settings })[tab](); }
const MODES = [['pen', '写', 'Тетрадь'], ['flash', '卡', 'Карточки'], ['meaning', '义', 'Значение'], ['reverse', '找', 'Найди знак'],
  ['tones', '声', 'Тоны'], ['listen', '听', 'На слух'], ['trace', '描', 'Пальцем'], ['match', '配', 'Пары']];

function home() {
  CUR = home;
  const goal = S.settings.goal, d = dailyN(), n = S.settings.size;
  const q = { g: Math.round(n * .6), o: Math.round(n * .25) }; q.r = n - q.g - q.o;
  page(`<div class="ptitle"><div class="seal">学</div><div><h1>Тренировка</h1><div class="sub">${fmtDate(today())}</div></div></div>
    <button class="start" data-a="daily"><b>Начать</b><span>${n} слов: ${q.g} из последнего урока, ${q.o} из недавних, ${q.r} старых</span></button>
    <div class="today"><span>Сегодня ${d} из ${goal}</span><div class="bar"><i style="width:${Math.min(100, d / goal * 100)}%"></i></div></div>
    <div class="sec">Повторить отдельно</div>
    <div class="tiers">${['green', 'orange', 'red'].map(t => {
      const words = LIST.filter(w => tierOf(w.lesson) === t), m = mastery(words);
      return `<button class="tier c-${t}" data-tier="${t}"><span class="dot"></span><span><b>${TIER[t]}</b><small>${tierSub(t)} · ${words.length} слов</small></span>
        <div class="bar"><i style="width:${m}%"></i></div><span class="pct">${m}%</span></button>`;
    }).join('')}</div>
    <div class="sec">Режимы</div>
    <div class="modes">${MODES.map(([k, i, l]) => `<button class="mode" data-mode="${k}"><span class="i">${i}</span><span class="l">${l}</span></button>`).join('')}</div>
    <p class="muted" style="text-align:center;font-size:12px;margin-top:34px" id="syncline">${syncLine()}</p>`);
  $('[data-a=daily]').onclick = () => start('mix', pickWords(n));
  $$('[data-tier]').forEach(b => b.onclick = () => start('mix', pickWords(n, b.dataset.tier), { tier: b.dataset.tier }));
  $$('[data-mode]').forEach(b => b.onclick = () => { const m = b.dataset.mode; start(m, pickWords(m === 'match' ? 12 : n)); });
}
function lessons() {
  CUR = lessons;
  page(`<div class="ptitle"><div class="seal">课</div><div><h1>Уроки</h1><div class="sub">${LESSONS.length} уроков из тетради</div></div></div>
    <div class="list">${[...LESSONS].reverse().map(l => {
      const words = lessonWords(l);
      return `<button class="lesson c-${tierOf(l.n)}" data-lesson="${l.key}"><span class="dot"></span>
        <span><b>${lessonName(l)}</b><small>${fmtDate(l.date)} · ${words.length} слов</small></span>
        <span class="pct">${mastery(words)}%</span>${S.boss[l.key] ? '<span class="done-seal">过</span>' : '<span></span>'}</button>`;
    }).join('')}</div>`);
  $$('[data-lesson]').forEach(b => b.onclick = () => lessonPage(LESSONS.find(l => l.key === b.dataset.lesson)));
}
function lessonPage(l) {
  CUR = () => lessonPage(l);
  const words = lessonWords(l);
  page(`<button class="back" data-tab="lessons">‹ Уроки</button>
    <div class="ptitle"><div class="seal" style="background:var(--${({ green: 'jade', orange: 'amber', red: 'red' })[tierOf(l.n)]})">课</div>
      <div><h1>${lessonName(l)}</h1><div class="sub">${fmtDate(l.date)} · освоено ${mastery(words)}%</div></div></div>
    <button class="btn primary" data-a="go">Тренировать урок</button>
    <div class="hint" style="font-size:13px;margin-top:8px">До 25 самых слабых слов. 90% правильных — урок отмечается печатью 过.</div>
    <div class="sec">Слова</div>${wordList(words)}`);
  $('[data-a=go]').onclick = () => startLesson(l, true);
}
function startLesson(l, boss) {
  start('mix', shuffle(byPriority(lessonWords(l)).slice(0, 25)), boss ? { boss: l.key } : {});
}
function wordList(words) {
  return `<div class="list">${words.map(w => { const s = ws(w.hz), lv = Math.min(s.b, MASTERED);
    return `<button class="wrow" data-word="${esc(w.hz)}"><span class="dot c-${tierOf(w.lesson)}"></span><span class="hz">${esc(w.hz)}</span>
      <span class="t"><span class="py">${pyHtml(w.py)}</span><span>${esc(w.ru)}</span></span>
      <span class="lv">${s.t ? '●'.repeat(lv) + '○'.repeat(MASTERED - lv) : ''}</span></button>`; }).join('') || '<p class="muted">Ничего не найдено</p>'}</div>`;
}
let lastQuery = '';
function wordsTab() {
  CUR = wordsTab;
  page(`<div class="ptitle"><div class="seal">词</div><div><h1>Слова</h1><div class="sub">${LIST.length} слов</div></div></div>
    <button class="btn primary" data-a="add" style="margin-bottom:14px">＋ Добавить слово</button>
    <input class="search" id="q" placeholder="汉字, pinyin или по-русски" autocomplete="off" value="${esc(lastQuery)}"><div id="dl"></div>`);
  const draw = () => {
    const q = noTones(lastQuery = $('#q').value.trim()), qs = q.replace(/\s/g, '');
    const hits = LIST.filter(w => !q || w.hz.includes(q) || noTones(w.py).replace(/\s/g, '').includes(qs) || w.ru.toLowerCase().includes(q) || (w.en || '').toLowerCase().includes(q))
      .sort((a, b) => b.lesson - a.lesson).slice(0, 250);
    $('#dl').innerHTML = wordList(hits);
  };
  $('#q').oninput = draw; draw();
  $('[data-a=add]').onclick = addWord;
}
let CUR = null;
function wordPage(hz, quiet) {
  const w = WORDS.get(hz) || { hz, py: (DEC.info[hz] || {}).py || '', ru: (DEC.info[hz] || {}).g || '', en: '', lesson: null, part: true };
  const s = ws(hz), lv = Math.min(s.b, MASTERED), bd = breakdown(hz), ex = exampleHtml(w, 4), la = lookHtml(hz);
  const inWords = [...hz].length === 1 ? LIST.filter(x => x.hz !== hz && x.hz.includes(hz)).slice(0, 12) : [];
  const back = `<button class="back" data-a="back">‹ Назад</button>`;
  const prevTab = TAB;
  page(`${back}
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">
      <div data-say="${esc(hz)}">${charRow(hz, Math.min(260, innerHeight * .32), 'wr')}</div>
      <div class="icons">${spkBtn(hz)}${slowBtn(hz)}${strokeBtn('wr')}</div>
      <div class="big-py" data-say="${esc(hz)}">${pyHtml(w.py)}</div><div class="info-ru">${esc(w.ru)}</div>${w.en ? `<div class="big-en">${esc(w.en)}</div>` : ''}
      ${partsRow(w)}
      <div class="tag">${w.lesson ? `<span class="dot c-${tierOf(w.lesson)}"></span>${w.custom ? 'мои слова' : 'урок ' + w.lesson} · ${s.t ? `уровень ${'●'.repeat(lv)}${'○'.repeat(MASTERED - lv)}` : 'ещё не тренировалось'}` : 'отдельный иероглиф'}</div>
    </div>
    ${ex ? `<div class="box"><h3>Примеры</h3>${ex}</div>` : ''}
    ${inWords.length ? `<div class="box"><h3>Встречается в словах</h3>${wordList(inWords)}</div>` : ''}
    ${bd ? `<div class="box"><h3>Из чего состоит</h3>${bd}</div>` : ''}
    ${la ? `<div class="box"><h3>Не перепутай — похожие</h3>${la}</div>` : ''}
    ${w.custom ? `<div class="box"><button class="btn ghost" data-a="del" style="color:var(--bad)">Удалить слово</button></div>` : ''}`);
  CUR = () => wordPage(hz);
  $('[data-a=back]').onclick = () => PREV.length ? PREV.pop()() : go(prevTab);
  $('[data-a=del]') && ($('[data-a=del]').onclick = () => {
    if (!confirm(`Удалить «${hz}»?`)) return;
    const c = S.custom.find(x => x.hz === hz); if (c) { c.del = true; c.t = Date.now(); }
    save(); rebuild(); computeTiers(); go('words');
  });
  paintGlyphs();
  if (!quiet) speak(hz);
  setTimeout(() => strokeOrder($('#wr')), 400);
  if (missingChars(hz).length) { const me = CUR; ensureChars(hz).then(a => { if (a && CUR === me) { wordPage(hz, true); CUR = me; } }); }
}
const PREV = [];
async function addWord() {
  page(`<button class="back" data-tab="words">‹ Слова</button>
    <div class="ptitle"><div class="seal">新</div><div><h1>Новое слово</h1><div class="sub">попадёт в «Мои слова» и сразу станет зелёным</div></div></div>
    <label class="field"><span>Иероглифы</span><input id="f-hz" class="hzin" autocomplete="off" autocapitalize="off" lang="zh"></label>
    <label class="field"><span>Пиньинь</span><input id="f-py" autocomplete="off" autocapitalize="off"><small id="f-pyh">заполнится сам — проверь тоны</small></label>
    <label class="field"><span>Перевод</span><input id="f-ru" autocomplete="off"></label>
    <label class="field"><span>English (необязательно)</span><input id="f-en" autocomplete="off"></label>
    <button class="btn primary" data-a="save">Сохранить</button>
    <div id="f-prev"></div>
    <p class="muted" style="font-size:13px;margin-top:24px">Можно и по-старому: пришли Claude фото страницы — он распознает и добавит всё сразу, с примерами.</p>`);
  try { if (!window.ZH_PINYIN) await loadScript('pinyin.js'); } catch (e) {}
  let pyTouched = false;
  $('#f-py').oninput = () => pyTouched = true;
  $('#f-hz').oninput = () => {
    const hz = $('#f-hz').value.trim();
    if (!pyTouched && window.ZH_PINYIN) $('#f-py').value = [...hz].map(c => ZH_PINYIN[c] || '').join('');
    const ex = WORDS.get(hz);
    $('#f-pyh').textContent = ex ? `Уже есть: ${ex.py} — ${ex.ru}` : 'заполнится сам — проверь тоны';
    const show = () => {
      if ($('#f-hz').value.trim() !== hz) return;
      const bd = breakdown(hz), la = lookHtml(hz);
      $('#f-prev').innerHTML = hz && [...hz].some(isHan) ? `<div class="box">${partsRow({ hz, py: $('#f-py').value })}${bd}${la ? `<h3 style="margin-top:12px">Похожие</h3>${la}` : ''}</div>` : '';
      paintGlyphs($('#f-prev'));
    };
    show(); ensureChars(hz).then(a => a && show());
  };
  $('[data-a=save]').onclick = () => {
    const hz = $('#f-hz').value.trim(), py = $('#f-py').value.trim(), ru = $('#f-ru').value.trim(), en = $('#f-en').value.trim();
    if (![...hz].some(isHan)) return toast('Введи иероглифы');
    if (!ru) return toast('Добавь перевод');
    S.custom = S.custom.filter(x => x.hz !== hz);
    S.custom.push({ hz, py, ru, en, added: today(), t: Date.now() });
    save(); rebuild(); computeTiers();
    toast(`Добавлено: ${hz}`);
    ['f-hz', 'f-py', 'f-ru', 'f-en'].forEach(id => $('#' + id).value = ''); pyTouched = false; $('#f-prev').innerHTML = '';
    $('#f-hz').focus();
  };
  $('#f-hz').focus();
}

// ---------- settings ----------
function settings() {
  const cfg = window.ZH_CONFIG || {}, configured = cfg.supabaseUrl && cfg.supabaseKey;
  page(`<div class="ptitle"><div class="seal">设</div><div><h1>Настройки</h1></div></div>
    <div class="set">
      <label>Слов в тренировке <select id="size">${[10, 15, 20, 30, 40].map(n => `<option ${n === S.settings.size ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Цель на день, карточек <select id="goal">${[20, 30, 50, 80].map(n => `<option ${n === S.settings.goal ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Показывать английский <input type="checkbox" id="en" ${S.settings.en ? 'checked' : ''}></label>
      <label>Тоны цветом <span class="tone-legend"><span class="t1">ā</span> <span class="t2">á</span> <span class="t3">ǎ</span> <span class="t4">à</span> <input type="checkbox" id="tc" ${S.settings.tc ? 'checked' : ''}></span></label>
    </div>
    <div class="set"><b>Голос</b>
      <label>Голос <select id="voice">${ZH_VOICES.length ? ZH_VOICES.map(v => `<option value="${esc(v.name)}" ${zhVoice && v.name === zhVoice.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('') : '<option>по умолчанию</option>'}</select></label>
      <label>Скорость <select id="rate">${[[.6, 'очень медленно'], [.7, 'медленно'], [.8, 'спокойно'], [.9, 'почти обычно'], [1, 'обычно']].map(([r, n]) => `<option value="${r}" ${r === S.settings.rate ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <button class="btn" data-say="妈，麻，马，骂。你好，我在学习汉语。">Проверить: mā má mǎ mà</button>
      <p>Голос берётся из телефона. Самые живые — «улучшенные» голоса.<br>
        <b>iPhone:</b> Настройки → Универсальный доступ → Устный контент → Голоса → Китайский (материковый Китай) → скачай <b>Lilian (улучшенный)</b> или <b>Yu-shu (улучшенный)</b>, затем выбери его здесь.<br>
        <b>Mac:</b> Системные настройки → Универсальный доступ → Устный контент → Системный голос → Управление голосами → Китайский.<br>
        <b>Windows/Edge:</b> голоса «Xiaoxiao Online (Natural)» уже звучат естественно.</p>
    </div>
    <div class="set"><b>Синхронизация</b>
      ${!configured ? `<p>Прогресс хранится только на этом устройстве.</p>`
      : user ? `<p>Вход: ${esc(user.email)}. ${syncStatus === 'ok' ? 'Всё синхронизировано.' : esc(syncStatus)}</p>
          <button class="btn" data-a="syncnow">Синхронизировать сейчас</button><button class="btn ghost" data-a="logout">Выйти</button>`
      : `<p>Введи email — придёт ссылка для входа. Открой её на каждом устройстве.</p>
          <input type="email" id="email" placeholder="you@example.com" autocomplete="email"><button class="btn primary" data-a="login">Отправить ссылку</button>`}
    </div>
    <div class="set"><b>Резервная копия</b><p>Скачать прогресс в файл или загрузить обратно.</p>
      <button class="btn" data-a="export">Скачать прогресс</button>
      <label class="btn" style="display:block">Загрузить из файла<input type="file" id="imp" accept="application/json" hidden></label>
      <button class="btn ghost" data-a="reset" style="color:var(--bad)">Сбросить прогресс</button></div>
    <p class="muted" style="font-size:12px;text-align:center">${LESSONS.length} уроков · ${LIST.length} слов · ${SENT.length} предложений<br>
      Порядок черт и разбор иероглифов: Hanzi Writer и Make Me a Hanzi (открытые данные)</p>`);
  $('#size').onchange = e => { S.settings.size = +e.target.value; save(); };
  $('#goal').onchange = e => { S.settings.goal = +e.target.value; save(); };
  $('#en').onchange = e => { S.settings.en = e.target.checked; save(); };
  $('#tc').onchange = e => { S.settings.tc = e.target.checked; save(); };
  $('#voice').onchange = e => { S.settings.voice = e.target.value; save(); loadVoice(); speak('你好'); };
  $('#rate').onchange = e => { S.settings.rate = +e.target.value; save(); speak('你好，很高兴认识你。'); };
  $('[data-a=login]') && ($('[data-a=login]').onclick = login);
  $('[data-a=logout]') && ($('[data-a=logout]').onclick = async () => { await sb.auth.signOut(); settings(); });
  $('[data-a=syncnow]') && ($('[data-a=syncnow]').onclick = async () => { await syncNow(); settings(); });
  $('[data-a=export]').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
    a.download = `hanzi-progress-${today()}.json`; a.click();
  };
  $('#imp').onchange = async e => {
    try { const data = JSON.parse(await e.target.files[0].text()); if (!data.w) throw 0; S = merge(S, data); save(); rebuild(); computeTiers(); toast('Прогресс загружен'); }
    catch (err) { toast('Не получилось прочитать файл'); }
  };
  $('[data-a=reset]').onclick = () => { if (confirm('Стереть прогресс на этом устройстве? Добавленные слова останутся.')) { S = { ...fresh(), settings: S.settings, custom: S.custom }; localSave(); toast('Прогресс сброшен'); go('learn'); } };
}

// ---------- sync (Supabase) ----------
let sb = null, user = null, syncStatus = '', syncT = null;
function syncLine() {
  if (!sb) return '';
  if (!user) return 'Синхронизация выключена — войди в настройках';
  return `Синхронизировано · ${esc(user.email)}${syncStatus && syncStatus !== 'ok' ? ' · ' + esc(syncStatus) : ''}`;
}
function merge(a, b) {
  const out = { ...a, w: { ...a.w } };
  for (const [k, v] of Object.entries(b.w || {})) if (!out.w[k] || (v.t || 0) > (out.w[k].t || 0)) out.w[k] = v;
  const da = a.daily || {}, db = b.daily || {};
  out.daily = (db.date || '') > (da.date || '') ? db : (db.date === da.date ? { date: da.date, n: Math.max(da.n || 0, db.n || 0) } : da);
  out.boss = { ...(b.boss || {}), ...(a.boss || {}) };
  const cm = new Map((a.custom || []).map(c => [c.hz, c]));
  for (const c of b.custom || []) if (!cm.has(c.hz) || (c.t || 0) > (cm.get(c.hz).t || 0)) cm.set(c.hz, c);
  out.custom = [...cm.values()];
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
  sb.auth.onAuthStateChange((_e, s) => { const was = user; user = s?.user || null; if (user && !was) syncNow().then(refreshIdle); });
  if (user) await syncNow();
  refreshIdle();
}
function refreshIdle() { if (!SES && TAB === 'learn' && $('.start')) home(); else { const l = $('#syncline'); if (l) l.innerHTML = syncLine(); } }
async function syncNow() {
  if (!sb || !user) return;
  try {
    const { data, error } = await sb.from('progress').select('data').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (data?.data) { S = merge(S, data.data); localSave(); rebuild(); computeTiers(); }
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
  toast(error ? 'Ошибка: ' + error.message : 'Ссылка отправлена — проверь почту');
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow().then(refreshIdle); });

// ---------- global handlers ----------
document.addEventListener('click', e => {
  const t = e.target;
  const slow = t.closest('[data-slow]'); if (slow) speak(slow.dataset.slow, .5);
  const say = !slow && !(t.closest('[data-open]') && (!SES || SES.view)) && t.closest('[data-say]'); if (say) speak(say.dataset.say);
  const st = t.closest('[data-stroke]'); if (st) strokeOrder(document.getElementById(st.dataset.stroke));
  const tab = t.closest('[data-tab]'); if (tab) return go(tab.dataset.tab);
  const wd = t.closest('[data-word]');
  const op = t.closest('[data-open]');
  if (wd || (op && (!SES || SES.view))) {
    const target = wd ? wd.dataset.word : op.dataset.open;
    const s = SES; PREV.push(s ? () => { SES = s; s.view(); } : CUR);
    return wordPage(target);
  }
  const a = t.closest('[data-a]')?.dataset.a;
  if (a === 'next') next();
  else if (a === 'home') go('learn');
  else if (a === 'quit') { if (!SES.res.length || confirm('Закончить? Ответы уже сохранены.')) SES.res.length ? finish() : go('learn'); }
});
document.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) return;
  if (/^[1-4]$/.test(e.key)) { const o = $$('.opt:not(:disabled)')[+e.key - 1]; o && o.click(); }
  else if (e.key === 'Enter' || e.key === ' ') { const b = $('[data-a=next]') || $('[data-a=reveal]'); if (b) { e.preventDefault(); b.click(); } }
  else if (e.key === 'ArrowLeft') $('[data-g="0"]')?.click();
  else if (e.key === 'ArrowRight') $('[data-g="1"]')?.click();
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
go('learn');
initSync();
for (const c of S.custom) if (!c.del) ensureChars(c.hz);
