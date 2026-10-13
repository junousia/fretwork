// Beat math for the progression player. Pure, so it is unit tested; the
// Web Audio scheduling in player.js just walks the events this produces.

// Events that fall on beat `beat` (0-based, counted from the start of the
// run): a chord strum on the first beat of each chord, an optional click on
// every beat (accented on the first beat of each chord).
export function eventsAtBeat(beat, nChords, beatsPerChord, metronome) {
  const total = nChords * beatsPerChord;
  const inLoop = beat % total;
  const events = [];
  const onChordStart = inLoop % beatsPerChord === 0;
  if (onChordStart) events.push({ type: 'chord', index: inLoop / beatsPerChord });
  if (metronome) events.push({ type: 'click', accent: onChordStart });
  return events;
}

// Total beats of one pass through the progression.
export const totalBeats = (nChords, beatsPerChord) => nChords * beatsPerChord;

// Clamp user-entered tempo / beats to sane values.
export const clampBpm = v => Math.min(220, Math.max(40, Math.round(+v) || 90));
export const clampBeats = v => [1, 2, 4, 8].includes(+v) ? +v : 4;
