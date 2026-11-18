"""Build the app's data files from data/words.tsv.

TSV format:
  #L <tab> lesson number <tab> source page <tab> date (YYYY-MM-DD, optional)
  hanzi <tab> pinyin <tab> russian <tab> english
  S <tab> sentence <tab> pinyin <tab> russian <tab> english
Outputs:
  app/data.js    lessons, words, sentences
  app/decomp.js  character breakdown (parts, meaning part, sound part) for every character used
  app/pinyin.js  pinyin for ~9000 characters (auto-fill when adding a word in the app)
Example sentences written by Claude live in data/examples_ai.tsv; look-alikes come from tools/lookalikes.py.
Russian glosses for parts live in data/glosses_ru.txt (char|meaning); missing ones are reported.
Run:  python3 tools/build_data.py
"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
lessons, cur = [], None
for line in (root / 'data/words.tsv').read_text(encoding='utf-8').splitlines():
    if not line.strip():
        continue
    p = line.split('\t')
    if p[0] == '#L':
        cur = {'n': int(p[1]), 'page': p[2], 'date': p[3] if len(p) > 3 and p[3] else None, 'words': [], 'sentences': []}
        lessons.append(cur)
    elif p[0] == 'S':
        cur['sentences'].append({'zh': p[1], 'py': p[2], 'ru': p[3], 'en': p[4]})
    else:
        cur['words'].append({'hz': p[0], 'py': p[1], 'ru': p[2], 'en': p[3]})
# example sentences written by Claude (data/examples_ai.tsv) go to the lesson of their target word
lesson_of = {}
for l in lessons:
    for w in l['words']:
        lesson_of[w['hz']] = l
ai = 0
ai_path = root / 'data/examples_ai.tsv'
if ai_path.exists():
    for line in ai_path.read_text(encoding='utf-8').splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        t, zh, py, ru = line.split('\t')[:4]
        l = lesson_of.get(t)
        if l and not any(x['zh'] == zh for x in l['sentences']):
            l['sentences'].append({'zh': zh, 'py': py, 'ru': ru, 'en': '', 'gen': 1}); ai += 1
data = {'lessons': lessons}
(root / 'data/words.json').write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
(root / 'app/data.js').write_text('window.ZH_DATA = ' + json.dumps(data, ensure_ascii=False) + ';\n', encoding='utf-8')

# ---- character breakdown ----
dic = {}
for line in (root / 'data/makemeahanzi/dictionary.txt').read_text(encoding='utf-8').splitlines():
    d = json.loads(line); dic[d['character']] = d
gloss = {}
for line in (root / 'data/glosses_ru.txt').read_text(encoding='utf-8').splitlines():
    if '|' in line:
        c, g = line.split('|', 1); gloss[c] = g
for l in lessons:  # the user's own single-character translations win
    for w in l['words']:
        if len(w['hz']) == 1:
            gloss[w['hz']] = w['ru']
IDS = set('⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻？')
is_han = lambda c: '一' <= c <= '鿿'
chars = []
for l in lessons:
    for w in l['words']:
        chars += [c for c in w['hz'] if is_han(c) and c not in chars]
TYPES = {'pictophonetic': 'pp', 'ideographic': 'id', 'pictographic': 'pg'}
out, need, missing = {}, set(), []
for c in chars:
    d = dic.get(c)
    if not d:
        missing.append(c); continue
    parts = [x for x in d.get('decomposition', '') if x not in IDS and x != c]
    e = d.get('etymology') or {}
    rec = {'p': parts}
    if e.get('type') in TYPES: rec['t'] = TYPES[e['type']]
    if (e.get('semantic') or '').strip(): rec['m'] = e['semantic'].strip()
    if (e.get('phonetic') or '').strip(): rec['s'] = e['phonetic'].strip()
    if e.get('hint'): rec['h'] = e['hint']
    if d.get('radical') and d['radical'] != c: rec['r'] = d['radical']
    out[c] = rec
    need.add(c); need.update(p for p in parts if p.strip()); need.update(x for x in (rec.get('m'), rec.get('s'), rec.get('r')) if x)
look = {}
la_path = root / 'data/lookalikes.json'
if la_path.exists():
    la = json.loads(la_path.read_text(encoding='utf-8'))
    for c, lst in la.items():
        if c in out:
            look[c] = lst
            for x, idx in lst:
                need.add(x)
strokes_of = {}
for c in need:
    m = (dic.get(c) or {}).get('matches')
    if m and len(c) == 1:
        strokes_of[c] = ''.join(str(x[0]) if x else '-' for x in m)
info = {}
for c in sorted(need):
    py = (dic.get(c) or {}).get('pinyin') or []
    info[c] = {'g': gloss.get(c, ''), 'py': py[0] if py else ''}
    if c in strokes_of: info[c]['m'] = strokes_of[c]
nogloss = [c for c in sorted(need) if not gloss.get(c)]
(root / 'app/decomp.js').write_text('window.ZH_DECOMP = ' + json.dumps({'chars': out, 'info': info, 'look': look}, ensure_ascii=False) + ';\n', encoding='utf-8')
pinyin = {c: d['pinyin'][0] for c, d in dic.items() if d.get('pinyin') and is_han(c)}
(root / 'app/pinyin.js').write_text('window.ZH_PINYIN = ' + json.dumps(pinyin, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')

# ---- every dictionary character, in small files the app fetches on demand (app/chars/<block>.json) ----
# so words added in the app get a breakdown and look-alikes right away. Characters without a Russian
# gloss carry the English definition, marked e=1.
def rec_of(c):
    d = dic[c]
    parts = [x for x in d.get('decomposition', '') if x not in IDS and x != c and x.strip()]
    e = d.get('etymology') or {}
    r = {'p': parts}
    if e.get('type') in TYPES: r['t'] = TYPES[e['type']]
    if (e.get('semantic') or '').strip(): r['m'] = e['semantic'].strip()
    if (e.get('phonetic') or '').strip(): r['s'] = e['phonetic'].strip()
    if e.get('hint'): r['h'] = e['hint']
    if d.get('radical') and d['radical'] != c: r['r'] = d['radical']
    return r
def info_of(c):
    d = dic.get(c) or {}
    py = d.get('pinyin') or []
    i = {'g': gloss.get(c, ''), 'py': py[0] if py else ''}
    if not i['g'] and d.get('definition'):
        i['g'] = d['definition'].split(';')[0][:40]; i['e'] = 1
    m = d.get('matches')
    if m: i['m'] = ''.join(str(x[0]) if x else '-' for x in m)
    return i
la_all = json.loads(la_path.read_text(encoding='utf-8')) if la_path.exists() else {}
shards = {}
for c in dic:
    if not is_han(c):
        continue
    r = rec_of(c)
    lst = la_all.get(c, [])
    related = {c, *r['p'], *(r.get(k) for k in 'msr' if r.get(k)), *(x for x, _ in lst)}
    shards.setdefault(format(ord(c) >> 7, 'x'), {})[c] = {'d': r, 'l': lst, 'i': {x: info_of(x) for x in related if x}}
chars_dir = root / 'app/chars'
chars_dir.mkdir(exist_ok=True)
for old in chars_dir.glob('*.json'):
    if old.stem not in shards:
        old.unlink()
for k, v in shards.items():
    (chars_dir / f'{k}.json').write_text(json.dumps(v, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f"{sum(len(v) for v in shards.values())} characters published in {len(shards)} files under app/chars/")
print(f"{len(lessons)} lessons, {sum(len(l['words']) for l in lessons)} words, {sum(len(l['sentences']) for l in lessons)} sentences, "
      f"({ai} written by Claude), {len(out)} characters with breakdown, {len(look)} with look-alikes")
if missing: print('not in dictionary:', ''.join(missing))
if nogloss: print('need a Russian gloss in data/glosses_ru.txt:', ''.join(nogloss))
