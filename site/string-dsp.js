// A plucked string, rendered offline into samples (pure code - no Web Audio - so it is unit tested in Node
// and works the same on every browser and origin). It is an extended Karplus-Strong model: a delay line one
// period long holds the string's shape; each time round, the loop filter takes a little energy and the
// brightest overtones away, so the sound darkens and fades like a real string.
//   * the pluck is a triangle (the string pulled aside at 17% of its length) with a little noise on top for the
//     pick, not random noise alone: the same note always sounds the same (no random loudness);
//   * the loop delay is tuned for the filter's own delay, and read with cubic interpolation, so notes are in
//     tune and bends, slides and vibrato are smooth pitch changes of the delay length;
//   * every note is scaled to the same loudness (set by `vol`), whatever its pitch;
//   * after the note's length the string is damped, like a finger or the next note stopping it.

/** The volume the lead line asks for (the simple synth's reference). */
export const REF_VOL = 0.16;
/** RMS level of a note of volume REF_VOL, measured over its first 0.2 s. */
export const TARGET_RMS = 0.11;
/** Samples the loop filter delays the string by, beyond its own group delay (found by measuring). */
const LOOP_DELAY_TRIM = 0.0;
const BUF = 4096, MASK = BUF - 1;

/**
 * How long a string at this pitch rings: seconds for its sound to fall by 60 dB (low strings ring longer).
 * @param {number} f Hz @returns {number}
 */
export const t60For = f => Math.min(6.5, Math.max(1.5, 6.5 * Math.pow(82.4 / f, 0.45)));

/** Gain of the loop filter y = a*x[n] + (1-a)*x[n-1] at angular frequency w. @param {number} a @param {number} w @returns {number} */
const filterGain = (a, w) => Math.sqrt(a * a + (1 - a) * (1 - a) + 2 * a * (1 - a) * Math.cos(w));

/** Small seeded generator (mulberry32). @param {number} seed @returns {() => number} */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * @typedef {object} StringNote
 * @property {number} freq   Hz
 * @property {number} dur    seconds the note is held (the string is damped a little after)
 * @property {number} vol    0-1, 0.16 is the lead line's usual
 * @property {number} [bend]       semitones bent up quickly early in the note
 * @property {boolean} [vib]       vibrato after the note has settled
 * @property {number} [slideTo]    Hz the pitch glides to ...
 * @property {number} [slideStart] ... starting this many seconds after the start ...
 * @property {number} [slideEnd]   ... and arriving this many seconds after the start
 */

/** How long the string rings before it is damped: a little past the written length, so notes on one string do not smear into each other. @param {StringNote} p @returns {number} */
export const ringOf = p => Math.min(4, Math.max(p.dur * 1.15, 0.25));
/** How long the sound of a note lasts in seconds (its ring plus the damping). @param {StringNote} p @returns {number} */
export const lengthOf = p => ringOf(p) + 0.2;

/**
 * Render one note.
 * @param {StringNote} p @param {number} sr sample rate @returns {Float32Array} mono samples
 */
