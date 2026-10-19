# Changelog

## 2.7.1 - 2026-10-19

### Fixed
- **Listen showed nothing after the microphone was allowed.** The audio context was created only after the permission prompt, and a context made that
  late can stay suspended, so the page was "listening" to silence. It is now created and resumed inside the click, and the page says so if the browser
  still holds the audio back.
- The detector copes with what a laptop microphone really delivers: the DC offset is removed, the quiet-signal gate is lower (0.002 instead of 0.008),
  the clarity threshold is 0.75 instead of 0.85, a note is shown after two matching readings instead of three, and the microphone's own gain control is on
  (echo cancelling and noise suppression stay off, they would change the note).

### Added
- An **input level bar** that moves whenever the microphone is heard, the name of the microphone in use, and plain messages: "Not hearing anything" (with
  what to check) and "Hearing sound, but no clear note". The browser test now uses a quiet, hissy recording on a DC offset and no autoplay override.

## 2.7.0 - 2026-10-18

### Added
- **Listen**, a new page: press Start, play a note on your guitar, and it shows which note it is (name and octave), how many cents sharp or flat (a
  tuner needle, green within 5 cents), the frequency, the open string it is closest to, and where on the neck that pitch can be played, for your
  instrument, tuning and capo. It keeps a short history of the notes you played and, after three different notes, names the chord they make together.
  The sound is analysed in the browser and never leaves it; the microphone is opened only when you press Start and released when you press Stop, leave
  the page or hide the tab. Single notes only - a strummed chord is not one pitch.
- `site/pitch.js`: the pitch detector (the McLeod method) and the note arithmetic (equal temperament, A4 = 440). Tests check it within 2 cents on
  sines across a guitar's range, within 6-8 cents on the app's own plucked strings (every open string, different points in the note, several sample
  rates, with noise), that strong overtones do not pull it an octave off, and that silence, noise and very quiet sound give no answer. The browser test
  plays a recorded A2 through Chromium's fake microphone and checks the page.

## 2.6.0 - 2026-10-18

### Added
- **You see what is played.** While Progressions plays, the notes of the chord glow on the fretboard as each strum or picked note sounds (the exact
  strings and frets of the voicing you chose); on Compose the notes of the solo glow on the "Scale and position" board when it is open.
- **A spectrum strip** under the play bar on both pages while sound plays, drawn from the app's own output, so it shows what you hear. It is not drawn
  when the system asks for reduced motion.

### Changed
- All sound now passes one master output (with an analyser for the strip); fretboard notes carry their string and fret in the SVG.

## 2.5.0 - 2026-10-18

### Changed
- **Compose is decluttered.** The tab used to start below eleven rows of controls; now the top is Play, Generate, Another, Undo and Redo, then a row of three
  settings buttons - **Playback**, **Generator** and **Share** - each saying what is set ("90 BPM · Loop", "Follow the chords · Medium · Gentle arc"),
  then the editing tools and the tab. The panels start closed, can be open together, and remember what you left open; Escape closes one.
- The generator panel shows Key, Load (with Repeat), the chart box, Style and Density; Evolve, Feel, Chord tones, Techniques, Seed and "Play it straight
  after generating" are under "More generator settings". Title, Copy link, Export PDF and Copy as text moved into Share.
- Short choices (Density, Chord tones, Techniques, Swing) are rows of buttons instead of dropdowns; the dropdown stays underneath as the single source of
  truth. The playback settings are called "Playback" on both Compose and Progressions. The phone layout no longer scrolls sideways at the Length row.
- README screenshots regenerated.

## 2.4.1 - 2026-10-18

### Changed
- **Scales in the key** lists only the key's own scales - the ones that start on the key's tonic (A minor, A minor pentatonic and A harmonic minor in
  A minor) - best fit to the chord first. Rotations such as D Dorian or G major pentatonic are no longer listed there; the chord's own list has the
  scales that start on the chord. Choosing a row now always means "play the key's scale over this chord".

## 2.4.0 - 2026-10-18

### Changed
- **Scale suggestions are calculated, not looked up.** Progressions used to list, for each chord, the scales on the chord's own root that a hand-written
  table called compatible - so A minor pentatonic never showed up over Dm7 in A minor, although it is the obvious scale for it. Now a chord, a scale and a
  key are all just sets of the 12 notes, and a scale is judged by two counts: how many of the chord's notes it contains, and how many of its notes sit
  a semitone above the chord's third or seventh (the classic "avoid note"). Fit = cover x (1 - rubs / scale size), and a scale must reach 60% to be listed.
