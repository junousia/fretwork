// Strumming and picking patterns for the backing chords (Progressions and Compose). Pure: a pattern says where in
// the bar the hits fall and how each one is played; `strumHits` lays it over a chord of any length and `hitNotes`
// turns a hit into the notes of the chord with their delays, volumes and lengths. player.js only schedules them.
const STORE_KEY = 'fw-strum';

/**
 * One hit of a pattern: `at` in beats from the start of the chord, `dir` d(own) or u(p) (up strums are lighter and
 * only catch the high strings), `vol` relative loudness, `len` how long it rings in beats (0 = until the next hit),
 * `string` for picked notes: the n-th lowest string of the chord (so it works for any tuning or instrument).
 * @typedef {{at:number, dir?:'d'|'u', vol?:number, len?:number, string?:number}} Hit
 * @typedef {{id:string, name:string, hint:string, hits:Hit[], spread?:number, once?:boolean}} Strum
 * `once`: the pattern is not repeated over a long chord (one strum, then let it ring). `spread` scales the time between strings (chops are tight, a slow strum is loose).
 */
const E = 0.5;
/** @type {Strum[]} */
export const STRUMS = [
  { id: 'single', name: 'One strum per chord', hint: 'a single down strum when the chord starts', once: true, hits: [{ at: 0, dir: 'd' }] },
  { id: 'quarters', name: 'Down on every beat', hint: 'D D D D', hits: [0, 1, 2, 3].map(b => ({ at: b, dir: /** @type {'d'} */ ('d'), vol: b % 2 ? 0.75 : 1 })) },
  { id: 'eighths', name: 'Down-up eighths', hint: 'D U D U D U D U', hits: [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ at: i * E, dir: /** @type {'d'|'u'} */ (i % 2 ? 'u' : 'd'), vol: i % 2 ? 0.55 : i % 4 ? 0.8 : 1 })) },
  { id: 'folk', name: 'Folk (D DU UDU)', hint: 'the campfire pattern: D, D U, U D U', hits: [[0, 'd', 1], [2, 'd', 0.85], [3, 'u', 0.55], [5, 'u', 0.6], [6, 'd', 0.85], [7, 'u', 0.55]].map(([i, dir, vol]) => ({ at: +i * E, dir: /** @type {'d'|'u'} */ (dir), vol: +vol })) },
  { id: 'ballad', name: 'Ballad (D . D U . U D U, soft)', hint: 'slow and loose, a little softer', spread: 1.6, hits: [[0, 'd', 1], [2, 'd', 0.7], [3, 'u', 0.45], [5, 'u', 0.45], [6, 'd', 0.7], [7, 'u', 0.45]].map(([i, dir, vol]) => ({ at: +i * E, dir: /** @type {'d'|'u'} */ (dir), vol: +vol })) },
  { id: 'offbeat', name: 'Off-beat chops (reggae / ska)', hint: 'short up-strokes on the "and" of each beat', spread: 0.4, hits: [1, 3, 5, 7].map(i => ({ at: i * E, dir: /** @type {'u'} */ ('u'), vol: 0.9, len: 0.2 })) },
  { id: 'bossa', name: 'Bossa nova', hint: 'D . . D D . . D - the syncopated bossa comping', spread: 0.6, hits: [[0, 1], [3, 0.7], [4, 0.9], [7, 0.7]].map(([i, vol]) => ({ at: +i * E, dir: /** @type {'d'} */ ('d'), vol: +vol, len: 0.8 })) },
  { id: 'chop', name: 'Swing chops (Freddie Green)', hint: 'short, tight down-strokes on every beat', spread: 0.3, hits: [0, 1, 2, 3].map(b => ({ at: b, dir: /** @type {'d'} */ ('d'), vol: b % 2 ? 0.8 : 1, len: 0.45 })) },
  { id: 'arpeggio', name: 'Arpeggio (picked)', hint: 'bass note, then the strings above it, eighth notes', hits: [0, 2, 3, 2, 1, 2, 3, 2].map((s, i) => ({ at: i * E, string: s, vol: i === 0 ? 1 : 0.6 })) },
  { id: 'travis', name: 'Travis picking', hint: 'alternating bass under a steady melody-string pattern', hits: [[0, 0], [1, 3], [2, 2], [3, 3], [4, 1], [5, 3], [6, 2], [7, 3]].map(([i, s]) => ({ at: +i * E, string: +s, vol: +s === 0 || +s === 1 ? 0.9 : 0.55 })) },
];

/** @param {string} id @returns {Strum} */
export const strumById = id => STRUMS.find(s => s.id === id) || STRUMS[0];

/**
 * The hits of a pattern over a chord that lasts `beats` beats: the pattern (one 4-beat bar) is repeated as long as the chord
 * lasts and cut at its end. Each hit also gets its length in beats (rings until the next hit, or the end of the chord).
 * @param {string} id @param {number} beats @returns {(Hit & {len:number})[]}
 */
export function strumHits(id, beats) {
  const p = strumById(id);
  /** @type {(Hit & {len:number})[]} */
  const out = [];
  for (let bar = 0; bar * 4 < beats && !(p.once && bar); bar++) for (const h of p.hits) {
    const at = bar * 4 + h.at;
    if (at < beats - 1e-9) out.push({ ...h, at, len: h.len || 0 });
  }
  out.forEach((h, i) => { if (!h.len) h.len = (i + 1 < out.length ? out[i + 1].at : beats) - h.at; });
  return out;
}

/**
 * The notes one hit plays. `midis` are the chord's notes (any order). A strum sounds them low to high (down) or high to low (up, lighter,
 * the top three strings only), `spacing` seconds apart; a picked hit is the one note `h.string` strings above the lowest.
 * @param {Hit} h @param {number[]} midis @param {number} spacing seconds between strings of a down strum @param {number} [spread] pattern's string-spacing factor
 * @returns {{midi:number, dt:number, vol:number}[]}
 */
export function hitNotes(h, midis, spacing, spread = 1) {
  const asc = [...midis].sort((a, b) => a - b);
  if (!asc.length) return [];
  const vol = h.vol ?? 1;
  if (h.string !== undefined) return [{ midi: asc[Math.min(h.string, asc.length - 1)], dt: 0, vol }];
  const sp = spacing * spread;
  if (h.dir === 'u') return asc.slice(-3).reverse().map((midi, i) => ({ midi, dt: i * sp * 0.7, vol }));
  return asc.map((midi, i) => ({ midi, dt: i * sp, vol }));
}

// The chosen pattern is one setting for both pages; browsers only.
/** @returns {string} */
export function getStrum() {
  try { const v = typeof window !== 'undefined' ? window.localStorage.getItem(STORE_KEY) : null; if (v && STRUMS.some(s => s.id === v)) return v; } catch (e) { /* default */ }
  return 'single';
}
/** @param {string} id */
export function setStrum(id) { try { if (STRUMS.some(s => s.id === id)) window.localStorage.setItem(STORE_KEY, id); } catch (e) { /* storage unavailable */ } }
