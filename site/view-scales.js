import { SCALES, SHARP, CHORDS, spell, esc, chordLabel } from './music.js';
import { chordsInScale } from './scalefit.js';
import { tabOf } from './share.js';
import { getFocus, setFocus } from './focus.js';
import { getPositions, positionFrets } from './positions.js';
import { board, fitBoard } from './board.js';
import { play } from './audio.js';
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
      <label class="big desk">Root</label>
      <nav class="rootpicker" id="sc-roots" aria-label="Root note"></nav>
      <div class="row phoneonly">
        <label class="keylab">Root <select id="sc-rootsel"></select></label>
        <label class="keylab">Scale <select id="sc-scalesel"></select></label>
      </div>
    </section>
    <section id="sc-detail"></section>
  `;

  const rootsEl = root.querySelector('#sc-roots'), detail = root.querySelector('#sc-detail');

  /** @type {{root:number, scaleId:string, labels:string, position:'all'|number, arp:number|null, sev:boolean, chord:{root:number, suffix:string}|null}} */
  const state = { root: 9, scaleId: SCALES[0].id, labels: 'notes', position: 'all', arp: null, sev: false, chord: null }; // default A, Ionian, whole neck
  try{
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if(saved) Object.assign(state, saved);
  }catch(e){}
  state.chord = null; // a chord picked in the chord row is not kept between visits
  // "#scales?r=<root>&s=<scale id>&cr=<chord root>&cs=<chord suffix>" (from Progressions and Chords) selects a scale, and a chord to show in it.
  function applyHash(){
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    if(tabOf(location.hash) !== 'scales' || !q.has('r')) return false;
    const r = +(q.get('r') ?? NaN), id = q.get('s') ?? '';
    if(!Number.isInteger(r) || r < 0 || r > 11 || !SCALES.some(x => x.id === id)) return false;
    state.root = r; state.scaleId = id; state.position = 'all'; state.arp = null; state.chord = null;
    const cr = +(q.get('cr') ?? NaN), cs = q.get('cs') ?? '';
    if(Number.isInteger(cr) && cr >= 0 && cr <= 11 && Object.prototype.hasOwnProperty.call(CHORDS, cs)) state.chord = { root: cr, suffix: cs };
    return true;
  }
  // the chord and scale shared with Progressions and Chords: open on whatever was last worked with there
  function adoptFocus(){
    const f = getFocus(); let changed = false;
    if(f.scale && SCALES.some(x => x.id === f.scale.id) && (f.scale.root !== state.root || f.scale.id !== state.scaleId)){ state.root = f.scale.root; state.scaleId = f.scale.id; state.position = 'all'; state.arp = null; changed = true; }
    const want = f.chord && f.chord.suffix in CHORDS ? f.chord : null;
    if(JSON.stringify(want) !== JSON.stringify(state.chord)){ state.chord = want; if(want) state.arp = null; changed = true; }
    return changed;
  }
  adoptFocus();
  applyHash();
  function save(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }catch(e){} }

  rootsEl.innerHTML = SHARP.map((n, i) =>
    `<button class="chip" type="button" data-r="${i}" aria-pressed="${i === state.root}"><b>${esc(n)}</b></button>`
  ).join('');
  rootsEl.querySelectorAll('.chip').forEach(b => b.onclick = () => {
    state.root = +b.dataset.r; state.chord = null; save(); render();
  });

  const rootSel = root.querySelector('#sc-rootsel'), scaleSel = root.querySelector('#sc-scalesel');
  rootSel.innerHTML = SHARP.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join('');
  scaleSel.innerHTML = SCALES.map(sc => `<option value="${esc(sc.id)}">${esc(sc.name)}</option>`).join('');
  rootSel.onchange = () => { state.root = +rootSel.value; state.chord = null; save(); render(); };
  scaleSel.onchange = () => { state.scaleId = scaleSel.value; state.chord = null; save(); render(); };

  let refit = () => {};
  root.addEventListener('fw-shown', () => { if(adoptFocus()) render(); else refit(); });
  function render(){
    rootsEl.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.r === state.root)));
    const scale = SCALES.find(s => s.id === state.scaleId) || SCALES[0];
    setFocus({ scale: { root: state.root, id: scale.id }, ...(state.chord ? { chord: state.chord } : {}) });
    rootSel.value = String(state.root); scaleSel.value = scale.id;
    const triad = triadFromScale(scale);
    let chord = { root: state.root, iv: triad, name: spell(state.root, false) };
    let sug = { s: scale };
    // Arpeggio: the chord stacked in thirds on a scale degree (seven-note scales),
    // its tones coloured inside the scale. The board colours relative to the chord
    // root, so the scale is re-based onto that root.
    const arpOk = new Set(scale.iv).size === 7;
    const dc = arpOk && Number.isInteger(state.arp) ? degreeChord(scale.iv, state.arp, state.sev) : null;
    const cc = state.chord && CHORDS[state.chord.suffix] ? state.chord : null; // a chord picked from the chord row
    if(cc){
      chord = { root: cc.root, iv: CHORDS[cc.suffix], name: spell(cc.root, false) + cc.suffix };
      sug = { s: { ...scale, iv: scale.iv.map(x => (x + state.root - cc.root + 12) % 12) } };
    } else if(dc){
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
    const arpNotes = (dc || cc) && boardOpts.brightSets ? arpeggioNotes(arpeggioInSets(boardOpts.brightSets, inst, chordPcs), inst) : [];
    const arpRow = !arpOk ? '' : `<div class="row"><label class="keylab">Arpeggio <div class="seg" id="sc-arpseg" role="group" aria-label="Arpeggio chord">
        <button type="button" data-k="none" aria-pressed="${!dc}">None</button>${[0, 1, 2, 3, 4, 5, 6].map(k => {
          const d = degreeChord(scale.iv, k, state.sev);
          return `<button type="button" data-k="${k}" title="${esc(spell(state.root + d.root, false) + (d.key ?? ''))}" aria-pressed="${state.arp === k}">${esc(d.numeral)}</button>`; }).join('')}</div></label>
        <label class="chk"><input type="checkbox" id="sc-sev"${state.sev ? ' checked' : ''}> 7ths</label>
        <button type="button" class="share" id="sc-arpplay"${arpNotes.length ? '' : ' disabled'} title="${dc || cc ? 'Plays the arpeggio notes shown in the selected position' : 'Pick an arpeggio and a position'}">Play arpeggio</button>
        ${dc ? `<span class="vometa">${esc(dc.numeral)} = ${esc(chord.name)} (${esc(chord.iv.map(x => spell(chord.root + x, false)).join(' '))})</span>` : ''}</div>`;
    const posButtons = ['all', ...positions.map(p => p.n)].map(p =>
      `<button type="button" data-pos="${p}" aria-pressed="${state.position === p}">${p === 'all' ? 'All' : p}</button>`
    ).join('');
    const made = chordsInScale(state.root, scale.iv);
    const chordRow = `<h3>Chords from this scale</h3><p class="hint">Tap a chord to see its notes in the scale.</p><div class="chiprow" id="sc-chords" role="group" aria-label="Chords made from this scale">${made.map(c => {
      const nm = spell(c.root, false) + c.suffix, on = !!cc && cc.root === c.root && cc.suffix === c.suffix;
      return `<button type="button" class="chip" data-cr="${c.root}" data-cs="${esc(c.suffix)}" aria-pressed="${on}" title="${esc(spell(c.root, false) + ' ' + chordLabel(c.suffix))}"><b>${esc(nm)}</b></button>`; }).join('')}</div>
      ${cc ? `<div class="row"><a class="share open" id="sc-tochord" href="#chords?r=${cc.root}&s=${encodeURIComponent(cc.suffix)}">Voicings of ${esc(spell(cc.root, false) + cc.suffix)} in Chords</a><button type="button" class="share" id="sc-chordclear">Clear</button></div>` : ''}`;
    let h = `<div class="chordhead"><h2>${esc(spell(state.root, false))} ${esc(scale.name)}</h2><p>${esc(scale.d)}</p></div>
      <div class="boardbar"><div class="scaletitle">Notes: ${esc(scale.iv.map(x => spell(state.root + x, false)).join(' '))}</div>
        <div class="controls"><div class="seg" id="sc-labelseg" role="group" aria-label="Fretboard labels">
          <button type="button" data-l="notes" aria-pressed="${state.labels === 'notes'}">Note names</button>
          <button type="button" data-l="intervals" aria-pressed="${state.labels === 'intervals'}">Intervals</button></div>
          <button type="button" class="play" id="sc-play">\u25B6 Play scale</button>
          <button type="button" class="share" id="sc-clear" title="Clear the position, the arpeggio and the chord picked in this scale"${state.position === 'all' && !dc && !cc ? ' disabled' : ''}>Clear</button></div></div>
      <div class="row"><label class="keylab">Position <div class="seg" id="sc-posseg" role="group" aria-label="Fretboard position">${posButtons}</div></label></div>
      ${arpRow}
      <div class="board" tabindex="0" aria-label="Fretboard, scroll sideways">${board(chord, sug, state.labels, false, boardOpts)}</div>
      <div class="legend"><span><i style="background:#C23B2E"></i>Root</span><span><i style="background:#E3A21A"></i>${dc ? 'Arpeggio chord tone' : cc ? 'Chord tone' : 'Triad note (1, 3, 5)'}</span><span><i style="background:#EDE6D6;border:1px solid var(--muted)"></i>Other scale note</span></div>
      ${chordRow}
      <h3>All scales</h3><div class="scales">`;
    SCALES.forEach(s => {
      h += `<button type="button" class="srow" data-id="${s.id}" aria-pressed="${s.id === state.scaleId}">
        <div class="top"><span class="nm">${esc(s.name)}</span><span class="notes">${esc(s.iv.map(x => spell(state.root + x, false)).join(' '))}</span></div>
        <div class="ds">${esc(s.d)}</div></button>`;
    });
    h += '</div>';
    detail.innerHTML = h;
    detail.querySelectorAll('.srow').forEach(b => b.onclick = () => { state.scaleId = b.dataset.id; state.chord = null; save(); render(); });
    detail.querySelector('#sc-labelseg').querySelectorAll('button').forEach(b => b.onclick = () => { state.labels = b.dataset.l; save(); render(); });
    detail.querySelector('#sc-posseg').querySelectorAll('button').forEach(b => b.onclick = () => {
      const v = b.dataset.pos; state.position = v === 'all' ? 'all' : +v; save(); render();
    });
    detail.querySelectorAll('#sc-arpseg button').forEach(b => b.onclick = () => { state.arp = b.dataset.k === 'none' ? null : +b.dataset.k; state.chord = null; save(); render(); });
    detail.querySelectorAll('#sc-chords .chip').forEach(b => b.onclick = () => { const r = +(b.dataset.cr ?? 0), sf = b.dataset.cs ?? ''; state.chord = cc && cc.root === r && cc.suffix === sf ? null : { root: r, suffix: sf }; state.arp = null; setFocus({ chord: state.chord }); render(); });
    detail.querySelector('#sc-clear').onclick = () => { state.position = 'all'; state.arp = null; state.chord = null; setFocus({ chord: null }); save(); render(); };
    const cclr = detail.querySelector('#sc-chordclear'); if(cclr) cclr.onclick = () => { state.chord = null; setFocus({ chord: null }); render(); };
    const sev = detail.querySelector('#sc-sev'); if(sev) sev.onchange = () => { state.sev = sev.checked; save(); render(); };
    const ap = detail.querySelector('#sc-arpplay'); if(ap) ap.onclick = () => playNotes(upAndDown(arpNotes));
    refit = () => fitBoard(detail.querySelector('.board'), boardOpts.dimRange, inst.leftHanded); refit();
    detail.querySelector('#sc-play').onclick = () => play(chord, scale, inst.audioOffset, runNotes);
  }

  render();
  window.addEventListener('hashchange', () => { if(applyHash()) render(); });
  onInstrumentChange(() => render());
}
