import { CHORDS, FEATURE_GROUPS, chordFeatures, SHARP, spell, board, play, esc } from './theory.js';
import { getInstrument, onInstrumentChange } from './instrument.js';
import { arpeggioAround, arpeggioNotes, upAndDown } from './arpeggio.js';
import { playNotes } from './player.js';
import { loadVoicings, getVoicings, voicingLabel, voicingDiagram } from './voicings.js';

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
const FEATS = Object.fromEntries(SUFFIXES.map(suf => [suf, chordFeatures(CHORDS[suf])]));
const groupOf = id => FEATURE_GROUPS.find(g => g.items.some(([f]) => f === id));
// Chords containing every selected feature, exact matches first, then the
// fewest extras - so "minor + 7" lists m7 before m9, m11, m13.
function matching(sel){
  const hit = SUFFIXES.filter(suf => sel.every(f => FEATS[suf].has(f)));
  return hit.sort((a, b) => FEATS[a].size - FEATS[b].size);
}
// What the selection would be after toggling `id` (radio groups pick one).
function toggled(sel, id){
  if(sel.includes(id)) return sel.filter(x => x !== id);
  const g = groupOf(id);
  const rest = g.radio ? sel.filter(x => !g.items.some(([f]) => f === x)) : sel;
  return [...rest, id];
}

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

  const state = { root: 0, suffix: '', labels: 'notes', voicing: 'all', builder: [], arp: false }; // default C major
  try{
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if(saved) Object.assign(state, saved);
  }catch(e){}
  function save(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }catch(e){} }

  rootsEl.innerHTML = SHARP.map((n, i) =>
    `<button class="chip" type="button" data-r="${i}" aria-pressed="${i === state.root}"><b>${esc(n)}</b></button>`
  ).join('');
  rootsEl.querySelectorAll('.chip').forEach(b => b.onclick = () => {
    state.root = +b.dataset.r; state.voicing = 'all'; save(); render();
  });

  let loaded = false;
  loadVoicings().then(() => { loaded = true; render(); });

  function builderHtml(){
    const sel = state.builder, n = matching(sel).length;
    const groups = FEATURE_GROUPS.map(g => `<div class="bgroup"><span class="bl">${esc(g.label)}</span><div class="seg bseg" role="group" aria-label="${esc(g.label)}">${g.items.map(([id, lab]) => {
      const off = !sel.includes(id) && !matching(toggled(sel, id)).length;
      return `<button type="button" data-f="${esc(id)}" aria-pressed="${sel.includes(id)}"${off ? ' disabled' : ''}>${esc(lab)}</button>`;
    }).join('')}</div></div>`).join('');
    return `<div class="builder">${groups}<div class="brow"><button type="button" class="bclear" id="ch-bclear"${sel.length ? '' : ' disabled'}>Clear</button><span class="bcount">${sel.length ? `${n} chord type${n === 1 ? '' : 's'} match` : 'Toggle to build a chord - the list below narrows as you go.'}</span></div></div>`;
  }
  function applyBuilder(sel){
    state.builder = sel;
    const exact = SUFFIXES.filter(suf => FEATS[suf].size === sel.length && sel.every(f => FEATS[suf].has(f)));
    if(exact.length){ state.suffix = exact[0]; state.voicing = 'all'; }
    save(); render();
  }

  function render(){
    rootsEl.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.r === state.root)));
    const iv = CHORDS[state.suffix] || CHORDS[''];
    const name = spell(state.root, false) + (state.suffix === '' ? '' : state.suffix);
    const chord = { root: state.root, iv, name };
    const sug = { s: { iv, name: labelFor(state.suffix) } };
    const inst = getInstrument();
    const voicings = getVoicings(inst, state.root, state.suffix);
    if(loaded && state.voicing !== 'all' && !voicings[state.voicing - 1]) state.voicing = 'all';
    const vo = state.voicing === 'all' ? null : (voicings[state.voicing - 1] || null);
    if(!vo && state.labels === 'fingers') state.labels = 'notes';
    const boardOpts = { tuning: inst.tuning, stringWidths: inst.stringWidths, leftHanded: inst.leftHanded, capo: inst.capo };
    // Arpeggio shape: every chord tone in the fret window of the fingering, with the
    // fingering itself ringed; otherwise the neck dims to just the fingering.
    const chordPcs = iv.map(x => (state.root + x) % 12);
    const arpSets = vo ? arpeggioAround(vo, inst, chordPcs) : null;
    const showArp = !!vo && state.arp;
    if(vo && showArp){ boardOpts.voicingRing = vo; boardOpts.brightSets = arpSets; }
    else if(vo){ boardOpts.voicing = vo; boardOpts.fingerLabels = state.labels === 'fingers'; }
    const voBtns = ['all', ...voicings.map((_, i) => i + 1)].map(v =>
      `<button type="button" data-vo="${v}" title="${v === 'all' ? 'Every chord tone on the neck' : esc(voicingLabel(voicings[v - 1]))}" aria-pressed="${state.voicing === v}">${v === 'all' ? 'All' : v}</button>`).join('');
    const voRow = voicings.length
      ? `<div class="row"><label class="keylab">Voicing <div class="seg" id="ch-voseg" role="group" aria-label="Chord voicing">${voBtns}</div></label>
          ${vo ? `<span class="vometa">${esc(voicingLabel(vo))}${vo.b ? ' \u00b7 barre' : ''}</span>
          <label class="chk"><input type="checkbox" id="ch-arp"${state.arp ? ' checked' : ''}> Arpeggio shape</label>
          <button type="button" class="share" id="ch-arpplay">Play arpeggio</button>` : ''}</div>
         ${vo ? `<div class="vobig">${voicingDiagram(vo, { size: 1.8, mirror: inst.leftHanded })}</div>` : ''}`
      : (loaded ? `<p class="hint">No stored fingering for this chord in this tuning - the neck shows every chord tone.</p>` : '');
    let h = `<h2 class="bh">Build a chord</h2>${builderHtml()}
      <div class="chordhead"><h2>${esc(spell(state.root, false))} ${esc(labelFor(state.suffix))}</h2><p>Tones ${esc(iv.map(x => spell(state.root + x, false)).join(' '))}</p></div>
      <div class="boardbar"><div class="scaletitle">${esc(name)}</div>
        <div class="controls"><div class="seg" role="group" aria-label="Fretboard labels">
          <button type="button" data-l="notes" aria-pressed="${state.labels === 'notes'}">Note names</button>
          <button type="button" data-l="intervals" aria-pressed="${state.labels === 'intervals'}">Intervals</button>${vo ? `
          <button type="button" data-l="fingers" aria-pressed="${state.labels === 'fingers'}">Fingers</button>` : ''}</div>
          <button type="button" class="play" id="ch-play">Play chord</button></div></div>
      ${voRow}
      <div class="board" tabindex="0" aria-label="Fretboard, scroll sideways">${board(chord, sug, state.labels === 'fingers' ? 'notes' : state.labels, false, boardOpts)}</div>
      <div class="legend"><span><i style="background:#C23B2E"></i>Root</span><span><i style="background:#E3A21A"></i>Chord tone</span></div>
      <h3>${state.builder.length ? 'Matching chord types' : 'All chord types'}</h3><div class="scales">`;
    (state.builder.length ? matching(state.builder) : SUFFIXES).forEach(suf => {
      const civ = CHORDS[suf];
      h += `<button type="button" class="srow" data-suf="${esc(suf)}" aria-pressed="${suf === state.suffix}">
        <div class="top"><span class="nm">${esc(spell(state.root, false))}${esc(suf)} <span style="font-weight:400;color:var(--muted)">${esc(labelFor(suf))}</span></span><span class="notes">${esc(civ.map(x => spell(state.root + x, false)).join(' '))}</span></div>
      </button>`;
    });
    h += '</div>';
    detail.innerHTML = h;
    detail.querySelectorAll('.bseg button').forEach(b => b.onclick = () => applyBuilder(toggled(state.builder, b.dataset.f)));
    const bc = detail.querySelector('#ch-bclear'); if(bc) bc.onclick = () => applyBuilder([]);
    detail.querySelectorAll('.srow').forEach(b => b.onclick = () => { state.suffix = b.dataset.suf; state.voicing = 'all'; save(); render(); });
    detail.querySelectorAll('.seg button[data-l]').forEach(b => b.onclick = () => { state.labels = b.dataset.l; save(); render(); });
    detail.querySelectorAll('#ch-voseg button').forEach(b => b.onclick = () => { const v = b.dataset.vo; state.voicing = v === 'all' ? 'all' : +v; if(v !== 'all' && state.labels === 'notes') state.labels = 'fingers'; save(); render(); });
    const ca = detail.querySelector('#ch-arp'); if(ca) ca.onchange = () => { state.arp = ca.checked; save(); render(); };
    const cap = detail.querySelector('#ch-arpplay'); if(cap) cap.onclick = () => playNotes(upAndDown(arpeggioNotes(arpSets, inst)));
    detail.querySelector('#ch-play').onclick = () => play(chord, { iv }, getInstrument().audioOffset, null, vo ? vo.f.map((f, j) => f >= 0 ? inst.midi[j] + f : null).filter(m => m !== null) : null);
  }

  render();
  onInstrumentChange(() => render());
}
