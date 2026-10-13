// Chord voicings (fingerings), from data/voicings.json - converted from
// tombatossals/chords-db (MIT) by tools/build-voicings.mjs. A voicing is
// {f, g, b}: absolute fret per string in tuning order (0 = highest string,
// -1 = muted), finger numbers, and an optional barre {fret, from, to}.
import { esc } from './theory.js';

let data = null, pending = null;

export function loadVoicings() {
  if (data) return Promise.resolve(data);
  pending ||= fetch('./data/voicings.json')
    .then(r => r.json())
    .then(d => (data = d))
    .catch(() => (data = { guitar: {}, ukulele: {} }));
  return pending;
}

// Voicings for a chord, lowest on the neck first. [] until loaded or when
// the dataset has none for this chord type.
export function getVoicings(instrumentId, root, suffix) {
  return data?.[instrumentId]?.[`${root}|${suffix}`] || [];
}

export function voicingLabel(v) {
  const played = v.f.filter(f => f > 0);
  const lo = played.length ? Math.min(...played) : 0;
  return lo === 0 || lo <= 2 ? 'open' : `fret ${lo}`;
}

// Small chord box: strings left (lowest) to right (highest), nut or base-fret
// label, dots with finger numbers, barre bar, x / o markers above.
export function voicingDiagram(v, { size = 1, label = true } = {}) {
  const n = v.f.length, played = v.f.filter(f => f > 0);
  const maxF = played.length ? Math.max(...played) : 0, minF = played.length ? Math.min(...played) : 1;
  const base = maxF <= 4 ? 1 : minF;
  const rows = Math.max(4, maxF - base + 1);
  const SG = 14, FH = 16, L = 22, T = 22;
  const W = L + (n - 1) * SG + 14, H = T + rows * FH + 8;
  const sx = j => L + (n - 1 - j) * SG; // tuning index 0 = highest string = rightmost
  let g = `<svg class="vdiag" width="${W * size}" height="${H * size}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label ? voicingLabel(v) : 'chord voicing')}">`;
  for (let j = 0; j < n; j++) g += `<line x1="${sx(j)}" y1="${T}" x2="${sx(j)}" y2="${T + rows * FH}" stroke="currentColor" stroke-width="1" opacity=".55"/>`;
  for (let r = 0; r <= rows; r++) g += `<line x1="${sx(n - 1)}" y1="${T + r * FH}" x2="${sx(0)}" y2="${T + r * FH}" stroke="currentColor" stroke-width="${r === 0 && base === 1 ? 3 : 1}" opacity="${r === 0 && base === 1 ? 1 : .55}"/>`;
  if (base > 1) g += `<text x="${L - 8}" y="${T + FH * 0.7}" text-anchor="end" font-size="9" fill="currentColor" font-family="inherit">${base}</text>`;
  const cy = f => T + (f - base + 0.5) * FH;
  if (v.b) g += `<rect x="${sx(v.b.to) - 5}" y="${cy(v.b.fret) - 6}" width="${sx(v.b.from) - sx(v.b.to) + 10}" height="12" rx="6" fill="currentColor" opacity=".85"/>`;
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
