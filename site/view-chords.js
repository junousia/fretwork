import { CHORDS, SHARP, spell, esc, chordLabel, parseChord, detectKey } from './music.js';
import { chordScales } from './scalefit.js';
import { FEATURE_GROUPS, chordFeatures } from './chord-features.js';
import { board, fitBoard, setsSpan, voicingSpan } from './board.js';
import { play } from './audio.js';
import { getInstrument, onInstrumentChange } from './instrument.js';
import { arpeggioAround, arpeggioNotes, upAndDown } from './arpeggio.js';
import { playNotes } from './player.js';
import { tabOf } from './share.js';
import { loadVoicings, getVoicings, voicingGallery } from './voicings.js';

const STORE_KEY = 'gtr-chords-v1';

const labelFor = chordLabel;

// Keep insertion order from music.js's CHORDS table - it's already grouped
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
      <label class="big desk">Root</label>
      <nav class="rootpicker" id="ch-roots" aria-label="Root note"></nav>
      <div class="row phoneonly">
        <label class="keylab">Root <select id="ch-rootsel"></select></label>
        <label class="keylab">Chord <select id="ch-typesel"></select></label>
      </div>
    </section>
    <section id="ch-detail"></section>
  `;

  const rootsEl = root.querySelector('#ch-roots'), detail = root.querySelector('#ch-detail');

  /** @type {{root:number, suffix:string, labels:string, voicing:'all'|number, builder:string[], arp:boolean}} */
  const state = { root: 0, suffix: '', labels: 'notes', voicing: 'all', builder: [], arp: false }; // default C major
  try{
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if(saved) Object.assign(state, saved);
  }catch(e){}
  function save(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }catch(e){} }

  // "#chords?r=<root>&s=<suffix>" (from the Identify tab) selects a chord.
  function applyHash(){
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    if(tabOf(location.hash) !== 'chords' || !q.has('r')) return false;
    const r = +(q.get('r') ?? NaN), suf = q.get('s') ?? '';
    if(!Number.isInteger(r) || r < 0 || r > 11 || !Object.prototype.hasOwnProperty.call(CHORDS, suf)) return false;
    state.root = r; state.suffix = suf; state.voicing = 'all'; state.builder = [];
    return true;
  }
  applyHash();

  rootsEl.innerHTML = SHARP.map((n, i) =>
    `<button class="chip" type="button" data-r="${i}" aria-pressed="${i === state.root}"><b>${esc(n)}</b></button>`
  ).join('');
  rootsEl.querySelectorAll('.chip').forEach(b => b.onclick = () => {
    state.root = +b.dataset.r; state.voicing = 'all'; save(); render();
  });

  const rootSel = root.querySelector('#ch-rootsel'), typeSel = root.querySelector('#ch-typesel');
  rootSel.innerHTML = SHARP.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join('');
  typeSel.innerHTML = SUFFIXES.map(suf => `<option value="${esc(suf)}">${esc(labelFor(suf))}</option>`).join('');
  rootSel.onchange = () => { state.root = +rootSel.value; state.voicing = 'all'; save(); render(); };
  typeSel.onchange = () => { state.suffix = typeSel.value; state.voicing = 'all'; save(); render(); };
  // The builder starts folded on phones (it is long) and open where there is room.
  let builderOpen = matchMedia('(min-width:760px)').matches;

  let loaded = false;
  loadVoicings().then(() => { loaded = true; render(); });

  function builderHtml(){
    const sel = state.builder, n = matching(sel).length;
    const groups = FEATURE_GROUPS.map(g => `<div class="bgroup"><span class="bl">${esc(g.label)}</span><div class="seg bseg" role="group" aria-label="${esc(g.label)}">${g.items.map(([id, lab]) => {
      const off = !sel.includes(id) && !matching(toggled(sel, id)).length;
      return `<button type="button" data-f="${esc(id)}" aria-pressed="${sel.includes(id)}"${off ? ' disabled' : ''}>${esc(lab)}</button>`;
    }).join('')}</div></div>`).join('');
    return `<details class="fold" id="ch-builder"${builderOpen ? ' open' : ''}><summary>Build a chord${sel.length ? ` <span class="bcount">\u00b7 ${sel.length} filter${sel.length === 1 ? '' : 's'}, ${n} match${n === 1 ? '' : 'es'}</span>` : ''}</summary><div class="builder">${groups}<div class="brow"><button type="button" class="bclear" id="ch-bclear"${sel.length ? '' : ' disabled'}>Clear</button><span class="bcount">${sel.length ? `${n} chord type${n === 1 ? '' : 's'} match` : 'Toggle to build a chord - the list below narrows as you go.'}</span></div></div></details>`;
  }
  function applyBuilder(sel){
    state.builder = sel;
    const exact = SUFFIXES.filter(suf => FEATS[suf].size === sel.length && sel.every(f => FEATS[suf].has(f)));
    if(exact.length){ state.suffix = exact[0]; state.voicing = 'all'; }
    save(); render();
  }

  let refit = () => {};
  root.addEventListener('fw-shown', () => refit());
  function render(){
    rootsEl.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.r === state.root)));
    rootSel.value = String(state.root); typeSel.value = state.suffix;
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
    // Arpeggio shape: every chord tone in the fret window of the voicing, with the
    // voicing itself ringed; otherwise the neck dims to just the voicing.
    const chordPcs = iv.map(x => (state.root + x) % 12);
    const arpSets = vo ? arpeggioAround(vo, inst, chordPcs) : null;
    const showArp = !!vo && state.arp;
    if(vo && showArp){ boardOpts.voicingRing = vo; boardOpts.brightSets = arpSets; }
    else if(vo){ boardOpts.voicing = vo; boardOpts.fingerLabels = state.labels === 'fingers'; }
    const voRow = voicings.length
      ? `<h3 class="vh">Voicings <span class="hint">tap one to show it on the neck</span></h3>${voicingGallery(voicings, state.voicing === 'all' ? -1 : state.voicing - 1, { id: 'ch-voseg', base: 1, mirror: inst.leftHanded })}
         ${vo ? `<div class="row"><label class="chk"><input type="checkbox" id="ch-arp"${state.arp ? ' checked' : ''}> Arpeggio shape</label>
          <button type="button" class="share" id="ch-arpplay">Play arpeggio</button></div>` : ''}`
      : (loaded ? `<p class="hint">No stored voicing for this chord in this tuning - the neck shows every chord tone.</p>` : '');
    // the scales that fit this chord (in the key it points to), each a link that opens the scale with this chord's notes shown in it
    const parsed = parseChord(name), key = parsed ? detectKey([parsed]) : null;
    const fits = parsed && key ? chordScales(parsed, key).slice(0, 8) : [];
    const scalesStrip = fits.length ? `<h3>Scales that fit ${esc(name)}</h3><p class="hint">Open one to see it on the neck with this chord's notes marked.</p><div class="chiprow" id="ch-scales">${fits.map(f =>
      `<a class="chip lnk" href="#scales?r=${f.root}&s=${f.s.id}&cr=${state.root}&cs=${encodeURIComponent(state.suffix)}" title="${esc(f.s.name)}: fit ${Math.round(f.score * 100)}%"><b>${esc(spell(f.root, false))} ${esc(f.s.short || f.s.name)}</b><span>${Math.round(f.score * 100)}%</span></a>`).join('')}</div>` : '';
    let h = `${builderHtml()}
      <div class="chordhead"><h2>${esc(spell(state.root, false))} ${esc(labelFor(state.suffix))}</h2><p>Tones ${esc(iv.map(x => spell(state.root + x, false)).join(' '))}</p></div>
      <div class="boardbar"><div class="scaletitle">Chord tones on the neck</div>
        <div class="controls"><div class="seg" role="group" aria-label="Fretboard labels">
          <button type="button" data-l="notes" aria-pressed="${state.labels === 'notes'}">Note names</button>
          <button type="button" data-l="intervals" aria-pressed="${state.labels === 'intervals'}">Intervals</button>${vo ? `
          <button type="button" data-l="fingers" aria-pressed="${state.labels === 'fingers'}">Fingers</button>` : ''}</div>
          <button type="button" class="play" id="ch-play">\u25B6 Play chord</button>
          <button type="button" class="share" id="ch-clear" title="Clear the voicing, the arpeggio shape and the builder filters"${state.voicing === 'all' && !state.arp && !state.builder.length ? ' disabled' : ''}>Clear</button></div></div>
      ${voRow}
      <div class="board" tabindex="0" aria-label="Fretboard, scroll sideways">${board(chord, sug, state.labels === 'fingers' ? 'notes' : state.labels, false, boardOpts)}</div>
      <div class="legend"><span><i style="background:#C23B2E"></i>Root</span><span><i style="background:#E3A21A"></i>Chord tone</span></div>
      ${scalesStrip}
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
    detail.querySelectorAll('#ch-voseg button').forEach(b => b.onclick = () => {
      const v = +b.dataset.vo;
      state.voicing = state.voicing === v ? 'all' : v; // tapping the chosen one again clears it
      if(state.voicing !== 'all' && state.labels === 'notes') state.labels = 'fingers';
      save(); render();
    });
    detail.querySelector('#ch-clear').onclick = () => { state.voicing = 'all'; state.arp = false; state.builder = []; if(state.labels === 'fingers') state.labels = 'notes'; save(); render(); };
    const fb = detail.querySelector('#ch-builder'); if(fb) fb.addEventListener('toggle', () => { builderOpen = fb.open; });
    const span = boardOpts.brightSets ? setsSpan(boardOpts.brightSets) : vo ? voicingSpan(vo) : null;
    refit = () => fitBoard(detail.querySelector('.board'), span, inst.leftHanded); refit();
    const ca = detail.querySelector('#ch-arp'); if(ca) ca.onchange = () => { state.arp = ca.checked; save(); render(); };
    const cap = detail.querySelector('#ch-arpplay'); if(cap) cap.onclick = () => playNotes(upAndDown(arpeggioNotes(arpSets, inst)));
    detail.querySelector('#ch-play').onclick = () => play(chord, { iv }, getInstrument().audioOffset, null, vo ? vo.f.map((f, j) => f >= 0 ? inst.midi[j] + f : null).filter(m => m !== null) : null);
  }

  render();
  window.addEventListener('hashchange', () => { if(applyHash()) render(); });
  onInstrumentChange(() => render());
}
