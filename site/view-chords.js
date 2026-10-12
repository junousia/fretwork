import { CHORDS, SHARP, spell, board, play, esc } from './theory.js';
import { getInstrument, onInstrumentChange } from './instrument.js';

const STORE_KEY = 'gtr-chords-v1';

const LABELS = {
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
function labelFor(suf){ return LABELS[suf] || suf; }

// Keep insertion order from theory.js's CHORDS table - it's already grouped
// by family (major, minor, 7ths, suspended, dominant, diminished, augmented).
const SUFFIXES = Object.keys(CHORDS);

export function mount(root){
  root.innerHTML = `
    <header>
      <h1>Chords</h1>
      <p class="lead">Pick a root and a chord. See every occurrence of its tones across the whole neck, and hear it played.</p>
    </header>
    <section>
      <label class="big">Root</label>
      <nav class="rootpicker" id="ch-roots" aria-label="Root note"></nav>
    </section>
    <section id="ch-detail"></section>
  `;

  const rootsEl = root.querySelector('#ch-roots'), detail = root.querySelector('#ch-detail');

  const state = { root: 0, suffix: '', labels: 'notes' }; // default C major
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
    const iv = CHORDS[state.suffix] || CHORDS[''];
    const name = spell(state.root, false) + (state.suffix === '' ? '' : state.suffix);
    const chord = { root: state.root, iv, name };
    const sug = { s: { iv, name: labelFor(state.suffix) } };
    let h = `<div class="chordhead"><h2>${esc(spell(state.root, false))} ${esc(labelFor(state.suffix))}</h2><p>Tones ${esc(iv.map(x => spell(state.root + x, false)).join(' '))}</p></div>
      <div class="boardbar"><div class="scaletitle">${esc(name)}</div>
        <div class="controls"><div class="seg" role="group" aria-label="Fretboard labels">
          <button type="button" data-l="notes" aria-pressed="${state.labels === 'notes'}">Note names</button>
          <button type="button" data-l="intervals" aria-pressed="${state.labels === 'intervals'}">Intervals</button></div>
          <button type="button" class="play" id="ch-play">Play chord</button></div></div>
      <div class="board" tabindex="0" aria-label="Fretboard, scroll sideways">${board(chord, sug, state.labels, false, {tuning:getInstrument().tuning,stringWidths:getInstrument().stringWidths})}</div>
      <div class="legend"><span><i style="background:#C23B2E"></i>Root</span><span><i style="background:#E3A21A"></i>Chord tone</span></div>
      <h3>All chord types</h3><div class="scales">`;
    SUFFIXES.forEach(suf => {
      const civ = CHORDS[suf];
      h += `<button type="button" class="srow" data-suf="${esc(suf)}" aria-pressed="${suf === state.suffix}">
        <div class="top"><span class="nm">${esc(spell(state.root, false))}${esc(suf)} <span style="font-weight:400;color:var(--muted)">${esc(labelFor(suf))}</span></span><span class="notes">${esc(civ.map(x => spell(state.root + x, false)).join(' '))}</span></div>
      </button>`;
    });
    h += '</div>';
    detail.innerHTML = h;
    detail.querySelectorAll('.srow').forEach(b => b.onclick = () => { state.suffix = b.dataset.suf; save(); render(); });
    detail.querySelectorAll('.seg button').forEach(b => b.onclick = () => { state.labels = b.dataset.l; save(); render(); });
    detail.querySelector('#ch-play').onclick = () => play(chord, { iv }, getInstrument().audioOffset);
  }

  render();
  onInstrumentChange(() => render());
}
