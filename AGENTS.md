# Fretwork - Agent Notes

This app is a vanilla-JS, no-build-step, no-framework PWA
for guitar/ukulele theory and composing, in five pages: Progressions, Scales, Chords, Identify (chord from marked
notes) and Compose (tab editor + solo generator + PDF / share link). The theory pages render on a shared SVG
fretboard (`board()` in `site/board.js`). Read
this before touching `getPositions`/`positionFrets`/`board()` - the
position/box system went through many wrong turns before landing here, and
re-deriving it from scratch will very likely repeat them.

## Code map

All plain ES modules in `site/` (no build). Dependencies point one way (`music.js` is the base):

| Module | Responsibility |
| --- | --- |
| `music.js` | note names, `SCALES`, `CHORDS`, chord parsing, chord-scale ranking, key detection, `spell`/`esc` |
| `positions.js` | `getPositions`/`positionFrets`: the two position models, always an unbroken run by pitch |
| `chord-features.js` | chord-builder features derived from intervals |
| `arpeggio.js` | degree chords, arpeggios in positions / around voicings |
| `identify.js` | chord identification from marked notes (pure): `identifyChord`, `marksToNotes` |
| `tab.js` / `tab-view.js` / `tab-share.js` | tab data model + editing rules (pure) / the tab SVG and its geometry / share-link codec (pure) |
| `solo.js` | seeded solo generator: scale/position per chord stretch, chord-tone targets, approach notes (pure) |
| `board.js` | the fretboard SVG (positions, voicings, capo, left-handed mirror) |
| `voicings.js` | chord voicing data lookup (incl. reuse in other tunings) and chord boxes |
| `instrument.js` | setup: instrument, tuning, capo, handedness |
| `audio.js` / `player.js` / `transport.js` | Web Audio (note routing + the simple synth), playback of progressions and tabs, beat and swing math |
| `string-dsp.js` / `sound.js` | the plucked-guitar voice (pure DSP, Node-tested) / its playback chain and the Sound setting |
| `share.js` / `progressions.js` | share-link codec / roman-numeral progression library |
| `view-*.js`, `app.js`, `sw.js` | the five pages (`view-compose.js` is Compose), routing / lazy mounting, offline service worker |
| `types.js` | JSDoc typedefs only (never loaded at runtime) |

**Types:** JSDoc, checked by `npm run typecheck` (`tsc --noEmit`, no build). The engine modules are
under `tsconfig.strict.json` (`noImplicitAny` + `strictNullChecks`) - new code in them must be fully
typed; views, tests and tools use the looser `tsconfig.json`; `sw.js` has its own worker config.

## The position/box system (`getPositions`, `positionFrets`)

A "position" is a hand shape for playing a scale without shifting: pick a
root, pick a scale, and the app numbers every scale degree's anchor point
on the low string ascending by fret (`getPositions`), then computes the
actual playable shape for each one (`positionFrets`).

**This uses two different algorithms, not one, selected by scale
density** (`new Set(scaleIv).size`):

- **<=6 unique degrees (pentatonic/hexatonic, "CAGED" boxes)** -
  `boxFrets()`. Each position's nominal `[s,e]` (from `getPositions`)
  applies independently per string, plus a 1-fret "connector tone" at each
  boundary where a string has no note exactly on the boundary fret, plus a
  completeness rescue pass. This produces the real, textbook box shapes,
  **including their per-string "jog"**: in A minor pentatonic position 3,
  the outer strings (low E, B, high E) span frets 5-8 but the inner
  strings (A, D, G) only reach 5-7, because the B string is tuned a major
  3rd (not a perfect 4th) from G. That asymmetry is correct and
  deliberate - confirmed against the documented algorithm in
  [boxed/caged](https://github.com/boxed/caged) ("each scale note is
  assigned to the box where it serves as the lower of the two notes on
  its string... the B string shapes shift by one fret across the G-B
  boundary"). Do not "fix" this into a uniform window - that was tried and
  it breaks the real shape.

- **7+ unique degrees (diatonic modes, harmonic/melodic minor, diminished,
  whole tone)** - `windowFrets()`. One **uniform** `[lo, hi]` fret window,
  identical on every string - same finger-per-fret, no per-string
  variation. Starts at the position's anchor fret with a default width of
  4 (standard one-finger-per-fret hand position) and grows forward only if
  some scale degree genuinely isn't reachable within it yet. This matches
  William Leavitt's *A Modern Method for Guitar* (the Berklee 7-position
  system), which documents exactly this convention and explicitly accepts
  occasional stretches over 5 frets as the cost of never shifting the
  hand mid-position - so a position occasionally reaching slightly wider
  than 4 frets is expected, not a bug.

