"""Find up to 5 look-alike characters for every character in the dictionary (the word list first in ranking).

Two characters look alike when they have the same layout (left-right, top-bottom…) and share one of
their two parts, the other part being different — e.g. 请/清/情/晴. Sharing the non-radical part
(the visually larger, usually sound part) ranks first; a hand-made list adds classic pairs
like 未/末, 己/已/巳 that have no decomposition. Only common characters (GB2312 level 1) are used.
Writes data/lookalikes.json: {char: [[other, index_of_differing_part_or_-1], ...]}.
"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
dic = {}
for line in (root / 'data/makemeahanzi/dictionary.txt').read_text(encoding='utf-8').splitlines():
    d = json.loads(line); dic[d['character']] = d
def common(c):
    try: b = c.encode('gb2312')
    except UnicodeEncodeError: return False
    return len(b) == 2 and 0xB0 <= b[0] <= 0xD7
IDS = set('⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻')
def split(c):
    dec = (dic.get(c) or {}).get('decomposition', '')
    if len(dec) == 3 and dec[0] in IDS and dec[0] != '⿻' and '？' not in dec: return dec[0], dec[1], dec[2]
    return None
strokes = lambda c: len((dic.get(c) or {}).get('matches') or [])
CURATED = ['未末', '己已巳', '土士', '天夫', '人入八', '日曰', '大太犬', '王玉主', '木本术', '白自百', '刀力', '干千于',
  '午牛', '贝见', '买卖', '问间', '拔拨', '侯候', '象像', '免兔', '鸟乌', '今令', '爪瓜', '戊戌戍', '折拆析', '治冶', '历厉',
  '辨辩辫', '准淮', '晴睛情清请', '处外', '尤龙', '申甲由田', '目且', '旦但', '要耍', '狠狼很', '待侍', '往住', '季李', '孤狐',
  '撒撤', '推堆', '已巴', '儿几', '贝页', '风凤', '休体', '牛生', '于子', '主住', '去丢', '少小', '自目', '门们', '东车',
  '鸟岛', '万方', '叶什', '找我', '午年', '母毋', '头买', '兔免', '晚挽', '睡锤', '短矩', '冰水', '永水', '各名', '左右石', '入人']
curated = {}
for group in CURATED:
    for c in group:
        curated.setdefault(c, [])
        curated[c] += [x for x in group if x != c and x not in curated[c]]
words = json.loads((root / 'data/words.json').read_text(encoding='utf-8'))
mine = []
for l in words['lessons']:
    for w in l['words']:
        mine += [c for c in w['hz'] if '一' <= c <= '鿿' and c not in mine]
mine_set = set(mine)
index = {}
for c in dic:
    s = split(c)
    if s and common(c): index.setdefault((s[0], 1, s[1]), []).append(c); index.setdefault((s[0], 2, s[2]), []).append(c)
by_part, contains = {}, {}
for c in dic:
    s_ = split(c)
    if s_ and common(c):
        for pos, part in ((1, s_[1]), (2, s_[2])):
            by_part.setdefault(part, {}).setdefault((s_[0], pos, part), []).append(c)
            if strokes(s_[3 - pos]) <= 5: contains.setdefault(part, []).append(c)
targets = mine + [c for c in dic if '\u4e00' <= c <= '\u9fff' and c not in mine_set]
out = {}
for c in targets:
    s = split(c)
    def diff_idx(x):
        xs = split(x)
        if s and xs and xs[0] == s[0]:
            if xs[2] == s[2] and xs[1] != s[1]: return 0
            if xs[1] == s[1] and xs[2] != s[2]: return 1
        return -1
    cands = [(0, x, diff_idx(x)) for x in curated.get(c, [])]
    if s:
        op, a, b = s
        rad = (dic.get(c) or {}).get('radical')
        for keep, pos, other_idx in ((b, 2, 0), (a, 1, 1)):   # keep part b → part a differs (index 0), and vice versa
            for x in index.get((op, pos, keep), []):
                if x == c: continue
                xs = split(x)
                sharing_nonradical = keep != rad
                diffpart_c = a if pos == 2 else b
                diffpart_x = xs[1] if pos == 2 else xs[2]
                if not sharing_nonradical or abs(strokes(diffpart_c) - strokes(diffpart_x)) > 2: continue
                rank = 1
                cands.append((rank, x, other_idx))
        # same main (non-radical) part in a different layout, e.g. 房 / 防 / 访 — only to fill up the list
        main = b if a == rad else a if b == rad else None
        if main:
            for (op2, pos2, keep2), xs_list in ((k, v) for k, v in by_part.get(main, {}).items()):
                for x in xs_list:
                    if x == c or op2 == op: continue
                    xs = split(x)
                    other = xs[1] if pos2 == 2 else xs[2]
                    if strokes(other) > 5: continue   # only small radicals differ, the main part stays
                    cands.append((2, x, 0 if pos2 == 2 else 1))
        # characters built on this one (退 → 腿) and the one it is built on
        for x in contains.get(c, []):
            xs = split(x); cands.append((3, x, 0 if xs[2] == c else 1))
    seen, best = set(), []
    for rank, x, idx in sorted(cands, key=lambda t: (t[0], t[1] not in mine_set, abs(strokes(t[1]) - strokes(c)))):
        if x in seen or x == c or x not in dic: continue
        seen.add(x); best.append([x, idx])
        if len(best) == 5: break
    if best: out[c] = best
(root / 'data/lookalikes.json').write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
allc = {x for v in out.values() for x, _ in v}
print(len(out), 'chars have look-alikes;', sum(c in out for c in mine), 'of', len(mine), 'from the word list')
for c in '请末己睛休找晚退房饭':
    print(c, out.get(c))
