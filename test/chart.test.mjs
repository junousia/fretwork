// The chord-chart language: bar lines, groups with counts, |: :| repeats, % and the ways a chart can be wrong.
import { expandChart, MAX_CHART_BARS } from '../site/chart.js';

let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };
const flat = t => expandChart(t).bars.map(b => b.join(' ')).join(' | ');

assert(flat('Am F C G') === 'Am | F | C | G', 'no bar lines: every chord is a bar');
assert(flat('Am7, D7 ,Gmaj7') === 'Am7 | D7 | Gmaj7', 'commas work as spaces');
assert(flat('Dm7 G7 | Cmaj7 | Am7') === 'Dm7 G7 | Cmaj7 | Am7', 'with bar lines the chords between two lines share a bar');
assert(flat('(Am F)x2 C G') === 'Am | F | Am | F | C | G', 'a group repeated twice');
assert(flat('(Am F)×3').split('|').length === 6 && flat('(Am F)3x') === flat('(Am F)x3'), '× and 3x are x3');
assert(flat('(Am F) C') === 'Am | F | C', 'a group with no count plays once');
assert(flat('|: Am F :| C G') === 'Am | F | Am | F | C | G', '|: ... :| plays the part twice');
assert(flat('|: Am F :|x3 G') === 'Am | F | Am | F | Am | F | G', ':|x3 plays it three times');
assert(flat('|: Am | F :| C') === 'Am | F | Am | F | C', 'bar lines inside a repeat');
assert(flat('Am F :| C') === 'Am | F | Am | F | C' || flat('Am F :| C') === 'Am F | Am F | C', 'a lone :| repeats from the start');
assert(flat('((Am F)x2 C)x2') === 'Am | F | Am | F | C | Am | F | Am | F | C', 'groups nest');
assert(flat('Am | % | F | %') === 'Am | Am | F | F', '% repeats the previous bar');
assert(flat('|: Dm7 G7 | % :|x2') === 'Dm7 G7 | Dm7 G7 | Dm7 G7 | Dm7 G7', 'a % inside a repeat');
assert(expandChart('(Am F').problems.length === 1 && expandChart('Am F)').problems.length === 1 && expandChart('|: Am').problems.length === 1 && expandChart('x2 Am').problems.length === 1 && expandChart('% Am').problems.length === 1, 'unbalanced groups, a count with nothing before it and a % with nothing to repeat are reported');
assert(expandChart('(Am F C G)x99').bars.length === 16 * 4, 'repeat counts are capped at 16');
assert(expandChart('(Am F C G)x16 (Am F C G)x16 (Am F C G)x16').bars.length === MAX_CHART_BARS && expandChart('(Am F C G)x16 (Am F C G)x16 (Am F C G)x16').problems.length === 1, 'a chart is cut at the bar limit, with a note');
assert(expandChart('').bars.length === 0 && expandChart('  - . ').bars.length === 0, 'an empty chart has no bars');
assert(flat('G/B Am7b5 F#m7') === 'G/B | Am7b5 | F#m7', 'chord names with slashes, flats and sharps pass through');
if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('All chart checks passed.');
