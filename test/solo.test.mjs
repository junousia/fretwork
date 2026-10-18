// The solo generator's hard rules, checked on its output across every instrument,
// tuning, style, density and a set of progressions (including chords that change
// in the middle of a bar): notes are in the scale and the position, chord tones land
// where they should, leaps are limited, changes are approached, the ending is the
// root, and the same seed gives the same solo.
import { generateSolo, STYLES, DENSITIES, FEELS, RHYTHMS, FINALS, EVOLVES, TENSIONS, intensityAt, strengthOf } from '../site/solo.js';
import { linkedNext, tabEvents, emptyTab, putNote } from '../site/tab.js';
import { parseChord } from '../site/music.js';
import { chordScales } from '../site/scalefit.js';
import { FAMILIES } from '../site/instrument.js';
import { STEPS, MAX_FRET } from '../site/tab.js';

let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };
const one = names => names.split(' ').map(n => ({ chords: [{ at: 0, name: n }] }));
const PROGS = {
  jazz: one('Am7 D7 Gmaj7 Cmaj7'),
  blues: one('A7 A7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7'),
  pop: one('C G Am F C G F C'),
  minor: one('Am Dm E7 Am'),
  mid: [{ chords: [{ at: 0, name: 'Dm7' }, { at: 24, name: 'G7' }] }, { chords: [{ at: 0, name: 'Cmaj7' }, { at: 36, name: 'A7' }] }, { chords: [{ at: 12, name: 'Dm7' }] }, { chords: [{ at: 0, name: 'G7' }, { at: 24, name: 'Cmaj7' }] }],
  nochords: [{ chords: [] }, { chords: [] }, { chords: [] }, { chords: [] }],
};
const insts = [];
for (const fam of Object.values(FAMILIES)) for (const t of fam.tunings) for (const capo of [0, 3]) {
  const midi = t.midi.map(m => m + capo);
  insts.push({ name: `${fam.id}/${t.id}/capo${capo}`, midi, tuning: midi.map(m => m % 12) });
}
const std = insts.find(i => i.name === 'guitar/standard/capo0');
const uke = insts.find(i => i.name === 'ukulele/standard/capo0');

// --- determinism and variety
const run = (bars, inst, style, density, seed, feel = 'straight', techniques = 'off', evolve = 'off', tension = 'balanced') => generateSolo({ bars, inst, style, density, seed, feel, techniques, evolve, tension });
const A = run(PROGS.jazz, std, 'follow', 'medium', 42), B = run(PROGS.jazz, std, 'follow', 'medium', 42), C = run(PROGS.jazz, std, 'follow', 'medium', 43);
assert(JSON.stringify(A.bars) === JSON.stringify(B.bars), 'the same seed gives the same solo');
assert(JSON.stringify(A.bars) !== JSON.stringify(C.bars), 'a different seed gives a different solo');
const distinct = new Set(Array.from({ length: 30 }, (_, s) => JSON.stringify(run(PROGS.jazz, std, 'follow', 'medium', s + 1).bars))).size;
assert(distinct >= 28, `30 seeds give ${distinct} different solos`);

