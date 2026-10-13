import fs from 'fs';
import { CHORDS, parseChord, detectKey, suggest, keyName, spell, chordFlats, TUNING, SCALES } from '../site/music.js';
import { FEATURE_GROUPS, chordFeatures } from '../site/chord-features.js';
import { getPositions, positionFrets } from '../site/positions.js';
import { board } from '../site/board.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.log(`FAIL: ${msg}`); failures++; }
}

// Position/box regression tests - every scale, every root, against the
// guitar's own tuning. Two different, both-authoritative conventions are
// in play (see positions.js's positionFrets comment): pentatonic/hexatonic
// scales (<=6 notes) use a per-string box model with a documented
// per-string "jog," while 7-note-and-denser scales use one uniform fret
// window, identical on every string. Both must still guarantee every
// scale degree is reachable somewhere in the position - that's checked
// for all scales together - while the shape-specific checks (per-string
// jog vs. uniform window, and the span bounds each implies) are checked
// separately below, matched to which model actually applies.
{
  let missingDegreePositions = 0, maxPerStringSpan = 0, maxOverallSpanBox = 0, maxOverallSpanWindow = 0, total = 0;
  for (const scale of SCALES) {
    const iv = scale.iv;
    const D = new Set(iv).size;
    for (let root = 0; root < 12; root++) {
      const positions = getPositions(iv, root, TUNING);
      positions.forEach((p, i) => {
        total++;
        const sets = positionFrets(positions, i, iv, root, TUNING);
        const degreesPresent = new Set();
        const allFrets = [];
        sets.forEach((set, s) => {
          set.forEach(f => degreesPresent.add(((TUNING[s] + f - root) % 12 + 12) % 12));
          allFrets.push(...set);
          if (set.size >= 2) maxPerStringSpan = Math.max(maxPerStringSpan, Math.max(...set) - Math.min(...set));
        });
        const overallSpan = Math.max(...allFrets) - Math.min(...allFrets);
        if (D <= 6) maxOverallSpanBox = Math.max(maxOverallSpanBox, overallSpan);
        else maxOverallSpanWindow = Math.max(maxOverallSpanWindow, overallSpan);
        if (degreesPresent.size < D) missingDegreePositions++;
      });
    }
  }
  assert(missingDegreePositions === 0, `${missingDegreePositions} positions are missing a full scale degree (a note you can't reach without leaving the position)`);
  assert(maxPerStringSpan <= 4, `a position demands a ${maxPerStringSpan}-fret reach on one string (expected <= 4)`);
  // Box model (pentatonic/hexatonic): normally 3-4 frets overall - A minor
  // pentatonic's textbook boxes - and up to 8 for the 6-note "blues"
  // scales, whose clustered chromatic "blue note" needs a wider reach
  // when spread across all 6 strings. This caught a real bug once: an
  // octave-selection step that clamped to the open string mid-chain in an
  // earlier version of this model, forcing a wrong, much farther octave
  // and corrupting every string after it (observed spans up to 17).
  assert(maxOverallSpanBox <= 8, `a pentatonic/hexatonic position's overall span reached ${maxOverallSpanBox} frets (expected <= 8)`);
  // Window model (7+ notes): one uniform window, default width 4,
  // confirmed against William Leavitt's "A Modern Method for Guitar" (the
  // Berklee 7-position system) - normally stays within that default,
  // growing past it only when a degree genuinely isn't reachable within
  // 4 frets of the anchor (rare; Leavitt documents occasional stretches
  // over 5 frets as the accepted cost of never shifting the hand).
  assert(maxOverallSpanWindow <= 6, `a window-model position's overall span reached ${maxOverallSpanWindow} frets (expected <= 6, per Leavitt's documented norm)`);
  console.log(`Position/box checks over ${total} (scale x root) positions: ${missingDegreePositions} missing-degree positions, max per-string span ${maxPerStringSpan}, max overall span ${maxOverallSpanBox} (box model) / ${maxOverallSpanWindow} (window model)`);
}

