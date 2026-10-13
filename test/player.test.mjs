// Pure-logic tests for shareable links and the progression player's beat math.
import { encodeProgression, decodeProgression, tabOf } from '../site/share.js';
import { eventsAtBeat, totalBeats, clampBpm, clampBeats } from '../site/transport.js';

let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- share links ---------------------------------------------------------
const full = { text: 'Am7 D7 Gmaj7 Cmaj7', key: '4:minor', instrument: 'ukulele',
  pick: { 0: 'dorian', 2: 'ionian' }, pos: { 'Am7|dorian': [3], 'D7|mixolydian': 'all' }, vo: { Am7: 2 } };
assert(same(decodeProgression('#progressions?' + encodeProgression(full)), full), 'a full state survives encode -> decode');

const min = decodeProgression(encodeProgression({ text: 'C G Am F', key: 'auto', instrument: 'guitar', pick: {}, pos: {}, vo: {} }));
assert(min && min.text === 'C G Am F' && !('key' in min) && !('instrument' in min), 'defaults are left out of the link');
assert(!/x=/.test(encodeProgression({ text: 'C G', pick: {}, pos: {}, vo: {} })), 'no x= param when there are no extra choices');
assert(same(decodeProgression('c=Bb7+Eb%2FG+F%237'), { text: 'Bb7 Eb/G F#7' }), 'chord names with # and / survive URL encoding');
assert(decodeProgression('#progressions?c=') === null && decodeProgression('') === null && decodeProgression(null) === null, 'empty links decode to null');

// hostile / corrupt input never throws and never leaks unvalidated fields
const bad = decodeProgression('c=Am7&k=evil&i=bass&x=%25%25%25');
assert(bad && bad.text === 'Am7' && !('key' in bad) && !('instrument' in bad), 'invalid key/instrument/x are dropped');
const evil = decodeProgression('c=Am7&x=' + Buffer.from(JSON.stringify({
  pick: { a: 1, 0: 'ok', 1: 42 }, pos: { 'x|y': 'drop', 'Am7|dorian': [1, 'z'] }, vo: { Am7: -1, Dm7: 1.5, G: 3 }, __proto__: { polluted: 1 }, extra: 1,
})).toString('base64url'));
assert(same(evil.pick, { 0: 'ok' }) && same(evil.pos, {}) && same(evil.vo, { G: 3 }) && !('extra' in evil), 'wrong-typed entries are filtered out');
const proto = decodeProgression('c=Am7&x=' + Buffer.from('{"pos":{"__proto__":[1,2],"constructor":"all","Am7|dorian":[2]},"vo":{"__proto__":3}}').toString('base64url'));
assert(same(Object.keys(proto.pos), ['Am7|dorian']) && Object.getPrototypeOf(proto.pos) === Object.prototype && same(proto.vo, {}), 'a __proto__/constructor key in the link is ignored');
assert(decodeProgression('c=' + 'A'.repeat(5000)).text.length <= 400, 'chord text is length-limited');

assert(tabOf('#progressions?c=C') === 'progressions' && tabOf('#scales') === 'scales' && tabOf('') === '', 'tabOf parses the tab out of the hash');

// --- player beat math ----------------------------------------------------
// 3 chords, 4 beats each, click on: beat 0 = chord 0 + accented click, beat 1 = plain click,
// beat 4 = chord 1 ... and it wraps for looping.
const ev = b => eventsAtBeat(b, 3, 4, true);
assert(same(ev(0), [{ type: 'chord', index: 0 }, { type: 'click', accent: true }]), 'beat 0: first chord + accented click');
assert(same(ev(1), [{ type: 'click', accent: false }]), 'beat 1: plain click only');
assert(same(ev(4)[0], { type: 'chord', index: 1 }) && same(ev(8)[0], { type: 'chord', index: 2 }), 'chords change every beatsPerChord beats');
assert(same(ev(12)[0], { type: 'chord', index: 0 }), 'wraps back to the first chord when looping');
assert(eventsAtBeat(1, 3, 4, false).length === 0 && eventsAtBeat(0, 3, 4, false).length === 1, 'no clicks when the metronome is off');
let chordStarts = 0;
for (let b = 0; b < 3 * 4 * 5; b++) chordStarts += eventsAtBeat(b, 3, 4, false).filter(e => e.type === 'chord').length;
assert(chordStarts === 15, 'exactly one strum per chord per pass');
assert(totalBeats(3, 4) === 12, 'totalBeats');
assert(clampBpm(10) === 40 && clampBpm(999) === 220 && clampBpm('abc') === 90 && clampBpm(120.4) === 120, 'tempo is clamped to 40-220');
assert(clampBeats(3) === 4 && clampBeats(8) === 8 && clampBeats(undefined) === 4, 'beats per chord limited to 1/2/4/8');

console.log(`Share/player checks: ${failures} failure(s)`);
if (failures) process.exit(1);
