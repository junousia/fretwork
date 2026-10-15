// Plays a chord progression: strums each chord (its chosen voicing) on a beat
// grid, optionally looping, with an optional metronome click. Scheduling uses
// the Web Audio clock with a short look-ahead, so timing stays steady even if
// the page is busy; the UI is told which chord is current via onChord().
import { audioContext, note, mtof } from './audio.js';
import { eventsAtBeat, swung } from './transport.js';
import { strumHits, hitNotes, strumById } from './strum-patterns.js';

const LOOKAHEAD = 0.25, TICK_MS = 25;

function click(ac, t, accent) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'square'; o.frequency.value = accent ? 1500 : 1000;
  g.gain.setValueAtTime(accent ? 0.12 : 0.07, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.05);
}

// Play a list of MIDI notes one after another (an arpeggio or run).
export function playNotes(notes, step = 0.18) {
  const ac = audioContext();
  if (!ac) return;
  const t = ac.currentTime + 0.05;
  notes.forEach((m, i) => note(mtof(m), t + i * step, 0.7, 0.15));
}

// opts: {chords: [{midi:[...]}], strum (pattern id, see strum-patterns.js), bpm, beats, loop, metronome, onChord(i|-1), onEnd()}
// returns {stop()}.
export function startProgression(opts) {
  const ac = audioContext();
  if (!ac || !opts.chords.length) return { stop() {} };
  const beat = 60 / opts.bpm, total = opts.chords.length * opts.beats;
  const t0 = ac.currentTime + 0.1;
  let next = 0, timer = null, stopped = false;

  const finish = () => {
    if (stopped) return;
    stopped = true; clearInterval(timer);
    opts.onChord(-1); opts.onEnd && opts.onEnd();
  };

  const schedule = () => {
    const horizon = ac.currentTime + LOOKAHEAD - t0;
    while (next * beat < horizon) {
      if (!opts.loop && next >= total) {
        // let the last chord ring for its full length, then stop
        if (ac.currentTime >= t0 + total * beat) finish();
        return;
      }
      const at = t0 + next * beat;
      for (const ev of eventsAtBeat(next, opts.chords.length, opts.beats, opts.metronome)) {
        if (ev.type === 'click') click(ac, at, ev.accent);
        else {
          const pat = strumById(opts.strum || 'single');
          for (const h of strumHits(pat.id, opts.beats)) for (const n of hitNotes(h, opts.chords[ev.index].midi, 0.03, pat.spread)) note(mtof(n.midi), at + h.at * beat + n.dt, Math.min(3, Math.max(0.1, h.len * beat)), 0.11 * n.vol);
          setTimeout(() => { if (!stopped) opts.onChord(ev.index); }, Math.max(0, (at - ac.currentTime) * 1000));
        }
      }
      next++;
    }
  };

  timer = setInterval(schedule, TICK_MS);
  schedule();
  return { stop: finish };
}

// Plays a tab: its notes on the sixteenth-note grid, optionally the bar chords
// strummed on beat 1 and a click on every beat. opts: {events:[{step,dur,midi}],
// chords:[{step,midi:[...]}], strum (pattern id, see strum-patterns.js), totalSteps, stepSec, beat (steps per beat), loop, metronome, swing (share of the beat
// given to the first eighth, 0.5 = straight), onStep(step|-1), onEnd()}.
// Returns {stop()}.
export function startTab(opts) {
  const ac = audioContext();
  if (!ac || !opts.totalSteps) return { stop() {} };
  const { stepSec, totalSteps } = opts, beat = opts.beat || 12, long = opts.swing || 0.5;
  /** @type {Map<number, {dur:number, midi:number, bend?:number, vib?:boolean, soft?:boolean, skip?:boolean, slideTo?:number, slideAt?:number, slideEnd?:number}[]>} */
  const byStep = new Map();
  for (const e of opts.events) byStep.set(e.step, [...(byStep.get(e.step) || []), e]);
  const chordAt = new Map(opts.chords.map(c => [c.step, c.midi]));
  // how long each chord lasts: until the next chord, or the end of the tab (at most one bar at a time for the single strum's ring, as before)
  const chordSteps = [...chordAt.keys()].sort((a, b) => a - b);
  const chordLen = new Map(chordSteps.map((st, i) => [st, (i + 1 < chordSteps.length ? chordSteps[i + 1] : totalSteps) - st]));
  const t0 = ac.currentTime + 0.1;
  let next = 0, timer = null, stopped = false;
  const finish = () => {
    if (stopped) return;
    stopped = true; clearInterval(timer);
    opts.onStep(-1); opts.onEnd && opts.onEnd();
  };
  const schedule = () => {
    const horizon = ac.currentTime + LOOKAHEAD - t0;
    while (next * stepSec < horizon) {
      if (!opts.loop && next >= totalSteps) { if (ac.currentTime >= t0 + totalSteps * stepSec + 0.3) finish(); return; }
      const step = next % totalSteps, at = t0 + next * stepSec;
      if (opts.metronome && step % beat === 0) click(ac, at, step % (beat * 4) === 0);
      const chord = chordAt.get(step);
      if (chord) {
        const len = chordLen.get(step) || 4 * beat, pat = strumById(opts.strum || 'single'); // a quick strum (12 ms a string): the bar's chord should land on the beat, not trail it
        for (const h of strumHits(pat.id, len / beat)) {
          const off = (swung(step + h.at * beat, beat, long) - step) * stepSec;
          for (const n of hitNotes(h, chord, 0.012, pat.spread)) note(mtof(n.midi), at + off + n.dt, Math.min(3, Math.max(0.1, h.len * beat * stepSec)), 0.07 * n.vol);
        }
      }
      for (const e of byStep.get(step) || []) {
        if (e.skip) continue; // already sounded by the slide that ran into it
        const start = (swung(step, beat, long) - step) * stepSec, dur = (swung(step + e.dur, beat, long) - swung(step, beat, long)) * stepSec;
        /** @type {{bend?:number, vib?:boolean, slideTo?:number, slideStart?:number, slideEnd?:number}} */
        const fx = {};
        if (e.bend) fx.bend = e.bend;
        if (e.vib) fx.vib = true;
        if (e.slideTo !== undefined) { fx.slideTo = mtof(e.slideTo); fx.slideStart = (e.slideAt || 0) * stepSec; fx.slideEnd = (e.slideEnd || 0) * stepSec; }
        note(mtof(e.midi), at + start, Math.max(0.12, Math.min(3, dur)), e.soft ? 0.1 : 0.16, fx);
      }
      setTimeout(() => { if (!stopped) opts.onStep(step); }, Math.max(0, (at - ac.currentTime) * 1000));
      next++;
    }
  };
  timer = setInterval(schedule, TICK_MS);
  schedule();
  return { stop: finish };
}
