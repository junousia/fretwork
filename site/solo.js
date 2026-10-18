// Solo generator (pure, seeded): fills a tab with a melodic line over the bar
// chords. It is a rule-based phrase generator, not a performer - the rules are
// the ones taught for improvising over changes:
//   * play notes from a scale that fits the chord (or the key, for blues), inside
//     one fretboard position, so every note is reachable;
//   * start each bar on a chord tone and land chord tones on the strong beats;
//   * move mostly by step, sometimes skip, rarely leap - and answer a leap with
//     a step back;
//   * lead into a chord change with an approach note a scale step from a chord
//     tone of the NEXT chord;
//   * repeat a rhythm (and its shape) so the line sounds intentional, vary it
//     in the middle, and end on the root of the last chord.
// The same seed always gives the same solo.
import { SC, CHORDS, parseChord, detectKey, isDominantish } from './music.js';
import { chordScales, readPick } from './scalefit.js';
import { getPositions, positionFrets } from './positions.js';
import { STEPS, BEAT, linkedNext } from './tab.js';

/** @typedef {import('./types.js').TabNote} TabNote */
/** @typedef {{t:number, mode:'major'|'minor'}} Key */

export const STYLES = [
  { id: 'follow', name: 'Follow the chords' },
  { id: 'pent', name: 'Pentatonic' },
  { id: 'blues', name: 'Blues' },
];
export const DENSITIES = [
  { id: 'sparse', name: 'Sparse' },
  { id: 'medium', name: 'Medium' },
  { id: 'busy', name: 'Busy' },
];

/** How the line is felt. Every feel is a set of one-bar rhythms in 48ths of a bar (a quarter is 12). */
export const FEELS = [
  { id: 'straight', name: 'Straight eighths' },
  { id: 'shuffle', name: 'Shuffle / swing' },
  { id: 'triplet', name: 'Triplets (12/8)' },
  { id: 'funk', name: 'Sixteenths (funk)' },
  { id: 'mixed', name: 'Mixed (jazz)' },
];

/**
 * How much the line leans on chord tones. Real jazz solos (Weimar Jazz Database, measured 2026-10-14) land on a chord tone
 * (1-3-5-7) on only about half of their strong beats - hardly more than on the weak ones. 'free' behaves like that, 'safe' is the
 * textbook rule (nearly every strong beat is a chord tone) and 'balanced' sits between.
 * snap: chance a strong beat is moved onto a chord tone; first: chance the first note of a chord is a chord tone.
 */
export const TENSIONS = [
  { id: 'safe', name: 'Mostly chord tones', snap: 1, first: 1 },
  { id: 'balanced', name: 'Balanced', snap: 0.15, first: 0.8 },
  { id: 'free', name: 'Free', snap: 0, first: 0.4 },
];

/** Rhythms written in sixteenths ([start, length]; gaps are rests), scaled to the 48-step bar. @param {number[][]} r @returns {number[][]} */
const x3 = r => r.map(([a, l]) => [a * 3, l * 3]);
/**
 * A bar made of four beats, each one of: P = a long-short pair (a triplet quarter then a triplet eighth - the
 * shuffle), T = three triplet eighths, Q = a quarter, L = just the long half of a pair, R = a rest.
 * @param {string} beats e.g. 'PPQL' @returns {number[][]}
 */
function fromBeats(beats) {
  /** @type {number[][]} */ const out = [];
  [...beats].forEach((c, i) => {
    const b = i * 12;
    if (c === 'P') out.push([b, 8], [b + 8, 4]);
    else if (c === 'T') out.push([b, 4], [b + 4, 4], [b + 8, 4]);
    else if (c === 'Q') out.push([b, 12]);
    else if (c === 'L') out.push([b, 8]);
  });
  return out;
}

