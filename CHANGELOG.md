# Changelog

## Unreleased

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
