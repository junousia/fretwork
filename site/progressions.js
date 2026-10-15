import { CHORDS, keyFlats, spell } from './music.js';

/* Roman-numeral progressions: a degree token (e.g. 'I', 'ii7', 'bVII',
   'V7', 'i', '#ivdim') resolves to a real chord name for a given key,
   reusing the existing CHORDS table for every quality. */
/** @type {Record<string, number>} */
const DEGREE_SEMITONES={I:0,II:2,III:4,IV:5,V:7,VI:9,VII:11};
/** Resolve a roman-numeral token to a chord name in a key (null if unreadable). With `jazz`, Eb, Ab and Bb are always spelled flat, as in lead sheets, whatever the key. @param {string} token @param {import('./types.js').Key} key @param {boolean} [jazz] @returns {string|null} */
export function chordFromDegree(token,key,jazz=false){
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
  const pc=(key.t+semis+12)%12, flats=(jazz&&[3,8,10].includes(pc))||keyFlats(key);
  return spell(pc,flats)+suffix;
}
/** The chord names of a progression in a key (a space-separated line). @param {{degrees:string[], group?:string}} template @param {import('./types.js').Key} key @returns {string} */
export function progressionText(template,key){
  return template.degrees.map(d=>chordFromDegree(d,key,template.group==='Classics'||template.group==='Jazz')).join(' ');
}
/**
 * A progression as degrees, so it can be played in any key. `bars` (optional) gives the chords of each bar when a bar has more than one;
 * otherwise every degree is a bar. `mode` is what the key becomes (a "major" progression played from A is A major, a "minor" one A minor),
 * `home` the usual tonic (a pitch class) used when no key is chosen - the key the tune is known in, else C major / A minor.
 * The "Classics" are the changes of well-known tunes as transcribed in the Weimar Jazz Database (see THIRD_PARTY_NOTICES.md).
 * @typedef {{name:string, group:string, mode:'major'|'minor', degrees:string[], bars?:string[][], home?:number}} ProgressionTemplate
 */
