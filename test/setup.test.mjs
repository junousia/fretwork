// Tuning / capo / left-handed: the engines must hold their invariants in every
// tuning, voicings must be reused only where they are really valid, and the
// mirrored neck must be an exact mirror image.
import fs from 'fs';
import { FAMILIES, getInstrument, applySetup, getSetup, onInstrumentChange, MAX_CAPO } from '../site/instrument.js';
import { getPositions, positionFrets, board, SCALES, CHORDS } from '../site/theory.js';
import { getVoicings, useVoicingData } from '../site/voicings.js';
import { encodeProgression, decodeProgression } from '../site/share.js';

let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pcs = m => ((m % 12) + 12) % 12;

// --- 1. position engines in every tuning -----------------------------------
{
  let positions = 0, missing = 0, skipped = 0, neg = 0, maxSpan = 0, tunings = 0;
  for (const fam of Object.values(FAMILIES)) for (const t of fam.tunings) {
    tunings++;
    const midi = t.midi, tuning = midi.map(pcs);
    for (const sc of SCALES) {
      const D = new Set(sc.iv).size;
      for (let root = 0; root < 12; root++) {
        const P = getPositions(sc.iv, root, tuning);
        P.forEach((p, i) => {
          positions++;
          const sets = positionFrets(P, i, sc.iv, root, tuning, midi);
          const present = new Set(), all = [], ps = new Set();
          sets.forEach((s, j) => s.forEach(f => { if (f < 0) neg++; present.add(pcs(tuning[j] + f - root)); all.push(f); ps.add(midi[j] + f); }));
          if (present.size < D) missing++;
          const lo = Math.min(...ps), hi = Math.max(...ps);
          for (let m = lo; m <= hi; m++) if (sc.iv.includes(pcs(m - root)) && !ps.has(m)) { skipped++; break; }
          maxSpan = Math.max(maxSpan, Math.max(...all) - Math.min(...all));
        });
      }
    }
  }
  assert(missing === 0, `${missing} positions miss a scale degree in some tuning`);
  assert(skipped === 0, `${skipped} positions skip a scale pitch in some tuning`);
  assert(neg === 0, `${neg} negative frets in some tuning`);
  // irregular tunings (open/drop) legitimately need up to 6 (Leavitt's 5-6 fret norm)
  assert(maxSpan <= 6, `a position spans ${maxSpan} frets in some tuning (expected <= 6)`);
  console.log(`Tuning checks: ${tunings} tunings, ${positions} positions, ${missing} missing, ${skipped} skipped, max span ${maxSpan}`);
}

// --- 2. voicing reuse across tunings / capo ------------------------------------
const data = JSON.parse(fs.readFileSync(new URL('../site/data/voicings.json', import.meta.url)));
useVoicingData(data);
{
  const EXTRA = { 11: [4], 13: [5] };
  const bad = [];
  let checked = 0;
  const trials = [];
  for (const fam of Object.values(FAMILIES)) for (const t of fam.tunings) for (const capo of [0, 2, 5]) trials.push([fam.id, t.id, capo]);
  for (const [family, tuning, capo] of trials) {
    applySetup({ instrument: family, tuning, capo, leftHanded: false });
    const inst = getInstrument();
    for (const suffix of ['', 'm', '7', 'maj7', 'm7', 'sus4', 'dim', 'aug', '9', 'add9']) for (let root = 0; root < 12; root++) {
      const want = new Set([...CHORDS[suffix], ...(EXTRA[suffix] || [])].map(x => (root + x) % 12));
      for (const v of getVoicings(inst, root, suffix)) {
        checked++;
        const sounding = v.f.map((f, j) => f >= 0 ? inst.midi[j] + f : null).filter(m => m !== null).map(pcs);
        const ok = v.f.length === inst.midi.length && sounding.length >= 2 && sounding.every(x => want.has(x)) && (family !== 'guitar' || sounding.includes(root));
        if (!ok && bad.length < 4) bad.push(`${family}/${tuning} capo${capo} ${root}${suffix} ${JSON.stringify(v.f)}`);
        else if (!ok) bad.push('');
      }
    }
  }
  assert(bad.length === 0, `${bad.length} reused voicings sound notes outside their chord (e.g. ${bad.filter(Boolean).join('; ')})`);
  console.log(`Voicing reuse: ${checked} voicings across ${trials.length} setups, ${bad.length} wrong`);

  // capo c / half-step-down are exact transpositions: same shapes, new root
  applySetup({ instrument: 'guitar', tuning: 'standard', capo: 0 });
  const std = getVoicings(getInstrument(), 0, '');
  applySetup({ capo: 3 });
  const capo3 = getVoicings(getInstrument(), 3, '');
  assert(std.length >= 3 && same(capo3.map(v => v.f).sort(), std.map(v => v.f).sort()), 'capo 3: a C shape is available as an Eb chord, same fingerings');
  // half step down (T=11): the shapes of the chord one semitone UP are reused, unchanged
  applySetup({ capo: 0, tuning: 'half-down' });
  const hd = getVoicings(getInstrument(), 11, '');
  applySetup({ tuning: 'standard' });
  const stdC = getVoicings(getInstrument(), 0, '');
  assert(hd.length >= 3 && same(hd.map(v => v.f).sort(), stdC.map(v => v.f).sort()), 'half step down: a B chord reuses the C shapes');
  // Drop D keeps only shapes that do not play the low string
  applySetup({ tuning: 'drop-d' });
  assert(getVoicings(getInstrument(), 2, '').length > 0, 'drop D has D major shapes');
  const eShapes = getVoicings(getInstrument(), 4, '');
  assert(eShapes.length > 0 && eShapes.every(v => v.f[5] === -1), 'drop D: shapes that would play the changed low string are excluded');
  applySetup({ tuning: 'open-g' });
  assert(getVoicings(getInstrument(), 7, '').every(v => v.f.every((f, j) => f < 0 || getInstrument().tuning[j] === [4, 11, 7, 2, 9, 4][j])), 'open G only keeps shapes valid on its changed strings');
  // 7-string pads the extra low string as muted
  applySetup({ tuning: 'seven-string' });
  const seven = getVoicings(getInstrument(), 0, '');
  assert(seven.length >= 3 && seven.every(v => v.f.length === 7 && v.f[6] === -1), '7-string: voicings keep the extra low string muted');
  // baritone ukulele = a fifth lower: G-shape chord names move
  applySetup({ instrument: 'ukulele', tuning: 'baritone', capo: 0 });
  assert(getVoicings(getInstrument(), 7, '').length >= 3, 'baritone ukulele has voicings (shapes a fifth up)');
}

