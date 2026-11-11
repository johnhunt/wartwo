#!/usr/bin/env python3
"""Check every pre-rendered voice clip is intelligible by transcribing it with
Whisper and comparing against the script. Lists the worst lines.

  pip install faster-whisper numpy    (plus ffmpeg on PATH)
  python tools/qa-voices.py [--model small.en] [--worst 25]
"""
import argparse, collections, difflib, json, os, re, subprocess
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load(p):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-f', 's16le', '-ac', '1', '-ar', '16000', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--model', default='small.en'); ap.add_argument('--worst', type=int, default=25); a = ap.parse_args()
    from faster_whisper import WhisperModel
    m = WhisperModel(a.model, device='cpu', compute_type='int8')
    lines = json.loads(subprocess.run(['node', os.path.join(ROOT, 'tools', 'export-lines.mjs')], capture_output=True, text=True, check=True).stdout)
    norm = lambda s: re.sub(r'[^a-z ]', '', s.lower().replace('-', ' ')).split()
    res = []
    for L in lines:
        p = os.path.join(ROOT, 'assets', 'voice', 'kw'[L['f']], f"{L['role']}_{L['kind']}_{L['i']}.mp3")
        segs, _ = m.transcribe(load(p), beam_size=5, language='en')
        heard = ' '.join(s.text for s in segs).strip()
        res.append((difflib.SequenceMatcher(None, norm(L['text']), norm(heard)).ratio(), 'kw'[L['f']] + '/' + L['role'], f"{L['kind']}_{L['i']}", L['text'], heard))
    by = collections.defaultdict(list)
    for r in res: by[r[1]].append(r[0])
    for k, v in sorted(by.items()): print(f"{k:12s} mean {np.mean(v):.2f}  clear {sum(s >= 0.8 for s in v)}/{len(v)}")
    print(f"overall: {sum(r[0] >= 0.8 for r in res)}/{len(res)} clear")
    for r in sorted(res)[:a.worst]: print(f"{r[0]:.2f} {r[1]}_{r[2]}  want {r[3]!r}  heard {r[4]!r}")

if __name__ == '__main__':
    main()
