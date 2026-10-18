/* Core music theory, DOM-free: note names, scales, chords, chord parsing, chord-scale
   compatibility ranking, key detection and spelling. Everything else builds on this. */

/** @typedef {import('./types.js').Scale} Scale */
/** @typedef {import('./types.js').Chord} Chord */
/** @typedef {import('./types.js').Key} Key */

export const SHARP=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export const FLAT=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
/** @type {Record<string, number>} */
export const LETTER={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
export const MAJ=[0,2,4,5,7,9,11], MIN=[0,2,3,5,7,8,10];

export const SCALES=[
{id:'ionian',name:'Ionian (major)',short:'Major',iv:[0,2,4,5,7,9,11],c:9,d:'The major scale. Bright and settled.'},
{id:'dorian',name:'Dorian',short:'Dorian',iv:[0,2,3,5,7,9,10],c:9,d:'Minor with a raised 6th. Smooth, jazzy, a little funky.'},
{id:'phrygian',name:'Phrygian',short:'Phrygian',iv:[0,1,3,5,7,8,10],c:5,d:'Minor with a flat 2nd. Dark, with a Spanish edge.'},
{id:'lydian',name:'Lydian',short:'Lydian',iv:[0,2,4,6,7,9,11],c:6,d:'Major with a raised 4th. Floating and dreamy.'},
{id:'mixolydian',name:'Mixolydian',short:'Mixolydian',iv:[0,2,4,5,7,9,10],c:9,d:'Major with a flat 7th. Rock, funk and blues-rock.'},
{id:'aeolian',name:'Aeolian (natural minor)',short:'Minor',iv:[0,2,3,5,7,8,10],c:9,d:'The natural minor scale. Melancholy and familiar.'},
{id:'locrian',name:'Locrian',short:'Locrian',iv:[0,1,3,5,6,8,10],c:6,d:'Unstable and dark. Made for half-diminished chords.'},
{id:'locrian2',name:'Locrian natural 2',short:'Locrian ♮2',iv:[0,2,3,5,6,8,10],c:5,d:'Locrian with a natural 2nd. A softer half-diminished sound.'},
{id:'majpent',name:'Major pentatonic',short:'Major pent.',iv:[0,2,4,7,9],c:10,d:'Five notes with no clashes. Country, pop, sunny melodies.'},
{id:'minpent',name:'Minor pentatonic',short:'Minor pent.',iv:[0,3,5,7,10],c:10,d:'Five notes. The rock and blues workhorse.'},
{id:'blues',name:'Blues scale',short:'Blues',iv:[0,3,5,6,7,10],c:8,d:'Minor pentatonic plus the flat-5 blue note.'},
{id:'majblues',name:'Major blues',short:'Major blues',iv:[0,2,3,4,7,9],c:6,d:'Major pentatonic plus a minor 3rd to slide up from. Country and soul.'},
{id:'harmmin',name:'Harmonic minor',short:'Harm. minor',iv:[0,2,3,5,7,8,11],c:5,d:'Minor with a raised 7th. Classical, neoclassical tension.'},
{id:'melmin',name:'Melodic minor',short:'Mel. minor',iv:[0,2,3,5,7,9,11],c:5,d:'Minor with raised 6th and 7th. The modern jazz minor.'},
{id:'phrdom',name:'Phrygian dominant',short:'Phryg. dom.',iv:[0,1,4,5,7,8,10],c:6,d:'Fifth mode of harmonic minor. The V7 sound in a minor key.'},
{id:'lyddom',name:'Lydian dominant',short:'Lyd. dom.',iv:[0,2,4,6,7,9,10],c:6,d:'Mixolydian with a raised 4th. Made for 7#11 chords.'},
{id:'altered',name:'Altered',short:'Altered',iv:[0,1,3,4,6,8,10],c:7,d:'Every tension altered. Maximum pull toward the next chord.'},
{id:'hwdim',name:'Half-whole diminished',short:'H-W dim.',iv:[0,1,3,4,6,7,9,10],c:6,d:'Symmetrical. Fits dominant chords with a flat 9.'},
{id:'whdim',name:'Whole-half diminished',short:'W-H dim.',iv:[0,2,3,5,6,8,9,11],c:7,d:'Symmetrical. The scale for diminished chords.'},
{id:'whole',name:'Whole tone',short:'Whole tone',iv:[0,2,4,6,8,10],c:6,d:'All whole steps. Hazy and unresolved, for augmented chords.'}
];
export const SC=Object.fromEntries(SCALES.map(s=>[s.id,s]));
export const BLUES_NOTE='Blues sound: the minor 3rd rubs against the chord’s major 3rd on purpose. Bend it up a little.';

/** Chord suffix -> chord-tone intervals above the root. @type {Record<string, number[]>} */
export const CHORDS={'':[0,4,7],'m':[0,3,7],'5':[0,7],'6':[0,4,7,9],'maj6':[0,4,7,9],'69':[0,4,7,9,2],'m6':[0,3,7,9],'m69':[0,3,7,9,2],
'add9':[0,4,7,2],'add2':[0,4,7,2],'madd9':[0,3,7,2],'sus2':[0,2,7],'sus4':[0,5,7],
'7':[0,4,7,10],'9':[0,4,7,10,2],'11':[0,5,7,10,2],'13':[0,4,7,10,2,9],'7sus4':[0,5,7,10],'9sus4':[0,5,7,10,2],'13sus4':[0,5,7,10,2,9],
'maj7':[0,4,7,11],'maj9':[0,4,7,11,2],'maj13':[0,4,7,11,2,9],'maj7#11':[0,4,7,11,6],
'm7':[0,3,7,10],'m9':[0,3,7,10,2],'m11':[0,3,7,10,2,5],'m13':[0,3,7,10,2,9],'mmaj7':[0,3,7,11],'mmaj9':[0,3,7,11,2],
'm7b5':[0,3,6,10],'dim':[0,3,6],'dim7':[0,3,6,9],'aug':[0,4,8],'aug7':[0,4,8,10],'7#5':[0,4,8,10],'7b5':[0,4,6,10],
'7b9':[0,4,7,10,1],'7#9':[0,4,7,10,3],'7#11':[0,4,7,10,6],'9#11':[0,4,7,10,2,6],'13#11':[0,4,7,10,2,6,9],
'7b13':[0,4,7,10,8],'7b9b13':[0,4,7,10,1,8],'13b9':[0,4,7,10,1,9],'7#9b13':[0,4,7,10,3,8],'7#5#9':[0,4,8,10,3],
'7alt':[0,4,10,1,3,6,8]};

/** Normalise the many ways to write a chord suffix to a key of CHORDS. @param {string} s @returns {string} */
export function normSuffix(s){
  s=s.replace(/[()\s,]/g,'').replace(/♭/g,'b').replace(/♯/g,'#').replace(/Δ|\^/g,'maj');
  s=s.replace(/^ø7?$/,'m7b5').replace(/°7/,'dim7').replace(/°/,'dim').replace(/^o7$/,'dim7').replace(/^o$/,'dim');
  s=s.replace(/^-7b5$/,'m7b5').replace(/^min/,'m').replace(/^mi(?!x)/,'m').replace(/^-/,'m');
  s=s.replace(/^mM7|^mMaj7|^mmaj7|^mΔ7/,'mmaj7').replace(/^mM9|^mmaj9/,'mmaj9');
  s=s.replace(/^Maj/,'maj').replace(/^M(?=\d)/,'maj').replace(/^ma(?=\d)/,'maj').replace(/^maj(?=$)/,'');
  if(s==='M') s='';
  s=s.replace(/^\+$/,'aug').replace(/^\+7$|^7\+5?$|^7aug$/,'aug7');
  s=s.replace(/^sus$/,'sus4').replace(/^7sus$/,'7sus4').replace(/^6\/9$/,'69').replace(/^alt$/,'7alt');
  if(s==='maj') s='';
  if(s==='aug7') return 'aug7';
  return s;
}
/** Pitch class of a note letter plus accidental. @param {string} letter @param {string} acc @returns {number} */
export function pcOf(letter,acc){
  let p=LETTER[letter.toUpperCase()];
  if(acc==='#'||acc==='♯') p++; else if(acc==='b'||acc==='♭') p--;
  return (p+12)%12;
}
/** Parse a chord name like "F#m7b5" or "G/B"; null if unreadable. @param {string} tok @returns {Chord|null} */
export function parseChord(tok){
  const m=tok.match(/^([A-Ga-g])([#b♯♭]?)(.*)$/);
  if(!m) return null;
  let rest=m[3], bass=null;
  const bm=rest.match(/\/([A-Ga-g])([#b♯♭]?)$/);
  if(bm){bass=pcOf(bm[1],bm[2]); rest=rest.slice(0,bm.index);}
  const suf=normSuffix(rest);
  const iv=CHORDS[suf];
  if(!iv) return null;
  return {name:tok, root:pcOf(m[1],m[2]), acc:m[2], iv:iv.slice(), bass, suf};
}

/* Chord tones: what each note of a chord is (the scale fit itself lives in scalefit.js) */
/** Classify each chord tone (root/third/.../thirteenth). @param {number[]} iv @returns {[number, string, boolean][]} */
export function tag(iv){
  /** @param {number} n */
  const h=n=>iv.includes(n), hasThird=h(3)||h(4);
  return iv.map(t=>{
    let d;
    if(t===0) d='root';
    else if(t===4) d='third';
    else if(t===3) d=h(4)?'ninth':'third';
    else if(t===1||t===2) d='ninth';
    else if(t===5) d=hasThird?'eleventh':'sus';
    else if(t===6) d=h(7)?'eleventh':'fifth';
    else if(t===7) d='fifth';
    else if(t===8) d=h(7)?'thirteenth':'fifth';
    else if(t===9) d=(h(6)&&h(3)&&!h(10)&&!h(11))?'seventh':'thirteenth';
    else d='seventh';
    return [t,d,hasThird];
  });
}
/** @param {number[]} iv @returns {boolean} */
export function isDominantish(iv){return iv.includes(4)&&iv.includes(7)&&iv.includes(10);}

/* Key detection */
/**
 * The tonic of a blues: three or more dominant-type chords (7, 9, 13 ...) whose roots are only the I, IV and V of one note, with the I
 * chord leading (the first chord, else the most frequent), as in the twelve-bar blues A7 D7 E7. Scoring chords by the notes they share with a
 * scale reads such a progression as the V7 / I7 / IV key a fourth or fifth away (the 12-bar blues in A came out as "D major"), so the blues
 * pattern is recognised first. Returns the pitch class of the I, or null if the chords are not a blues.
 * @param {Chord[]} chords @returns {number|null}
 */
function bluesTonic(chords){
  if(chords.length<3||!chords.every(c=>isDominantish(c.iv))) return null;
  const roots=chords.map(c=>c.root), distinct=[...new Set(roots)];
  if(distinct.length<2) return null;
  const fits=(/** @type {number} */ r)=>roots.every(x=>[r,(r+5)%12,(r+7)%12].includes(x));
  if(fits(roots[0])) return roots[0];
  const count=(/** @type {number} */ r)=>roots.filter(x=>x===r).length;
  const cands=distinct.filter(fits).sort((a,b)=>count(b)-count(a));
  return cands.length&&count(cands[0])>=roots.length*0.4 ? cands[0] : null;
}
/** Best-fitting key for a list of chords. @param {Chord[]} chords @returns {{t:number, mode:'major'|'minor', sc:number}|null} */
export function detectKey(chords){
  const blues=bluesTonic(chords);
  if(blues!==null) return {t:blues,mode:'major',sc:100};
  let best=null;
  for(let t=0;t<12;t++) for(const mode of /** @type {('major'|'minor')[]} */ (['major','minor'])){
    const set=new Set((mode==='major'?MAJ:MIN).map(x=>(x+t)%12)), lead=(t+11)%12;
    let sc=0;
    chords.forEach(c=>{
      const pcs=c.iv.map(x=>(x+c.root)%12); let hit=0;
      pcs.forEach(p=>{ if(set.has(p)) hit+=1; else if(mode==='minor'&&p===lead) hit+=0.8; });
      sc+=hit/pcs.length*10;
      if(c.root===t){ const minorish=c.iv.includes(3)&&!c.iv.includes(4); sc+=((mode==='minor')===minorish)?2:-1; }
    });
    if(chords[0].root===t) sc+=3;
    if(chords[chords.length-1].root===t) sc+=2;
    if(!best||sc>best.sc) best={t,mode,sc};
  }
  return best;
}
export const FLAT_MAJ=new Set([5,10,3,8,1]), FLAT_MIN=new Set([2,7,0,5,10,3]);
/** @param {Key} k @returns {boolean} */
export function keyFlats(k){return k.mode==='major'?FLAT_MAJ.has(k.t):FLAT_MIN.has(k.t);}
/** @param {Key} k @returns {string} */
export function keyName(k){return (keyFlats(k)?FLAT:SHARP)[k.t]+' '+k.mode;}
/** Note name of a pitch class. @param {number} pc @param {boolean} flats @returns {string} */
export function spell(pc,flats){return (flats?FLAT:SHARP)[((pc%12)+12)%12];}
/** Whether to spell a chord's notes with flats. @param {Chord} c @param {Key} k @returns {boolean} */
export function chordFlats(c,k){ if(c.acc==='b'||c.acc==='♭') return true; if(c.acc==='#'||c.acc==='♯') return false; return keyFlats(k); }
/** Interval label ("b3", "#4", ...) given the scale's interval set. @param {number} s @param {Set<number>} set @returns {string} */
export function ivLabel(s,set){
  switch(s){case 0:return '1';case 1:return 'b2';case 2:return '2';case 3:return set.has(4)?'#2':'b3';
  case 4:return '3';case 5:return '4';case 6:return set.has(5)?'b5':'#4';case 7:return '5';
  case 8:return set.has(7)?'b6':'#5';case 9:return '6';case 10:return 'b7';default:return '7';}
}
/** @type {Record<string, string>} */
const HTML_ESCAPES={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
/** HTML-escape. @param {any} s @returns {string} */
export const esc=s=>String(s).replace(/[&<>"']/g,c=>HTML_ESCAPES[c]);

export const TUNING=[4,11,7,2,9,4]; // high E to low E (6-string guitar, standard tuning)
export const STRING_WIDTHS=[1,1.3,1.7,2.1,2.6,3.1];

/** Friendly names of chord types, by suffix. @type {Record<string, string>} */
export const CHORD_LABELS = {
  '':'Major','m':'Minor','5':'Power chord (5)','6':'6','maj6':'6','69':'6/9','m6':'Minor 6','m69':'Minor 6/9',
  'add9':'Add 9','add2':'Add 9','madd9':'Minor add 9','sus2':'Sus2','sus4':'Sus4',
  '7':'Dominant 7th','9':'Dominant 9th','11':'Dominant 11th','13':'Dominant 13th',
  '7sus4':'7sus4','9sus4':'9sus4','13sus4':'13sus4',
  'maj7':'Major 7th','maj9':'Major 9th','maj13':'Major 13th','maj7#11':'Major 7♯11',
  'm7':'Minor 7th','m9':'Minor 9th','m11':'Minor 11th','m13':'Minor 13th',
  'mmaj7':'Minor-major 7th','mmaj9':'Minor-major 9th','m7b5':'Half-diminished (m7♭5)',
  'dim':'Diminished','dim7':'Diminished 7th','aug':'Augmented','aug7':'Augmented 7th',
  '7#5':'7♯5','7b5':'7♭5','7b9':'7♭9','7#9':'7♯9','7#11':'7♯11',
  '9#11':'9♯11','13#11':'13♯11','7b13':'7♭13','7b9b13':'7♭9♭13',
  '13b9':'13♭9','7#9b13':'7♯9♭13','7#5#9':'7♯5♯9','7alt':'7alt (altered)'
};
/** @param {string} suffix @returns {string} */
export function chordLabel(suffix){ return CHORD_LABELS[suffix] || suffix; }
