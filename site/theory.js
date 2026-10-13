/* Shared, DOM-free guitar theory engine: chord parsing, scale
   compatibility/ranking, key detection, scale positions, chord-builder
   features, the fretboard SVG builder and the Web Audio playback engine.
   Every tool view imports from this module. */

export const SHARP=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export const FLAT=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
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

export const CHORDS={'':[0,4,7],'m':[0,3,7],'5':[0,7],'6':[0,4,7,9],'maj6':[0,4,7,9],'69':[0,4,7,9,2],'m6':[0,3,7,9],'m69':[0,3,7,9,2],
'add9':[0,4,7,2],'add2':[0,4,7,2],'madd9':[0,3,7,2],'sus2':[0,2,7],'sus4':[0,5,7],
'7':[0,4,7,10],'9':[0,4,7,10,2],'11':[0,5,7,10,2],'13':[0,4,7,10,2,9],'7sus4':[0,5,7,10],'9sus4':[0,5,7,10,2],'13sus4':[0,5,7,10,2,9],
'maj7':[0,4,7,11],'maj9':[0,4,7,11,2],'maj13':[0,4,7,11,2,9],'maj7#11':[0,4,7,11,6],
'm7':[0,3,7,10],'m9':[0,3,7,10,2],'m11':[0,3,7,10,2,5],'m13':[0,3,7,10,2,9],'mmaj7':[0,3,7,11],'mmaj9':[0,3,7,11,2],
'm7b5':[0,3,6,10],'dim':[0,3,6],'dim7':[0,3,6,9],'aug':[0,4,8],'aug7':[0,4,8,10],'7#5':[0,4,8,10],'7b5':[0,4,6,10],
'7b9':[0,4,7,10,1],'7#9':[0,4,7,10,3],'7#11':[0,4,7,10,6],'9#11':[0,4,7,10,2,6],'13#11':[0,4,7,10,2,6,9],
'7b13':[0,4,7,10,8],'7b9b13':[0,4,7,10,1,8],'13b9':[0,4,7,10,1,9],'7#9b13':[0,4,7,10,3,8],'7#5#9':[0,4,8,10,3],
'7alt':[0,4,10,1,3,6,8]};

export function normSuffix(s){
  s=s.replace(/[()\s,]/g,'').replace(/♭/g,'b').replace(/♯/g,'#').replace(/Δ|\^/g,'maj');
  s=s.replace(/^ø7?$/,'m7b5').replace(/°7/,'dim7').replace(/°/,'dim').replace(/^o7$/,'dim7').replace(/^o$/,'dim');
  s=s.replace(/^-7b5$/,'m7b5').replace(/^min/,'m').replace(/^mi(?!x)/,'m').replace(/^-/,'m');
  s=s.replace(/^mM7|^mMaj7|^mmaj7|^mΔ7/,'mmaj7').replace(/^mM9|^mmaj9/,'mmaj9');
  s=s.replace(/^Maj/,'maj').replace(/^M(?=\d)/,'maj').replace(/^ma(?=\d)/,'maj').replace(/^maj(?=$)/,'');
  if(s==='M') s='';
  s=s.replace(/^\+$/,'aug').replace(/^\+7$|^7\+5?$|^7aug$/,'aug7');
  s=s.replace(/^sus$/,'sus4').replace(/^7sus$/,'7sus4').replace(/^6\/9$/,'69').replace(/^alt$/,'7alt').replace(/^add9$/,'add9');
  if(s==='maj') s='';
  if(s==='aug7') return 'aug7';
  return s;
}
export function pcOf(letter,acc){
  let p=LETTER[letter.toUpperCase()];
  if(acc==='#'||acc==='♯') p++; else if(acc==='b'||acc==='♭') p--;
  return (p+12)%12;
}
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

