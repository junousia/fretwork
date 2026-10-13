// Plays a chord progression: strums each chord (its chosen voicing) on a beat
// grid, optionally looping, with an optional metronome click. Scheduling uses
// the Web Audio clock with a short look-ahead, so timing stays steady even if
// the page is busy; the UI is told which chord is current via onChord().
import { audioContext, note, mtof } from './theory.js';
import { eventsAtBeat } from './transport.js';

const LOOKAHEAD = 0.25, TICK_MS = 25;

function click(ac, t, accent) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'square'; o.frequency.value = accent ? 1500 : 1000;
  g.gain.setValueAtTime(accent ? 0.12 : 0.07, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.05);
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