export function renderString(p, sr) {
  const ring = ringOf(p), N = Math.ceil(lengthOf(p) * sr), out = new Float32Array(N);
  const f0 = p.freq;
  if (!(f0 > 20 && f0 < 5000)) return out;
  const vel = Math.min(1.5, Math.max(0.25, p.vol / REF_VOL));
  const hard = Math.min(1, Math.max(0, (vel - 0.25) / 1.25));           // 0 soft .. 1 hard pick
  // loop filter: weight of the newer of two samples (higher = brighter, and takes less away from the fundamental, which
  // matters for high notes: with many passes a second, even a small loss per pass would end them at once)
  const a = 0.55 + 0.3 * hard + (0.985 - 0.55 - 0.3 * hard) * Math.min(1, Math.max(0, (f0 - 300) / 1000));
  const buf = new Float32Array(BUF);
  // --- the pluck: a triangle pulled aside at 17% of the string, plus pick noise, as the delay line's first period ---
  const rand = rng(Math.round(f0 * 100) * 1009 + Math.round(vel * 100));
  const L = Math.floor(sr / f0 - (1 - a) - LOOP_DELAY_TRIM);
  const peak = Math.max(2, Math.round(L * 0.17));
  let lp = 0, mean = 0;
  /** @type {number[]} */ const shape = [];
  for (let i = 0; i < L; i++) {
    const tri = i < peak ? i / peak : (L - i) / (L - peak);
    lp += 0.45 * ((rand() * 2 - 1) - lp);                               // a little lowpassed noise: the pick
    shape.push(tri + (0.12 + 0.28 * hard) * lp);
    mean += shape[i];
  }
  mean /= L;
  let w = 0;
  for (let i = 0; i < L; i++) { buf[w & MASK] = shape[i] - mean; w++; }
  // --- the loop ---
  const T60 = t60For(f0);
  const bendEnd = Math.min(Math.max(p.dur * 0.45, 0.1), 0.3);
  const vibStart = p.dur * 0.35, vibLen = Math.max(0.1, p.dur * 0.65);
  const hasSlide = !!(p.slideTo && p.slideEnd !== undefined);
  const releaseAt = Math.round(ring * sr), releaseLen = Math.round(0.06 * sr);
  let prev = 0, ratio = 1, ratioNext = 1;
  /** Pitch multiplier at time t: bend, slide, vibrato. @param {number} t @returns {number} */
  const pitchAt = t => {
    let m = 1;
    if (p.bend) { const x = Math.min(1, Math.max(0, (t - 0.03) / (bendEnd - 0.03))); m *= Math.pow(2, (p.bend / 12) * x); }
    if (hasSlide) { const s0 = p.slideStart || 0, x = Math.min(1, Math.max(0, (t - s0) / Math.max(1e-3, /** @type {number} */ (p.slideEnd) - s0))); m *= Math.pow(/** @type {number} */ (p.slideTo) / f0, x); }
    if (p.vib && t > vibStart) { const depth = 25 * Math.min(1, (t - vibStart) / 0.25); m *= Math.pow(2, (depth * Math.sin(2 * Math.PI * 5.5 * (t - vibStart))) / 1200); }
    return m;
  };
  const STEP = 16;
  for (let n = 0; n < N; n++) {
    if (n % STEP === 0) { ratio = ratioNext; ratioNext = pitchAt((n + STEP) / sr); if (n === 0) ratio = pitchAt(0); }
    const m = ratio + (ratioNext - ratio) * ((n % STEP) / STEP);
    const D = Math.max(2.5, sr / (f0 * m) - (1 - a) - LOOP_DELAY_TRIM);
    // read the delay line D samples back, cubic (Hermite) interpolation
    const idx = w - D, i1 = Math.floor(idx), fr = idx - i1;
    const y0 = buf[(i1 - 1) & MASK], y1 = buf[i1 & MASK], y2 = buf[(i1 + 1) & MASK], y3 = buf[(i1 + 2) & MASK];
    const c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    const s = ((c3 * fr + c2) * fr + c1) * fr + y1;
    // the loop gain that makes the sound fall 60 dB in T60 seconds, a little more once the string is damped
    // (the loop filter itself takes some of the fundamental away: give most of that back, but never loop with a gain of 1 or more)
    let g = Math.min(0.9996, Math.pow(10, -3 / (T60 * f0 * m)) / filterGain(a, 2 * Math.PI * f0 * m / sr));
    if (n >= releaseAt) g *= 1 - 0.45 * Math.min(1, (n - releaseAt) / releaseLen);
    buf[w & MASK] = g * (a * s + (1 - a) * prev);
    prev = s;
    w++;
    out[n] = n >= releaseAt ? s * Math.exp(-(n - releaseAt) / (0.05 * sr)) : s;
  }
  // --- the same loudness for every pitch: scale so the first 0.2 s have the target RMS (scaled by the volume asked for) ---
  const a0 = Math.round(0.02 * sr), a1 = Math.min(N, Math.round(0.22 * sr));
  let e = 0; for (let i = a0; i < a1; i++) e += out[i] * out[i];
  const rms = Math.sqrt(e / Math.max(1, a1 - a0));
  const gain = rms > 1e-9 ? (TARGET_RMS * Math.min(2, vel)) / rms : 0;
  for (let i = 0; i < N; i++) out[i] *= gain;
  // --- the pick: a few milliseconds of bright noise at the very start, so the note has a definite attack (the string itself
  // already starts at full level; this is the "tick" the ear uses to place the note in time) ---
  const rc = rng(7 + Math.round(f0)), tick = Math.floor(0.006 * sr);
  let prevNoise = 0;
  for (let i = 0; i < tick && i < N; i++) { const nz = rc() * 2 - 1; out[i] += (nz - prevNoise) * 0.5 * TARGET_RMS * (0.5 + 1.5 * hard) * Math.exp(-i / (0.0015 * sr)); prevNoise = nz; }
  let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(out[i]));
  if (pk > 0.9) { const k = 0.9 / pk; for (let i = 0; i < N; i++) out[i] *= k; }
  return out;
}
