// The player's setup: instrument (guitar / ukulele), tuning, capo and
// handedness. Everything else (positions, scales, voicings, audio) reads the
// derived `getInstrument()` object, so adding a tuning here is all it takes
// for the engines to handle it.
import { STRING_WIDTHS } from './music.js';

const STORE_KEY = 'gtr-instrument';
const SETUP_KEY = 'fw-setup';

// Open-string MIDI notes, TOP string first (the order board() draws and
// tuning[] uses - index 0 is the string drawn on top, the highest one on a
// guitar). Ukulele standard is re-entrant: its G string sits above C, so the
// notes are given explicitly and are not derivable from pitch classes.
/** @type {(arr:number[], n:number) => number[]} */
const down = (arr, n) => arr.map(m => m - n);
const GUITAR_STD = [64, 59, 55, 50, 45, 40];

/** @typedef {import('./types.js').Family} Family */
/** @typedef {import('./types.js').Setup} Setup */
/** @typedef {import('./types.js').Instrument} Instrument */

/** @type {Record<string, Family>} */
export const FAMILIES = {
  guitar: {
    id: 'guitar', name: 'Guitar', audioOffset: 0,
    standard: GUITAR_STD,
    /** @param {number} n */
    stringWidths: n => n === 7 ? [...STRING_WIDTHS, 3.6] : STRING_WIDTHS,
    tunings: [
      { id: 'standard', name: 'Standard (E A D G B E)', midi: GUITAR_STD },
      { id: 'half-down', name: 'Half step down (Eb)', midi: down(GUITAR_STD, 1) },
      { id: 'whole-down', name: 'Whole step down (D)', midi: down(GUITAR_STD, 2) },
      { id: 'drop-d', name: 'Drop D', midi: [64, 59, 55, 50, 45, 38] },
      { id: 'double-drop-d', name: 'Double drop D', midi: [62, 59, 55, 50, 45, 38] },
      { id: 'dadgad', name: 'DADGAD', midi: [62, 57, 55, 50, 45, 38] },
      { id: 'open-g', name: 'Open G (D G D G B D)', midi: [62, 59, 55, 50, 43, 38] },
      { id: 'open-d', name: 'Open D (D A D F# A D)', midi: [62, 57, 54, 50, 45, 38] },
      { id: 'open-e', name: 'Open E (E B E G# B E)', midi: [64, 59, 56, 52, 47, 40] },
      { id: 'seven-string', name: '7-string (B E A D G B E)', midi: [...GUITAR_STD, 35] },
    ],
  },
  ukulele: {
    id: 'ukulele', name: 'Ukulele', audioOffset: 12,
    standard: [69, 64, 60, 67],
    stringWidths: () => [1.4, 1.7, 2.0, 2.3],
    tunings: [
      { id: 'standard', name: 'Standard (G C E A)', midi: [69, 64, 60, 67] },
      { id: 'low-g', name: 'Low G', midi: [69, 64, 60, 55] },
      { id: 'd-tuned', name: 'D tuning (A D F# B)', midi: [71, 66, 62, 69] },
      { id: 'baritone', name: 'Baritone (D G B E)', midi: [64, 59, 55, 50] },
    ],
  },
};

export const MAX_CAPO = 9;
/** @param {string} family */
export const tuningsFor = family => FAMILIES[family].tunings;

// Browsers only: touching localStorage elsewhere (the Node tests) just warns.
const ls = typeof window !== 'undefined' ? window.localStorage : null;

/** @type {Setup} */
const setup = { instrument: 'guitar', tunings: { guitar: 'standard', ukulele: 'standard' }, capo: 0, leftHanded: false };
try {
  const savedId = ls?.getItem(STORE_KEY) ?? '';
  if (FAMILIES[savedId]) setup.instrument = savedId;
  const sv = JSON.parse(ls?.getItem(SETUP_KEY) || 'null');
  if (sv && typeof sv === 'object') {
    for (const f of Object.keys(FAMILIES)) {
      const t = sv.tunings?.[f];
      if (FAMILIES[f].tunings.some(x => x.id === t)) setup.tunings[f] = t;
    }
    if (Number.isInteger(sv.capo) && sv.capo >= 0 && sv.capo <= MAX_CAPO) setup.capo = sv.capo;
    setup.leftHanded = sv.leftHanded === true;
  }
} catch (e) { /* defaults */ }

/** @type {Set<(inst:Instrument) => void>} */
const listeners = new Set();
function persist() {
  try {
    ls?.setItem(STORE_KEY, setup.instrument);
    ls?.setItem(SETUP_KEY, JSON.stringify({ tunings: setup.tunings, capo: setup.capo, leftHanded: setup.leftHanded }));
  } catch (e) { /* storage unavailable */ }
}

// The current instrument as the engines want it: effective pitch classes and
// MIDI notes (capo included), string widths, and what voicing lookup needs.
/** @returns {Instrument} */
export function getInstrument() {
  const fam = FAMILIES[setup.instrument];
  const tuningId = setup.tunings[setup.instrument];
  const base = fam.tunings.find(t => t.id === tuningId) || fam.tunings[0];
  const midi = base.midi.map(m => m + setup.capo);
  return {
    id: fam.id, name: fam.name, audioOffset: fam.audioOffset,
    tuningId: base.id, tuningName: base.name,
    capo: setup.capo, leftHanded: setup.leftHanded,
    midi, tuning: midi.map(m => ((m % 12) + 12) % 12),
    stringWidths: fam.stringWidths(midi.length),
    standardPcs: fam.standard.map(m => m % 12),
  };
}
export const getInstrumentId = () => setup.instrument;
export const getSetup = () => ({ instrument: setup.instrument, tuning: setup.tunings[setup.instrument], capo: setup.capo, leftHanded: setup.leftHanded });

// Apply any of {instrument, tuning, capo, leftHanded} at once (unknown or
// out-of-range values are ignored) and notify listeners once if anything changed.
/** @param {{instrument?:string, tuning?:string, capo?:number, leftHanded?:boolean}} next */
export function applySetup(next) {
  const before = JSON.stringify(setup);
  if (next.instrument && FAMILIES[next.instrument]) setup.instrument = next.instrument;
  if (next.tuning && FAMILIES[setup.instrument].tunings.some(t => t.id === next.tuning)) setup.tunings[setup.instrument] = next.tuning;
  const capo = next.capo;
  if (capo !== undefined && Number.isInteger(capo) && capo >= 0 && capo <= MAX_CAPO) setup.capo = capo;
  if (typeof next.leftHanded === 'boolean') setup.leftHanded = next.leftHanded;
  if (JSON.stringify(setup) === before) return;
  persist();
  const inst = getInstrument();
  listeners.forEach(cb => cb(inst));
}
/** @param {string} id */
export const setInstrument = id => applySetup({ instrument: id });
/** @param {string} id */
export const setTuning = id => applySetup({ tuning: id });
/** @param {number} n */
export const setCapo = n => applySetup({ capo: n });
/** @param {boolean} b */
export const setLeftHanded = b => applySetup({ leftHanded: !!b });

/** @param {(inst:Instrument) => void} cb @returns {() => void} unsubscribe */
export function onInstrumentChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
