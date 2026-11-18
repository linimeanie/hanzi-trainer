"""Render Chinese text to audio with the open Kokoro voice model (Apache-2.0), fully on this laptop.

Usage:  .venv/bin/python say.py out_dir "text1" "text2" ...     (writes out_dir/<n>.wav)
        .venv/bin/python say.py --batch list.tsv out_dir          (lines: id <tab> text)
"""
import sys, pathlib, warnings
warnings.filterwarnings('ignore')
import soundfile as sf
from kokoro import KPipeline, KModel
import torch

REPO = 'hexgrad/Kokoro-82M-v1.1-zh'
VOICE = 'zf_001'
model = KModel(repo_id=REPO).eval()
zh = KPipeline(lang_code='z', repo_id=REPO, model=model)


def speed(n):  # single words a little slower, sentences natural
    return 0.85 if n <= 4 else 1.0


def render(text, path):
    chunks = [a for _, _, a in zh(text, voice=VOICE, speed=speed(len(text)))]
    audio = torch.cat([torch.as_tensor(c) for c in chunks]).numpy() if chunks else None
    if audio is not None:
        sf.write(path, audio, 24000)


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[0] == '--batch':
        src, out = pathlib.Path(args[1]), pathlib.Path(args[2]); out.mkdir(parents=True, exist_ok=True)
        lines = [l.split('\t', 1) for l in src.read_text(encoding='utf-8').splitlines() if '\t' in l]
        for i, (key, text) in enumerate(lines):
            p = out / f'{key}.wav'
            if not p.exists():
                render(text, p)
            if i % 100 == 0:
                print(i, len(lines), flush=True)
    else:
        out = pathlib.Path(args[0]); out.mkdir(parents=True, exist_ok=True)
        for i, t in enumerate(args[1:]):
            render(t, out / f'{i}.wav')
