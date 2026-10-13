// Plays a chord progression: strums each chord (its chosen voicing) on a beat
// grid, optionally looping, with an optional metronome click. Scheduling uses
// the Web Audio clock with a short look-ahead, so timing stays steady even if
// the page is busy; the UI is told which chord is current via onChord().
import { audioContext, note, mtof } from './audio.js';
import { eventsAtBeat, swung } from './transport.js';

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

// opts: {chords: [{midi:[...]}], bpm, beats, loop, metronome, onChord(i|-1), onEnd()}
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
          const dur = Math.min(3, opts.beats * beat);
          [...opts.chords[ev.index].midi].sort((a, b) => a - b).forEach((m, i) => note(mtof(m), at + i * 0.03, dur, 0.11));
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
// chords:[{step,midi:[...]}], totalSteps, stepSec, beat (steps per beat), loop, metronome, swing (share of the beat
// given to the first eighth, 0.5 = straight), onStep(step|-1), onEnd()}.
// Returns {stop()}.
export function startTab(opts) {
  const ac = audioContext();
  if (!ac || !opts.totalSteps) return { stop() {} };
  const { stepSec, totalSteps } = opts, beat = opts.beat || 12, long = opts.swing || 0.5;
  /** @type {Map<number, {dur:number, midi:number}[]>} */
  const byStep = new Map();
  for (const e of opts.events) byStep.set(e.step, [...(byStep.get(e.step) || []), e]);
  const chordAt = new Map(opts.chords.map(c => [c.step, c.midi]));
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
      if (chord) [...chord].sort((a, b) => a - b).forEach((m, i) => note(mtof(m), at + i * 0.03, Math.min(3, 4 * beat * stepSec), 0.07));
      for (const e of byStep.get(step) || []) {
        const start = (swung(step, beat, long) - step) * stepSec, dur = (swung(step + e.dur, beat, long) - swung(step, beat, long)) * stepSec;
        note(mtof(e.midi), at + start, Math.max(0.12, Math.min(3, dur)), 0.16);
      }
      setTimeout(() => { if (!stopped) opts.onStep(step); }, Math.max(0, (at - ac.currentTime) * 1000));
      next++;
    }
  };
  timer = setInterval(schedule, TICK_MS);
  schedule();
  return { stop: finish };
}
