// Which note is being played: a pitch detector for one note at a time (a guitar string, a voice), and the arithmetic from a frequency to a
// note name and how many cents off it is. Pure, so it is tested on synthesised sound.
//
// The detector is the McLeod pitch method: the normalised square difference function
//     n(t) = 2 * sum(x[i] * x[i+t]) / sum(x[i]^2 + x[i+t]^2)
// is 1 where the waveform repeats exactly after t samples. The first peak that is nearly as high as the highest one is the period (taking the
// first keeps it from jumping an octave down onto a later, multiple peak), refined by fitting a parabola through the peak.

/** Equal temperament, A4 = 440 Hz (ISO 16): the note a frequency is nearest to, and how far off it is. @param {number} freq Hz @param {number} [a4] @returns {{midi:number, cents:number}} */
export function noteFromFreq(freq, a4 = 440) {
  const exact = 69 + 12 * Math.log2(freq / a4), midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}

/** @param {number} midi @param {number} [a4] @returns {number} Hz */
export const freqOfMidi = (midi, a4 = 440) => a4 * Math.pow(2, (midi - 69) / 12);

/**
 * @typedef {object} Pitch
 * @property {number} freq Hz
 * @property {number} clarity 0-1, how periodic the sound is (a clean sustained note is near 1, noise is low)
 * @property {number} rms loudness of the frame
 */

/**
 * The pitch of a frame of samples, or null when it is too quiet or not a clear single note.
 * @param {Float32Array} buf @param {number} sampleRate
 * @param {{minHz?:number, maxHz?:number, minClarity?:number, minRms?:number}} [o]
 * @returns {Pitch|null}
 */
export function detectPitch(buf, sampleRate, o = {}) {
  const { minHz = 65, maxHz = 1400, minClarity = 0.75, minRms = 0.002 } = o;
  const n = buf.length;
  // a microphone sits on a small DC offset; it would add a constant to every product below
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i];
  mean /= n;
  let sq = 0;
  for (let i = 0; i < n; i++) sq += (buf[i] - mean) * (buf[i] - mean);
  const rms = Math.sqrt(sq / n);
  if (rms < minRms) return null;
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz)), maxLag = Math.min(Math.floor(sampleRate / minHz), n >> 1);
  const w = n - maxLag; // every lag compares the same w samples
  if (w < maxLag) return null;
  const nsdf = new Float32Array(maxLag + 2);
  for (let t = 0; t <= maxLag + 1 && t + w <= n; t++) {
    let acf = 0, mm = 0;
    for (let i = 0; i < w; i++) { const x = buf[i] - mean, y = buf[i + t] - mean; acf += x * y; mm += x * x + y * y; }
    nsdf[t] = mm > 0 ? (2 * acf) / mm : 0;
  }
  // key maxima: the highest point of each stretch where the function is above zero, after it first dips below
  /** @type {number[]} */ const peaks = [];
  let t = 1;
  while (t < maxLag && nsdf[t] > 0) t++; // skip the lobe around zero lag
  while (t < maxLag) {
    while (t < maxLag && nsdf[t] <= 0) t++;
    let best = -1;
    while (t < maxLag && nsdf[t] > 0) { if (best < 0 || nsdf[t] > nsdf[best]) best = t; t++; }
    if (best >= minLag && nsdf[best] >= nsdf[best - 1] && nsdf[best] >= nsdf[best + 1]) peaks.push(best);
  }
  if (!peaks.length) return null;
  const top = Math.max(...peaks.map(p => nsdf[p]));
  const pick = peaks.find(p => nsdf[p] >= 0.9 * top);
  if (pick === undefined || nsdf[pick] < minClarity) return null;
  // parabolic interpolation through the peak
  const a = nsdf[pick - 1], b = nsdf[pick], c = nsdf[pick + 1], den = a - 2 * b + c;
  const shift = den === 0 ? 0 : (0.5 * (a - c)) / den;
  return { freq: sampleRate / (pick + shift), clarity: Math.min(1, b - 0.25 * (a - c) * shift), rms };
}
