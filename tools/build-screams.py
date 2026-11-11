#!/usr/bin/env python3
"""Build the recorded death screams in assets/sfx/death/ from free sound packs
(see CREDITS.md for authors and licences). Download and extract the packs into
one folder, then:

  python tools/build-screams.py /path/to/packs

Kingdom screams are the human recordings, cleaned and normalised. Warband
screams use the monster death cries plus human screams put through the same
orc treatment as the Warband voices (pitch/formant down, growl, grit).
"""
import importlib.util, os, subprocess, sys, tempfile
import numpy as np, soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('rv', os.path.join(ROOT, 'tools', 'render-voices.py'))
rv = importlib.util.module_from_spec(spec); spec.loader.exec_module(rv)

HM = ['x_michelbaradari-human/player/deathh.wav', 'x_michelbaradari-human/player/die1.wav', 'x_michelbaradari-human/player/die2.wav'] + [f'x_aargh/aargh{i}.ogg' for i in range(8)]
HF = [f'x_female_screams/{i}.ogg' for i in range(1, 5)] + ['1_dying.ogg']
MON = [f'x_michelbaradari-monsters/monster/death{c}.wav' for c in 'bders']
ORC = dict(pitch=0.78, growl=0.2, drive=1.6)
ORCESS = dict(pitch=0.86, growl=0.1, drive=1.3)
POOLS = {
    'human_m': [(f, None) for f in HM],
    'human_f': [(f, None) for f in HF],
    'orc_m': [(f, None) for f in MON] + [(f, ORC) for f in HM[:3] + HM[3:8]],
    'orc_f': [(f, ORCESS) for f in HF],
}

def main(src):
    out = os.path.join(ROOT, 'assets', 'sfx', 'death'); os.makedirs(out, exist_ok=True)
    tmp = tempfile.mkdtemp()
    for pool, items in POOLS.items():
        for i, (f, fx) in enumerate(items):
            a, b = os.path.join(tmp, 'a.wav'), os.path.join(tmp, 'b.wav')
            graph = rv.effects(fx) if fx else '[0:a]highpass=f=70,lowpass=f=10500[out]'
            rv.ffmpeg(['-i', os.path.join(src, f), '-filter_complex', graph, '-map', '[out]', '-ac', '1', '-ar', '22050', a])
            x, sr = sf.read(a, dtype='float32')
            sf.write(b, rv.trim_norm(x), sr)
            dst = os.path.join(out, f'{pool}_{i}.mp3')
            rv.ffmpeg(['-i', b, '-c:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', '-ar', '22050', dst])
            print(dst[len(ROOT) + 1:], '<-', f, '(orc fx)' if fx else '')
    print({p: len(v) for p, v in POOLS.items()})

if __name__ == '__main__':
    main(sys.argv[1])
