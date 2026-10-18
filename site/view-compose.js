import { esc, parseChord } from './music.js';
import { getInstrument, getSetup, applySetup, onInstrumentChange } from './instrument.js';
import { encodeTabLink, decodeTabLink } from './tab-share.js';
import { tabOf } from './share.js';
import { playbackFold, openWhereRoom, bindStrum } from './playback-ui.js';
import { getStrum } from './strum-patterns.js';
import { expandChart } from './chart.js';
import { chordScales, scalesInKey, pickId } from './scalefit.js';
import { loadVoicings, getVoicings, voicingDiagram, voicingLabel } from './voicings.js';
import { PROGRESSION_LIBRARY, libraryOptions, keyForTemplate, keyValue, barChords } from './progressions.js';
import { templateBars } from './progressions.js';
import { generateSolo, scaleFor, soloContext, STYLES, DENSITIES, FEELS, EVOLVES, TENSIONS } from './solo.js';
import { SWINGS } from './transport.js';
import { keyName, spell, SC } from './music.js';
import { getPositions, positionFrets } from './positions.js';
import { board, fitBoard } from './board.js';
import { chordMidiNotes } from './audio.js';
import { startTab } from './player.js';
import * as T0 from './tab.js';
import { emptyTab, putNote, removeNote, setLength, addBar, removeBar, putChord, setChordPlan, chordAt, chordTimeline, chordsUsed, setVoicing, setBpm, clearNotes, noteAt, noteCovering, tabEvents,
  stepSeconds, normalizeTab, createHistory, tabToText, withChords, STEPS, BEAT, MAX_FRET, LENGTHS, LENGTH_NAMES, TRIPLET_OF, gridFor, setTechnique, linkedNext, BENDS, BEND_NAMES } from './tab.js';
import { tabSvg, barsPerRowFor, stepPos } from './tab-view.js';

const STORE_KEY = 'fw-tabs';

