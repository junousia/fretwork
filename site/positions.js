/* Scale positions on a fretboard (CAGED-style boxes for pentatonic/hexatonic scales,
   uniform one-finger-per-fret windows for seven-note scales), always an unbroken run
   by pitch. See AGENTS.md for why there are two models. */

/** @typedef {import('./types.js').Position} Position */
/** @typedef {import('./types.js').FretSets} FretSets */

// Fretboard "positions" (boxes): for a given scale/root/tuning, each unique
// scale degree anchors one position wherever it lands on the lowest string,
// numbered by ascending fret (not by scale-degree order) - this is what
// produces the standard, universally recognized box shapes, e.g. position 3
// of A minor pentatonic is the classic root-anchored box at fret 5. `deg` is
// the interval that anchors this position, needed to build its actual notes
// (see positionFrets below).
/** @param {number[]} scaleIv @param {number} root @param {number[]} tuning pitch classes, top string first @returns {Position[]} */
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
/** The notes of one position: a Set of frets per string. @param {Position[]} positions @param {number} idx 0-based position @param {number[]} scaleIv @param {number} root @param {number[]} tuning @param {number[]} [midi] open-string MIDI notes (re-entrant tunings must pass them) @returns {FretSets} */
export function positionFrets(positions,idx,scaleIv,root,tuning,midi=openMidi(tuning)){
  const D=new Set(scaleIv).size;
  const sets=D<=6?boxFrets(positions,idx,scaleIv,root,tuning):windowFrets(positions,idx,scaleIv,root,tuning);
  return fillPitchGaps(sets,scaleIv,root,midi);
}

// Open-string MIDI notes, derived assuming each lower string sits below the
// one above it (true for guitar). Re-entrant tunings (ukulele) must pass
// their own `midi`.
/** Open-string MIDI notes assuming each lower string sits below the one above. @param {number[]} tuning @returns {number[]} */
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
/** @param {FretSets} sets @param {number[]} scaleIv @param {number} root @param {number[]} midi @param {number} [maxFret] @returns {FretSets} */
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

/** @type {(fret:number, scaleIv:number[], root:number, pc:number) => boolean} */
const fretHasDegree=(fret,scaleIv,root,pc)=>scaleIv.includes(((pc+fret-root)%12+12)%12);

// Pentatonic/hexatonic box model: each position's nominal [s,e] (from
// getPositions) applied per string, plus - at each boundary where a
// string has no note exactly on the boundary fret - the nearest note
// within 1 fret joins as the shared "connector tone" with whichever
// position is on the other side of that boundary. A final completeness
// pass (nearest occurrence to the position's own center) covers any
// degree a denser hexatonic scale leaves out entirely, which can happen
// right at the neck's open-position edge.
/** @param {Position[]} positions @param {number} idx @param {number[]} scaleIv @param {number} root @param {number[]} tuning @param {number} [maxFret] @returns {FretSets} */
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
      /** @type {number|null} */
      let best=null,bestD=Infinity;
      notes.forEach(f=>{ const d=Math.abs(f-b); if(d<bestD&&d<=reach){bestD=d;best=f;} });
      if(best!==null) owners.forEach(o=>base[o][s].add(/** @type {number} */ (best)));
    });
  });
  notesByString.forEach((notes,s)=>{
    const snapshot=base.map(posSets=>[...posSets[s]]);
    /** @type {[number, number][]} */
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
/** @param {Position[]} positions @param {number} idx @param {number[]} scaleIv @param {number} root @param {number[]} tuning @param {number} [defaultWidth] @param {number} [maxFret] @returns {FretSets} */
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

