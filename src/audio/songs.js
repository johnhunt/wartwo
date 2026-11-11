// Original score for Wartwo. Each song is a lead melody plus chord chart per
// section; the arranger in music.js derives bass, harp/lute arpeggios, pads,
// drones, harmony and percussion from these, and the `order` list decides which
// layers play on each pass so every song builds and varies as it goes.
//
// Melody tokens: NOTE+OCTAVE '.' length-in-16ths (e.g. "F#4.2"), "R.4" = rest.
// Chords: scale degree 1-7 (diatonic triad), suffix M = major, m = minor, p = open fifth.
// Bars are 16 sixteenths (4/4) or 12 (6/8).

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
};

export const SONGS = {
  // ------------------------------------------------------------------ title
  title: {
    title: 'The Iron Tide', gain: 1.8, bpm: 84, sig: 16, root: 'D', mode: 'dorian',
    inst: { lead: 'brass', lead2: 'strings', harm: 'horn', pad: 'strings', bass: 'bass', arp: 'harp', drone: 'organ', oct: 'lowbrass' },
    bassPat: 'halves', arpPat: 'up8', drums: 'processional',
    sections: {
      A: {
        chords: '1 1 7 7 1 3 7 1',
        mel: ['D4.4 A4.8 G4.2 A4.2', 'F4.4 E4.4 D4.8', 'C4.4 G4.8 F4.2 G4.2', 'E4.12 R.4',
          'D4.4 A4.6 B4.2 C5.4', 'A4.8 F4.4 G4.4', 'E4.4 G4.4 C5.4 B4.2 G4.2', 'A4.4 D5.12'],
      },
      B: {
        chords: '4 4 3 7 1 5 4 5M',
        mel: ['B4.4 D5.4 G5.8', 'F5.4 E5.4 D5.4 B4.4', 'C5.4 A4.4 F4.8', 'G4.4 C5.4 E5.8',
          'D5.6 E5.2 F5.4 D5.4', 'E5.8 C5.4 A4.4', 'B4.4 D5.4 G4.4 B4.4', 'A4.4 C#5.4 E5.8'],
      },
      C: {
        chords: '1 4 3 7 1 4 5M 1',
        mel: ['F5.8 E5.4 D5.4', 'B4.8 G4.8', 'A4.4 C5.4 F5.4 E5.4', 'E5.12 C5.4',
          'D5.4 F5.4 A5.8', 'G5.4 F5.4 E5.4 D5.4', 'C#5.8 E5.4 A5.4', 'D5.16'],
      },
    },
    order: [['A', 'pad drone timp'], ['A', 'lead pad bass drone timp'], ['B', 'lead2 harm arp bass drums'], ['A', 'lead harm pad arp bass drums timp'],
      ['C', 'lead2 oct pad arp bass drums timp fill'], ['B', 'lead harm pad arp bass drums timp'], ['A', 'lead oct pad bass drone drums timp fill']],
  },

  // ------------------------------------------------------------------ kingdom
  banners: {
    title: 'Banners of Vale', gain: 1.2, bpm: 116, sig: 16, root: 'G', mode: 'mixolydian',
    inst: { lead: 'recorder', lead2: 'brass', harm: 'flute', pad: 'strings', bass: 'pizz', arp: 'lute', drone: 'hurdy', oct: 'bass' },
    bassPat: 'march', arpPat: 'lute8', drums: 'march',
    sections: {
      A: {
        chords: '1 1 4 1 1 7 4 1',
        mel: ['G4.2 A4.2 B4.4 D5.4 B4.4', 'C5.2 B4.2 A4.4 G4.8', 'E5.4 D5.2 C5.2 D5.4 E5.4', 'D5.8 B4.4 G4.4',
          'G4.2 A4.2 B4.4 D5.4 G5.4', 'F5.4 E5.2 D5.2 C5.4 A4.4', 'G4.2 A4.2 C5.4 E5.4 D5.2 C5.2', 'B4.4 A4.4 G4.8'],
      },
      B: {
        chords: '4 4 1 1 7 7 5 1',
        mel: ['G5.4 E5.4 C5.4 E5.4', 'F5.4 E5.4 D5.4 C5.4', 'D5.4 B4.4 G4.4 B4.4', 'D5.12 R.4',
          'C5.4 A4.4 F4.4 A4.4', 'C5.4 D5.4 E5.4 F5.4', 'D5.4 F5.4 A5.4 F5.4', 'G5.12 R.4'],
      },
      C: {
        chords: '6 6 4 1 6 5 4 1',
        mel: ['E5.6 D5.2 C5.4 B4.4', 'A4.8 C5.4 E5.4', 'C5.4 E5.4 G5.4 F5.2 E5.2', 'D5.8 G4.8',
          'A4.2 B4.2 C5.4 E5.4 A5.4', 'A5.4 G5.4 F5.4 D5.4', 'E5.4 C5.4 D5.2 E5.2 F5.4', 'G5.16'],
      },
    },
    order: [['A', 'drums bass'], ['A', 'lead arp bass drums'], ['A', 'lead harm arp bass drone drums fill'], ['B', 'lead2 pad arp bass drums'],
      ['A', 'lead harm pad arp bass drums'], ['C', 'lead pad arp bass drone drums fill'], ['B', 'lead2 harm pad arp bass drums'], ['A', 'lead lead2 harm arp bass drums fill']],
  },

  highway: {
    title: "The King's Highway", gain: 2.0, bpm: 132, sig: 12, root: 'A', mode: 'aeolian',
    inst: { lead: 'flute', lead2: 'harp', harm: 'strings', pad: 'strings', bass: 'bass', arp: 'harp', drone: 'organ', oct: 'horn' },
    bassPat: 'six', arpPat: 'harp6', drums: 'pastoral',
    sections: {
      A: {
        chords: '1 7 6 7 1 7 6 5M',
        mel: ['A4.4 C5.2 E5.4 C5.2', 'D5.4 B4.2 G4.4 B4.2', 'C5.4 A4.2 F4.4 A4.2', 'B4.4 D5.2 G5.6',
          'A5.4 G5.2 E5.4 C5.2', 'D5.4 E5.2 D5.4 B4.2', 'C5.4 B4.2 A4.4 F4.2', 'B4.4 G#4.2 E4.6'],
      },
      B: {
        chords: '6 3 7 1 6 3 4 5M',
        mel: ['F5.6 E5.4 D5.2', 'E5.6 C5.6', 'D5.4 B4.2 G4.4 B4.2', 'A4.12',
          'A5.4 G5.2 F5.4 A5.2', 'G5.4 E5.2 C5.6', 'D5.4 F5.2 A5.4 F5.2', 'E5.12'],
      },
    },
    order: [['A', 'arp drone'], ['A', 'lead arp bass drone'], ['B', 'lead pad arp bass drums'], ['A', 'lead2 harm pad bass drums'],
      ['B', 'lead harm pad arp bass drums'], ['A', 'lead oct pad arp bass drone drums'], ['B', 'lead2 pad arp bass'], ['A', 'lead harm arp drone']],
  },

  siege: {
    title: 'Siege at Dawn', gain: 1.8, bpm: 104, sig: 16, root: 'E', mode: 'aeolian',
    inst: { lead: 'brass', lead2: 'horn', harm: 'horn', pad: 'strings', bass: 'bass', arp: 'harpsi', drone: 'organ', oct: 'lowbrass' },
    bassPat: 'drive', arpPat: 'ost16', drums: 'siege',
    sections: {
      A: {
        chords: '1 1 6 6 4 4 5M 5M',
        mel: ['E4.8 G4.4 B4.4', 'A4.8 G4.4 F#4.4', 'E4.4 G4.4 C5.8', 'B4.12 R.4',
          'A4.4 C5.4 E5.8', 'D5.4 C5.4 B4.4 A4.4', 'B4.8 D#5.8', 'F#5.12 R.4'],
      },
      B: {
        chords: '6 7 1 1 6 7 5M 5M',
        mel: ['E5.4 G5.4 E5.4 C5.4', 'F#5.4 A5.4 F#5.4 D5.4', 'G5.8 E5.8', 'B4.16',
          'C5.4 E5.4 G5.6 F#5.2', 'F#5.8 D5.8', 'D#5.4 F#5.4 B5.8', 'B4.16'],
      },
    },
    order: [['A', 'arp drone timp'], ['A', 'lead arp bass timp drums'], ['A', 'lead harm pad arp bass drums timp fill'], ['B', 'lead2 oct arp bass drums timp'],
      ['A', 'lead oct pad arp bass drums timp'], ['B', 'lead harm pad arp bass drums timp fill'], ['A', 'lead2 pad arp drone timp']],
  },

  // ------------------------------------------------------------------ warband
  ashbone: {
    title: 'Ash and Bone', gain: 1.0, bpm: 92, sig: 16, root: 'D', mode: 'phrygian',
    inst: { lead: 'shawm', lead2: 'lowbrass', harm: 'shawm', pad: 'choir', bass: 'bass', arp: 'lute', drone: 'hurdy', oct: 'lowbrass' },
    bassPat: 'halves', arpPat: 'pulse8', drums: 'warband',
    sections: {
      A: {
        chords: '1p 1p 2 1p 1p 7 2 1p',
        mel: ['D4.4 D4.2 F4.2 A4.4 G4.4', 'F4.4 Eb4.4 D4.8', 'Eb4.4 G4.4 Bb4.4 A4.4', 'G4.4 F4.4 Eb4.4 D4.4',
          'D5.4 C5.2 Bb4.2 A4.8', 'C5.4 Bb4.2 A4.2 G4.8', 'Eb4.2 F4.2 G4.4 F4.4 Eb4.4', 'D4.12 R.4'],
      },
      B: {
        chords: '6 6 7 7 6 7 2 1p',
        mel: ['F5.8 D5.4 Bb4.4', 'D5.4 C5.4 Bb4.4 A4.4', 'G4.8 C5.8', 'Bb4.4 A4.4 G4.8',
          'D5.4 F5.4 D5.4 Bb4.4', 'C5.4 Eb5.4 G5.8', 'F5.4 Eb5.4 D5.4 Eb5.4', 'D5.16'],
      },
    },
    order: [['A', 'drums drone'], ['A', 'lead drums drone bass'], ['B', 'lead2 pad bass drums'], ['A', 'lead harm pad arp bass drums fill'],
      ['B', 'lead oct pad arp bass drums'], ['A', 'lead2 pad drone drums'], ['A', 'lead harm oct pad arp bass drums fill']],
  },

  wardrums: {
    title: 'War Drums of the Wastes', gain: 0.65, bpm: 132, sig: 16, root: 'C', mode: 'aeolian',
    inst: { lead: 'shawm', lead2: 'brass', harm: 'lowbrass', pad: 'choir', bass: 'bass', arp: 'harpsi', drone: 'hurdy', oct: 'lowbrass' },
    bassPat: 'drive', arpPat: 'ost16', drums: 'warpound',
    sections: {
      A: {
        chords: '1 1 6 7 1 1 6 5M',
        mel: ['C5.2 C5.2 Eb5.4 G5.4 Eb5.4', 'F5.4 Eb5.2 D5.2 C5.8', 'Ab4.4 C5.4 Eb5.4 C5.4', 'Bb4.4 D5.4 F5.8',
          'G5.2 G5.2 F5.4 Eb5.4 D5.4', 'Eb5.4 D5.2 C5.2 G4.8', 'Ab4.4 C5.4 F5.4 Eb5.4', 'D5.4 B4.4 G4.8'],
      },
      B: {
        chords: '6 6 3 3 4 4 5 5M',
        mel: ['Ab4.8 C5.8', 'Eb5.4 D5.4 C5.8', 'Bb4.8 G4.8', 'Eb4.16',
          'F4.4 Ab4.4 C5.8', 'Bb4.4 Ab4.4 G4.8', 'G4.4 Bb4.4 D5.8', 'B4.8 D5.8'],
      },
    },
    order: [['A', 'drums bass'], ['A', 'lead bass drums'], ['A', 'lead harm arp bass drums fill'], ['B', 'lead2 oct pad bass drums'],
      ['A', 'lead harm pad arp bass drums'], ['B', 'lead2 harm pad arp bass drums fill'], ['A', 'lead lead2 oct arp bass drums fill']],
  },

  burning: {
    title: 'The Burning', gain: 1.1, bpm: 72, sig: 16, root: 'B', mode: 'aeolian',
    inst: { lead: 'choir', lead2: 'bell', harm: 'choir', pad: 'strings', bass: 'bass', arp: 'harp', drone: 'organ', oct: 'lowbrass' },
    bassPat: 'roots', arpPat: 'up8', drums: 'dirge',
    sections: {
      A: {
        chords: '1 6 4 5 1 6 7 1',
        mel: ['B4.8 F#4.8', 'G4.4 A4.4 B4.8', 'E4.8 G4.4 B4.4', 'A4.8 F#4.8',
          'D5.8 C#5.4 B4.4', 'B4.4 A4.4 G4.8', 'C#5.8 E5.8', 'B4.16'],
      },
      B: {
        chords: '4 4 1 1 6 6 5M 5M',
        mel: ['E5.8 G5.8', 'F#5.4 E5.4 D5.8', 'D5.8 B4.8', 'C#5.4 D5.4 B4.8',
          'B4.8 D5.8', 'G5.4 F#5.4 E5.4 D5.4', 'C#5.8 A#4.8', 'F#4.16'],
      },
    },
    order: [['A', 'drone drums'], ['A', 'lead drone bass drums'], ['B', 'lead2 pad bass drums'], ['A', 'lead harm pad arp bass drums'],
      ['B', 'lead oct pad arp bass drums'], ['A', 'lead2 pad drone']],
  },

  // ------------------------------------------------------------------ lobby / tavern
  tavern: {
    title: 'The Cracked Tankard', gain: 1.4, bpm: 168, sig: 12, root: 'D', mode: 'mixolydian',
    inst: { lead: 'fiddle', lead2: 'recorder', harm: 'flute', pad: 'hurdy', bass: 'pizz', arp: 'lute', drone: 'hurdy', oct: 'bass' },
    bassPat: 'six', arpPat: 'jig6', drums: 'jig',
    sections: {
      A: {
        chords: '1 1 7 7 1 1 4 1',
        mel: ['A4.2 D5.2 F#5.2 A5.2 F#5.2 D5.2', 'E5.2 F#5.2 E5.2 D5.2 B4.2 A4.2', 'G4.2 C5.2 E5.2 G5.2 E5.2 C5.2', 'D5.2 E5.2 D5.2 C5.2 A4.2 G4.2',
          'F#4.2 A4.2 D5.2 F#5.4 E5.2', 'D5.2 C5.2 A4.2 B4.2 A4.2 F#4.2', 'G4.2 B4.2 D5.2 C5.2 B4.2 A4.2', 'A4.2 F#4.2 E4.2 D4.6'],
      },
      B: {
        chords: '4 4 1 1 7 7 5 1',
        mel: ['B4.2 D5.2 G5.2 G5.2 F#5.2 G5.2', 'A5.2 G5.2 F#5.2 E5.2 D5.2 B4.2', 'A4.2 D5.2 F#5.2 A5.2 F#5.2 D5.2', 'E5.2 D5.2 C5.2 B4.2 A4.2 F#4.2',
          'G4.2 C5.2 E5.2 G5.2 E5.2 C5.2', 'E5.2 G5.2 E5.2 D5.2 C5.2 A4.2', 'A4.2 C5.2 E5.2 D5.2 C5.2 A4.2', 'D5.6 R.6'],
      },
    },
    order: [['A', 'lead bass arp'], ['A', 'lead harm arp bass drums'], ['B', 'lead arp bass drums'], ['B', 'lead2 harm arp bass drone drums'],
      ['A', 'lead2 lead arp bass drums'], ['B', 'lead harm arp bass drone drums']],
  },

  // ------------------------------------------------------------------ stingers
  victory: {
    title: 'Victory', gain: 0.9, bpm: 96, sig: 16, root: 'D', mode: 'ionian', loop: false,
    inst: { lead: 'brass', lead2: 'brass', harm: 'horn', pad: 'strings', bass: 'bass', arp: 'harp', drone: 'organ', oct: 'lowbrass' },
    bassPat: 'roots', arpPat: 'up8', drums: 'processional',
    sections: {
      A: {
        chords: '1 4 5 1 6 4 5 1',
        mel: ['D4.2 F#4.2 A4.4 D5.8', 'B4.4 G4.4 B4.2 D5.2 G5.4', 'A4.4 C#5.4 E5.4 A5.4', 'F#5.12 R.4',
          'B4.4 D5.4 F#5.4 B5.4', 'G5.4 E5.2 D5.2 B4.4 G4.4', 'A4.4 C#5.4 E5.2 G5.2 C#5.4', 'D5.16'],
      },
    },
    order: [['A', 'lead harm oct pad arp bass drums timp fill']],
  },
  defeat: {
    title: 'Defeat', gain: 1.6, bpm: 60, sig: 16, root: 'D', mode: 'aeolian', loop: false,
    inst: { lead: 'choir', lead2: 'choir', harm: 'strings', pad: 'strings', bass: 'bass', arp: 'harp', drone: 'organ', oct: 'lowbrass' },
    bassPat: 'roots', arpPat: 'up8', drums: 'dirge',
    sections: {
      A: {
        chords: '1 6 4 5M 1 1',
        mel: ['A4.8 F4.8', 'F4.8 D4.8', 'G4.8 Bb4.8', 'A4.8 C#5.8', 'D5.16', 'R.16'],
      },
    },
    order: [['A', 'lead harm pad bass drone timp']],
  },
};

