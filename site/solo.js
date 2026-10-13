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
import { SC, CHORDS, parseChord, suggest, detectKey, isDominantish } from './music.js';
import { getPositions, positionFrets } from './positions.js';
import { STEPS, BEAT } from './tab.js';

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
/** The last bar of a solo: a run into a long final note, per feel (the sparse one is simpler). @type {Record<string, {sparse:number[][], normal:number[][]}>} */
export const FINALS = {
  straight: { sparse: [[0, 12], [12, 12], [24, 24]], normal: [[0, 6], [6, 6], [12, 6], [18, 6], [24, 24]] },
  shuffle: { sparse: [[0, 12], [12, 12], [24, 24]], normal: [[0, 8], [8, 4], [12, 8], [20, 4], [24, 24]] },
  triplet: { sparse: [[0, 12], [12, 12], [24, 24]], normal: [[0, 4], [4, 4], [8, 4], [12, 12], [24, 24]] },
  funk: { sparse: [[0, 12], [12, 12], [24, 24]], normal: [[0, 3], [6, 3], [12, 3], [18, 3], [24, 24]] },
};

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
 */

/** @param {number[]} iv @returns {boolean} */
const minorish = iv => iv.includes(3) && !iv.includes(4);
/** A plain triad/7th family chord (no sus, alterations, dim or aug). @param {number[]} iv @returns {boolean} */
const plain = iv => !iv.includes(5) && !iv.includes(2) && !(iv.includes(6) && iv.includes(7)) && !iv.includes(8) && (iv.includes(3) || iv.includes(4));

/**
 * Which scale (and root) the generator picks by itself over a chord.
 * @param {string} style @param {{root:number, iv:number[]}} chord @param {Key} key @param {boolean} dominants any chord in the piece is a dominant 7th
 * @returns {{scaleId:string, root:number}}
 */
function autoScale(style, chord, key, dominants) {
  if (style === 'blues') return { scaleId: key.mode === 'minor' || dominants ? 'blues' : 'majblues', root: key.t };
  if (style === 'pent' && plain(chord.iv)) {
    return { scaleId: minorish(chord.iv) || isDominantish(chord.iv) ? 'minpent' : 'majpent', root: chord.root };
  }
  const best = suggest(/** @type {any} */ (chord), key)[0];
  return { scaleId: best ? best.s.id : 'minpent', root: chord.root };
}

/**
 * The scale and root played over a chord: the one chosen on its marker, else the automatic choice.
 * @param {string} style @param {{root:number, iv:number[]}} chord @param {{scale?:string}|undefined} pref @param {Key} key @param {boolean} dominants
 * @returns {{scaleId:string, root:number, auto:boolean}}
 */
export function scaleFor(style, chord, pref, key, dominants) {
  if (pref?.scale && SC[pref.scale]) return { scaleId: pref.scale, root: chord.root, auto: false };
  return { ...autoScale(style, chord, key, dominants), auto: true };
}

/**
 * The key and whether any chord is a dominant 7th, as the generator will use them.
 * @param {{chords:{name:string}[]}[]} bars @param {string} style @param {Key} [keyOpt]
 * @returns {{key:Key, dominants:boolean}}
 */
export function soloContext(bars, style, keyOpt) {
  const known = bars.flatMap(b => b.chords).map(c => parseChord(c.name)).filter(/** @returns {c is NonNullable<ReturnType<typeof parseChord>>} */ c => !!c);
  // A blues starts on its I chord, so for the blues style that chord is the tonic (key detection can pick the IV or V of a 12-bar).
  const bluesTonic = style === 'blues' && known.length ? { t: known[0].root, mode: /** @type {'major'|'minor'} */ (minorish(known[0].iv) ? 'minor' : 'major') } : null;
  const key = keyOpt || bluesTonic || (known.length ? detectKey(known) : null) || { t: 9, mode: /** @type {'minor'} */ ('minor') };
  return { key, dominants: known.some(c => isDominantish(c.iv)) };
}

/**
 * Generate a solo.
 * @param {SoloOptions} o
 * @returns {{bars:TabNote[][], info:SegmentInfo[], key:Key}}
 */
