// Share links for tabs: everything survives the round trip, the URL is small, and a
// hostile or damaged link is repaired or refused, never trusted.
import { encodeTabLink, decodeTabLink } from '../site/tab-share.js';
import { generateSolo } from '../site/solo.js';
import { emptyTab, putNote, putChord, setChordPlan, setVoicing, setTechnique, setBpm, MAX_BARS } from '../site/tab.js';

let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };
const GUITAR = { midi: [64, 59, 55, 50, 45, 40], tuning: [4, 11, 7, 2, 9, 4] };
const GEN = { style: 'blues', density: 'busy', feel: 'shuffle', tech: 'lots', evolve: 'arc', key: '9:minor', seed: 424242 };
const b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const link = o => `#tab?d=${b64(JSON.stringify(o))}`;

// a tab using everything: chords with choices, voicings, triplets, every technique, a title and tempo
let tab = emptyTab(4);
tab = putChord(putChord(putChord(tab, 0, 0, 'Am7'), 0, 24, 'D7'), 2, 0, 'Em');
tab = setChordPlan(setChordPlan(tab, 0, 0, { scale: 'minpent' }), 0, 0, { positions: [2, 3] });
tab = setVoicing(setVoicing(tab, 'Am7', 2), 'Em', 1);
for (const [bar, at, s, f, len] of [[0, 0, 5, 3, 6], [0, 6, 5, 5, 6], [0, 12, 4, 7, 4], [0, 16, 4, 8, 4], [0, 20, 4, 7, 4], [1, 0, 0, 12, 24], [3, 40, 2, 9, 8]]) tab = putNote(tab, bar, at, s, f, len);
tab = setTechnique(tab, 0, 0, 5, { link: 'h' }); tab = setTechnique(tab, 0, 12, 4, { link: 's' }); tab = setTechnique(tab, 1, 0, 0, { bend: 3 }); tab = setTechnique(tab, 1, 0, 0, { vib: true });
tab = setBpm({ ...tab, title: 'Lick in A' }, 123);

const q = encodeTabLink({ tab, setup: { instrument: 'ukulele', tuning: 'low-g', capo: 2, leftHanded: true }, gen: GEN });
const back = decodeTabLink(`#tab?${q}`);
assert(back && JSON.stringify(back.tab) === JSON.stringify(tab), 'the whole tab survives the round trip: notes, techniques, triplets, chords, choices, voicings, title, tempo');
assert(back.setup.instrument === 'ukulele' && back.setup.tuning === 'low-g' && back.setup.capo === 2 && back.setup.leftHanded === true, 'the instrument setup comes along');
assert(JSON.stringify(back.gen) === JSON.stringify(GEN), 'the generator settings and seed come along');
assert(q.includes('i=ukulele') && q.includes('t=low-g') && q.includes('cp=2') && q.includes('lh=1'), 'the setup is readable in the link');
const plain = encodeTabLink({ tab, setup: { instrument: 'guitar', tuning: 'standard', capo: 0, leftHanded: false } });
assert(!/[?&](i|t|cp|lh)=/.test('?' + plain) && decodeTabLink(plain).setup.instrument === 'guitar' && decodeTabLink(plain).gen === undefined, 'default setup is left out of the link, and so is the generator when not given');
assert(decodeTabLink(q).tab.bars.length === 4 && decodeTabLink(`?${q}`)?.tab.title === 'Lick in A', 'the query is accepted with or without the #tab? prefix');

// size: a busy twelve-bar solo with every feature is a link that still fits in a message
{
  const names = 'A7 A7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7'.split(' ');
  const r = generateSolo({ bars: names.map(n => ({ chords: [{ at: 0, name: n }] })), inst: GUITAR, style: 'blues', density: 'busy', seed: 3, feel: 'shuffle', techniques: 'lots', evolve: 'arc' });
  let big = emptyTab(12); names.forEach((n, i) => { big = putChord(big, i, 0, n); });
  r.bars.forEach((nn, bi) => nn.forEach(n => { big = putNote(big, bi, n.at, n.s, n.f, n.len); if (n.link || n.bend || n.vib) big = setTechnique(big, bi, n.at, n.s, { link: n.link, bend: n.bend, vib: n.vib === true }); }));
  const lq = encodeTabLink({ tab: big, setup: {}, gen: GEN });
  const lb = decodeTabLink(lq);
  assert(JSON.stringify(lb.tab) === JSON.stringify(big), 'a generated solo with techniques round-trips exactly');
  console.log(`a busy 12-bar solo with ${big.bars.reduce((n, b) => n + b.notes.length, 0)} notes is a link of ${lq.length} characters`);
  assert(lq.length < 4000, `the link of a busy twelve-bar solo is under 4000 characters (${lq.length})`);
  assert(lq.length < 700 + 25 * big.bars.reduce((n, b) => n + b.notes.length, 0), 'the link is compact: about 25 characters per note');
}

