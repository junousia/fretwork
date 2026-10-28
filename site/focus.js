// The chord and the scale you are working with, shared by Progressions, Scales and Chords: whichever page you change them on, the others
// open on the same ones (a link carries them too, see the #scales / #chords hashes). Stored in the browser only.
import { CHORDS, SC } from './music.js';

const KEY = 'fw-focus';

/** @typedef {{root:number, suffix:string}} FocusChord @typedef {{root:number, id:string}} FocusScale */
/** @typedef {{chord:FocusChord|null, scale:FocusScale|null}} Focus */

/** @param {any} v @returns {FocusChord|null} */
const chordOf = v => (v && Number.isInteger(v.root) && v.root >= 0 && v.root < 12 && typeof v.suffix === 'string' && Object.prototype.hasOwnProperty.call(CHORDS, v.suffix) ? { root: v.root, suffix: v.suffix } : null);
/** @param {any} v @returns {FocusScale|null} */
const scaleOf = v => (v && Number.isInteger(v.root) && v.root >= 0 && v.root < 12 && typeof v.id === 'string' && SC[v.id] ? { root: v.root, id: v.id } : null);

/** @returns {Focus} */
export function getFocus() {
  try {
    const raw = JSON.parse((typeof window !== 'undefined' && window.localStorage.getItem(KEY)) || 'null');
    return { chord: chordOf(raw?.chord), scale: scaleOf(raw?.scale) };
  } catch (e) { return { chord: null, scale: null }; }
}

/** Change the shared chord and/or scale (a key left out stays as it is, null clears it). @param {{chord?:FocusChord|null, scale?:FocusScale|null}} patch */
export function setFocus(patch) {
  const now = getFocus();
  const next = { chord: 'chord' in patch ? chordOf(patch.chord) : now.chord, scale: 'scale' in patch ? scaleOf(patch.scale) : now.scale };
  if (JSON.stringify(next) === JSON.stringify(now)) return;
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* storage unavailable */ }
}
