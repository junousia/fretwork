/* Web Audio: the shared context, single notes, and playing a chord + scale run. */

/** @type {AudioContext|null} */
let ac=null;
/** @type {((freq:number, t:number, dur:number, vol:number, fx?:object) => boolean)|null} */
let engine=null;
/** Route every note through another sound engine (sound.js); null goes back to the simple synth. @param {typeof engine} fn */
export function setNoteEngine(fn){ engine=fn; }
/** Play one note with the current sound. Same arguments as simpleNote. @param {number} freq Hz @param {number} t start time (context clock) @param {number} dur seconds @param {number} vol 0-1 @param {{bend?:number, vib?:boolean, slideTo?:number, slideStart?:number, slideEnd?:number}} [fx] */
export function note(freq,t,dur,vol,fx){
  if(engine){ try{ if(engine(freq,t,dur,vol,fx)!==false) return; }catch(e){ /* fall back to the simple synth */ } }
  simpleNote(freq,t,dur,vol,fx);
}
/**
 * Play one note on the shared context. `fx` adds guitar techniques: a bend (up `bend` semitones early in the note),
 * vibrato, and a slide (the pitch glides to `slideTo` Hz between `slideStart` and `slideEnd` seconds after the start).
 * @param {number} freq Hz @param {number} t start time (context clock) @param {number} dur seconds @param {number} vol 0-1
 * @param {{bend?:number, vib?:boolean, slideTo?:number, slideStart?:number, slideEnd?:number}} [fx]
 */
export function simpleNote(freq,t,dur,vol,fx){
  if(!ac) return;
  const o=ac.createOscillator(),g=ac.createGain(),f=ac.createBiquadFilter();
  o.type='triangle';o.frequency.value=freq;f.type='lowpass';f.frequency.value=2400;
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+0.012);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  if(fx){
    if(fx.bend){ // up to pitch quickly, then hold
      o.frequency.setValueAtTime(freq,t+0.03);
      o.frequency.exponentialRampToValueAtTime(freq*Math.pow(2,fx.bend/12),t+Math.min(dur*0.45,0.3));
    }
    if(fx.slideTo&&fx.slideEnd!==undefined){
      o.frequency.setValueAtTime(freq,t+(fx.slideStart||0));
      o.frequency.exponentialRampToValueAtTime(fx.slideTo,t+fx.slideEnd);
    }
    if(fx.vib&&dur>0.3){ // a slow wobble that fades in after the note has settled
      const lfo=ac.createOscillator(),lg=ac.createGain();
      lfo.frequency.value=5.5; lg.gain.setValueAtTime(0,t); lg.gain.setValueAtTime(0,t+dur*0.35); lg.gain.linearRampToValueAtTime(28,t+dur*0.6);
      lfo.connect(lg); lg.connect(o.detune); lfo.start(t); lfo.stop(t+dur+0.05);
    }
  }
  o.connect(f);f.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+dur+0.05);
}
/** MIDI note number to frequency. @type {(m:number) => number} */
export const mtof=m=>440*Math.pow(2,(m-69)/12);
// The shared AudioContext (created on first use, from a user gesture).
/** @returns {AudioContext|null} */
export function audioContext(){
  try{ ac=ac||new (window.AudioContext||/** @type {any} */ (window).webkitAudioContext)(); ac.resume(); }catch(e){ return null; }
  return ac;
}
// MIDI notes of a plain (non-fretted) voicing of the chord, low to high.
/** @param {{root:number, iv:number[]}} chord @param {number} [offset] @returns {number[]} */
export function chordMidiNotes(chord,offset=0){
  const base=40+offset+((chord.root-4+12)%12);
  return [...new Set(chord.iv)].map(x=>base+(x>0&&x<3?x+12:x)).sort((a,b)=>a-b);
}
/** Strum a chord then play a run. @param {{root:number, iv:number[]}} chord @param {{iv:number[]}} scale @param {number} [offset] register offset in semitones @param {number[]|null} [run] explicit MIDI run (else the scale) @param {number[]|null} [chordMidi] explicit MIDI notes of a voicing @param {number} [scaleRoot] pitch class the scale starts on (default: the chord root) */
export function play(chord,scale,offset=0,run=null,chordMidi=null,scaleRoot=chord.root){
  const ctx=audioContext();
  if(!ctx) return;
  const base=40+offset+((scaleRoot-4+12)%12); let t=ctx.currentTime+0.05;
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
