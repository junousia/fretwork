// Golden snapshots: the exact SVG of key fretboards and chord boxes, stored in
// test/golden/. Any change to a shape, colour, label or mirror shows up as a
// reviewable diff in the PR. Intentional change? Regenerate and review:
//   UPDATE_GOLDEN=1 node test/golden.test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPositions, positionFrets } from '../site/positions.js';
import { emptyTab, putNote, putChord } from '../site/tab.js';
import { tabSvg } from '../site/tab-view.js';
import { board } from '../site/board.js';
import { SCALES, CHORDS, TUNING, spell } from '../site/music.js';
import { voicingDiagram, useVoicingData, getVoicings } from '../site/voicings.js';
import { arpeggioAround, arpeggioInSets, degreeChord } from '../site/arpeggio.js';
import { FAMILIES } from '../site/instrument.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden');
const update = !!process.env.UPDATE_GOLDEN;
useVoicingData(JSON.parse(fs.readFileSync(new URL('../site/data/voicings.json', import.meta.url), 'utf8')));
fs.mkdirSync(dir, { recursive: true });

const scale = id => SCALES.find(s => s.id === id);
const inst = (fam, tuningId, capo = 0, leftHanded = false) => {
  const t = FAMILIES[fam].tunings.find(x => x.id === tuningId);
  const midi = t.midi.map(m => m + capo);
  return { id: fam, midi, tuning: midi.map(m => m % 12), standardPcs: FAMILIES[fam].standard.map(m => m % 12), capo, leftHanded };
};
const scaleBoard = (I, scaleId, root, pos, extra = {}) => {
  const sc = scale(scaleId), P = getPositions(sc.iv, root, I.tuning);
  const triad = [0, sc.iv.includes(4) ? 4 : 3, 7];
  return board({ root, iv: triad, name: spell(root, false) }, { s: sc }, 'notes', false, {
    tuning: I.tuning, showPositions: true, positions: P, leftHanded: I.leftHanded, capo: I.capo,
    ...(pos ? { dimRange: { s: P[pos - 1].s, e: P[pos - 1].e }, brightSets: positionFrets(P, pos - 1, sc.iv, root, I.tuning, I.midi) } : {}), ...extra,
  });
};
const chordBoard = (I, root, suffix, voicingNo, extra = {}) => {
  const iv = CHORDS[suffix], v = getVoicings(I, root, suffix)[voicingNo - 1];
  return board({ root, iv, name: spell(root, false) + suffix }, { s: { iv, name: suffix } }, 'notes', false, { tuning: I.tuning, leftHanded: I.leftHanded, capo: I.capo, voicing: v, fingerLabels: true, ...extra });
};

