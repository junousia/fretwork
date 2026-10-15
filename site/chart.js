// A tiny chord-chart language for typing a whole song structure, with repeats:
//   Am F C G              four bars, one chord each (no bar lines: every chord is a bar)
//   Dm7 G7 | Cmaj7 | %    bar lines: chords between two lines share the bar; % repeats the previous bar
//   (Am F)x2 C G          a group played twice  (also "x2" with ×, or "2x")
//   |: Am F :| C G        a repeat: |: ... :| plays the part twice, ":|x3" three times
// `expandChart` writes the repeats out and returns the bars; the pages check the chord names themselves.
export const MAX_CHART_BARS = 128, MAX_REPEAT = 16;

/** @param {string} t @returns {number} the repeat count in "x3", "×3" or "3x" (0 if it is not one) */
const count = t => { const m = t.match(/^(?:[x×](\d{1,2})|(\d{1,2})[x×])$/i); return m ? +(m[1] || m[2]) : 0; };

/**
 * @param {string} text
 * @returns {{bars:string[][], problems:string[]}} `bars` the chord symbols of every bar with the repeats written out, `problems` what is wrong with the chart itself
 */
export function expandChart(text) {
  const words = /** @type {string[]} */ (String(text).match(/\|:|:\||\||\(|\)|%|[^\s,|():%]+/g) || []);
  const explicit = words.includes('|');
  /** @type {string[][]} */ let bars = [];
  /** @type {string[]} */ let cur = [];
  /** @type {string[]} */ const problems = [];
  /** @type {{kind:'(' | '|:', from:number}[]} */ const stack = [];
  let cut = false;
  const flush = () => { if (cur.length) { bars.push(cur); cur = []; } };
  /** @param {number} from @param {number} n */
  const repeat = (from, n) => { const part = bars.slice(from); for (let i = 1; i < Math.min(n, MAX_REPEAT); i++) bars = bars.concat(part.map(b => [...b])); };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    /** takes a count written right after the word, if any */
    const take = () => { const n = count(words[i + 1] || ''); if (n) i++; return n; };
    if (w === '|') flush();
    else if (w === '|:' || w === '(') { flush(); stack.push({ kind: /** @type {'('|'|:'} */ (w), from: bars.length }); }
    else if (w === ')' || w === ':|') {
      flush();
      const open = w === ')' ? '(' : '|:';
      let k = stack.length - 1; while (k >= 0 && stack[k].kind !== open) k--;
      const n = take();
      if (k < 0) { if (w === ')') { problems.push('a “)” with no “(” before it'); continue; } repeat(0, n || 2); continue; } // a lone :| repeats from the start
      const [{ from }] = stack.splice(k, stack.length - k);
      repeat(from, w === ')' ? n || 1 : n || 2);
    } else if (w === '%') { flush(); if (bars.length) bars.push([...bars[bars.length - 1]]); else problems.push('“%” repeats the previous bar, but there is none'); }
    else if (count(w)) problems.push(`“${w}” has to follow a “)” or a “:|”`);
    else if (!/^[-–—.]+$/.test(w)) { cur.push(w); if (!explicit) flush(); }
    if (bars.length > MAX_CHART_BARS) { problems.push(`more than ${MAX_CHART_BARS} bars - cut short`); bars.length = MAX_CHART_BARS; cut = true; break; }
  }
  flush();
  if (!cut && stack.some(f => f.kind === '(')) problems.push('a “(” is never closed');
  if (!cut && stack.some(f => f.kind === '|:')) problems.push('a “|:” is never closed with “:|”');
  return { bars, problems };
}
