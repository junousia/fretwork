// The tab data model (pure, no DOM): a song is a list of 4/4 bars, each a list
// of notes on a sixteenth-note grid. Editing functions never mutate; they return
// a new Tab, so undo/redo is just a stack of snapshots. The tab view, the editor,
// playback, the solo generator and (later) PDF export all read this one shape.
import { readPick } from './scalefit.js';

/** @typedef {import('./types.js').Tab} Tab */
/** @typedef {import('./types.js').TabBar} TabBar */
/** @typedef {import('./types.js').TabNote} TabNote */
/** @typedef {import('./types.js').TabChord} TabChord */

// 48 steps per 4/4 bar: a quarter is 12, an eighth 6, a sixteenth 3, an eighth triplet 4, a sixteenth
// triplet 2 - the smallest grid that holds straight and triplet notes exactly.
export const STEPS = 48;
export const BEAT = 12;           // steps per quarter note
export const SIXTEENTH = 3;
/** Which `res` a Tab object is in: older saved tabs (no res) used 16 steps per bar and are converted when read. */
export const RES = 48;
export const MAX_FRET = 24;
export const MAX_BARS = 64;
export const MAX_CHORDS_PER_BAR = 8;
/** Straight note lengths on offer, in steps: 1/16, 1/8, dotted 1/8, 1/4, dotted 1/4, 1/2, dotted 1/2, whole. */
export const LENGTHS = [3, 6, 9, 12, 18, 24, 36, 48];
export const LENGTH_NAMES = ['1/16', '1/8', '1/8.', '1/4', '1/4.', '1/2', '1/2.', '1'];
/** The triplet version of a straight length (three in the time of two): 1/16, 1/8, 1/4 and 1/2 have one. @type {Record<number, number>} */
export const TRIPLET_OF = { 3: 2, 6: 4, 12: 8, 24: 16 };
/** Lengths that are triplets. */
export const TRIPLET_LENGTHS = Object.values(TRIPLET_OF);
/** The grid a note of this length is placed on: triplets on their own length, everything else on sixteenths. @param {number} len @returns {number} */
export const gridFor = len => (TRIPLET_LENGTHS.includes(len) ? len : SIXTEENTH);

/** @param {number} [nBars] @returns {Tab} */
export function emptyTab(nBars = 4) {
  return { title: '', bpm: 90, res: RES, bars: Array.from({ length: nBars }, () => ({ chords: [], notes: [] })) };
}

/** @param {TabNote[]} notes @returns {TabNote[]} notes in time order (then top string first) */
const ordered = notes => [...notes].sort((a, b) => a.at - b.at || a.s - b.s);

/** The technique fields of a note (link, bend, vib), nothing else. @param {TabNote} n @returns {Partial<TabNote>} */
const extras = n => ({ ...(n.link ? { link: n.link } : {}), ...(n.bend ? { bend: n.bend } : {}), ...(n.vib ? { vib: n.vib } : {}) });

