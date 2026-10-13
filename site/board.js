/* The fretboard SVG: scale/chord notes, positions, fingerings, capo, left-handed mirror. */

import { STRING_WIDTHS, TUNING, esc, ivLabel, spell } from './music.js';

/** @typedef {import('./types.js').BoardOptions} BoardOptions */

/** The fretboard SVG as a string. @param {{root:number, iv:number[], name:string}} chord colours are relative to its root @param {{s:{iv:number[], name:string}}} sug the scale (or chord tones) whose notes are drawn @param {string} mode "notes" or "intervals" labels @param {boolean} flats spell with flats @param {BoardOptions} [opts] @returns {string} */
export function board(chord,sug,mode,flats,opts={}){
  const tuning=opts.tuning||TUNING, sw=opts.stringWidths||STRING_WIDTHS;
  const FRETS=15;
  const strings=tuning.length, center=(strings-1)/2;
  const FW=56,NUT=44,TOP=opts.showPositions?34:26,GAP=30;
  const W=NUT+FRETS*FW+14,H=TOP+(strings-1)*GAP+52;
  // Left-handed: the whole neck is mirrored (nut on the right). X maps an x
  // coordinate, R maps a rect's left edge given its width. Text stays upright.
  const lh=!!opts.leftHanded;
  /** @param {number} x */
  const X=x=>lh?W-x:x;
  /** @param {number} x @param {number} w */
  const R=(x,w)=>lh?W-x-w:x;
  const scaleSet=new Set(sug.s.iv), chordSet=new Set(chord.iv);
  const dim=opts.dimRange; // {s,e} - the selected position, for the divider/badge overlay
  const brightSets=opts.brightSets; // per-string Set<fret> - frets outside are shown dimmed, not hidden
  let g=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fretboard showing ${esc(sug.s.name)} over ${esc(chord.name)}">`;
  const bTop=TOP-16,bBot=TOP+(strings-1)*GAP+16;
  g+=`<rect x="${R(NUT,FRETS*FW)}" y="${bTop}" width="${FRETS*FW}" height="${bBot-bTop}" fill="#4A2B1F"/>`;
  [3,5,7,9,15].forEach(f=>g+=`<circle cx="${X(NUT+(f-0.5)*FW)}" cy="${TOP+center*GAP}" r="6" fill="#7A5A48"/>`);
  g+=`<circle cx="${X(NUT+11.5*FW)}" cy="${TOP+(center-1)*GAP}" r="6" fill="#7A5A48"/><circle cx="${X(NUT+11.5*FW)}" cy="${TOP+(center+1)*GAP}" r="6" fill="#7A5A48"/>`;
  for(let f=1;f<=FRETS;f++) g+=`<line x1="${X(NUT+f*FW)}" y1="${bTop}" x2="${X(NUT+f*FW)}" y2="${bBot}" stroke="#B9BEC2" stroke-width="2.5"/>`;
  // a capo replaces the nut; fret numbers are then counted from the capo
  g+=opts.capo?`<rect x="${R(NUT-6,10)}" y="${bTop-4}" width="10" height="${bBot-bTop+8}" rx="4" fill="#C23B2E"><title>Capo</title></rect>`:`<rect x="${R(NUT-4,6)}" y="${bTop}" width="6" height="${bBot-bTop}" fill="#E8E0CC"/>`;
  for(let s=0;s<strings;s++) g+=`<line x1="${X(NUT-30)}" y1="${TOP+s*GAP}" x2="${X(NUT+FRETS*FW)}" y2="${TOP+s*GAP}" stroke="#D8C9A0" stroke-width="${sw[s]||1.5}"/>`;
  for(let f=1;f<=FRETS;f++) g+=`<text x="${X(NUT+(f-0.5)*FW)}" y="${bBot+20}" text-anchor="middle" font-size="11" fill="#C9B8A3" font-family="inherit">${f}</text>`;
  // Position-zone map: a guide overlay showing where each of the 5 hand
  // positions falls. Drawn whenever requested, independent of whether one
  // position is currently selected (dimRange handles that separately).
  if(opts.showPositions && opts.positions){
    opts.positions.forEach((p,i)=>{
      if(i>0){
        g+=`<line x1="${X(NUT+p.s*FW)}" y1="${bTop-6}" x2="${X(NUT+p.s*FW)}" y2="${bBot+6}" stroke="#C9B8A3" stroke-width="1" stroke-dasharray="2,3"/>`;
      }
      const cx=X(NUT+(p.s+p.e)/2*FW);
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
      g+=`<rect x="${R(bx-14,28)}" y="${TOP+vo.b.from*GAP-14}" width="28" height="${(vo.b.to-vo.b.from)*GAP+28}" rx="14" fill="#E3A21A" fill-opacity="0.35" stroke="#E3A21A" stroke-width="1.5"/>`;
    }
    vo.f.forEach((f,s)=>{ if(f<0) g+=`<text x="${X(NUT-20)}" y="${TOP+s*GAP+5}" text-anchor="middle" font-size="15" font-weight="700" fill="#E3A21A" font-family="inherit">\u2715</text>`; });
  }
  for(let s=0;s<strings;s++) for(let f=0;f<=FRETS;f++){
    const pc=(tuning[s]+f)%12, rel=(pc-chord.root+12)%12;
    const inVoicing=opts.voicing&&opts.voicing.f[s]===f;
    if(!scaleSet.has(rel)&&!inVoicing) continue;
    const x=X(f===0?NUT-20:NUT+(f-0.5)*FW), y=TOP+s*GAP;
    const isRoot=rel===0, isChord=chordSet.has(rel);
    const fill=isRoot?'#C23B2E':isChord?'#E3A21A':'#EDE6D6', tc=isRoot?'#FFFFFF':isChord?'#2A1A00':'#2A1E16';
    let label=mode==='notes'?spell(pc,flats):ivLabel(rel,scaleSet.has(rel)?scaleSet:new Set([...scaleSet,rel]));
    if(inVoicing&&opts.fingerLabels&&opts.voicing) label=opts.voicing.g[s]>0?String(opts.voicing.g[s]):spell(pc,flats);
    const outside=bright?!bright[s].has(f):(dim&&(f<dim.s||f>dim.e));
    const op=outside?' opacity="0.25"':'';
    g+=`<circle cx="${x}" cy="${y}" r="12.5" fill="${fill}" stroke="#2A170F" stroke-width="1"${op}/>`;
    g+=`<text x="${x}" y="${y+4}" text-anchor="middle" font-size="${label.length>2?10:11.5}" font-weight="600" fill="${tc}" font-family="inherit"${op}>${esc(label)}</text>`;
  }
  if(ring) ring.f.forEach((f,s)=>{ if(f>=0&&f<=FRETS) g+=`<circle cx="${X(f===0?NUT-20:NUT+(f-0.5)*FW)}" cy="${TOP+s*GAP}" r="17" fill="none" stroke="#fff" stroke-width="3"/>`; });
  return g+'</svg>';
}