- The detail view has **two lists**: **Scales in the key** - every scale, on any root, made only of the key's notes (plus any note the chords of the
  progression borrow, such as the G# of an E7 in A minor), best fit to this chord first, scales with the same notes listed once - and **Scales for the chord**,
  the scales that start on the chord's root, ranked by fit and by how much of the key they stay in. Each row says how well it fits.
- Compose's per-chord scale menu has the same two groups, a choice can be a scale that does not start on the chord's root (it is remembered in the link),
  and the generator's own choice over a chord uses the same ranking.
- The old "Blues sound" badge became a note on any scale whose minor 3rd rubs against a major chord.

### Added
- `site/scalefit.js` (the model) with tests that check the definition by brute force for every chord type in every key, that the answers move with a
  transposition, that lists are ranked and cut at the threshold, and that nothing that fits is left out.

## 2.3.1 - 2026-10-15

### Fixed
- The strumming module moved to a new file name (`strum-patterns.js`): the CDN in front of the public site had cached a "not found" for the first name
  during the 2.3.0 deployment, which would have broken the page for visitors until it expired.

## 2.3.0 - 2026-10-15

### Added
- **More strumming.** A Strum menu in "Tempo and playback" (the same on Progressions and Compose, remembered): one strum per chord (as before), down on every
  beat, down-up eighths, folk (D DU UDU), ballad, off-beat chops (reggae / ska), bossa nova, swing chops (Freddie Green), arpeggio and Travis picking. Down
  strums sound low to high, up strums catch only the top strings and are lighter, picked patterns pick single strings (so they work for any tuning and the
  ukulele), and the pattern follows the chord's length - a chord of one bar gets one bar of the pattern, a chord of two bars gets it twice. On Compose the
  off-beat hits follow the Swing setting.
- **Repeats in a chord chart.** Type `(Am F)x2` (a group twice), `|: Am F :|` or `:|x3` (a repeat), `%` (the previous bar) and `|` bar lines, with
  groups inside groups, on Progressions' chord box - and on Compose, where a new "Or type a chart" row in the generator settings loads a whole song
  structure into the bars (two chords between bar lines share the bar). A chart that is wrong says what is wrong and changes nothing.
- **More classics and songs in the Load menu**: Blue Bossa, The Girl from Ipanema (A section) and Fly Me to the Moon (first eight bars) join the Classics,
  and a new **Songs** group has Hotel California (verse), House of the Rising Sun, Knockin' on Heaven's Door, Hey Joe, Sweet Home Alabama and Hallelujah
  (verse). All are written as degrees, so they play in any key. The chords were checked against published charts (see THIRD_PARTY_NOTICES.md).

## 2.2.0 - 2026-10-15

### Fixed
- Progressions: "Auto" key detection read a twelve-bar blues (all dominant 7th chords on the I, IV and V) as the key a fourth above - the
  blues in A came out as "D major", C as "F", E as "A", G as "C". The blues pattern is now recognised first and the key is the I chord (A major).
  The order of the suggested scales and the "In key" badges, which depend on the key, are right again (which scales are offered for a chord never
  depended on it). Tests cover all twelve keys, the 7th / 9th / starting-on-the-V variants, a minor blues, and that every progression in the
  library is still detected in the key it was built in.

### Changed
- Progressions and Compose have **one Key menu** instead of two. It is the key the chords are analysed in (Auto works it out from the chords) and
  the key a loaded progression is played in: pick a progression and it is played in the chosen key (the tonic of that key with the progression's own
  mode - a blues "in A minor" is a blues in A) and the menu shows that key; pick another key and the loaded progression is transposed. With Auto
  chosen, a progression is played in C (A for a minor one), or in the key a classic is known in.
- The old fixed examples are now progressions like the rest, so they transpose too. **One grouped Load menu**: Common, Blues (12-bar, quick-change,
  minor), Jazz (ii-V-I, turnaround, minor ii-V-i, Autumn Leaves) and **Classics**.

### Added
- **Classics** in the Load menu, written as degrees so they can be played in any key: Rhythm changes (I Got Rhythm), All the Things You Are, Giant
  Steps, Confirmation, Blues for Alice and Summertime, with the chords of each bar (two to a bar where the tune has two) and lead-sheet spelling
  (Bb, Eb, Ab). Their changes were taken from the Weimar Jazz Database's transcriptions and checked against the well-known lead-sheet changes in tests.
  In Compose they are laid out bar by bar, with two chords per bar where the tune has them.

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
