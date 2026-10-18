// Drawing what is being played: notes lit on a fretboard drawn by board.js, and a slim spectrum of the sound the app is making.
import { outputAnalyser } from './audio.js';

/**
 * Light the notes of a board for a moment. A note with a string and fret lights exactly that spot; a note with only a pitch lights every spot
 * on the neck that makes it.
 * @param {ParentNode} root a container holding the board's SVG
 * @param {{midi:number[]}} inst open-string MIDI notes, top string first (capo included)
 * @param {{midi:number, s?:number, f?:number}[]} notes @param {number} ms how long the glow lasts
 */
export function lightNotes(root, inst, notes, ms) {
  root.querySelectorAll('circle.bn').forEach(node => {
    const c = /** @type {SVGElement & {_lit?:any}} */ (node), s = +(c.dataset.s ?? -1), f = +(c.dataset.f ?? -1);
    const pitch = inst.midi[s] + f;
    if (!notes.some(n => (n.s !== undefined && n.f !== undefined ? n.s === s && n.f === f : n.midi === pitch))) return;
    c.classList.add('lit'); clearTimeout(c._lit);
    c._lit = setTimeout(() => c.classList.remove('lit'), Math.max(120, ms));
  });
}

/** Put out every lit note. @param {ParentNode} root */
export function clearLit(root) { root.querySelectorAll('circle.bn.lit').forEach(c => c.classList.remove('lit')); }

/**
 * A spectrum strip on a canvas, drawn only while it runs. It listens to the app's own output (audio.js), so it shows what you hear.
 * @param {HTMLCanvasElement} canvas @returns {{start:() => void, stop:() => void}}
 */
export function createScope(canvas) {
  let raf = 0;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx2d = canvas.getContext('2d');
  const BARS = 40;
  function draw() {
    const an = outputAnalyser();
    if (!ctx2d || !an) { raf = requestAnimationFrame(draw); return; }
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 36, dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const data = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(data);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0); ctx2d.clearRect(0, 0, w, h);
    ctx2d.fillStyle = getComputedStyle(canvas).color;
    const hz = an.context.sampleRate / an.fftSize, lo = 70, hi = 5000, bw = w / BARS;
    for (let i = 0; i < BARS; i++) {
      // log-spaced bands from low E to the top of the guitar's range: each bar is the loudest bin in its band
      const a = Math.floor(lo * Math.pow(hi / lo, i / BARS) / hz), b = Math.max(a + 1, Math.floor(lo * Math.pow(hi / lo, (i + 1) / BARS) / hz));
      let m = 0; for (let k = a; k < b && k < data.length; k++) m = Math.max(m, data[k]);
      const bh = Math.max(1, (m / 255) * h);
      ctx2d.globalAlpha = 0.35 + 0.65 * (m / 255);
      ctx2d.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
    }
    ctx2d.globalAlpha = 1;
    raf = requestAnimationFrame(draw);
  }
  return {
    start() { if (reduced || raf) return; canvas.hidden = false; raf = requestAnimationFrame(draw); },
    stop() { cancelAnimationFrame(raf); raf = 0; canvas.hidden = true; ctx2d?.clearRect(0, 0, canvas.width, canvas.height); },
  };
}
