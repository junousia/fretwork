import { CHORDS, keyFlats, spell } from './music.js';

/* Roman-numeral progressions: a degree token (e.g. 'I', 'ii7', 'bVII',
   'V7', 'i', '#ivdim') resolves to a real chord name for a given key,
   reusing the existing CHORDS table for every quality. */
/** @type {Record<string, number>} */
const DEGREE_SEMITONES={I:0,II:2,III:4,IV:5,V:7,VI:9,VII:11};
/** Resolve a roman-numeral token to a chord name in a key (null if unreadable). @param {string} token @param {import('./types.js').Key} key @returns {string|null} */
export function chordFromDegree(token,key){
  const m=token.match(/^([b#]?)([IV]+)(.*)$/i);
  if(!m) return null;
  const [,acc,roman,rest]=m;
  const upper=roman.toUpperCase();
  if(!(upper in DEGREE_SEMITONES)) return null;
  let semis=DEGREE_SEMITONES[upper];
  if(acc==='b') semis--; else if(acc==='#') semis++;
  const isLower=roman===roman.toLowerCase();
  /** @type {string} */
  let suffix;
  if(!rest) suffix=isLower?'m':'';
  else if(isLower&&/^\d+$/.test(rest)) suffix='m'+rest; // e.g. 'ii7' -> minor 7th, not dominant
  else suffix=rest;
  suffix=suffix.replace(/ø7?/g,'m7b5').replace(/°/g,'dim');
  const pc=(key.t+semis+12)%12, flats=keyFlats(key);
  return spell(pc,flats)+suffix;
}
/** @param {{name:string, degrees:string[]}} template @param {import('./types.js').Key} key @returns {string} */
export function progressionText(template,key){
  return template.degrees.map(d=>chordFromDegree(d,key)).join(' ');
}
/** @type {{name:string, degrees:string[]}[]} */
export const PROGRESSION_LIBRARY=[
  {name:'I–IV–V (three-chord rock)',degrees:['I','IV','V']},
  {name:'I–V–vi–IV (the "pop" progression)',degrees:['I','V','vi','IV']},
  {name:'vi–IV–I–V',degrees:['vi','IV','I','V']},
  {name:'I–vi–IV–V (50s / doo-wop)',degrees:['I','vi','IV','V']},
  {name:'ii–V–I (jazz)',degrees:['ii7','V7','Imaj7']},
  {name:'I–vi–ii–V (jazz turnaround)',degrees:['Imaj7','vi7','ii7','V7']},
  {name:'12-bar blues',degrees:['I7','I7','I7','I7','IV7','IV7','I7','I7','V7','IV7','I7','V7']},
  {name:'i–iv–v (minor, natural)',degrees:['i','iv','v']},
  {name:'i–iv–V7 (minor, raised 5th)',degrees:['i','iv','V7']},
  {name:'Andalusian cadence (i–bVII–bVI–V)',degrees:['i','bVII','bVI','V']},
  {name:'i–bVI–bIII–bVII (minor "epic")',degrees:['i','bVI','bIII','bVII']},
  {name:'ii°–V7–i (minor jazz)',degrees:['ii°','V7','i']},
  {name:'Canon progression',degrees:['I','V','vi','iii','IV','I','IV','V']}
];

