import { mount as mountProgressions } from './view-progressions.js';
import { mount as mountScales } from './view-scales.js';
import { mount as mountChords } from './view-chords.js';
import { FAMILIES, MAX_CAPO, getSetup, applySetup, onInstrumentChange } from './instrument.js';
import { decodeProgression, tabOf } from './share.js';

// A shared link may carry the instrument; apply it before anything renders.
{ const sh = decodeProgression(location.hash); if (sh && tabOf(location.hash) === 'progressions') applySetup({ instrument: sh.instrument || 'guitar', tuning: sh.tuning || 'standard', capo: sh.capo || 0, leftHanded: sh.leftHanded === true }); }

const instSwitch = document.getElementById('instrument-switch');
const tuningSel = document.getElementById('tuning-select'), capoSel = document.getElementById('capo-select'), lefty = document.getElementById('lefty-toggle');
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
onInstrumentChange(syncSetupControls);
syncSetupControls();

const LAST_TAB_KEY = 'gtr-last-tab';
const TABS = ['progressions', 'scales', 'chords'];
const views = {};
TABS.forEach(id => { views[id] = document.getElementById('view-' + id); });

mountProgressions(views.progressions);
mountScales(views.scales);
mountChords(views.chords);

function currentTab(){
  const h = tabOf(location.hash);
  return TABS.includes(h) ? h : null;
}
function route(){
  const active = currentTab() || 'progressions';
  TABS.forEach(id => { views[id].hidden = id !== active; });
  document.querySelectorAll('.tab').forEach(a => {
    a.setAttribute('aria-current', a.dataset.tab === active ? 'page' : 'false');
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