// --- the rules, over everything
const stat = { by: Object.fromEntries(TENSIONS.map(t => [t.id, { firstOn: 0, firstTone: 0, strong: 0, strongTone: 0 }])), links: 0, bends: 0, vibs: 0, n: 0, firstOn: 0, firstTone: 0, strong: 0, strongTone: 0, steps: 0, bigLeaps: 0, approach: 0, approachOk: 0, triples: 0, combos: 0, notes: 0, bars: 0 };
const cases = [];
for (const inst of insts) for (const style of STYLES) for (const density of DENSITIES) for (const [pn, bars] of Object.entries(PROGS)) {
  const full = inst === std || inst === uke;
  const seeds = full ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2];
  for (const seed of seeds) cases.push({ inst, style: style.id, density: density.id, pn, bars, seed, feel: FEELS[full ? seed % FEELS.length : (insts.indexOf(inst) + seed) % FEELS.length].id, tension: TENSIONS[(seed + insts.indexOf(inst)) % 3].id, tech: ['off', 'some', 'lots'][(seed + insts.indexOf(inst)) % 3], evolve: EVOLVES[(seed + 2 * insts.indexOf(inst)) % 3].id });
}
for (const c of cases) {
  let r;
  try { r = run(c.bars, c.inst, c.style, c.density, c.seed, c.feel, c.tech, c.evolve, c.tension); } catch (e) { assert(false, `${c.inst.name} ${c.style} ${c.density} ${c.pn} seed ${c.seed} threw ${e.message}`); continue; }
  stat.combos++;
  const tag = `${c.inst.name} ${c.style}/${c.density}/${c.feel}/${c.tension}/${c.tech}/${c.evolve}/${c.pn}/${c.seed}`;
  assert(r.bars.length === c.bars.length, `${tag}: one list of notes per bar`);
  const lastSeg = r.info[r.info.length - 1];
  let prevNote = null;
  r.bars.forEach((notes, bi) => {
    stat.bars++; stat.notes += notes.length;
    // valid, ordered, non-overlapping on a string
    for (const n of notes) assert(n.s >= 0 && n.s < c.inst.midi.length && n.f >= 0 && n.f <= MAX_FRET && n.at >= 0 && n.at + n.len <= STEPS && n.len >= 1 && (c.feel === 'shuffle' || c.feel === 'triplet' ? n.at % 4 === 0 : c.feel === 'mixed' ? n.at % 3 === 0 || n.at % 4 === 0 : n.at % 3 === 0), `${tag}: bar ${bi} has an invalid note ${JSON.stringify(n)}`);
    for (let i = 1; i < notes.length; i++) assert(notes[i].at >= notes[i - 1].at + notes[i - 1].len, `${tag}: bar ${bi} notes overlap in time`);
    // techniques: only where they make sense
    for (const n of notes) {
      if (c.tech === 'off') assert(!n.link && !n.bend && !n.vib, `${tag}: techniques are off but bar ${bi} has one`);
      if (n.link) {
        const nx = linkedNext(notes, n), d = nx ? Math.abs(nx.f - n.f) : 0;
        assert(nx && d >= 1 && d <= (n.link === 'h' ? 4 : 5) && n.len <= 12 && (n.link === 'h' || n.len >= 6) && !nx.link, `${tag}: bar ${bi} has a bad ${n.link} link`);
        assert(!n.bend && !n.vib || n.link === 'h', `${tag}: a slide is not combined with a bend or vibrato`);
        if (nx) stat.links++;
      }
      if (n.bend) { stat.bends++; assert(c.inst.midi.length >= 6 && n.s < c.inst.midi.length - 2 && [1, 2].includes(n.bend) && n.len >= 6 && n.f >= 0 && !n.link, `${tag}: bar ${bi} has a bad bend ${JSON.stringify(n)}`); }
      if (n.vib) { stat.vibs++; assert(n.len >= 12, `${tag}: vibrato on a short note`); }
    }
    const segs = r.info.filter(s => s.bar === bi);
    segs.forEach((seg, si) => {
      const mine = notes.filter(n => n.at >= seg.from && n.at < seg.to);
      if (!mine.length) return;
      for (const n of mine) {
        const m = c.inst.midi[n.s] + n.f + (n.bend || 0); // a bend sounds higher than it is written
        assert(seg.scalePcs.includes(m % 12), `${tag}: bar ${bi} note ${m} is not in the ${seg.scaleId} scale on ${seg.root}`);
        assert(seg.frets[n.s].has(n.f + (n.bend || 0)), `${tag}: bar ${bi} fret ${n.f} (+bend ${n.bend || 0}) on string ${n.s} is outside position ${seg.position}`);
      }
      const hasTones = seg.chordPcs.some(pc => [...Array(c.inst.midi.length).keys()].some(s => [...seg.frets[s]].some(f => (c.inst.midi[s] + f) % 12 === pc)));
      const pitch = n => c.inst.midi[n.s] + n.f + (n.bend || 0);
      if (hasTones) { const b = stat.by[c.tension]; b.firstOn++; if (seg.chordPcs.includes(pitch(mine[0]) % 12)) b.firstTone++; }
      mine.forEach(n => { if (n.at % 12 === 0 && hasTones) { const b = stat.by[c.tension]; b.strong++; if (seg.chordPcs.includes(pitch(n) % 12)) b.strongTone++; } });
    });
    // melodic motion within the whole solo (in order)
    for (const n of notes) {
      const m = c.inst.midi[n.s] + n.f + (n.bend || 0);
      if (prevNote !== null) {
        const d = Math.abs(m - prevNote.m); stat.steps++;
        assert(d <= 12, `${tag}: a leap of ${d} semitones`);
        if (d > 7) stat.bigLeaps++;
        if (m === prevNote.m && prevNote.rep >= 1) stat.triples++;
      }
      prevNote = { m, rep: prevNote && prevNote.m === m ? prevNote.rep + 1 : 0 };
    }
  });
  // changes are approached: the last note before a new chord is close to one of its tones
  r.info.forEach((seg, si) => {
    const next = r.info[si + 1]; if (!next || next.chord === seg.chord) return;
    const mine = r.bars[seg.bar].filter(n => n.at >= seg.from && n.at < seg.to); if (!mine.length) return;
    const n = mine[mine.length - 1], m = c.inst.midi[n.s] + n.f + (n.bend || 0);
    stat.approach++;
    if (next.chordPcs.some(pc => Math.min((m - pc + 120) % 12, (pc - m + 120) % 12) <= 2)) stat.approachOk++;
  });
  // the ending is the root of the last chord, held
  const lastNotes = r.bars[r.bars.length - 1], fin = lastNotes[lastNotes.length - 1];
  if (fin) {
    const rootPc = parseChord(lastSeg.chord || 'Am')?.root ?? lastSeg.root;
    if (lastSeg.chord && c.style !== 'blues') assert((c.inst.midi[fin.s] + fin.f + (fin.bend || 0)) % 12 === rootPc, `${tag}: the last note is not the root of ${lastSeg.chord}`);
    assert(fin.len >= 4, `${tag}: the last note is not held`);
  }
}
const pct = (a, b) => (b ? a / b : 1);
console.log(`generator: ${stat.combos} solos, ${stat.bars} bars, ${stat.notes} notes; chord tones on strong beats safe/balanced/free ${['safe', 'balanced', 'free'].map(k => (100 * pct(stat.by[k].strongTone, stat.by[k].strong)).toFixed(0) + '%').join('/')}, leaps over a 5th ${(100 * pct(stat.bigLeaps, stat.steps)).toFixed(1)}%, approach notes ${(100 * pct(stat.approachOk, stat.approach)).toFixed(1)}%, triple repeats ${stat.triples}`);
{
  const g = k => ({ first: pct(stat.by[k].firstTone, stat.by[k].firstOn), strong: pct(stat.by[k].strongTone, stat.by[k].strong) });
  assert(g('safe').first >= 0.97 && g('safe').strong >= 0.9, `safe: nearly every chord starts and strong beat is a chord tone (${g('safe').first.toFixed(2)} / ${g('safe').strong.toFixed(2)})`);
  assert(g('balanced').first >= 0.85 && g('balanced').strong >= 0.6 && g('balanced').strong <= 0.88, `balanced: chords start on chord tones, about two thirds to three quarters of strong beats are (${g('balanced').first.toFixed(2)} / ${g('balanced').strong.toFixed(2)})`);
  assert(g('free').first >= 0.5 && g('free').strong >= 0.4 && g('free').strong <= 0.68, `free: close to real solos, about half of strong beats (real 0.52): ${g('free').strong.toFixed(2)}`);
  assert(g('safe').strong > g('balanced').strong && g('balanced').strong > g('free').strong, 'the tension setting orders them: safe > balanced > free');
}
assert(pct(stat.bigLeaps, stat.steps) <= 0.08, 'leaps over a fifth are rare');
assert(pct(stat.approachOk, stat.approach) >= 0.8, 'chord changes are approached from within a tone of a new chord tone');
assert(stat.triples / Math.max(1, stat.steps) < 0.01, 'a note is rarely repeated three times in a row');

