"""Convert data/words.tsv into app/data.js (and data/words.json).

TSV format:
  #L <tab> lesson number <tab> source page <tab> date (YYYY-MM-DD, optional)
  hanzi <tab> pinyin <tab> russian <tab> english
  S <tab> sentence <tab> pinyin <tab> russian <tab> english
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
        cur = {'n': int(p[1]), 'page': p[2], 'date': p[3] if len(p) > 3 and p[3] else None,
               'words': [], 'sentences': []}
        lessons.append(cur)
    elif p[0] == 'S':
        cur['sentences'].append({'zh': p[1], 'py': p[2], 'ru': p[3], 'en': p[4]})
    else:
        cur['words'].append({'hz': p[0], 'py': p[1], 'ru': p[2], 'en': p[3]})
data = {'lessons': lessons}
(root / 'data/words.json').write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
(root / 'app/data.js').write_text('window.ZH_DATA = ' + json.dumps(data, ensure_ascii=False) + ';\n', encoding='utf-8')
print(f"{len(lessons)} lessons, {sum(len(l['words']) for l in lessons)} words, "
      f"{sum(len(l['sentences']) for l in lessons)} sentences")
