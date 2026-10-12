import { TUNING, STRING_WIDTHS } from './theory.js';

const STORE_KEY = 'gtr-instrument';

// Ukulele standard tuning (soprano/concert), re-entrant GCEA, written here as
// pitch classes in the same "top string first" visual order board() expects
// (the TUNING array's index 0 is the string drawn on top). Re-entrant tuning
// means the G string is NOT the lowest-pitched string, but that only matters
// for absolute octave/audio playback, not for the pitch-class math board()
// does - so it doesn't need special-casing here.
export const INSTRUMENTS = {
  guitar:  { id:'guitar',  name:'Guitar',  tuning: TUNING, stringWidths: STRING_WIDTHS, audioOffset: 0 },
  ukulele: { id:'ukulele', name:'Ukulele', tuning: [9,4,0,7], stringWidths: [1.4,1.7,2.0,2.3], audioOffset: 12 }
};

let current = 'guitar';
try{
  const saved = localStorage.getItem(STORE_KEY);
  if(INSTRUMENTS[saved]) current = saved;
}catch(e){}

const listeners = new Set();

export function getInstrument(){ return INSTRUMENTS[current]; }
export function getInstrumentId(){ return current; }
export function setInstrument(id){
  if(!INSTRUMENTS[id] || id === current) return;
  current = id;
  try{ localStorage.setItem(STORE_KEY, id); }catch(e){}
  listeners.forEach(cb => cb(INSTRUMENTS[id]));
}
export function onInstrumentChange(cb){
  listeners.add(cb);
  return () => listeners.delete(cb);
}