// drum patterns: one string per drum key (see DRUM_KEYS in fm.js); X = accent, x = normal, r = flam
export const GROOVES = {
  processional: { main: { k: 'X.......x.......', s: '....x.......x.x.' }, fill: { k: 'X.......x.......', s: '....x...x.x.rrrr', y: '...............x' } },
  march: { main: { k: 'X.......X.......', s: '..x.x.x...x.x.xx', h: 'x...x...x...x...' }, fill: { k: 'X.......X...X...', s: 'x.x.x.x.xxxxrrrr', h: 'x...x...x.......' } },
  pastoral: { main: { b: 'X.....x.....', h: '...x.....x..' }, fill: { b: 'X.....x.x.x.', h: '...x..xxxxxx' } },
  siege: { main: { k: 'X...X...X..xX...', s: '....x.......x...', x: 'x.x.x.x.x.x.x.x.' }, fill: { k: 'X...X...X.x.xxxx', s: '....x...x.xxrrrr', y: 'x...............' } },
  warband: { main: { K: 'X..x..X...X..x..', t: '....x.......x.x.', T: '......x.......x.', o: '..x...x...x...x.' }, fill: { K: 'X..x..X.X.X.X.X.', t: '....x...x.x.xxxx', T: '......x.x.x.xxxx' } },
  warpound: { main: { K: 'X.x.X.x.X.x.X.xx', t: '..x...x...x...x.', c: '....X.......X...', x: 'x.x.x.x.x.x.x.x.' }, fill: { K: 'X.x.X.x.X.xxXxXx', t: '..x...x.xxxxrrrr', c: '....X...X.X.X.XX' } },
  dirge: { main: { K: 'X.......x.......', t: '........x.......' }, fill: { K: 'X.......x...x.x.', t: '........x.x.xxxx' } },
  jig: { main: { b: 'X.xx.xX.xx.x', o: '..x..x..x..x' }, fill: { b: 'X.xx.xX.xxxx', o: 'xxx..xxxxxxx' } },
};

export const PLAYLISTS = {
  menu: ['title'],
  lobby: ['tavern'],
  kingdom: ['banners', 'highway', 'siege', 'title'],
  warband: ['ashbone', 'wardrums', 'burning'],
};
