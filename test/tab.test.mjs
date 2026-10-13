// The tab model: editing rules, pitch, validation of untrusted data, undo/redo,
// and the plain-text export.
import * as T from '../site/tab.js';
import { setChordPlan, emptyTab, addBar, removeBar, chordTimeline, chordsUsed, setVoicing, setBpm, clearNotes,
  tabEvents, stepSeconds, normalizeTab, createHistory, stringNames, tabToText, STEPS, BEAT, MAX_BARS, LENGTHS, TRIPLET_OF, gridFor } from '../site/tab.js';
import { swung, SWINGS } from '../site/transport.js';

import { tabSvg, barsPerRowFor, stepPos, BAR_W, STEP_W } from '../site/tab-view.js';

// The model counts 48 steps per bar; most of these cases are written in sixteenths (3 steps each),
// so these wrappers take positions and lengths in sixteenths and hand the real steps to the model.
const Q = 3;
const putNote = (t, bar, at, s, f, len) => T.putNote(t, bar, at * Q, s, f, len * Q);
const removeNote = (t, bar, at, s) => T.removeNote(t, bar, at * Q, s);
const setLength = (t, bar, at, s, len) => T.setLength(t, bar, at * Q, s, len * Q);
const putChord = (t, bar, at, name) => T.putChord(t, bar, at * Q, name);
const down = n => n && { ...n, at: n.at / Q, len: n.len / Q };
const noteAt = (t, bar, at, s) => down(T.noteAt(t, bar, at * Q, s));
const noteCovering = (t, bar, at, s) => down(T.noteCovering(t, bar, at * Q, s));
const chordAt = (t, bar, at) => T.chordAt(t, bar, at * Q);

let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };
const GUITAR = { midi: [64, 59, 55, 50, 45, 40] };
const UKE = { midi: [69, 64, 60, 67] };

// --- putNote / overlap rules
let t = emptyTab(2);
assert(t.bars.length === 2 && t.bpm === 90, 'empty tab has the requested bars');
t = putNote(t, 0, 0, 5, 3, 4);
assert(noteAt(t, 0, 0, 5)?.f === 3 && noteAt(t, 0, 0, 5)?.len === 4, 'a note is placed');
const same = putNote(t, 0, 0, 5, 3, 4);
assert(JSON.stringify(same) === JSON.stringify(t), 'placing the same note again changes nothing');
t = putNote(t, 0, 2, 5, 5, 4);                                   // starts inside the first note
assert(noteAt(t, 0, 0, 5)?.len === 2, 'a later note cuts the earlier one on the same string short');
assert(noteAt(t, 0, 2, 5)?.f === 5, 'the new note is there');
t = putNote(t, 0, 0, 5, 7, 8);                                   // replaces at the same start, clipped by the next note
assert(noteAt(t, 0, 0, 5)?.f === 7 && noteAt(t, 0, 0, 5)?.len === 2, 'replacing a note keeps it clipped to the next note on the string');
t = putNote(t, 0, 0, 4, 2, 16);                                  // another string: independent (a chord)
assert(noteAt(t, 0, 0, 4)?.len === 16 && noteAt(t, 0, 0, 5)?.f === 7, 'different strings do not interfere');
t = putNote(t, 0, 14, 0, 0, 16);
assert(noteAt(t, 0, 14, 0)?.len === 2, 'a note never runs past the end of its bar');
assert(noteCovering(t, 0, 1, 5)?.at === 0, 'noteCovering finds the note that started earlier');
assert(putNote(t, 0, 16, 0, 0, 1) === t && putNote(t, 0, 0, 0, 25, 1) === t && putNote(t, 0, 0, 0, -1, 1) === t && putNote(t, 5, 0, 0, 0, 1) === t, 'out-of-range placement is ignored');
t = removeNote(t, 0, 1, 5);
assert(!noteAt(t, 0, 0, 5) && noteAt(t, 0, 2, 5), 'removing a covered cell deletes the note that sounds there');
assert(removeNote(t, 0, 9, 3) === t, 'removing nothing changes nothing');
t = setLength(t, 0, 2, 5, 2);
assert(noteAt(t, 0, 2, 5)?.len === 2, 'length can be changed');
assert(setLength(t, 0, 3, 5, 2) === t, 'length of a note that does not start there is untouched');
const sorted = t.bars[0].notes.every((n, i, a) => i === 0 || a[i - 1].at < n.at || (a[i - 1].at === n.at && a[i - 1].s <= n.s));
assert(sorted, 'notes stay in time order');