/** @typedef {{sparse:number[][][], medium:number[][][], busy:number[][][]}} RhythmPool */
/** @type {Record<string, RhythmPool>} */
export const RHYTHMS = {
  straight: {
    sparse: [
      [[0, 4], [4, 2], [6, 2], [8, 8]],
      [[0, 6], [6, 2], [8, 4], [12, 4]],
      [[0, 8], [8, 4], [12, 4]],
      [[0, 4], [6, 2], [8, 4], [12, 2], [14, 2]],
      [[0, 2], [4, 4], [8, 6], [14, 2]],
    ].map(x3),
    medium: [
      [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
      [[0, 3], [3, 3], [6, 2], [8, 2], [10, 2], [12, 4]],
      [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 2], [14, 2]],
      [[0, 4], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
      [[0, 2], [2, 2], [4, 2], [8, 2], [10, 2], [12, 4]],
    ].map(x3),
    busy: [
      [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
      [[0, 2], [2, 2], [4, 1], [5, 1], [6, 1], [7, 1], [8, 2], [10, 2], [12, 1], [13, 1], [14, 1], [15, 1]],
      [[0, 1], [1, 1], [2, 1], [3, 1], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
      [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
    ].map(x3),
  },
  shuffle: {
    sparse: ['QPQL', 'LRQP', 'QQPR', 'QLQP'].map(fromBeats),
    medium: ['PPQP', 'PLPQ', 'QPPP', 'PPPL'].map(fromBeats),
    busy: ['PPPP', 'PTPP', 'PPPT', 'PPTP'].map(fromBeats),
  },
  triplet: {
    sparse: ['QTQR', 'TRQQ', 'QQTL', 'QRTQ'].map(fromBeats),
    medium: ['TTQT', 'TQTT', 'TTTQ', 'QTTT'].map(fromBeats),
    busy: ['TTTT', 'TPTT', 'TTPT', 'TTTP'].map(fromBeats),
  },
  funk: {
    sparse: [
      [[0, 2], [3, 1], [6, 2], [10, 3], [14, 2]],
      [[0, 3], [4, 2], [8, 3], [12, 1], [14, 2]],
      [[2, 2], [6, 2], [8, 1], [11, 1], [14, 2]],
      [[0, 1], [3, 3], [8, 2], [11, 1], [14, 1]],
    ].map(x3),
    medium: [
      [[0, 1], [2, 1], [4, 2], [6, 1], [8, 2], [10, 1], [12, 2], [14, 1]],
      [[0, 2], [3, 1], [4, 1], [6, 2], [8, 1], [11, 1], [12, 2], [14, 2]],
      [[0, 1], [3, 1], [4, 2], [7, 1], [8, 2], [10, 2], [12, 1], [15, 1]],
      [[0, 1], [2, 1], [3, 1], [6, 2], [8, 1], [10, 1], [11, 1], [14, 2]],
    ].map(x3),
    busy: [
      [[0, 1], [1, 1], [3, 1], [4, 1], [6, 1], [7, 1], [8, 1], [9, 1], [11, 1], [12, 1], [14, 1], [15, 1]],
      [[0, 1], [2, 1], [3, 1], [4, 1], [6, 1], [8, 1], [10, 1], [11, 1], [12, 1], [14, 1], [15, 1]],
      [[0, 1], [1, 1], [2, 1], [4, 1], [5, 1], [6, 1], [8, 1], [9, 1], [10, 1], [12, 1], [13, 1], [14, 1]],
      [[0, 2], [2, 1], [3, 1], [4, 1], [5, 1], [8, 2], [10, 1], [11, 1], [12, 1], [13, 1], [14, 2]],
    ].map(x3),
  },
};
/**
 * The 'mixed' feel: bars built beat by beat from the rhythms real jazz lines use - quarters, eighths on and off the beat, sixteenth runs,
 * triplets, dotted figures, held notes and rests - with weights tuned so the onset positions match real solos (on the beat about 40%,
 * off-beat eighths 25%, triplet positions 13%, sixteenth positions 19%), about 25% of beats without a new note, and 4.7 / 6.6 / 9 notes
 * a bar for sparse / medium / busy. A pool of distinct bars is made once, from a fixed seed, so the generator stays deterministic.
 * @type {Record<string, number[][]>}
 */
const BEAT_TOKENS = {
  Q: [[0, 12]], H: [], R: [], E1: [[0, 6]], O1: [[6, 6]], E2: [[0, 6], [6, 6]], S4: [[0, 3], [3, 3], [6, 3], [9, 3]],
  S2E: [[0, 3], [3, 3], [6, 6]], ES2: [[0, 6], [6, 3], [9, 3]], SES: [[0, 3], [3, 6], [9, 3]], T3: [[0, 4], [4, 4], [8, 4]], DS: [[0, 9], [9, 3]],
};
/** @type {Record<string, Record<string, number>>} */
const TOKEN_WEIGHTS = {
  sparse: { Q: .22, H: .19, R: .12, E1: .05, O1: .09, E2: .11, S4: 0, S2E: .01, ES2: .02, SES: .02, T3: .10, DS: .07 },
  medium: { Q: .10, H: .13, R: .09, E1: .04, O1: .09, E2: .20, S4: .03, S2E: .04, ES2: .06, SES: .05, T3: .11, DS: .06 },
  busy: { Q: .03, H: .06, R: .04, E1: .03, O1: .07, E2: .20, S4: .09, S2E: .08, ES2: .09, SES: .08, T3: .16, DS: .07 },
};
/** @param {string} density @returns {number[][][]} */
function mixedPool(density) {
  const w = TOKEN_WEIGHTS[density], total = Object.values(w).reduce((a, b) => a + b, 0), r = rng(7919 + density.length * 31);
  const pickToken = () => { let x = r() * total; for (const [k, v] of Object.entries(w)) { x -= v; if (x <= 0) return k; } return 'Q'; };
  /** @type {number[][][]} */ const pool = [], seen = new Set();
  for (let tries = 0; pool.length < 40 && tries < 400; tries++) {
    /** @type {number[][]} */ const bar = [];
    let held = false;
    for (let beat = 0; beat < 4; beat++) {
      let t = pickToken();
      if (beat === 0 && t === 'H') t = 'Q';                         // a bar starts with a note
      if (t === 'H' || (t === 'R' && r() < 0.5)) { // hold: the previous note rings on through this beat; a rest leaves a gap
        if (bar.length && t === 'H') { bar[bar.length - 1] = [bar[bar.length - 1][0], Math.min(STEPS - bar[bar.length - 1][0], bar[bar.length - 1][1] + 12)]; held = true; }
        continue;
      }
      for (const [at, len] of BEAT_TOKENS[t]) bar.push([beat * 12 + at, len]);
    }
    void held;
    if (bar.length < 2) continue;
    // a held note must not run into the next one: shorten to the next onset
    for (let i = 0; i + 1 < bar.length; i++) bar[i][1] = Math.min(bar[i][1], bar[i + 1][0] - bar[i][0]);
    const key = JSON.stringify(bar);
    if (!seen.has(key)) { seen.add(key); pool.push(bar); }
  }
  return pool;
}

/** The last bar of a solo: a run into a long final note, per feel (the sparse one is simpler). @type {Record<string, {sparse:number[][], normal:number[][]}>} */
export const FINALS = {
  mixed: { sparse: [[0, 12], [12, 12], [24, 24]], normal: [[0, 6], [6, 6], [12, 4], [16, 4], [20, 4], [24, 24]] },
  straight: { sparse: [[0, 12], [12, 12], [24, 24]], normal: [[0, 6], [6, 6], [12, 6], [18, 6], [24, 24]] },
  shuffle: { sparse: [[0, 12], [12, 12], [24, 24]], normal: [[0, 8], [8, 4], [12, 8], [20, 4], [24, 24]] },
  triplet: { sparse: [[0, 12], [12, 12], [24, 24]], normal: [[0, 4], [4, 4], [8, 4], [12, 12], [24, 24]] },
  funk: { sparse: [[0, 12], [12, 12], [24, 24]], normal: [[0, 3], [6, 3], [12, 3], [18, 3], [24, 24]] },
};

RHYTHMS.mixed = { sparse: mixedPool('sparse'), medium: mixedPool('medium'), busy: mixedPool('busy') };

/** Small seeded generator (mulberry32). @param {number} seed @returns {() => number} */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * @typedef {object} SoloOptions
 * @property {{chords:{at:number, name:string, scale?:string, positions?:number[]}[]}[]} bars chord markers per bar (a bar without a marker at step 0 continues the previous chord)
 * @property {{midi:number[], tuning:number[]}} inst open-string MIDI notes and pitch classes, top string first (capo included)
 * @property {string} style  'follow' | 'pent' | 'blues'
 * @property {string} density 'sparse' | 'medium' | 'busy'
 * @property {string} [feel] 'straight' | 'shuffle' | 'triplet' | 'funk' (default straight)
 * @property {string} [evolve] 'off' (default) | 'build' | 'arc': the solo develops over the song (see `intensityAt`)
 * @property {string} [tension] 'safe' | 'balanced' (default) | 'free': how much the line leans on chord tones (see TENSIONS)
 * @property {number} [rests] 0-1 chance that a beat (after the first) is left without a new note in the pooled feels; default 0.14 (the 'mixed' feel has its own rests)
 * @property {string} [techniques] 'off' (default) | 'some' | 'lots': hammer-ons, pull-offs, slides, bends and vibrato
 * @property {number} seed
 * @property {Key} [key] default: detected from the chords, else A minor
 */
/**
 * One stretch of a bar played over one chord, with the scale and position used for it.
 * @typedef {object} SegmentInfo
 * @property {number} bar
 * @property {number} from       first step (inclusive)
 * @property {number} to         last step (exclusive)
 * @property {string} chord
 * @property {number[]} chordPcs
 * @property {string} scaleId
 * @property {number} root       pitch class the scale is built on
 * @property {number[]} scalePcs
 * @property {number} position   1-based position number
 * @property {Set<number>[]} frets the notes of that position, per string
 * @property {number} intensity  0-1: how far the solo has built up at this bar (1 for every bar when evolve is off)
 */

/** @param {number[]} iv @returns {boolean} */
const minorish = iv => iv.includes(3) && !iv.includes(4);
/** A plain triad/7th family chord (no sus, alterations, dim or aug). @param {number[]} iv @returns {boolean} */
const plain = iv => !iv.includes(5) && !iv.includes(2) && !(iv.includes(6) && iv.includes(7)) && !iv.includes(8) && (iv.includes(3) || iv.includes(4));

/**
 * Which scale (and root) the generator picks by itself over a chord.
 * @param {string} style @param {{root:number, iv:number[]}} chord @param {Key} key @param {boolean} dominants any chord in the piece is a dominant 7th
 * @param {{root:number, iv:number[]}[]} chords every chord of the piece (the key's material includes their notes)
 * @returns {{scaleId:string, root:number}}
 */
function autoScale(style, chord, key, dominants, chords) {
  if (style === 'blues') return { scaleId: key.mode === 'minor' || dominants ? 'blues' : 'majblues', root: key.t };
  if (style === 'pent' && plain(chord.iv)) {
    return { scaleId: minorish(chord.iv) || isDominantish(chord.iv) ? 'minpent' : 'majpent', root: chord.root };
  }
  const best = chordScales(chord, key, chords)[0];
  return { scaleId: best ? best.s.id : 'minpent', root: chord.root };
}

/** How the solo develops. */
export const EVOLVES = [
  { id: 'off', name: 'Steady' },
  { id: 'gentle', name: 'Gentle arc' },
  { id: 'arc', name: 'Arc (up, then settle)' },
  { id: 'build', name: 'Build up' },
];
/** How strongly a solo develops: real solos get ~10% busier and ~1 semitone higher mid-way on average, which is 'gentle'. @param {string} evolve @returns {number} */
export const strengthOf = evolve => (evolve === 'gentle' ? 0.4 : evolve === 'arc' || evolve === 'build' ? 1 : 0);

/**
 * How built-up the solo is at a bar, 0-1: it drives the register (which position), how busy the rhythm is (up to the
 * chosen density) and how often techniques appear. 'build' rises all the way to the last bar before the ending;
 * 'arc' rises to a peak about two thirds in and then settles; the last bar always comes down a little.
 * @param {string} evolve @param {number} bar @param {number} bars @returns {number}
 */
export function intensityAt(evolve, bar, bars) {
  if (evolve !== 'build' && evolve !== 'arc' && evolve !== 'gentle') return 1;
  const x = bars > 1 ? bar / (bars - 1) : 0.5;
  const i = evolve === 'build' ? 0.15 + 0.85 * x : x <= 0.7 ? 0.15 + 0.85 * (x / 0.7) : 1 - 0.7 * ((x - 0.7) / 0.3);
  return bars > 1 && bar === bars - 1 ? Math.min(i, 0.4) : Math.max(0.1, Math.min(1, i));
}

/**
 * The scale and root played over a chord: the one chosen on its marker, else the automatic choice.
 * @param {string} style @param {{root:number, iv:number[]}} chord @param {{scale?:string}|undefined} pref @param {Key} key @param {boolean} dominants @param {{root:number, iv:number[]}[]} [chords] every chord of the piece
 * @returns {{scaleId:string, root:number, auto:boolean}}
 */
export function scaleFor(style, chord, pref, key, dominants, chords = [chord]) {
  const chosen = readPick(pref?.scale, chord.root);
  if (chosen) return { scaleId: chosen.id, root: chosen.root, auto: false };
  return { ...autoScale(style, chord, key, dominants, chords), auto: true };
}

/**
 * The key and whether any chord is a dominant 7th, as the generator will use them.
 * @param {{chords:{name:string}[]}[]} bars @param {string} style @param {Key} [keyOpt]
 * @returns {{key:Key, dominants:boolean, chords:{root:number, iv:number[]}[]}}
 */
export function soloContext(bars, style, keyOpt) {
  const known = bars.flatMap(b => b.chords).map(c => parseChord(c.name)).filter(/** @returns {c is NonNullable<ReturnType<typeof parseChord>>} */ c => !!c);
  // A blues starts on its I chord, so for the blues style that chord is the tonic (key detection can pick the IV or V of a 12-bar).
  const bluesTonic = style === 'blues' && known.length ? { t: known[0].root, mode: /** @type {'major'|'minor'} */ (minorish(known[0].iv) ? 'minor' : 'major') } : null;
  const key = keyOpt || bluesTonic || (known.length ? detectKey(known) : null) || { t: 9, mode: /** @type {'minor'} */ ('minor') };
  return { key, dominants: known.some(c => isDominantish(c.iv)), chords: known };
}

/**
 * Leave some beats without a new note: the beat's notes are dropped and either the previous note is held through it or it
 * stays a rest. The first beat of a bar, and bars with fewer than three notes, are left alone.
 * @param {number[][]} rhythm @param {number} p chance per beat @param {() => number} rand @returns {number[][]}
 */
function thin(rhythm, p, rand) {
  const out = rhythm.map(x => [...x]);
  for (let beat = 1; beat < 4; beat++) {
    if (out.length <= 3 || rand() >= p) continue;
    const inBeat = out.filter(([at]) => at >= beat * 12 && at < beat * 12 + 12);
    if (!inBeat.length) continue;
    const idxFirst = out.indexOf(inBeat[0]);
    for (const n of inBeat) out.splice(out.indexOf(n), 1);
    const prev = out[idxFirst - 1];
    if (prev && rand() < 0.5) { const nextAt = out[idxFirst] ? out[idxFirst][0] : STEPS; prev[1] = Math.min(prev[1] + 12, nextAt - prev[0]); } // held
  }
  return out;
}

/**
 * Generate a solo.
 * @param {SoloOptions} o
 * @returns {{bars:TabNote[][], info:SegmentInfo[], key:Key}}
 */
export function generateSolo(o) {
  const rand = rng(o.seed);
  const feel = o.feel && RHYTHMS[o.feel] ? o.feel : 'straight';
  const evolve = o.evolve === 'build' || o.evolve === 'arc' || o.evolve === 'gentle' ? o.evolve : 'off';
  const strength = strengthOf(evolve);
  const tn = TENSIONS.find(x => x.id === o.tension) || TENSIONS[1];
  const restChance = feel === 'mixed' ? 0 : Math.max(0, Math.min(1, o.rests ?? 0.14));
  const BANDS = /** @type {const} */ (['sparse', 'medium', 'busy']), peak = Math.max(0, BANDS.indexOf(/** @type {any} */ (o.density)));
  const pick = /** @template T @param {T[]} arr @returns {T} */ arr => arr[Math.floor(rand() * arr.length)];
  const nStr = o.inst.midi.length;
  // --- the chord in effect over every stretch of every bar ---
  const parsed = o.bars.map(b => b.chords.map(c => ({ ...c, chord: parseChord(c.name) })).filter(c => c.chord).sort((x, y) => x.at - y.at));
  const known = parsed.flat().map(c => /** @type {NonNullable<ReturnType<typeof parseChord>>} */ (c.chord));
  const { key, dominants, chords: allChords } = soloContext(o.bars, o.style, o.key);
  const tonic = { root: key.t, iv: key.mode === 'major' ? CHORDS[''] : CHORDS.m, name: '' };
  /** @typedef {{scale?:string, positions?:number[]}} Pref */
  /** @type {{bar:number, from:number, to:number, chord:{root:number, iv:number[], name:string}, pref:Pref}[]} */
  const segs = [];
  /** @type {{root:number, iv:number[], name:string}} */
  let current = known[0] ? { root: known[0].root, iv: known[0].iv, name: parsed.flat()[0].name } : tonic;
  /** @type {Pref} */ let curPref = parsed.flat()[0] ? { scale: parsed.flat()[0].scale, positions: parsed.flat()[0].positions } : {};
  parsed.forEach((marks, bar) => {
    const starts = [...(marks.length && marks[0].at === 0 ? [] : [{ at: 0, name: current.name, chord: null, scale: curPref.scale, positions: curPref.positions }]), ...marks];
    starts.forEach((m, i) => {
      if (m.chord) { current = { root: m.chord.root, iv: m.chord.iv, name: m.name }; curPref = { scale: m.scale, positions: m.positions }; }
      const to = i + 1 < starts.length ? starts[i + 1].at : STEPS;
      const prev = segs[segs.length - 1];
      if (prev && prev.bar === bar && prev.chord.name === current.name && JSON.stringify(prev.pref) === JSON.stringify(curPref)) prev.to = to; // same chord again: one stretch
      else if (to > m.at) segs.push({ bar, from: m.at, to, chord: current, pref: curPref });
    });
  });

  /** @type {TabNote[][]} */ const outBars = o.bars.map(() => []);
  /** @type {SegmentInfo[]} */ const info = [];
  let prevMidi = -1, prev2Midi = -1, prevFret = -1, prevString = -1, prevCenter = 7, prevPos = -1, prevScale = '', prevRoot = -1;
  /** @type {number[][][]} */ const rhythmOf = [];
  /** @type {number[][]|null} */ let motifRhythm = null;
  /** @type {number[]|null} */ let motifOffsets = null;
  let phraseRhythm = /** @type {number[][]} */ ([]);
  let dir = rand() < 0.5 ? 1 : -1, leapPending = false, lastSemis = 0;
  const lastBar = o.bars.length - 1;
  const reuse = feel === 'mixed' ? 0.08 : 0.35; // real bars almost never repeat their rhythm exactly (1%), so repeats are rare and loose

  segs.forEach((seg, si) => {
    const { bar, chord } = seg;
    const lastSeg = si === segs.length - 1;
    const { scaleId, root } = scaleFor(o.style, chord, seg.pref, key, dominants, allChords);
    const scale = SC[scaleId];
    // --- position: keep it while the scale stays, else the nearest one to the hand ---
    const positions = getPositions(scale.iv, root, o.inst.tuning);
    const sets = positions.map((_, k) => positionFrets(positions, k, scale.iv, root, o.inst.tuning, o.inst.midi));
    const centers = sets.map(s => { const all = s.flatMap(x => [...x]); return all.reduce((a, b) => a + b, 0) / Math.max(1, all.length); });
    // positions the user allowed for this chord (1-based); none given or none valid = any
    const allowed = (seg.pref.positions || []).map(n => n - 1).filter(k => k >= 0 && k < positions.length);
    const usable = allowed.length ? allowed : positions.map((_, k) => k);
    const inten = intensityAt(evolve, bar, o.bars.length);
    let pos;
    if (evolve !== 'off' && !allowed.length) { // the register follows the build-up: low early, high at the peak
      // full strength: low at the start of the build-up, high at its peak; gentle: only a little either way around the middle
      const lo = Math.min(...centers), hi = Math.max(...centers), target = lo + (0.5 + strength * (inten - 0.55) / 0.9) * (hi - lo);
      // move at most one position per bar while the scale stays (so the hand never has to jump), else stay near where it was
      const same = prevPos >= 0 && prevScale === scaleId && prevRoot === root;
      let pool = same ? usable.filter(k => Math.abs(k - prevPos) <= 1) : usable.filter(k => prevPos < 0 || Math.abs(centers[k] - prevCenter) <= 4);
      if (!pool.length) pool = usable;
      pos = pool.map(k => ({ k, d: Math.abs(centers[k] - target) })).sort((a, b) => a.d - b.d)[0].k;
    } else if (prevPos >= 0 && prevScale === scaleId && prevRoot === root && usable.includes(prevPos)) pos = prevPos;
    else {
      const order = usable.map(k => ({ k, d: Math.abs(centers[k] - prevCenter) })).sort((a, b) => a.d - b.d);
      pos = si === 0 && order.length > 1 && rand() < 0.4 ? order[1].k : order[0].k;
    }
    prevPos = pos; prevScale = scaleId; prevRoot = root; prevCenter = centers[pos];
    const fretSets = sets[pos];
    // --- the notes available: every pitch in the position, with each way to fret it ---
    /** @type {Map<number, {s:number, f:number}[]>} */ const byPitch = new Map();
    fretSets.forEach((set, s) => set.forEach(f => { const m = o.inst.midi[s] + f; byPitch.set(m, [...(byPitch.get(m) || []), { s, f }]); }));
    const pitches = [...byPitch.keys()].sort((a, b) => a - b);
    const chordPcs = [...new Set(chord.iv.map(x => (chord.root + x) % 12))];
    info.push({ bar, from: seg.from, to: seg.to, chord: chord.name, chordPcs, scaleId, root, scalePcs: [...new Set(scale.iv.map(x => (x + root) % 12))], position: positions[pos].n, frets: fretSets, intensity: inten });
    if (!pitches.length) return;
    const all = pitches.map((_, i) => i);
    const isTone = (/** @type {number} */ i) => chordPcs.includes(pitches[i] % 12);
    let tones = all.filter(isTone);
    if (!tones.length) tones = all.filter(i => pitches[i] % 12 === root % 12);
    if (!tones.length) tones = all;
    /** Indices of `list` nearest to idx, nearest first (ties go low). */
    const nearest = (/** @type {number[]} */ list, /** @type {number} */ idx) => [...list].sort((a, b) => Math.abs(a - idx) - Math.abs(b - idx) || a - b);
    const clampIdx = (/** @type {number} */ i) => Math.max(0, Math.min(pitches.length - 1, i));

    // --- rhythm for the bar (chosen once): a motif that comes back, with a different bar in the middle ---
    if (!rhythmOf[bar]) {
      const k = bar % 4, last = bar === lastBar;
      let r;
      if (last) r = (FINALS[feel] || FINALS.straight)[o.density === 'sparse' ? 'sparse' : 'normal'];
      else {
        // busier bars as the solo builds, up to the density that was asked for
        const eff = 1 - strength * (1 - inten);
        const band = BANDS[Math.min(peak, Math.round(eff * peak))];
        const pool = (RHYTHMS[feel] || RHYTHMS.straight)[band] || RHYTHMS.straight.medium;
        if (!pool.includes(phraseRhythm)) { motifRhythm = null; motifOffsets = null; } // the motif was from another band
        if (k === 0 || !pool.includes(phraseRhythm)) { phraseRhythm = pick(pool); motifRhythm = phraseRhythm; motifOffsets = null; r = phraseRhythm; }
        else if (k === 1) r = rand() < reuse ? phraseRhythm : pick(pool);
        else if (k === 2) r = pick(pool.filter(x => x !== phraseRhythm)) || phraseRhythm;
        else r = rand() < reuse * 0.7 ? phraseRhythm : pick(pool);
        // real solos leave space: now and then a beat gets no new note (the note before it rings on, or there is a rest)
        if (restChance > 0) r = thin(r, Math.min(0.6, restChance * (1 + 0.8 * strength * (1 - inten))), rand);
      }
      rhythmOf[bar] = r;
    }
    const barRhythm = rhythmOf[bar];
    const rhythm = barRhythm.filter(([at]) => at >= seg.from && at < seg.to);
    if (!rhythm.length) return;
    const wholeBar = seg.from === 0 && seg.to === STEPS;
    const replay = wholeBar && bar % 4 > 0 && bar !== lastBar && barRhythm === motifRhythm && motifOffsets !== null && rand() < 0.65;

    // --- pitches ---
    let idx = 0;
    if (prevMidi < 0) idx = nearest(tones, Math.floor(pitches.length / 2))[0];
    else pitches.forEach((p, i) => { if (Math.abs(p - prevMidi) < Math.abs(pitches[idx] - prevMidi)) idx = i; });
    const cur0 = idx; // where the previous note leaves us
    const sameAsPrev2 = (/** @type {number} */ i) => prev2Midi === pitches[i] && prevMidi === pitches[i];
    const nextSeg = segs[si + 1];
    const changing = !!nextSeg && (nextSeg.chord.root !== chord.root || nextSeg.chord.iv.join() !== chord.iv.join());
    /** @type {number[]} */ const idxs = [];
    const mid = (pitches.length - 1) / 2;
    /** One step of the ordinary walk: usually a step, sometimes a skip, rarely a leap; keeps its direction like real lines do, and
     *  after a leap (5 semitones or more) usually turns back by a step. */
    const walk = () => {
      let delta;
      if (leapPending && rand() < 0.7) { delta = 1; dir = lastSemis > 0 ? -1 : 1; leapPending = false; }
      else {
        leapPending = false;
        const pull = idx < mid - 2 ? 0.7 : idx > mid + 2 ? 0.3 : 0.5; // chance of going up
        dir = rand() < 0.8 ? dir : (rand() < pull ? 1 : -1);
        const r = rand();
        delta = r < 0.58 ? 1 : r < 0.80 ? 2 : r < 0.86 ? 0 : r < 0.94 ? 3 : 4;
      }
      let next = idx + dir * delta;
      if (next < 0 || next > pitches.length - 1) { dir = -dir; next = idx + dir * delta; }
      idx = clampIdx(next);
    };
    rhythm.forEach(([at], n) => {
      const strong = at % BEAT === 0, firstOn = n === 0, lastOn = n === rhythm.length - 1;
      // the walk is pulled gently back to the middle of the position so it does not drift to one end
      if (lastSeg && lastOn) { // the final note: the root of the last chord
        const rootIdx = all.filter(i => pitches[i] % 12 === chord.root % 12);
        idx = nearest(rootIdx.length ? rootIdx : tones, idx)[0];
      } else if (lastOn && changing && nextSeg) { // approach: a scale step from a chord tone of the next chord
        const nextPcs = new Set(nextSeg.chord.iv.map(x => (nextSeg.chord.root + x) % 12));
        const cand = all.filter(i => nextPcs.has(pitches[i] % 12));
        if (cand.length) {
          const target = nearest(cand, idx)[0];
          let side = idx > target ? 1 : idx < target ? -1 : (rand() < 0.5 ? 1 : -1);
          if (clampIdx(target + side) === idx) side = -side; // never "approach" by repeating the note
          idx = clampIdx(target + side);
        } else idx = nearest(tones, idx)[0];
      } else if (firstOn) {
        if (rand() < tn.first) { const near = nearest(tones, idx); idx = near.length > 1 && rand() < 0.3 ? near[1] : near[0]; }
        else walk();
      } else if (replay && motifOffsets && motifOffsets[n] !== undefined) {
        idx = clampIdx(idxs[0] + motifOffsets[n]);
        if (strong && !isTone(idx)) { const near = nearest(tones, idx)[0]; if (Math.abs(near - idx) <= 2) idx = near; }
      } else if (strong && rand() < tn.snap) { // land on a chord tone, a different one than we are on, one of the two nearest - the one in the direction we are going if there is one
        const near = nearest(tones, idx).filter(i => i !== idx);
        const ahead = near.filter(i => (i - idx) * dir > 0);
        idx = ahead.length && rand() < 0.65 ? ahead[0] : near.length > 1 && rand() < 0.35 ? near[1] : (near[0] ?? idx);
      } else walk();
      // never leap more than a major sixth, and never sound the same note three times running
      if (!(lastSeg && lastOn) && !(firstOn && prevMidi < 0)) {
        const fromPitch = n > 0 ? pitches[idxs[n - 1]] : prevMidi >= 0 ? prevMidi : pitches[cur0];
        for (let guard = 0; Math.abs(pitches[idx] - fromPitch) > 9 && guard < 40; guard++) {
          const nx = idx + (pitches[idx] > fromPitch ? -1 : 1);
          if (nx < 0 || nx > pitches.length - 1) break;
          idx = nx;
        }
        if (n >= 1 && idx === idxs[n - 1] && (n >= 2 ? idxs[n - 2] === idx : sameAsPrev2(idx))) idx = clampIdx(idx + (rand() < 0.5 ? 1 : -1));
      }
      { // remember a leap so the next step can turn back
        const before = n > 0 ? pitches[idxs[n - 1]] : prevMidi >= 0 ? prevMidi : pitches[cur0];
        lastSemis = pitches[idx] - before; leapPending = Math.abs(lastSemis) >= 5;
      }
      idxs.push(idx);
    });
    if (wholeBar && bar % 4 === 0 && bar !== lastBar) motifOffsets = idxs.map(i => i - idxs[0]);

    // --- fretting: the way to play each pitch that moves the hand least ---
    rhythm.forEach(([at, len], n) => {
      const opts = byPitch.get(pitches[idxs[n]]) || [];
      let best = opts[0], bc = Infinity;
      for (const c of opts) {
        const cost = prevFret < 0 ? Math.abs(c.f - prevCenter) : Math.abs(c.f - prevFret) + 1.5 * Math.abs(c.s - prevString);
        if (cost < bc) { bc = cost; best = c; }
      }
      if (!best || best.s >= nStr) return;
      outBars[bar].push({ at, len: Math.min(len, STEPS - at), s: best.s, f: best.f });
      prevFret = best.f; prevString = best.s; prev2Midi = prevMidi; prevMidi = pitches[idxs[n]];
    });
  });
  const level = o.techniques === 'lots' ? 2 : o.techniques === 'some' ? 1 : 0;
  if (level) addTechniques(outBars, info, o.style, o.inst.midi, level, rand, strength);
  return { bars: outBars, info, key };
}

/**
 * Guitar techniques, added after the notes are chosen. Only notes that suit them get them: a hammer-on or pull-off
 * / slide joins two neighbouring notes on one string a few frets apart; a bend is written one or two semitones LOWER
 * than the scale note it arrives at (so the sounding pitch stays in the scale and the position), on the high strings
 * of a guitar only; vibrato goes on long notes, and most often on the last one. No note takes part in two links.
 * @param {TabNote[][]} bars @param {SegmentInfo[]} info @param {string} style @param {number[]} midi open-string notes @param {number} level 1 some, 2 lots @param {() => number} rand @param {number} strength 0 steady .. 1: techniques are rarer early in the solo and more frequent at its peak
 */
function addTechniques(bars, info, style, midi, level, rand, strength) {
  const nStr = midi.length;
  // Jazz lines (the 'follow' style) use these far less than blues and rock lines: in the Weimar Jazz Database, 2% of notes have vibrato,
  // 2% a slide and 0.3% a bend. Blues and pentatonic keep the higher rates.
  const jazz = style === 'follow', tone = jazz ? { slide: 0.5, hammer: 0.6, vib: 0.7 } : { slide: 1, hammer: 1, vib: 1 };
  const pSlide = (level === 2 ? 0.3 : 0.15) * tone.slide, pHammer = (level === 2 ? 0.6 : 0.35) * tone.hammer, pVib = (level === 2 ? 0.6 : 0.35) * tone.vib, pVibEnd = level === 2 ? 0.85 : 0.6;
  const pBend = (/** @type {Record<string, number>} */ ({ blues: 0.2, pent: 0.1, follow: 0.01 })[style] ?? 0.01) * level;
  bars.forEach((notes, bi) => {
    const m = 1 + strength * ((info.find(x => x.bar === bi)?.intensity ?? 1) - 0.5); // full strength: 0.6 early .. 1.5 at the peak
    /** @type {Set<TabNote>} */ const joined = new Set();
    for (const a of notes) {
      const b = linkedNext(notes, a);
      if (!b || joined.has(a) || joined.has(b)) continue;
      const d = Math.abs(b.f - a.f);
      if (d < 1 || d > 5 || a.len > 12) continue;
      const r = rand();
      if (r < pSlide * m && a.len >= 6) a.link = 's';
      else if (r < (pSlide + pHammer) * m && d <= 4) a.link = 'h';
      else continue;
      joined.add(a); joined.add(b);
    }
    notes.forEach((n, i) => {
      if (joined.has(n)) return;
      const seg = info.find(x => x.bar === bi && n.at >= x.from && n.at < x.to);
      if (nStr >= 6 && n.len >= 6 && n.s < nStr - 2 && n.f >= 1 && seg && rand() < pBend * m * (seg.chordPcs.includes((midi[n.s] + n.f) % 12) ? 2 : 1)) { // bends that arrive on a chord tone are twice as likely
        const bend = n.f >= 2 && rand() < 0.7 ? 2 : 1;
        n.f -= bend; n.bend = bend;
      }
      const lastNote = bi === bars.length - 1 && i === notes.length - 1;
      if (n.len >= 12 && rand() < (lastNote ? pVibEnd : pVib * m)) n.vib = true;
    });
  });
}
