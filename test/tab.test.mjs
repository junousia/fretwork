// The tab model: editing rules, pitch, validation of untrusted data, undo/redo,
// and the plain-text export.
import { emptyTab, putNote, removeNote, setLength, addBar, removeBar, setChord, setBpm, clearNotes, noteAt, noteCovering,
  tabEvents, stepSeconds, normalizeTab, createHistory, stringNames, tabToText, STEPS, MAX_BARS } from '../site/tab.js';

import { tabSvg, barsPerRowFor, stepPos, BAR_W, STEP_W } from '../site/tab-view.js';

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
assert(setChord(t, 0, '  Am7  ').bars[0].chord === 'Am7', 'chord names are trimmed');
assert(setBpm(t, 9999).bpm === 220 && setBpm(t, 1).bpm === 40 && setBpm(t, 'x').bpm === 90, 'tempo is clamped');
assert(clearNotes(setChord(t, 0, 'C')).bars[0].notes.length === 0 && clearNotes(setChord(t, 0, 'C')).bars[0].chord === 'C', 'clear keeps the chords');

// --- pitch: low E fret 3 is G2 (43); open top string is E4 (64); capo shifts everything
let p = putNote(emptyTab(1), 0, 0, 5, 3, 2);
p = putNote(p, 0, 4, 0, 0, 2); p = putNote(p, 0, 8, 2, 2, 4);
const ev = tabEvents(p, GUITAR);
assert(ev.map(e => e.midi).join() === '43,64,57', `guitar pitches ${ev.map(e => e.midi)}`);
assert(ev.map(e => e.step).join() === '0,4,8' && ev[2].dur === 4, 'events carry step and duration');
assert(tabEvents(p, { midi: GUITAR.midi.map(m => m + 2) }).map(e => e.midi).join() === '45,66,59', 'capo 2 raises every note by two semitones');
assert(tabEvents(p, UKE).map(e => e.midi).join() === '69,62', 'a string the instrument lacks (string 5 on a ukulele) is skipped');
assert(tabEvents(putNote(emptyTab(2), 1, 3, 1, 1, 1), GUITAR)[0].step === STEPS + 3, 'steps count across bars');
assert(Math.abs(stepSeconds(120) - 0.125) < 1e-9, 'a sixteenth at 120 bpm is 0.125 s');

// --- normalizeTab: never trust stored/shared data
assert(normalizeTab(null) === null && normalizeTab({}) === null && normalizeTab({ bars: [] }) === null && normalizeTab({ bars: 'x' }) === null, 'junk is rejected');
assert(normalizeTab({ bars: Array(MAX_BARS + 1).fill({ notes: [] }) }) === null, 'too many bars is rejected');
const dirty = normalizeTab({ title: 'x'.repeat(500), bpm: 5000, bars: [{ chord: 7, notes: [
  { at: 0, len: 2, s: 0, f: 3 }, { at: 0, len: 2, s: 0, f: 5 },       // overlap -> the later wins
  { at: 99, len: 1, s: 0, f: 1 }, { at: 1, len: 0, s: 0, f: 1 }, { at: 1, len: 1, s: -1, f: 1 }, { at: 1, len: 1, s: 0, f: 99 },
  { at: 2, len: 1.5, s: 0, f: 1 }, null, 'x', { at: 3, len: 99, s: 0, f: 1 }] }, 'nope'] });
assert(dirty && dirty.title.length === 80 && dirty.bpm === 220 && dirty.bars[0].chord === '', 'title, tempo and chord are repaired');
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
let x = putNote(emptyTab(1), 0, 0, 5, 3, 2); x = putNote(x, 0, 4, 0, 12, 2); x = setChord(x, 0, 'G');
const text = tabToText({ ...x, title: 'Lick' }, GUITAR.midi);
const want = ['Lick', '', '  G', 'e|--------12----------------------|', 'B|--------------------------------|',
  'G|--------------------------------|', 'D|--------------------------------|', 'A|--------------------------------|', 'E|3-------------------------------|'].join('\n') + '\n';
assert(text === want, `text export differs:\n${text}\nwanted:\n${want}`);
assert(tabToText(emptyTab(5), GUITAR.midi).split('\n').filter(l => l.startsWith('e|')).length === 3, 'bars wrap onto lines (2 per line -> 3 lines for 5 bars)');
assert(tabToText(x, UKE.midi).split('\n').filter(l => /\|$/.test(l)).length === 4, 'ukulele tab has four lines');

// --- rendering
{
  let r = putNote(emptyTab(3), 0, 0, 5, 3, 2); r = putNote(r, 0, 4, 0, 12, 4); r = putNote(r, 1, 0, 2, 0, 1); r = setChord(r, 1, 'Am7');
  const svg = tabSvg(r, GUITAR, { perRow: 2, editable: true });
  const frets = [...svg.matchAll(/class="fret" data-bar="(\d+)" data-at="(\d+)" data-s="(\d+)" x="([\d.]+)" y="([\d.]+)"[^>]*>(\d+)</g)].map(m => ({ bar: +m[1], at: +m[2], s: +m[3], x: +m[4], y: +m[5], f: m[6] }));
  assert(frets.length === 3 && frets.map(f => f.f).join() === '3,12,0', `fret numbers are drawn: ${frets.map(f => f.f)}`);
  assert(frets[1].x - frets[0].x === 4 * STEP_W, 'horizontal position follows the step grid');
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
  assert(/<script|onerror/i.test(tabSvg(setChord(emptyTab(1), 0, '<script>'), GUITAR, { perRow: 1 })) === false, 'chord names are escaped');
}

console.log(failures ? `${failures} FAILED` : 'tab: all passed');
process.exit(failures ? 1 : 0);
