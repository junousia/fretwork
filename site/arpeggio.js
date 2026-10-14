// Arpeggios: chord tones laid out within a position or around a voicing.
// Pure functions (no DOM, no audio) so they can be unit tested.
import { CHORDS } from './music.js';

/** @typedef {import('./types.js').Voicing} Voicing */
/** @typedef {import('./types.js').FretSets} FretSets */
/** @typedef {import('./types.js').Tuned} Tuned */

// Per-string frets (0..maxFret) whose note belongs to `chordPcs`, limited to
// the fret window [lo, hi] (inclusive).
/** @param {Tuned} inst @param {number[]} chordPcs @param {number} lo @param {number} hi @returns {FretSets} */
function chordToneFrets(inst, chordPcs, lo, hi) {
  const want = new Set(chordPcs);
  return inst.tuning.map(pc => {
    /** @type {Set<number>} */
    const set = new Set();
    for (let f = Math.max(0, lo); f <= hi; f++) if (want.has((pc + f) % 12)) set.add(f);
    return set;
  });
}

// The "arpeggio shape" around a voicing: every chord tone within the fret
// window the voicing occupies, widened by `pad` frets each side (so the
// outer chord tones one fret away from the voicing are included - what
// players call the arpeggio shape that goes with that chord shape).
/** @param {Voicing} voicing @param {Tuned} inst @param {number[]} chordPcs @param {number} [pad] @returns {FretSets} */
export function arpeggioAround(voicing, inst, chordPcs, pad = 1) {
  const played = voicing.f.filter(f => f > 0);
  const lo = played.length ? Math.min(...played) - pad : 0;
  const hi = (played.length ? Math.max(...played) : 3) + pad;
  // an open-position voicing keeps the nut in the window
  return chordToneFrets(inst, chordPcs, voicing.f.some(f => f === 0) ? 0 : lo, hi);
}

// The chord tones among the notes of a scale position (per-string frets).
/** @param {FretSets} sets @param {Tuned} inst @param {number[]} chordPcs @returns {FretSets} */
export function arpeggioInSets(sets, inst, chordPcs) {
  const want = new Set(chordPcs);
  return sets.map((set, j) => new Set([...set].filter(f => want.has((inst.tuning[j] + f) % 12))));
}

// Sorted unique MIDI pitches of per-string frets: the notes of the arpeggio,
// low to high, ready to play.
/** @param {FretSets} sets @param {Pick<Tuned, 'midi'>} inst @returns {number[]} */
export function arpeggioNotes(sets, inst) {
  /** @type {Set<number>} */
  const out = new Set();
  sets.forEach((set, j) => set.forEach(f => out.add(inst.midi[j] + f)));
  return [...out].sort((a, b) => a - b);
}

// Up then back down, without repeating the top note.
/** @type {(notes:number[]) => number[]} */
export const upAndDown = notes => [...notes, ...notes.slice(0, -1).reverse()];

// The chord stacked in thirds on scale degree `k` of a seven-note scale:
// returns {root (semitones above the scale root), iv (chord intervals), name
// suffix key in CHORDS or null, numeral}.
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/** @param {number[]} scaleIv @param {number} k degree index 0-6 @param {boolean} [sevenths] @returns {{root:number, iv:number[], key:string|null, numeral:string}|null} */
export function degreeChord(scaleIv, k, sevenths = false) {
  const iv = [...new Set(scaleIv)].sort((a, b) => a - b);
  if (iv.length !== 7) return null;
  /** @param {number} n */
  const at = n => (iv[(k + n) % 7] - iv[k] + 12) % 12;
  const chord = [0, at(2), at(4), ...(sevenths ? [at(6)] : [])];
  const key = Object.keys(CHORDS).find(s => CHORDS[s].length === chord.length && chord.every(x => CHORDS[s].includes(x)) && s !== 'maj6' && s !== 'add2') ?? null;
  const major = chord.includes(4);
  const dim = chord.includes(3) && chord.includes(6);
  const aug = chord.includes(8) && chord.includes(4);
  const numeral = (major || aug ? NUMERALS[k] : NUMERALS[k].toLowerCase()) + (dim ? '°' : aug ? '+' : '');
  return { root: iv[k], iv: chord, key, numeral };
}