// --- bars, chords, tempo
let b = addBar(t); assert(b.bars.length === 3, 'bar added at the end');
b = addBar(b, 1); assert(b.bars.length === 4 && b.bars[1].notes.length === 0, 'bar inserted');
b = removeBar(b, 1); assert(b.bars.length === 3, 'bar removed');
assert(removeBar(emptyTab(1), 0).bars.length === 1, 'the last bar cannot be removed');
let many = emptyTab(MAX_BARS); assert(addBar(many) === many, 'bar count is capped');
assert(putChord(t, 0, 0, '  Am7  ').bars[0].chords[0].name === 'Am7', 'chord names are trimmed');
{ // chords can sit anywhere in a bar, several per bar
  let c = putChord(putChord(putChord(emptyTab(2), 0, 8, 'D7'), 0, 0, 'Am7'), 1, 4, 'G');
  assert(c.bars[0].chords.map(x => x.at / Q + x.name).join() === '0Am7,8D7', 'chord markers stay in time order');
  assert(chordAt(c, 0, 8)?.name === 'D7' && !chordAt(c, 0, 4), 'chordAt finds a marker only at its exact step');
  assert(chordTimeline(c).map(x => `${x.step}:${x.name}`).join() === '0:Am7,24:D7,60:G', 'the timeline counts steps across bars');
  assert(chordsUsed(putChord(c, 1, 12, 'Am7')).join() === 'Am7,D7,G', 'chordsUsed lists each chord once, in order of first appearance');
  assert(putChord(c, 0, 8, '').bars[0].chords.length === 1 && putChord(c, 0, 5, '') === c, 'an empty name removes the marker (or does nothing)');
  assert(putChord(c, 0, 8, 'E7').bars[0].chords[1].name === 'E7', 'placing a chord at the same step replaces it');
  assert(putChord(c, 0, 16, 'C') === c && putChord(c, 9, 0, 'C') === c, 'out-of-range chord placement is ignored');
  let many = emptyTab(1); for (let i = 0; i < 12; i++) many = putChord(many, 0, i, 'C' + i);
  assert(many.bars[0].chords.length === 8, 'a bar holds at most 8 chord markers');
  assert(setVoicing(c, 'Am7', 2).voicings?.Am7 === 2 && !('Am7' in (setVoicing(setVoicing(c, 'Am7', 2), 'Am7', 0).voicings || {})) && setVoicing(c, 'Am7', -1) === c, 'chosen fingerings are stored by chord name (0 = the default)');
  { // generator choices live on the chord marker: one occurrence, not the chord name
    let a = putChord(putChord(emptyTab(2), 0, 0, 'A7'), 1, 0, 'A7');
    a = setChordPlan(a, 0, 0, { scale: 'minpent' }); a = setChordPlan(a, 0, 0, { positions: [3, 1, 3] });
    assert(a.bars[0].chords[0].scale === 'minpent' && a.bars[0].chords[0].positions.join() === '1,3', 'scale and positions are stored (sorted, de-duplicated)');
    assert(!a.bars[1].chords[0].scale && !a.bars[1].chords[0].positions, 'the same chord elsewhere keeps its own (automatic) choices');
    assert(setChordPlan(a, 0, 0, { scale: 'dorian' }).bars[0].chords[0].positions === undefined, 'changing the scale clears the positions (they are numbered per scale)');
    assert(setChordPlan(a, 0, 0, { scale: '' }).bars[0].chords[0].scale === undefined, 'an empty scale goes back to automatic');
    assert(setChordPlan(a, 0, 0, { positions: [] }).bars[0].chords[0].positions === undefined && setChordPlan(a, 0, 0, { positions: [] }).bars[0].chords[0].scale === 'minpent', 'no positions means every position, scale kept');
    assert(setChordPlan(a, 0, 0, { scale: 'nope' }).bars[0].chords[0].scale === undefined, 'an unknown scale is ignored');
    assert(setChordPlan(a, 0, 0, { positions: [0, 13, 1.5, 2] }).bars[0].chords[0].positions.join() === '2', 'out-of-range positions are dropped');
    assert(setChordPlan(a, 0, 9, { scale: 'dorian' }) === a && setChordPlan(a, 5, 0, { scale: 'dorian' }) === a, 'no marker there, nothing changes');
    assert(setChordPlan(a, 0, 0, { scale: 'minpent' }) === a, 'setting the same choice changes nothing');
    assert(putChord(a, 0, 0, 'A7').bars[0].chords[0].scale === 'minpent' && putChord(a, 0, 0, 'Dm').bars[0].chords[0].scale === undefined, 'retyping the same chord keeps its choices; a different chord drops them');
    const rt = normalizeTab(JSON.parse(JSON.stringify(a)));
    assert(JSON.stringify(rt) === JSON.stringify(a), 'choices survive a JSON round trip');
    const bad = normalizeTab({ bars: [{ chords: [{ at: 0, name: 'A7', scale: 'zzz', positions: [1, 'x', 99, 2] }], notes: [] }] });
    assert(bad.bars[0].chords[0].scale === undefined && bad.bars[0].chords[0].positions.join() === '1,2', 'stored choices are validated');
  }
  const old = normalizeTab({ bars: [{ chord: 'Em', notes: [] }, { chord: '', notes: [] }] });
  assert(old?.bars[0].chords.length === 1 && old.bars[0].chords[0].at === 0 && old.bars[1].chords.length === 0, 'the old one-chord-per-bar shape is still read');
  const rt = normalizeTab(JSON.parse(JSON.stringify(setVoicing(c, 'G', 3))));
  assert(JSON.stringify(rt) === JSON.stringify(setVoicing(c, 'G', 3)), 'chords and fingerings survive a JSON round trip');
  const junk = normalizeTab({ bars: [{ chords: [{ at: 99, name: 'C' }, { at: 1, name: 5 }, null, { at: 2, name: 'Dm' }], notes: [] }], voicings: { C: 'x', G: 2, [`${'x'.repeat(40)}`]: 1 } });
  assert(junk?.bars[0].chords.length === 1 && junk.bars[0].chords[0].name === 'Dm' && junk.voicings?.G === 2, 'bad chord markers and fingerings are dropped');
}
assert(setBpm(t, 9999).bpm === 220 && setBpm(t, 1).bpm === 40 && setBpm(t, 'x').bpm === 90, 'tempo is clamped');
assert(clearNotes(putChord(t, 0, 0, 'C')).bars[0].notes.length === 0 && clearNotes(putChord(t, 0, 0, 'C')).bars[0].chords[0].name === 'C', 'clear keeps the chords');

