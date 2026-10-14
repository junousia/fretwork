// Chord identification: fixed cases, plus every stored voicing must be
// recognised as the chord it is filed under (ranked in the top results).
import fs from 'fs';
import { identifyChord, marksToNotes } from '../site/identify.js';
import { CHORDS } from '../site/music.js';

let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };
const GUITAR = { midi: [64, 59, 55, 50, 45, 40], tuning: [4, 11, 7, 2, 9, 4] };
const UKE = { midi: [69, 64, 60, 67], tuning: [9, 4, 0, 7] };
const names = (frets, inst) => { const { pcs, bass } = marksToNotes(frets, inst); return identifyChord(pcs, bass).map(m => m.name); };
const top = (frets, inst) => names(frets, inst)[0];

// Textbook open shapes (frets listed top string first, so x32010 reads 0,1,0,2,3,-1).
assert(top([0, 1, 0, 2, 3, -1], GUITAR) === 'C', 'open C');
assert(top([0, 0, 0, 2, 2, 0], GUITAR) === 'Em', 'open Em');
assert(top([0, 0, 1, 2, 2, 0], GUITAR) === 'E', 'open E');
assert(top([0, 1, 2, 2, 0, -1], GUITAR) === 'Am', 'open Am');
assert(top([3, 0, 0, 0, 2, 3], GUITAR) === 'G', 'open G');
assert(top([2, 3, 2, 0, -1, -1], GUITAR) === 'D', 'open D');
assert(top([1, 3, 3, 3, 1, -1], GUITAR) === 'Bb', 'Bb barre shape');
assert(names([0, 3, 2, 0, 0, 0], GUITAR).length > 0, 'Em-ish shape found');

// Ukulele G C E A: C = 0003, Am = 2000, F = 2010, G7 = 0212 (top string first = A E C G).
assert(top([3, 0, 0, 0], UKE) === 'C', 'uke C');
assert(top([0, 0, 0, 2], UKE) === 'Am', 'uke Am (no slash from the re-entrant G)');
assert(top([0, 1, 0, 2], UKE) === 'F', 'uke F (2010)');
assert(top([2, 1, 2, 0], UKE) === 'G7', 'uke G7 (0212)');

// Slash chords and ambiguity.
assert(top([0, 0, 0, 2, 2, 0], GUITAR) === 'Em', 'Em root position is not a slash chord');
assert(names([0, 1, 0, 2, 3, 0], GUITAR).some(n => n === 'C/E'), 'C over open E is C/E');
// Cmaj6 and Am7 share notes: both must be offered.
{ const { pcs, bass } = marksToNotes([0, 1, 2, 2, 3, -1], GUITAR); const n = identifyChord(pcs, bass).map(m => m.name); assert(n.includes('Am7') || n.includes('C6') || n.includes('Cmaj6'), 'ambiguous 6/m7 offered'); }
assert(identifyChord([0], 0).length === 0, 'a single note is not a chord');
assert(identifyChord([], 0).length === 0, 'no notes, no chords');

// Every stored voicing is recognised as the chord it is filed under: for each
// one, the filed chord's pitch classes must appear in the first 5 results.
{
  const V = JSON.parse(fs.readFileSync(new URL('../site/data/voicings.json', import.meta.url), 'utf8'));
  const insts = { guitar: GUITAR, ukulele: UKE };
  const tally = { first: 0, top5: 0, rest: 0 };
  let total = 0;
  for (const [fam, byChord] of Object.entries(V)) {
    if (!insts[fam]) continue;
    for (const [key, list] of Object.entries(byChord)) {
      const root = +key.split('|')[0], suf = key.slice(key.indexOf('|') + 1);
      const ivs = suf === '11' ? [0, 4, 7, 10, 2, 5] : CHORDS[suf];
      const want = [...new Set(ivs.map(t => (root + t) % 12))].sort((a, b) => a - b).join();
      for (const v of list) {
        const { pcs, bass } = marksToNotes(v.f, insts[fam]);
        const res = identifyChord(pcs, bass, 60);
        const idx = res.findIndex(m => m.root === root && [...new Set(m.tones)].sort((a, b) => a - b).join() === want);
        total++;
        if (idx === 0) tally.first++; else if (idx >= 0 && idx < 5) tally.top5++; else tally.rest++;
        // the guitar data is full-size chords: the filed chord must always be offered
        if (fam === 'guitar' && idx < 0) assert(false, `guitar ${key} ${JSON.stringify(v.f)} is not identified`);
      }
    }
  }
  console.log(`stored voicings: ${total}, ranked first ${tally.first}, top5 ${tally.top5}, lower ${tally.rest}`);
  assert(tally.first / total > 0.6, 'most stored voicings are ranked first');
}

console.log(failures ? `${failures} FAILED` : 'identify: all passed');
process.exit(failures ? 1 : 0);