// untrusted input: refused or repaired, never thrown on
assert(decodeTabLink('') === null && decodeTabLink('#tab') === null && decodeTabLink('#tab?i=ukulele') === null && decodeTabLink(null) === null && decodeTabLink(undefined) === null, 'no tab data means no tab');
assert(decodeTabLink('#tab?d=!!!not base64') === null && decodeTabLink('#tab?d=' + b64('not json')) === null && decodeTabLink('#tab?d=' + b64('[1,2]')) === null && decodeTabLink('#tab?d=' + b64('null')) === null, 'damaged data is refused');
assert(decodeTabLink(link({ v: 2, r: [[[], []]] })) === null && decodeTabLink(link({ v: 1, r: [] })) === null && decodeTabLink(link({ v: 1, r: 'x' })) === null && decodeTabLink(link({ r: [[[], []]] })) === null, 'wrong version or no bars is refused');
assert(decodeTabLink('#tab?d=' + 'A'.repeat(70000)) === null && decodeTabLink('#tab?d=' + b64(JSON.stringify({ v: 1, r: [[[], []]], pad: 'x'.repeat(250000) }))) === null, 'oversized links are refused');
const junk = decodeTabLink(link({ v: 1, n: 5, b: 99999, r: [[[[0, 'C'], [99, 'D'], 'x', null, [1, 7]], [[0, 6, 0, 3], [0, 6, 0, 99], [999, 6, 0, 3], [1, 0, 0, 3], [2, 6, -1, 3], 'z', null, [3, 6, 0, 4, 999999], [12, 6, 1, 5, 21]]], 'bad', null] }));
assert(junk && junk.tab.title === '' && junk.tab.bpm === 220 && junk.tab.bars.length === 3, 'bad title and tempo are repaired, bad bars become empty bars');
assert(junk.tab.bars[0].chords.length === 1 && junk.tab.bars[0].chords[0].name === 'C', 'bad chord markers are dropped');
assert(junk.tab.bars[0].notes.map(n => `${n.at}:${n.s}:${n.f}`).join() === '0:0:3,3:0:4,12:1:5', 'only valid notes survive (bad fret, step, length, string and junk entries are dropped)');
assert(junk.tab.bars[0].notes[1].link === undefined && junk.tab.bars[0].notes[1].bend === undefined && junk.tab.bars[0].notes[2].link === 'h' && junk.tab.bars[0].notes[2].bend === 2, 'technique codes are decoded and out-of-range ones ignored');
const many = decodeTabLink(link({ v: 1, r: Array.from({ length: MAX_BARS + 40 }, () => [[], []]) }));
assert(many && many.tab.bars.length === MAX_BARS, `more than ${MAX_BARS} bars is cut off`);
const evil = decodeTabLink(link({ v: 1, r: [[[], []]], o: { __proto__: { polluted: 1 }, constructor: 3, Am7: 2, '': 1, [`${'x'.repeat(40)}`]: 1 }, g: ['nope'] }));
assert(evil && ({}).polluted === undefined && evil.tab.voicings?.Am7 === 2 && evil.gen === undefined, 'prototype pollution does not work; bad generator settings are ignored');
const setup = decodeTabLink(`#tab?i=banjo&t=${encodeURIComponent('../x')}&cp=99&lh=yes&d=${b64(JSON.stringify({ v: 1, r: [[[], []]] }))}`);
assert(setup.setup.instrument === 'guitar' && setup.setup.tuning === undefined && setup.setup.capo === undefined && setup.setup.leftHanded === undefined, 'bad setup values in the URL are ignored');
const gen = n => decodeTabLink(link({ v: 1, r: [[[], []]], g: n }))?.gen;
assert(gen(['blues', 'busy', 'shuffle', 'lots', 'arc', 'auto', 5]) !== undefined && gen(['blues', 'busy', 'shuffle', 'lots', 'arc', 'auto', 0]) === undefined && gen(['rap', 'busy', 'shuffle', 'lots', 'arc', 'auto', 5]) === undefined && gen(['blues', 'busy', 'shuffle', 'lots', 'arc', '<x>', 5]) === undefined && gen(['blues', 'busy', 'shuffle', 'lots', 'arc', 'auto', 1e9]) === undefined, 'generator settings are validated one by one');
const named = decodeTabLink(link({ v: 1, r: [[[[0, '<script>alert(1)</script>']], []]] }));
assert(named.tab.bars[0].chords[0].name.length <= 16, 'chord names from a link are cut to 16 characters (and escaped when drawn - see the tab test)');

console.log(failures ? `${failures} FAILED` : 'tab-share: all passed');
process.exit(failures ? 1 : 0);