// --- evolve: the solo develops over the song
{
  assert([0, 3, 7, 11].every(b => intensityAt('off', b, 12) === 1), 'steady: every bar is at full intensity');
  const arc = Array.from({ length: 12 }, (_, b) => intensityAt('arc', b, 12)), build = Array.from({ length: 12 }, (_, b) => intensityAt('build', b, 12));
  const peakAt = arc.indexOf(Math.max(...arc));
  assert(arc.every(v => v >= 0.1 && v <= 1) && build.every(v => v >= 0.1 && v <= 1), 'intensity stays between 0.1 and 1');
  assert(peakAt >= 7 && peakAt <= 9 && arc[0] < 0.3 && arc[10] < arc[peakAt] && arc[11] <= 0.4, `the arc rises to a peak about two thirds in (bar ${peakAt + 1}) then settles: ${arc.map(v => v.toFixed(2))}`);
  assert(build.slice(0, 11).every((v, i, a) => i === 0 || v > a[i - 1]) && build[11] <= 0.4, 'build-up rises every bar and the last bar comes down');
  assert(Number.isFinite(intensityAt('arc', 0, 1)) && Number.isFinite(intensityAt('build', 0, 2)), 'one-bar and two-bar solos have an intensity too');
  const thirds = (evolve, density, style = 'blues', techniques = 'off', seeds = 14) => {
    const out = { notes: [0, 0, 0], pitch: [0, 0, 0], count: [0, 0, 0], fret: [0, 0, 0], marks: [0, 0, 0] };
    for (let sd = 1; sd <= seeds; sd++) {
      const r = run(PROGS.blues, std, style, density, sd, 'straight', techniques, evolve);
      r.bars.forEach((notes, bi) => {
        const th = Math.min(2, Math.floor(bi / 4)), seg = r.info.find(x => x.bar === bi);
        out.notes[th] += notes.length; out.count[th]++;
        notes.forEach(n => { out.pitch[th] += std.midi[n.s] + n.f + (n.bend || 0); if (n.link || n.bend || n.vib) out.marks[th]++; });
        const fr = seg.frets.flatMap(x => [...x]); out.fret[th] += fr.reduce((a, b) => a + b, 0) / fr.length;
      });
    }
    return { notes: out.notes.map((v, i) => v / out.count[i]), pitch: out.pitch.map((v, i) => v / Math.max(1, out.notes[i])), fret: out.fret.map((v, i) => v / out.count[i]), marks: out.marks.map((v, i) => v / out.count[i]) };
  };
  const arcS = thirds('arc', 'busy'), buildS = thirds('build', 'busy'), flat = thirds('off', 'busy');
  console.log(`evolve (12-bar blues, busy): notes/bar by third arc ${arcS.notes.map(v => v.toFixed(1))}, build ${buildS.notes.map(v => v.toFixed(1))}, steady ${flat.notes.map(v => v.toFixed(1))}; mean pitch arc ${arcS.pitch.map(v => v.toFixed(0))}, steady ${flat.pitch.map(v => v.toFixed(0))}`);
  assert(arcS.notes[1] > arcS.notes[0] * 1.25, 'arc: the middle of the solo is busier than the start');
  assert(arcS.pitch[1] - arcS.pitch[0] >= 3, `arc: the line climbs towards the peak (${arcS.pitch.map(v => v.toFixed(1))})`);
  assert(arcS.fret[1] > arcS.fret[0] + 2, 'arc: the position moves up the neck');
  assert(buildS.notes[2] > buildS.notes[0] * 1.25 && buildS.pitch[2] - buildS.pitch[0] >= 1.5, `build: the end of the solo is busier and higher than the start (${buildS.notes.map(v => v.toFixed(1))}, ${buildS.pitch.map(v => v.toFixed(1))})`);
  assert(Math.abs(flat.pitch[1] - flat.pitch[0]) < 2 && Math.abs(flat.notes[1] - flat.notes[0]) < flat.notes[0] * 0.2, 'steady: no trend (the control)');
  const sparse = thirds('arc', 'sparse');
  assert(Math.abs(sparse.notes[1] - sparse.notes[0]) < sparse.notes[0] * 0.25, 'evolving never gets busier than the density asked for (sparse stays sparse)');
  const t1 = thirds('arc', 'medium', 'pent', 'lots', 30);
  assert(t1.marks[1] > t1.marks[0], `techniques are rarer early and more frequent at the peak (${t1.marks.map(v => v.toFixed(2))})`);
  // choices made by the user win over the build-up
  const fixed = generateSolo({ bars: PROGS.blues.map(b => ({ chords: [{ ...b.chords[0], scale: 'minpent', positions: [2] }] })), inst: std, style: 'blues', density: 'busy', seed: 3, evolve: 'arc' });
  assert(fixed.info.every(x => x.position === 2), 'an explicit position on every chord is kept while evolving');
  const a = run(PROGS.blues, std, 'blues', 'busy', 5, 'straight', 'some', 'arc'), b = run(PROGS.blues, std, 'blues', 'busy', 5, 'straight', 'some', 'arc');
  assert(JSON.stringify(a.bars) === JSON.stringify(b.bars) && a.info.every((x, i) => x.intensity === b.info[i].intensity), 'evolving is deterministic for a seed');
  assert(run(PROGS.blues, std, 'blues', 'busy', 5).info.every(x => x.intensity === 1), 'steady reports full intensity');
}