// --- pitch: low E fret 3 is G2 (43); open top string is E4 (64); capo shifts everything
let p = putNote(emptyTab(1), 0, 0, 5, 3, 2);
p = putNote(p, 0, 4, 0, 0, 2); p = putNote(p, 0, 8, 2, 2, 4);
const ev = tabEvents(p, GUITAR);
assert(ev.map(e => e.midi).join() === '43,64,57', `guitar pitches ${ev.map(e => e.midi)}`);
assert(ev.map(e => e.step).join() === '0,12,24' && ev[2].dur === 12, 'events carry step and duration');
assert(tabEvents(p, { midi: GUITAR.midi.map(m => m + 2) }).map(e => e.midi).join() === '45,66,59', 'capo 2 raises every note by two semitones');
assert(tabEvents(p, UKE).map(e => e.midi).join() === '69,62', 'a string the instrument lacks (string 5 on a ukulele) is skipped');
assert(tabEvents(putNote(emptyTab(2), 1, 3, 1, 1, 1), GUITAR)[0].step === STEPS + 9, 'steps count across bars');
assert(Math.abs(stepSeconds(120) * 3 - 0.125) < 1e-9 && Math.abs(stepSeconds(120) * BEAT - 0.5) < 1e-9, 'a sixteenth at 120 bpm is 0.125 s and a quarter 0.5 s');

