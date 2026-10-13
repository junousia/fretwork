# Contributing

Thanks for helping. The short version: open a pull request against `main`.

1. Fork or branch, make a focused change.
2. `npm test` must pass (this includes SVG golden snapshots in `test/golden/`: if you changed a shape on purpose, run `npm run test:golden:update` and review the diff) (add or update tests for behaviour you change). For UI changes also run
   `npm run test:e2e` and `npm run test:a11y` and look at it in a browser at desktop and phone width.
3. Open a PR using the template. CI runs the same tests; `main` only accepts PRs that pass and
   have been reviewed. Merging publishes the site to GitHub Pages.

## Ground rules

- **No build step, no framework, no runtime dependencies.** Plain ES modules in `site/`.
- **Everything relative.** No root-absolute URLs and no external requests (the app must work
  offline and under a subpath); `test/site.test.mjs` enforces this.
- **Adding a file under `site/`?** Add it to `SHELL` in `site/sw.js`, or offline will miss it (the
  site test will tell you).
- **Music-theory changes need an authority.** Scale positions and chord voicings follow real
  conventions (see `AGENTS.md`). Don't re-derive them from scratch: cite the source, and extend the
  tests so the invariant is checked across all scales and roots, not just the case you fixed.
- Chord voicing data is generated; to change it edit `tools/build-voicings.mjs` and regenerate
  (`npm run build:voicings -- <path to chords-db>/lib`), don't hand-edit the JSON.

## Reporting bugs

Please include the instrument, root, scale or chord, and position/voicing, and a screenshot - most
issues are about one specific shape being wrong.