// --- calibration against real solos
// Numbers measured on the Weimar Jazz Database v2.1 (435 solos in 4/4, ~190,000 notes; scripts in the maintainer's notes), chord
// tones = 1-3-5-7 of the chord in effect. The generator's DEFAULT settings are checked to land near them - and the textbook
// 'safe' setting is checked to be far from them, which is why it is no longer the default.
const REAL = { ctStrong: 0.52, ctOff: 0.48, notesPerBar: 6.37, restBeats: 0.27, posBeat: 0.32, posEighth: 0.25, posTriplet: 0.13, posSixteenth: 0.19,
  ivStep: 0.57, ivThird: 0.27, ivFourth: 0.10, ivLeap: 0.03, dirKeep: 0.58, gapFill: 0.67, repeatPrev: 0.01, vib: 0.02, bend: 0.003, slide: 0.02, densMid: 1.11 };
{
  const strictTones = name => { const c = parseChord(name); if (!c) return null; const iv = [...new Set(c.iv)], has7 = iv.includes(10) || iv.includes(11); return new Set(iv.filter(x => [0, 3, 4, 6, 7, 8, 10, 11].includes(x) || (x === 9 && !has7)).map(x => (c.root + x) % 12)); };
  const PR = { blues: PROGS.blues, autumn: one('Am7 D7 Gmaj7 Cmaj7 F#m7b5 B7 Em Em Am7 D7 Gmaj7 Cmaj7 F#m7b5 B7 Em Em'), turn: one('Dm7 G7 Cmaj7 Cmaj7 Dm7 G7 Cmaj7 A7 Dm7 G7 Cmaj7 Cmaj7 Dm7 G7 Cmaj7 Cmaj7') };
  const measure = cfg => {
    const A = {}; const add = (k, v = 1) => { A[k] = (A[k] || 0) + v; };
    const thirds = [];
    for (const bars of Object.values(PR)) for (let seed = 1; seed <= 14; seed++) {
      const r = generateSolo({ bars, inst: std, seed, ...cfg });
      const notes = []; r.bars.forEach((ns, bar) => ns.forEach(n => { const seg = r.info.find(x => x.bar === bar && n.at >= x.from && n.at < x.to); notes.push({ bar, at: n.at, abs: bar * 48 + n.at, pitch: std.midi[n.s] + n.f + (n.bend || 0), ct: seg ? strictTones(seg.chord) : null, link: n.link, bend: n.bend, vib: n.vib }); }));
      notes.sort((a, b) => a.abs - b.abs); add('notes', notes.length);
      for (const n of notes) { if (n.ct) { const hit = n.ct.has(((n.pitch % 12) + 12) % 12), st = n.at % 12 === 0; add(st ? 'cs' : 'co'); if (hit) add(st ? 'csh' : 'coh'); } const q = n.at % 12; add(q === 0 ? 'pb' : q === 6 ? 'pe' : (q === 4 || q === 8) ? 'pt' : (q === 3 || q === 9) ? 'ps' : 'px'); if (n.vib) add('vib'); if (n.bend) add('bend'); if (n.link === 's') add('slide'); }
      let prev = null, pi = null;
      for (const n of notes) { if (prev && n.abs - prev.abs > 0 && n.abs - prev.abs <= 12) { const iv = n.pitch - prev.pitch, a = Math.abs(iv); add(a <= 2 && a > 0 ? 'step' : a <= 4 && a > 2 ? 'third' : a <= 7 && a > 4 ? 'fourth' : a > 7 ? 'leap' : 'rep'); add('ivn'); if (pi !== null && pi !== 0 && iv !== 0) { add('dn'); if ((pi > 0) === (iv > 0)) add('ds'); } if (pi !== null && Math.abs(pi) >= 5 && iv !== 0) { add('fn'); if ((pi > 0) !== (iv > 0)) add('fb'); } pi = iv; } else pi = null; prev = n; }
      const byBar = {}; notes.forEach(n => { (byBar[n.bar] ||= []).push(n); });
      const idx = Object.keys(byBar).map(Number).sort((a, b) => a - b); add('bars', idx.length);
      const seen = new Set(notes.map(n => `${n.bar}:${Math.floor(n.at / 12)}`)); add('bt', (idx[idx.length - 1] - idx[0] + 1) * 4); add('bw', seen.size);
      const sig = {}; for (const b of idx) sig[b] = byBar[b].map(n => n.at).join(); for (const b of idx) if (sig[b - 1] !== undefined) { add('rn'); if (sig[b] === sig[b - 1]) add('rp'); }
      const th = [0, 1, 2].map(i => idx.slice(Math.floor(i * idx.length / 3), Math.floor((i + 1) * idx.length / 3)));
      thirds.push(th.map(t => t.reduce((n, b) => n + byBar[b].length, 0) / t.length));
    }
    const d = (a, b) => A[a] / A[b], mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    return { ctStrong: d('csh', 'cs'), ctOff: d('coh', 'co'), notesPerBar: d('notes', 'bars'), restBeats: 1 - d('bw', 'bt'), posBeat: A.pb / A.notes, posEighth: A.pe / A.notes, posTriplet: A.pt / A.notes, posSixteenth: A.ps / A.notes,
      ivStep: d('step', 'ivn'), ivThird: d('third', 'ivn'), ivFourth: d('fourth', 'ivn'), ivLeap: d('leap', 'ivn'), dirKeep: d('ds', 'dn'), gapFill: d('fb', 'fn'), repeatPrev: d('rp', 'rn'),
      vib: (A.vib || 0) / A.notes, bend: (A.bend || 0) / A.notes, slide: (A.slide || 0) / A.notes, densMid: mean(thirds.map(t => t[1] / t[0])) };
  };
  const def = measure({ style: 'follow', feel: 'mixed', density: 'medium', evolve: 'gentle', tension: 'balanced', techniques: 'some' });
  const free = measure({ style: 'follow', feel: 'mixed', density: 'medium', evolve: 'gentle', tension: 'free', techniques: 'some' });
  const safe = measure({ style: 'follow', feel: 'straight', density: 'medium', evolve: 'off', tension: 'safe', techniques: 'off', rests: 0 });
  const near = (k, tol) => Math.abs(def[k] - REAL[k]) <= tol;
  const show = Object.keys(REAL).map(k => `${k} ${def[k].toFixed(2)} (real ${REAL[k]})`).join(', ');
  console.log(`calibration (default settings vs real solos): ${show}`);
  assert(def.ctStrong < 0.8 && def.ctStrong > 0.5, `default: chord tones on ${(100 * def.ctStrong).toFixed(0)}% of strong beats (real ${100 * REAL.ctStrong}%, the textbook line ${(100 * safe.ctStrong).toFixed(0)}%)`);
  assert(free.ctStrong < def.ctStrong && free.ctStrong < 0.7 && safe.ctStrong > 0.9, `free is closer to real than balanced (${free.ctStrong.toFixed(2)} < ${def.ctStrong.toFixed(2)}); safe is the textbook line (${safe.ctStrong.toFixed(2)})`);
  assert(near('ctOff', 0.12), `chord tones off the beat ${def.ctOff.toFixed(2)} vs real ${REAL.ctOff}`);
  assert(near('notesPerBar', 1.2), `${def.notesPerBar.toFixed(1)} notes a bar vs real ${REAL.notesPerBar}`);
  assert(def.restBeats > 0.14 && def.restBeats < 0.34 && safe.restBeats < 0.05, `${(100 * def.restBeats).toFixed(0)}% of beats have no new note (real ${100 * REAL.restBeats}%; the old generator had ${(100 * safe.restBeats).toFixed(0)}%)`);
  assert(near('posBeat', 0.14) && near('posEighth', 0.07) && near('posTriplet', 0.06) && near('posSixteenth', 0.07), `onset positions: beat ${def.posBeat.toFixed(2)} eighth ${def.posEighth.toFixed(2)} triplet ${def.posTriplet.toFixed(2)} sixteenth ${def.posSixteenth.toFixed(2)} (real ${REAL.posBeat} ${REAL.posEighth} ${REAL.posTriplet} ${REAL.posSixteenth})`);
  assert(near('ivStep', 0.07) && near('ivThird', 0.06) && near('ivFourth', 0.05) && def.ivLeap < 0.06, `interval mix: step ${def.ivStep.toFixed(2)} third ${def.ivThird.toFixed(2)} fourth ${def.ivFourth.toFixed(2)} leap ${def.ivLeap.toFixed(2)} (real ${REAL.ivStep} ${REAL.ivThird} ${REAL.ivFourth} ${REAL.ivLeap})`);
  assert(near('dirKeep', 0.1) && near('gapFill', 0.12), `momentum: keeps direction ${def.dirKeep.toFixed(2)} (real ${REAL.dirKeep}), turns back after a leap ${def.gapFill.toFixed(2)} (real ${REAL.gapFill})`);
  assert(def.repeatPrev <= 0.08, `a bar's rhythm is only rarely identical to the one before (${def.repeatPrev.toFixed(2)}, real ${REAL.repeatPrev})`);
  assert(def.vib <= 0.05 && def.bend <= 0.02 && def.slide <= 0.04, `jazz-style techniques are as rare as in real solos: vibrato ${def.vib.toFixed(3)} bend ${def.bend.toFixed(3)} slide ${def.slide.toFixed(3)}`);
  assert(def.densMid >= 0.98 && def.densMid <= 1.25, `a gentle arc: the middle of the solo is ${def.densMid.toFixed(2)}x as busy as the start (real ${REAL.densMid})`);
}