// --- normalizeTab: never trust stored/shared data
assert(normalizeTab(null) === null && normalizeTab({}) === null && normalizeTab({ bars: [] }) === null && normalizeTab({ bars: 'x' }) === null, 'junk is rejected');
assert(normalizeTab({ bars: Array(MAX_BARS + 1).fill({ notes: [] }) }) === null, 'too many bars is rejected');
const dirty = normalizeTab({ title: 'x'.repeat(500), bpm: 5000, bars: [{ chord: 7, notes: [
  { at: 0, len: 2, s: 0, f: 3 }, { at: 0, len: 2, s: 0, f: 5 },       // overlap -> the later wins
  { at: 99, len: 1, s: 0, f: 1 }, { at: 1, len: 0, s: 0, f: 1 }, { at: 1, len: 1, s: -1, f: 1 }, { at: 1, len: 1, s: 0, f: 99 },
  { at: 2, len: 1.5, s: 0, f: 1 }, null, 'x', { at: 3, len: 99, s: 0, f: 1 }] }, 'nope'] });
assert(dirty && dirty.title.length === 80 && dirty.bpm === 220 && dirty.bars[0].chords.length === 0, 'title, tempo and chord are repaired');
assert(dirty.bars[0].notes.length === 1 + 0 || dirty.bars[0].notes.every(n => n.at >= 0 && n.at < STEPS && n.len >= 1 && n.f >= 0 && n.f <= 24), 'only valid notes survive');
assert(dirty.bars[0].notes.filter(n => n.s === 0 && n.at === 0).length === 1 && noteAt(dirty, 0, 0, 0).f === 5, 'overlaps are resolved');
assert(dirty.bars[1].notes.length === 0, 'a malformed bar becomes empty');
assert(JSON.stringify(normalizeTab(JSON.parse(JSON.stringify(t)))) === JSON.stringify(t), 'a valid tab survives a JSON round trip unchanged');

// --- history
const h = createHistory(emptyTab(1));
const a1 = putNote(h.current, 0, 0, 0, 1, 1), a2 = putNote(a1, 0, 1, 0, 2, 1);
h.push(a1); h.push(a2);
assert(h.canUndo && !h.canRedo, 'history can undo after edits');
assert(h.undo() === a1 && h.undo().bars[0].notes.length === 0 && !h.canUndo, 'undo steps back to the start');
assert(h.canRedo && h.redo() === a1 && h.redo() === a2 && !h.canRedo, 'redo walks forward again');
h.undo(); h.push(putNote(a1, 0, 5, 0, 9, 1));
assert(!h.canRedo, 'a new edit clears the redo stack');
h.replace(a2); assert(h.current === a2, 'replace rewrites the current state');

// --- text export (exact layout)
assert(stringNames(GUITAR.midi).join('') === 'eBGDAE' && stringNames(UKE.midi).join('') === 'AECG', 'string names (top string lower case when it repeats)');
let x = putNote(emptyTab(1), 0, 0, 5, 3, 2); x = putNote(x, 0, 4, 0, 12, 2); x = putChord(x, 0, 0, 'G');
const text = tabToText({ ...x, title: 'Lick' }, GUITAR.midi);
const want = ['Lick', '', '  G', 'e|--------12----------------------|', 'B|--------------------------------|',
  'G|--------------------------------|', 'D|--------------------------------|', 'A|--------------------------------|', 'E|3-------------------------------|'].join('\n') + '\n';
assert(text === want, `text export differs:\n${text}\nwanted:\n${want}`);
{ let m = putNote(emptyTab(1), 0, 0, 5, 3, 2); m = putChord(putChord(m, 0, 0, 'Am7'), 0, 8, 'D7');
  const l = tabToText(m, GUITAR.midi).split('\n')[0];
  assert(l === '  Am7' + ' '.repeat(2 * 8 - 3) + 'D7', `two chords in one bar are placed above their steps: "${l}"`); }
assert(tabToText(emptyTab(5), GUITAR.midi).split('\n').filter(l => l.startsWith('e|')).length === 3, 'bars wrap onto lines (2 per line -> 3 lines for 5 bars)');
assert(tabToText(x, UKE.midi).split('\n').filter(l => /\|$/.test(l)).length === 4, 'ukulele tab has four lines');