/** Replace one bar. @param {Tab} tab @param {number} bar @param {(b:TabBar) => TabBar} fn @returns {Tab} */
function withBar(tab, bar, fn) {
  if (!tab.bars[bar]) return tab;
  const next = fn(tab.bars[bar]);
  return next === tab.bars[bar] ? tab : { ...tab, bars: tab.bars.map((b, i) => (i === bar ? next : b)) };
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
    /** @type {TabNote|undefined} */ let replaced;
    for (const n of b.notes) {
      if (n.s !== s) { keep.push(n); continue; }
      if (n.at === at) { replaced = n; continue; }                // replaced (it keeps its techniques)
      if (n.at < at && n.at + n.len > at) keep.push({ ...n, len: at - n.at }); // cut short
      else keep.push(n);
    }
    const next = Math.min(STEPS, ...keep.filter(n => n.s === s && n.at > at).map(n => n.at));
    const l = Math.max(1, Math.min(len, next - at));
    return { ...b, notes: ordered([...keep, { at, len: l, s, f, ...(replaced ? extras(replaced) : {}) }]) };
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

/**
 * The note a linked (hammer / pull / slide) note runs into: the next note on the same string in the bar,
 * if it starts at most a sixteenth after this one ends. Otherwise the link has nothing to link to.
 * @param {TabNote[]} notes @param {TabNote} n @returns {TabNote|undefined}
 */
export function linkedNext(notes, n) {
  const next = notes.filter(m => m.s === n.s && m.at > n.at).sort((a, b) => a.at - b.at)[0];
  return next && next.at - (n.at + n.len) <= SIXTEENTH ? next : undefined;
}

/** The semitones a bend can go up, and what each is called. */
export const BENDS = [1, 2, 3, 4];
export const BEND_NAMES = ['1/2', 'full', '1 1/2', '2'];

/**
 * Set or clear the techniques of the note starting at this step. Each field is optional: `link: ''` clears the
 * link, `bend: 0` clears the bend, `vib: false` clears vibrato. Bending and vibrato are not combined with a slide.
 * @param {Tab} tab @param {number} bar @param {number} at @param {number} s
 * @param {{link?:''|'h'|'s', bend?:number, vib?:boolean}} patch @returns {Tab}
 */
export function setTechnique(tab, bar, at, s, patch) {
  return withBar(tab, bar, b => {
    const n = b.notes.find(x => x.at === at && x.s === s); if (!n) return b;
    /** @type {TabNote} */ const next = { at: n.at, len: n.len, s: n.s, f: n.f };
    let link = n.link, bend = n.bend, vib = n.vib;
    if (patch.link !== undefined) link = patch.link === 'h' || patch.link === 's' ? patch.link : undefined;
    if (patch.bend !== undefined) bend = patch.bend === 1 || patch.bend === 2 || patch.bend === 3 || patch.bend === 4 ? patch.bend : undefined;
    if (patch.vib !== undefined) vib = patch.vib ? true : undefined;
    if (link === 's') { bend = undefined; vib = undefined; }
    if (link) next.link = link; if (bend) next.bend = bend; if (vib) next.vib = vib;
    if (next.link === n.link && next.bend === n.bend && next.vib === n.vib) return b;
    return { ...b, notes: b.notes.map(x => (x === n ? next : x)) };
  });
}

/** With 'auto', a progression is repeated until the tab has at least this many bars (a ii-V-I of 3 chords becomes 9 bars, not 3). */
export const MIN_AUTO_BARS = 8;
/** How many times to play a progression of `len` chords: 'auto' or a count. @param {number} len @param {string|number} repeat @returns {number} */
export const repeatsFor = (len, repeat) => (repeat === 'auto' ? Math.max(1, Math.ceil(MIN_AUTO_BARS / Math.max(1, len))) : Math.max(1, Math.floor(+repeat) || 1));

/**
 * Lay a chord progression into the tab, repeated (at most MAX_BARS bars). Each entry is one bar: a chord name, or the chord names of a bar
 * with more than one, spread evenly across it. Notes already in a bar stay in it; chords, scale and position choices are replaced.
 * @param {Tab} tab @param {(string|string[])[]} bars @param {string|number} [repeat] 'auto' or a count @returns {Tab}
 */
export function withChords(tab, bars, repeat = 'auto') {
  if (!bars.length) return tab;
  const list = bars.map(b => (Array.isArray(b) ? b : [b]).filter(Boolean));
  const n = Math.min(MAX_BARS, list.length * repeatsFor(list.length, repeat));
  return { ...tab, bars: Array.from({ length: n }, (_, i) => {
    const names = list[i % list.length];
    return { chords: names.map((name, k) => ({ at: Math.floor((k * STEPS) / names.length), name })), notes: tab.bars[i]?.notes || [] };
  }) };
}

/** @param {Tab} tab @param {number} [index] insert before this bar (default: at the end) @returns {Tab} */
export function addBar(tab, index = tab.bars.length) {
  if (tab.bars.length >= MAX_BARS) return tab;
  const at = Math.max(0, Math.min(index, tab.bars.length));
  const bars = [...tab.bars]; bars.splice(at, 0, { chords: [], notes: [] });
  return { ...tab, bars };
}

/** Remove a bar (never the last one). @param {Tab} tab @param {number} index @returns {Tab} */
export function removeBar(tab, index) {
  if (tab.bars.length <= 1 || !tab.bars[index]) return tab;
  return { ...tab, bars: tab.bars.filter((_, i) => i !== index) };
}

/**
 * Place a chord name at a step of a bar (it holds until the next marker). An empty name
 * removes the marker at that step.
 * @param {Tab} tab @param {number} bar @param {number} at @param {string} name @returns {Tab}
 */
export function putChord(tab, bar, at, name) {
  if (!Number.isInteger(at) || at < 0 || at >= STEPS) return tab;
  const nm = String(name).trim().slice(0, 16);
  return withBar(tab, bar, b => {
    const old = b.chords.find(c => c.at === at);
    const rest = b.chords.filter(c => c.at !== at);
    if (!nm) return rest.length === b.chords.length ? b : { ...b, chords: rest };
    if (!old && rest.length >= MAX_CHORDS_PER_BAR) return b;
    if (old && old.name === nm) return b;
    // renaming a chord drops its scale/position choices: they were made for the old chord
    return { ...b, chords: [...rest, { at, name: nm }].sort((x, y) => x.at - y.at) };
  });
}

/**
 * Choose the scale and/or positions the generator uses over the chord marker at this step.
 * `scale: ''` goes back to automatic; `positions: []` means every position. Changing the scale
 * clears the positions (they are numbered per scale).
 * @param {Tab} tab @param {number} bar @param {number} at @param {{scale?:string, positions?:number[]}} patch @returns {Tab}
 */
export function setChordPlan(tab, bar, at, patch) {
  return withBar(tab, bar, b => {
    const c = b.chords.find(x => x.at === at); if (!c) return b;
    /** @type {TabChord} */ const next = { at: c.at, name: c.name };
    let scale = c.scale, positions = c.positions;
    if (patch.scale !== undefined) { const ns = patch.scale && readPick(patch.scale, 0) ? patch.scale : undefined; if (ns !== scale) { scale = ns; positions = undefined; } }
    if (patch.positions !== undefined) positions = [...new Set(patch.positions.filter(n => Number.isInteger(n) && n >= 1 && n <= 12))].sort((x, y) => x - y).slice(0, 8);
    if (scale) next.scale = scale;
    if (positions && positions.length) next.positions = positions;
    if (next.scale === c.scale && JSON.stringify(next.positions) === JSON.stringify(c.positions)) return b;
    return { ...b, chords: b.chords.map(x => (x === c ? next : x)) };
  });
}

/** The chord marker exactly at this step, if any. @param {Tab} tab @param {number} bar @param {number} at @returns {TabChord|undefined} */
export const chordAt = (tab, bar, at) => tab.bars[bar]?.chords.find(c => c.at === at);

/** Every chord marker in time order, with its step counted from the start. @param {Tab} tab @returns {{bar:number, at:number, step:number, name:string}[]} */
export const chordTimeline = tab => tab.bars.flatMap((b, bar) => b.chords.map(c => ({ bar, at: c.at, step: bar * STEPS + c.at, name: c.name })));

/** The distinct chord names used, in order of first appearance. @param {Tab} tab @returns {string[]} */
export const chordsUsed = tab => [...new Set(chordTimeline(tab).map(c => c.name))];

/** Choose which stored voicing (0-based) a chord uses. @param {Tab} tab @param {string} name @param {number} index @returns {Tab} */
export function setVoicing(tab, name, index) {
  if (!Number.isInteger(index) || index < 0 || index > 99) return tab;
  const voicings = { ...(tab.voicings || {}) };
  if (index === 0) delete voicings[name]; else voicings[name] = index;
  return { ...tab, voicings };
}

/** @param {Tab} tab @param {any} bpm @returns {Tab} */
export const setBpm = (tab, bpm) => ({ ...tab, bpm: Math.min(220, Math.max(40, Math.round(+bpm) || 90)) });

/** Empty every bar but keep the bar count and chords. @param {Tab} tab @returns {Tab} */
export const clearNotes = tab => ({ ...tab, bars: tab.bars.map(b => ({ ...b, notes: [] })) });

/**
 * @typedef {object} TabEvent
 * @property {number} step @property {number} dur @property {number} midi @property {number} bar @property {number} at @property {number} s
 * @property {number} [bend] semitones @property {boolean} [vib]
 * @property {boolean} [soft] the second note of a hammer-on / pull-off: no pick
 * @property {number} [slideTo] MIDI note a slide arrives at, @property {number} [slideAt] steps after the start the glide begins, @property {number} [slideEnd] steps after the start it arrives
 * @property {boolean} [skip] already sounded by the slide before it
 */
/**
 * Every note as a playable event, in time order.
 * @param {Tab} tab @param {{midi:number[]}} inst open-string MIDI notes, top string first (capo included)
 * @returns {TabEvent[]} step counts 48ths of a bar from the start
 */
export function tabEvents(tab, inst) {
  /** @type {TabEvent[]} */
  const out = [];
  tab.bars.forEach((b, bar) => {
    /** @type {Map<TabNote, TabEvent>} */ const made = new Map();
    b.notes.forEach(n => {
      if (n.s >= inst.midi.length) return; // a string this instrument does not have
      /** @type {TabEvent} */
      const e = { step: bar * STEPS + n.at, dur: n.len, midi: inst.midi[n.s] + n.f, bar, at: n.at, s: n.s };
      if (n.bend) e.bend = n.bend;
      if (n.vib) e.vib = true;
      made.set(n, e); out.push(e);
    });
    // links: a hammer-on / pull-off plays the next note softly (no pick); a slide is one glide that runs on into the next note
    b.notes.forEach(n => {
      const e = made.get(n), next = n.link ? linkedNext(b.notes, n) : undefined, e2 = next && made.get(next);
      if (!e || !next || !e2) return;
      if (n.link === 'h') e2.soft = true;
      else { e.slideTo = e2.midi; e.slideAt = (next.at - n.at) * 0.6; e.slideEnd = next.at - n.at; e.dur = next.at + next.len - n.at; e2.skip = true; }
    });
  });
  return out.sort((a, b) => a.step - b.step || a.s - b.s);
}

/** Seconds per sixteenth step at a tempo in quarter-note BPM. @param {number} bpm @returns {number} */
export const stepSeconds = bpm => 60 / bpm / BEAT;

/**
 * Validate and repair anything claiming to be a Tab (storage, links): unknown
 * shapes give null, out-of-range notes are dropped, overlaps resolved.
 * @param {any} raw @returns {Tab|null}
 */
export function normalizeTab(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.bars) || !raw.bars.length || raw.bars.length > MAX_BARS) return null;
  // Tabs saved before triplets used 16 steps per bar (no `res`): every position and length is three times finer now.
  if (raw.res !== undefined && raw.res !== 16 && raw.res !== RES) return null;
  const k = raw.res === RES ? 1 : 3;
  /** @type {Tab} */
  let tab = { title: typeof raw.title === 'string' ? raw.title.slice(0, 80) : '', bpm: 90, res: RES, bars: raw.bars.map((/** @type {any} */ _) => ({ chords: /** @type {TabChord[]} */ ([]), notes: /** @type {TabNote[]} */ ([]) })) };
  tab = setBpm(tab, raw.bpm);
  raw.bars.forEach((/** @type {any} */ b, /** @type {number} */ i) => {
    if (!b || typeof b !== 'object') return;
    if (typeof b.chord === 'string') tab = putChord(tab, i, 0, b.chord); // the old one-chord-per-bar shape
    if (Array.isArray(b.chords)) for (const c of b.chords.slice(0, 32)) if (c && typeof c.name === 'string') {
      const cat = Number.isInteger(c.at) ? c.at * k : NaN;
      tab = putChord(tab, i, cat, c.name);
      if (typeof c.scale === 'string' || Array.isArray(c.positions)) tab = setChordPlan(tab, i, cat, { ...(typeof c.scale === 'string' ? { scale: c.scale } : {}), ...(Array.isArray(c.positions) ? { positions: c.positions.filter((/** @type {any} */ n) => typeof n === 'number') } : {}) });
    }
    const notes = Array.isArray(b.notes) ? b.notes.slice(0, 600) : [];
    for (const n of notes) {
      if (!n || typeof n !== 'object' || !Number.isInteger(n.len) || n.len < 1 || n.len * k > STEPS || !Number.isInteger(n.at)) continue;
      tab = putNote(tab, i, n.at * k, n.s, n.f, n.len * k);
      if (n.link || n.bend || n.vib) tab = setTechnique(tab, i, n.at * k, n.s, { link: n.link, bend: n.bend, vib: n.vib === true });
    }
  });
  if (raw.voicings && typeof raw.voicings === 'object') {
    for (const [name, idx] of Object.entries(raw.voicings).slice(0, 64)) if (typeof idx === 'number') tab = setVoicing(tab, name.slice(0, 16), idx);
  }
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
 * The tab as plain text (the classic ASCII layout): two characters per cell, as many bars per
 * line as fit in 72 columns, chord names above each bar. A bar is 16 cells (one per sixteenth)
 * - or 24 cells when the tab has triplets, so every note is placed at its nearest cell
 * (a triplet is only approximated in plain text).
 * @param {Tab} tab @param {number[]} midi open-string MIDI notes, top first @returns {string}
 */