// --- techniques
console.log(`techniques in the runs above: ${stat.links} links, ${stat.bends} bends, ${stat.vibs} vibratos`);
assert(stat.links > 500 && stat.bends > 100 && stat.vibs > 500, 'the generator really uses hammer-ons/slides, bends and vibrato when asked');
{
  const marks = lv => { let n = 0; for (let sd = 1; sd <= 12; sd++) for (const st of ['blues', 'pent', 'follow']) { const r = run(PROGS.blues, std, st, 'medium', sd, 'straight', lv); r.bars.flat().forEach(x => { if (x.link) n++; if (x.bend) n++; if (x.vib) n++; }); } return n; };
  const [off, some, lots] = ['off', 'some', 'lots'].map(marks);
  assert(off === 0 && some > 20 && lots > some * 1.3, `techniques: off ${off}, some ${some}, lots ${lots}`);
  const a = run(PROGS.blues, std, 'blues', 'medium', 9, 'straight', 'lots'), b = run(PROGS.blues, std, 'blues', 'medium', 9, 'straight', 'lots');
  assert(JSON.stringify(a.bars) === JSON.stringify(b.bars), 'the same seed and settings give the same solo, techniques included');
  assert(JSON.stringify(a.bars.map(x => x.map(({ at, len, s: st, f }) => [at, len, st, f]))) !== JSON.stringify(run(PROGS.blues, std, 'blues', 'medium', 9, 'straight', 'off').bars.map(x => x.map(({ at, len, s: st, f }) => [at, len, st, f]))), 'techniques change the written notes (bends are written lower than they sound)');
  // what the player is told matches what is written
  let slides = 0, hams = 0, skips = 0, softs = 0, bends = 0;
  for (let sd = 1; sd <= 10; sd++) {
    const r = run(PROGS.blues, std, 'blues', 'medium', sd, 'straight', 'lots');
    const evs = tabEvents({ title: '', bpm: 90, res: 48, bars: r.bars.map(n => ({ chords: [], notes: n })) }, std);
    r.bars.flat().forEach(n => { if (n.link === 's') slides++; if (n.link === 'h') hams++; if (n.bend) bends++; });
    skips += evs.filter(e => e.skip).length; softs += evs.filter(e => e.soft).length;
    assert(evs.filter(e => e.slideTo !== undefined).length === evs.filter(e => e.skip).length, 'every slide has exactly one note it runs into');
    assert(evs.filter(e => e.bend).length === r.bars.flat().filter(n => n.bend).length, 'every bend reaches the player');
  }
  assert(skips === slides && softs === hams && slides > 0 && hams > 0 && bends > 0, `player events match the written techniques (slides ${slides}/${skips}, hammer/pull ${hams}/${softs}, bends ${bends})`);
}

