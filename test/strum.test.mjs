// Strum patterns: where the hits fall over chords of different lengths and what each hit plays.
import { STRUMS, strumHits, hitNotes, strumById } from '../site/strum-patterns.js';

let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };
const C = [48, 52, 55, 60, 64]; // C E G c e

assert(STRUMS.length >= 8 && new Set(STRUMS.map(s => s.id)).size === STRUMS.length && STRUMS[0].id === 'single', 'there are several patterns with unique ids, "single" first (the old behaviour)');
assert(strumById('nonsense').id === 'single', 'an unknown pattern falls back to the single strum');
for (const s of STRUMS) {
  for (const beats of [1, 2, 4, 8]) {
    const h = strumHits(s.id, beats);
    assert(h.length > 0 && h[0].at < 1 && (s.id === 'offbeat' || h[0].at === 0), `${s.id}/${beats}: the first hit is on the chord start (the off-beat chops wait for the "and")`);
    assert(h.every((x, i) => x.at >= 0 && x.at < beats && x.len > 0 && (i === 0 || x.at > h[i - 1].at)), `${s.id}/${beats}: hits inside the chord, in order, each with a length`);
    assert(h.every(x => x.at + x.len <= beats + 1e-9 || x.len <= 1), `${s.id}/${beats}: nothing rings far past the end of the chord`);
  }
}
assert(strumHits('single', 8).length === 1 && strumHits('single', 8)[0].len === 8, 'the single strum is one hit that rings the whole chord, even over two bars');
assert(strumHits('quarters', 4).map(h => h.at).join() === '0,1,2,3' && strumHits('quarters', 8).length === 8, 'down on every beat: 4 hits a bar, repeated over a longer chord');
assert(strumHits('eighths', 4).map(h => h.dir).join('') === 'dudududu' && strumHits('eighths', 2).length === 4, 'down-up eighths alternate, and a 2-beat chord gets 4 hits');
assert(strumHits('folk', 4).map(h => h.dir).join('') === 'dduudu', 'folk directions are D D U U D U');
assert(strumHits('offbeat', 4).map(h => h.at).join() === '0.5,1.5,2.5,3.5' && strumHits('offbeat', 4).every(h => h.len < 0.3), 'off-beat chops: four short up-strokes on the "and"s');
assert(strumHits('arpeggio', 4).length === 8 && strumHits('arpeggio', 4).every(h => h.string !== undefined), 'the arpeggio picks eight single strings a bar');
// what a hit plays
const down = hitNotes({ at: 0, dir: 'd' }, C, 0.02), up = hitNotes({ at: 0, dir: 'u' }, C, 0.02);
assert(down.map(n => n.midi).join() === '48,52,55,60,64' && down.map(n => n.dt).join() === '0,0.02,0.04,0.06,0.08', 'a down strum plays low to high, a string spacing apart');
assert(up.map(n => n.midi).join() === '64,60,55' && up[0].dt === 0 && up[1].dt < 0.02, 'an up strum catches the top three strings, high to low, tighter');
assert(hitNotes({ at: 0, string: 0 }, [64, 48, 55], 0.02)[0].midi === 48 && hitNotes({ at: 0, string: 9 }, C, 0.02)[0].midi === 64 && hitNotes({ at: 0 }, [], 0.02).length === 0, 'picked hits take the n-th lowest string, clamped to the chord; empty chord, no notes');
assert(hitNotes({ at: 0, dir: 'd' }, C, 0.02, 0.5)[1].dt === 0.01, 'a pattern\'s spread scales the string spacing');
if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('All strum checks passed.');
