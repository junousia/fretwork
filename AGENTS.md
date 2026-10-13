# Fretwork - Agent Notes

This app is a vanilla-JS, no-build-step, no-framework PWA
for guitar/ukulele theory: chord progressions, scales, and chords, each
rendered on a shared SVG fretboard (`board()` in `site/theory.js`). Read
this before touching `getPositions`/`positionFrets`/`board()` - the
position/box system went through many wrong turns before landing here, and
re-deriving it from scratch will very likely repeat them.

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
`theory.js`'s scale/position logic. It checks, across all 20 scales x 12
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

## Chord voicings (fingerings)

Fingerings are **not computed** - they come from
[tombatossals/chords-db](https://github.com/tombatossals/chords-db) (MIT,
(c) 2016 David Rubert; attribution in `site/data/voicings.LICENSE.txt`).
Computing playable fingerings means encoding finger-stretch/barre rules
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
  notes; `arpeggioAround(voicing)` = every chord tone in the fingering's fret window +-1 (the
  "arpeggio shape" that goes with a chord shape; an open fingering keeps the nut);
  `arpeggioNotes`/`upAndDown` give the playable sequence, `playNotes` (player.js) plays it.
- The Scales view recolours the board by re-basing the scale onto the chord root (the board colours
  relative to the chord root), so Intervals labels are then relative to that chord.
- Test (`test/arpeggio.test.mjs`) leans on the position guarantee: every position of a seven-note
  scale contains every degree, hence every degree chord's arpeggio is complete inside every
  position - checked for all 15,288 (scale, root, position, chord) combinations. Some ukulele
  fingerings legitimately have no root in their window (4 strings); the shape only has to contain
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
  `audioContext()` and `chordMidiNotes()` in `theory.js` are the shared audio helpers.

## Quality gates

- `npm test` (plain Node, no deps): theory/position/voicing/builder invariants, share + player logic,
  tunings, arpeggios, **SVG golden snapshots** (`test/golden/*.svg`, exact markup of key fretboards
  and chord boxes - unintentional shape/colour/mirror changes fail with a line-level message;
  intentional ones: `npm run test:golden:update` and review the diff in the PR), and the shipped-site
  checks (manifest, service-worker file list, nothing external, relative paths, nginx mime/gzip).
- `npm run test:e2e` (Playwright): drives the app at `/` and `/fretwork/`, offline, sharing, playback.
- `npm run test:a11y` (axe-core): every tab, light + dark, desktop + phone, plus Chrome's own
  installability check. Contrast, labels and landmarks currently pass - keep it that way.
- CI also runs Lighthouse (`lighthouserc.json`: performance >= 0.9, accessibility >= 0.95, best
  practices >= 0.9, SEO >= 0.9; currently all 1.0) and CodeQL.
- **Performance rule:** only the visible tab is mounted at startup (`ensureMounted` in `app.js`);
  mounting all three cost ~300 ms of blocking time and doubled the DOM. Keep new views lazy.

## Chord builder (Chords tab)

Toggles above the chord header (`FEATURE_GROUPS` / `chordFeatures` in
`theory.js`) filter the chord-type list and build a chord: third (pick
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
