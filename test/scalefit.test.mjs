// The scale fit is pure pitch-class arithmetic, so it is checked by what must hold for ANY chord, key and progression - not by
// remembering answers: a brute-force reference of the definition, transposition invariance, ordering, the cut-off, and what each
// list is allowed to contain.
import { SCALES, CHORDS, parseChord, keyName } from '../site/music.js';
import { degreeChord } from '../site/arpeggio.js';
import { chordsInScale, MIN_FIT, keyNotes, chordNotes, guideNotes, fitOf, chordScales, scalesInKey, pickId, readPick } from '../site/scalefit.js';

let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const mod = n => ((n % 12) + 12) % 12;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const setKey = f => [...f.abs].sort((a, b) => a - b).join();

// every chord type on every root, in every key, with a few progressions around it
const keys = [];
for (let t = 0; t < 12; t++) for (const mode of ['major', 'minor']) keys.push({ t, mode });
const types = Object.keys(CHORDS);
const chords = [];
for (const suf of types) for (let root = 0; root < 12; root += 5) chords.push({ root, iv: CHORDS[suf], name: NAMES[root] + suf });

let lists = 0, listed = 0;
for (const key of keys) for (const chord of chords) {
  const prog = [chord, { root: mod(key.t + 7), iv: [0, 4, 7, 10] }];
  const X = chordNotes(chord), K = keyNotes(key, prog);
  const cs = chordScales(chord, key, prog), ik = scalesInKey(chord, key, prog);
  lists += 2; listed += cs.length + ik.length;
  const where = `${chord.name} in ${keyName(key)}`;
  // a brute-force reference, straight from the definition in the header of scalefit.js
  const guide = [...guideNotes(chord)];
  assert(guide.length > 0 && guide.every(p => X.has(p)), `${where}: the guide notes are chord notes`);
  const ref = [];
  for (const s of SCALES) {
    const abs = s.iv.map(x => mod(x + chord.root)), A = new Set(abs);
    const cover = [...X].filter(p => A.has(p)).length / X.size;
    const clash = abs.filter(p => !X.has(p) && guide.includes(mod(p - 1))).length;
    const inKey = abs.filter(p => K.has(p)).length / abs.length;
    ref.push({ id: s.id, score: cover * (1 - clash / abs.length) * inKey });
  }
  const want = ref.filter(r => r.score >= MIN_FIT).map(r => r.id).sort();
  assert(cs.map(f => f.s.id).sort().join() === want.join(), `${where}: chord scales are exactly the scales on the chord's root that reach the cut-off`);
  assert(cs.every(f => f.root === chord.root && f.score >= MIN_FIT && f.score <= 1 + 1e-9), `${where}: chord scales start on the chord's root and score between the cut-off and 1`);
  assert(cs.every((f, i) => i === 0 || cs[i - 1].score + 1e-12 >= f.score), `${where}: chord scales are ranked best first`);
  assert(ik.every(f => f.root === key.t && f.abs.every(p => K.has(p)) && f.score >= MIN_FIT), `${where}: every scale in the key starts on the tonic, uses only the key's material and reaches the cut-off`);
  assert(ik.every((f, i) => i === 0 || ik[i - 1].score + 1e-12 >= f.score), `${where}: scales in the key are ranked best first`);
  // nothing was left out: every scale of the table on the tonic that stays inside the material and fits well enough is listed
  const wantKey = SCALES.filter(sc => { const f = fitOf(chord, sc, key.t, K); return f.inKey === 1 && f.score >= MIN_FIT; }).map(sc => sc.id).sort();
  assert(ik.map(f => f.s.id).sort().join() === wantKey.join(), `${where}: the scales in the key are all the fitting scales on the tonic inside the key's material`);
  // cover is 1 exactly when the scale holds every chord note
  for (const f of cs) assert([...X].every(p => f.abs.includes(p)) === (f.cover === 1), `${where}: ${f.s.id}: cover is 1 only when every chord note is in the scale`);
}
assert(listed > 0, 'there were lists to check');

