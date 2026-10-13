// Arpeggios: chord tones laid out within a position or around a fingering.
// Pure functions (no DOM, no audio) so they can be unit tested.
import { CHORDS } from './theory.js';

// Per-string frets (0..maxFret) whose note belongs to `chordPcs`, limited to
// the fret window [lo, hi] (inclusive).
function chordToneFrets(inst, chordPcs, lo, hi) {
  const want = new Set(chordPcs);
  return inst.tuning.map(pc => {
    const set = new Set();
    for (let f = Math.max(0, lo); f <= hi; f++) if (want.has((pc + f) % 12)) set.add(f);
    return set;
  });
}

// The "arpeggio shape" around a fingering: every chord tone within the fret
// window the fingering occupies, widened by `pad` frets each side (so the
// outer chord tones one fret away from the fingering are included - what
// players call the arpeggio shape that goes with that chord shape).
export function arpeggioAround(voicing, inst, chordPcs, pad = 1) {
  const played = voicing.f.filter(f => f > 0);
  const lo = played.length ? Math.min(...played) - pad : 0;
  const hi = (played.length ? Math.max(...played) : 3) + pad;
  // an open-position fingering keeps the nut in the window
  return chordToneFrets(inst, chordPcs, voicing.f.some(f => f === 0) ? 0 : lo, hi);
}

// The chord tones among the notes of a scale position (per-string frets).
export function arpeggioInSets(sets, inst, chordPcs) {
  const want = new Set(chordPcs);
  return sets.map((set, j) => new Set([...set].filter(f => want.has((inst.tuning[j] + f) % 12))));
}

// Sorted unique MIDI pitches of per-string frets: the notes of the arpeggio,
// low to high, ready to play.
export function arpeggioNotes(sets, inst) {
  const out = new Set();
  sets.forEach((set, j) => set.forEach(f => out.add(inst.midi[j] + f)));
  return [...out].sort((a, b) => a - b);
}

// Up then back down, without repeating the top note.
export const upAndDown = notes => [...notes, ...notes.slice(0, -1).reverse()];

// The chord stacked in thirds on scale degree `k` of a seven-note scale:
// returns {root (semitones above the scale root), iv (chord intervals), name
// suffix key in CHORDS or null, numeral}.
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
export function degreeChord(scaleIv, k, sevenths = false) {
  const iv = [...new Set(scaleIv)].sort((a, b) => a - b);
  if (iv.length !== 7) return null;
  const at = n => (iv[(k + n) % 7] - iv[k] + 12) % 12;
  const chord = [0, at(2), at(4), ...(sevenths ? [at(6)] : [])];
  const key = Object.keys(CHORDS).find(s => CHORDS[s].length === chord.length && chord.every(x => CHORDS[s].includes(x)) && s !== 'maj6' && s !== 'add2') ?? null;
  const major = chord.includes(4);
  const dim = chord.includes(3) && chord.includes(6);
  const aug = chord.includes(8) && chord.includes(4);
  const numeral = (major || aug ? NUMERALS[k] : NUMERALS[k].toLowerCase()) + (dim ? '°' : aug ? '+' : '');
  return { root: iv[k], iv: chord, key, numeral };
}
