# Fretboard Theory - Agent Notes

This app (`apps/guitar/`) is a vanilla-JS, no-build-step, no-framework PWA
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

**One narrower-than-the-rest position per scale/root is normal, not a
bug.** For any 7-note scale, exactly one of its 7 positions will end up
with a 2-fret (not 3-fret) rendered span, because the major-scale step
pattern (W-W-H-W-W-W-H) means the window's topmost default fret
occasionally has no scale tone on *any* string. This is mathematically
unavoidable and was checked explicitly (every root of Ionian was swept;
exactly one position per root is narrower, confirmed accurate, not
missing any note).

## Verified invariants (and why)

`verify-theory.mjs` is the actual regression suite (not a print-and-read
script - it asserts and exits non-zero on failure). Run it with
`node apps/guitar/verify-theory.mjs` before shipping any change to
`theory.js`'s scale/position logic. It checks, across all 20 scales x 12
roots x the guitar's own tuning:

- **Completeness**: every scale degree is reachable somewhere in every
  position (you should never have to leave a position to play a note of
  its scale).
- **No internal gaps**: within one string's own displayed fret range in a
  position, every scale tone in that range is shown - nothing silently
  skipped between the lowest and highest note shown on that string.
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

## Deployment

Static site, no build step: `rsync` `apps/guitar/` to the runtime stacks
dir (excluding `verify-theory.mjs` and any local `pw-*.mjs` Playwright
scratch scripts), then `docker compose build && up -d` in
`compose/guitar/`. Served by nginx with `Cache-Control: no-store` on
everything (`apps/guitar/nginx.conf`) - this is deliberate: a personal,
low-traffic tool with no content-hashed filenames, so correctness during
active iteration matters more than cache performance. Live at
`guitar.internal.junou.dev` (LAN) and `guitar.junou.dev` (public, via the
existing Cloudflare tunnel wildcard).