// "All notes in order", checked the way a player (and the HTML) sees it:
// ascending by PITCH across strings, not per string. For every scale, root,
// position and instrument, every scale pitch between the position's lowest
// and highest displayed note must itself be displayed - nothing skipped. And
// what board() actually draws bright in the SVG must equal that data, so a
// rendering cut-off (e.g. frets past the drawn neck) can't hide notes.
{
  /** @type {[string, number[], number[]][]} */
  const INSTR = [
    ['guitar', TUNING, [64, 59, 55, 50, 45, 40]],
    ['ukulele', [9, 4, 0, 7], [69, 64, 60, 67]],
  ];
  let skipped = 0, notRendered = 0, total = 0;
  const examples = [];
  for (const [name, tuning, midi] of INSTR) for (const sc of SCALES) for (let root = 0; root < 12; root++) {
    const P = getPositions(sc.iv, root, tuning);
    P.forEach((p, i) => {
      total++;
      const sets = positionFrets(P, i, sc.iv, root, tuning, midi);
      const pitches = new Set();
      sets.forEach((set, j) => set.forEach(f => pitches.add(midi[j] + f)));
      const lo = Math.min(...pitches), hi = Math.max(...pitches);
      for (let m = lo; m <= hi; m++) {
        if (sc.iv.includes(((m - root) % 12 + 12) % 12) && !pitches.has(m)) {
          skipped++;
          if (examples.length < 5) examples.push(`${name} ${sc.id} root ${root} pos ${p.n}: pitch ${m} skipped`);
        }
      }
      const svg = board({ root, iv: [0], name: 'x' }, { s: sc }, 'notes', false,
        { tuning, brightSets: sets, showPositions: true, positions: P, dimRange: { s: p.s, e: p.e } });
      const drawn = new Set();
      for (const mt of svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="12.5"[^>]*?\/>/g)) {
        if (/opacity/.test(mt[0])) continue;
        drawn.add(Math.round((+mt[2] - 34) / 30) + ':' + (+mt[1] === 24 ? 0 : Math.round((+mt[1] - 44) / 56 + 0.5)));
      }
      sets.forEach((set, j) => set.forEach(f => { if (!drawn.has(j + ':' + f)) notRendered++; }));
    });
  }
  assert(skipped === 0, `${skipped} scale notes are skipped inside a position's pitch range (e.g. ${examples.join('; ')})`);
  assert(notRendered === 0, `${notRendered} position notes are not drawn bright in the rendered SVG`);
  console.log(`Pitch-order/render checks over ${total} positions (guitar+ukulele): ${skipped} skipped notes, ${notRendered} notes missing from the SVG`);
}

// Chord voicings (site/data/voicings.json): every stored fingering must
// sound only notes of its own chord (with the root, on guitar), use real
// fret/finger/barre values, fit on the drawn neck, and board() must draw
// exactly its dots. This guards the converted third-party data and the
// string-order / base-fret conversion in tools/build-voicings.mjs.
{
  const V = JSON.parse(fs.readFileSync(new URL('../site/data/voicings.json', import.meta.url), 'utf8'));
  const OPEN = { guitar: [64, 59, 55, 50, 45, 40], ukulele: [69, 64, 60, 67] };
  const TUN = { guitar: TUNING, ukulele: [9, 4, 0, 7] };
  const EXTRA = { 11: [4], 13: [5] }; // tones real voicings add that our chord table omits
  let total = 0, bad = 0, notDrawn = 0; const ex = [];
  for (const inst of Object.keys(V)) for (const [key, list] of Object.entries(V[inst])) {
    const [root, suffix] = [+key.split('|')[0], key.slice(key.indexOf('|') + 1)];
    const want = new Set([...CHORDS[suffix], ...(EXTRA[suffix] || [])].map(x => (root + x) % 12));
    list.forEach(v => {
      total++;
      const pcs = new Set(v.f.map((f, j) => f >= 0 ? (OPEN[inst][j] + f) % 12 : null).filter(x => x !== null));
      const ok = v.f.length === OPEN[inst].length && v.g.length === v.f.length
        && v.f.every(f => Number.isInteger(f) && f >= -1 && f <= 15) && v.g.every(g => g >= 0 && g <= 4)
        && [...pcs].every(x => want.has(x)) && pcs.size >= 2 && (inst !== 'guitar' || pcs.has(root))
        && (!v.b || (v.b.from <= v.b.to && v.b.to < v.f.length && v.b.fret <= 15));
      if (!ok) { bad++; if (ex.length < 3) ex.push(`${inst} ${key} ${JSON.stringify(v.f)}`); }
      const svg = board({ root, iv: CHORDS[suffix], name: 'x' }, { s: { iv: CHORDS[suffix], name: 'x' } }, 'notes', false, { tuning: TUN[inst], voicing: v });
      const bright = (svg.match(/<circle [^>]*r="12.5"(?![^>]*opacity)/g) || []).length;
      if (bright !== v.f.filter(f => f >= 0).length) notDrawn++;
    });
  }
  assert(total > 3000, `only ${total} voicings loaded (expected ~3200)`);
  assert(bad === 0, `${bad} voicings are malformed or sound notes outside their chord (e.g. ${ex.join('; ')})`);
  assert(notDrawn === 0, `${notDrawn} voicings are not drawn with exactly their own dots`);
  console.log(`Chord voicing checks over ${total} voicings: ${bad} bad, ${notDrawn} not drawn correctly`);
}

