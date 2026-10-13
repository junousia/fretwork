// Shareable progression links: the whole Progressions state lives in the URL
// hash, e.g.  #progressions?c=Am7+D7+Gmaj7&k=4:minor&x=<base64url json>
// Pure functions (no DOM) so they can be unit tested. Decoding treats the URL
// as untrusted input: unknown or malformed fields are dropped, never thrown on.

const MAX_TEXT = 400;
const KEY_RE = /^(auto|(1[01]|[0-9]):(major|minor))$/;

const b64 = {
  enc: s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
};

const isPlainObj = o => o && typeof o === 'object' && !Array.isArray(o);
const intKeyed = (o, valid) => {
  const out = {};
  if (!isPlainObj(o)) return out;
  for (const [k, v] of Object.entries(o)) if (k !== '__proto__' && k !== 'constructor' && valid(k, v)) out[k] = v;
  return out;
};

// state: {text, key, instrument, pick, pos, vo}  ->  "c=...&k=...&x=..."
export function encodeProgression(s) {
  const q = new URLSearchParams();
  q.set('c', (s.text || '').trim().replace(/\s+/g, ' '));
  if (s.key && s.key !== 'auto') q.set('k', s.key);
  if (s.instrument && s.instrument !== 'guitar') q.set('i', s.instrument);
  if (s.tuning && s.tuning !== 'standard') q.set('t', s.tuning);
  if (Number.isInteger(s.capo) && s.capo > 0) q.set('cp', String(s.capo));
  if (s.leftHanded) q.set('lh', '1');
  const extra = {};
  for (const f of ['pick', 'pos', 'vo']) if (s[f] && Object.keys(s[f]).length) extra[f] = s[f];
  if (Object.keys(extra).length) q.set('x', b64.enc(JSON.stringify(extra)));
  return q.toString();
}

// "#progressions?c=..." or "c=..." -> validated partial state, or null
export function decodeProgression(hashOrQuery) {
  const raw = String(hashOrQuery || '');
  const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw.replace(/^#/, '');
  let q;
  try { q = new URLSearchParams(qs); } catch (e) { return null; }
  const text = (q.get('c') || '').slice(0, MAX_TEXT);
  if (!text.trim()) return null;
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

// the tab name of a location hash: "#progressions?c=.." -> "progressions"
export function tabOf(hash) {
  return String(hash || '').replace(/^#/, '').split('?')[0];
}