**Why two models and not one:** a uniform window breaks the pentatonic
box's per-string jog (regresses the already-approved A minor pentatonic
shapes); reusing the box model's per-string approach for 7-note scales
caused a real bug, where a rigid "N consecutive degrees per string" walk
would reach for a far occurrence of a degree on one string even when the
*same* degree was already available much closer on a different string
(observed: A Ionian position 3 reaching to fret 9 on the B string, when
its own anchor degree, G#, was already sitting at fret 4 on the high E
string). These are two different, both-authoritative conventions for two
different scale families, not one convention needing a better parameter.

**Positions must read as an unbroken run by PITCH, not per string.**
Played low string to high string, every scale pitch between a position's
lowest and highest displayed note must be shown. Neither model guarantees
this on its own: a uniform window skips a pitch whose only nearby
instance sits 1-2 frets outside the window (e.g. C Ionian position 4: the
B at fret 4 of the G string, outside frets 5-8, was dropped while the B an
octave up was shown). `fillPitchGaps()` (run last in `positionFrets`)
adds such pitches at the nearest fret outside the window - the "stretch"
notes Leavitt positions use. It needs absolute pitch, so callers pass
`inst.midi` (re-entrant ukulele tuning can't be derived). Per-string
checks alone missed this entirely; always test by pitch across strings
and against what `board()` actually draws in the SVG.

Windows whose top fret has no scale tone on any string are extended
(`topUsed`) so no position collapses to a 2-fret shape.

## Verified invariants (and why)

`test/theory.test.mjs` is the actual regression suite (not a print-and-read
script - it asserts and exits non-zero on failure). Run it with
`npm test` before shipping any change to
the scale/position logic in `positions.js`. It checks, across all 20 scales x 12
roots x the guitar's own tuning:

- **Completeness**: every scale degree is reachable somewhere in every
  position (you should never have to leave a position to play a note of
  its scale).
- **No skipped notes by pitch** (guitar and ukulele): every scale pitch between a position's lowest and highest note is shown, and the SVG's bright circles equal the data.
- **Per-string span <= 4**: no single string should ever demand more than
  a 4-fret reach within one position (the max possible for 3 consecutive
  diatonic degrees, confirmed against Leavitt's documented norm).
- **Overall span bounds**, separately for each model (box model <= 8,
  window model <= 6) - matched to each convention's own documented norm.
  A position exceeding these is almost always a reference-drift bug in
  the generation algorithm, not a real scale shape - this caught a real
  bug once (D major pentatonic position 1 blew out to 17 frets because
  one note, which genuinely has no closer occurrence on its string,
  dragged every subsequent string's reference along with it).
- **Pinned exact shapes**: A minor pentatonic positions 3/4 (the
  canonical, user-verified reference, jog included) and A Ionian positions
  1/3 (the literal bug reports that motivated the window model).

## Chord voicings (voicings)

Voicings are **not computed** - they come from
[tombatossals/chords-db](https://github.com/tombatossals/chords-db) (MIT,
(c) 2016 David Rubert; attribution in `site/data/voicings.LICENSE.txt`).
Computing playable voicings means encoding finger-stretch/barre rules
and which shapes people actually play, which a curated dataset already
does. `npm run build:voicings -- <chords-db>/lib` converts it into
`site/data/voicings.json` (guitar ~1630, ukulele ~1630 voicings): our own
string order (index 0 = highest string, like `tuning[]`), **absolute**
frets (the source stores them relative to `baseFret`), finger numbers,
and barre `{fret, from, to}`. During conversion each voicing is validated
(frets must reproduce the source's own MIDI notes, notes must belong to
the chord, root present on guitar); the ~60 that fail (mostly rootless or
odd extended-chord entries) are dropped and reported, not shown. Our table's
plain `11` omits the 3rd and `13` the 11th, which real voicings keep, so
those are allowed. Re-run the build only if updating the dataset.

- `site/voicings.js`: lazy `fetch` of the JSON, `getVoicings()`, and
  `voicingDiagram()` (small SVG chord box with nut/base fret, finger
  numbers, barre bar, x/o markers). It uses `currentColor`; the finger
  number colour is the `--chip-num` CSS variable (inverted on the
  selected chip).
- Chords tab: a "Voicing" selector like the scale Position selector. A
  chosen voicing dims the neck to just its dots (`board` `opts.voicing`),
  with a Fingers label mode, a drawn barre and x marks. "Play chord"
  strums the real fretted notes (`play`'s `chordMidi`).
- Progressions: each chip shows a diagram. The voicing defaults to the one
  that best fits the chord's selected scale position(s) (else lowest on the
  neck); picking a voicing sets the scale position to the one containing
  most of its notes and rings the voicing over the neck without dimming the
  scale (`opts.voicingRing`). Picking a position clears the override so the
  voicing follows again.
- Chord types with no stored voicing (13 exotic extensions) show no
  diagram, not an invented one.
- `test/theory.test.mjs` checks all ~3260 voicings (valid frets/fingers/barre,
  fits the 15 drawn frets, only chord tones, `board()` draws exactly its
  dots).

## Arpeggios

- `site/arpeggio.js` (pure): `degreeChord` stacks thirds on a degree of a SEVEN-note scale (named
  via `CHORDS`, roman numeral from quality); `arpeggioInSets` = the chord tones among a position's
  notes; `arpeggioAround(voicing)` = every chord tone in the voicing's fret window +-1 (the
  "arpeggio shape" that goes with a chord shape; an open voicing keeps the nut);
  `arpeggioNotes`/`upAndDown` give the playable sequence, `playNotes` (player.js) plays it.
- The Scales view recolours the board by re-basing the scale onto the chord root (the board colours
  relative to the chord root), so Intervals labels are then relative to that chord.
- Test (`test/arpeggio.test.mjs`) leans on the position guarantee: every position of a seven-note
  scale contains every degree, hence every degree chord's arpeggio is complete inside every
  position - checked for all 15,288 (scale, root, position, chord) combinations. Some ukulele
  voicings legitimately have no root in their window (4 strings); the shape only has to contain
  three distinct chord tones.

## Tunings, capo, left-handed

- `site/instrument.js` holds the setup (instrument, per-instrument tuning, capo, handedness) and
  `getInstrument()` derives what the engines need: effective `tuning` (pitch classes), `midi`
  (capo included), string widths, `standardPcs`. Tunings are lists of open-string MIDI notes, TOP
  string first. A capo is just every open string raised, with fret numbers counted from it (the
  board draws a capo bar instead of the nut). To add a tuning, add an entry - nothing else.
- The scale/position engines only ever see `tuning` + `midi`, so they work in any tuning;
  `test/setup.test.mjs` checks all 14 tunings (no missing degree, no skipped pitch, span <= 6, the
  Leavitt norm - irregular tunings legitimately need 5-6).
- **Voicings in other tunings** (`getVoicings(inst, root, suffix)`): the dataset is standard tuning,
  but a stored shape is valid whenever every string it PLAYS is shifted by the same T semitones from
  standard (muted strings may differ); it then sounds chord root R when taken from root R-T. That
  covers capo c (T=c), half/whole step down, baritone ukulele, Drop D shapes that skip the low
  string, and pads extra low strings muted (7-string). The test checks every reused shape against
  the chord's tones in every tuning.
- **Left-handed** mirrors the neck in `board()` (coordinates only; text stays upright) and the chord
  boxes (`voicingDiagram({mirror})`). Tests compare the mirrored SVG dot-for-dot.
- The setup is saved in localStorage (`fw-setup`) and carried in share links (`t`, `cp`, `lh`).

## Sharing and playback (Progressions tab)

- **Share links** (`site/share.js`, pure): `#progressions?c=<chords>&k=<key>&i=<instrument>&x=<base64url json
  of per-chord choices>`. The address bar is kept in sync with `history.replaceState` on every
  state change (so reload/bookmark/copy all work), and pasting a different link re-applies it. A link
  is **untrusted input**: `decodeProgression` validates every field, caps lengths and ignores
  `__proto__`/`constructor`; keep it that way when adding fields (extend `test/player.test.mjs`).
- **Player** (`site/player.js` + `site/transport.js`): schedules on the Web Audio clock with a short
  look-ahead timer; the pure beat math (`eventsAtBeat`) is unit tested, the highlight/stop behaviour
  is covered by the e2e test. Tempo/beats/loop/click changes take effect on the next Play.
  `audioContext()` and `chordMidiNotes()` in `audio.js` are the shared audio helpers.

## Quality gates

- `npm test` (plain Node, no deps): theory/position/voicing/builder invariants, share + player logic,
  tunings, arpeggios, **SVG golden snapshots** (`test/golden/*.svg`, exact markup of key fretboards
  and chord boxes - unintentional shape/colour/mirror changes fail with a line-level message;
  intentional ones: `npm run test:golden:update` and review the diff in the PR), and the shipped-site
  checks (manifest, service-worker file list, nothing external, relative paths, nginx mime/gzip).
- `npm run test:nginx` builds the real Docker image and checks every shipped file's Content-Type,
  no-store and gzip (skips locally without Docker; required in CI). It exists because a `types {}`
  block in `nginx.conf` REPLACES nginx's whole mime table - the whole site was served as a download
  once, and the dev server used by the other tests could not see it. Never test only a dev server
  for what nginx is responsible for.
- `npm run test:e2e` (Playwright): drives the app at `/` and `/fretwork/`, offline, sharing, playback.
- `npm run test:a11y` (axe-core): every tab, light + dark, desktop + phone, plus Chrome's own
  installability check. Contrast, labels and landmarks currently pass - keep it that way.
- CI also runs Lighthouse (`lighthouserc.json`: performance >= 0.9, accessibility >= 0.95, best
  practices >= 0.9, SEO >= 0.9; currently all 1.0) and CodeQL.
- **Performance rule:** only the visible tab is mounted at startup (`ensureMounted` in `app.js`);
  mounting every page at startup cost ~300 ms of blocking time and doubled the DOM. Keep new views lazy.

## Compose: the tab editor

`tab.js` is the single model every tab feature uses (48 steps per 4/4 bar: quarter 12, sixteenth 3, eighth
triplet 4 - `STEPS`/`BEAT`/`SIXTEENTH`; older saved tabs have no `res` and are converted x3 by `normalizeTab`;
triplet lengths are `TRIPLET_OF`, and `gridFor` is the click grid for a length) (editor, playback, and later the solo generator
and PDF export): a `Tab` is bars of 16 sixteenth-note steps; a `TabNote` is `{at, len, s, f}` (string 0
= top string, fret counts from the capo). All edits are pure functions returning a new Tab, so undo
is a stack of snapshots (`createHistory`). A string rings one note at a time: `putNote` shortens the
earlier note and clips the new one. Never trust stored/shared data: run it through `normalizeTab`.
Pitch is `inst.midi[s] + f`, so tuning and capo come for free. `tab-view.js` draws the SVG (CSS
classes `tab*`, so dark mode and printing work) and exports the geometry (`stepPos`) the editor uses
for the cursor and playhead. Chords are markers `{at, name}` per bar (`putChord`, up to 8),
`chordTimeline`/`chordsUsed` feed playback and the chord overview; the chosen voicing per chord name
is `tab.voicings` (so exports can match what is played). Typing: a digit places a note at the cursor, a second digit within
700 ms extends it (1 then 2 = fret 12, one undo step), then the cursor advances by the note length.
Tests: `test/tab.test.mjs` (model, validation, exact text export, rendering), the `tab-riff` golden,
and the Compose section of the e2e test.

## Compose: the solo generator

`solo.js` (pure, seeded: same seed = same solo) walks the pitches of one position per chord
**stretch** (a bar split at its chord markers). Rules: scale per style (`follow` = the scale the
Progressions tab ranks first, `pent` = major/minor pentatonic on each plain chord, `blues` = the
key's blues scale throughout, tonic = the first chord); first note of a stretch and strong beats are
chord tones (the nearest other one); other notes step (58%), skip (22%), repeat, or leap (answered
by a step back); no leap over a major sixth and no triple repeats; the last onset before a chord
change is a scale step from a chord tone of the NEXT chord; bar-0 rhythm and shape come back in
bars 1 and 3 of each 4; the last note is the last chord's root, held. Scale/position choices live on the chord MARKER (`TabChord.scale`, `.positions`, 1-based) so they are per
occurrence, as in Progressions: the same chord later can use another position (the solo can evolve). Renaming
a chord drops its choices; changing the scale clears the positions. `scaleFor`/`soloContext` are shared by
the generator and the plan panel so the preview matches what is generated. `test/solo.test.mjs` checks
these on ~3,700 solos across all tunings, capos, styles and densities (notes in scale and position,
>=90% chord-tone starts, >=55% strong-beat chord tones, approach >=80%, ...). It is a phrase
generator, not a performer: no bends, slides or feel yet.

### Sound

`audio.js` `note()` routes every note through the engine set by `setNoteEngine` (or its own simple triangle synth
`simpleNote` when none / if the engine returns false or throws). `sound.js` is the "Plucked guitar" engine: it renders
each note with `string-dsp.js` (`renderString`, pure, deterministic, Node-testable) into a cached AudioBuffer at 22.05 kHz
(~2.5 ms per note) and plays it through EQ -> compressor -> short convolver room -> limiter. Why not Tone.js PluckSynth:
measured (2026-10-14) random loudness (3-14 dB between identical notes), silent above ~1.1 kHz, flat by up to 30 cents.
Timing: the chain's two DynamicsCompressors delay audio by ~12 ms (`CHAIN_LATENCY`), the click and the simple synth bypass
it, so `sound.js` starts each note that much early; the e2e test measures it offline. The voice adds a ~6 ms pick tick and rings
for 1.15x the written length (1.4x smeared consecutive notes on one string).
Lessons from building the voice: the 2-tap loop filter attenuates the FUNDAMENTAL of high notes, so the filter weight `a` rises
with pitch and the loop gain is capped below 1 (a gain >= 1 at DC made E6 explode/silent); normalise each note's RMS for
consistent loudness; the delay is read with cubic interpolation so bends/slides/vibrato are smooth. `test/sound.test.mjs`
measures tuning (<3 cents at 22.05/44.1/48 kHz), loudness (+-0.5 dB), decay trend, damping, bend/slide/vibrato, harmonic
content, centroid, cost; the e2e test renders the real chain in an OfflineAudioContext. If a sampled guitar is ever wanted,
Tone.Sampler (vendored, lazy-loaded, listed in sw.js SHELL, excluded from CodeQL and from the site test's URL scan) is the plan.

### Sharing a tab

`tab-share.js` (pure): `#compose?i=&t=&cp=&lh=&d=<base64url json>` (`#tab?...` is the old name and still works: `tabOf` aliases it). `d` is a compact JSON (`v:1`, `n` title, `b` bpm,
`r` bars as `[chords, notes]` with notes `[at,len,s,f,code]`, technique `code` = link h1/s2 + bend*10 + vibrato 100,
`o` voicings, `g` generator settings incl. seed). Decoding is untrusted-input safe: it rebuilds the object and runs it
through `normalizeTab`, caps sizes, validates the generator settings one by one. The Compose view applies a link at
mount and on `hashchange` via `openShared`: it pushes the shared tab onto the undo history (so Undo restores the
user's own), applies the setup/generator settings, and tidies the long hash away. `app.js` applies the setup
before the views mount, like Progressions links.

### Evolve

`intensityAt(evolve, bar, bars)` (0.1-1; 'arc' peaks ~70% in and falls, 'build' rises to the last bar, the last bar is
<= 0.4) drives three things per bar: the position (target centre fret between the lowest and highest position of
the scale; moves at most ONE position per bar while the scale stays, so there is never a leap; positions the user
set on a chord marker win), the rhythm band (`BANDS[round(intensity * peak)]` where peak is the chosen density, so
it never gets busier than asked) and the technique probabilities (x 0.5 + intensity). `evolve: 'off'` leaves
everything as before (intensity 1, same RNG use), so older tests double as the regression check.

### Techniques

A `TabNote` may carry `link` ('h' = hammer-on/pull-off, direction from the frets; 's' = slide) into the NEXT note
on the same string (`linkedNext`: within a sixteenth of this note's end, same bar), `bend` (1-4 semitones) and
`vib`. `setTechnique` edits them (a slide clears bend/vibrato); `putNote` keeps them when the fret changes.
`tabEvents` turns links into player flags: hammer/pull -> the next event is `soft`; slide -> one long event
with `slideTo/slideAt/slideEnd` and the next event `skip`. The generator adds them in a final pass
(`addTechniques`); a bent note is written LOWER than the scale note it arrives at, so tests compare
`fret + bend` to the position and scale, and the sounding pitch for leaps and chord tones. Remember when
copying generated notes into a Tab: copy the technique fields too (the e2e test caught this once).

### Feels, swing and PDF

`FEELS` in `solo.js` pick the rhythm pool (`RHYTHMS[feel][density]`, `FINALS[feel]`): straight and funk
sit on sixteenths, shuffle writes long-short pairs (`fromBeats`: P = 8+4 steps, T = three 4s, Q = a
quarter) and triplet writes runs of triplet eighths - all on the 4-step triplet grid. `swung()` in
`transport.js` is the playback-only swing mapping (beats never move); it does not change the notes.
The PDF is the browser's own print: the Compose view builds `#print-sheet` on `beforeprint` (title, meta,
chord boxes from `tab.voicings`, one SVG per row of bars so rows never split) and `@media print` hides
the app. Test it by dispatching `beforeprint` + `page.emulateMedia({media:'print'})` + `page.pdf()`.

## Chord identifier (Identify tab)

`identify.js` is pure. A chord matches when every played pitch class is one of its tones
(`TOLERATED` adds the 11th that 13th-chord voicings contain). Score = 10 - 0.15*tones minus omit
penalties (root 3, 5th 0.5, 3rd/sus/altered 5th 6, 7th 5, extensions 1.5, or 6 in chords of <=4
tones) minus 0.8 for a slash chord; matches under 2.5 are dropped. Aliases (maj6, add2, 7#5, 11)
are not candidates and `11` is the full dominant 11th. Re-entrant tunings (ukulele high G) give no
bass, so no slash chords. `test/identify.test.mjs` runs every stored voicing through it (every
guitar one must be found) - that is the check against real data; keep it when changing weights.
The fretboard cells come from `board(..., {hitAreas:true})`; the per-string selects are the
keyboard-accessible equivalent.

## Chord builder (Chords tab)

Toggles above the chord header (`FEATURE_GROUPS` / `chordFeatures` in
`chord-features.js`) filter the chord-type list and build a chord: third (pick
one), seventh (pick one), fifth/extension/alteration flags. A chord's
features are **derived from its intervals**, never hand-tagged, so a chord
added to `CHORDS` appears automatically; the tagging rules are subtle (a
6 vs a 13th, a b5 vs a #11, a #5 vs a b13 depend on whether a 5th is
present, an 11th only counts above a third, `11` is really sus4+7+9) - read
`chordFeatures` before changing it. The list shows chords containing every
selected feature, exact matches first; when the selection is exactly one
chord's feature set it is auto-selected; toggles that would match nothing
are disabled. True aliases share a feature set (6/maj6, add9/add2, aug7/7#5,
11/9sus4). `test/theory.test.mjs` checks the features never merge chords with
different notes and that every toggle is used.

## Before inventing further changes here

If you're about to change how positions are computed, first check
whether a real external authority already documents the answer, rather
than re-deriving it from reasoning and testing only against your own new
tests - that approach produced several iterations that each looked
"verified" and still had real bugs, caught only because the user is a
guitarist and kept finding them. Real diagrams for this topic are almost
always published as images, not data, so expect to verify by cloning a
reference implementation (check its license) and running it, or by
reading an actual method book's description of its own rules, rather than
finding a ready-made dataset.

## PWA, caching and deployment

- **Everything is relative** (`./`, `sw.js`, `manifest.webmanifest`, `fetch('./data/...')`):
  the app is served from `/` (Docker/nginx) and from `/fretwork/` (GitHub Pages). Never
  introduce a root-absolute URL or an external request - `test/site.test.mjs` fails on it, and
  `test/e2e.test.mjs` loads the app at both a root and a `/fretwork/` origin, then goes offline.
- **Service worker (`site/sw.js`)** is network-first with `cache: 'no-cache'` (always revalidates;
  the cache is only an offline fallback). This is deliberate: files have no content hashes, and
  stale-cache problems while iterating were a real, repeated pain. A file under `site/` that is not
  listed in `SHELL` will not work offline - the site test catches it.
- **Icons** are generated from the SVGs by `tools/make-icons.mjs` (Playwright). The font is
  self-hosted (`site/fonts`, OFL).
- **Pages:** `.github/workflows/pages.yml` runs the tests then publishes `site/` on every push to
  `main`. `ci.yml` (job `test`) runs on pull requests and is the required status check; changes
  reach `main` only through reviewed PRs.
- **Docker:** `Dockerfile` + `nginx.conf` serve `site/` on port 8000 with `Cache-Control: no-store`
  (and gzip for the 150 KB voicing JSON) for self-hosting.