// --- 3. setup state ----------------------------------------------------------------
{
  applySetup({ instrument: 'ukulele', tuning: 'standard' });
  applySetup({ instrument: 'guitar', tuning: 'standard', capo: 0, leftHanded: false });
  let notified = 0;
  const off = onInstrumentChange(() => notified++);
  applySetup({ tuning: 'dadgad', capo: 2, leftHanded: true });
  assert(notified === 1, `one combined change notifies once (got ${notified})`);
  applySetup({ tuning: 'dadgad', capo: 2, leftHanded: true });
  assert(notified === 1, 'applying the same setup again notifies nobody');
  const s = getSetup();
  assert(s.tuning === 'dadgad' && s.capo === 2 && s.leftHanded === true, 'setup is stored');
  const inst = getInstrument();
  assert(same(inst.midi, [62, 57, 55, 50, 45, 38].map(m => m + 2)) && same(inst.tuning, inst.midi.map(pcs)), 'capo raises every open string');
  applySetup({ tuning: 'no-such', capo: 99, instrument: 'banjo', leftHanded: 'yes' });
  assert(getSetup().tuning === 'dadgad' && getSetup().capo === 2 && getSetup().instrument === 'guitar' && getSetup().leftHanded === true, 'invalid values are ignored');
  applySetup({ instrument: 'ukulele' });
  assert(getSetup().tuning === 'standard', 'each instrument remembers its own tuning');
  applySetup({ instrument: 'guitar' });
  assert(getSetup().tuning === 'dadgad', 'switching back restores the guitar tuning');
  assert(MAX_CAPO === 9, 'capo range');
  off();
}

// --- 4. left-handed board is an exact mirror ------------------------------------
{
  const inst0 = { tuning: [4, 11, 7, 2, 9, 4] };
  const sc = SCALES.find(s => s.id === 'minpent'), chord = { root: 9, iv: [0, 3, 7], name: 'Am' };
  const P = getPositions(sc.iv, 9, inst0.tuning);
  const common = { tuning: inst0.tuning, showPositions: true, positions: P, brightSets: positionFrets(P, 2, sc.iv, 9, inst0.tuning), capo: 0 };
  const circles = svg => [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="(\d+\.?\d*)"/g)].map(m => [+m[1], +m[2], +m[3]]);
  const a = board(chord, { s: sc }, 'notes', false, common), b = board(chord, { s: sc }, 'notes', false, { ...common, leftHanded: true });
  const W = +a.match(/width="(\d+)"/)[1];
  const ca = circles(a).map(([x, y, r]) => `${Math.round(W - x)},${y},${r}`).sort(), cb = circles(b).map(([x, y, r]) => `${Math.round(x)},${y},${r}`).sort();
  assert(ca.length > 20 && same(ca, cb), 'left-handed board: every dot sits exactly at its mirrored position');
  const labels = svg => [...svg.matchAll(/<text [^>]*>([^<]+)<\/text>/g)].map(m => m[1]).sort();
  assert(same(labels(a), labels(b)), 'left-handed board: same labels (text is not mirrored)');
  assert(!/<title>Capo<\/title>/.test(a) && /<title>Capo<\/title>/.test(board(chord, { s: sc }, 'notes', false, { ...common, capo: 2 })), 'a capo replaces the nut with a capo bar');
}

// --- 5. share links carry the setup -------------------------------------------------
{
  const s = { text: 'Am7 D7', instrument: 'guitar', tuning: 'drop-d', capo: 3, leftHanded: true, pick: {}, pos: {}, vo: {} };
  const d = decodeProgression('#progressions?' + encodeProgression(s));
  assert(d.tuning === 'drop-d' && d.capo === 3 && d.leftHanded === true, 'tuning, capo and handedness survive a share link');
  const q = encodeProgression({ text: 'C G', tuning: 'standard', capo: 0, leftHanded: false });
  assert(!/[?&]?(t|cp|lh)=/.test(q), 'default setup adds nothing to the link');
  const evil = decodeProgression('c=Am7&t=../../etc&cp=99&lh=yes');
  assert(!('tuning' in evil) && !('capo' in evil) && !('leftHanded' in evil), 'bad tuning/capo/handedness in a link are dropped');
}

console.log(`Setup checks: ${failures} failure(s)`);
if (failures) process.exit(1);