// --- the feels: every rhythm template is valid and on its feel's grid
for (const f of FEELS) {
  for (const d of ['sparse', 'medium', 'busy']) {
    const pool = RHYTHMS[f.id][d];
    assert(pool.length >= 3, `${f.id}/${d} has at least three rhythms`);
    for (const r of pool) {
      assert(r.every(([a, l], i) => a >= 0 && l >= 2 && a + l <= STEPS && (i === 0 || a >= r[i - 1][0] + r[i - 1][1])), `${f.id}/${d}: rhythm ${JSON.stringify(r)} is ordered, non-overlapping and inside the bar`);
      assert(r.every(([a]) => (f.id === 'shuffle' || f.id === 'triplet' ? a % 4 === 0 : f.id === 'mixed' ? a % 3 === 0 || a % 4 === 0 : a % 3 === 0)), `${f.id}/${d}: onsets sit on the ${f.id} grid`);
    }
  }
  const avgN = d => RHYTHMS[f.id][d].reduce((n, r) => n + r.length, 0) / RHYTHMS[f.id][d].length;
  assert(avgN('sparse') < avgN('medium') && avgN('medium') < avgN('busy'), `${f.id}: sparser rhythms have fewer notes (${avgN('sparse')}, ${avgN('medium')}, ${avgN('busy')})`);
  for (const k of ['sparse', 'normal']) { const r = FINALS[f.id][k]; assert(r[r.length - 1][0] + r[r.length - 1][1] === STEPS && r[r.length - 1][1] >= 12, `${f.id}: the final bar ends on a long note that reaches the bar line (${k})`); }
}
{ // feels really feel different: shuffle has long-short pairs, triplet runs have three per beat
  const sh = run(PROGS.blues, std, 'blues', 'medium', 3, 'shuffle'), tr = run(PROGS.blues, std, 'blues', 'busy', 3, 'triplet'), st = run(PROGS.blues, std, 'blues', 'medium', 3, 'straight');
  const pairs = sh.bars.flat().filter(n => n.at % 12 === 8 && n.len === 4).length;
  assert(pairs >= 6, `shuffle writes long-short pairs (${pairs} short notes on the third triplet)`);
  assert(tr.bars.flat().filter(n => n.len === 4).length > 30, 'triplet feel writes runs of triplet eighths');
  assert(st.bars.flat().every(n => n.at % 3 === 0), 'straight feel stays on the sixteenth grid');
}

