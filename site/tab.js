// The tab data model (pure, no DOM): a song is a list of 4/4 bars, each a list
// of notes on a sixteenth-note grid. Editing functions never mutate; they return
// a new Tab, so undo/redo is just a stack of snapshots. The tab view, the editor,
// playback and (later) the generator and PDF export all read this one shape.

/** @typedef {import('./types.js').Tab} Tab */
/** @typedef {import('./types.js').TabBar} TabBar */
/** @typedef {import('./types.js').TabNote} TabNote */

export const STEPS = 16;          // sixteenth notes per bar (4/4)
export const MAX_FRET = 24;
export const MAX_BARS = 64;
/** Note lengths on offer, in steps: 1/16, 1/8, dotted 1/8, 1/4, dotted 1/4, 1/2, dotted 1/2, whole. */
export const LENGTHS = [1, 2, 3, 4, 6, 8, 12, 16];
export const LENGTH_NAMES = ['1/16', '1/8', '1/8.', '1/4', '1/4.', '1/2', '1/2.', '1'];

/** @param {number} [nBars] @returns {Tab} */
export function emptyTab(nBars = 4) {
  return { title: '', bpm: 90, bars: Array.from({ length: nBars }, () => ({ chord: '', notes: [] })) };
}

/** @param {TabNote[]} notes @returns {TabNote[]} notes in time order (then top string first) */
const ordered = notes => [...notes].sort((a, b) => a.at - b.at || a.s - b.s);

/** Replace one bar. @param {Tab} tab @param {number} bar @param {(b:TabBar) => TabBar} fn @returns {Tab} */
function withBar(tab, bar, fn) {
  if (!tab.bars[bar]) return tab;
  return { ...tab, bars: tab.bars.map((b, i) => (i === bar ? fn(b) : b)) };
}

/** The note that starts exactly here, if any. @type {(tab:Tab, bar:number, at:number, s:number) => TabNote|undefined} */
export const noteAt = (tab, bar, at, s) => tab.bars[bar]?.notes.find(n => n.s === s && n.at === at);

/** The note sounding at this step on this string (it may have started earlier). @type {(tab:Tab, bar:number, at:number, s:number) => TabNote|undefined} */
export const noteCovering = (tab, bar, at, s) => tab.bars[bar]?.notes.find(n => n.s === s && n.at <= at && at < n.at + n.len);

/**
 * Put a note down. A string rings one note at a time, so an earlier note on the
 * same string is cut short where this one starts, and this one is cut short where
 * the next note on that string begins (or at the end of the bar).
 * @param {Tab} tab @param {number} bar @param {number} at @param {number} s @param {number} f @param {number} len @returns {Tab}
 */
export function putNote(tab, bar, at, s, f, len) {
  if (!Number.isInteger(at) || at < 0 || at >= STEPS || !Number.isInteger(s) || s < 0 || !Number.isInteger(f) || f < 0 || f > MAX_FRET) return tab;
  return withBar(tab, bar, b => {
    const keep = [];
    for (const n of b.notes) {
      if (n.s !== s) { keep.push(n); continue; }
      if (n.at === at) continue;                                  // replaced
      if (n.at < at && n.at + n.len > at) keep.push({ ...n, len: at - n.at }); // cut short
      else keep.push(n);
    }
    const next = Math.min(STEPS, ...keep.filter(n => n.s === s && n.at > at).map(n => n.at));
    const l = Math.max(1, Math.min(len, next - at));
    return { ...b, notes: ordered([...keep, { at, len: l, s, f }]) };
  });
}

/** Delete the note sounding at this cell. @param {Tab} tab @param {number} bar @param {number} at @param {number} s @returns {Tab} */
export function removeNote(tab, bar, at, s) {
  const n = noteCovering(tab, bar, at, s);
  if (!n) return tab;
  return withBar(tab, bar, b => ({ ...b, notes: b.notes.filter(x => x !== n) }));
}

/** Change the length of the note starting here (clipped like putNote). @param {Tab} tab @param {number} bar @param {number} at @param {number} s @param {number} len @returns {Tab} */
export function setLength(tab, bar, at, s, len) {
  const n = noteAt(tab, bar, at, s);
  return n ? putNote(tab, bar, at, s, n.f, len) : tab;
}

/** @param {Tab} tab @param {number} [index] insert before this bar (default: at the end) @returns {Tab} */
export function addBar(tab, index = tab.bars.length) {
  if (tab.bars.length >= MAX_BARS) return tab;
  const at = Math.max(0, Math.min(index, tab.bars.length));
  const bars = [...tab.bars]; bars.splice(at, 0, { chord: '', notes: [] });
  return { ...tab, bars };
}

/** Remove a bar (never the last one). @param {Tab} tab @param {number} index @returns {Tab} */
export function removeBar(tab, index) {
  if (tab.bars.length <= 1 || !tab.bars[index]) return tab;
  return { ...tab, bars: tab.bars.filter((_, i) => i !== index) };
}

/** @param {Tab} tab @param {number} bar @param {string} chord @returns {Tab} */
export const setChord = (tab, bar, chord) => withBar(tab, bar, b => ({ ...b, chord: String(chord).trim().slice(0, 16) }));

