// Arpeggios: degree chords, chord tones inside scale positions, and the
// arpeggio shape around a chord voicing.
import fs from 'fs';
import { degreeChord, arpeggioInSets, arpeggioAround, arpeggioNotes, upAndDown } from '../site/arpeggio.js';
import { getPositions, positionFrets } from '../site/positions.js';
import { SCALES, CHORDS, TUNING, spell } from '../site/music.js';

let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const GUITAR = { tuning: TUNING, midi: [64, 59, 55, 50, 45, 40] };

// --- degree chords ------------------------------------------------------------
const ionian = SCALES.find(s => s.id === 'ionian').iv;
const names = sev => [0, 1, 2, 3, 4, 5, 6].map(k => degreeChord(ionian, k, sev).key);
assert(same(names(false), ['', 'm', 'm', '', '', 'm', 'dim']), `C major triads: ${names(false)}`);
assert(same(names(true), ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5']), `C major sevenths: ${names(true)}`);
assert(same([0, 1, 2, 3, 4, 5, 6].map(k => degreeChord(ionian, k).numeral), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']), 'roman numerals follow chord quality');
assert(degreeChord(SCALES.find(s => s.id === 'minpent').iv, 0) === null, 'only seven-note scales have degree chords');
const harm = SCALES.find(s => s.id === 'harmmin').iv;
assert(degreeChord(harm, 2).numeral === 'III+' && degreeChord(harm, 2).key === 'aug', 'harmonic minor III is augmented');
assert(spell(0 + degreeChord(ionian, 4).root, false) === 'G', 'degree V of C major is rooted on G');

// --- arpeggio inside every position: complete, and only chord tones ------------------
{
  let combos = 0, foreign = 0, incomplete = 0;
  for (const sc of SCALES) {
    if (new Set(sc.iv).size !== 7) continue;
    for (let root = 0; root < 12; root++) {
      const P = getPositions(sc.iv, root, GUITAR.tuning);
      P.forEach((p, i) => {
        const sets = positionFrets(P, i, sc.iv, root, GUITAR.tuning, GUITAR.midi);
        for (let k = 0; k < 7; k++) for (const sev of [false, true]) {
          const dc = degreeChord(sc.iv, k, sev);
          const pcs = dc.iv.map(x => (root + dc.root + x) % 12);
          const arp = arpeggioInSets(sets, GUITAR, pcs);
          combos++;
          const got = new Set();
          arp.forEach((set, j) => set.forEach(f => { const pc = (GUITAR.tuning[j] + f) % 12; got.add(pc); if (!pcs.includes(pc)) foreign++; }));
          if (!pcs.every(pc => got.has(pc))) incomplete++;
        }
      });
    }
  }
  assert(foreign === 0, `${foreign} arpeggio notes are not chord tones`);
  assert(incomplete === 0, `${incomplete} (position, chord) pairs lack a chord tone inside the position`);
  console.log(`Arpeggio-in-position checks: ${combos} (scale, root, position, degree chord) combinations, ${foreign} foreign, ${incomplete} incomplete`);
}

// --- arpeggio shape around every stored voicing ---------------------------------------
{
  const V = JSON.parse(fs.readFileSync(new URL('../site/data/voicings.json', import.meta.url), 'utf8'));
  const OPEN = { guitar: [64, 59, 55, 50, 45, 40], ukulele: [69, 64, 60, 67] };
  const TUN = { guitar: TUNING, ukulele: [9, 4, 0, 7] };
  const EXTRA = { 11: [4], 13: [5] };
  let n = 0, missingOwn = 0, outside = 0, thin = 0;
  for (const inst of Object.keys(V)) {
    const I = { tuning: TUN[inst], midi: OPEN[inst] };
    for (const [key, list] of Object.entries(V[inst])) {
      const root = +key.split('|')[0], suffix = key.slice(key.indexOf('|') + 1);
      const pcs = [...new Set([...CHORDS[suffix], ...(EXTRA[suffix] || [])].map(x => (root + x) % 12))];
      for (const v of list) {
        n++;
        const sets = arpeggioAround(v, I, pcs);
        const played = v.f.filter(f => f > 0), lo = played.length ? Math.min(...played) - 1 : 0, hi = (played.length ? Math.max(...played) : 3) + 1;
        v.f.forEach((f, j) => { if (f >= 0 && !sets[j].has(f)) missingOwn++; });
        sets.forEach(set => set.forEach(f => { if (f > hi || (f < lo && !v.f.includes(0))) outside++; }));
        const got = new Set(); sets.forEach((set, j) => set.forEach(f => got.add((I.tuning[j] + f) % 12)));
        if (got.size < Math.min(3, pcs.length)) thin++; // a shape needs at least three distinct chord tones to be an arpeggio
      }
    }
  }
  assert(missingOwn === 0, `${missingOwn} voicing notes are missing from their own arpeggio shape`);
  assert(outside === 0, `${outside} arpeggio notes fall outside the voicing's fret window`);
  assert(thin === 0, `${thin} arpeggio shapes have fewer than three distinct chord tones`);
  console.log(`Arpeggio-shape checks over ${n} voicings: ${missingOwn} own notes missing, ${outside} outside the window, ${thin} thin shapes`);
}

// --- notes and playback order ----------------------------------------------------------
{
  const sets = [new Set([0, 3]), new Set([5]), new Set([3, 0]), new Set(), new Set([2]), new Set([0, 3])];
  const inst = { midi: [64, 59, 55, 50, 45, 40] };
  const notes = arpeggioNotes(sets, inst);
  assert(same(notes, [...new Set(notes)].sort((a, b) => a - b)) && notes.length > 3, 'arpeggio notes are unique and ascending');
  const ud = upAndDown([1, 2, 3, 4]);
  assert(same(ud, [1, 2, 3, 4, 3, 2, 1]), 'up and down does not repeat the top note');
  assert(same(upAndDown([5]), [5]) && same(upAndDown([]), []), 'up and down handles tiny inputs');
}

console.log(`Arpeggio checks: ${failures} failure(s)`);
if (failures) process.exit(1);