export function tabToText(tab, midi) {
  const names = stringNames(midi), pad = Math.max(...names.map(n => n.length));
  const triplets = tab.bars.some(b => b.notes.some(n => n.at % SIXTEENTH !== 0 || n.len % SIXTEENTH !== 0));
  const unit = triplets ? 2 : SIXTEENTH, cells = STEPS / unit;
  const barLen = cells * 2, perLine = Math.max(1, Math.floor((72 - pad - 1) / (barLen + 1)));
  const cellOf = (/** @type {number} */ at) => Math.min(cells - 1, Math.round(at / unit));
  const lines = [];
  if (tab.title) lines.push(tab.title, '');
  for (let first = 0; first < tab.bars.length; first += perLine) {
    const group = tab.bars.slice(first, first + perLine);
    const line = Array(pad + 1 + group.length * (barLen + 1)).fill(' ');
    let any = false;
    group.forEach((b, gi) => b.chords.forEach(c => {
      const col = pad + 1 + gi * (barLen + 1) + cellOf(c.at) * 2;
      if (line.slice(col, col + c.name.length + 1).some(ch => ch !== ' ')) return; // would run into the previous name
      [...c.name].forEach((ch, k) => { line[col + k] = ch; }); any = true;
    }));
    if (any) lines.push(line.join('').trimEnd());
    midi.forEach((_, s) => {
      let row = names[s].padEnd(pad) + '|';
      for (const b of group) {
        const out = Array.from({ length: cells }, () => '--');
        for (const n of b.notes) if (n.s === s) out[cellOf(n.at)] = String(n.f).padEnd(2, '-');
        row += out.join('') + '|';
      }
      lines.push(row);
    });
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
