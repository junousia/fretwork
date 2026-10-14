// The plucked-string voice, measured: tuning, loudness, decay, damping, bends, slides, vibrato and timbre.
// Pure Node - string-dsp.js renders samples with no Web Audio, so everything here is deterministic.
import { renderString, lengthOf, ringOf, t60For, REF_VOL, TARGET_RMS } from '../site/string-dsp.js';

let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };
const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
const rmsOf = (x, a, n) => { let s = 0, c = 0; for (let i = a; i < a + n && i < x.length; i++) { s += x[i] * x[i]; c++; } return Math.sqrt(s / Math.max(1, c)); };

/** Pitch of a stretch by autocorrelation with parabolic interpolation, searched within +-10% of f0. */
function pitchOf(x, sr, from, len, f0) {
  const lo = Math.floor(sr / (f0 * 1.1)), hi = Math.ceil(sr / (f0 * 0.9)), r = {};
  for (let lag = lo - 1; lag <= hi + 1; lag++) { let s = 0; for (let i = 0; i < len - lag; i++) s += x[from + i] * x[from + i + lag]; r[lag] = s; }
  let bl = lo; for (let lag = lo; lag <= hi; lag++) if (r[lag] > r[bl]) bl = lag;
  const a = r[bl - 1], b = r[bl], c = r[bl + 1];
  return sr / (bl + (a - c) / (2 * (a - 2 * b + c)));
}
const cents = (a, b) => 1200 * Math.log2(a / b);