// --- density really changes the number of notes
const avg = d => { let n = 0, b = 0; for (let s = 1; s <= 20; s++) { const r = run(PROGS.pop, std, 'pent', d, s, 'straight'); r.bars.forEach(x => { n += x.length; b++; }); } return n / b; };
const [sp, me, bu] = ['sparse', 'medium', 'busy'].map(avg);
assert(sp < me && me < bu && sp >= 2 && sp <= 5 && bu >= 6.5, `notes per bar: sparse ${sp.toFixed(1)}, medium ${me.toFixed(1)}, busy ${bu.toFixed(1)}`);

// --- style semantics
{
  const bl = run(PROGS.blues, std, 'blues', 'medium', 5);
  assert(bl.info.every(s => s.scaleId === 'blues' && s.root === 9), 'blues style plays the key\'s blues scale over every chord (A blues for the A blues)');
  assert(bl.key.t === 9, 'the key of a twelve-bar blues in A is found');
  const pe = run(PROGS.pop, std, 'pent', 'medium', 5);
  assert(pe.info.map(s => s.scaleId).join() === 'majpent,majpent,minpent,majpent,majpent,majpent,majpent,majpent', 'pentatonic style: major pentatonic on major chords, minor on minor chords');
  const fo = run(PROGS.jazz, std, 'follow', 'medium', 5);
  const jazzChords = PROGS.jazz.map(b => parseChord(b.chords[0].name));
  const want = jazzChords.map(c => chordScales(c, fo.key, jazzChords)[0].s.id).join();
  assert(fo.info.map(s => s.scaleId).join() === want && fo.info[0].scaleId === 'dorian' && fo.info[1].scaleId === 'mixolydian', `follow style plays the scale the Progressions tab ranks first for each chord: ${fo.info.map(s => s.scaleId)}`);
  const mid = run(PROGS.mid, std, 'follow', 'medium', 5);
  assert(mid.info.filter(s => s.bar === 0).length === 2 && mid.info.filter(s => s.bar === 0).map(s => s.chord).join() === 'Dm7,G7', 'a chord change in the middle of a bar makes two stretches');
  assert(mid.info.filter(s => s.bar === 2).length === 2 && mid.info.filter(s => s.bar === 2)[0].chord === 'A7', 'a bar that starts after its first step continues the previous chord until the marker');
  const none = run(PROGS.nochords, std, 'follow', 'medium', 5);
  assert(none.key.t === 9 && none.key.mode === 'minor' && none.bars.every(b => b.length > 0), 'with no chords at all it plays in A minor');
  const keyed = generateSolo({ bars: PROGS.nochords, inst: std, style: 'pent', density: 'medium', seed: 1, key: { t: 2, mode: 'major' } });
  assert(keyed.key.t === 2 && keyed.info.every(s => s.root === 2), 'a given key is used when no chords are named');
}

