"""List words that have fewer than N example sentences (default 3). Usage: python3 tools/example_gaps.py [N]"""
import json, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
N = int(sys.argv[1]) if len(sys.argv) > 1 else 3
d = json.loads((root / 'data/words.json').read_text(encoding='utf-8'))
sents = [s['zh'] for l in d['lessons'] for s in l['sentences']]
def has(zh, hz):
    i = 0
    for part in [p for p in hz.split('…') if p]:
        j = zh.find(part, i)
        if j < 0: return False
        i = j + len(part)
    return True
words, seen = [], set()
for l in d['lessons']:
    for w in l['words']:
        if w['hz'] not in seen: seen.add(w['hz']); words.append(w['hz'])
need = {w: N - sum(has(s, w) for s in sents) for w in words}
need = {w: n for w, n in need.items() if n > 0}
print(len(need), 'words need', sum(need.values()), 'sentences')
print(' '.join(f"{w}{'×' + str(n) if n > 1 else ''}" for w, n in need.items()))