// Chord builder: features are derived from intervals, so the toggles must
// (1) reach every chord - the exact feature set of each chord finds that
// chord, (2) never merge two chords with different notes (only true aliases
// share a feature set), and (3) every offered toggle is used by some chord.
{
  const sig = iv => [...new Set(iv.map(x => x % 12))].sort((a, b) => a - b).join(',');
  const feats = Object.fromEntries(Object.entries(CHORDS).map(([k, iv]) => [k, chordFeatures(iv)]));
  const bySet = {};
  for (const [k, f] of Object.entries(feats)) (bySet[[...f].sort().join(' ')] ||= []).push(k);
  let merged = 0;
  for (const list of Object.values(bySet)) if (new Set(list.map(k => sig(CHORDS[k]))).size > 1) merged++;
  assert(merged === 0, `${merged} feature sets merge chords with different notes (the builder could not tell them apart)`);
  const used = new Set(Object.values(feats).flatMap(f => [...f]));
  const unused = FEATURE_GROUPS.flatMap(g => g.items.map(([id]) => id)).filter(id => !used.has(id));
  assert(unused.length === 0, `builder toggles no chord uses: ${unused.join(' ')}`);
  assert(chordFeatures(CHORDS.m7).has('minor') && chordFeatures(CHORDS.m7).has('7') && chordFeatures(CHORDS['7alt']).has('b9'), 'feature derivation changed for m7 / 7alt');
  console.log(`Chord builder checks over ${Object.keys(CHORDS).length} chord types: ${merged} merged sets, ${unused.length} unused toggles`);
}

// A minor pentatonic position 3 and 4 must match the textbook box shapes
// exactly, per-string jog included - this is the canonical example the
// whole position system was built and user-verified against.
{
  const iv = [0, 3, 5, 7, 10], root = 9;
  const positions = getPositions(iv, root, TUNING);
  const pos3 = positionFrets(positions, 2, iv, root, TUNING).map(s => [...s].sort((a,b)=>a-b));
  const pos4 = positionFrets(positions, 3, iv, root, TUNING).map(s => [...s].sort((a,b)=>a-b));
  assert(JSON.stringify(pos3) === JSON.stringify([[5,8],[5,8],[5,7],[5,7],[5,7],[5,8]]), `A minor pentatonic position 3 shape changed: ${JSON.stringify(pos3)}`);
  assert(JSON.stringify(pos4) === JSON.stringify([[8,10],[8,10],[7,9],[7,10],[7,10],[8,10]]), `A minor pentatonic position 4 shape changed: ${JSON.stringify(pos4)}`);
}

// D major pentatonic position 1 is the exact drift bug this suite caught
// once: it used to blow out to an 11+ fret span because one note (F#,
// which genuinely doesn't occur near the nut on the G string) dragged
// every later string's reference along with it.
{
  const iv = [0, 2, 4, 7, 9], root = 2;
  const positions = getPositions(iv, root, TUNING);
  const pos1 = positionFrets(positions, 0, iv, root, TUNING);
  let allFrets = []; pos1.forEach(set => allFrets.push(...set));
  const span = Math.max(...allFrets) - Math.min(...allFrets);
  assert(span <= 6, `D major pentatonic position 1 regressed to a ${span}-fret span (expected <= 6): ${JSON.stringify(pos1.map(s=>[...s].sort((a,b)=>a-b)))}`);
}

// A Ionian position 1 must include D on the B string - the original bug
// report that motivated the window model. A Ionian position 3 must match
// the uniform window exactly, ending at fret 7 (not reaching to fret 9 for
// no reason) and picking up its own anchor degree (G#) at fret 4 on the
// high E string - the specific overreach this model was built to fix.
{
  const iv = SCALES.find(s => s.id === 'ionian').iv, root = 9; // A major
  const positions = getPositions(iv, root, TUNING);
  const pos1 = positionFrets(positions, 0, iv, root, TUNING);
  const bStringNotes = [...pos1[1]].map(f => ((TUNING[1] + f - root) % 12 + 12) % 12);
  assert(bStringNotes.includes(5), `A Ionian position 1 is missing D (degree 5) on the B string: has degrees ${JSON.stringify(bStringNotes)}`);

  const pos3 = positionFrets(positions, 2, iv, root, TUNING).map(s => [...s].sort((a,b)=>a-b));
  assert(JSON.stringify(pos3) === JSON.stringify([[4,5,7],[5,7],[4,6,7],[4,6,7],[4,5,7],[4,5,7]]), `A Ionian position 3 shape changed: ${JSON.stringify(pos3)}`);
}

const EXAMPLES = [
  ['Autumn-style changes', 'Am7 D7 Gmaj7 Cmaj7 F#m7b5 B7 Em'],
  ['ii-V-I in C', 'Dm7 G7 Cmaj7'],
  ['12-bar blues in A', 'A7 D7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7'],
  ['Pop in G', 'G D Em C'],
  ['Minor groove', 'Am7 Dm7 Am7 E7'],
];

for (const [label, text] of EXAMPLES) {
  const toks = text.split(/[\s,|]+/).filter(Boolean);
  const parsed = toks.map(parseChord);
  if (parsed.some(p => !p)) {
    console.log(`${label}: PARSE FAIL`, toks);
    continue;
  }
  const key = detectKey(parsed);
  console.log(`\n=== ${label} (${text}) ===`);
  console.log(`Key: ${keyName(key)}`);
  parsed.forEach(c => {
    const sugs = suggest(c, key);
    const flats = chordFlats(c, key);
    const top = sugs[0];
    console.log(`  ${c.name.padEnd(8)} -> ${top ? top.s.name : 'no match'}  [${sugs.map(x=>x.s.short).join(', ')}]`);
  });
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll checks passed.');
}
