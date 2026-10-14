// Shareable progression links: the whole Progressions state lives in the URL
// hash, e.g.  #progressions?c=Am7+D7+Gmaj7&k=4:minor&x=<base64url json>
// Pure functions (no DOM) so they can be unit tested. Decoding treats the URL
// as untrusted input: unknown or malformed fields are dropped, never thrown on.

const MAX_TEXT = 400;
const KEY_RE = /^(auto|(1[01]|[0-9]):(major|minor))$/;

/** @typedef {import('./types.js').ProgressionLink} ProgressionLink */

const b64 = {
  /** @param {string} s @returns {string} */
  enc: s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  /** @param {string} s @returns {string} */
  dec: s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
};

/** @param {any} o @returns {boolean} */
const isPlainObj = o => o && typeof o === 'object' && !Array.isArray(o);
/** Copy only the entries of an untrusted object that pass `valid`. @param {any} o @param {(k:string, v:any) => boolean} valid @returns {Record<string, any>} */
const intKeyed = (o, valid) => {
  /** @type {Record<string, any>} */
  const out = {};
  if (!isPlainObj(o)) return out;
  for (const [k, v] of Object.entries(o)) if (k !== '__proto__' && k !== 'constructor' && valid(k, v)) out[k] = v;
  return out;
};

/** State -> "c=...&k=...&x=...". @param {Partial<ProgressionLink> & {instrument?:string}} s @returns {string} */
export function encodeProgression(s) {
  const q = new URLSearchParams();
  q.set('c', (s.text || '').trim().replace(/\s+/g, ' '));
  if (s.key && s.key !== 'auto') q.set('k', s.key);
  if (s.instrument && s.instrument !== 'guitar') q.set('i', s.instrument);
  if (s.tuning && s.tuning !== 'standard') q.set('t', s.tuning);
  if (s.capo !== undefined && Number.isInteger(s.capo) && s.capo > 0) q.set('cp', String(s.capo));
  if (s.leftHanded) q.set('lh', '1');
  /** @type {Record<string, any>} */
  const extra = {};
  for (const f of /** @type {const} */ (['pick', 'pos', 'vo'])) if (s[f] && Object.keys(s[f]).length) extra[f] = s[f];
  if (Object.keys(extra).length) q.set('x', b64.enc(JSON.stringify(extra)));
  return q.toString();
}

/** "#progressions?c=..." or "c=..." -> validated state, or null. Untrusted input. @param {string|null|undefined} hashOrQuery @returns {ProgressionLink|null} */
export function decodeProgression(hashOrQuery) {
  const raw = String(hashOrQuery || '');
  const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw.replace(/^#/, '');
  let q;
  try { q = new URLSearchParams(qs); } catch (e) { return null; }
  const text = (q.get('c') || '').slice(0, MAX_TEXT);
  if (!text.trim()) return null;
  /** @type {ProgressionLink} */
  const out = { text };
  const k = q.get('k');
  if (k && KEY_RE.test(k)) out.key = k;
  const i = q.get('i');
  if (i === 'guitar' || i === 'ukulele') out.instrument = i;
  const t = q.get('t');
  if (t && /^[a-z0-9-]{1,24}$/.test(t)) out.tuning = t;
  const cp = q.get('cp');
  if (cp && /^([1-9]|1[0-2])$/.test(cp)) out.capo = +cp;
  if (q.get('lh') === '1') out.leftHanded = true;
  const x = q.get('x');
  if (x) {
    try {
      const e = JSON.parse(b64.dec(x));
      if (isPlainObj(e)) {
        // pick: chord index -> scale id; pos: "chord|scale" -> 'all' | n | [n]; vo: chord name -> index
        out.pick = intKeyed(e.pick, (k2, v) => /^\d{1,3}$/.test(k2) && typeof v === 'string' && v.length < 40);
        out.pos = intKeyed(e.pos, (k2, v) => k2.length < 80 && (v === 'all' || Number.isInteger(v) || (Array.isArray(v) && v.length < 16 && v.every(Number.isInteger))));
        out.vo = intKeyed(e.vo, (k2, v) => k2.length < 40 && Number.isInteger(v) && v >= 0 && v < 100);
      }
    } catch (e) { /* ignore a corrupt x= */ }
  }
  return out;
}

/** Names an old link may use for a page (the Compose page was called "tab" at first). */
const TAB_ALIASES = /** @type {Record<string, string>} */ ({ tab: 'compose' });

/** The page named by a location hash: "#progressions?c=.." -> "progressions"; the old "#tab?d=.." -> "compose". @param {string|null|undefined} hash @returns {string} */
export function tabOf(hash) {
  const name = String(hash || '').replace(/^#/, '').split('?')[0];
  return TAB_ALIASES[name] || name;
}
