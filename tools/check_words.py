"""Check the word list against the Make Me a Hanzi dictionary:
- every character exists;
- the pinyin of every word matches, syllable by syllable, one of the dictionary readings of its characters
  (tones compared too; neutral tone and tone-sandhi of 一/不 are allowed).
Prints suspicious entries. Usage: python3 tools/check_words.py
"""
import json, re, unicodedata, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
dic = {}
for line in (root / 'data/makemeahanzi/dictionary.txt').read_text(encoding='utf-8').splitlines():
    d = json.loads(line); dic[d['character']] = d
words = json.loads((root / 'data/words.json').read_text(encoding='utf-8'))
V = 'aeiouüvāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ'
SYL = re.compile(rf"(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?[{V}]+(?:ng(?![{V}])|n(?![{V}])|r(?![{V}]))?", re.I)
def base(s):  # without tone
    return ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn').replace('v', 'u')
def tone(s):
    for c in unicodedata.normalize('NFD', s):
        if c == '̄': return 1
        if c == '́': return 2
        if c == '̌': return 3
        if c == '̀': return 4
    return 5
han = lambda c: '一' <= c <= '鿿'
problems = []
for l in words['lessons']:
    for w in l['words']:
        chars = [c for c in w['hz'] if han(c)]
        for c in chars:
            if c not in dic: problems.append((l['n'], w['hz'], w['py'], f'нет иероглифа {c} в словаре'))
        sy = SYL.findall(w['py'])
        if len(sy) != len(chars):
            if not w['hz'].endswith('儿'): problems.append((l['n'], w['hz'], w['py'], f'слогов {len(sy)}, иероглифов {len(chars)}'))
            continue
        for c, s in zip(chars, sy):
            readings = (dic.get(c) or {}).get('pinyin') or []
            if not readings: continue
            if not any(base(r) == base(s) for r in readings):
                problems.append((l['n'], w['hz'], w['py'], f'{c} читается {"/".join(readings)}, а не {s}'))
            elif not any(base(r) == base(s) and (tone(r) == tone(s) or tone(s) == 5) for r in readings):
                if c not in '一不':
                    problems.append((l['n'], w['hz'], w['py'], f'{c}: тон {s}, в словаре {"/".join(readings)}'))
for p in problems: print(*p, sep=' | ')
print(len(problems), 'suspicious of', sum(len(l['words']) for l in words['lessons']))
