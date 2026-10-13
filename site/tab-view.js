// Draws a Tab as an SVG: chord names above each bar, one line per string (top
// string on top), fret numbers where the notes start, and note lengths as stems
// and flags below the staff. Bars wrap into rows. Styling comes from CSS classes
// (so dark mode and printing work); the geometry is exported so the editor can
// put its cursor and playhead in exactly the right place.
import { STEPS, stringNames } from './tab.js';
import { esc } from './music.js';

/** @typedef {import('./types.js').Tab} Tab */

export const STEP_W = 18, PAD = 8, BAR_W = STEPS * STEP_W + 2 * PAD, LEFT = 26, SG = 16, CHORD_H = 22, RHYTHM_H = 34;

/** Bars per row for an available width in px. @param {number} width @returns {number} */
export const barsPerRowFor = width => Math.max(1, Math.floor((width - LEFT - 2) / BAR_W));

/** @param {number} nStrings @returns {number} height of one row */
export const rowHeight = nStrings => CHORD_H + (nStrings - 1) * SG + 14 + RHYTHM_H + 12;

/** Where a step sits: x of its left edge, y of the top string line of its row. @param {number} nStrings @param {number} perRow @param {number} bar @param {number} at */
export function stepPos(nStrings, perRow, bar, at) {
  const row = Math.floor(bar / perRow), col = bar % perRow;
  return { x: LEFT + col * BAR_W + PAD + at * STEP_W, y: row * rowHeight(nStrings) + CHORD_H, row, col };
}

/**
 * @param {Tab} tab
 * @param {{midi:number[]}} inst open-string MIDI notes, top first
 * @param {{perRow:number, cursor?:{bar:number, at:number, s:number}|null, editable?:boolean}} opts
 * @returns {string}
 */
export function tabSvg(tab, inst, { perRow, cursor = null, editable = false }) {
  const n = inst.midi.length, names = stringNames(inst.midi);
  const rows = Math.ceil(tab.bars.length / perRow), W = LEFT + Math.min(perRow, tab.bars.length) * BAR_W + 2, H = rows * rowHeight(n);
  let g = `<svg class="tabsvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tab, ${tab.bars.length} bar${tab.bars.length === 1 ? '' : 's'}">`;
  for (let row = 0; row < rows; row++) {
    const y0 = row * rowHeight(n) + CHORD_H, bars = Math.min(perRow, tab.bars.length - row * perRow);
    names.forEach((nm, s) => { g += `<text class="tabname" x="${LEFT - 6}" y="${y0 + s * SG + 4}" text-anchor="end" font-size="11">${esc(nm)}</text>`; });
    for (let s = 0; s < n; s++) g += `<line class="tabline" x1="${LEFT}" y1="${y0 + s * SG}" x2="${LEFT + bars * BAR_W}" y2="${y0 + s * SG}"/>`;
    for (let c = 0; c <= bars; c++) g += `<line class="tabbar" x1="${LEFT + c * BAR_W}" y1="${y0}" x2="${LEFT + c * BAR_W}" y2="${y0 + (n - 1) * SG}"/>`;
  }
  tab.bars.forEach((bar, bi) => {
    const { x: bx, y: y0 } = stepPos(n, perRow, bi, 0);
    for (let beat = 1; beat < 4; beat++) g += `<line class="tabbeat" x1="${bx + beat * 4 * STEP_W}" y1="${y0 - 4}" x2="${bx + beat * 4 * STEP_W}" y2="${y0 + (n - 1) * SG + 4}"/>`;
    if (bar.chord) g += `<text class="tabchord" x="${bx - PAD + 4}" y="${y0 - 8}" font-size="13" font-weight="700">${esc(bar.chord)}</text>`;
    if (cursor && cursor.bar === bi) g += `<rect class="tabcursor" x="${bx + cursor.at * STEP_W}" y="${y0 + cursor.s * SG - SG / 2}" width="${STEP_W}" height="${SG}" rx="3"/>`;
    // note lengths: one stem per start, shortest note wins; flags for 16ths / 8ths, a dot for dotted, a ring for halves and wholes
    /** @type {Map<number, number>} */ const stems = new Map();
    bar.notes.forEach(nt => { if (nt.s < n) stems.set(nt.at, Math.min(stems.get(nt.at) ?? 99, nt.len)); });
    stems.forEach((len, at) => {
      const x = bx + at * STEP_W + STEP_W / 2, top = y0 + (n - 1) * SG + 12, bot = top + 18;
      if (len < 16) g += `<line class="tabstem" x1="${x}" y1="${top}" x2="${x}" y2="${bot}"/>`;
      const flags = len <= 1 ? 2 : len <= 3 ? 1 : 0;
      for (let k = 0; k < flags; k++) g += `<line class="tabstem" x1="${x}" y1="${bot - k * 4}" x2="${x + 6}" y2="${bot - k * 4 - 4}"/>`;
      if (len >= 8) g += `<circle class="tabring" cx="${x}" cy="${bot + 4}" r="3"/>`;
      if ([3, 6, 12].includes(len)) g += `<circle class="tabdot" cx="${x + 5}" cy="${(len >= 8 ? bot + 4 : bot) + 1}" r="1.5"/>`;
    });
    bar.notes.forEach(nt => {
      if (nt.s >= n) return;
      const x = bx + nt.at * STEP_W + STEP_W / 2, y = y0 + nt.s * SG, label = String(nt.f), w = label.length * 7 + 4;
      g += `<rect class="tabfretbg" x="${x - w / 2}" y="${y - 7}" width="${w}" height="14"/>`;
      g += `<text class="fret" data-bar="${bi}" data-at="${nt.at}" data-s="${nt.s}" x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="600">${label}</text>`;
    });
    if (editable) for (let at = 0; at < STEPS; at++) for (let s = 0; s < n; s++) {
      g += `<rect class="tabhit" data-bar="${bi}" data-at="${at}" data-s="${s}" x="${bx + at * STEP_W}" y="${y0 + s * SG - SG / 2}" width="${STEP_W}" height="${SG}" fill="transparent"/>`;
    }
  });
  return g + '</svg>';
}
