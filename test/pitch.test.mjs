// The pitch detector, on sound it has to get right: pure sines across the guitar's range, real plucked-string sound from the app's own voice
// (strong harmonics, the hard case for octave errors), and things that are not a note (silence, noise) which must give no answer.
import { detectPitch, noteFromFreq, freqOfMidi } from '../site/pitch.js';
import { renderString } from '../site/string-dsp.js';

let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };
const SR = 44100, N = 4096;
const cents = (f, ref) => 1200 * Math.log2(f / ref);
const sine = (f, n = N, sr = SR, harmonics = [1]) => Float32Array.from({ length: n }, (_, i) => harmonics.reduce((s, h, k) => s + h * Math.sin(2 * Math.PI * f * (k + 1) * i / sr), 0) * 0.3);

// the arithmetic of note names (equal temperament, A4 = 440 Hz)
assert(noteFromFreq(440).midi === 69 && Math.abs(noteFromFreq(440).cents) < 1e-9, 'A440 is MIDI 69, in tune');
assert(noteFromFreq(freqOfMidi(40)).midi === 40 && Math.abs(freqOfMidi(40) - 82.4069) < 1e-3, 'low E (MIDI 40) is 82.41 Hz');
assert(Math.abs(noteFromFreq(440 * Math.pow(2, 20 / 1200)).cents - 20) < 1e-6 && noteFromFreq(440 * Math.pow(2, 20 / 1200)).midi === 69, '20 cents sharp of A4 is still A4, +20');
assert(noteFromFreq(440 * Math.pow(2, 70 / 1200)).midi === 70 && Math.abs(noteFromFreq(440 * Math.pow(2, 70 / 1200)).cents + 30) < 1e-6, '70 cents above A4 is nearer A#4, -30');
assert(Math.abs(noteFromFreq(432, 432).cents) < 1e-9, 'the reference pitch can be changed');

// pure tones across the range of a guitar (and a ukulele), several frequencies that are not on the note grid
let worst = 0;
for (const f of [82.41, 87.3, 98, 110, 123.47, 146.83, 196, 220, 246.94, 261.63, 329.63, 392, 440, 523.25, 659.26, 880, 987.77, 1174.66, 100.5, 333.3, 777.7]) {
  const p = detectPitch(sine(f), SR);
  assert(p !== null, `a sine at ${f} Hz is heard`);
  if (p) { worst = Math.max(worst, Math.abs(cents(p.freq, f))); assert(Math.abs(cents(p.freq, f)) < 2, `${f} Hz is found within 2 cents (got ${p.freq.toFixed(2)})`); assert(p.clarity > 0.95, `${f} Hz is clear`); }
}
for (const sr of [22050, 32000, 48000]) { const p = detectPitch(sine(220, N, sr), sr); assert(p && Math.abs(cents(p.freq, 220)) < 3, `220 Hz at ${sr} Hz sampling`); }

// notes with strong overtones: a loud 2nd/3rd harmonic must not pull the answer up an octave
for (const f of [82.41, 110, 196]) {
  const p = detectPitch(sine(f, N, SR, [0.5, 1, 0.8]), SR);
  assert(p && Math.abs(cents(p.freq, f)) < 3, `${f} Hz with a stronger second harmonic is still ${f} (got ${p && p.freq.toFixed(2)})`);
}

// the app's own plucked string, every open string of a guitar, a window from the middle of the note
let strings = 0;
for (const midi of [40, 45, 50, 55, 59, 64, 69, 76]) {
  const f = freqOfMidi(midi), note = renderString({ freq: f, dur: 1, vol: 0.2 }, SR), at = Math.floor(0.15 * SR);
  const p = detectPitch(note.slice(at, at + N), SR);
  strings++;
  assert(p !== null && Math.abs(cents(p.freq, f)) < 6, `a plucked string at ${f.toFixed(1)} Hz is found within 6 cents (got ${p && p.freq.toFixed(2)})`);
}

// a room is not silent: the same notes with noise at about 15 dB below them, and plucked strings from other parts of the note and at 48 kHz
{
  let seed2 = 99; const rnd = () => { seed2 = (Math.imul(seed2, 1664525) + 1013904223) >>> 0; return seed2 / 4294967296 - 0.5; };
  for (const f of [82.41, 196, 440]) {
    const x = sine(f); const noisy = x.map(v => v + rnd() * 0.12);
    const p = detectPitch(noisy, SR);
    assert(p && Math.abs(cents(p.freq, f)) < 5, `${f} Hz in noise is still found (got ${p && p.freq.toFixed(2)})`);
  }
  for (const [midi, secs, sr] of [[40, 0.4, 48000], [52, 0.05, 44100], [64, 0.6, 48000], [45, 0.25, 22050]]) {
    const f = freqOfMidi(midi), note = renderString({ freq: f, dur: 1.5, vol: 0.2 }, sr), at = Math.floor(secs * sr);
    const p = detectPitch(note.slice(at, at + N), sr);
    assert(p !== null && Math.abs(cents(p.freq, f)) < 8, `a plucked string at ${f.toFixed(1)} Hz, ${secs} s in, at ${sr} Hz sampling (got ${p && p.freq.toFixed(2)})`);
  }
}

// not a note
assert(detectPitch(new Float32Array(N), SR) === null, 'silence has no pitch');
assert(detectPitch(sine(220, N).map(x => x * 0.001), SR) === null, 'a note at the noise floor is ignored');
// what a laptop microphone really delivers: a quiet note on a DC offset with a hiss of its own
{
  let sd = 5; const hiss = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296 - 0.5; };
  for (const [f, amp] of [[82.41, 0.02], [110, 0.01], [196, 0.02], [329.63, 0.03]]) {
    const x = sine(f).map(v => v * (amp / 0.3) + 0.04 + hiss() * 0.006);
    const p = detectPitch(x, SR);
    assert(p && Math.abs(cents(p.freq, f)) < 10, `a quiet ${f} Hz (peak ${amp}) on a DC offset with hiss is found (got ${p && p.freq.toFixed(2)})`);
  }
  for (const midi of [40, 45, 52, 59]) {
    const f = freqOfMidi(midi), note = renderString({ freq: f, dur: 1.5, vol: 0.2 }, SR), at = Math.floor(0.2 * SR);
    const x = note.slice(at, at + N).map(v => v * 0.08 + 0.03 + hiss() * 0.004);
    const p = detectPitch(x, SR);
    assert(p && Math.abs(cents(p.freq, f)) < 8, `a quiet plucked string at ${f.toFixed(1)} Hz on a DC offset is found (got ${p && p.freq.toFixed(2)})`);
  }
}
let seed = 7; const noise = Float32Array.from({ length: N }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed / 4294967296 - 0.5) * 0.6; });
assert(detectPitch(noise, SR) === null, 'white noise has no pitch');
assert(detectPitch(sine(40, N), SR) === null, 'a tone below the lowest string is ignored');
if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log(`Pitch checks: sines worst ${worst.toFixed(2)} cents, ${strings} plucked strings, 0 failure(s)`);