/** Magnitude spectrum of a stretch (Hann window, radix-2 FFT). */
function spectrum(x, from, n) {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (x[from + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k), a = i + k, b = i + k + len / 2;
      const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
  return Float64Array.from({ length: n / 2 }, (_, i) => Math.hypot(re[i], im[i]));
}
const centroid = (x, sr, from, n) => { const m = spectrum(x, from, n); let s = 0, w = 0; m.forEach((v, i) => { s += v * ((i * sr) / n); w += v; }); return s / w; };
/** Time until the 50 ms RMS has fallen 20 dB below its value at 0.15 s. */
function t20(x, sr) {
  const ref = rmsOf(x, Math.floor(0.15 * sr), Math.floor(0.05 * sr));
  for (let t = 0.2; t < x.length / sr - 0.06; t += 0.05) if (rmsOf(x, Math.floor(t * sr), Math.floor(0.05 * sr)) < ref * 0.1) return t - 0.15;
  return x.length / sr;
}

// --- tuning: every note of a guitar's range, at the sample rates the app uses
for (const sr of [22050, 44100, 48000]) {
  let worst = 0, at = 0;
  for (let midi = 40; midi <= 88; midi++) {
    const f = hz(midi), x = renderString({ freq: f, dur: 1, vol: REF_VOL }, sr);
    const c = Math.abs(cents(pitchOf(x, sr, Math.floor(0.15 * sr), Math.floor(0.19 * sr), f), f));
    if (c > worst) { worst = c; at = midi; }
  }
  assert(worst < 3, `${sr} Hz: every note from E2 to E6 is within 3 cents of its pitch (worst ${worst.toFixed(2)} at midi ${at})`);
  console.log(`tuning at ${sr} Hz: worst ${worst.toFixed(2)} cents (midi ${at})`);
}

const SR = 22050;
// --- loudness: the same for every pitch, and proportional to the volume asked for
{
  const lv = midi => rmsOf(renderString({ freq: hz(midi), dur: 1, vol: REF_VOL }, SR), Math.floor(0.02 * SR), Math.floor(0.2 * SR));
  const all = []; for (let midi = 40; midi <= 88; midi++) all.push(lv(midi));
  const db = v => 20 * Math.log10(v / TARGET_RMS);
  assert(all.every(v => Math.abs(db(v)) < 0.5), `every note has the target loudness within 0.5 dB (${Math.min(...all.map(db)).toFixed(2)} .. ${Math.max(...all.map(db)).toFixed(2)} dB)`);
  const f = hz(55), a = rmsOf(renderString({ freq: f, dur: 1, vol: 0.08 }, SR), Math.floor(0.02 * SR), Math.floor(0.2 * SR)), b = rmsOf(renderString({ freq: f, dur: 1, vol: REF_VOL }, SR), Math.floor(0.02 * SR), Math.floor(0.2 * SR));
  assert(Math.abs(20 * Math.log10(b / a) - 6) < 1, `half the volume is about 6 dB quieter (${(20 * Math.log10(b / a)).toFixed(1)} dB)`);
  const loud = renderString({ freq: f, dur: 1, vol: 0.9 }, SR); let pk = 0; for (const v of loud) pk = Math.max(pk, Math.abs(v));
  assert(pk <= 0.9001 && Number.isFinite(pk), `even a very loud note never clips (peak ${pk.toFixed(3)})`);
}

// --- decay: low strings ring longer, every note rings for a believable time
{
  const d = [40, 52, 64, 76, 88].map(m => t20(renderString({ freq: hz(m), dur: 4, vol: REF_VOL }, SR), SR));
  console.log(`time to fall 20 dB at E2 C#3... E4 E5 E6: ${d.map(v => v.toFixed(2)).join(' ')} s`);
  assert(d.every((v, i) => i === 0 || v < d[i - 1]), 'higher strings die away sooner than lower ones');
  assert(d[0] > 1.5 && d[0] < 4, `a low E rings for a couple of seconds (${d[0].toFixed(2)} s to -20 dB)`);
  assert(d[3] > 0.45 && d[4] > 0.25, `even the high notes ring a little (${d[3].toFixed(2)} s at E5, ${d[4].toFixed(2)} s at E6)`);
  assert(t60For(82.4) > t60For(329.6) && t60For(329.6) > t60For(1318.5) && t60For(1318.5) >= 1.5, 'the decay times fall with pitch and never get shorter than 1.5 s (60 dB)');
}

// --- damping: the string is stopped after the note's length
{
  const x = renderString({ freq: hz(52), dur: 0.3, vol: REF_VOL }, SR);
  const ring = ringOf({ freq: 1, dur: 0.3, vol: 1 }), attack = rmsOf(x, Math.floor(0.05 * SR), Math.floor(0.1 * SR)), after = rmsOf(x, Math.floor((ring + 0.1) * SR), Math.floor(0.08 * SR));
  assert(after < attack * 0.02, `after its length the note is damped (${(20 * Math.log10(after / attack)).toFixed(0)} dB)`);
  assert(x.length === Math.ceil(lengthOf({ freq: 1, dur: 0.3, vol: 1 }) * SR) && lengthOf({ freq: 1, dur: 0.01, vol: 1 }) >= 0.45 && lengthOf({ freq: 1, dur: 99, vol: 1 }) <= 4.2, 'notes are rendered to a bounded length (a short note still rings a moment)');
}

// --- attack: the note is at full level from its first samples and starts with a pick tick, for every pitch
{
  let worstStart = 1, worstTick = 99;
  for (let midi = 40; midi <= 88; midi++) {
    const x = renderString({ freq: hz(midi), dur: 0.5, vol: REF_VOL }, SR), ms = t => Math.floor(t * SR / 1000);
    let loud = 0; for (let t = 0; t < 30; t += 1) loud = Math.max(loud, rmsOf(x, ms(t), ms(3)));
    worstStart = Math.min(worstStart, rmsOf(x, 0, ms(3)) / loud);
    const hf = (a, n) => { let s = 0; for (let i = a + 1; i < a + n; i++) s += (x[i] - x[i - 1]) ** 2; return Math.sqrt(s / n); };
    worstTick = Math.min(worstTick, hf(0, ms(4)) / hf(ms(20), ms(4)));
  }
  assert(worstStart > 0.6, `every note is at full level from the first 3 ms (worst ${(100 * worstStart).toFixed(0)}% of its loudest 3 ms)`);
  assert(worstTick > 1.5, `and starts with a bright pick tick, at least 1.5x the high-frequency energy of 20 ms later (worst ${worstTick.toFixed(1)}x)`);
  // the previous note on a string is gone by the time a note of the same length arrives again: little smear
  const e = renderString({ freq: hz(52), dur: 0.25, vol: REF_VOL }, SR);
  assert(rmsOf(e, Math.floor(0.45 * SR), Math.floor(0.05 * SR)) < rmsOf(e, Math.floor(0.05 * SR), Math.floor(0.05 * SR)) * 0.03, 'an eighth note at 120 bpm has stopped sounding before the note after next starts');
}

// --- determinism: no random loudness
{
  const a = renderString({ freq: 196, dur: 0.5, vol: 0.12 }, SR), b = renderString({ freq: 196, dur: 0.5, vol: 0.12 }, SR), c = renderString({ freq: 197, dur: 0.5, vol: 0.12 }, SR);
  assert(a.length === b.length && a.every((v, i) => v === b[i]), 'the same note renders to the same samples every time');
  assert(a.some((v, i) => v !== c[i]), 'a different pitch renders differently');
  assert([a, b, c].every(x => x.every(Number.isFinite)), 'no NaN or infinity');
  assert(renderString({ freq: 5, dur: 1, vol: 0.1 }, SR).every(v => v === 0) && renderString({ freq: 20000, dur: 1, vol: 0.1 }, SR).every(v => v === 0) && renderString({ freq: NaN, dur: 1, vol: 0.1 }, SR).every(v => v === 0), 'a pitch outside the string range gives silence, not an error');
}

// --- techniques
{
  const f = hz(57), seg = 0.1 * SR | 0;
  const plain = renderString({ freq: f, dur: 1.2, vol: REF_VOL }, SR);
  const bent = renderString({ freq: f, dur: 1.2, vol: REF_VOL, bend: 2 }, SR);
  const start = cents(pitchOf(bent, SR, Math.floor(0.05 * SR), seg, f), f), end = cents(pitchOf(bent, SR, Math.floor(0.45 * SR), seg, f * Math.pow(2, 2 / 12)), f);
  assert(Math.abs(end - 200) < 15, `a full bend ends two semitones up (${end.toFixed(0)} cents)`);
  assert(start < 120, `and starts at the written pitch, rising (${start.toFixed(0)} cents at 0.05 s)`);
  assert(Math.abs(cents(pitchOf(plain, SR, Math.floor(0.45 * SR), seg, f), f)) < 5, 'an unbent note stays in tune');
  const to = f * Math.pow(2, 5 / 12), slid = renderString({ freq: f, dur: 1.2, vol: REF_VOL, slideTo: to, slideStart: 0.2, slideEnd: 0.4 }, SR);
  assert(Math.abs(cents(pitchOf(slid, SR, Math.floor(0.2 * SR) * 0 + Math.floor(0.55 * SR), seg, to), to)) < 15, 'a slide arrives on its target pitch');
  assert(Math.abs(cents(pitchOf(slid, SR, Math.floor(0.05 * SR), seg, f), f)) < 15, 'and starts on the first pitch');
  // vibrato: the pitch wobbles by a few tens of cents about five times a second
  const vib = renderString({ freq: hz(57), dur: 2, vol: REF_VOL, vib: true }, SR);
  const win = Math.floor(0.06 * SR), track = [];
  for (let t = 0.8; t < 1.8; t += 0.02) track.push(cents(pitchOf(vib, SR, Math.floor(t * SR), win, f), f));
  const mean = track.reduce((a, b) => a + b, 0) / track.length;
  let crossings = 0; for (let i = 1; i < track.length; i++) if ((track[i - 1] - mean) * (track[i] - mean) < 0) crossings++;
  const swing = Math.max(...track) - Math.min(...track);
  assert(swing > 25 && swing < 110, `vibrato swings the pitch by a few tens of cents (${swing.toFixed(0)} cents peak to peak)`);
  assert(crossings >= 7 && crossings <= 14, `at about five or six wobbles a second (${crossings} crossings in a second)`);
  const flat = []; for (let t = 0.8; t < 1.8; t += 0.02) flat.push(cents(pitchOf(renderString({ freq: f, dur: 2, vol: REF_VOL }, SR), SR, Math.floor(t * SR), win, f), f));
  assert(Math.max(...flat) - Math.min(...flat) < 10, 'a note without vibrato holds steady');
}

// --- timbre: harmonic, and it darkens as it dies away; a harder pick is brighter
{
  const f = hz(52), x = renderString({ freq: f, dur: 2, vol: REF_VOL }, SR), n = 8192;
  const m = spectrum(x, Math.floor(0.1 * SR), n), bin = f * n / SR;
  let near = 0, total = 0;
  m.forEach((v, i) => { total += v * v; const h = i / bin, off = Math.abs(h - Math.round(h)); if (Math.round(h) >= 1 && off < 0.35) near += v * v; });
  assert(near / total > 0.9, `almost all the energy sits on the harmonics of the note (${(100 * near / total).toFixed(0)}%)`);
  const early = centroid(x, SR, Math.floor(0.05 * SR), 2048), late = centroid(x, SR, Math.floor(1.0 * SR), 2048);
  console.log(`spectral centroid of E3: early ${early.toFixed(0)} Hz, late ${late.toFixed(0)} Hz`);
  assert(late < early * 0.8, 'the sound darkens as the string dies away');
  assert(early > 3 * f && early < 4000, 'and starts bright without being harsh');
  const soft = centroid(renderString({ freq: f, dur: 1, vol: 0.05 }, SR), SR, Math.floor(0.05 * SR), 2048), hard = centroid(renderString({ freq: f, dur: 1, vol: 0.2 }, SR), SR, Math.floor(0.05 * SR), 2048);
  assert(hard > soft * 1.1, `a harder pick is brighter than a soft one (${soft.toFixed(0)} Hz < ${hard.toFixed(0)} Hz)`);
}

// --- cost: a note must render quickly (it happens when Play is pressed)
{
  const t0 = performance.now(); for (let i = 0; i < 20; i++) renderString({ freq: 110 + i * 7, dur: 1, vol: REF_VOL }, SR);
  const per = (performance.now() - t0) / 20;
  console.log(`rendering a one-second note at ${SR} Hz takes ${per.toFixed(1)} ms`);
  assert(per < 40, `a note renders in under 40 ms (${per.toFixed(1)} ms)`);
}

console.log(failures ? `${failures} FAILED` : 'sound: all passed');
process.exit(failures ? 1 : 0);
