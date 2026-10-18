// Which scales fit a chord, worked out from pitch-class sets alone: nothing here is a table of "this scale goes with that chord".
// A chord (or scale, or key) is a set of the 12 pitch classes, and a scale is judged against a chord by two counts:
//   cover - the share of the chord's notes the scale contains (a scale that leaves out the chord's third does not describe it)
//   clash - the scale notes, not in the chord, that sit a semitone ABOVE one of its guide tones - the third and the seventh, the notes
//           that say what kind of chord it is (a sus chord's suspended note, a bare fifth's fifth, when there are none). That
//           minor-9th rub is what makes the classic "avoid notes", like a major chord's 4th over its 3rd. A rub against the root or
//           the fifth is the b9 or b13 colour of a dominant chord and is not counted.
//   fit   = cover x (1 - clash / scale size)      0..1
// Two lists come out of it, both ranked by fit and cut at MIN_FIT:
//   scalesInKey   - the key's own scales: those that start on the key's tonic and whose notes all belong to the key's material,
//                   ranked by how well they fit the chord
//   chordScales   - scales on the chord's own root, ranked by fit x the share of the scale inside the key's material
// The key's material is the key's seven notes plus any note the chords of the progression bring with them (the G# of an E7 in A minor,
// the b7s of a blues): the notes the music actually uses, not only the ones its key signature names.
import { SCALES, SC, MAJ, MIN, tag } from './music.js';

/** A scale must reach this fit to be listed: the chord keeps at least 60% of its notes after the rub is paid for. */
export const MIN_FIT = 0.6;

/** @typedef {import('./types.js').Key} Key */
/**
 * @typedef {object} Fit
 * @property {import('./types.js').Scale} s
 * @property {number} root pitch class the scale starts on
 * @property {number[]} abs the scale's pitch classes from its root
 * @property {number} cover
 * @property {number} clash
 * @property {number} score
 * @property {number} inKey share of the scale's notes inside the key
 * @property {number[]} blue the scale's minor 3rd when the chord's third is major: the blue note, which rubs against the third on purpose and can be bent up to it
 */

/** The key's material: its seven notes and every note of the chords given. @param {Key} key @param {{root:number, iv:number[]}[]} [chords] the chords of the progression @returns {Set<number>} */
export function keyNotes(key, chords = []) {
  const set = new Set((key.mode === 'major' ? MAJ : MIN).map(x => (x + key.t) % 12));
  for (const c of chords) for (const p of chordNotes(c)) set.add(p);
  return set;
}

/** @param {{root:number, iv:number[]}} chord @returns {Set<number>} */
export const chordNotes = chord => new Set(chord.iv.map(x => (chord.root + x) % 12));

/** The notes whose identity a scale must not rub against: third, seventh (sus note, else fifth). @param {{root:number, iv:number[]}} chord @returns {Set<number>} */
export function guideNotes(chord) {
  const roles = tag(chord.iv);
  /** @param {string[]} names */
  const pick = names => roles.filter(([, d]) => names.includes(d)).map(([t]) => (chord.root + t) % 12);
  const g = pick(['third', 'seventh']);
  return new Set(g.length ? g : pick(['sus', 'fifth']));
}

/** Judge one scale on one root against a chord. @param {{root:number, iv:number[]}} chord @param {import('./types.js').Scale} s @param {number} root @param {Set<number>} K key material @returns {Fit} */
export function fitOf(chord, s, root, K) {
  const X = chordNotes(chord), G = guideNotes(chord);
  const abs = s.iv.map(x => (x + root) % 12), A = new Set(abs);
  let have = 0, clash = 0;
  for (const p of X) if (A.has(p)) have++;
  for (const p of A) if (!X.has(p) && G.has((p + 11) % 12)) clash++;
  const cover = have / X.size, minor3 = (chord.root + 3) % 12;
  return {
    s, root, abs, cover, clash, score: cover * (1 - clash / A.size), inKey: abs.filter(p => K.has(p)).length / abs.length,
    blue: X.has((chord.root + 4) % 12) && A.has(minor3) ? [minor3] : [],
  };
}

/** @param {Fit} a @param {Fit} b */
const byFit = (a, b) => b.score - a.score || b.inKey - a.inKey;

/**
 * Scales on the chord's own root, best first: how well the scale describes the chord, weighed by how much of it is in the key's material.
 * @param {{root:number, iv:number[]}} chord @param {Key} key @param {{root:number, iv:number[]}[]} [chords] the whole progression @returns {Fit[]}
 */
export function chordScales(chord, key, chords = [chord]) {
  const K = keyNotes(key, chords);
  return SCALES.map(s => { const f = fitOf(chord, s, chord.root, K); return { ...f, score: f.score * f.inKey }; }).filter(f => f.score >= MIN_FIT).sort(byFit);
}

/**
 * The key's own scales: scales that start on the key's tonic and whose notes all lie in the key's material (A minor, A minor pentatonic and
 * A harmonic minor in A minor), best fit to the chord first.
 * @param {{root:number, iv:number[]}} chord @param {Key} key @param {{root:number, iv:number[]}[]} [chords] the whole progression @returns {Fit[]}
 */
export function scalesInKey(chord, key, chords = [chord]) {
  const K = keyNotes(key, chords);
  return SCALES.map(s => fitOf(chord, s, key.t, K)).filter(f => f.inKey === 1 && f.score >= MIN_FIT).sort(byFit);
}

/** The id a chosen scale is stored under: the scale's id, with "@root" when it does not start on the chord's root. @param {string} id @param {number} root @param {number} chordRoot @returns {string} */
export const pickId = (id, root, chordRoot) => (root === chordRoot ? id : `${id}@${root}`);

/** Read a stored scale choice back. @param {string|undefined} pick @param {number} chordRoot @returns {{id:string, root:number}|null} */
export function readPick(pick, chordRoot) {
  const m = String(pick ?? '').match(/^([a-z0-9]+)(?:@(\d|1[01]))?$/);
  if (!m || !SC[m[1]]) return null;
  return { id: m[1], root: m[2] === undefined ? chordRoot : +m[2] };
}
