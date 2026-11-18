"""List texts to record (words + example sentences) or, with --index, write app/audio/index.json."""
import hashlib, json, pathlib, sys
here = pathlib.Path(__file__).resolve().parent
root = here.parent.parent
data = json.loads((root / 'data/words.json').read_text(encoding='utf-8'))
texts = []
for l in data['lessons']:
    texts += [w['hz'].replace('…', '，') for w in l['words']]
    texts += [s['zh'] for s in l['sentences']]
    texts += [c for w in l['words'] for c in w['hz'] if '一' <= c <= '鿿']   # single characters too
texts = list(dict.fromkeys(t.strip() for t in texts if t.strip()))
key = lambda t: hashlib.sha1(t.encode('utf-8')).hexdigest()[:12]
audio = root / 'app/audio'
if '--index' in sys.argv:
    index = {t: key(t) for t in texts if (audio / f'{key(t)}.m4a').exists()}
    (audio / 'index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(len(index), 'of', len(texts), 'texts have a recording')
else:
    todo = [t for t in texts if not (here / 'wav' / f'{key(t)}.wav').exists()]
    (here / 'list.tsv').write_text(''.join(f'{key(t)}\t{t}\n' for t in todo), encoding='utf-8')
    print(len(todo), 'to record of', len(texts))
