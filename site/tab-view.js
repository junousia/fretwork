// Draws a Tab as an SVG: chord names above each bar, one line per string (top
// string on top), fret numbers where the notes start, and note lengths as stems
// and flags below the staff. Bars wrap into rows. Styling comes from CSS classes
// (so dark mode and printing work); the geometry is exported so the editor can
// put its cursor and playhead in exactly the right place.
import { STEPS, BEAT, SIXTEENTH, TRIPLET_LENGTHS, BEND_NAMES, BENDS, linkedNext, stringNames } from './tab.js';
import { esc } from './music.js';

/** @typedef {import('./types.js').Tab} Tab */

export const STEP_W = 6, PAD = 8, BAR_W = STEPS * STEP_W + 2 * PAD, LEFT = 26, SG = 16, CHORD_H = 30, RHYTHM_H = 46;

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
 * @param {{perRow:number, cursor?:{bar:number, at:number, s:number, w?:number}|null, editable?:boolean, grid?:number, numberFrom?:number}} opts  grid = steps per click cell (default a sixteenth; triplets use their own length); numberFrom = draw bar numbers, the first being this one
 * @returns {string}
 */
export function tabSvg(tab, inst, { perRow, cursor = null, editable = false, grid = SIXTEENTH, numberFrom }) {
  const n = inst.midi.length, names = stringNames(inst.midi);
  const rows = Math.ceil(tab.bars.length / perRow), W = LEFT + Math.min(perRow, tab.bars.length) * BAR_W + 2, H = rows * rowHeight(n);
  let g = `<svg class="tabsvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tab notation, ${tab.bars.length} bar${tab.bars.length === 1 ? '' : 's'}">`;
  for (let row = 0; row < rows; row++) {
    const y0 = row * rowHeight(n) + CHORD_H, bars = Math.min(perRow, tab.bars.length - row * perRow);
    names.forEach((nm, s) => { g += `<text class="tabname" x="${LEFT - 6}" y="${y0 + s * SG + 4}" text-anchor="end" font-size="11">${esc(nm)}</text>`; });
    for (let s = 0; s < n; s++) g += `<line class="tabline" x1="${LEFT}" y1="${y0 + s * SG}" x2="${LEFT + bars * BAR_W}" y2="${y0 + s * SG}"/>`;
    for (let c = 0; c <= bars; c++) g += `<line class="tabbar" x1="${LEFT + c * BAR_W}" y1="${y0}" x2="${LEFT + c * BAR_W}" y2="${y0 + (n - 1) * SG}"/>`;
  }
  tab.bars.forEach((bar, bi) => {
    const { x: bx, y: y0 } = stepPos(n, perRow, bi, 0);
    for (let beat = 1; beat < 4; beat++) g += `<line class="tabbeat" x1="${bx + beat * BEAT * STEP_W}" y1="${y0 - 4}" x2="${bx + beat * BEAT * STEP_W}" y2="${y0 + (n - 1) * SG + 4}"/>`;
    if (numberFrom !== undefined) g += `<text class="tabbarno" x="${bx - PAD - 2}" y="${y0 - 20}" text-anchor="end" font-size="8">${numberFrom + bi}</text>`;
    bar.chords.forEach(c => { g += `<text class="tabchord" x="${bx + c.at * STEP_W}" y="${y0 - 16}" font-size="13" font-weight="700">${esc(c.name)}</text>`; });
    if (cursor && cursor.bar === bi) g += `<rect class="tabcursor" x="${bx + cursor.at * STEP_W}" y="${y0 + cursor.s * SG - SG / 2}" width="${Math.max(STEP_W * SIXTEENTH, (cursor.w ?? SIXTEENTH) * STEP_W)}" height="${SG}" rx="3"/>`;
    // note lengths: one stem per start, shortest note wins; flags for 16ths / 8ths, a dot for dotted, a ring for halves and wholes
    /** @type {Map<number, number>} */ const stems = new Map();
    bar.notes.forEach(nt => { if (nt.s < n) stems.set(nt.at, Math.min(stems.get(nt.at) ?? 99, nt.len)); });
    stems.forEach((len, at) => {
      const x = bx + at * STEP_W + STEP_W * 1.5, top = y0 + (n - 1) * SG + 12, bot = top + 18;
      if (len < STEPS) g += `<line class="tabstem" x1="${x}" y1="${top}" x2="${x}" y2="${bot}"/>`;
      const flags = len <= 3 ? 2 : len <= 9 ? 1 : 0;
      for (let k = 0; k < flags; k++) g += `<line class="tabstem" x1="${x}" y1="${bot - k * 4}" x2="${x + 6}" y2="${bot - k * 4 - 4}"/>`;
      if (len >= 24) g += `<circle class="tabring" cx="${x}" cy="${bot + 4}" r="3"/>`;
      if ([9, 18, 36].includes(len)) g += `<circle class="tabdot" cx="${x + 5}" cy="${(len >= 24 ? bot + 4 : bot) + 1}" r="1.5"/>`;
    });
    // triplets: a bracket with a 3 under the stems over each group (three notes in the time of two)
    const groups = new Set();
    bar.notes.forEach(nt => {
      if (nt.s >= n || !TRIPLET_LENGTHS.includes(nt.len)) return;
      let span = nt.len * 3;
      // a long-short pair (a triplet quarter then a triplet eighth - the shuffle) is one triplet beat; so is a lone triplet quarter that is not part of a group of three
      if (nt.len === 8 && (bar.notes.some(m => m.s < n && m.len === 4 && m.at === nt.at + 8) || ![0, 8, 16].includes(nt.at % 24))) span = BEAT;
      groups.add(`${Math.floor(nt.at / span) * span}:${span}`);
    });
    groups.forEach(key => {
      const [start, span] = key.split(':').map(Number), x1 = bx + start * STEP_W + 3, x2 = bx + (start + span) * STEP_W - 3, y = y0 + (n - 1) * SG + 12 + 18 + 12;
      g += `<path class="tabtuplet" d="M${x1} ${y - 4}V${y}H${x2}V${y - 4}" fill="none"/><text class="tabtupletnum" x="${(x1 + x2) / 2}" y="${y + 11}" text-anchor="middle" font-size="10" font-weight="700">3</text>`;
    });
    bar.notes.forEach(nt => {
      if (nt.s >= n) return;
      const x = bx + nt.at * STEP_W + STEP_W * 1.5, y = y0 + nt.s * SG, label = String(nt.f), w = label.length * 7 + 4;
      g += `<rect class="tabfretbg" x="${x - w / 2}" y="${y - 7}" width="${w}" height="14"/>`;
      g += `<text class="fret" data-bar="${bi}" data-at="${nt.at}" data-s="${nt.s}" x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="600">${label}</text>`;
    });
    // techniques: a slur (hammer-on h / pull-off p) or a slanted line (slide) to the next note, a bend arrow with its size, vibrato
    bar.notes.forEach(nt => {
      if (nt.s >= n) return;
      const x = bx + nt.at * STEP_W + STEP_W * 1.5, y = y0 + nt.s * SG, next = nt.link ? linkedNext(bar.notes, nt) : undefined;
      if (next) {
        const x2 = bx + next.at * STEP_W + STEP_W * 1.5, up = next.f > nt.f;
        if (nt.link === 'h') {
          g += `<path class="tablink" d="M${x + 5} ${y - 8}Q${(x + x2) / 2} ${y - 20} ${x2 - 5} ${y - 8}" fill="none"/>`;
          if (next.f !== nt.f) g += `<text class="tablinkletter" x="${(x + x2) / 2}" y="${y - 14}" text-anchor="middle" font-size="9" font-weight="700">${up ? 'h' : 'p'}</text>`;
        } else g += `<line class="tablink" x1="${x + 7}" y1="${up ? y + 4 : y - 4}" x2="${x2 - 7}" y2="${up ? y - 4 : y + 4}"/>`;
      }
      if (nt.bend) g += `<path class="tabbend" d="M${x + 6} ${y + 3}C${x + 12} ${y + 3} ${x + 14} ${y - 3} ${x + 14} ${y - 9}M${x + 11} ${y - 7}L${x + 14} ${y - 11}L${x + 17} ${y - 7}" fill="none"/><text class="tablinkletter" x="${x + 14}" y="${y - 13}" text-anchor="middle" font-size="9" font-weight="700">${BEND_NAMES[BENDS.indexOf(nt.bend)]}</text>`;
      if (nt.vib) g += `<path class="tabbend" d="M${x + 8} ${y}q2 -3 4 0t4 0t4 0t4 0" fill="none"/>`;
    });
    if (editable) for (let at = 0; at < STEPS; at += grid) for (let s = 0; s < n; s++) {
      g += `<rect class="tabhit" data-bar="${bi}" data-at="${at}" data-s="${s}" x="${bx + at * STEP_W}" y="${y0 + s * SG - SG / 2}" width="${grid * STEP_W}" height="${SG}" fill="transparent"/>`;
    }
  });
  return g + '</svg>';
}
