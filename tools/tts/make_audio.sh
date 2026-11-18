#!/bin/bash
# Record every word and example sentence with the local Kokoro voice, then publish them as small .m4a files.
#   1) tools/tts/make_list.py  → tools/tts/list.tsv (id <tab> text), only texts without a recording yet
#   2) say.py renders wav/<id>.wav
#   3) afconvert (built into macOS) → app/audio/<id>.m4a, and app/audio/index.json maps text → id
set -e
cd "$(dirname "$0")"
python3 -I make_list.py
.venv/bin/python say.py --batch list.tsv wav 2>&1 | grep -E '^[0-9]+ ' || true
mkdir -p ../../app/audio
for f in wav/*.wav; do
  id=$(basename "$f" .wav)
  [ -f "../../app/audio/$id.m4a" ] || afconvert -f m4af -d aac -b 40000 "$f" "../../app/audio/$id.m4a"
done
python3 -I make_list.py --index
echo done