const G = inst('guitar', 'standard');
const cases = {
  'a-minor-pentatonic-position-3': () => scaleBoard(G, 'minpent', 9, 3),
  'a-minor-pentatonic-position-4': () => scaleBoard(G, 'minpent', 9, 4),
  'a-minor-pentatonic-all-positions': () => scaleBoard(G, 'minpent', 9, 0),
  'a-ionian-position-3': () => scaleBoard(G, 'ionian', 9, 3),
  'a-ionian-position-7': () => scaleBoard(G, 'ionian', 9, 7),
  'd-major-pentatonic-position-1': () => scaleBoard(G, 'majpent', 2, 1),
  'a-minor-pentatonic-position-3-left-handed': () => scaleBoard(inst('guitar', 'standard', 0, true), 'minpent', 9, 3),
  'a-minor-pentatonic-position-3-capo-2': () => scaleBoard(inst('guitar', 'standard', 2), 'minpent', 9, 3),
  'd-major-pentatonic-position-1-dadgad': () => scaleBoard(inst('guitar', 'dadgad'), 'majpent', 2, 1),
  'a-ionian-position-3-ukulele': () => scaleBoard(inst('ukulele', 'standard'), 'ionian', 9, 3),
  'a-ionian-position-3-arpeggio-v7': () => {
    const sc = scale('ionian'), P = getPositions(sc.iv, 9, G.tuning), dc = degreeChord(sc.iv, 4, true), croot = (9 + dc.root) % 12;
    return board({ root: croot, iv: dc.iv, name: 'E7' }, { s: { ...sc, iv: sc.iv.map(x => (x - dc.root + 12) % 12) } }, 'notes', false,
      { tuning: G.tuning, showPositions: true, positions: P, dimRange: { s: P[2].s, e: P[2].e }, brightSets: positionFrets(P, 2, sc.iv, 9, G.tuning, G.midi) });
  },
  'c-major-voicing-2-fingers': () => chordBoard(G, 0, '', 2),
  'c-major-voicing-2-arpeggio-shape': () => {
    const v = getVoicings(G, 0, '')[1];
    return board({ root: 0, iv: CHORDS[''], name: 'C' }, { s: { iv: CHORDS[''], name: 'C' } }, 'notes', false,
      { tuning: G.tuning, voicingRing: v, brightSets: arpeggioAround(v, G, [0, 4, 7]) });
  },
  'c-major-voicing-2-capo-3': () => chordBoard(inst('guitar', 'standard', 3), 3, '', 2),
  'c-major-chord-box-barre': () => voicingDiagram(getVoicings(G, 0, '')[1]),
  'c-major-chord-box-barre-left-handed': () => voicingDiagram(getVoicings(G, 0, '')[1], { mirror: true }),
  'identify-open-c': () => board({ root: 0, iv: CHORDS[''], name: 'C' }, { s: { iv: [0], name: 'the marked notes' } }, 'notes', false,
    { tuning: G.tuning, hitAreas: true, voicing: { f: [0, 1, 0, 2, 3, -1], g: [0, 0, 0, 0, 0, 0], b: null } }),
  'tab-riff': () => { let t = emptyTab(2); for (const [bar, at, st, f, len] of [[0, 0, 5, 0, 2], [0, 2, 5, 3, 2], [0, 4, 4, 0, 4], [0, 8, 3, 2, 3], [0, 11, 2, 0, 1], [0, 12, 0, 12, 4], [1, 0, 1, 3, 8]]) t = putNote(t, bar, at, st, f, len); t = putChord(t, 0, 0, 'Em'); t = putChord(t, 0, 8, 'D'); t = putChord(t, 1, 0, 'C'); return tabSvg(t, G, { perRow: 2, cursor: { bar: 1, at: 8, s: 1 } }); },
  'am7-chord-box-open': () => voicingDiagram(getVoicings(G, 9, 'm7')[0], { label: false }),
};

const pretty = svg => svg.replace(/></g, '>\n<') + '\n';
let failures = 0, written = 0;
for (const [name, make] of Object.entries(cases)) {
  const actual = pretty(make());
  const file = path.join(dir, name + '.svg');
  if (update || !fs.existsSync(file)) { fs.writeFileSync(file, actual); written++; continue; }
  const expected = fs.readFileSync(file, 'utf8');
  if (expected !== actual) {
    const a = expected.split('\n'), b = actual.split('\n');
    const i = a.findIndex((l, k) => l !== b[k]);
    console.log(`FAIL: ${name} differs from test/golden/${name}.svg at line ${i + 1}\n  golden: ${a[i]}\n  actual: ${b[i]}\n  (intentional? UPDATE_GOLDEN=1 node test/golden.test.mjs, then review the diff)`);
    failures++;
  }
}
// no stale goldens
for (const f of fs.readdirSync(dir)) if (!(f.replace(/\.svg$/, '') in cases)) { console.log(`FAIL: test/golden/${f} has no case`); failures++; }
console.log(`Golden snapshots: ${Object.keys(cases).length} cases, ${written} written, ${failures} failure(s)`);
if (failures) process.exit(1);