export function generateSolo(o) {
  const rand = rng(o.seed);
  const feel = o.feel && RHYTHMS[o.feel] ? o.feel : 'straight';
  const pick = /** @template T @param {T[]} arr @returns {T} */ arr => arr[Math.floor(rand() * arr.length)];
  const nStr = o.inst.midi.length;
  // --- the chord in effect over every stretch of every bar ---
  const parsed = o.bars.map(b => b.chords.map(c => ({ ...c, chord: parseChord(c.name) })).filter(c => c.chord).sort((x, y) => x.at - y.at));
  const known = parsed.flat().map(c => /** @type {NonNullable<ReturnType<typeof parseChord>>} */ (c.chord));
  const { key, dominants } = soloContext(o.bars, o.style, o.key);
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
  let dir = rand() < 0.5 ? 1 : -1, afterLeap = false;
  const lastBar = o.bars.length - 1;

  segs.forEach((seg, si) => {
    const { bar, chord } = seg;
    const lastSeg = si === segs.length - 1;
    const { scaleId, root } = scaleFor(o.style, chord, seg.pref, key, dominants);
    const scale = SC[scaleId];
    // --- position: keep it while the scale stays, else the nearest one to the hand ---
    const positions = getPositions(scale.iv, root, o.inst.tuning);
    const sets = positions.map((_, k) => positionFrets(positions, k, scale.iv, root, o.inst.tuning, o.inst.midi));
    const centers = sets.map(s => { const all = s.flatMap(x => [...x]); return all.reduce((a, b) => a + b, 0) / Math.max(1, all.length); });
    // positions the user allowed for this chord (1-based); none given or none valid = any
    const allowed = (seg.pref.positions || []).map(n => n - 1).filter(k => k >= 0 && k < positions.length);
    const usable = allowed.length ? allowed : positions.map((_, k) => k);
    let pos;
    if (prevPos >= 0 && prevScale === scaleId && prevRoot === root && usable.includes(prevPos)) pos = prevPos;
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
    info.push({ bar, from: seg.from, to: seg.to, chord: chord.name, chordPcs, scaleId, root, scalePcs: [...new Set(scale.iv.map(x => (x + root) % 12))], position: positions[pos].n, frets: fretSets });
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
        const pool = (RHYTHMS[feel] || RHYTHMS.straight)[/** @type {'sparse'|'medium'|'busy'} */ (o.density)] || RHYTHMS.straight.medium;
        if (k === 0) { phraseRhythm = pick(pool); motifRhythm = phraseRhythm; motifOffsets = null; r = phraseRhythm; }
        else if (k === 1) r = rand() < 0.7 ? phraseRhythm : pick(pool);
        else if (k === 2) r = pick(pool.filter(x => x !== phraseRhythm)) || phraseRhythm;
        else r = rand() < 0.5 ? phraseRhythm : pick(pool);
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
    rhythm.forEach(([at], n) => {
      const strong = at % BEAT === 0, firstOn = n === 0, lastOn = n === rhythm.length - 1;
      // the walk is pulled gently back to the middle of the position so it does not drift to one end
      const mid = (pitches.length - 1) / 2;
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
        const near = nearest(tones, idx); idx = near.length > 1 && rand() < 0.3 ? near[1] : near[0];
      } else if (replay && motifOffsets && motifOffsets[n] !== undefined) {
        idx = clampIdx(idxs[0] + motifOffsets[n]);
        if (strong && !isTone(idx)) { const near = nearest(tones, idx)[0]; if (Math.abs(near - idx) <= 2) idx = near; }
      } else if (strong) { // land on a chord tone, a different one than we are on, one of the two nearest
        const near = nearest(tones, idx).filter(i => i !== idx);
        idx = near.length > 1 && rand() < 0.35 ? near[1] : (near[0] ?? idx);
      } else {
        // a step usually, sometimes a skip, rarely a leap (which is answered by a step back)
        let delta;
        if (afterLeap) { delta = 1; dir = -dir; afterLeap = false; }
        else {
          const pull = idx < mid - 2 ? 0.7 : idx > mid + 2 ? 0.3 : 0.5; // chance of going up
          dir = rand() < 0.62 ? dir : (rand() < pull ? 1 : -1);
          const r = rand();
          delta = r < 0.58 ? 1 : r < 0.80 ? 2 : r < 0.86 ? 0 : r < 0.94 ? 3 : 4;
          if (delta >= 3) afterLeap = true;
        }
        let next = idx + dir * delta;
        if (next < 0 || next > pitches.length - 1) { dir = -dir; next = idx + dir * delta; }
        idx = clampIdx(next);
      }
      // never leap more than a major sixth, and never sound the same note three times running
      if (!(lastSeg && lastOn) && !(firstOn && prevMidi < 0)) {
        const from = n > 0 ? idxs[n - 1] : cur0;
        while (idx !== from && Math.abs(pitches[idx] - pitches[from]) > 9) idx += from > idx ? 1 : -1;
        if (n >= 1 && idx === idxs[n - 1] && (n >= 2 ? idxs[n - 2] === idx : sameAsPrev2(idx))) idx = clampIdx(idx + (rand() < 0.5 ? 1 : -1));
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
  return { bars: outBars, info, key };
}