/** @param {Tab} tab @param {any} bpm @returns {Tab} */
export const setBpm = (tab, bpm) => ({ ...tab, bpm: Math.min(220, Math.max(40, Math.round(+bpm) || 90)) });

/** Empty every bar but keep the bar count and chords. @param {Tab} tab @returns {Tab} */
export const clearNotes = tab => ({ ...tab, bars: tab.bars.map(b => ({ ...b, notes: [] })) });

/**
 * Every note as a playable event, in time order.
 * @param {Tab} tab @param {{midi:number[]}} inst open-string MIDI notes, top string first (capo included)
 * @returns {{step:number, dur:number, midi:number, bar:number, at:number, s:number}[]} step counts sixteenths from the start
 */
export function tabEvents(tab, inst) {
  /** @type {{step:number, dur:number, midi:number, bar:number, at:number, s:number}[]} */
  const out = [];
  tab.bars.forEach((b, bar) => b.notes.forEach(n => {
    if (n.s >= inst.midi.length) return; // a string this instrument does not have
    out.push({ step: bar * STEPS + n.at, dur: n.len, midi: inst.midi[n.s] + n.f, bar, at: n.at, s: n.s });
  }));
  return out.sort((a, b) => a.step - b.step || a.s - b.s);
}

/** Seconds per sixteenth step at a tempo in quarter-note BPM. @param {number} bpm @returns {number} */
export const stepSeconds = bpm => 60 / bpm / 4;

/**
 * Validate and repair anything claiming to be a Tab (storage, links): unknown
 * shapes give null, out-of-range notes are dropped, overlaps resolved.
 * @param {any} raw @returns {Tab|null}
 */
export function normalizeTab(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.bars) || !raw.bars.length || raw.bars.length > MAX_BARS) return null;
  let tab = { title: typeof raw.title === 'string' ? raw.title.slice(0, 80) : '', bpm: 90, bars: raw.bars.map((/** @type {any} */ _) => ({ chord: '', notes: /** @type {TabNote[]} */ ([]) })) };
  tab = setBpm(tab, raw.bpm);
  raw.bars.forEach((/** @type {any} */ b, /** @type {number} */ i) => {
    if (!b || typeof b !== 'object') return;
    tab = setChord(tab, i, typeof b.chord === 'string' ? b.chord : '');
    const notes = Array.isArray(b.notes) ? b.notes.slice(0, STEPS * 12) : [];
    for (const n of notes) {
      if (!n || typeof n !== 'object' || !Number.isInteger(n.len) || n.len < 1 || n.len > STEPS) continue;
      tab = putNote(tab, i, n.at, n.s, n.f, n.len);
    }
  });
  return tab;
}

/**
 * Undo/redo as snapshots. `push` records a new state, `replace` rewrites the
 * current one (merging two keystrokes into one undo step).
 * @param {Tab} initial
 */
export function createHistory(initial) {
  /** @type {Tab[]} */ let past = [];
  /** @type {Tab[]} */ let future = [];
  let present = initial;
  return {
    get current() { return present; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    /** @param {Tab} t */
    push(t) { if (t === present) return; past.push(present); if (past.length > 200) past.shift(); present = t; future = []; },
    /** @param {Tab} t */
    replace(t) { present = t; },
    undo() { const p = past.pop(); if (p) { future.push(present); present = p; } return present; },
    redo() { const f = future.pop(); if (f) { past.push(present); present = f; } return present; },
  };
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Letter names for the strings, top first; the top string is lower case when another string shares its letter (e B G D A E). @param {number[]} midi @returns {string[]} */
export function stringNames(midi) {
  const names = midi.map(m => NOTE_NAMES[((m % 12) + 12) % 12]);
  return names.map((n, i) => (i === 0 && names.slice(1).includes(n) ? n.toLowerCase() : n));
}

/**
 * The tab as plain text (the classic ASCII layout): two characters per sixteenth,
 * as many bars per line as fit in 72 columns, chord names above each bar.
 * @param {Tab} tab @param {number[]} midi open-string MIDI notes, top first @returns {string}
 */
export function tabToText(tab, midi) {
  const names = stringNames(midi), pad = Math.max(...names.map(n => n.length));
  const barLen = STEPS * 2, perLine = Math.max(1, Math.floor((72 - pad - 1) / (barLen + 1)));
  const lines = [];
  if (tab.title) lines.push(tab.title, '');
  for (let first = 0; first < tab.bars.length; first += perLine) {
    const group = tab.bars.slice(first, first + perLine);
    let chords = ' '.repeat(pad + 1);
    group.forEach(b => { chords += (b.chord || '').slice(0, barLen).padEnd(barLen + 1); });
    if (group.some(b => b.chord)) lines.push(chords.trimEnd());
    midi.forEach((_, s) => {
      let row = names[s].padEnd(pad) + '|';
      for (const b of group) {
        const cells = Array.from({ length: STEPS }, () => '--');
        for (const n of b.notes) if (n.s === s) cells[n.at] = String(n.f).padEnd(2, '-');
        row += cells.join('') + '|';
      }
      lines.push(row);
    });
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
