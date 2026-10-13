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
import { STEPS } from './tab.js';

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

/** Rhythm one bar at a time: [start, length] in sixteenths; gaps are rests. @type {Record<string, number[][][]>} */
const RHYTHMS = {
  sparse: [
    [[0, 4], [4, 2], [6, 2], [8, 8]],
    [[0, 6], [6, 2], [8, 4], [12, 4]],
    [[0, 8], [8, 4], [12, 4]],
    [[0, 4], [6, 2], [8, 4], [12, 2], [14, 2]],
    [[0, 2], [4, 4], [8, 6], [14, 2]],
  ],
  medium: [
    [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
    [[0, 3], [3, 3], [6, 2], [8, 2], [10, 2], [12, 4]],
    [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 2], [14, 2]],
    [[0, 4], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
    [[0, 2], [2, 2], [4, 2], [8, 2], [10, 2], [12, 4]],
  ],
  busy: [
    [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
    [[0, 2], [2, 2], [4, 1], [5, 1], [6, 1], [7, 1], [8, 2], [10, 2], [12, 1], [13, 1], [14, 1], [15, 1]],
    [[0, 1], [1, 1], [2, 1], [3, 1], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
    [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
  ],
};
/** The last bar: a run into a long final note. @type {number[][]} */
const FINAL = [[0, 2], [2, 2], [4, 2], [6, 2], [8, 8]];
/** @type {Record<string, number[][]>} */
const FINAL_BY_DENSITY = { sparse: [[0, 4], [4, 4], [8, 8]], medium: FINAL, busy: FINAL };

/** Small seeded generator (mulberry32). @param {number} seed @returns {() => number} */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * @typedef {object} SoloOptions
 * @property {{chords:{at:number, name:string}[]}[]} bars chord markers per bar (a bar without a marker at step 0 continues the previous chord)
 * @property {{midi:number[], tuning:number[]}} inst open-string MIDI notes and pitch classes, top string first (capo included)
 * @property {string} style  'follow' | 'pent' | 'blues'
 * @property {string} density 'sparse' | 'medium' | 'busy'
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
 * Which scale (and root) to play over a chord.
 * @param {string} style @param {{root:number, iv:number[]}} chord @param {Key} key @param {boolean} dominants any chord in the piece is a dominant 7th
 * @returns {{scaleId:string, root:number}}
 */
function scaleFor(style, chord, key, dominants) {
  if (style === 'blues') return { scaleId: key.mode === 'minor' || dominants ? 'blues' : 'majblues', root: key.t };
  if (style === 'pent' && plain(chord.iv)) {
    return { scaleId: minorish(chord.iv) || isDominantish(chord.iv) ? 'minpent' : 'majpent', root: chord.root };
  }
  const best = suggest(/** @type {any} */ (chord), key)[0];
  return { scaleId: best ? best.s.id : 'minpent', root: chord.root };
}

/**
 * Generate a solo.
 * @param {SoloOptions} o
 * @returns {{bars:TabNote[][], info:SegmentInfo[], key:Key}}
 */
export function generateSolo(o) {
  const rand = rng(o.seed);
  const pick = /** @template T @param {T[]} arr @returns {T} */ arr => arr[Math.floor(rand() * arr.length)];
  const nStr = o.inst.midi.length;
  // --- the chord in effect over every stretch of every bar ---
  const parsed = o.bars.map(b => b.chords.map(c => ({ at: c.at, name: c.name, chord: parseChord(c.name) })).filter(c => c.chord).sort((x, y) => x.at - y.at));
  const known = parsed.flat().map(c => /** @type {NonNullable<ReturnType<typeof parseChord>>} */ (c.chord));
  // A blues starts on its I chord, so for the blues style that chord is the tonic (key detection can pick the IV or V of a 12-bar).
  const bluesTonic = o.style === 'blues' && known.length ? { t: known[0].root, mode: /** @type {'major'|'minor'} */ (minorish(known[0].iv) ? 'minor' : 'major') } : null;
  const key = o.key || bluesTonic || (known.length ? detectKey(known) : null) || { t: 9, mode: /** @type {'minor'} */ ('minor') };
  const tonic = { root: key.t, iv: key.mode === 'major' ? CHORDS[''] : CHORDS.m, name: '' };
  const dominants = known.some(c => isDominantish(c.iv));
  /** @type {{bar:number, from:number, to:number, chord:{root:number, iv:number[], name:string}}[]} */
  const segs = [];
  /** @type {{root:number, iv:number[], name:string}} */
  let current = known[0] ? { root: known[0].root, iv: known[0].iv, name: parsed.flat()[0].name } : tonic;
  parsed.forEach((marks, bar) => {
    const starts = [...(marks.length && marks[0].at === 0 ? [] : [{ at: 0, name: current.name, chord: null }]), ...marks];
    starts.forEach((m, i) => {
      if (m.chord) current = { root: m.chord.root, iv: m.chord.iv, name: m.name };
      const to = i + 1 < starts.length ? starts[i + 1].at : STEPS;
      const prev = segs[segs.length - 1];
      if (prev && prev.bar === bar && prev.chord.name === current.name) prev.to = to; // same chord again: one stretch
      else if (to > m.at) segs.push({ bar, from: m.at, to, chord: current });
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
    const { scaleId, root } = scaleFor(o.style, chord, key, dominants);
    const scale = SC[scaleId];
    // --- position: keep it while the scale stays, else the nearest one to the hand ---
    const positions = getPositions(scale.iv, root, o.inst.tuning);
    const sets = positions.map((_, k) => positionFrets(positions, k, scale.iv, root, o.inst.tuning, o.inst.midi));
    const centers = sets.map(s => { const all = s.flatMap(x => [...x]); return all.reduce((a, b) => a + b, 0) / Math.max(1, all.length); });
    let pos;
    if (prevPos >= 0 && prevScale === scaleId && prevRoot === root) pos = prevPos;
    else {
      const order = centers.map((c, k) => ({ k, d: Math.abs(c - prevCenter) })).sort((a, b) => a.d - b.d);
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
      if (last) r = FINAL_BY_DENSITY[o.density] || FINAL;
      else {
        const pool = RHYTHMS[o.density] || RHYTHMS.medium;
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
      const strong = at % 4 === 0, firstOn = n === 0, lastOn = n === rhythm.length - 1;
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
