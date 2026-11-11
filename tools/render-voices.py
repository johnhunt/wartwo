#!/usr/bin/env python3
"""Pre-render all unit and narrator speech to assets/voice/ with the Kokoro-82M
neural TTS (Apache-2.0, https://huggingface.co/hexgrad/Kokoro-82M).

  pip install kokoro soundfile numpy   (Python 3.10-3.12, plus ffmpeg with rubberband)
  python tools/render-voices.py [--only k/worker] [--force]

Each unit type gets its own voice. Warband (orc) voices are pitched and
formant-shifted down, layered with a sub-octave growl and lightly driven.
"""
import json, os, subprocess, sys, tempfile, argparse
import numpy as np, soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'voice')
SR = 24000

# voice, speed, pitch (1 = unchanged), sub-octave growl level, drive, echo
CAST = {
    (0, 'worker'):   dict(voice='bm_lewis',    speed=1.05),
    (0, 'soldier'):  dict(voice='bm_george',   speed=1.0),
    (0, 'archer'):   dict(voice='bf_emma',     speed=1.03),
    (0, 'knight'):   dict(voice='bm_fable',    speed=0.95, pitch=0.94, keep_formant=True),
    (0, 'siege'):    dict(voice='am_puck',     speed=1.1),
    (0, 'narrator'): dict(voice='bm_daniel',   speed=0.93, echo='hall'),
    (1, 'worker'):   dict(voice='am_eric',     speed=1.0,  pitch=0.80, growl=0.15, drive=1.5),
    (1, 'soldier'):  dict(voice='am_onyx',     speed=0.95, pitch=0.70, growl=0.32, drive=2.2),
    (1, 'archer'):   dict(voice='bf_isabella', speed=1.0,  pitch=0.84, growl=0.12, drive=1.4),
    (1, 'knight'):   dict(voice='am_fenrir',   speed=1.05, pitch=0.78, growl=0.2,  drive=1.8),
    (1, 'siege'):    dict(voice='am_michael',  speed=1.0,  pitch=0.82, growl=0.18, drive=1.6),
    (1, 'narrator'): dict(voice='am_onyx',     speed=0.88, pitch=0.66, growl=0.3,  drive=1.8, echo='cave'),
}

def ffmpeg(args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y'] + args, check=True)

def effects(c):
    p = c.get('pitch', 1.0)
    fx = []
    if p != 1.0:
        fmt = 'preserved' if c.get('keep_formant') else 'shifted'
        fx.append(f'rubberband=pitch={p}:formant={fmt}')
    chain = ','.join(fx) if fx else 'anull'
    g = c.get('growl', 0)
    if g:  # layer a copy an octave lower for a throaty growl
        graph = (f'[0:a]asplit=2[a][b];[a]{chain}[m];'
                 f'[b]rubberband=pitch={p / 2}:formant=shifted,volume={g}[s];'
                 f'[m][s]amix=inputs=2:normalize=0')
    else:
        graph = f'[0:a]{chain}'
    d = c.get('drive', 0)
    if d:
        graph += f',equalizer=f=220:t=q:w=1:g=3,volume={d},asoftclip=type=tanh,volume={1 / d ** 0.5:.3f}'
    e = c.get('echo')
    if e == 'hall': graph += ',aecho=0.85:0.5:45|90:0.22|0.12'
    if e == 'cave': graph += ',aecho=0.8:0.6:70|160|260:0.3|0.2|0.12'
    graph += ',highpass=f=70,lowpass=f=10500'
    return graph + '[out]'

def trim_norm(x):
    thr = 0.012 * np.max(np.abs(x))
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx): x = x[max(0, idx[0] - 1100): idx[-1] + 3300]   # keep soft onsets (s, f, h) and tails
    rms = np.sqrt(np.mean(x ** 2)) + 1e-9
    x = x * (0.12 / rms)                       # common loudness
    pk = np.max(np.abs(x))
    if pk > 0.95: x = x * (0.95 / pk)          # never clip
    fade = min(240, len(x) // 4); x[:fade] *= np.linspace(0, 1, fade); x[-fade:] *= np.linspace(1, 0, fade)
    return x.astype(np.float32)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--only'); ap.add_argument('--force', action='store_true'); a = ap.parse_args()
    from kokoro import KPipeline
    lines = json.loads(subprocess.run(['node', os.path.join(ROOT, 'tools', 'export-lines.mjs')], capture_output=True, text=True, check=True).stdout)
    pipes = {}
    tmp = tempfile.mkdtemp()
    done = 0
    for L in lines:
        fdir = 'kw'[L['f']]
        if a.only and a.only != f"{fdir}/{L['role']}": continue
        c = CAST[(L['f'], L['role'])]
        path = os.path.join(OUT, fdir, f"{L['role']}_{L['kind']}_{L['i']}.mp3")
        if os.path.exists(path) and not a.force: continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        lang = c['voice'][0]
        if lang not in pipes: pipes[lang] = KPipeline(lang_code=lang, repo_id='hexgrad/Kokoro-82M')
        audio = np.concatenate([np.asarray(chunk) for _, _, chunk in pipes[lang](L['text'], voice=c['voice'], speed=c['speed'])])
        raw, fx = os.path.join(tmp, 'raw.wav'), os.path.join(tmp, 'fx.wav')
        sf.write(raw, audio, SR)
        ffmpeg(['-i', raw, '-filter_complex', effects(c), '-map', '[out]', '-ac', '1', '-ar', '22050', fx])
        x, sr = sf.read(fx, dtype='float32')
        sf.write(raw, trim_norm(x), sr)
        ffmpeg(['-i', raw, '-c:a', 'libmp3lame', '-b:a', '56k', '-ac', '1', '-ar', '22050', path])
        done += 1
        print(f"{done:4d} {path[len(ROOT) + 1:]:45s} {L['text']}", flush=True)
    print('rendered', done)

if __name__ == '__main__':
    main()
