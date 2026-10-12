import { mount as mountProgressions } from './view-progressions.js';
import { mount as mountScales } from './view-scales.js';
import { mount as mountChords } from './view-chords.js';
import { getInstrumentId, setInstrument } from './instrument.js';

const instSwitch = document.getElementById('instrument-switch');
function syncInstrumentButtons(){
  const id = getInstrumentId();
  instSwitch.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.inst === id)));
}
instSwitch.querySelectorAll('button').forEach(b => b.onclick = () => {
  setInstrument(b.dataset.inst);
  syncInstrumentButtons();
});
syncInstrumentButtons();

const LAST_TAB_KEY = 'gtr-last-tab';
const TABS = ['progressions', 'scales', 'chords'];
const views = {};
TABS.forEach(id => { views[id] = document.getElementById('view-' + id); });

mountProgressions(views.progressions);
mountScales(views.scales);
mountChords(views.chords);

function currentTab(){
  const h = location.hash.replace('#', '');
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

// Service worker registration is added in GTR-005 once sw.js exists.
