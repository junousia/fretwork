// Beat math for the progression player. Pure, so it is unit tested; the
// Web Audio scheduling in player.js just walks the events this produces.

// Events that fall on beat `beat` (0-based, counted from the start of the
// run): a chord strum on the first beat of each chord, an optional click on
// every beat (accented on the first beat of each chord).
/** @param {number} beat @param {number} nChords @param {number} beatsPerChord @param {boolean} metronome @returns {({type:'chord', index:number}|{type:'click', accent:boolean})[]} */
export function eventsAtBeat(beat, nChords, beatsPerChord, metronome) {
  const total = nChords * beatsPerChord;
  const inLoop = beat % total;
  /** @type {({type:'chord', index:number}|{type:'click', accent:boolean})[]} */
  const events = [];
  const onChordStart = inLoop % beatsPerChord === 0;
  if (onChordStart) events.push({ type: 'chord', index: inLoop / beatsPerChord });
  if (metronome) events.push({ type: 'click', accent: onChordStart });
  return events;
}

// Total beats of one pass through the progression.
/** @type {(nChords:number, beatsPerChord:number) => number} */
export const totalBeats = (nChords, beatsPerChord) => nChords * beatsPerChord;

// Clamp user-entered tempo / beats to sane values.
/** @type {(v:any) => number} */
export const clampBpm = v => Math.min(220, Math.max(40, Math.round(+v) || 90));
/** @type {(v:any) => number} */
export const clampBeats = v => [1, 2, 4, 8].includes(+v) ? +v : 4;

// Swing: straight eighths played long-short. `long` is the share of each beat given to the first
// half (0.5 = straight, 0.58 = light swing, 2/3 = shuffle). Beats themselves never move; the
// steps inside a beat are stretched/squeezed piecewise-linearly, so off-beat eighths and the
// sixteenths around them stay in proportion. Returns the (fractional) step a step sounds at.
/** @type {{id:string, name:string, long:number}[]} */
export const SWINGS = [{ id: 'straight', name: 'Straight', long: 0.5 }, { id: 'light', name: 'Light swing', long: 0.58 }, { id: 'shuffle', name: 'Shuffle', long: 2 / 3 }];
/** @param {number} step @param {number} beat steps per beat @param {number} long @returns {number} */
export function swung(step, beat, long) {
  const b = Math.floor(step / beat), pos = step - b * beat, half = beat / 2;
  return b * beat + (pos < half ? pos * (long * beat) / half : long * beat + (pos - half) * ((1 - long) * beat) / half);
}