// --- rendering
{
  let r = putNote(emptyTab(3), 0, 0, 5, 3, 2); r = putNote(r, 0, 4, 0, 12, 4); r = putNote(r, 1, 0, 2, 0, 1); r = putChord(r, 1, 0, 'Am7');
  const svg = tabSvg(r, GUITAR, { perRow: 2, editable: true });
  const frets = [...svg.matchAll(/class="fret" data-bar="(\d+)" data-at="(\d+)" data-s="(\d+)" x="([\d.]+)" y="([\d.]+)"[^>]*>(\d+)</g)].map(m => ({ bar: +m[1], at: +m[2], s: +m[3], x: +m[4], y: +m[5], f: m[6] }));
  assert(frets.length === 3 && frets.map(f => f.f).join() === '3,12,0', `fret numbers are drawn: ${frets.map(f => f.f)}`);
  assert(frets[1].x - frets[0].x === 12 * STEP_W, 'horizontal position follows the step grid');
  assert(frets[0].y > frets[1].y, 'the low string is drawn below the high string');
  assert(frets[2].x - frets[0].x === BAR_W, 'the next bar starts one bar width to the right');
  const third = tabSvg(r, GUITAR, { perRow: 2 }), rowDrop = stepPos(6, 2, 2, 0).y - stepPos(6, 2, 0, 0).y;
  assert(rowDrop > 60 && stepPos(6, 2, 2, 0).x === stepPos(6, 2, 0, 0).x, 'the third bar wraps to a second row under the first');
  assert((svg.match(/class="tabhit"/g) || []).length === 3 * 16 * 6 && !/tabhit/.test(third), 'editable boards have a click cell per bar, step and string; read-only ones have none');
  assert(svg.includes('>Am7<') && (svg.match(/class="tabname"/g) || []).length === 6 * 2, 'chord names and string names are drawn');
  assert(/class="tabcursor"/.test(tabSvg(r, GUITAR, { perRow: 2, cursor: { bar: 0, at: 3, s: 1 } })) && !/tabcursor/.test(svg), 'the cursor only appears when asked for');
  assert(barsPerRowFor(360) === 1 && barsPerRowFor(1000) === 3 && barsPerRowFor(10) === 1, 'bars per row follow the available width');
  assert((tabSvg(r, UKE, { perRow: 2 }).match(/class="tabline"/g) || []).length === 4 * 2, 'a ukulele tab has four lines per row');
  assert(!/class="fret"[^>]*data-s="5"/.test(tabSvg(r, UKE, { perRow: 2 })), 'notes on strings the instrument lacks are not drawn');
  assert(/<script|onerror/i.test(tabSvg(putChord(emptyTab(1), 0, 0, '<script>'), GUITAR, { perRow: 1 })) === false, 'chord names are escaped');
}

