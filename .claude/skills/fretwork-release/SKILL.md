---
name: fretwork-release
description: Ship a Fretwork change - run the gates, bump version and changelog, PR, CI, merge, release, Pages and homelab redeploy. Use when asked to publish, release or deploy Fretwork.
---

Follow the "Releasing" section of `AGENTS.md` in this repository: it lists the gates (typecheck, unit tests, browser test, accessibility test),
the files to update (CHANGELOG, package.json and package-lock.json, README and screenshots when a page changed), the PR / merge / tag / Pages / homelab sequence and its gotchas
(stale test servers, the Cloudflare cached 404, waiting for the view in browser tests). Do not skip a gate; report any failing check with its output.