/* Chord-scale compatibility */
export function tag(iv){
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
export function rules(iv){
  const tags=tag(iv), f=new Set();
  for(const [t,d,hasThird] of tags){
    if(d==='third') f.add(t===3?4:3);
    if(d==='ninth'){ if(t===2){f.add(1); if(hasThird) f.add(3);} else f.add(2); }
    if(d==='eleventh') f.add(t===5?6:5);
    if(d==='thirteenth') f.add(t===9?8:9);
    if(d==='fifth'&&(t===6||t===8)) f.add(7);
    if(d==='seventh'){ if(t===10) f.add(11); else if(t===11) f.add(10); else f.add(10); }
  }
  iv.forEach(t=>f.delete(t));
  const core=tags.filter(([,d])=>['root','third','sus','fifth'].includes(d)).map(x=>x[0]);
  return {forbid:f, core, all:iv};
}
export function compatible(scale,r){
  const set=new Set(scale.iv);
  for(const x of r.forbid) if(set.has(x)) return false;
  const need=scale.iv.length<=6?r.core:r.all;
  return need.every(x=>set.has(x));
}
export function isDominantish(iv){return iv.includes(4)&&iv.includes(7)&&iv.includes(10);}

export function suggest(chord,key){
  const r=rules(chord.iv), out=[];
  const keySet=new Set((key.mode==='major'?MAJ:MIN).map(x=>(x+key.t)%12));
  const harm=new Set([0,2,3,5,7,8,11].map(x=>(x+key.t)%12));
  for(const s of SCALES){
    let extra=false;
    if(!compatible(s,r)){
      if((s.id==='minpent'||s.id==='blues'||s.id==='majblues')&&isDominantish(chord.iv)) extra=true; else continue;
    }
    const abs=s.iv.map(x=>(x+chord.root)%12);
    const inKey=!extra&&abs.every(p=>keySet.has(p));
    const inHarm=!extra&&!inKey&&key.mode==='minor'&&abs.every(p=>harm.has(p));
    let score=s.c+(inKey?12:0)+(inHarm?10:0)+(inKey&&s.iv.length===7?2:0)+(extra?-1:0);
    out.push({s,abs,inKey,inHarm,extra,score});
  }
  out.sort((a,b)=>b.score-a.score||b.s.c-a.s.c);
  return out.slice(0,7);
}

/* Key detection */
export function detectKey(chords){
  let best=null;
  for(let t=0;t<12;t++) for(const mode of ['major','minor']){
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
export function keyFlats(k){return k.mode==='major'?FLAT_MAJ.has(k.t):FLAT_MIN.has(k.t);}
export function keyName(k){return (keyFlats(k)?FLAT:SHARP)[k.t]+' '+k.mode;}
export function spell(pc,flats){return (flats?FLAT:SHARP)[((pc%12)+12)%12];}
export function chordFlats(c,k){ if(c.acc==='b'||c.acc==='♭') return true; if(c.acc==='#'||c.acc==='♯') return false; return keyFlats(k); }
export function ivLabel(s,set){
  switch(s){case 0:return '1';case 1:return 'b2';case 2:return '2';case 3:return set.has(4)?'#2':'b3';
  case 4:return '3';case 5:return '4';case 6:return set.has(5)?'b5':'#4';case 7:return '5';
  case 8:return set.has(7)?'b6':'#5';case 9:return '6';case 10:return 'b7';default:return '7';}
}
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Fretboard */
export const TUNING=[4,11,7,2,9,4]; // high E to low E (6-string guitar, standard tuning)
export const STRING_WIDTHS=[1,1.3,1.7,2.1,2.6,3.1];

// Fretboard "positions" (boxes): for a given scale/root/tuning, each unique
// scale degree anchors one position wherever it lands on the lowest string,
// numbered by ascending fret (not by scale-degree order) - this is what
// produces the standard, universally recognized box shapes, e.g. position 3
// of A minor pentatonic is the classic root-anchored box at fret 5. `deg` is
// the interval that anchors this position, needed to build its actual notes
// (see positionFrets below).
export function getPositions(scaleIv,root,tuning){
  const lowPc=tuning[tuning.length-1];
  const degreeSeq=[...new Set(scaleIv)].sort((a,b)=>a-b);
  const starts=degreeSeq.map(interval=>({deg:interval,s:((root+interval-lowPc)%12+12)%12})).sort((a,b)=>a.s-b.s);
  return starts.map(({deg,s},i)=>({n:i+1,deg,s,e:i<starts.length-1?starts[i+1].s:starts[0].s+12}));
}

// Real guitar pedagogy uses two different conventions for "a position,"
// not one, depending on how dense the scale is:
//
//  - Pentatonic/hexatonic scales (CAGED-style boxes): each string gets its
//    OWN local range, which can genuinely differ from its neighbors - e.g.
//    in A minor pentatonic position 3, the outer strings span frets 5-8
//    but the inner strings only reach 5-7, because the B string is tuned a
//    major 3rd (not a perfect 4th) from G. That per-string "jog" is a
//    documented, deliberate feature of the real box system, not a flaw.
//  - 7-note-and-denser scales (the Berklee/Leavitt position system): one
//    UNIFORM fret window, identical on every string - one hand position,
//    one finger per fret, consistent across strings. Leavitt's "A Modern
//    Method for Guitar" explicitly trades a wider stretch (occasionally
//    over 5 frets) for never having to shift the hand mid-shape.
//
// Forcing both scale families through the same algorithm is what caused
// real bugs in each direction: a uniform window breaks the pentatonic
// boxes' per-string jog, while reusing the box model's per-string ranges
// for a 7-note scale can walk one string much farther than necessary when
// a closer occurrence of the same degree was available on another string
// nearby (observed on A Ionian position 3, which reached to fret 9 on the
// B string for no reason, when every degree - including the position's
// own anchor, G# - was already reachable by fret 7).
//
// Returns one Set<fret> per string (indexed like `tuning`) for the given
// position index.
export function positionFrets(positions,idx,scaleIv,root,tuning,midi=openMidi(tuning)){
  const D=new Set(scaleIv).size;
  const sets=D<=6?boxFrets(positions,idx,scaleIv,root,tuning):windowFrets(positions,idx,scaleIv,root,tuning);
  return fillPitchGaps(sets,scaleIv,root,midi);
}

// Open-string MIDI notes, derived assuming each lower string sits below the
// one above it (true for guitar). Re-entrant tunings (ukulele) must pass
// their own `midi`.
export function openMidi(tuning){
  const m=[64];
  for(let j=1;j<tuning.length;j++) m.push(m[j-1]-(((tuning[j-1]-tuning[j])%12+12)%12||12));
  return m;
}

// A position must read as an unbroken run: every scale pitch between its
// lowest and highest displayed note has to be shown somewhere. A uniform
// fret window can't guarantee that (a pitch may only be reachable on the
// next string 1-2 frets outside the window), so such pitches are added at
// the nearest fret outside the window - the "stretch" notes real positions
// use (Leavitt) rather than silently skipping them.
function fillPitchGaps(sets,scaleIv,root,midi,maxFret=19){
  const out=sets.map(s=>new Set(s));
  const have=new Set(); out.forEach((s,j)=>s.forEach(f=>have.add(midi[j]+f)));
  const lo=Math.min(...have), hi=Math.max(...have);
  const all=[...out.flatMap(s=>[...s])];
  const wlo=Math.min(...all), whi=Math.max(...all);
  for(let m=lo;m<=hi;m++){
    if(have.has(m)||!scaleIv.includes(((m-root)%12+12)%12)) continue;
    let best=null,bestD=Infinity;
    midi.forEach((open,j)=>{
      const f=m-open;
      if(f<0||f>maxFret) return;
      const d=f<wlo?wlo-f:f>whi?f-whi:0;
      if(d<bestD){bestD=d;best=[j,f];}
    });
    if(best) out[best[0]].add(best[1]);
  }
  return out;
}

const fretHasDegree=(fret,scaleIv,root,pc)=>scaleIv.includes(((pc+fret-root)%12+12)%12);

// Pentatonic/hexatonic box model: each position's nominal [s,e] (from
// getPositions) applied per string, plus - at each boundary where a
// string has no note exactly on the boundary fret - the nearest note
// within 1 fret joins as the shared "connector tone" with whichever
// position is on the other side of that boundary. A final completeness
// pass (nearest occurrence to the position's own center) covers any
// degree a denser hexatonic scale leaves out entirely, which can happen
// right at the neck's open-position edge.
function boxFrets(positions,idx,scaleIv,root,tuning,maxFret=20){
  const K=positions.length;
  const boundaries=positions.map(p=>p.s).concat([positions[K-1].e]);
  const reach=1;
  const notesByString=tuning.map(pc=>{
    const notes=[];
    for(let f=0;f<=maxFret;f++) if(fretHasDegree(f,scaleIv,root,pc)) notes.push(f);
    return notes;
  });
  const base=positions.map(p=>notesByString.map(notes=>new Set(notes.filter(f=>f>=p.s&&f<=p.e))));
  boundaries.forEach((b,bi)=>{
    const owners=bi===0?[0]:bi===K?[K-1]:[bi-1,bi];
    notesByString.forEach((notes,s)=>{
      if(notes.includes(b)) return;
      let best=null,bestD=Infinity;
      notes.forEach(f=>{ const d=Math.abs(f-b); if(d<bestD&&d<=reach){bestD=d;best=f;} });
      if(best!==null) owners.forEach(o=>base[o][s].add(best));
    });
  });
  notesByString.forEach((notes,s)=>{
    const snapshot=base.map(posSets=>[...posSets[s]]);
    const rescued=[];
    notes.forEach(f=>{
      if(base.some(posSets=>posSets[s].has(f))) return;
      let best=-1,bestD=Infinity;
      snapshot.forEach((arr,i)=>arr.forEach(g=>{ const d=Math.abs(f-g); if(d<bestD){bestD=d;best=i;} }));
      if(best>=0&&bestD<=reach) rescued.push([best,f]);
    });
    rescued.forEach(([i,f])=>base[i][s].add(f));
  });
  const uniqueDegrees=[...new Set(scaleIv)];
  positions.forEach((p,i)=>{
    const center=(p.s+p.e)/2;
    uniqueDegrees.forEach(deg=>{
      const present=base[i].some((set,s)=>[...set].some(f=>((tuning[s]+f-root)%12+12)%12===deg));
      if(present) return;
      let bestF=null,bestD=Infinity,bestS=-1;
      notesByString.forEach((notes,s)=>notes.forEach(f=>{
        if(((tuning[s]+f-root)%12+12)%12!==deg) return;
        const d=Math.abs(f-center);
        if(d<bestD){bestD=d;bestF=f;bestS=s;}
      }));
      if(bestF!==null) base[i][bestS].add(bestF);
    });
  });
  return base[idx];
}

// 7-note-and-denser scale model: one uniform [lo,hi] fret window, the
// same on every string, starting at the position's own anchor fret and
// defaulting to a standard 4-fret, one-finger-per-fret hand position.
// Only grows past that default (forward) if some degree genuinely has no
// occurrence within it yet - completeness always wins over width, but
// width is never sacrificed first the way a rigid fixed-notes-per-string
// walk would (reaching for a far occurrence of a degree instead of using
// an already-close one on another string).
function windowFrets(positions,idx,scaleIv,root,tuning,defaultWidth=4,maxFret=28){
  const uniqueDegrees=[...new Set(scaleIv)];
  const anchor=positions[idx].s;
  let lo=anchor,hi=anchor+defaultWidth-1;
  const covered=()=>{
    const present=new Set();
    for(let f=lo;f<=hi;f++) tuning.forEach(pc=>{ const rel=((pc+f-root)%12+12)%12; if(scaleIv.includes(rel)) present.add(rel); });
    return uniqueDegrees.every(d=>present.has(d));
  };
  // A fret with no scale tone on any string doesn't count toward the hand
  // span - otherwise a window whose top fret happens to be empty collapses
  // to a 2-fret shape with too few notes per string.
  const topUsed=()=>tuning.some(pc=>fretHasDegree(hi,scaleIv,root,pc));
  while((!covered()||!topUsed())&&hi<maxFret) hi++;
  return tuning.map(pc=>{
    const set=new Set();
    for(let f=lo;f<=hi;f++) if(fretHasDegree(f,scaleIv,root,pc)) set.add(f);
    return set;
  });
}

// Chord "builder" features, derived from a chord's intervals (so any chord
// added to CHORDS is picked up automatically). Pick-one groups: third,
// seventh. The rest are independent on/off flags.
export const FEATURE_GROUPS=[
  {id:'third',label:'Third',radio:true,items:[['major','Major'],['minor','Minor'],['sus2','sus2'],['sus4','sus4'],['power','No 3rd']]},
  {id:'seventh',label:'Seventh',radio:true,items:[['6','6'],['7','7'],['maj7','maj7'],['dim7','dim7']]},
  {id:'fifth',label:'Fifth',items:[['b5','\u266d5'],['#5','\u266f5']]},
  {id:'ext',label:'Extensions',items:[['add9','add9'],['9','9'],['11','11'],['13','13']]},
  {id:'alt',label:'Alterations',items:[['b9','\u266d9'],['#9','\u266f9'],['#11','\u266f11'],['b13','\u266d13']]},
];
export function chordFeatures(iv){
  const h=new Set(iv.map(x=>x%12)), f=new Set();
  const major=h.has(4), minor=h.has(3)&&!major;
  const third=major?'major':minor?'minor':h.has(2)&&!h.has(5)?'sus2':h.has(5)?'sus4':'power';
  f.add(third);
  const b5=h.has(6)&&!h.has(7), s5=h.has(8)&&!h.has(7);
  if(b5) f.add('b5'); if(s5) f.add('#5');
  const dim7=minor&&b5&&h.has(9)&&!h.has(10)&&!h.has(11);
  const seventh=h.has(11)?'maj7':h.has(10)?'7':dim7?'dim7':null;
  if(seventh) f.add(seventh);
  if(h.has(9)&&!seventh&&!dim7) f.add('6');
  if(h.has(9)&&seventh&&!dim7) f.add('13');
  if(h.has(2)&&third!=='sus2') f.add(!seventh&&!h.has(9)&&(major||minor)?'add9':'9');
  if(h.has(5)&&(major||minor)) f.add('11');
  if(h.has(6)&&h.has(7)) f.add('#11');
  if(h.has(1)) f.add('b9');
  if(h.has(3)&&major) f.add('#9');
  if(h.has(8)&&h.has(7)) f.add('b13');
  return f;
}

export function board(chord,sug,mode,flats,opts={}){
  const tuning=opts.tuning||TUNING, sw=opts.stringWidths||STRING_WIDTHS;
  const FRETS=15;
  const strings=tuning.length, center=(strings-1)/2;
  const FW=56,NUT=44,TOP=opts.showPositions?34:26,GAP=30;
  const W=NUT+FRETS*FW+14,H=TOP+(strings-1)*GAP+52;
  const scaleSet=new Set(sug.s.iv), chordSet=new Set(chord.iv);
  const dim=opts.dimRange; // {s,e} - the selected position, for the divider/badge overlay
  const brightSets=opts.brightSets; // per-string Set<fret> - frets outside are shown dimmed, not hidden
  let g=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fretboard showing ${esc(sug.s.name)} over ${esc(chord.name)}">`;
  const bTop=TOP-16,bBot=TOP+(strings-1)*GAP+16;
  g+=`<rect x="${NUT}" y="${bTop}" width="${FRETS*FW}" height="${bBot-bTop}" fill="#4A2B1F"/>`;
  [3,5,7,9,15].forEach(f=>g+=`<circle cx="${NUT+(f-0.5)*FW}" cy="${TOP+center*GAP}" r="6" fill="#7A5A48"/>`);
  g+=`<circle cx="${NUT+11.5*FW}" cy="${TOP+(center-1)*GAP}" r="6" fill="#7A5A48"/><circle cx="${NUT+11.5*FW}" cy="${TOP+(center+1)*GAP}" r="6" fill="#7A5A48"/>`;
  for(let f=1;f<=FRETS;f++) g+=`<line x1="${NUT+f*FW}" y1="${bTop}" x2="${NUT+f*FW}" y2="${bBot}" stroke="#B9BEC2" stroke-width="2.5"/>`;
  g+=`<rect x="${NUT-4}" y="${bTop}" width="6" height="${bBot-bTop}" fill="#E8E0CC"/>`;
  for(let s=0;s<strings;s++) g+=`<line x1="${NUT-30}" y1="${TOP+s*GAP}" x2="${NUT+FRETS*FW}" y2="${TOP+s*GAP}" stroke="#D8C9A0" stroke-width="${sw[s]||1.5}"/>`;
  for(let f=1;f<=FRETS;f++) g+=`<text x="${NUT+(f-0.5)*FW}" y="${bBot+20}" text-anchor="middle" font-size="11" fill="#C9B8A3" font-family="inherit">${f}</text>`;
  // Position-zone map: a guide overlay showing where each of the 5 hand
  // positions falls. Drawn whenever requested, independent of whether one
  // position is currently selected (dimRange handles that separately).
  if(opts.showPositions && opts.positions){
    opts.positions.forEach((p,i)=>{
      if(i>0){
        g+=`<line x1="${NUT+p.s*FW}" y1="${bTop-6}" x2="${NUT+p.s*FW}" y2="${bBot+6}" stroke="#C9B8A3" stroke-width="1" stroke-dasharray="2,3"/>`;
      }
      const cx=NUT+(p.s+p.e)/2*FW;
      const active=dim&&p.s===dim.s&&p.e===dim.e;
      g+=`<circle cx="${cx}" cy="${bTop-10}" r="8" fill="${active?'#C23B2E':'#2A170F'}"/><text x="${cx}" y="${bTop-6}" text-anchor="middle" font-size="10" font-weight="700" fill="#F5EBDD" font-family="inherit">${p.n}</text>`;
    });
  }
  // A chord voicing (opts.voicing = {f,g,b}: absolute frets per string in
  // tuning order, -1 muted; finger numbers; optional barre {fret,from,to}):
  // everything but its own dots is dimmed, muted strings get an X, a barre
  // is drawn as a bar behind the dots.
  // opts.voicingRing marks a voicing over the board WITHOUT dimming anything
  // (used where a scale position is already shown): rings + barre + X only.
  const ring=opts.voicingRing, vo=opts.voicing||ring;
  const bright=opts.voicing?opts.voicing.f.map(f=>new Set(f>=0?[f]:[])):brightSets;
  if(vo){
    if(vo.b&&vo.b.fret<=FRETS){
      const bx=NUT+(vo.b.fret-0.5)*FW;
      g+=`<rect x="${bx-14}" y="${TOP+vo.b.from*GAP-14}" width="28" height="${(vo.b.to-vo.b.from)*GAP+28}" rx="14" fill="#E3A21A" fill-opacity="0.35" stroke="#E3A21A" stroke-width="1.5"/>`;
    }
    vo.f.forEach((f,s)=>{ if(f<0) g+=`<text x="${NUT-20}" y="${TOP+s*GAP+5}" text-anchor="middle" font-size="15" font-weight="700" fill="#E3A21A" font-family="inherit">\u2715</text>`; });
  }
  for(let s=0;s<strings;s++) for(let f=0;f<=FRETS;f++){
    const pc=(tuning[s]+f)%12, rel=(pc-chord.root+12)%12;
    const inVoicing=opts.voicing&&opts.voicing.f[s]===f;
    if(!scaleSet.has(rel)&&!inVoicing) continue;
    const x=f===0?NUT-20:NUT+(f-0.5)*FW, y=TOP+s*GAP;
    const isRoot=rel===0, isChord=chordSet.has(rel);
    const fill=isRoot?'#C23B2E':isChord?'#E3A21A':'#EDE6D6', tc=isRoot?'#FFFFFF':isChord?'#2A1A00':'#2A1E16';
    let label=mode==='notes'?spell(pc,flats):ivLabel(rel,scaleSet.has(rel)?scaleSet:new Set([...scaleSet,rel]));
    if(inVoicing&&opts.fingerLabels) label=vo.g[s]>0?String(vo.g[s]):spell(pc,flats);
    const outside=bright?!bright[s].has(f):(dim&&(f<dim.s||f>dim.e));
    const op=outside?' opacity="0.25"':'';
    g+=`<circle cx="${x}" cy="${y}" r="12.5" fill="${fill}" stroke="#2A170F" stroke-width="1"${op}/>`;
    g+=`<text x="${x}" y="${y+4}" text-anchor="middle" font-size="${label.length>2?10:11.5}" font-weight="600" fill="${tc}" font-family="inherit"${op}>${esc(label)}</text>`;
  }
  if(ring) ring.f.forEach((f,s)=>{ if(f>=0&&f<=FRETS) g+=`<circle cx="${f===0?NUT-20:NUT+(f-0.5)*FW}" cy="${TOP+s*GAP}" r="17" fill="none" stroke="#fff" stroke-width="3"/>`; });
  return g+'</svg>';
}

/* Audio */
let ac=null;
export function note(freq,t,dur,vol){
  const o=ac.createOscillator(),g=ac.createGain(),f=ac.createBiquadFilter();
  o.type='triangle';o.frequency.value=freq;f.type='lowpass';f.frequency.value=2400;
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+0.012);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(f);f.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+dur+0.05);
}
export const mtof=m=>440*Math.pow(2,(m-69)/12);
// The shared AudioContext (created on first use, from a user gesture).
export function audioContext(){
  try{ ac=ac||new (window.AudioContext||window.webkitAudioContext)(); ac.resume(); }catch(e){ return null; }
  return ac;
}
// MIDI notes of a plain (non-fretted) voicing of the chord, low to high.
export function chordMidiNotes(chord,offset=0){
  const base=40+offset+((chord.root-4+12)%12);
  return [...new Set(chord.iv)].map(x=>base+(x>0&&x<3?x+12:x)).sort((a,b)=>a-b);
}
export function play(chord,scale,offset=0,run=null,chordMidi=null){
  if(!audioContext()) return;
  const base=40+offset+((chord.root-4+12)%12); let t=ac.currentTime+0.05;
  // chordMidi: the real fretted notes of a chosen voicing (low string first)
  const voicing=chordMidi?[...chordMidi].sort((a,b)=>a-b):chordMidiNotes(chord,offset);
  voicing.forEach((m,i)=>note(mtof(m),t+i*0.03,1.8,0.11));
  t+=1.3;
  // `run`: optional explicit list of MIDI notes (the actual fretted notes of
  // a selected position). Falls back to the abstract scale run when absent.
  const seq=run?[...new Set(run)].sort((a,b)=>a-b):[...scale.iv].sort((a,b)=>a-b).map(x=>base+12+x).concat([base+24]);
  const step=seq.length>16?0.15:0.2;
  seq.forEach((m,i)=>note(mtof(m),t+i*step,0.45,0.15));
}

/* Roman-numeral progressions: a degree token (e.g. 'I', 'ii7', 'bVII',
   'V7', 'i', '#ivdim') resolves to a real chord name for a given key,
   reusing the existing CHORDS table for every quality. */
const DEGREE_SEMITONES={I:0,II:2,III:4,IV:5,V:7,VI:9,VII:11};
export function chordFromDegree(token,key){
  const m=token.match(/^([b#]?)([IV]+)(.*)$/i);
  if(!m) return null;
  const [,acc,roman,rest]=m;
  const upper=roman.toUpperCase();
  if(!(upper in DEGREE_SEMITONES)) return null;
  let semis=DEGREE_SEMITONES[upper];
  if(acc==='b') semis--; else if(acc==='#') semis++;
  const isLower=roman===roman.toLowerCase();
  let suffix;
  if(!rest) suffix=isLower?'m':'';
  else if(isLower&&/^\d+$/.test(rest)) suffix='m'+rest; // e.g. 'ii7' -> minor 7th, not dominant
  else suffix=rest;
  suffix=suffix.replace(/ø7?/g,'m7b5').replace(/°/g,'dim');
  const pc=(key.t+semis+12)%12, flats=keyFlats(key);
  return spell(pc,flats)+suffix;
}
export function progressionText(template,key){
  return template.degrees.map(d=>chordFromDegree(d,key)).join(' ');
}
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