// --- triplets: a 48-step bar holds straight and triplet notes exactly
{
  assert(STEPS === 48 && BEAT === 12, 'a bar is 48 steps, a quarter 12');
  assert(LENGTHS.join() === '3,6,9,12,18,24,36,48', 'straight lengths: 1/16, 1/8, 1/8., 1/4, 1/4., 1/2, 1/2., whole');
  assert(TRIPLET_OF[3] === 2 && TRIPLET_OF[6] === 4 && TRIPLET_OF[12] === 8 && TRIPLET_OF[24] === 16 && !TRIPLET_OF[9], 'triplet lengths are two thirds of the straight ones; dotted notes have none');
  assert(gridFor(4) === 4 && gridFor(8) === 8 && gridFor(6) === 3 && gridFor(12) === 3, 'triplets are placed on their own grid, everything else on sixteenths');
  let r = emptyTab(1);
  for (const at of [0, 4, 8]) r = T.putNote(r, 0, at, 2, 5, 4);                  // three triplet eighths fill one beat
  r = T.putNote(r, 0, 12, 2, 7, 12);                                              // then a quarter
  r = T.putNote(r, 0, 24, 2, 3, 8); r = T.putNote(r, 0, 32, 2, 4, 8); r = T.putNote(r, 0, 40, 2, 5, 8); // three triplet quarters (two beats)
  assert(r.bars[0].notes.map(n => n.at).join() === '0,4,8,12,24,32,40' && r.bars[0].notes.every(n => n.len === (n.at === 12 ? 12 : n.at >= 24 ? 8 : 4)), 'triplet groups and straight notes sit side by side');
  assert(r.bars[0].notes.reduce((e, n) => Math.max(e, n.at + n.len), 0) === 48, 'the triplet quarters end exactly at the bar line');
  const cut = T.putNote(T.putNote(emptyTab(1), 0, 0, 0, 1, 6), 0, 4, 0, 2, 4);
  assert(cut.bars[0].notes[0].len === 4, 'a straight eighth is cut short by a triplet note that starts inside it');
  assert(tabEvents(r, GUITAR).map(e => e.step).join() === '0,4,8,12,24,32,40', 'triplet notes play at exact steps');
  // tabs saved before triplets (16 steps per bar, no res) are converted, nothing moves
  const old = normalizeTab({ title: 'old', bpm: 100, bars: [{ chords: [{ at: 8, name: 'C' }], notes: [{ at: 4, len: 2, s: 0, f: 3 }, { at: 0, len: 16, s: 5, f: 1 }] }, { chord: 'G', notes: [] }] });
  assert(old.res === 48 && old.bars[0].chords[0].at === 24 && old.bars[0].notes.map(n => n.at + ':' + n.len).join() === '0:48,12:6' && old.bars[1].chords[0].at === 0, 'a tab from before triplets is converted to the finer grid');
  const fresh = JSON.parse(JSON.stringify(r));
  assert(JSON.stringify(normalizeTab(fresh)) === JSON.stringify(r), 'a current tab is read as it is (not scaled again)');
  assert(normalizeTab({ res: 24, bars: [{ chords: [], notes: [] }] }) === null && normalizeTab({ res: 16, bars: [{ chords: [], notes: [] }] }) !== null, 'only the two known grids are accepted');
  assert(normalizeTab({ res: 48, bars: [{ chords: [], notes: [{ at: 47, len: 3, s: 0, f: 1 }, { at: 0, len: 49, s: 0, f: 1 }] }] }).bars[0].notes.length === 1, 'a note longer than the bar is dropped, one that would overrun is clipped');
  // plain-text export: straight tabs keep 16 cells per bar, triplets switch to 24 and round
  const trip = ['1', '2', '3'].reduce((acc, f, i) => T.putNote(acc, 0, i * 4, 0, +f, 4), emptyTab(1));
  const line = tabToText(trip, GUITAR.midi).split('\n').find(l => l.startsWith('e|'));
  assert(line === 'e|1---2---3-' + '-'.repeat(48 - 10) + '|', `triplets are placed at their nearest of 24 cells: ${line}`);
  assert(tabToText(putNote(emptyTab(1), 0, 4, 0, 1, 2), GUITAR.midi).split('\n').find(l => l.startsWith('e|')).length === 2 + 32 + 1, 'a straight tab still has 16 cells per bar');
  // drawing
  const tr = tabSvg(r, GUITAR, { perRow: 1 });
  assert((tr.match(/class="tabtuplet"/g) || []).length === 2 && (tr.match(/class="tabtupletnum"[^>]*>3</g) || []).length === 2, 'each triplet group gets a bracket with a 3 (one group of eighths, one of quarters)');
  assert(!/tabtuplet/.test(tabSvg(putNote(emptyTab(1), 0, 0, 0, 1, 2), GUITAR, { perRow: 1 })), 'straight notes have no bracket');
  const pair = T.putNote(T.putNote(emptyTab(1), 0, 0, 0, 1, 8), 0, 8, 0, 2, 4);
  assert((tabSvg(pair, GUITAR, { perRow: 1 }).match(/class="tabtuplet"/g) || []).length === 1, 'a shuffle pair (triplet quarter + triplet eighth) is one bracketed beat, not two');
  const cells = g => (tabSvg(emptyTab(1), GUITAR, { perRow: 1, editable: true, grid: g }).match(/class="tabhit"/g) || []).length;
  assert(cells(3) === 16 * 6 && cells(4) === 12 * 6 && cells(2) === 24 * 6 && cells(8) === 6 * 6, 'click cells follow the grid of the chosen note length');
  assert(/class="tabcursor"[^>]*width="48"/.test(tabSvg(emptyTab(1), GUITAR, { perRow: 1, cursor: { bar: 0, at: 0, s: 0, w: 8 } })), 'the cursor is as wide as the note being entered');
  // swing: beats stay put, the off-beat eighth moves
  assert([0, 3, 6, 9, 12, 18, 30].every(x => swung(x, 12, 0.5) === x), 'straight swing changes nothing');
  assert(swung(6, 12, 2 / 3) === 8 && swung(3, 12, 2 / 3) === 4 && Math.round(swung(9, 12, 2 / 3) * 1000) === 10000 && swung(12, 12, 2 / 3) === 12 && swung(18, 12, 2 / 3) === 20, 'shuffle turns the off-beat eighth into the last triplet of the beat');
  let prev = -1; let mono = true; for (let x = 0; x < 48; x++) { const v = swung(x, 12, 0.58); if (v <= prev) mono = false; prev = v; }
  assert(mono && SWINGS[0].long === 0.5 && SWINGS.some(x => x.id === 'shuffle' && Math.abs(x.long - 2 / 3) < 1e-9), 'swing keeps notes in order; options include straight and shuffle');
}

