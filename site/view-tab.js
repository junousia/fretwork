import { esc, parseChord } from './music.js';
import { getInstrument, onInstrumentChange } from './instrument.js';
import { loadVoicings, getVoicings, voicingDiagram, voicingLabel } from './voicings.js';
import { PROGRESSION_LIBRARY, progressionText } from './progressions.js';
import { generateSolo, STYLES, DENSITIES } from './solo.js';
import { keyName } from './music.js';
import { chordMidiNotes } from './audio.js';
import { startTab } from './player.js';
import { emptyTab, putNote, removeNote, setLength, addBar, removeBar, putChord, chordAt, chordTimeline, chordsUsed, setVoicing, setBpm, clearNotes, noteAt, noteCovering, tabEvents,
  stepSeconds, normalizeTab, createHistory, tabToText, STEPS, MAX_FRET, LENGTHS, LENGTH_NAMES } from './tab.js';
import { tabSvg, barsPerRowFor, stepPos } from './tab-view.js';

const STORE_KEY = 'fw-tabs';

export function mount(root){
  root.innerHTML = `
    <header>
      <h1>Tab</h1>
      <p class="lead">Write a riff or solo as tab. Click a spot, type the fret number, and it plays back over your chords.</p>
    </header>
    <div class="tabtools" role="group" aria-label="Tab tools">
      <button type="button" class="play" id="tb-play">▶ Play</button>
      <button type="button" class="share" id="tb-undo">Undo</button>
      <button type="button" class="share" id="tb-redo">Redo</button>
      <label class="keylab">Tempo <input id="tb-bpm" type="number" min="40" max="220" step="1" inputmode="numeric"> BPM</label>
    </div>
    <div class="row">
      <label class="keylab">Note <div class="seg" id="tb-len" role="group" aria-label="Note length">${LENGTH_NAMES.map((n, i) => `<button type="button" data-len="${i}" aria-pressed="false">${n}</button>`).join('')}</div></label>
    </div>
    <div class="row">
      <label class="keylab">Chord at bar <span id="tb-barno">1</span>, beat <span id="tb-beat">1</span> <input id="tb-chord" type="text" size="7" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Am7"></label>
      <button type="button" class="share" id="tb-addbar">Add bar</button>
      <button type="button" class="share" id="tb-delbar">Delete bar</button>
    </div>
    <div id="tb-chords" class="chordsum"></div>
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
    <details class="fold" id="tb-gen"><summary>Generate a solo</summary>
      <p class="hint">Name the chords in the tab (or load a progression), then generate. It replaces the notes - Undo brings yours back.</p>
      <div class="row">
        <label class="keylab">Chords from <select id="tb-prog" aria-label="Load a progression"></select></label>
        <label class="keylab">in <select id="tb-progkey"></select></label>
        <button type="button" class="share" id="tb-useprog">Use these chords</button>
      </div>
      <div class="row">
        <label class="keylab">Style <select id="tb-style">${STYLES.map(x => `<option value="${x.id}">${x.name}</option>`).join('')}</select></label>
        <label class="keylab">Notes <select id="tb-density">${DENSITIES.map(x => `<option value="${x.id}">${x.name}</option>`).join('')}</select></label>
        <label class="keylab">Key <select id="tb-key"></select></label>
        <label class="keylab">Seed <input id="tb-seed" type="number" min="1" max="999999" step="1" inputmode="numeric"></label>
      </div>
      <div class="row">
        <button type="button" class="play" id="tb-gen-go">Generate</button>
        <button type="button" class="share" id="tb-gen-new">Another one</button>
        <span class="vometa" id="tb-genmsg" role="status" aria-live="polite"></span>
      </div>
    </details>
    <details class="fold" id="tb-more"><summary>Playback options and tools</summary>
      <div class="row">
        <label class="chk"><input type="checkbox" id="tb-backing"> Play the bar chords</label>
        <label class="chk"><input type="checkbox" id="tb-metro"> Click</label>
        <label class="chk"><input type="checkbox" id="tb-loop"> Loop</label>
      </div>
      <div class="row">
        <label class="keylab">Title <input id="tb-title" type="text" size="22" maxlength="80" autocomplete="off"></label>
        <button type="button" class="share" id="tb-copy">Copy as text</button>
        <button type="button" class="share" id="tb-clear">Clear notes</button>
        <span class="vometa" id="tb-msg" role="status" aria-live="polite"></span>
      </div>
    </details>
  `;
  const $ = sel => root.querySelector(sel);
  const surface = $('#tb-surface'), playBtn = $('#tb-play'), undoBtn = $('#tb-undo'), redoBtn = $('#tb-redo'), bpmIn = $('#tb-bpm'),
        lenSeg = $('#tb-len'), chordIn = $('#tb-chord'), barNo = $('#tb-barno'), msg = $('#tb-msg'), titleIn = $('#tb-title'),
        backingCb = $('#tb-backing'), metroCb = $('#tb-metro'), loopCb = $('#tb-loop');

  // --- state ---------------------------------------------------------------
  const opts = { backing: true, metro: true, loop: false, unit: 1, style: 'follow', density: 'medium', key: 'auto', seed: 1 + Math.floor(Math.random() * 999999) };
  /** @type {Record<string, any>} */ let stored = {};
  try { stored = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { /* defaults */ }
  if (stored.opts && typeof stored.opts === 'object') {
    opts.backing = stored.opts.backing !== false; opts.metro = stored.opts.metro !== false; opts.loop = stored.opts.loop === true;
    if (STYLES.some(x => x.id === stored.opts.style)) opts.style = stored.opts.style;
    if (DENSITIES.some(x => x.id === stored.opts.density)) opts.density = stored.opts.density;
    if (typeof stored.opts.key === 'string' && /^(auto|\d+:(major|minor))$/.test(stored.opts.key)) opts.key = stored.opts.key;
    if (Number.isInteger(stored.opts.seed) && stored.opts.seed > 0 && stored.opts.seed <= 999999) opts.seed = stored.opts.seed;
    if (Number.isInteger(stored.opts.unit) && stored.opts.unit >= 0 && stored.opts.unit < LENGTHS.length) opts.unit = stored.opts.unit;
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
  const unitLen = () => LENGTHS[opts.unit];
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
    if ((e?.ctrlKey || e?.metaKey) && k.toLowerCase() === 'z') { cancelPending(); e.shiftKey ? hist.redo() : hist.undo(); persist(); clampCursor(); render(); return true; }
    if ((e?.ctrlKey || e?.metaKey) && k.toLowerCase() === 'y') { cancelPending(); hist.redo(); persist(); clampCursor(); render(); return true; }
    return false;
  }

  // --- drawing ---------------------------------------------------------------
  let perRow = 1;
  function render(reveal = false){
    const inst = getInstrument();
    clampCursor();
    perRow = barsPerRowFor(surface.clientWidth || 360);
    surface.innerHTML = tabSvg(tab(), inst, { perRow, cursor, editable: true });
    if (playStep >= 0) drawPlayhead(playStep);
    undoBtn.disabled = !hist.canUndo; redoBtn.disabled = !hist.canRedo;
    lenSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.len === opts.unit)));
    if (document.activeElement !== bpmIn) bpmIn.value = String(tab().bpm);
    if (document.activeElement !== titleIn) titleIn.value = tab().title;
    barNo.textContent = String(cursor.bar + 1);
    $('#tb-beat').textContent = String(1 + cursor.at / 4);
    const c = chordAt(tab(), cursor.bar, cursor.at)?.name ?? '';
    if (document.activeElement !== chordIn) chordIn.value = c;
    chordIn.setAttribute('aria-invalid', String(!!chordIn.value && !parseChord(chordIn.value)));
    renderChords(inst);
    $('#tb-delbar').disabled = tab().bars.length <= 1;
    $('#tb-addbar').disabled = tab().bars.length >= 64;
    if (reveal) surface.querySelector('.tabcursor')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  /** The fingering (0-based index into the stored ones) used for a chord name. */
  function voicingOf(inst, name){
    const c = parseChord(name); if (!c) return { list: [], k: 0 };
    const list = getVoicings(inst, c.root, c.suf);
    return { list, k: Math.min(tab().voicings?.[name] ?? 0, Math.max(0, list.length - 1)) };
  }
  // Every chord named in the tab, with a fingering you can step through.
  const chordsEl = $('#tb-chords');
  function renderChords(inst){
    const names = chordsUsed(tab());
    if (!names.length) { chordsEl.innerHTML = '<p class="hint">Chords you name in the tab appear here with a fingering to play them.</p>'; return; }
    chordsEl.innerHTML = `<h2 class="bh">Chords in this tab</h2><div class="vogal" role="group" aria-label="Chords used in this tab">${names.map(name => {
      const { list, k } = voicingOf(inst, name), v = list[k];
      const label = v ? `${voicingLabel(v)}${v.b ? ' \u00b7 barre' : ''}${list.length > 1 ? ` \u00b7 ${k + 1}/${list.length}` : ''}` : parseChord(name) ? 'no fingering' : 'unknown chord';
      return `<button type="button" class="chip vobtn" data-name="${esc(name)}"${list.length > 1 ? ` title="Tap for the next fingering"` : ''}><b>${esc(name)}</b>${v ? voicingDiagram(v, { label: false, mirror: inst.leftHanded }) : ''}<span>${esc(label)}</span></button>`;
    }).join('')}</div>`;
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
      events: tabEvents(tab(), inst), chords: opts.backing ? chordsToPlay(inst) : [], totalSteps: tab().bars.length * STEPS,
      stepSec: stepSeconds(tab().bpm), loop: opts.loop, metronome: opts.metro,
      onStep: step => { playStep = step; if (step >= 0) drawPlayhead(step); else surface.querySelector('.tabplayhead')?.remove(); },
      onEnd: () => { player = null; setRunning(false); },
    });
  }
  function setRunning(on){ playBtn.textContent = on ? '■ Stop' : '▶ Play'; playBtn.setAttribute('aria-pressed', String(on)); }

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
    cancelPending(); opts.unit = +b.dataset.len;
    const t = setLength(tab(), cursor.bar, cursor.at, cursor.s, unitLen());
    if (t !== tab()) hist.push(t);
    persist(); render();
  });
  playBtn.onclick = () => { cancelPending(); togglePlay(); };
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
  backingCb.checked = opts.backing; metroCb.checked = opts.metro; loopCb.checked = opts.loop;
  backingCb.onchange = () => { opts.backing = backingCb.checked; persist(); };
  metroCb.onchange = () => { opts.metro = metroCb.checked; persist(); };
  loopCb.onchange = () => { opts.loop = loopCb.checked; persist(); };
  // --- solo generator ---
  const progSel = $('#tb-prog'), progKey = $('#tb-progkey'), styleSel = $('#tb-style'), densSel = $('#tb-density'), keySel = $('#tb-key'), seedIn = $('#tb-seed'), genMsg = $('#tb-genmsg');
  progSel.innerHTML = PROGRESSION_LIBRARY.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
  let keyHtml = '';
  for (const mode of /** @type {('major'|'minor')[]} */ (['major', 'minor'])) for (let t = 0; t < 12; t++) keyHtml += `<option value="${t}:${mode}">${esc(keyName({ t, mode }))}</option>`;
  progKey.innerHTML = keyHtml; progKey.value = '9:minor';
  keySel.innerHTML = `<option value="auto">Auto (from the chords)</option>${keyHtml}`;
  styleSel.value = opts.style; densSel.value = opts.density; keySel.value = opts.key; seedIn.value = String(opts.seed);
  styleSel.onchange = () => { opts.style = styleSel.value; persist(); };
  densSel.onchange = () => { opts.density = densSel.value; persist(); };
  keySel.onchange = () => { opts.key = keySel.value; persist(); };
  seedIn.onchange = () => { const v = Math.round(+seedIn.value); opts.seed = v >= 1 && v <= 999999 ? v : opts.seed; seedIn.value = String(opts.seed); persist(); };
  $('#tb-useprog').onclick = () => {
    cancelPending(); stopPlay();
    const [t, mode] = progKey.value.split(':');
    const names = progressionText(PROGRESSION_LIBRARY[+progSel.value], { t: +t, mode: /** @type {'major'|'minor'} */ (mode) }).split(' ');
    const cur = tab();
    commit({ ...cur, bars: names.map((n, i) => ({ chords: [{ at: 0, name: n }], notes: cur.bars[i]?.notes || [] })) });
    cursor.bar = 0; cursor.at = 0; keySel.value = opts.key = progKey.value; persist();
    genMsg.textContent = `${names.length} bar${names.length === 1 ? '' : 's'} of chords loaded`; render();
  };
  function generate(){
    cancelPending(); stopPlay();
    const inst = getInstrument();
    const [t, mode] = opts.key === 'auto' ? [] : opts.key.split(':');
    const res = generateSolo({
      bars: tab().bars.map(b => ({ chords: b.chords })), inst, style: opts.style, density: opts.density, seed: opts.seed,
      key: opts.key === 'auto' ? undefined : { t: +t, mode: /** @type {'major'|'minor'} */ (mode) },
    });
    let next = clearNotes(tab());
    res.bars.forEach((notes, bi) => notes.forEach(n => { next = putNote(next, bi, n.at, n.s, n.f, n.len); }));
    commit(next);
    const named = chordsUsed(tab()).length > 0;
    genMsg.textContent = `${named ? '' : 'No chords named, so it used ' + keyName(res.key) + '. '}Seed ${opts.seed}`;
    cursor.bar = 0; cursor.at = 0; render();
  }
  $('#tb-gen-go').onclick = generate;
  $('#tb-gen-new').onclick = () => { opts.seed = 1 + Math.floor(Math.random() * 999999); seedIn.value = String(opts.seed); persist(); generate(); };
  $('#tb-gen').open = matchMedia('(min-width:760px)').matches;
  $('#tb-more').open = matchMedia('(min-width:760px)').matches;

  root.addEventListener('fw-shown', () => render());
  let resizeTimer = /** @type {any} */ (0);
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!root.hidden && barsPerRowFor(surface.clientWidth || 360) !== perRow) render(); }, 150); });
  onInstrumentChange(inst => { stopPlay(); cancelPending(); hist = historyFor(inst.id); render(); });
  loadVoicings().then(() => render());
  render();
}
