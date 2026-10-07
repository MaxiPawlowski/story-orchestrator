# Plan 30 — In-plugin guide

**Status (2026-10-07): BUILT (`01b9f8f2`, fixes `7f3bf89d`); was SEEDED from the user (2026-10-07: "having a proper wiki inside the plugin with a proper
documentation"); needs user approval; not built.** Overview: `00-overview.md`. Gate tier: D.

## Problem

Help (`src/components/help/HelpPanel.tsx`) is a searchable feature list whose "Read more" opens GitHub
(`guideUrl`, `registry.ts`). The real documentation — ~60 pages under `docs/guide` (player, setup, author + 33
author topics) — lives outside the plugin, needs a browser tab and network, and can show a version that is not the
one installed.

## Player outcome

A **Guide** inside the plugin: a reader with a sidebar (Player / Setup / Author), search, and back/forward, showing the
pages of the installed version. Every "?" (settings, Repair rows, Help entries, Studio's "How to write this") opens
the right page at the right heading. Author pages show only with Author view.

## Design

1. **Bundle at build time.** A webpack step reads `docs/guide/**/*.md`, emits one JSON index (id, title, audience,
   headings, plain text for search) and the page bodies as a **lazy chunk** (main-entry bundle budget untouched;
   precedent: the Studio chunk). Links between pages are rewritten to in-guide ids; external links stay external.
2. **Render with a small, safe Markdown renderer** (no raw HTML; images from the extension's own files only). Escape
   everything; a test feeds it `<script>`/`onerror` payloads.
3. **Reader UI** in a native `<dialog>` + `showModal()` (top layer, immune to ST's transformed `<html>`; precedent
   `#so-studio-modal`), ids `#so-guide`, `[data-so="guide-page"]`, `[data-so="guide-nav"]`, `#so-guide-search`.
   Mobile: sidebar collapses into a select; 390px layout.
4. **One page id scheme**: `registry.ts` `doc` fields, Help guide topics and `studio/guideTabs.ts` all point at guide
   ids; `guideUrl` stays only as "open on GitHub".
5. **Audience front-matter** on each page (`audience: player|setup|author`); author pages hidden in player mode
   (spoiler checklist; `so-ui.mts assert-player-clean` covers the dialog).
6. **`/story help <topic>`** opens the page (extends the v2.7 01 command).

## Gates (D)

- Drift: every `docs/guide` page is in the index; every registry `doc`, Help topic and Studio guide tab resolves
  to an existing page + heading (jest; fails on a renamed heading).
- Renderer: escaping + link rewrite unit tests; no network fetch from the reader.
- Bundle: main entry unchanged within budget; guide chunk size recorded in the build manifest.
- Storybook: reader per persona, search, deep link, mobile; a11y.
- Phase C live: open from a settings "?" and from a Repair row; search finds a page; ×2.

## Order

Before v2.7 29 (settings links target guide ids). Guide page content for features added in 32–38 lands with those
plans; the close-out (step Z) checks pages against the shipped UI.

## Decisions for the user

1. Inside the plugin only, or also keep the GitHub pages? **Recommended: both — same source, GitHub as the online copy.**
2. Include the developer docs (`docs/dev`)? **Recommended: no** — players and authors only.
3. Screenshots in pages (size cost)? **Recommended: a few, compressed, setup pages only.**

## Links

`01-docs-and-in-app-guidance.md`, `29-settings-by-area.md`, `docs/guide/README.md`, `src/components/help/`,
`src/copilot/guideTopics.ts`, `src/studio/guideTabs.ts`.

## Decided (user, 2026-10-07)

"Go with the recommendations": every decision in §Decisions above takes its **Recommended** answer.

## Gate record

**Built 2026-10-07** on `v2.7-image-track-wip` (`01b9f8f2`, fixes `7f3bf89d`).

- Bundle: `scripts/docs/guide-bundle.mjs` → `src/guide/pages.generated.ts` (56 pages), chained after `npm run
  docs:guide`; node:test drift, unique ids, link/heading resolution with a planted broken-link control, and a leak guard
  (machine paths, `docs/plans/`, lanes, `.debug`, `test/sessions`) with a planted control.
- Renderer `src/guide/markdown.ts` + `GuideMarkdown.tsx`: React elements only, no raw HTML, non-http(s) schemes refused,
  links outside `docs/guide` go to GitHub; jest over every page (no raw HTML, heading slugs match the bundle).
- Reader `GuideReader.tsx` in a third draggable panel (deviation: `PanelFrame`, not a `<dialog>` — it reuses the Help /
  Activity panel geometry and persistence); ids `#so-guide`, `#so-guide-search`, `[data-so="guide-*"]`; lazy chunk
  (~170 KB); `/story guide [page]`; Help Read more / author topics open it in place; registry feature `guide`.
- Results: `npm run gates` (integrated, after the 31 merge): all steps green except Storybook 8 failing (guide/help
  stories: axe color-contrast, scrollable-region-focusable, landmark-unique, implicit action args) — fixed; the two
  story files 13/13 green (`test-storybook` on a local static build). Full Storybook re-runs in the integrated pass.
- Decision 3 (a few screenshots): not done; the renderer refuses images today, so screenshots need an asset path
  first (follow-up).
- Live gate (open from "?" / Repair, search ×2): not run — Phase C C2.

## Review 2026-10-07 (Sol)

Source: v2.7 39 §Review 2026-10-07 (Sol). Both tasks below are owned by this plan and due before the v2.7 39 freeze
(B3). v2.7 39 C2 checks the rendered result.

| Finding | Change | Where |
|---|---|---|
| 20 | **Studio deep link:** `src/studio/components/GuideDisclosure.tsx` renders the embedded topic text only. It gains an "Open in the guide" control that opens the installed reader at the topic's page and heading (`studio/guideTabs.ts` ids). The reader is a `PanelFrame`, and the Studio is a top-layer `<dialog>`, so a panel opened behind the modal is unreachable. The link must show the reader above the modal (rendered inside the dialog, or as its own top-layer surface). Test: Storybook + live, open the reader from each Studio tab while `#so-studio-modal` is open, then reach and close it by pointer and keyboard (`ui: {action: "hit-test"}`) | Design 4; §Gate record (deviation `PanelFrame`) |
| 20 | **Screenshot assets owner:** decision 3 ("a few, compressed, setup pages only") is still undone because the renderer refuses images. This plan adds an asset path: images only from `docs/guide/assets/`, bundled into the guide chunk, compressed, alt text required, sizes recorded in the build manifest. The renderer test keeps refusing every other source | Decision 3; §Gate record |
