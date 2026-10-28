import { esc, CHORDS, detectKey } from './music.js';
import { chordScales } from './scalefit.js';
import { board } from './board.js';
import { play } from './audio.js';
import { getInstrument, onInstrumentChange } from './instrument.js';
import { identifyChord, marksToNotes, noteNameIn } from './identify.js';

const FRETS = 15;

/** A link that opens the best-fitting scale for an identified chord in Scales, with the chord marked in it. @param {{root:number, suffix:string}} m @returns {string} */
function scaleLink(m){
  if(!(m.suffix in CHORDS)) return '';
  const chord = { root: m.root, iv: CHORDS[m.suffix] };
  const key = detectKey([{ ...chord, name: '', acc: '', bass: null, suf: m.suffix }]);
  const best = key ? chordScales(chord, key)[0] : null;
  return best ? ` <a href="#scales?r=${best.root}&s=${best.s.id}&cr=${m.root}&cs=${encodeURIComponent(m.suffix)}" class="share open">${esc(noteNameIn(best.root, m.root))} ${esc(best.s.short || best.s.name)} in Scales</a>` : '';
}

export function mount(root){
  root.innerHTML = `
    <header>
      <h1>Identify</h1>
      <p class="lead">Mark the notes of a chord on the fretboard - click a fret to place a note, click it again to remove it - and see which chords fit.</p>
    </header>
    <section id="id-body"></section>
  `;
  const body = root.querySelector('#id-body');

  /** One fret per string, top string first; -1 = muted, 0 = open. @type {number[]} */
  let marks = [];
  let shape = '';
  const inst0 = () => getInstrument();
  function reset(){ const n = inst0().midi.length; marks = Array(n).fill(-1); shape = inst0().id + ':' + inst0().tuningId; }

  reset();

  function render(){
    const inst = inst0();
    if(shape !== inst.id + ':' + inst.tuningId || marks.length !== inst.midi.length) reset();
    const { midi, pcs, bass } = marksToNotes(marks, inst);
    const matches = pcs.length ? identifyChord(pcs, bass) : [];
    const best = matches[0];
    const chord = best ? { root: best.root, iv: best.tones.map(t => (t - best.root + 12) % 12), name: best.name } : { root: pcs[0] ?? 0, iv: [0], name: '' };
    const sug = { s: { iv: [0], name: 'the marked notes' } };
    const vo = { f: marks, g: marks.map(() => 0), b: null };
    const opts = { tuning: inst.tuning, stringWidths: inst.stringWidths, leftHanded: inst.leftHanded, capo: inst.capo, voicing: vo, hitAreas: true };
    const noteNames = pcs.length ? [...midi].sort((a, b) => a - b).map(m => noteNameIn(m % 12, best ? best.root : m % 12)) : [];

    const selects = marks.map((f, s) => `<label class="strsel">String ${s + 1}
      <select data-s="${s}" aria-label="String ${s + 1} fret">
        <option value="-1"${f < 0 ? ' selected' : ''}>Muted</option><option value="0"${f === 0 ? ' selected' : ''}>Open</option>${Array.from({ length: FRETS }, (_, i) => `<option value="${i + 1}"${f === i + 1 ? ' selected' : ''}>Fret ${i + 1}</option>`).join('')}
      </select></label>`).join('');

    let list;
    if(!pcs.length) list = `<p class="hint">No notes marked yet.</p>`;
    else if(pcs.length < 2) list = `<p class="hint">One note is not a chord - mark at least two different notes.</p>`;
    else if(!matches.length) list = `<p class="hint">No chord fits these notes.</p>`;
    else list = `<h2 class="bh">${matches.length === 1 ? 'Matching chord' : 'Matching chords'}</h2><div class="scales" id="id-matches">${matches.map((m, i) => `
      <div class="srow match" data-i="${i}"><div class="top"><span class="nm">${esc(m.name)}</span> <span class="lab">${esc(m.label)}${m.bass !== null ? ' · slash chord' : ''}</span>
        <span class="notes">${esc(m.tones.map(t => noteNameIn(t, m.root)).join(' '))}</span></div>
        <div class="ds">${m.exact ? 'Every chord tone is played.' : `Without the ${esc(m.omitted.join(', '))}.`}
        <a href="#chords?r=${m.root}&s=${encodeURIComponent(m.suffix)}" class="share open">Open in Chords</a>${scaleLink(m)}</div></div>`).join('')}</div>`;

    body.innerHTML = `
      <div class="boardbar"><div class="scaletitle">${noteNames.length ? esc(noteNames.join(' ')) : 'No notes marked'}</div>
        <div class="controls"><button type="button" class="play" id="id-play"${midi.length ? '' : ' disabled'}>\u25B6 Play</button>
        <button type="button" class="share" id="id-clear"${midi.length ? '' : ' disabled'}>Clear</button></div></div>
      <div class="board" tabindex="0" aria-label="Fretboard, scroll sideways">${board(chord, sug, 'notes', false, opts)}</div>
      <div class="strsels">${selects}</div>
      <div id="id-result" aria-live="polite">${list}</div>`;

    body.querySelectorAll('rect.hit').forEach(r => r.addEventListener('click', () => {
      const s = +r.dataset.s, f = +r.dataset.f;
      marks[s] = marks[s] === f ? -1 : f; render();
    }));
    body.querySelectorAll('select[data-s]').forEach(sel => sel.addEventListener('change', () => { marks[+sel.dataset.s] = +sel.value; render(); }));
    body.querySelector('#id-clear').onclick = () => { marks = marks.map(() => -1); render(); };
    body.querySelector('#id-play').onclick = () => {
      const lowToHigh = [...midi].sort((a, b) => a - b);
      play({ root: 0, iv: [0] }, { iv: [0] }, inst.audioOffset, null, lowToHigh);
    };
  }

  render();
  onInstrumentChange(() => render());
}
