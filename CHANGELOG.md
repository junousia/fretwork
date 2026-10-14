# Changelog

## Unreleased

- **Plucked guitar sound** (default; "Simple" is the old synth, chosen in the setup menu). Every note is rendered
  with a plucked-string model (extended Karplus-Strong, `site/string-dsp.js`): in tune to within ~1.5 cents from E2
  to E6, the same loudness on every string, strings that ring longer when low and darken as they die away, damping
  at the end of the note, and bends, slides and vibrato as real pitch changes of the string. It plays through a
  small EQ / compressor / room / limiter chain. Notes are cached, so repeats are free. No new dependency
  (Tone.js was tried and measured first: its PluckSynth varied 3-14 dB in loudness, was silent above ~1.1 kHz and
  flat by up to 30 cents).

- Tab: **Copy link** shares the whole tab - notes, techniques, triplets, chords, chosen fingerings,
  scale/position choices, title and tempo - plus the instrument setup (tuning, capo, left-handed) and the
  generator settings with the seed, in one link (about 1.7 KB for a busy 12-bar solo). Opening a link makes
  it the current tab and Undo brings back the one that was there. Damaged or hostile links are repaired or
  ignored.

- Tab: **Evolve** for the solo generator (Steady / Build up / Arc). The solo develops over the song: it
  starts lower and calmer, climbs up the neck one position at a time, gets busier (up to the density you
  asked for) and uses more techniques towards the peak, then settles for the ending. Positions you choose
  yourself for a chord are kept. (Measured on a 12-bar blues: the arc is ~40% busier and ~4 semitones higher
  in the middle than at the start.)

- Tab: **techniques** - hammer-on / pull-off, slide, bend (half, full, 1 1/2, two steps) and vibrato on the
  note at the cursor (buttons, or the h / s / b / v keys). They are drawn as slurs marked h or p, slanted
  lines, bend arrows with their size and a wavy line, and they play: legato (soft) second notes, a real
  glide for slides, bent and vibrato pitch. The solo generator has a **Techniques** setting (Off / Some /
  Lots): it only adds a technique where it fits (neighbouring notes on one string a few frets apart; bends
  written below the scale note they arrive at, on the high strings of a guitar only; vibrato on long notes).

- Tab: **triplets**. The grid is now 48 steps per bar (a quarter is 12), so straight and triplet notes
  fit exactly: a Triplet box next to the note lengths (1/16, 1/8, 1/4, 1/2 triplets), brackets with a 3
  in the tab, and the cursor snaps to the triplet grid. Tabs saved before this are converted automatically
  (nothing moves). Plain-text export approximates triplets on a 24-cell bar.
- Tab: **feel** for the solo generator - Straight eighths, Shuffle / swing (long-short pairs written as
  triplets), Triplets (12/8) and Sixteenths (funk), each with sparse/medium/busy rhythms and its own
  ending. A separate **Swing** playback option (Straight / Light swing / Shuffle) plays straight eighths
  long-short without changing the written notes.
- Tab: **Export PDF** - prints the tab as a sheet with the title, tuning/capo/tempo, a box with the
  fingering of every chord used, and the tab in numbered rows that are never split across pages. Use
  "Save as PDF" in the print dialog (Ctrl+P on the Tab page prints the same sheet).

- Tab: choose the scale and positions the solo generator uses for each chord occurrence (like the
  Progressions tab): put the cursor in a bar and pick a scale and one or more positions for the chord
  there, with a fretboard preview. The choice is stored on that chord marker, so the same chord later in
  the song can be played in a different position and the solo can move up the neck.

- Tab: chords can be placed at any step of a bar (several per bar), and every chord used is gathered
  above the tab with a fingering you can step through; the chosen fingerings are the ones played back.
  (Old saved tabs with one chord per bar still load.)
- Tab: **solo generator** - load a progression's chords (or name your own), pick a style (follow the
  chords / pentatonic / blues) and how busy it is, and generate. It plays inside one position per chord,
  starts each chord on a chord tone, lands chord tones on strong beats, moves mostly by step, approaches
  chord changes, repeats a rhythm so it sounds intentional, and ends on the root. The same seed always
  gives the same solo; "Another one" tries a new seed; Undo restores what was there.

- New **Tab** tab: a tab editor. Notes sit on a sixteenth-note grid in 4/4 bars; click a cell and type
  a fret, choose note lengths, add/delete bars, set a chord per bar, undo/redo, play it back (with the
  chords and a click) and copy it as ASCII tab. One tab per instrument, saved in the browser. This is
  the base for a solo generator and PDF export.

- Phones: less scrolling to reach the fretboard. Intro text is hidden, root / chord / scale are
  drop-downs, the chord builder and tempo options are folds, and the examples are merged into one
  "Load" menu with the common progressions.
- Choosing a scale position or voicing now scrolls the neck so it is on screen.
- Voicings are shown as a row of chord boxes (all at once); the one you pick is highlighted on the
  neck and, in Progressions, used by the chord strip and playback.
- The white ring marking a voicing is smaller so it no longer covers notes on neighbouring strings.

- Layout: the desktop side rail is now a slim 84px column with the tabs grouped at the top; tablets keep the bottom tab bar (the side rail is only for wide mouse-driven screens), and
  tuning / capo / left-handed moved behind a menu button so they take no screen space until needed.

- New **Identify** tab: mark notes on the fretboard (click, or per-string selects) and see which chords
  fit - ranked, with slash chords and omitted tones, Play, and "Open in Chords". Validated against all
  3,263 stored fingerings.

- Fix: the Docker/nginx image served every file as `application/octet-stream` (a `types {}` block
  replaced nginx's mime table), so browsers downloaded the page instead of showing it. GitHub Pages
  was not affected. A new test builds the real image and checks every file's Content-Type.

- Internal: `theory.js` split into `music`, `positions`, `chord-features`, `board`, `audio` and
  `progressions` modules (behaviour unchanged - all 17 golden SVGs are byte-identical).
- Type checking: JSDoc types checked by `tsc --noEmit` in CI; the engine modules compile with
  `noImplicitAny` and `strictNullChecks`.

- Startup builds only the visible tab (Lighthouse performance 0.86 -> 1.0).
- Quality gates in CI: axe accessibility on every tab (light/dark, desktop/phone), Chrome PWA
  installability, Lighthouse thresholds, SVG golden snapshots of key shapes, CodeQL.
- Accessibility fixes: setup bar is a landmark, heading order on the Chords tab.

- Arpeggios: degree chords (triads or 7ths) coloured inside a scale position, an arpeggio shape around
  any chord fingering, and Play arpeggio buttons in Scales, Chords and Progressions.

- Tunings (14 presets for guitar, 7-string and ukulele), capo, and a left-handed mirrored neck;
  the setup is saved and travels in share links.

- Play a whole progression with the chosen chord voicings: tempo, beats per chord, loop and click.
  The chord strip and neck follow the playing chord.
- Shareable links: the progression, key, instrument, scale positions and voicing choices live in
  the URL; "Copy link" (or the share sheet on phones) shares them.

## 1.0.0

First public release as Fretwork.

- Progressions, Scales and Chords tools for guitar and ukulele.
- Scale positions: CAGED-style boxes for pentatonic/hexatonic scales, uniform-window positions
  for seven-note scales, always an unbroken run by pitch.
- Chord voicings from chords-db with finger numbers and barres; chord builder filter.
- Installable PWA with offline support, self-hosted font, GitHub Pages deployment.