/** The order the groups are listed in. */
export const PROGRESSION_GROUPS=['Common','Blues','Jazz','Classics'];
/** @type {ProgressionTemplate[]} */
export const PROGRESSION_LIBRARY=[
  {name:'I–IV–V (three-chord rock)',group:'Common',mode:'major',degrees:['I','IV','V']},
  {name:'I–V–vi–IV (the "pop" progression)',group:'Common',mode:'major',degrees:['I','V','vi','IV']},
  {name:'vi–IV–I–V',group:'Common',mode:'major',degrees:['vi','IV','I','V']},
  {name:'I–vi–IV–V (50s / doo-wop)',group:'Common',mode:'major',degrees:['I','vi','IV','V']},
  {name:'Canon progression',group:'Common',mode:'major',degrees:['I','V','vi','iii','IV','I','IV','V']},
  {name:'i–iv–v (minor, natural)',group:'Common',mode:'minor',degrees:['i','iv','v']},
  {name:'i–iv–V7 (minor, raised 5th)',group:'Common',mode:'minor',degrees:['i','iv','V7']},
  {name:'Minor groove (i7–iv7–i7–V7)',group:'Common',mode:'minor',degrees:['i7','iv7','i7','V7']},
  {name:'Andalusian cadence (i–bVII–bVI–V)',group:'Common',mode:'minor',degrees:['i','bVII','bVI','V']},
  {name:'i–bVI–bIII–bVII (minor "epic")',group:'Common',mode:'minor',degrees:['i','bVI','bIII','bVII']},
  {name:'12-bar blues',group:'Blues',mode:'major',degrees:['I7','I7','I7','I7','IV7','IV7','I7','I7','V7','IV7','I7','V7']},
  {name:'Quick-change blues',group:'Blues',mode:'major',degrees:['I7','IV7','I7','I7','IV7','IV7','I7','I7','V7','IV7','I7','V7']},
  {name:'Minor blues',group:'Blues',mode:'minor',degrees:['i7','i7','i7','i7','iv7','iv7','i7','i7','bVI7','V7','i7','V7']},
  {name:'ii–V–I (jazz)',group:'Jazz',mode:'major',degrees:['ii7','V7','Imaj7']},
  {name:'I–vi–ii–V (jazz turnaround)',group:'Jazz',mode:'major',degrees:['Imaj7','vi7','ii7','V7']},
  {name:'ii°–V7–i (minor jazz)',group:'Jazz',mode:'minor',degrees:['iiø7','V7','i']},
  {name:'Autumn Leaves (A section)',group:'Jazz',mode:'major',home:7,degrees:['ii7','V7','Imaj7','IVmaj7','viiø7','III7','vi']},
  {name:'Rhythm changes (I Got Rhythm)',group:'Classics',mode:'major',home:10,degrees:[],bars:[['I6', 'vi7'], ['ii7', 'V7'], ['I6', 'vi7'], ['ii7', 'V7'], ['I6', 'I7'], ['IV6', '#iv°7'], ['I6', 'V7'], ['I6'], ['I6', 'vi7'], ['ii7', 'V7'], ['I6', 'vi7'], ['ii7', 'V7'], ['I6', 'I7'], ['IV6', '#iv°7'], ['I6', 'V7'], ['I6'], ['III7'], ['III7'], ['VI7'], ['VI7'], ['II7'], ['II7'], ['V7'], ['V7'], ['I6', 'vi7'], ['ii7', 'V7'], ['I6', 'vi7'], ['ii7', 'V7'], ['I6', 'I7'], ['IV6', '#iv°7'], ['I6', 'V7'], ['I6']]},
  {name:'All the Things You Are',group:'Classics',mode:'major',home:8,degrees:[],bars:[['vi7'], ['ii7'], ['V7'], ['Imaj7'], ['IVmaj7'], ['VII7'], ['IIImaj7'], ['IIImaj7'], ['iii7'], ['vi7'], ['II7'], ['Vmaj7'], ['Imaj7'], ['#IV7'], ['VIImaj7'], ['VIImaj7'], ['bii7'], ['#IV7'], ['VIImaj7'], ['VIImaj7'], ['bvii7'], ['bIII7'], ['bVImaj7'], ['IIIaug7'], ['vi7'], ['ii7'], ['V7'], ['Imaj7'], ['IVmaj7'], ['iv7'], ['iii7'], ['biii°7'], ['ii7'], ['V7'], ['Imaj7'], ['VII7', 'III7']]},
  {name:'Giant Steps',group:'Classics',mode:'major',home:11,degrees:[],bars:[['Imaj7', 'bIII7'], ['bVImaj7', 'VII7'], ['IIImaj7'], ['bvii7', 'bIII7'], ['bVImaj7', 'VII7'], ['IIImaj7', 'V7'], ['Imaj7'], ['#iv7', 'VII7'], ['IIImaj7'], ['bvii7', 'bIII7'], ['bVImaj7'], ['ii7', 'V7'], ['Imaj7'], ['#iv7', 'VII7'], ['IIImaj7'], ['ii7', 'V7']]},
  {name:'Confirmation',group:'Classics',mode:'major',home:5,degrees:[],bars:[['Imaj7'], ['viiø7', 'III7'], ['vi7', 'II7'], ['v7', 'I7'], ['i7', 'IV7'], ['iiiø7', 'VI7'], ['II7'], ['V7'], ['Imaj7'], ['viiø7', 'III7'], ['vi7', 'II7'], ['v7', 'I7'], ['i7', 'IV7'], ['iiiø7', 'VI7'], ['ii7', 'V7'], ['Imaj7'], ['v7'], ['I7'], ['IVmaj7'], ['IVmaj7'], ['bvii7'], ['bIII7'], ['bVImaj7'], ['ii7', 'V7'], ['Imaj7'], ['viiø7', 'III7'], ['vi7', 'II7'], ['v7', 'I7'], ['i7', 'IV7'], ['iiiø7', 'VI7'], ['ii7', 'V7'], ['Imaj7']]},
  {name:'Blues for Alice (jazz blues)',group:'Classics',mode:'major',home:5,degrees:[],bars:[['Imaj7'], ['viiø7', 'III7b9'], ['vi7', 'II7'], ['v7', 'I7'], ['IV7'], ['iv7', 'bVII7'], ['iii7', 'VI7'], ['biii7', 'bVI7'], ['ii7'], ['V7'], ['Imaj7', 'vi7'], ['ii7', 'V7']]},
  {name:'Summertime',group:'Classics',mode:'minor',home:7,degrees:[],bars:[['i', 'V7'], ['i', 'V7'], ['i', 'V7'], ['i', 'I7'], ['iv'], ['iv'], ['iiø7'], ['V7'], ['i'], ['i'], ['i'], ['iv7', 'bVII7'], ['bIIImaj7', 'bVI7'], ['iiø7', 'V7'], ['i'], ['iiø7', 'V7']]},
];
/** The chords of each bar of a progression. @param {ProgressionTemplate} t @returns {string[][]} */
export const templateBars=t=>t.bars||t.degrees.map(d=>[d]);
// every template carries a flat `degrees` list: the chords in order
PROGRESSION_LIBRARY.forEach(t=>{ if(!t.degrees.length&&t.bars) t.degrees=t.bars.flat(); });


/** "t:mode" form of a key (what the key selects use). @param {import('./types.js').Key} k @returns {string} */
export const keyValue=k=>`${k.t}:${k.mode}`;
/** Parse a "t:mode" key value; null for "auto" or junk. @param {string} v @returns {import('./types.js').Key|null} */
export function parseKeyValue(v){
  const m=String(v).match(/^(\d{1,2}):(major|minor)$/);
  return m&&+m[1]<12?{t:+m[1],mode:/** @type {'major'|'minor'} */ (m[2])}:null;
}
/**
 * The key a progression is played in when it is picked: the tonic of the key chosen (or, if none is chosen, the tune's usual tonic, else
 * C for a major progression and A for a minor one) with the progression's own mode - a blues picked "in A minor" is a blues in A.
 * @param {ProgressionTemplate} template @param {string} chosen "auto" or a "t:mode" key value @returns {import('./types.js').Key}
 */
export function keyForTemplate(template,chosen){
  const k=parseKeyValue(chosen);
  return {t:k?k.t:template.home??(template.mode==='minor'?9:0),mode:template.mode};
}
/** The <option>s of the library, grouped; the value is the template's index. @param {(s:string)=>string} esc @returns {string} */
export function libraryOptions(esc){
  return '<option value="">Choose\u2026</option>'+PROGRESSION_GROUPS.map(g=>`<optgroup label="${esc(g)}">${PROGRESSION_LIBRARY.map((p,i)=>p.group===g?`<option value="${i}">${esc(p.name)}</option>`:'').join('')}</optgroup>`).join('');
}
/** The chord names of each bar of a progression in a key. @param {ProgressionTemplate} template @param {import('./types.js').Key} key @returns {string[][]} */
export const barChords=(template,key)=>templateBars(template).map(bar=>bar.map(d=>chordFromDegree(d,key,template.group==='Classics'||template.group==='Jazz')||''));