export function mount(root){
  root.innerHTML = `
    <header>
      <h1>Compose</h1>
      <p class="lead">Write a riff or solo as tab - or let the generator write one over your chords. Click a spot, type the fret number, and it plays back.</p>
    </header>
    <div class="stickybar" role="group" aria-label="Playback and generator">
      <button type="button" class="play" id="tb-play">\u25B6 Play</button>
      <button type="button" class="play" id="tb-gen-go" title="Write a solo over the chords (settings below)">Generate</button>
      <button type="button" class="share" id="tb-gen-new" title="Generate again with a new seed" aria-label="Another one: generate again with a new seed"><span aria-hidden="true">\u21BB</span> Another<span class="lbl"> one</span></button>
      <button type="button" class="share" id="tb-undo" aria-label="Undo"><span aria-hidden="true">\u21B6</span><span class="lbl"> Undo</span></button>
      <button type="button" class="share" id="tb-redo" aria-label="Redo"><span aria-hidden="true">\u21B7</span><span class="lbl"> Redo</span></button>
    </div>
    <p class="status" id="tb-genmsg" role="status" aria-live="polite"></p>
    <div class="sharebar" role="group" aria-label="Share and export">
      <label class="keylab">Title <input id="tb-title" type="text" size="22" maxlength="80" autocomplete="off"></label>
      <button type="button" class="share" id="tb-share" title="A link that opens this tab (notes, chords, settings and seed) for someone else">Copy link</button>
      <button type="button" class="share" id="tb-pdf" title="Print the tab with its chord boxes - choose Save as PDF in the print dialog">Export PDF</button>
      <button type="button" class="share" id="tb-copy" title="The tab as plain text, to paste into notes or a message">Copy as text</button>
      <span class="vometa" id="tb-msg" role="status" aria-live="polite"></span>
    </div>
    ${playbackFold('tb', `<label class="chk"><input type="checkbox" id="tb-backing"> Play the bar chords</label>
        <label class="keylab" title="Plays straight eighths long-short. Notes written as triplets are not changed.">Swing <select id="tb-swing">${SWINGS.map(x => `<option value="${x.id}">${x.name}</option>`).join('')}</select></label>`)}
    <details class="fold" id="tb-gen"><summary>Solo generator settings</summary>
      <p class="hint">Name the chords in the tab (or load a progression), then press Generate above. It replaces the notes - Undo brings yours back.</p>
      <div class="row">
        <label class="keylab">Load <select id="tb-prog" aria-label="Load a progression"></select></label>
        <label class="keylab" title="How many times to play the progression: Auto repeats it until there are at least 8 bars">Repeat <select id="tb-repeat"><option value="auto">Auto</option>${[1, 2, 3, 4, 6, 8].map(n => `<option value="${n}">\u00d7${n}</option>`).join('')}</select></label>
        <button type="button" class="share" id="tb-useprog">Load chords</button>
      </div>
      <div class="row">
        <label class="keylab" title="Bars are separated by | (two chords in a bar share it). Repeat a group with (Am F)x2, a section with |: Am F :| (:|x3 for three times), the previous bar with %. Replaces the chords of the tab; your notes stay.">Or type a chart <input id="tb-chart" type="text" size="34" maxlength="400" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="|: Am | F | C G :|x2 | E7"></label>
        <button type="button" class="share" id="tb-usechart">Load chart</button>
      </div>
      <div class="row">
        <label class="keylab">Style <select id="tb-style">${STYLES.map(x => `<option value="${x.id}">${x.name}</option>`).join('')}</select></label>
        <label class="keylab">Density <select id="tb-density">${DENSITIES.map(x => `<option value="${x.id}">${x.name}</option>`).join('')}</select></label>
        <label class="keylab" title="How the solo develops over the song: higher and busier towards a peak">Evolve <select id="tb-evolve">${EVOLVES.map(x => `<option value="${x.id}">${x.name}</option>`).join('')}</select></label>
        <label class="keylab">Feel <select id="tb-feel">${FEELS.map(x => `<option value="${x.id}">${x.name}</option>`).join('')}</select></label>
        <label class="keylab" title="How much the line leans on chord tones. Real jazz solos land on a chord tone on only about half of their strong beats; the textbook rule would be nearly all of them.">Chord tones <select id="tb-tension">${TENSIONS.map(x => `<option value="${x.id}">${x.name}</option>`).join('')}</select></label>
        <label class="keylab" title="Hammer-ons, pull-offs, slides, bends and vibrato">Techniques <select id="tb-gentech"><option value="off">Off</option><option value="some">Some</option><option value="lots">Lots</option></select></label>
        <label class="keylab" title="The key the solo is written in. Auto works it out from the chords; pick a key to set it yourself - and to load a progression in that key.">Key <select id="tb-key"></select></label>
        <label class="keylab">Seed <input id="tb-seed" type="number" min="1" max="999999" step="1" inputmode="numeric"></label>
      </div>
      <div class="row">
        <label class="chk"><input type="checkbox" id="tb-autoplay"> Play it straight after generating</label>
      </div>
    </details>

    <div class="row">
      <label class="keylab">Length <div class="seg" id="tb-len" role="group" aria-label="Note length">${LENGTH_NAMES.map((n, i) => `<button type="button" data-len="${i}" aria-pressed="false">${n}</button>`).join('')}</div></label>
      <label class="chk" title="Three in the time of two (1/16, 1/8, 1/4 and 1/2 notes)"><input type="checkbox" id="tb-trip"> Triplet</label>
    </div>
    <div class="row">
      <label class="keylab">Technique <div class="seg" id="tb-tech" role="group" aria-label="Technique of the note at the cursor">
        <button type="button" data-tech="h" aria-pressed="false" title="Hammer-on or pull-off into the next note on this string (h)">Hammer / pull</button>
        <button type="button" data-tech="s" aria-pressed="false" title="Slide into the next note on this string (s)">Slide</button>
        <button type="button" data-tech="b" aria-pressed="false" title="Bend up: tap again for a bigger bend (b)">Bend</button>
        <button type="button" data-tech="v" aria-pressed="false" title="Vibrato (v)">Vibrato</button></div></label>
    </div>
    <div class="row">
      <label class="keylab">Chord at bar <span id="tb-barno">1</span>, beat <span id="tb-beat">1</span> <input id="tb-chord" type="text" size="7" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Am7"></label>
      <button type="button" class="share" id="tb-addbar">Add bar</button>
      <button type="button" class="share" id="tb-delbar">Delete bar</button>
      <button type="button" class="share" id="tb-clear">Clear notes</button>
    </div>
    <div id="tb-chords" class="chordsum"></div>
    <div id="tb-plan" class="plansum"></div>
    <div class="tabwrap" id="tb-surface" tabindex="0" role="group" aria-label="Tab editor. Arrow keys move the cursor, digits set a fret, Delete removes a note, Space plays."></div>
    <div class="numpad" id="tb-pad" role="group" aria-label="Number pad">
      ${[0,1,2,3,4,5,6,7,8,9].map(d => `<button type="button" data-d="${d}">${d}</button>`).join('')}
      <button type="button" data-k="Backspace" aria-label="Delete note">⌫</button>
      <button type="button" data-k="ArrowLeft" aria-label="Move left">←</button>
      <button type="button" data-k="ArrowRight" aria-label="Move right">→</button>
      <button type="button" data-k="ArrowUp" aria-label="Up a string">↑</button>
      <button type="button" data-k="ArrowDown" aria-label="Down a string">↓</button>
    </div>
    <p class="hint">Click a spot on the tab, type a fret (two digits for 10 and up), and the cursor moves on by the note length. Arrow keys move, Delete removes, Space plays, Ctrl+Z undoes.</p>
  `;
  const $ = sel => root.querySelector(sel);
  const surface = $('#tb-surface'), playBtn = $('#tb-play'), undoBtn = $('#tb-undo'), redoBtn = $('#tb-redo'), bpmIn = $('#tb-bpm'),
        lenSeg = $('#tb-len'), chordIn = $('#tb-chord'), barNo = $('#tb-barno'), msg = $('#tb-msg'), titleIn = $('#tb-title'),
        tripCb = $('#tb-trip'), techSeg = $('#tb-tech'), backingCb = $('#tb-backing'), metroCb = $('#tb-metro'), loopCb = $('#tb-loop');

  // --- state ---------------------------------------------------------------
  const opts = { backing: true, metro: false, loop: true, unit: 1, tech: 'some', evolve: 'gentle', tension: 'balanced', repeat: /** @type {string|number} */ ('auto'), autoplay: true, triplet: false, swing: 'straight', feel: 'mixed', style: 'follow', density: 'medium', key: 'auto', seed: 1 + Math.floor(Math.random() * 999999) };
  /** @type {Record<string, any>} */ let stored = {};
  try { stored = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { /* defaults */ }
  if (stored.opts && typeof stored.opts === 'object') {
    opts.backing = stored.opts.backing !== false; opts.metro = stored.opts.metro !== false; opts.loop = stored.opts.loop === true;
    if (STYLES.some(x => x.id === stored.opts.style)) opts.style = stored.opts.style;
    if (DENSITIES.some(x => x.id === stored.opts.density)) opts.density = stored.opts.density;
    if (typeof stored.opts.key === 'string' && /^(auto|\d+:(major|minor))$/.test(stored.opts.key)) opts.key = stored.opts.key;
    if (Number.isInteger(stored.opts.seed) && stored.opts.seed > 0 && stored.opts.seed <= 999999) opts.seed = stored.opts.seed;
    if (Number.isInteger(stored.opts.unit) && stored.opts.unit >= 0 && stored.opts.unit < LENGTHS.length) opts.unit = stored.opts.unit;
    opts.triplet = stored.opts.triplet === true;
    if (['off', 'some', 'lots'].includes(stored.opts.tech)) opts.tech = stored.opts.tech;
    if (SWINGS.some(x => x.id === stored.opts.swing)) opts.swing = stored.opts.swing;
    if (FEELS.some(x => x.id === stored.opts.feel)) opts.feel = stored.opts.feel;
    if (EVOLVES.some(x => x.id === stored.opts.evolve)) opts.evolve = stored.opts.evolve;
    if (TENSIONS.some(x => x.id === stored.opts.tension)) opts.tension = stored.opts.tension;
    if (stored.opts.repeat === 'auto' || [1, 2, 3, 4, 6, 8].includes(stored.opts.repeat)) opts.repeat = stored.opts.repeat;
    opts.autoplay = stored.opts.autoplay !== false;
  }
  /** One undo history per instrument: frets mean different notes on different strings. */
  const histories = {};
  function historyFor(id){ return histories[id] ||= createHistory(normalizeTab(stored.tabs?.[id]) || emptyTab(4)); }
  let hist = historyFor(getInstrument().id);
  const tab = () => hist.current;
  function persist(){
    try {
      const tabs = Object.fromEntries(Object.entries(histories).map(([k, h]) => [k, h.current]));
      localStorage.setItem(STORE_KEY, JSON.stringify({ tabs: { ...stored.tabs, ...tabs }, opts }));
    } catch (e) { /* storage unavailable */ }
  }

  const cursor = { bar: 0, at: 0, s: Math.floor(getInstrument().midi.length / 2) };
  /** The fret being typed: kept until its timer ends so a second digit can extend it. @type {{bar:number, at:number, s:number, f:number, len:number}|null} */
  let pending = null, pendingTimer = /** @type {any} */ (0);
  let player = null, playStep = -1;

  // --- editing -------------------------------------------------------------
  /** The length notes are entered with: the straight length, or its triplet when the Triplet box is on and it has one. */
  const unitLen = () => (opts.triplet && TRIPLET_OF[LENGTHS[opts.unit]]) || LENGTHS[opts.unit];
  const snap = () => { const g = gridFor(unitLen()); cursor.at = Math.floor(cursor.at / g) * g; };
  function commit(t){ hist.push(t); persist(); }
  function clampCursor(){
    const n = getInstrument().midi.length;
    cursor.bar = Math.max(0, Math.min(cursor.bar, tab().bars.length - 1));
    cursor.at = Math.max(0, Math.min(cursor.at, STEPS - 1));
    cursor.s = Math.max(0, Math.min(cursor.s, n - 1));
  }
  /** Move the cursor by `steps` grid steps, across bars; false if it ran off the end. */
  function moveBy(steps){
    let abs = cursor.bar * STEPS + cursor.at + steps;
    const last = tab().bars.length * STEPS - 1;
    if (abs < 0) abs = 0;
    const over = abs > last;
    if (over) abs = last;
    cursor.bar = Math.floor(abs / STEPS); cursor.at = abs % STEPS;
    return !over;
  }
  function cancelPending(){ clearTimeout(pendingTimer); pending = null; }
  function flushPending(){
    if (!pending) return;
    const p = pending; cancelPending();
    cursor.bar = p.bar; cursor.at = p.at; cursor.s = p.s;
    if (!moveBy(p.len)) { hist.replace(addBar(tab())); cursor.bar = tab().bars.length - 1; cursor.at = 0; persist(); } // typed past the end: grow
    render(true);
  }
  function typeDigit(d){
    clampCursor();
    if (pending && pending.bar === cursor.bar && pending.at === cursor.at && pending.s === cursor.s) {
      const f = pending.f * 10 + d;
      if (f <= MAX_FRET) { // 1 then 2 within the window means fret 12; the two keystrokes are one undo step
        pending.f = f; hist.replace(putNote(tab(), cursor.bar, cursor.at, cursor.s, f, pending.len)); persist();
        clearTimeout(pendingTimer); pendingTimer = setTimeout(flushPending, 700); render(); return;
      }
      flushPending();
    }
    const len = unitLen();
    commit(putNote(tab(), cursor.bar, cursor.at, cursor.s, d, len));
    const placed = noteAt(tab(), cursor.bar, cursor.at, cursor.s);
    pending = { bar: cursor.bar, at: cursor.at, s: cursor.s, f: d, len: placed ? placed.len : len };
    clearTimeout(pendingTimer); pendingTimer = setTimeout(flushPending, 700);
    render();
  }
  function deleteAtCursor(backspace){
    cancelPending();
    const t = removeNote(tab(), cursor.bar, cursor.at, cursor.s);
    if (t !== tab()) { commit(t); }
    else if (backspace) moveBy(-unitLen());
    render(true);
  }
  function key(k, e){
    if (/^[0-9]$/.test(k)) { typeDigit(+k); return true; }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { cancelPending(); moveBy(k === 'ArrowLeft' ? -unitLen() : unitLen()); render(true); return true; }
    if (k === 'ArrowUp' || k === 'ArrowDown') { cancelPending(); cursor.s += k === 'ArrowUp' ? -1 : 1; clampCursor(); render(true); return true; }
    if (k === 'Backspace' || k === 'Delete') { deleteAtCursor(k === 'Backspace'); return true; }
    if (k === ' ') { cancelPending(); togglePlay(); return true; }
    if (!e?.ctrlKey && !e?.metaKey && ['h', 's', 'b', 'v'].includes(k.toLowerCase()) && toggleTech(k.toLowerCase())) return true;
    if ((e?.ctrlKey || e?.metaKey) && k.toLowerCase() === 'z') { cancelPending(); e.shiftKey ? hist.redo() : hist.undo(); persist(); clampCursor(); render(); return true; }
    if ((e?.ctrlKey || e?.metaKey) && k.toLowerCase() === 'y') { cancelPending(); hist.redo(); persist(); clampCursor(); render(); return true; }
    return false;
  }

  // --- techniques of the note under the cursor ---
  const noteForTech = () => T0.noteAt(tab(), cursor.bar, cursor.at, cursor.s) || T0.noteCovering(tab(), cursor.bar, cursor.at, cursor.s);
  function toggleTech(k){
    const n = noteForTech(); if (!n) return false;
    cancelPending();
    /** @type {{link?:''|'h'|'s', bend?:number, vib?:boolean}} */ let patch = {};
    if (k === 'h' || k === 's') patch = { link: n.link === k ? '' : k };
    else if (k === 'b') patch = { bend: n.bend ? (BENDS[BENDS.indexOf(n.bend) + 1] ?? 0) : BENDS[0] };
    else if (k === 'v') patch = { vib: !n.vib };
    const t = setTechnique(tab(), cursor.bar, n.at, n.s, patch);
    if (t !== tab()) commit(t);
    render(); return true;
  }
  function renderTech(){
    const n = noteForTech(), linkable = !!(n && linkedNext(tab().bars[cursor.bar].notes, n));
    techSeg.querySelectorAll('button').forEach(b => {
      const k = b.dataset.tech;
      const on = !!n && (k === 'h' ? n.link === 'h' : k === 's' ? n.link === 's' : k === 'b' ? !!n.bend : !!n.vib);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = !n || ((k === 'h' || k === 's') && !linkable) || ((k === 'b' || k === 'v') && n.link === 's');
      if (k === 'b') b.textContent = n?.bend ? `Bend ${BEND_NAMES[BENDS.indexOf(n.bend)]}` : 'Bend';
    });
  }

  // --- drawing ---------------------------------------------------------------
  let perRow = 1;
  function render(reveal = false){
    const inst = getInstrument();
    clampCursor();
    perRow = barsPerRowFor(surface.clientWidth || 360);
    surface.innerHTML = tabSvg(tab(), inst, { perRow, cursor: { ...cursor, w: unitLen() }, editable: true, grid: gridFor(unitLen()) });
    tripCb.checked = opts.triplet && !!TRIPLET_OF[LENGTHS[opts.unit]]; tripCb.disabled = !TRIPLET_OF[LENGTHS[opts.unit]];
    if (playStep >= 0) drawPlayhead(playStep);
    undoBtn.disabled = !hist.canUndo; redoBtn.disabled = !hist.canRedo;
    lenSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.len === opts.unit)));
    if (document.activeElement !== bpmIn) bpmIn.value = String(tab().bpm);
    if (document.activeElement !== titleIn) titleIn.value = tab().title;
    barNo.textContent = String(cursor.bar + 1);
    $('#tb-beat').textContent = String(Math.round((1 + cursor.at / BEAT) * 100) / 100);
    const c = chordAt(tab(), cursor.bar, cursor.at)?.name ?? '';
    if (document.activeElement !== chordIn) chordIn.value = c;
    chordIn.setAttribute('aria-invalid', String(!!chordIn.value && !parseChord(chordIn.value)));
    renderChords(inst);
    renderPlan(inst);
    renderTech();
    $('#tb-delbar').disabled = tab().bars.length <= 1;
    $('#tb-addbar').disabled = tab().bars.length >= 64;
    if (reveal) surface.querySelector('.tabcursor')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  /** The voicing (0-based index into the stored ones) used for a chord name. */
  function voicingOf(inst, name){
    const c = parseChord(name); if (!c) return { list: [], k: 0 };
    const list = getVoicings(inst, c.root, c.suf);
    return { list, k: Math.min(tab().voicings?.[name] ?? 0, Math.max(0, list.length - 1)) };
  }
  // Every chord named in the tab, with a voicing you can step through.
  const chordsEl = $('#tb-chords');
  function renderChords(inst){
    const names = chordsUsed(tab());
    if (!names.length) { chordsEl.innerHTML = '<p class="hint">Chords you name in the tab appear here with a voicing to play them.</p>'; return; }
    chordsEl.innerHTML = `<h2 class="bh">Chords used</h2><div class="vogal" role="group" aria-label="Chords used">${names.map(name => {
      const { list, k } = voicingOf(inst, name), v = list[k];
      const label = v ? `${voicingLabel(v)}${v.b ? ' \u00b7 barre' : ''}${list.length > 1 ? ` \u00b7 ${k + 1} of ${list.length}` : ''}` : parseChord(name) ? 'no voicing' : 'unknown chord';
      return `<button type="button" class="chip vobtn" data-name="${esc(name)}"${list.length > 1 ? ` title="Tap for the next voicing"` : ''}><b>${esc(name)}</b>${v ? voicingDiagram(v, { label: false, mirror: inst.leftHanded }) : ''}<span>${esc(label)}</span></button>`;
    }).join('')}</div>`;
  }
  // The scale and positions the solo generator uses over the chord in effect at the cursor
  // (that one occurrence: a chord that comes back later can be played differently).
  const planEl = $('#tb-plan');
  let planOpen = false, planSig = ''; // folded by default: the tab is what you came for
  function chordInEffect(){
    const step = cursor.bar * STEPS + cursor.at;
    return chordTimeline(tab()).filter(c => c.step <= step).pop() || null;
  }
  function renderPlan(inst){
    const m = chordInEffect(), chord = m && parseChord(m.name);
    const marker = m ? tab().bars[m.bar].chords.find(c => c.at === m.at) : undefined;
    if (!m || !chord || !marker) { planEl.innerHTML = ''; planSig = ''; return; }
    const sig = JSON.stringify([m, marker, opts.style, opts.key, inst.id, inst.tuning, inst.capo, inst.leftHanded, chordsUsed(tab())]);
    if (sig === planSig) return;
    planSig = sig;
    const [kt, kmode] = opts.key === 'auto' ? [] : opts.key.split(':');
    const ctx = soloContext(tab().bars, opts.style, opts.key === 'auto' ? undefined : { t: +kt, mode: /** @type {'major'|'minor'} */ (kmode) });
    const eff = scaleFor(opts.style, chord, marker, ctx.key, ctx.dominants, ctx.chords), auto = scaleFor(opts.style, chord, undefined, ctx.key, ctx.dominants, ctx.chords);
    const scale = SC[eff.scaleId], positions = getPositions(scale.iv, eff.root, inst.tuning);
    const chosen = (marker.positions || []).filter(n => n <= positions.length);
    const nameOf = (/** @type {string} */ id, /** @type {number} */ root) => `${spell(root, false)} ${SC[id].name}`;
    /** @type {Map<string, string>} */
    const inKeyOpts = new Map(), chordOpts = new Map();
    for (const f of scalesInKey(chord, ctx.key, ctx.chords)) inKeyOpts.set(pickId(f.s.id, f.root, chord.root), nameOf(f.s.id, f.root));
    for (const f of chordScales(chord, ctx.key, ctx.chords)) { const k = pickId(f.s.id, f.root, chord.root); if (!inKeyOpts.has(k)) chordOpts.set(k, nameOf(f.s.id, f.root)); }
    for (const x of ['minpent', 'majpent', 'blues']) if (!inKeyOpts.has(x) && !chordOpts.has(x)) chordOpts.set(x, nameOf(x, chord.root));
    if (marker.scale && !inKeyOpts.has(marker.scale) && !chordOpts.has(marker.scale)) chordOpts.set(marker.scale, nameOf(eff.scaleId, eff.root));
    const group = (/** @type {string} */ label, /** @type {Map<string, string>} */ m) => m.size ? `<optgroup label="${label}">${[...m].map(([id, nm]) => `<option value="${id}">${esc(nm)}</option>`).join('')}</optgroup>` : '';
    const where = `${m.name} (bar ${m.bar + 1}, beat ${Math.round((1 + m.at / BEAT) * 100) / 100})`;
    const summary = `Scale and position \u00b7 ${esc(where)}: ${esc(scale.short || scale.name)}${chosen.length ? ', position ' + chosen.join(' + ') : ''}`;
    const chordPcs = chord.iv.map(x => (chord.root + x) % 12);
    const bchord = { root: eff.root, iv: chordPcs.map(pc => (pc - eff.root + 12) % 12), name: m.name };
    /** @type {import('./types.js').BoardOptions} */
    const bo = { tuning: inst.tuning, stringWidths: inst.stringWidths, leftHanded: inst.leftHanded, capo: inst.capo };
    if (chosen.length) {
      const idxs = chosen.map(n => n - 1), sets = idxs.map(k => positionFrets(positions, k, scale.iv, eff.root, inst.tuning, inst.midi));
      bo.dimRange = { s: Math.min(...idxs.map(k => positions[k].s)), e: Math.max(...idxs.map(k => positions[k].e)) };
      bo.brightSets = inst.tuning.map((_, j) => new Set(sets.flatMap(st => [...st[j]])));
    }
    planEl.innerHTML = `<details class="fold" id="tb-planfold"${planOpen ? ' open' : ''}><summary>${summary}</summary>
      <div class="row">
        <label class="keylab">Scale <select id="tb-planscale" aria-label="Scale for ${esc(m.name)}"><option value="">Auto: ${esc(spell(auto.root, false))} ${esc(SC[auto.scaleId].name)}</option>${group('Scales in the key', inKeyOpts)}${group('Scales for ' + m.name, chordOpts)}</select></label>
        <label class="keylab">Position <div class="seg" id="tb-planpos" role="group" aria-label="Positions to play in">
          <button type="button" data-pos="all" aria-pressed="${!chosen.length}">All</button>${positions.map(p => `<button type="button" data-pos="${p.n}" title="Toggle this position" aria-pressed="${chosen.includes(p.n)}">${p.n}</button>`).join('')}</div></label>
      </div>
      <p class="hint">Used the next time you generate. It applies to this chord only - the same chord later in the song can have its own scale and position.</p>
      <div class="board" id="tb-planboard" tabindex="0" aria-label="Fretboard showing the scale and position, scroll sideways">${board(bchord, { s: { iv: scale.iv, name: scale.name } }, 'notes', false, bo)}</div>
    </details>`;
    const sel = /** @type {HTMLSelectElement} */ (planEl.querySelector('#tb-planscale')); sel.value = marker.scale || '';
    sel.onchange = () => { commit(setChordPlan(tab(), m.bar, m.at, { scale: sel.value })); render(); };
    planEl.querySelectorAll('#tb-planpos button').forEach(b => b.onclick = () => {
      const v = b.dataset.pos;
      const next = v === 'all' ? [] : chosen.includes(+v) ? chosen.filter(n => n !== +v) : [...chosen, +v];
      commit(setChordPlan(tab(), m.bar, m.at, { positions: next })); render();
    });
    const fold = /** @type {HTMLDetailsElement} */ (planEl.querySelector('#tb-planfold')); fold.addEventListener('toggle', () => { planOpen = fold.open; });
    fitBoard(planEl.querySelector('#tb-planboard'), bo.dimRange, inst.leftHanded);
  }
  chordsEl.addEventListener('click', e => {
    const b = e.target instanceof Element && e.target.closest('button[data-name]'); if (!b) return;
    const name = b.dataset.name, { list, k } = voicingOf(getInstrument(), name);
    if (list.length > 1) { commit(setVoicing(tab(), name, (k + 1) % list.length)); render(); }
  });
  function drawPlayhead(step){
    const svg = surface.querySelector('svg'); if (!svg) return;
    const n = getInstrument().midi.length, { x, y } = stepPos(n, perRow, Math.floor(step / STEPS), step % STEPS);
    let r = svg.querySelector('.tabplayhead');
    if (!r) { r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); r.setAttribute('class', 'tabplayhead'); svg.appendChild(r); }
    r.setAttribute('x', String(x)); r.setAttribute('y', String(y - 8)); r.setAttribute('width', '3'); r.setAttribute('height', String((n - 1) * 16 + 16));
    if (step % STEPS === 0 && perRow === 1) r.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // --- playback ----------------------------------------------------------------
  function chordsToPlay(inst){
    return chordTimeline(tab()).flatMap(m => {
      const c = parseChord(m.name); if (!c) return [];
      const { list, k } = voicingOf(inst, m.name), v = list[k];
      const midi = v ? v.f.map((f, j) => f >= 0 ? inst.midi[j] + f : null).filter(m2 => m2 !== null) : chordMidiNotes(c, inst.audioOffset);
      return [{ step: m.step, midi }];
    });
  }
  function stopPlay(){ if (player) { const p = player; player = null; p.stop(); } }
  function togglePlay(){
    if (player) { stopPlay(); return; }
    const inst = getInstrument();
    setRunning(true);
    player = startTab({
      events: tabEvents(tab(), inst), chords: opts.backing ? chordsToPlay(inst) : [], totalSteps: tab().bars.length * STEPS, beat: BEAT, swing: SWINGS.find(x => x.id === opts.swing)?.long ?? 0.5,
      stepSec: stepSeconds(tab().bpm), loop: opts.loop, metronome: opts.metro, strum: getStrum(),
      onStep: step => { playStep = step; if (step >= 0) drawPlayhead(step); else surface.querySelector('.tabplayhead')?.remove(); },
      onEnd: () => { player = null; setRunning(false); },
    });
  }
  function setRunning(on){ playBtn.textContent = on ? '■ Stop' : '▶ Play'; playBtn.setAttribute('aria-pressed', String(on)); }

  // --- PDF: the browser prints a sheet built from the same tab (Save as PDF in the print dialog) ---
  /** @type {HTMLElement|null} */ let sheet = null;
  function buildSheet(){
    const inst = getInstrument(), t = tab(), PER_ROW = barsPerRowFor(718); // an A4/Letter portrait page
    const names = chordsUsed(t);
    const boxes = names.map(name => {
      const { list, k } = voicingOf(inst, name), v = list[k];
      return `<figure class="print-chord"><b>${esc(name)}</b>${v ? voicingDiagram(v, { size: 1.15, label: false, mirror: inst.leftHanded }) : '<div class="print-nofing">no voicing</div>'}<figcaption>${v ? esc(voicingLabel(v)) + (v.b ? ' \u00b7 barre' : '') : ''}</figcaption></figure>`;
    }).join('');
    let rows = '';
    for (let i = 0; i < t.bars.length; i += PER_ROW) rows += `<div class="print-row">${tabSvg({ ...t, bars: t.bars.slice(i, i + PER_ROW) }, inst, { perRow: PER_ROW, numberFrom: i + 1 })}</div>`;
    const meta = [inst.name, inst.tuningName, inst.capo ? `capo ${inst.capo}` : '', `${t.bpm} BPM`].filter(Boolean).join(' \u00b7 ');
    const el = document.createElement('div');
    el.id = 'print-sheet';
    el.innerHTML = `<h1>${esc(t.title || 'Untitled tab')}</h1><p class="print-meta">${esc(meta)}</p>${boxes ? `<div class="print-chords">${boxes}</div>` : ''}${rows}<p class="print-foot">Made with Fretwork</p>`;
    return el;
  }
  window.addEventListener('beforeprint', () => {
    if (root.hidden) return;
    sheet?.remove(); sheet = buildSheet(); document.body.appendChild(sheet); document.body.classList.add('printing');
  });
  window.addEventListener('afterprint', () => { document.body.classList.remove('printing'); sheet?.remove(); sheet = null; });
  $('#tb-pdf').onclick = () => { cancelPending(); stopPlay(); window.print(); };

  // --- share link: the whole tab, the instrument setup and the generator settings (seed included) ---
  function genSettings(){ return { style: opts.style, density: opts.density, feel: opts.feel, tech: opts.tech, evolve: opts.evolve, tension: opts.tension, key: opts.key, seed: opts.seed }; }
  $('#tb-share').onclick = async () => {
    cancelPending();
    const url = `${location.origin}${location.pathname}#compose?${encodeTabLink({ tab: tab(), setup: getSetup(), gen: genSettings() })}`;
    try {
      if (navigator.share && matchMedia('(pointer:coarse)').matches) { await navigator.share({ title: tab().title || 'Fretwork tab', url }); msg.textContent = ''; return; }
      await navigator.clipboard.writeText(url); msg.textContent = 'Link copied';
    } catch (e) { if (e && e.name === 'AbortError') return; window.prompt('Copy this link', url); }
    setTimeout(() => { msg.textContent = ''; }, 2500);
  };
  /** Open a shared tab: it becomes the current tab, and Undo brings back what was there. */
  function openShared(hash){
    if (tabOf(hash) !== 'compose') return false;
    const link = decodeTabLink(hash); if (!link) return false;
    stopPlay(); cancelPending();
    applySetup({ instrument: link.setup.instrument || 'guitar', tuning: link.setup.tuning || 'standard', capo: link.setup.capo || 0, leftHanded: link.setup.leftHanded === true });
    hist = historyFor(getInstrument().id);
    hist.push(link.tab);
    if (link.gen) {
      Object.assign(opts, { style: link.gen.style, density: link.gen.density, feel: link.gen.feel, tech: link.gen.tech, evolve: link.gen.evolve, tension: link.gen.tension, key: link.gen.key, seed: link.gen.seed });
      styleSel.value = opts.style; densSel.value = opts.density; feelSel.value = opts.feel; gtSel.value = opts.tech; evSel.value = opts.evolve; tnSel.value = opts.tension; keySel.value = opts.key; seedIn.value = String(opts.seed);
    }
    persist();
    cursor.bar = 0; cursor.at = 0; planSig = '';
    try { history.replaceState(null, '', `${location.pathname}${location.search}#compose`); } catch (e) { /* keep the long hash */ }
    genMsg.textContent = 'Opened a shared tab - Undo brings back yours.';
    render(); return true;
  }
  window.addEventListener('hashchange', () => { if (!root.hidden || tabOf(location.hash) === 'compose') openShared(location.hash); });

  // --- wiring ------------------------------------------------------------------
  surface.addEventListener('click', e => {
    const hit = e.target instanceof Element && e.target.closest('.tabhit'); if (!hit) return;
    cancelPending();
    cursor.bar = +hit.dataset.bar; cursor.at = +hit.dataset.at; cursor.s = +hit.dataset.s;
    render(); surface.focus({ preventScroll: true });
  });
  surface.addEventListener('keydown', e => {
    if (e.altKey) return;
    if (key(e.key, e)) e.preventDefault();
  });
  $('#tb-pad').addEventListener('click', e => {
    const b = e.target instanceof Element && e.target.closest('button'); if (!b) return;
    if (b.dataset.d !== undefined) typeDigit(+b.dataset.d); else key(b.dataset.k, null);
  });
  lenSeg.querySelectorAll('button').forEach(b => b.onclick = () => {
    cancelPending(); opts.unit = +b.dataset.len; snap();
    const t = setLength(tab(), cursor.bar, cursor.at, cursor.s, unitLen());
    if (t !== tab()) hist.push(t);
    persist(); render();
  });
  playBtn.onclick = () => { cancelPending(); togglePlay(); };
  techSeg.querySelectorAll('button').forEach(b => b.onclick = () => { toggleTech(b.dataset.tech); surface.focus({ preventScroll: true }); });
  tripCb.onchange = () => { cancelPending(); opts.triplet = tripCb.checked; snap(); persist(); render(); };
  undoBtn.onclick = () => { cancelPending(); hist.undo(); persist(); render(); };
  redoBtn.onclick = () => { cancelPending(); hist.redo(); persist(); render(); };
  bpmIn.onchange = () => { commit(setBpm(tab(), bpmIn.value)); bpmIn.value = String(tab().bpm); if (player) stopPlay(); render(); };
  titleIn.onchange = () => { commit({ ...tab(), title: titleIn.value.slice(0, 80) }); render(); };
  chordIn.onchange = () => { commit(putChord(tab(), cursor.bar, cursor.at, chordIn.value)); render(); };
  $('#tb-addbar').onclick = () => { cancelPending(); commit(addBar(tab(), cursor.bar + 1)); cursor.bar += 1; cursor.at = 0; render(true); };
  $('#tb-delbar').onclick = () => { cancelPending(); commit(removeBar(tab(), cursor.bar)); render(); };
  $('#tb-clear').onclick = () => { cancelPending(); commit(clearNotes(tab())); render(); };
  $('#tb-copy').onclick = async () => {
    const text = tabToText(tab(), getInstrument().midi);
    try { await navigator.clipboard.writeText(text); msg.textContent = 'Copied'; }
    catch (e) { window.prompt('Copy this tab', text); }
    setTimeout(() => { msg.textContent = ''; }, 2000);
  };
  bindStrum(root, 'tb');
  backingCb.checked = opts.backing; metroCb.checked = opts.metro; loopCb.checked = opts.loop;
  backingCb.onchange = () => { opts.backing = backingCb.checked; persist(); };
  metroCb.onchange = () => { opts.metro = metroCb.checked; persist(); };
  loopCb.onchange = () => { opts.loop = loopCb.checked; persist(); };
  // --- solo generator ---
  const progSel = $('#tb-prog'), styleSel = $('#tb-style'), densSel = $('#tb-density'), keySel = $('#tb-key'), seedIn = $('#tb-seed'), genMsg = $('#tb-genmsg');
  progSel.innerHTML = libraryOptions(esc);
  let keyHtml = '';
  for (const mode of /** @type {('major'|'minor')[]} */ (['major', 'minor'])) for (let t = 0; t < 12; t++) keyHtml += `<option value="${t}:${mode}">${esc(keyName({ t, mode }))}</option>`;
  keySel.innerHTML = `<option value="auto">Auto (from the chords)</option>${keyHtml}`;
  const feelSel = $('#tb-feel'), swingSel = $('#tb-swing');
  const evSel = $('#tb-evolve'); evSel.value = opts.evolve; evSel.onchange = () => { opts.evolve = evSel.value; persist(); };
  const tnSel = $('#tb-tension'); tnSel.value = opts.tension; tnSel.onchange = () => { opts.tension = tnSel.value; persist(); };
  const gtSel = $('#tb-gentech'); gtSel.value = opts.tech; gtSel.onchange = () => { opts.tech = gtSel.value; persist(); };
  feelSel.value = opts.feel; swingSel.value = opts.swing;
  feelSel.onchange = () => { opts.feel = feelSel.value; persist(); };
  swingSel.onchange = () => { opts.swing = swingSel.value; persist(); };
  styleSel.value = opts.style; densSel.value = opts.density; keySel.value = opts.key; seedIn.value = String(opts.seed);
  styleSel.onchange = () => { opts.style = styleSel.value; persist(); render(); };
  densSel.onchange = () => { opts.density = densSel.value; persist(); };
  keySel.onchange = () => { opts.key = keySel.value; persist(); render(); };
  seedIn.onchange = () => { const v = Math.round(+seedIn.value); opts.seed = v >= 1 && v <= 999999 ? v : opts.seed; seedIn.value = String(opts.seed); persist(); };
  const templateBarCount = tpl => templateBars(tpl).length;
  const repeatSel = $('#tb-repeat'), autoCb = $('#tb-autoplay');
  repeatSel.value = String(opts.repeat); repeatSel.onchange = () => { opts.repeat = repeatSel.value === 'auto' ? 'auto' : +repeatSel.value; persist(); };
  autoCb.checked = opts.autoplay; autoCb.onchange = () => { opts.autoplay = autoCb.checked; persist(); };
  $('#tb-useprog').onclick = () => {
    cancelPending(); stopPlay();
    const tpl = PROGRESSION_LIBRARY[+progSel.value]; if (!tpl) return;
    const k = keyForTemplate(tpl, opts.key);
    commit(withChords(tab(), barChords(tpl, k), opts.repeat));
    const bars = tab().bars.length, passes = bars / templateBarCount(tpl);
    cursor.bar = 0; cursor.at = 0; keySel.value = opts.key = keyValue(k); persist();
    genMsg.textContent = `${bars} bar${bars === 1 ? '' : 's'} of chords loaded (${tpl.name}${passes > 1 ? ' \u00d7 ' + passes : ''})`; render();
  };
  $('#tb-usechart').onclick = () => {
    const chart = expandChart(/** @type {HTMLInputElement} */ ($('#tb-chart')).value);
    const bad = [...new Set(chart.bars.flat().filter(c => !parseChord(c)))];
    if (!chart.bars.length || bad.length || chart.problems.length) {
      genMsg.textContent = !chart.bars.length ? 'Type some chords first, for example: Dm7 G7 | Cmaj7' : [bad.length ? `Couldn\u2019t read ${bad.map(b => '\u201c' + b + '\u201d').join(', ')}.` : '', ...chart.problems.map(p => p[0].toUpperCase() + p.slice(1) + '.')].filter(Boolean).join(' ');
      return;
    }
    cancelPending(); stopPlay();
    commit(withChords(tab(), chart.bars, 1));
    cursor.bar = 0; cursor.at = 0;
    genMsg.textContent = `${tab().bars.length} bar${tab().bars.length === 1 ? '' : 's'} of chords loaded from the chart`; render();
  };
  function generate(){
    cancelPending(); stopPlay();
    const inst = getInstrument();
    const [t, mode] = opts.key === 'auto' ? [] : opts.key.split(':');
    const res = generateSolo({
      bars: tab().bars.map(b => ({ chords: b.chords })), inst, style: opts.style, density: opts.density, feel: opts.feel, techniques: opts.tech, evolve: opts.evolve, tension: opts.tension, seed: opts.seed,
      key: opts.key === 'auto' ? undefined : { t: +t, mode: /** @type {'major'|'minor'} */ (mode) },
    });
    let next = clearNotes(tab());
    res.bars.forEach((notes, bi) => notes.forEach(n => {
      next = putNote(next, bi, n.at, n.s, n.f, n.len);
      if (n.link || n.bend || n.vib) next = setTechnique(next, bi, n.at, n.s, { link: n.link, bend: n.bend, vib: n.vib === true });
    }));
    commit(next);
    const named = chordsUsed(tab()).length > 0;
    genMsg.textContent = `${named ? '' : 'No chords named, so it used ' + keyName(res.key) + '. '}Seed ${opts.seed}`;
    cursor.bar = 0; cursor.at = 0; render();
    if (opts.autoplay) togglePlay();
  }
  $('#tb-gen-go').onclick = generate;
  $('#tb-gen-new').onclick = () => { opts.seed = 1 + Math.floor(Math.random() * 999999); seedIn.value = String(opts.seed); persist(); generate(); };
  $('#tb-gen').open = matchMedia('(min-width:760px)').matches;
  openWhereRoom($('#tb-opts'));

  root.addEventListener('fw-shown', () => { planSig = ''; render(); });
  let resizeTimer = /** @type {any} */ (0);
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!root.hidden && barsPerRowFor(surface.clientWidth || 360) !== perRow) render(); }, 150); });
  onInstrumentChange(inst => { stopPlay(); cancelPending(); hist = historyFor(inst.id); render(); });
  loadVoicings().then(() => render());
  render();
  openShared(location.hash);
}
