// Shareable tab links: the whole tab (notes, techniques, chords, chosen voicings,
// scale/position choices), the instrument setup and the generator settings (seed
// included) live in the URL hash, e.g.  #compose?i=ukulele&cp=2&d=<base64url json> (links made when the page was called "tab" still open).
// Pure functions (no DOM) so they can be unit tested. Decoding treats the URL as
// untrusted input: anything malformed is dropped or repaired, never thrown on.
import { normalizeTab } from './tab.js';
import { STYLES, DENSITIES, FEELS, EVOLVES } from './solo.js';

/** @typedef {import('./types.js').Tab} Tab */
/** @typedef {{style:string, density:string, feel:string, tech:string, evolve:string, key:string, seed:number}} GenSettings */
/** @typedef {{instrument?:string, tuning?:string, capo?:number, leftHanded?:boolean}} SetupLink */

const MAX_QUERY = 60000, MAX_JSON = 200000;
const KEY_RE = /^(auto|(1[01]|[0-9]):(major|minor))$/;

const b64 = {
  /** @param {string} s @returns {string} */
  enc: s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  /** @param {string} s @returns {string} */
  dec: s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
};

/** A note's technique as one small number: link h=1 s=2, bend x10, vibrato x100. @param {import('./types.js').TabNote} n @returns {number} */
const techCode = n => (n.link === 'h' ? 1 : n.link === 's' ? 2 : 0) + (n.bend || 0) * 10 + (n.vib ? 100 : 0);

/**
 * @param {{tab:Tab, setup?:SetupLink, gen?:GenSettings}} s
 * @returns {string} the query part ("i=ukulele&d=...") of a #compose link
 */
export function encodeTabLink({ tab, setup = {}, gen }) {
  const q = new URLSearchParams();
  if (setup.instrument && setup.instrument !== 'guitar') q.set('i', setup.instrument);
  if (setup.tuning && setup.tuning !== 'standard') q.set('t', setup.tuning);
  if (setup.capo !== undefined && Number.isInteger(setup.capo) && setup.capo > 0) q.set('cp', String(setup.capo));
  if (setup.leftHanded) q.set('lh', '1');
  /** @type {Record<string, any>} */
  const compact = {
    v: 1, n: tab.title, b: tab.bpm,
    r: tab.bars.map(b => [
      b.chords.map(c => (c.scale || c.positions ? [c.at, c.name, c.scale || 0, c.positions || 0] : [c.at, c.name])),
      b.notes.map(n => { const code = techCode(n); return code ? [n.at, n.len, n.s, n.f, code] : [n.at, n.len, n.s, n.f]; }),
    ]),
  };
  if (tab.voicings && Object.keys(tab.voicings).length) compact.o = tab.voicings;
  if (gen) compact.g = [gen.style, gen.density, gen.feel, gen.tech, gen.evolve, gen.key, gen.seed];
  q.set('d', b64.enc(JSON.stringify(compact)));
  return q.toString();
}

/** @param {any} o @returns {boolean} */
const isArr = o => Array.isArray(o);

/**
 * "#compose?d=..." (or just the query) -> the tab and the settings it came with, or null. Untrusted input.
 * @param {string|null|undefined} hashOrQuery
 * @returns {{tab:Tab, setup:SetupLink, gen?:GenSettings}|null}
 */
export function decodeTabLink(hashOrQuery) {
  const raw = String(hashOrQuery || '');
  if (raw.length > MAX_QUERY) return null;
  const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw.replace(/^#/, '');
  let q;
  try { q = new URLSearchParams(qs); } catch (e) { return null; }
  const d = q.get('d');
  if (!d) return null;
  /** @type {any} */ let c;
  try { const json = b64.dec(d); if (json.length > MAX_JSON) return null; c = JSON.parse(json); } catch (e) { return null; }
  if (!c || typeof c !== 'object' || c.v !== 1 || !isArr(c.r) || !c.r.length) return null;
  const bars = c.r.slice(0, 64).map((/** @type {any} */ b) => {
    const chords = isArr(b) && isArr(b[0]) ? b[0].slice(0, 32) : [], notes = isArr(b) && isArr(b[1]) ? b[1].slice(0, 600) : [];
    return {
      chords: chords.filter(isArr).map((/** @type {any[]} */ x) => ({ at: x[0], name: x[1], ...(typeof x[2] === 'string' ? { scale: x[2] } : {}), ...(isArr(x[3]) ? { positions: x[3] } : {}) })),
      notes: notes.filter(isArr).map((/** @type {any[]} */ x) => {
        const code = Number.isInteger(x[4]) ? x[4] : 0, link = code % 10 === 1 ? 'h' : code % 10 === 2 ? 's' : undefined, bend = Math.floor(code / 10) % 10;
        return { at: x[0], len: x[1], s: x[2], f: x[3], ...(link ? { link } : {}), ...(bend ? { bend } : {}), ...(code >= 100 ? { vib: true } : {}) };
      }),
    };
  });
  const voicings = c.o && typeof c.o === 'object' && !isArr(c.o) ? c.o : undefined;
  const tab = normalizeTab({ title: typeof c.n === 'string' ? c.n : '', bpm: c.b, res: 48, bars, voicings });
  if (!tab) return null;
  /** @type {SetupLink} */ const setup = {};
  const i = q.get('i'); setup.instrument = i === 'ukulele' ? 'ukulele' : 'guitar';
  const t = q.get('t'); if (t && /^[a-z0-9-]{1,24}$/.test(t)) setup.tuning = t;
  const cp = q.get('cp'); if (cp && /^([1-9]|1[0-2])$/.test(cp)) setup.capo = +cp;
  if (q.get('lh') === '1') setup.leftHanded = true;
  /** @type {GenSettings|undefined} */ let gen;
  if (isArr(c.g)) {
    const [style, density, feel, tech, evolve, key, seed] = c.g;
    if (STYLES.some(x => x.id === style) && DENSITIES.some(x => x.id === density) && FEELS.some(x => x.id === feel) && ['off', 'some', 'lots'].includes(tech)
      && EVOLVES.some(x => x.id === evolve) && typeof key === 'string' && KEY_RE.test(key) && Number.isInteger(seed) && seed >= 1 && seed <= 999999) gen = { style, density, feel, tech, evolve, key, seed };
  }
  return { tab, setup, ...(gen ? { gen } : {}) };
}
