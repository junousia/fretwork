// The sound of the app. "Plucked guitar" renders every note with the string model in string-dsp.js into an
// AudioBuffer (cached, so repeated notes cost nothing) and plays it through a small chain: a touch of body
// EQ, gentle compression, a short room and a limiter. "Simple" is the small built-in synth in audio.js.
// Notes reach here through audio.js (`note`), at the times the schedulers in player.js / audio.js give them,
// so playback timing, tempo, swing and looping are unchanged. If anything goes wrong here, audio.js falls
// back to the simple synth for that note.
import { audioContext, setNoteEngine, outputNode } from './audio.js';
import { renderString } from './string-dsp.js';

/** @type {{id:string, name:string}[]} */
export const SOUNDS = [
  { id: 'plucked', name: 'Plucked guitar' },
  { id: 'simple', name: 'Simple' },
];
const KEY = 'fw-sound';
const RATE = 22050;          // notes are rendered at half the usual rate (cheaper); the browser resamples them
const CACHE_MAX = 300;
/** The two dynamics compressors in the chain delay everything by about 6 ms each (measured: 12 ms). The click and the simple synth bypass the chain, so notes are started this much early to land on the beat. */
export const CHAIN_LATENCY = 0.012;

let setting = 'plucked';
try { const s = localStorage.getItem(KEY); if (SOUNDS.some(x => x.id === s)) setting = /** @type {string} */ (s); } catch (e) { /* default */ }
export const getSound = () => setting;

/** Counters for the tests: how many notes were rendered, and how many came from the cache. */
export const soundStats = { rendered: 0, cached: 0 };

/**
 * The effects chain: body EQ -> compressor -> (dry + short room) -> limiter -> out.
 * @param {BaseAudioContext} ctx @param {AudioNode} dest @returns {AudioNode} the input to connect notes to
 */
export function buildChain(ctx, dest) {
  const input = ctx.createGain();
  const body = ctx.createBiquadFilter(); body.type = 'lowshelf'; body.frequency.value = 220; body.gain.value = 2.5;      // a little wood
  const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 3500; air.gain.value = -3;         // take the edge off
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -22; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
  const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.1;
  input.connect(body); body.connect(air); air.connect(comp);
  const dry = ctx.createGain(); dry.gain.value = 0.9; comp.connect(dry); dry.connect(limiter);
  // a short room: a decaying burst of (seeded) noise
  const len = Math.floor(ctx.sampleRate * 1.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch); let s = 12345 + ch * 777;
    for (let i = 0; i < len; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = ((s / 4294967296) * 2 - 1) * Math.pow(1 - i / len, 3.5); }
  }
  const verb = ctx.createConvolver(); verb.buffer = ir; verb.normalize = true;
  const wet = ctx.createGain(); wet.gain.value = 0.16; comp.connect(verb); verb.connect(wet); wet.connect(limiter);
  limiter.connect(dest);
  return input;
}

/**
 * The plucked-string engine on an audio context.
 * @param {BaseAudioContext} ctx @param {AudioNode} [dest]
 */
export function createStringEngine(ctx, dest = ctx.destination) {
  const input = buildChain(ctx, dest);
  /** @type {Map<string, AudioBuffer>} */ const cache = new Map();
  /**
   * Play one note: same arguments as the simple synth in audio.js.
   * @param {number} freq Hz @param {number} t start time (context clock) @param {number} dur seconds @param {number} vol 0-1
   * @param {{bend?:number, vib?:boolean, slideTo?:number, slideStart?:number, slideEnd?:number}} [fx]
   * @returns {boolean} false if the note could not be played (the caller then uses the simple synth)
   */
  function note(freq, t, dur, vol, fx = {}) {
    if (!(freq > 20 && freq < 5000)) return false;
    const key = [freq.toFixed(2), dur.toFixed(2), vol.toFixed(3), fx.bend || 0, fx.vib ? 1 : 0, fx.slideTo ? fx.slideTo.toFixed(1) : 0, (fx.slideStart || 0).toFixed(2), (fx.slideEnd || 0).toFixed(2)].join('|');
    let buf = cache.get(key);
    if (buf) { cache.delete(key); cache.set(key, buf); soundStats.cached++; }
    else {
      const data = renderString({ freq, dur, vol, bend: fx.bend, vib: fx.vib, slideTo: fx.slideTo, slideStart: fx.slideStart, slideEnd: fx.slideEnd }, RATE);
      buf = ctx.createBuffer(1, data.length, RATE); buf.copyToChannel(/** @type {Float32Array<ArrayBuffer>} */ (data), 0);
      cache.set(key, buf); soundStats.rendered++;
      if (cache.size > CACHE_MAX) cache.delete(/** @type {string} */ (cache.keys().next().value));
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(input);
    src.start(Math.max(t - CHAIN_LATENCY, ctx.currentTime));
    return true;
  }
  return { note, input, cache };
}

// ---------------------------------------------------------------------------------------------
/** @type {ReturnType<typeof createStringEngine>|null} */ let engine = null;
/** @type {AudioContext|null} */ let engineCtx = null;

/** Route notes to the chosen sound. Safe to call any time. */
export function applySound() {
  if (setting !== 'plucked') { setNoteEngine(null); return; }
  setNoteEngine((freq, t, dur, vol, fx) => {
    const ac = audioContext(); if (!ac) return false;
    if (!engine || engineCtx !== ac) { engine = createStringEngine(ac, outputNode(ac)); engineCtx = ac; }
    return engine.note(freq, t, dur, vol, fx);
  });
}

/** @param {string} id */
export function setSound(id) {
  if (!SOUNDS.some(x => x.id === id)) return;
  setting = id;
  try { localStorage.setItem(KEY, id); } catch (e) { /* not saved */ }
  applySound();
}
