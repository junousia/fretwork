// Chord voicings (fingerings), from data/voicings.json - converted from
// tombatossals/chords-db (MIT) by tools/build-voicings.mjs. A voicing is
// {f, g, b}: absolute fret per string in tuning order (0 = highest string,
// -1 = muted), finger numbers, and an optional barre {fret, from, to}.
import { esc } from './music.js';

/** @typedef {import('./types.js').Voicing} Voicing */
/** @typedef {import('./types.js').Instrument} Instrument */

/** @type {Record<string, Record<string, Voicing[]>>|null} */
let data = null;
/** @type {Promise<Record<string, Record<string, Voicing[]>>>|null} */
let pending = null;

// Tests inject the dataset instead of fetching it.
/** @param {Record<string, Record<string, Voicing[]>>} d */
export function useVoicingData(d) { data = d; }

export function loadVoicings() {
  if (data) return Promise.resolve(data);
  pending ||= fetch('./data/voicings.json')
    .then(r => r.json())
    .then(d => (data = d))
    .catch(() => (data = { guitar: {}, ukulele: {} }));
  return pending;
}

// Voicings for a chord on an instrument (as returned by getInstrument()),
// lowest on the neck first. [] until loaded or when none apply.
//
// The data is for standard tuning only, but a stored shape also works in
// another tuning whenever every string the shape PLAYS is shifted by the same
// number of semitones T from standard (muted strings may differ): capo c is
// T=c, half-step-down is T=11, baritone ukulele T=7, and Drop D keeps every
// shape that leaves the low string unplayed. A shape for root R-T in standard
// tuning then sounds chord root R. Extra low strings (7-string) stay muted.
/** @param {Pick<Instrument, 'id'|'standardPcs'|'tuning'>} inst @param {number} root @param {string} suffix @returns {Voicing[]} */
export function getVoicings(inst, root, suffix) {
  const std = data?.[inst.id];
  if (!std) return [];
  const n = inst.standardPcs.length, m = inst.tuning.length;
  const out = [], seen = new Set();
  for (let T = 0; T < 12; T++) {
    for (const v of std[`${(root - T + 12) % 12}|${suffix}`] || []) {
      const fits = v.f.every((f, j) => f < 0 || inst.tuning[j] === (inst.standardPcs[j] + T) % 12);
      if (!fits) continue;
      const pad = Array(Math.max(0, m - n)).fill(-1);
      const shaped = { f: [...v.f, ...pad], g: [...v.g, ...pad.map(() => 0)], b: v.b };
      const key = JSON.stringify(shaped);
      if (!seen.has(key)) { seen.add(key); out.push(shaped); }
    }
  }
  /** @param {Voicing} v */
  const low = v => Math.min(...v.f.filter(f => f > 0), 99);
  return out.sort((a, b) => low(a) - low(b));
}

/** @param {Voicing} v @returns {string} */
export function voicingLabel(v) {
  const played = v.f.filter(f => f > 0);
  const lo = played.length ? Math.min(...played) : 0;
  return lo === 0 || lo <= 2 ? 'open' : `fret ${lo}`;
}

// Small chord box: strings left (lowest) to right (highest), nut or base-fret
// label, dots with finger numbers, barre bar, x / o markers above.
/** Small chord box as an SVG string. @param {Voicing} v @param {{size?:number, label?:boolean, mirror?:boolean}} [opts] @returns {string} */
export function voicingDiagram(v, { size = 1, label = true, mirror = false } = {}) {
  const n = v.f.length, played = v.f.filter(f => f > 0);
  const maxF = played.length ? Math.max(...played) : 0, minF = played.length ? Math.min(...played) : 1;
  const base = maxF <= 4 ? 1 : minF;
  const rows = Math.max(4, maxF - base + 1);
  const SG = 14, FH = 16, L = 22, T = 22;
  const W = L + (n - 1) * SG + 14, H = T + rows * FH + 8;
  // tuning index 0 = highest string = rightmost (leftmost when mirrored for left-handed players)
  /** @param {number} j string index */
  const sx = j => mirror ? L + j * SG : L + (n - 1 - j) * SG;
  let g = `<svg class="vdiag" width="${W * size}" height="${H * size}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label ? voicingLabel(v) : 'chord voicing')}">`;
  for (let j = 0; j < n; j++) g += `<line x1="${sx(j)}" y1="${T}" x2="${sx(j)}" y2="${T + rows * FH}" stroke="currentColor" stroke-width="1" opacity=".55"/>`;
  for (let r = 0; r <= rows; r++) g += `<line x1="${Math.min(sx(0), sx(n - 1))}" y1="${T + r * FH}" x2="${Math.max(sx(0), sx(n - 1))}" y2="${T + r * FH}" stroke="currentColor" stroke-width="${r === 0 && base === 1 ? 3 : 1}" opacity="${r === 0 && base === 1 ? 1 : .55}"/>`;
  if (base > 1) g += `<text x="${mirror ? L + (n - 1) * SG + 8 : L - 8}" y="${T + FH * 0.7}" text-anchor="${mirror ? 'start' : 'end'}" font-size="9" fill="currentColor" font-family="inherit">${base}</text>`;
  /** @param {number} f fret */
  const cy = f => T + (f - base + 0.5) * FH;
  if (v.b) g += `<rect x="${Math.min(sx(v.b.to), sx(v.b.from)) - 5}" y="${cy(v.b.fret) - 6}" width="${Math.abs(sx(v.b.from) - sx(v.b.to)) + 10}" height="12" rx="6" fill="currentColor" opacity=".85"/>`;
  v.f.forEach((f, j) => {
    const x = sx(j);
    if (f < 0) g += `<text x="${x}" y="${T - 7}" text-anchor="middle" font-size="9" fill="currentColor" font-family="inherit">×</text>`;
    else if (f === 0) g += `<circle cx="${x}" cy="${T - 9}" r="3" fill="none" stroke="currentColor" stroke-width="1"/>`;
    else {
      const barred = v.b && f === v.b.fret && j >= v.b.from && j <= v.b.to;
      if (!barred) g += `<circle cx="${x}" cy="${cy(f)}" r="5.5" fill="currentColor"/>`;
      if (v.g[j] > 0) g += `<text x="${x}" y="${cy(f) + 3}" text-anchor="middle" font-size="8" font-weight="700" fill="var(--chip-num,#fff)" font-family="inherit">${v.g[j]}</text>`;
    }
  });
  return g + '</svg>';
}

/**
 * Every voicing as a row of tappable chord boxes (the pressed one is the selection).
 * @param {Voicing[]} list @param {number} selected index into list, or -1 for none
 * @param {{id:string, base?:number, mirror?:boolean}} o base = the number data-vo starts at
 * @returns {string}
 */
export function voicingGallery(list, selected, { id, base = 0, mirror = false }) {
  return `<div class="vogal" id="${id}" role="group" aria-label="Chord voicing">${list.map((v, k) =>
    `<button type="button" class="chip vobtn" data-vo="${k + base}" title="${esc(voicingLabel(v))}" aria-pressed="${k === selected}">${voicingDiagram(v, { label: false, mirror })}<span>${esc(voicingLabel(v))}${v.b ? ' \u00b7 barre' : ''}</span></button>`).join('')}</div>`;
}
