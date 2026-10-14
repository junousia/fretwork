# Changelog

## 2.1.0 - 2026-10-14

### Changed
- **The solo generator is calibrated against real solos.** I measured 435 jazz solos in the Weimar Jazz Database (about 190,000
  notes) with the same definitions as the generator and brought the defaults in line, which fixed these differences:
  chord tones on ~98% of strong beats (real: ~52%), a new note on every beat (real: 27% of beats have none), almost only straight
  eighths (real: 32% of notes on the beat, 25% off-beat eighths, 13% triplets, 19% sixteenths), a line that changed direction too
  often, bars that repeated their rhythm exactly 21-31% of the time (real: 1%), an Evolve that was four times stronger than real
  solos, and bends / hammer-ons / slides far more often than in jazz. The interval mix (steps, thirds, fourths, leaps) and the
  number of notes per bar already matched. The numbers are now also tests, so the generator cannot drift away from them.
- New settings: **Chord tones** (Mostly chord tones / Balanced / Free), a new default feel **Mixed (jazz)** (quarters, off-beat
  eighths, sixteenth runs, triplets, holds and rests), and **Gentle arc** as the default Evolve (the older Arc and Build up stay).
  Solos made with the same seed differ from before; the share link carries the new setting (older links still open).
- Compose and Progressions play the same way: the same pinned play bar, a share row (Copy link on both; Title, Export PDF and Copy as
  text on Compose) and one "Tempo and playback" fold that starts with Tempo, Loop and Click and then has the page's own controls.
  Both start with Loop on and Click off. "Play progression" is pinned while you scroll, like Play on Compose, whose
  Play, Generate, Another one, Undo and Redo stay at the top (on a phone they shrink to one row).

## 2.0.0 - 2026-10-14

A large release: Fretwork is now also a composer.

### Added
- **Compose** (new page; links to it made when it was still called "tab" keep working):
  - a **tab editor** on a 48-step grid (straight and triplet notes, 1/16 to a whole note, dotted too): click a spot and
    type the fret, undo/redo, bars, **chords placed anywhere in a bar** and gathered at the top with a voicing you can step
    through, one tab per instrument saved in the browser, copy as plain-text tab (triplets rounded);
  - **techniques**: hammer-on / pull-off, slide, bend (half to two steps) and vibrato, drawn as slurs, lines, arrows and
    waves, and played (soft legato notes, real glides, bent and vibrato pitch);
  - a **solo generator**: style (follow the chords / pentatonic / blues), density, **feel** (straight, shuffle,
    triplets, funk sixteenths), **evolve** (steady / build up / arc), techniques (off / some / lots), key and seed. It
    plays inside one position per chord, starts chords on chord tones, moves mostly by step, repeats rhythm, ends on the root.
    The same seed always gives the same solo. Scale and positions can be chosen **per chord occurrence** (like Progressions),
    so the solo can move up the neck. Loading a progression repeats it (Auto = at least 8 bars, or x1-x8). Generate sits next
    to Play and can start playing straight away;
  - playback with the bar chords, a click, loop and a **Swing** option (straight / light / shuffle);
  - **Export PDF** (title, tuning / capo / tempo, a box with the voicing of every chord used, numbered rows never split
    across pages) and **Copy link**, which shares the whole tab, the setup and the generator settings with the seed in
    one link (opening one keeps your own tab one Undo away; damaged or hostile links are repaired or ignored).
- **Plucked guitar sound** (default; "Simple" is the old synth, in the setup menu). Each note is rendered with a plucked-string
  model (`site/string-dsp.js`): in tune to within ~1.5 cents from E2 to E6, equal loudness on every string, strings that ring
  longer when low and darken as they die away, damping at the note's end, bends / slides / vibrato as real pitch changes,
  a short pick tick for a definite attack. It plays through a small EQ / compressor / room / limiter chain, with the chain's
  12 ms delay compensated so notes land on the click. No new dependency (Tone.js was measured first and rejected).
- **Identify**: mark notes on the fretboard and see which chords fit, ranked, with slash chords and omitted tones, Play, and
  "Open in Chords". Validated against all 3,263 stored voicings.
- Arpeggios (degree chords in a scale position, arpeggio shape around a voicing, Play arpeggio), 14 tunings with capo and a
  left-handed neck, playing a whole progression with the chosen voicings, and shareable progression links.
- Quality gates in CI: axe accessibility on every page (light / dark, desktop / phone), Chrome PWA installability,
  Lighthouse thresholds, SVG golden snapshots, CodeQL, TypeScript over the JSDoc types, and a test that builds the real
  nginx image. Tests for the chord identifier, the tab model, the solo generator (rules checked on ~3,700 solos across all
  tunings), the share codec and the sound.

### Changed
- The Progressions page is titled "Progressions" (it was "Over the changes") and the "Tab" page is now **Compose**.
- One word for a chord shape everywhere: **voicing** (it was also "fingering").
- Phones: less scrolling to reach the fretboard (intro text hidden; root / chord / scale are drop-downs; the chord builder and
  tempo options are folds; one "Load" menu for examples and common progressions); choosing a position or voicing scrolls
  the neck to it. Tablets keep the bottom tab bar; wide mouse-driven screens get a slim side rail. Tuning, capo, sound and
  left-handed are behind a menu button.
- Voicings are shown as a row of chord boxes; the one you pick drives the neck and, in Progressions, the playback.
- Startup builds only the visible page (Lighthouse performance 0.86 -> 1.0). Internal: `theory.js` split into modules.

### Fixed
- The Docker / nginx image served every file as `application/octet-stream`, so browsers downloaded the page instead of
  showing it (GitHub Pages was not affected). A test now builds the real image and checks every Content-Type.
- Accessibility: the setup bar is a landmark; heading order on several pages; the voicing ring no longer covers notes on
  neighbouring strings.

## 1.0.0

First public release as Fretwork.

- Progressions, Scales and Chords tools for guitar and ukulele.
- Scale positions: CAGED-style boxes for pentatonic/hexatonic scales, uniform-window positions
  for seven-note scales, always an unbroken run by pitch.
- Chord voicings from chords-db with finger numbers and barres; chord builder filter.
- Installable PWA with offline support, self-hosted font, GitHub Pages deployment.
