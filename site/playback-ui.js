import { STRUMS, getStrum, setStrum } from './strum-patterns.js';
// The "Playback" controls shared by the pages that play things (Progressions, Compose), so they look and
// read the same everywhere: the same fold, the same first three controls in the same order (Tempo, Loop, Click),
// then anything specific to the page. Element ids are `<prefix>-bpm`, `<prefix>-loop`, `<prefix>-metro`.

/**
 * The controls themselves, without a fold around them.
 * @param {string} prefix id prefix of the page ("pr", "tb")
 * @param {string} [extras] HTML for the page's own controls, shown after Strum
 * @returns {string}
 */
export function playbackControls(prefix, extras = '') {
  return `<div class="transport">
        <label class="keylab">Tempo <input id="${prefix}-bpm" type="number" min="40" max="220" step="1" inputmode="numeric"> BPM</label>
        <label class="chk"><input type="checkbox" id="${prefix}-loop"> Loop</label>
        <label class="chk"><input type="checkbox" id="${prefix}-metro"> Click</label>
        <label class="keylab">Strum <select id="${prefix}-strum" title="How the backing chords are played">${STRUMS.map(x => `<option value="${x.id}">${x.name}</option>`).join('')}</select></label>
        ${extras}
      </div>`;
}

/**
 * @param {string} prefix id prefix of the page ("pr", "tb")
 * @param {string} [extras] HTML for the page's own controls, shown after Strum
 * @returns {string}
 */
export function playbackFold(prefix, extras = '') {
  return `<details class="fold" id="${prefix}-opts"><summary>Playback</summary>
      ${playbackControls(prefix, extras)}
    </details>`;
}

/** Folds start open where there is room and closed on phones. @param {HTMLDetailsElement} el */
export function openWhereRoom(el) { el.open = matchMedia('(min-width:760px)').matches; }

/** Wire the Strum select of the fold to the shared setting. @param {ParentNode} root @param {string} prefix */
export function bindStrum(root, prefix) {
  const sel = /** @type {HTMLSelectElement} */ (root.querySelector(`#${prefix}-strum`));
  sel.value = getStrum();
  sel.onchange = () => setStrum(sel.value);
}

/**
 * Panels that open from a row of buttons (a settings tray): each button shows a one-line summary of what is set, toggles its own panel
 * (aria-expanded), and the panels that were left open are remembered. Escape inside a panel closes it and returns to its button.
 * @param {ParentNode} root @param {string} storeKey @param {{button:string, panel:string}[]} items selectors
 * @returns {{open:(i:number, on:boolean) => void}}
 */
export function bindTray(root, storeKey, items) {
  /** @type {any[]} */
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch (e) { /* none */ }
  const pairs = items.map(it => ({ btn: /** @type {HTMLButtonElement} */ (root.querySelector(it.button)), panel: /** @type {HTMLElement} */ (root.querySelector(it.panel)) }));
  const open = (/** @type {number} */ i, /** @type {boolean} */ on) => {
    pairs[i].panel.hidden = !on; pairs[i].btn.setAttribute('aria-expanded', String(on));
    try { localStorage.setItem(storeKey, JSON.stringify(pairs.map(p => !p.panel.hidden))); } catch (e) { /* storage unavailable */ }
  };
  pairs.forEach((p, i) => {
    open(i, saved[i] === true);
    p.btn.onclick = () => open(i, !!p.panel.hidden);
    p.panel.addEventListener('keydown', e => { if (e.key === 'Escape') { open(i, false); p.btn.focus(); } });
  });
  return { open };
}

/**
 * Show a short <select> as a row of buttons, one per option. The select stays in the page (hidden from sight and from assistive technology) as
 * the one source of truth: setting its value from code, or choosing through it, updates the buttons.
 * @param {HTMLSelectElement} sel
 */
export function segmentSelect(sel) {
  const group = document.createElement('div');
  group.className = 'seg'; group.setAttribute('role', 'group');
  group.setAttribute('aria-label', sel.closest('label')?.textContent?.replace(sel.textContent || '', '').trim() || sel.getAttribute('aria-label') || sel.id);
  const buttons = [...sel.options].map(o => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = o.textContent; b.dataset.value = o.value;
    b.onclick = () => { if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); } };
    group.append(b); return b;
  });
  const sync = () => buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === sel.value)));
  const own = /** @type {PropertyDescriptor} */ (Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value'));
  Object.defineProperty(sel, 'value', { get() { return own.get?.call(sel); }, set(v) { own.set?.call(sel, v); sync(); } });
  sel.addEventListener('change', sync);
  sel.classList.add('sr-only'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
  sel.after(group); sync();
}