// moving everything by n semitones moves every answer by n and changes no score
let moved = 0;
for (const key of keys.slice(0, 6)) for (const chord of chords.slice(0, 80)) for (const n of [1, 5, 7]) {
  const k2 = { t: mod(key.t + n), mode: key.mode }, c2 = { ...chord, root: mod(chord.root + n) };
  const a = chordScales(chord, key, [chord]), b = chordScales(c2, k2, [c2]);
  const ia = scalesInKey(chord, key, [chord]), ib = scalesInKey(c2, k2, [c2]);
  moved++;
  assert(a.length === b.length && a.every((f, i) => f.s.id === b[i].s.id && near(f.score, b[i].score)), `${chord.name} in ${keyName(key)} up ${n}: the chord scales move with it`);
  const sig = (list, n) => list.map(f => `${f.score.toFixed(9)} ${f.abs.map(p => mod(p + n)).sort((x, y) => x - y).join()}`).sort().join('|');
  assert(ia.length === ib.length && sig(ia, n) === sig(ib, 0), `${chord.name} in ${keyName(key)} up ${n}: the scales in the key move with it`);
}

// a scale that holds every note of the chord with nothing rubbing scores 1, and adding notes to the key can only add scales
{
  const dm7 = parseChord('Dm7'), key = { t: 9, mode: /** @type {'minor'} */ ('minor') };
  const bare = scalesInKey(dm7, key, [dm7]), rich = scalesInKey(dm7, key, [dm7, parseChord('E7')]);
  assert(rich.length >= bare.length && bare.every(f => rich.some(g => g.s.id === f.s.id)), 'a progression that borrows notes only widens the scales in the key');
  assert(bare.some(f => f.s.id === 'minpent' && f.root === 9), 'the key\'s own pentatonic is offered over a chord it only partly covers');
}

// the chords a scale makes
{
  let n = 0;
  for (const sc of SCALES) for (let root = 0; root < 12; root += 5) {
    const list = chordsInScale(root, sc.iv), notes = new Set(sc.iv.map(x => mod(x + root)));
    n += list.length;
    assert(list.every(c => c.tones.every(p => notes.has(p)) && c.tones.join() === CHORDS[c.suffix].map(t => mod(c.root + t)).join()), `${sc.id} on ${NAMES[root]}: every chord is made of the scale's notes only`);
    assert(list.every(c => notes.has(c.root)), `${sc.id} on ${NAMES[root]}: every chord is built on a note of the scale`);
    assert(list.every(c => !['sus2', 'sus4'].includes(c.suffix) || !list.some(o => o.root === c.root && ['', 'm'].includes(o.suffix))), `${sc.id} on ${NAMES[root]}: a suspended chord appears only where the scale has no major or minor third`);
    const moved = chordsInScale(mod(root + 3), sc.iv);
    assert(moved.length === list.length && moved.every((c, i) => c.suffix === list[i].suffix && c.root === mod(list[i].root + 3)), `${sc.id}: the chords move with the scale`);
    // against the stacked-thirds implementation the Scales page already had: in a seven-note scale each degree's triad and seventh are there
    if (new Set(sc.iv).size === 7) for (let k = 0; k < 7; k++) for (const sev of [false, true]) {
      const dc = degreeChord(sc.iv, k, sev);
      if (!dc || dc.key === null) continue;
      assert(list.some(c => c.degree === k && c.suffix === dc.key && c.root === mod(root + dc.root)), `${sc.id} on ${NAMES[root]}: degree ${k + 1}${sev ? ' seventh' : ' triad'} (${dc.key || 'major'}) is listed`);
    }
  }
  assert(n > 0, 'scales make chords');
}

// stored choices
for (const s of SCALES) for (let root = 0; root < 12; root += 3) {
  const id = pickId(s.id, root, 4), r = readPick(id, 4);
  assert(r && r.id === s.id && r.root === root, `scale choice ${id} round-trips`);
}
assert(pickId('dorian', 2, 2) === 'dorian' && readPick('dorian', 7).root === 7, 'a scale on the chord\'s own root is stored as just its id');
assert(readPick('nonsense', 0) === null && readPick('dorian@12', 0) === null && readPick('dorian@-1', 0) === null && readPick('', 0) === null && readPick(undefined, 0) === null, 'junk is not a scale choice');
if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log(`Scale fit checks: ${lists} lists (${listed} entries), ${moved} transpositions, 0 failure(s)`);
