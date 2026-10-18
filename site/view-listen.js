import { spell, esc } from './music.js';
import { board } from './board.js';
import { audioContext } from './audio.js';
import { getInstrument, onInstrumentChange } from './instrument.js';
import { detectPitch, noteFromFreq } from './pitch.js';
import { identifyChord } from './identify.js';
import { lightNotes, clearLit } from './live.js';

const HOLD_MS = 700, CHORD_WINDOW_MS = 5000, HISTORY = 10;
const IN_TUNE = 5; // cents

/** @param {number} midi @returns {string} e.g. "A2" */
const nameOf = midi => spell(midi, false) + (Math.floor(midi / 12) - 1);

export function mount(/** @type {HTMLElement} */ root) {
  root.innerHTML = `
    <header>
      <h1>Listen</h1>
      <p class="lead">Play a note on your guitar and Fretwork tells you which one it is, how far off it is, and where it sits on the neck. The sound is analysed on your device and never leaves it.</p>
    </header>
    <div class="stickybar" role="group" aria-label="Microphone">
      <button type="button" class="play" id="ls-run" aria-pressed="false">Start listening</button>
      <button type="button" class="share" id="ls-clear">Clear</button>
    </div>
    <p class="status" id="ls-msg" role="status" aria-live="polite"></p>
    <section class="listen" aria-label="What is being played">
      <div class="lsnote" aria-hidden="true"><span class="lsname" id="ls-name">–</span><span class="lsoct" id="ls-oct"></span></div>
      <div class="lsmeter" id="ls-meter" aria-hidden="true"><i class="zone"></i><i class="needle" id="ls-needle"></i></div>
      <p class="lsdetail" id="ls-detail" aria-hidden="true">Waiting for a note</p>
      <p class="lsstring" id="ls-string" aria-hidden="true"></p>
      <p class="sr-only" id="ls-sr" role="status" aria-live="polite"></p>
    </section>
    <div class="board listenneck" id="ls-board" tabindex="0" aria-label="Fretboard showing where the note you are playing can be found, scroll sideways"></div>
    <h2 class="lssub">Heard</h2>
    <div class="lshist" id="ls-hist"></div>
    <p class="hint" id="ls-chord"></p>
    <p class="hint">Works best with one note at a time, a moderate distance from the microphone, in a fairly quiet room. Single notes only: a strummed chord is not one pitch.</p>`;

  const $ = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (root.querySelector(sel));
  const runBtn = $('#ls-run'), msg = $('#ls-msg'), nameEl = $('#ls-name'), octEl = $('#ls-oct'), needle = $('#ls-needle'), meter = $('#ls-meter'),
    detail = $('#ls-detail'), stringEl = $('#ls-string'), srEl = $('#ls-sr'), neck = $('#ls-board'), hist = $('#ls-hist'), chordEl = $('#ls-chord');

  function drawNeck() {
    const inst = getInstrument();
    neck.innerHTML = board({ root: 0, iv: [0], name: 'C' }, { s: { iv: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], name: 'Chromatic' } }, 'notes', false,
      { tuning: inst.tuning, stringWidths: inst.stringWidths, leftHanded: inst.leftHanded, capo: inst.capo });
  }
  drawNeck();
  onInstrumentChange(() => drawNeck());

  /** @type {MediaStream|null} */ let stream = null;
  /** @type {MediaStreamAudioSourceNode|null} */ let source = null;
  /** @type {AnalyserNode|null} */ let analyser = null;
  /** @type {any} */ let timer = 0;
  /** @type {Float32Array<ArrayBuffer>|null} */ let buf = null;
  /** @type {number[]} */ let recent = [];
  let candidate = -1, count = 0, shown = -1, lastHeard = 0, lastSpoken = 0;
  /** @type {{midi:number, t:number}[]} */ let heard = [];

  const median = (/** @type {number[]} */ a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

  function showIdle() {
    nameEl.textContent = '–'; octEl.textContent = ''; detail.textContent = running() ? 'Waiting for a note' : 'Press start, then play a note';
    stringEl.textContent = ''; needle.style.left = '50%'; meter.classList.remove('ok'); clearLit(neck); shown = -1;
  }
  const running = () => stream !== null;

  /** @param {number} freq */
  function show(freq) {
    const inst = getInstrument(), { midi, cents } = noteFromFreq(freq), now = Date.now();
    nameEl.textContent = spell(midi, false); octEl.textContent = String(Math.floor(midi / 12) - 1);
    const off = Math.round(cents), abs = Math.abs(off);
    needle.style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;
    meter.classList.toggle('ok', abs <= IN_TUNE);
    detail.textContent = `${freq.toFixed(1)} Hz · ${abs <= IN_TUNE ? 'in tune' : `${abs} cents ${off < 0 ? 'flat' : 'sharp'}`}`;
    // the open string it is closest to, when it is near enough to be a tuning
    const exact = midi + cents / 100;
    let best = -1, dist = Infinity;
    inst.midi.forEach((open, i) => { const d = Math.abs(exact - open); if (d < dist) { dist = d; best = i; } });
    stringEl.textContent = dist < 1 ? `Closest open string: ${best + 1} (${nameOf(inst.midi[best])})` : '';
    clearLit(neck); lightNotes(neck, inst, [{ midi }], 600);
    if (midi !== shown) {
      shown = midi;
      heard.push({ midi, t: now }); heard = heard.filter(h => now - h.t < CHORD_WINDOW_MS || heard.length <= HISTORY).slice(-HISTORY);
      hist.innerHTML = heard.map(h => `<span class="chip lsh">${esc(nameOf(h.midi))}</span>`).join('');
      const pcs = [...new Set(heard.filter(h => now - h.t < CHORD_WINDOW_MS).map(h => h.midi % 12))];
      const guess = pcs.length >= 3 ? identifyChord(pcs, null, 1)[0] : null;
      chordEl.textContent = guess ? `Those notes together: ${guess.name} (${guess.label})` : '';
    }
    if (now - lastSpoken > 1500) { lastSpoken = now; srEl.textContent = `${nameOf(midi)}, ${abs <= IN_TUNE ? 'in tune' : `${abs} cents ${off < 0 ? 'flat' : 'sharp'}`}`; }
  }

  function tick() {
    if (!analyser || !buf) return;
    if (root.hidden || document.hidden) { stop('Stopped listening.'); return; }
    analyser.getFloatTimeDomainData(buf);
    const p = detectPitch(buf, analyser.context.sampleRate), now = Date.now();
    if (p) {
      recent.push(p.freq); if (recent.length > 5) recent.shift();
      const f = median(recent), midi = noteFromFreq(f).midi;
      if (midi === candidate) count++; else { candidate = midi; count = 1; recent = [p.freq]; }
      lastHeard = now;
      if (count >= 3) show(f);
    } else if (now - lastHeard > HOLD_MS) { candidate = -1; count = 0; recent = []; showIdle(); }
  }

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = 'This browser cannot reach the microphone here. It needs a secure page (https) or localhost.'; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) { stream = null; msg.textContent = 'The microphone was not allowed. Allow it in the browser to listen.'; return; }
    const ac = audioContext();
    if (!ac) { stop('Audio is not available in this browser.'); return; }
    source = ac.createMediaStreamSource(stream); analyser = ac.createAnalyser(); analyser.fftSize = 4096;
    source.connect(analyser); // never to the speakers: that would feed back
    buf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4)); recent = []; candidate = -1; count = 0;
    timer = setInterval(tick, 50);
    runBtn.textContent = '■ Stop listening'; runBtn.setAttribute('aria-pressed', 'true'); msg.textContent = 'Listening. Play a single note.';
    showIdle();
  }
  /** @param {string} [why] */
  function stop(why) {
    clearInterval(timer); timer = 0;
    if (source) { try { source.disconnect(); } catch (e) { /* already */ } source = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    analyser = null; buf = null;
    runBtn.textContent = 'Start listening'; runBtn.setAttribute('aria-pressed', 'false');
    if (why) msg.textContent = why;
    showIdle();
  }
  runBtn.onclick = () => { if (running()) stop('Stopped listening.'); else void start(); };
  $('#ls-clear').onclick = () => { heard = []; hist.innerHTML = ''; chordEl.textContent = ''; shown = -1; };
  window.addEventListener('hashchange', () => { if (running() && root.hidden) stop('Stopped listening.'); });
  showIdle();
}