// --- techniques: hammer-on / pull-off, slide, bend, vibrato
{
  const st = (t, bar, at, s, patch) => T.setTechnique(t, bar, at * Q, s, patch);
  let t = emptyTab(1);
  t = putNote(t, 0, 0, 2, 5, 2); t = putNote(t, 0, 2, 2, 7, 2); t = putNote(t, 0, 4, 1, 8, 4);
  const ev = x => tabEvents(x, GUITAR);
  // setting and clearing
  let h = st(t, 0, 0, 2, { link: 'h' });
  assert(noteAt(h, 0, 0, 2).link === 'h' && !noteAt(t, 0, 0, 2).link, 'a hammer-on is set on the first note');
  assert(st(h, 0, 0, 2, { link: '' }).bars[0].notes.every(n => !n.link), 'and cleared again');
  assert(st(h, 0, 0, 2, { link: 'h' }) === h && st(t, 0, 9, 2, { link: 'h' }) === t && st(t, 5, 0, 2, { link: 'h' }) === t, 'setting the same thing, or on a missing note, changes nothing');
  assert(st(t, 0, 0, 2, { link: 'x' }).bars[0].notes[0].link === undefined, 'an unknown link is ignored');
  let b = st(t, 0, 4, 1, { bend: 2 }); b = st(b, 0, 4, 1, { vib: true });
  assert(noteAt(b, 0, 4, 1).bend === 2 && noteAt(b, 0, 4, 1).vib === true, 'bend and vibrato combine');
  assert(st(b, 0, 4, 1, { bend: 9 }).bars[0].notes[2].bend === undefined && st(b, 0, 4, 1, { bend: 0 }).bars[0].notes[2].bend === undefined && st(b, 0, 4, 1, { vib: false }).bars[0].notes[2].vib === undefined, 'bends are 1-4 semitones; 0 or junk clears it; vibrato clears');
  const sl = st(b, 0, 4, 1, { link: 's' });
  assert(noteAt(sl, 0, 4, 1).link === 's' && noteAt(sl, 0, 4, 1).bend === undefined && noteAt(sl, 0, 4, 1).vib === undefined, 'a slide replaces bend and vibrato on that note');
  // techniques survive editing the note, and a JSON round trip
  const kept = putNote(h, 0, 0, 2, 9, 2);
  assert(noteAt(kept, 0, 0, 2).f === 9 && noteAt(kept, 0, 0, 2).link === 'h', 'changing the fret keeps the technique');
  assert(noteAt(putNote(h, 0, 1, 2, 3, 1), 0, 0, 2).link === 'h', 'cutting a note short keeps its technique');
  const full = st(st(st(t, 0, 0, 2, { link: 's' }), 0, 4, 1, { bend: 3 }), 0, 4, 1, { vib: true });
  assert(JSON.stringify(normalizeTab(JSON.parse(JSON.stringify(full)))) === JSON.stringify(full), 'techniques survive a JSON round trip');
  const bad = normalizeTab({ res: 48, bars: [{ chords: [], notes: [{ at: 0, len: 6, s: 0, f: 3, link: 'z', bend: 7, vib: 'yes' }] }] });
  assert(bad.bars[0].notes[0].link === undefined && bad.bars[0].notes[0].bend === undefined && bad.bars[0].notes[0].vib === undefined, 'stored techniques are validated');
  // what a link can run into
  const nn = [{ at: 0, len: 6, s: 2, f: 5 }, { at: 9, len: 3, s: 2, f: 7 }, { at: 30, len: 6, s: 2, f: 9 }, { at: 6, len: 6, s: 1, f: 4 }];
  assert(T.linkedNext(nn, nn[0]) === nn[1] && T.linkedNext(nn, nn[1]) === undefined && T.linkedNext(nn, nn[3]) === undefined, 'a link runs into the next note on the same string if it follows within a sixteenth; a far note or another string does not count');
  // playback events
  const eh = ev(h);
  assert(eh[0].soft === undefined && eh[1].soft === true && eh.length === 3, 'a hammer-on makes the second note soft (no pick)');
  const es = ev(st(t, 0, 0, 2, { link: 's' }));
  assert(es.length === 3 && es[0].slideTo === 62 && es[0].dur === 12 && es[0].slideEnd === 6 && es[0].slideAt < es[0].slideEnd && es.filter(e => e.skip).length === 1 && es[1].skip === true, `a slide is one long glide into the next note, which is not struck again: ${JSON.stringify(es[0])}`);
  const lone = ev(st(putNote(emptyTab(1), 0, 0, 2, 5, 2), 0, 0, 2, { link: 'h' }));
  assert(lone.length === 1 && !lone[0].soft && !lone[0].skip && lone[0].slideTo === undefined, 'a link with no next note does nothing');
  const eb = ev(b).find(e => e.s === 1);
  assert(eb.bend === 2 && eb.vib === true && eb.midi === 59 + 8, 'bend and vibrato reach the player; the pitch is the written fret');
  // drawing
  const draw = x => tabSvg(x, GUITAR, { perRow: 1 });
  assert((draw(h).match(/class="tablink"/g) || []).length === 1 && />h</.test(draw(h)) && !/>p</.test(draw(h)), 'a hammer-on is a slur marked h');
  const pull = st(putNote(putNote(emptyTab(1), 0, 0, 2, 7, 2), 0, 2, 2, 5, 2), 0, 0, 2, { link: 'h' });
  assert(/>p</.test(draw(pull)) && !/>h</.test(draw(pull)), 'a pull-off is a slur marked p');
  assert(/<line class="tablink"/.test(draw(st(t, 0, 0, 2, { link: 's' }))) && !/class="tablinkletter"/.test(draw(st(t, 0, 0, 2, { link: 's' }))), 'a slide is a slanted line with no letter');
  const up = draw(st(t, 0, 0, 2, { link: 's' })), down = draw(st(putNote(putNote(emptyTab(1), 0, 0, 2, 7, 2), 0, 2, 2, 5, 2), 0, 0, 2, { link: 's' }));
  const ys = svg => svg.match(/<line class="tablink" x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="([\d.]+)"/).slice(1).map(Number);
  assert(ys(up)[0] > ys(up)[1] && ys(down)[0] < ys(down)[1], 'a slide up climbs, a slide down falls');
  assert(/class="tabbend"/.test(draw(b)) && />full</.test(draw(b)) && />1\/2</.test(draw(st(t, 0, 4, 1, { bend: 1 }))) && />1 1\/2</.test(draw(st(t, 0, 4, 1, { bend: 3 }))), 'a bend is an arrow labelled with its size');
  assert((draw(st(t, 0, 4, 1, { vib: true })).match(/class="tabbend"/g) || []).length === 1 && !/tablink/.test(draw(t)), 'vibrato is a wavy line; plain notes have no marks');
}

console.log(failures ? `${failures} FAILED` : 'tab: all passed');
process.exit(failures ? 1 : 0);
