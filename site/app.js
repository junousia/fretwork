import { mount as mountProgressions } from './view-progressions.js';
import { mount as mountScales } from './view-scales.js';
import { mount as mountChords } from './view-chords.js';
import { mount as mountIdentify } from './view-identify.js';
import { mount as mountCompose } from './view-compose.js';
import { mount as mountListen } from './view-listen.js';
import { FAMILIES, MAX_CAPO, getSetup, applySetup, onInstrumentChange } from './instrument.js';
import { decodeProgression, tabOf } from './share.js';
import { decodeTabLink } from './tab-share.js';
import { SOUNDS, getSound, setSound, applySound } from './sound.js';

// A shared link may carry the instrument; apply it before anything renders.
{ const sh = decodeProgression(location.hash); if (sh && tabOf(location.hash) === 'progressions') applySetup({ instrument: sh.instrument || 'guitar', tuning: sh.tuning || 'standard', capo: sh.capo || 0, leftHanded: sh.leftHanded === true }); }

{ const tl = tabOf(location.hash) === 'compose' ? decodeTabLink(location.hash) : null; if (tl) applySetup({ instrument: tl.setup.instrument || 'guitar', tuning: tl.setup.tuning || 'standard', capo: tl.setup.capo || 0, leftHanded: tl.setup.leftHanded === true }); }

applySound();

const instSwitch = document.getElementById('instrument-switch');
const tuningSel = /** @type {HTMLSelectElement} */ (document.getElementById('tuning-select'));
const capoSel = /** @type {HTMLSelectElement} */ (document.getElementById('capo-select'));
const lefty = /** @type {HTMLInputElement} */ (document.getElementById('lefty-toggle'));
const soundSel = /** @type {HTMLSelectElement} */ (document.getElementById('sound-select'));
soundSel.innerHTML = SOUNDS.map(x => `<option value="${x.id}">${x.name}</option>`).join(''); soundSel.value = getSound();
soundSel.onchange = () => setSound(soundSel.value);
capoSel.innerHTML = Array.from({ length: MAX_CAPO + 1 }, (_, n) => `<option value="${n}">${n ? 'Capo at fret ' + n : 'No capo'}</option>`).join('');
function syncSetupControls(){
  const s = getSetup();
  instSwitch.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.inst === s.instrument)));
  tuningSel.innerHTML = FAMILIES[s.instrument].tunings.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  tuningSel.value = s.tuning; capoSel.value = String(s.capo); lefty.checked = s.leftHanded;
}
instSwitch.querySelectorAll('button').forEach(b => b.onclick = () => applySetup({ instrument: b.dataset.inst }));
tuningSel.onchange = () => applySetup({ tuning: tuningSel.value });
capoSel.onchange = () => applySetup({ capo: +capoSel.value });
lefty.onchange = () => applySetup({ leftHanded: lefty.checked });
const menuBtn = /** @type {HTMLButtonElement} */ (document.getElementById('menu-btn'));
const optbar = /** @type {HTMLElement} */ (document.getElementById('optbar'));
menuBtn.onclick = () => { optbar.hidden = !optbar.hidden; menuBtn.setAttribute('aria-expanded', String(!optbar.hidden)); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !optbar.hidden) { menuBtn.click(); menuBtn.focus(); } });
onInstrumentChange(syncSetupControls);
syncSetupControls();

const LAST_TAB_KEY = 'gtr-last-tab';
const TABS = ['progressions', 'scales', 'chords', 'identify', 'compose', 'listen'];
const views = {};
TABS.forEach(id => { views[id] = document.getElementById('view-' + id); });

// Each tab is built the first time it is shown, so startup only pays for the
// visible one (the others would add ~1,000 DOM nodes and lots of main-thread work).
const mounters = { progressions: mountProgressions, scales: mountScales, chords: mountChords, identify: mountIdentify, compose: mountCompose, listen: mountListen };
const mounted = new Set();
function ensureMounted(id){
  if(mounted.has(id)) return;
  mounted.add(id);
  mounters[id](views[id]);
}

function currentTab(){
  const h = tabOf(location.hash);
  return TABS.includes(h) ? h : null;
}
function route(){
  const active = currentTab() || 'progressions';
  ensureMounted(active);
  TABS.forEach(id => { views[id].hidden = id !== active; });
  views[active].dispatchEvent(new Event('fw-shown')); // views re-centre their fretboard now that it has a width
  document.querySelectorAll('.tab').forEach(a => {
    a.setAttribute('aria-current', /** @type {HTMLElement} */ (a).dataset.tab === active ? 'page' : 'false');
  });
  try{ localStorage.setItem(LAST_TAB_KEY, active); }catch(e){}
}

window.addEventListener('hashchange', route);

if(!currentTab()){
  let last = 'progressions';
  try{ last = localStorage.getItem(LAST_TAB_KEY) || 'progressions'; }catch(e){}
  if(!TABS.includes(last)) last = 'progressions';
  history.replaceState(null, '', '#' + last);
}
route();


// Offline support / installability (needs https or localhost).
if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
