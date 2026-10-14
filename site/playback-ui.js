// The "Tempo and playback" controls shared by the pages that play things (Progressions, Compose), so they look and
// read the same everywhere: the same fold, the same first three controls in the same order (Tempo, Loop, Click),
// then anything specific to the page. Element ids are `<prefix>-bpm`, `<prefix>-loop`, `<prefix>-metro`.

/**
 * @param {string} prefix id prefix of the page ("pr", "tb")
 * @param {string} [extras] HTML for the page's own controls, shown after Click
 * @returns {string}
 */
export function playbackFold(prefix, extras = '') {
  return `<details class="fold" id="${prefix}-opts"><summary>Tempo and playback</summary>
      <div class="transport">
        <label class="keylab">Tempo <input id="${prefix}-bpm" type="number" min="40" max="220" step="1" inputmode="numeric"> BPM</label>
        <label class="chk"><input type="checkbox" id="${prefix}-loop"> Loop</label>
        <label class="chk"><input type="checkbox" id="${prefix}-metro"> Click</label>
        ${extras}
      </div>
    </details>`;
}

/** Folds start open where there is room and closed on phones. @param {HTMLDetailsElement} el */
export function openWhereRoom(el) { el.open = matchMedia('(min-width:760px)').matches; }
