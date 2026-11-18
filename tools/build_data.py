"""Build the app's data files from data/words.tsv.

TSV format:
  #L <tab> lesson number <tab> source page <tab> date (YYYY-MM-DD, optional)
  hanzi <tab> pinyin <tab> russian <tab> english
  S <tab> sentence <tab> pinyin <tab> russian <tab> english
Outputs:
  app/data.js    lessons, words, sentences
  app/decomp.js  character breakdown (parts, meaning part, sound part) for every character used
  app/pinyin.js  pinyin for ~9000 characters (auto-fill when adding a word in the app)
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
info = {}
for c in sorted(need):
    py = (dic.get(c) or {}).get('pinyin') or []
    info[c] = {'g': gloss.get(c, ''), 'py': py[0] if py else ''}
nogloss = [c for c in sorted(need) if not gloss.get(c)]
(root / 'app/decomp.js').write_text('window.ZH_DECOMP = ' + json.dumps({'chars': out, 'info': info}, ensure_ascii=False) + ';\n', encoding='utf-8')
pinyin = {c: d['pinyin'][0] for c, d in dic.items() if d.get('pinyin') and is_han(c)}
(root / 'app/pinyin.js').write_text('window.ZH_PINYIN = ' + json.dumps(pinyin, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
print(f"{len(lessons)} lessons, {sum(len(l['words']) for l in lessons)} words, {sum(len(l['sentences']) for l in lessons)} sentences, "
      f"{len(out)} characters with breakdown")
if missing: print('not in dictionary:', ''.join(missing))
if nogloss: print('need a Russian gloss in data/glosses_ru.txt:', ''.join(nogloss))
