import { SCALES, SHARP, getPositions, positionFrets, spell, board, play, esc } from './theory.js';
import { getInstrument, onInstrumentChange } from './instrument.js';
import { degreeChord, arpeggioInSets, arpeggioNotes, upAndDown } from './arpeggio.js';
import { playNotes } from './player.js';

const STORE_KEY = 'gtr-scales-v1';

function triadFromScale(scale){
  const has = n => scale.iv.includes(n);
  const third = has(4) ? 4 : has(3) ? 3 : null;
  const fifth = has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : null;
  return [0, third, fifth].filter(x => x !== null);
}

export function mount(root){
  root.innerHTML = `
    <header>
      <h1>Scales</h1>
      <p class="lead">Pick a root and a scale. See it laid out on the neck, with the root and the scale's own triad picked out, and hear it played.</p>
    </header>
    <section>
      <label class="big">Root</label>
      <nav class="rootpicker" id="sc-roots" aria-label="Root note"></nav>
    </section>
    <section id="sc-detail"></section>
  `;

  const rootsEl = root.querySelector('#sc-roots'), detail = root.querySelector('#sc-detail');

  const state = { root: 9, scaleId: SCALES[0].id, labels: 'notes', position: 'all', arp: null, sev: false }; // default A, Ionian, whole neck
  try{
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if(saved) Object.assign(state, saved);
  }catch(e){}
  function save(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }catch(e){} }

  rootsEl.innerHTML = SHARP.map((n, i) =>
    `<button class="chip" type="button" data-r="${i}" aria-pressed="${i === state.root}"><b>${esc(n)}</b></button>`
  ).join('');
  rootsEl.querySelectorAll('.chip').forEach(b => b.onclick = () => {
    state.root = +b.dataset.r; save(); render();
  });

  function render(){
    rootsEl.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.r === state.root)));
    const scale = SCALES.find(s => s.id === state.scaleId) || SCALES[0];
    const triad = triadFromScale(scale);
    let chord = { root: state.root, iv: triad, name: spell(state.root, false) };
    let sug = { s: scale };
    // Arpeggio: the chord stacked in thirds on a scale degree (seven-note scales),
    // its tones coloured inside the scale. The board colours relative to the chord
    // root, so the scale is re-based onto that root.
    const arpOk = new Set(scale.iv).size === 7;
    const dc = arpOk && Number.isInteger(state.arp) ? degreeChord(scale.iv, state.arp, state.sev) : null;
    if(dc){
      const croot = (state.root + dc.root) % 12;
      chord = { root: croot, iv: dc.iv, name: spell(croot, false) + (dc.key ?? '') };
      sug = { s: { ...scale, iv: scale.iv.map(x => (x - dc.root + 12) % 12) } };
    }
    const inst = getInstrument();
    const positions = getPositions(scale.iv, state.root, inst.tuning);
    if(state.position !== 'all' && !positions.some(p => p.n === state.position)) state.position = 'all';
    const boardOpts = { tuning: inst.tuning, stringWidths: inst.stringWidths, showPositions: true, positions, leftHanded: inst.leftHanded, capo: inst.capo };
    if(state.position !== 'all'){
      const idx = Math.max(0, positions.findIndex(p => p.n === state.position));
      const p = positions[idx];
      boardOpts.dimRange = { s: p.s, e: p.e };
      boardOpts.brightSets = positionFrets(positions, idx, scale.iv, state.root, inst.tuning, inst.midi);
    }
    let runNotes = null; // MIDI list: the actual notes of the selected position
    if(boardOpts.brightSets) runNotes = inst.midi.flatMap((open, j) => [...boardOpts.brightSets[j]].map(f => open + f));
    const chordPcs = chord.iv.map(x => (chord.root + x) % 12);
    const arpNotes = dc && boardOpts.brightSets ? arpeggioNotes(arpeggioInSets(boardOpts.brightSets, inst, chordPcs), inst) : [];
    const arpRow = !arpOk ? '' : `<div class="row"><label class="keylab">Arpeggio <div class="seg" id="sc-arpseg" role="group" aria-label="Arpeggio chord">
        <button type="button" data-k="none" aria-pressed="${!dc}">None</button>${[0, 1, 2, 3, 4, 5, 6].map(k => {
          const d = degreeChord(scale.iv, k, state.sev);
          return `<button type="button" data-k="${k}" title="${esc(spell(state.root + d.root, false) + (d.key ?? ''))}" aria-pressed="${state.arp === k}">${esc(d.numeral)}</button>`; }).join('')}</div></label>
        <label class="chk"><input type="checkbox" id="sc-sev"${state.sev ? ' checked' : ''}> 7ths</label>
        <button type="button" class="share" id="sc-arpplay"${arpNotes.length ? '' : ' disabled'} title="${dc ? 'Plays the arpeggio notes shown in the selected position' : 'Pick an arpeggio and a position'}">Play arpeggio</button>
        ${dc ? `<span class="vometa">${esc(dc.numeral)} = ${esc(chord.name)} (${esc(chord.iv.map(x => spell(chord.root + x, false)).join(' '))})</span>` : ''}</div>`;
    const posButtons = ['all', ...positions.map(p => p.n)].map(p =>
      `<button type="button" data-pos="${p}" aria-pressed="${state.position === p}">${p === 'all' ? 'All' : p}</button>`
    ).join('');
    let h = `<div class="chordhead"><h2>${esc(spell(state.root, false))} ${esc(scale.name)}</h2><p>${esc(scale.d)}</p></div>
      <div class="boardbar"><div class="scaletitle">Notes: ${esc(scale.iv.map(x => spell(state.root + x, false)).join(' '))}</div>
        <div class="controls"><div class="seg" id="sc-labelseg" role="group" aria-label="Fretboard labels">
          <button type="button" data-l="notes" aria-pressed="${state.labels === 'notes'}">Note names</button>
          <button type="button" data-l="intervals" aria-pressed="${state.labels === 'intervals'}">Intervals</button></div>
          <button type="button" class="play" id="sc-play">Play scale</button></div></div>
      <div class="row"><label class="keylab">Position <div class="seg" id="sc-posseg" role="group" aria-label="Fretboard position">${posButtons}</div></label></div>
      ${arpRow}
      <div class="board" tabindex="0" aria-label="Fretboard, scroll sideways">${board(chord, sug, state.labels, false, boardOpts)}</div>
      <div class="legend"><span><i style="background:#C23B2E"></i>Root</span><span><i style="background:#E3A21A"></i>${dc ? 'Arpeggio chord tone' : 'Triad note (1, 3, 5)'}</span><span><i style="background:#EDE6D6;border:1px solid var(--muted)"></i>Other scale note</span></div>
      <h3>All scales</h3><div class="scales">`;
    SCALES.forEach(s => {
      h += `<button type="button" class="srow" data-id="${s.id}" aria-pressed="${s.id === state.scaleId}">
        <div class="top"><span class="nm">${esc(s.name)}</span><span class="notes">${esc(s.iv.map(x => spell(state.root + x, false)).join(' '))}</span></div>
        <div class="ds">${esc(s.d)}</div></button>`;
    });
    h += '</div>';
    detail.innerHTML = h;
    detail.querySelectorAll('.srow').forEach(b => b.onclick = () => { state.scaleId = b.dataset.id; save(); render(); });
    detail.querySelector('#sc-labelseg').querySelectorAll('button').forEach(b => b.onclick = () => { state.labels = b.dataset.l; save(); render(); });
    detail.querySelector('#sc-posseg').querySelectorAll('button').forEach(b => b.onclick = () => {
      const v = b.dataset.pos; state.position = v === 'all' ? 'all' : +v; save(); render();
    });
    detail.querySelectorAll('#sc-arpseg button').forEach(b => b.onclick = () => { state.arp = b.dataset.k === 'none' ? null : +b.dataset.k; save(); render(); });
    const sev = detail.querySelector('#sc-sev'); if(sev) sev.onchange = () => { state.sev = sev.checked; save(); render(); };
    const ap = detail.querySelector('#sc-arpplay'); if(ap) ap.onclick = () => playNotes(upAndDown(arpNotes));
    detail.querySelector('#sc-play').onclick = () => play(chord, scale, inst.audioOffset, runNotes);
  }

  render();
  onInstrumentChange(() => render());
}
