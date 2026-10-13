// Converts tombatossals/chords-db (MIT, (c) 2016 David Rubert) into
// site/data/voicings.json: per instrument, "<rootPc>|<our suffix>" -> voicings
// in OUR string order (index 0 = highest string, like tuning[]).
// Usage: node tools/build-voicings.mjs <path-to-chords-db>/lib
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CHORDS } from '../site/theory.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = process.argv[2];
if (!lib) { console.error('usage: node tools/build-voicings.mjs <chords-db>/lib'); process.exit(1); }

const PC = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 };
const ALIAS = { '':'major', m:'minor', maj6:'6', add2:'add9' }; // ours -> chords-db suffix
const INSTR = {
  guitar:  { file: 'guitar.json',  open: [64,59,55,50,45,40] },
  ukulele: { file: 'ukulele.json', open: [69,64,60,67] },
};

const out = {}; const report = [];
for (const [name, { file, open }] of Object.entries(INSTR)) {
  const db = JSON.parse(fs.readFileSync(path.join(lib, file)));
  const bySuffix = {};
  for (const arr of Object.values(db.chords)) for (const c of arr) (bySuffix[c.suffix] ||= []).push(c);
  out[name] = {};
  let kept = 0, dropped = 0;
  for (const ours of Object.keys(CHORDS)) {
    const dbSuffix = ALIAS[ours] ?? ours;
    for (const c of bySuffix[dbSuffix] || []) {
      const root = PC[c.key];
      if (root === undefined) continue;
      const want = new Set(CHORDS[ours].map(x => (root + x) % 12));
      if (ours === '11') want.add((root + 4) % 12); // our '11' omits the 3rd; real 11 voicings keep it
      if (ours === '13') want.add((root + 5) % 12); // 13 voicings often keep the 11th
      const list = [];
      for (const p of c.positions) {
        // chords-db order is low->high string; ours is high->low. Fret numbers
        // are relative to baseFret (0 = open, -1 = muted).
        const abs = p.frets.map(f => f > 0 ? f + p.baseFret - 1 : f).reverse();
        const fingers = p.fingers.map(f => Math.max(f, 0)).reverse();
        const sounding = abs.map((f, j) => f >= 0 ? open[j] + f : null).filter(m => m !== null);
        const pcs = new Set(sounding.map(m => m % 12));
        const dbMidi = new Set(p.midi.map(m => m % 12));
        const sameAsDb = pcs.size === dbMidi.size && [...pcs].every(x => dbMidi.has(x));
        const inChord = [...pcs].every(x => want.has(x));
        // 4-string instruments legitimately drop the root/5th of extended chords
        const hasRoot = name === 'guitar' ? pcs.has(root) : true;
        const has3rdOr5th = [...want].filter(x => pcs.has(x)).length >= Math.min(name === 'guitar' ? 3 : 2, want.size);
        if (!sameAsDb || !inChord || !hasRoot || !has3rdOr5th) {
          dropped++; report.push(`${name} ${c.key}${dbSuffix} ${JSON.stringify(p.frets)} base${p.baseFret}: ${!sameAsDb ? 'frets!=midi ' : ''}${!inChord ? 'foreign note ' : ''}${!hasRoot ? 'no root ' : ''}${!has3rdOr5th ? 'too few chord tones' : ''}`);
          continue;
        }
        let barre = null;
        if (p.barres?.length) {
          const r = p.barres[0];
          const idx = p.frets.map((f, i) => f === r ? i : -1).filter(i => i >= 0);
          const finger = p.fingers[idx[0]];
          const same = idx.filter(i => p.fingers[i] === finger);
          const n = p.frets.length;
          barre = { fret: r + p.baseFret - 1, from: n - 1 - Math.max(...same), to: n - 1 - Math.min(...same) };
        }
        list.push({ f: abs, g: fingers, b: barre });
        kept++;
      }
      list.sort((a, b) => Math.min(...a.f.filter(x => x > 0), 99) - Math.min(...b.f.filter(x => x > 0), 99));
      if (list.length) out[name][`${root}|${ours}`] = list;
    }
  }
  console.log(`${name}: kept ${kept} voicings, dropped ${dropped}`);
}
fs.writeFileSync(path.join(here, '../site/data/voicings.json'), JSON.stringify(out));
fs.writeFileSync(path.join(here, '../site/data/voicings.LICENSE.txt'),
  'Voicing data derived from tombatossals/chords-db\nhttps://github.com/tombatossals/chords-db\nMIT License, Copyright (c) 2016 David Rubert\n');
fs.writeFileSync('voicing-drops.txt', report.join('\n'));
console.log('dropped details in ./voicing-drops.txt (gitignored)');