// --- choices made on a chord marker (scale, positions) are honoured, per occurrence
{
  const mk = (a, b) => [{ chords: [{ at: 0, name: 'A7', ...a }] }, { chords: [{ at: 0, name: 'A7', ...b }] }];
  let checked = 0;
  for (const inst of insts) for (const seed of [1, 2, 3]) {
    for (const [scale, positions] of /** @type {[string, number[]][]} */ ([['dorian', [2]], ['minpent', [1, 3]], ['mixolydian', [5]], ['blues', [2, 4]]])) {
      const r = generateSolo({ bars: mk({ scale, positions }, {}), inst, style: 'follow', density: 'busy', seed });
      const a = r.info.filter(s => s.bar === 0), b = r.info.filter(s => s.bar === 1);
      assert(a.every(s => s.scaleId === scale && s.root === 9), `${inst.name}: bar 0 plays the chosen ${scale}`);
      assert(a.every(s => positions.includes(s.position)), `${inst.name}: bar 0 stays in positions ${positions} (got ${a.map(s => s.position)})`);
      assert(b.every(s => s.scaleId !== scale || scale === 'mixolydian'), `${inst.name}: bar 1, the same chord without choices, plays its own automatic scale (${b.map(s => s.scaleId)})`);
      r.bars[0].forEach(n => { const m = inst.midi[n.s] + n.f; assert(a[0].scalePcs.includes(m % 12), `${inst.name}: bar 0 note ${m} is in ${scale}`); assert(a[0].frets[n.s].has(n.f), `${inst.name}: bar 0 note is inside the chosen position`); });
      checked++;
    }
  }
  // positions are really restricted: every position the generator reports is one of the allowed ones whenever that position exists
  const guitar = std;
  for (let k = 1; k <= 5; k++) for (const seed of [1, 2, 3, 4]) {
    const r = generateSolo({ bars: [{ chords: [{ at: 0, name: 'Am', scale: 'minpent', positions: [k] }] }], inst: guitar, style: 'follow', density: 'medium', seed });
    assert(r.info.every(s => s.position === k), `minor pentatonic restricted to position ${k} reports position ${r.info.map(s => s.position)}`);
  }
  // two occurrences of one chord can be played differently (the solo can evolve)
  const evo = generateSolo({ bars: mk({ scale: 'minpent', positions: [1] }, { scale: 'minpent', positions: [4] }), inst: std, style: 'follow', density: 'medium', seed: 3 });
  assert(evo.info[0].position === 1 && evo.info[1].position === 4, 'the same chord can use a different position the second time');
  const fretsOf = bar => evo.bars[bar].map(n => n.f);
  assert(Math.min(...fretsOf(1)) > Math.min(...fretsOf(0)) || Math.max(...fretsOf(1)) > Math.max(...fretsOf(0)), 'the second occurrence really moves up the neck');
  // junk choices are ignored
  const junk = generateSolo({ bars: [{ chords: [{ at: 0, name: 'Am', scale: 'nope', positions: [99, -1] }] }], inst: std, style: 'follow', density: 'medium', seed: 1 });
  assert(junk.info[0].scaleId && junk.bars[0].length > 0, 'an unknown scale or position falls back to automatic');
  // same chord, same choices, back to back in one bar: one stretch; different choices: two
  const same = generateSolo({ bars: [{ chords: [{ at: 0, name: 'Am', scale: 'minpent' }, { at: 24, name: 'Am', scale: 'minpent' }] }], inst: std, style: 'follow', density: 'medium', seed: 1 });
  const diff = generateSolo({ bars: [{ chords: [{ at: 0, name: 'Am', scale: 'minpent' }, { at: 24, name: 'Am', scale: 'aeolian' }] }], inst: std, style: 'follow', density: 'medium', seed: 1 });
  assert(same.info.length === 1 && diff.info.length === 2 && diff.info[1].scaleId === 'aeolian', 'identical neighbouring markers are one stretch; different choices start a new one');
  console.log(`marker choices: ${checked} cases checked`);
}

console.log(failures ? `${failures} FAILED` : 'solo: all passed');
process.exit(failures ? 1 : 0);
