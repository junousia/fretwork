// Chord identification: from the notes marked on a fretboard (one fret or
// "muted" per string) to the chord names that fit. Pure functions, no DOM.
import { CHORDS, tag, chordLabel } from './music.js';

/** @typedef {import('./types.js').Tuned} Tuned */

/**
 * @typedef {object} ChordMatch
 * @property {number} root
 * @property {string} suffix   key of CHORDS
 * @property {string} name     e.g. "Am7/G"
 * @property {string} label    e.g. "Minor 7th"
 * @property {number|null} bass  bass pitch class when it is not the root (slash chord), else null
 * @property {string[]} omitted  chord tones that are not played, e.g. ["5th"]
 * @property {number[]} tones   all chord tones as pitch classes
 * @property {boolean} exact    every chord tone is played
 * @property {number} score     higher is a better fit
 */

// Conventional root spellings (flats for the flat keys, F# for the sharp one).
export const ROOT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_ROOTS = new Set([1, 3, 5, 8, 10]);
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Note name spelled to suit a chord rooted on `root`. @param {number} pc @param {number} root @returns {string} */
export const noteNameIn = (pc, root) => (FLAT_ROOTS.has(root) ? FLAT_NAMES : SHARP_NAMES)[((pc % 12) + 12) % 12];

// Chord types considered: every CHORDS entry except names that are aliases of
// another entry with the same notes (6=maj6, add9=add2, aug7=7#5, and 11, which
// without a 3rd is really 9sus4).
const ALIASES = new Set(['maj6', 'add2', '7#5', '11']);
// Tones a chord may contain without them counting as chord tones (nothing is lost
// when they are absent): the 11th that sits in most 13th-chord voicings, and the
// sharp 11th of a major 13th.
/** @type {Record<string, number[]>} */
const TOLERATED = { '13': [5], 'm13': [5], 'maj13': [6] };

/** @type {{suffix:string, iv:number[], tolerated:number[]}[]} */
const CANDIDATES = [
  ...Object.keys(CHORDS).filter(s => !ALIASES.has(s)).map(suffix => ({ suffix, iv: CHORDS[suffix], tolerated: TOLERATED[suffix] ?? [] })),
  // The dominant 11th WITH its 3rd (R 3 5 b7 9 11), as played in most voicings.
  // CHORDS['11'] is the third-less version, which is really a 9sus4.
  { suffix: '11', iv: [0, 4, 7, 10, 2, 5], tolerated: [] },
];

/** Name of an omitted chord tone, in the context of its chord. @param {number[]} iv @param {number} t @returns {string} */
function omittedName(iv, t) {
  const h = (/** @type {number} */ n) => iv.includes(n);
  switch (t) {
    case 0: return 'root';
    case 1: return '\u266d9';
    case 2: return h(5) && !h(3) && !h(4) ? '2nd' : '9th';
    case 3: return h(4) ? '\u266f9' : '3rd';
    case 4: return '3rd';
    case 5: return h(3) || h(4) ? '11th' : '4th';
    case 6: return h(7) ? '\u266f11' : '\u266d5';
    case 7: return '5th';
    case 8: return h(7) ? '\u266d13' : '\u266f5';
    case 9: return h(10) || h(11) ? '13th' : h(6) && h(3) ? '\u266d\u266d7' : '6th';
    default: return '7th';
  }
}

/**
 * How much it hurts to leave a chord tone out. Leaving out the 5th is normal,
 * the root is common in jazz voicings, but the 3rd or 7th define the chord, and
 * in a short chord (add9, 6, ...) the added tone is the whole point.
 * @param {number[]} iv @param {number} t interval of the omitted tone @returns {number}
 */
function omitPenalty(iv, t) {
  const role = tag(iv).find(([x]) => x === t)?.[1];
  switch (role) {
    case 'root': return 3;
    case 'fifth': return t === 7 ? 0.5 : 6;     // a flat/sharp 5th is what makes dim/aug
    case 'third': case 'sus': return 6;
    case 'seventh': return 5;
    default: return iv.length <= 4 ? 6 : 1.5;   // ninth / eleventh / thirteenth
  }
}

/**
 * The chords that fit a set of notes, best first.
 * @param {number[]} pcs pitch classes that are played
 * @param {number|null} bass pitch class of the lowest note; null when it means nothing (re-entrant tuning), so no slash chords
 * @param {number} [limit]
 * @returns {ChordMatch[]}
 */
export function identifyChord(pcs, bass, limit = 8) {
  const played = new Set(pcs.map(p => ((p % 12) + 12) % 12));
  if (played.size < 2) return [];
  /** @type {ChordMatch[]} */
  const out = [];
  for (let root = 0; root < 12; root++) {
    for (const { suffix, iv, tolerated } of CANDIDATES) {
      const tones = iv.map(t => (root + t) % 12);
      const toneSet = new Set([...tones, ...tolerated.map(t => (root + t) % 12)]);
      if (![...played].every(p => toneSet.has(p))) continue; // a played note the chord does not contain
      const missing = iv.filter((t, i) => !played.has(tones[i]));
      let score = 10 - 0.15 * iv.length;
      for (const t of missing) score -= omitPenalty(iv, t);
      const slash = bass !== null && bass !== root;
      if (slash) score -= 0.8;
      const rootName = ROOT_NAMES[root];
      out.push({
        root, suffix, tones, exact: missing.length === 0, score,
        name: rootName + suffix + (slash ? '/' + noteNameIn(bass, root) : ''),
        label: chordLabel(suffix),
        bass: slash ? bass : null,
        omitted: missing.map(t => omittedName(iv, t)),
      });
    }
  }
  out.sort((a, b) => b.score - a.score || a.tones.length - b.tones.length || a.name.localeCompare(b.name));
  const good = out.filter(m => m.score >= 2.5);
  return (good.length ? good : out.slice(0, 3)).slice(0, limit);
}

/**
 * The sounding notes of a set of marks (one fret per string, -1 muted).
 * @param {number[]} frets @param {Tuned} inst
 * @returns {{midi:number[], pcs:number[], bass:number|null}} bass = pitch class of the lowest sounding note, or null
 *   when there are no notes or the tuning is re-entrant (a high G on a ukulele is not a bass note)
 */
export function marksToNotes(frets, inst) {
  const midi = frets.map((f, j) => (f >= 0 ? inst.midi[j] + f : null)).filter(/** @returns {m is number} */ m => m !== null);
  if (!midi.length) return { midi: [], pcs: [], bass: null };
  const n = inst.midi.length, reentrant = n > 1 && inst.midi[n - 1] > inst.midi[n - 2];
  return { midi, pcs: [...new Set(midi.map(m => m % 12))], bass: reentrant ? null : Math.min(...midi) % 12 };
}
