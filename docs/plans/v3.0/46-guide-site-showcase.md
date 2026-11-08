# v3.0 46: guide site review + showcase (demos, diagrams)

Owner 2026-11-08: the GitHub Pages guide (https://maxipawlowski.github.io/story-orchestrator/) should be current and show
every visible piece of the project (UI kit, Play page, story sheet, HUD, inline timeline, in-chat elements, animated
characters, backgrounds, Studio, wizard), plus workflow explanations as Mermaid diagrams.

## Where it stands (checked 2026-11-08)

- Site: `npm run guide:site` (`scripts/docs/guide-site.mjs`) renders `docs/guide/**` to `.guide-site`;
  `.github/workflows/guide-pages.yml` deploys on push to master touching `docs/guide/**`, `docs/authoring/story-guide.md`,
  `src/guide/**`, `scripts/docs/**`. Last deploy 2026-11-02, green. Pages is public, build type workflow.
- Content: author fields are regenerated from the guide source (`npm run docs:guide`), so they track the code. The
  hand-written player and setup pages lag: last edited 2026-11-01; nothing on talk pacing, in-chat elements, live
  characters, the workspace dialog or backdrops; one image (`assets/settings-sections.png`).
- No diagrams, no demos. Storybook (199 suites, every UI part has a story) builds in CI (`test-storybook:ci`) but is not
  published. `docs/showcase.md` (Lantern Inn) is a lane recipe; its art lives outside the repo and is not publishable.

## Goals

1. **Accurate**: every page matches the current build; a stale page fails a check instead of drifting quietly.
2. **Show, don't tell**: each visible feature has a live demo or a recorded clip next to its text.
3. **Explain the machine**: Mermaid diagrams for the main flows, kept next to the code they describe.
4. **Safe to publish**: the repo and site are public. No Adolion campaign content, no secrets, no owner data, only
   synthetic or properly licensed art.

## Structure

- Home: what it is, a 30-second clip, links by role (Player, Author, Setup, How it works, Showcase).
- **Player**: playing, the Play page, story sheet, HUD, story card, inline timeline, in-chat elements, start pane, memory,
  troubleshooting. Each with a screenshot or clip.
- **Author**: unchanged generator for fields, plus Studio, wizard, Ask, talk pacing, stuck leads, minimum turns, backdrops.
- **Setup**: models, local controller, Vast/rented GPU (from the runbook), images, judge, GPU sharing.
- **How it works** (new): Mermaid diagrams.
- **Showcase** (new): live demos.

## Showcase sections (live where possible)

- **UI components**: publish the Storybook static build under `/ui/` (kit, Play page, story sheet, HUD, workspace,
  Studio, inline timeline, in-chat elements) with the ST dark/light/Celestial themes. Mocks only, no network.
- **Animated characters**: a standalone page running the live-head and pose code (`src/sprites/liveHead`, `AnimatedFace`)
  on synthetic, publishable art (new art made for this, licence recorded), with controls for speaking, emotion, gaze.
- **Backgrounds**: the plan 45 stage on sample images, effects, parallax with real depth maps, one or two generated loops
  (the lab artifact shows the target).
- **A short story, recorded**: a synthetic demo story (not Adolion, not the unpublished Lantern art) played on a lane
  with real generation; clips of a turn with talk pacing, a stuck lead, a swipe rollback, a scene change with backdrop.
- **Wizard and Studio**: short clips of a story built from a prompt, the graph editor, diagnostics.

## How it works: diagrams (Mermaid)

One per flow, sourced in `docs/guide/how/*.md` and checked against code names:

1. A turn end to end: player send → talk control chain → replies → `TurnBridge` → boundary commit (`BOUNDARY_STEPS`
   order) → effects → snapshot → UI.
2. Rollback: swipe/edit/delete → detectors → quarantine → replay.
3. Extraction off-path: scheduler → shared read → audits → apply at the next boundary.
4. Memory tiers and held secrets: what reaches each member, the resting view, copier filtering.
5. Talk pacing: profiles, budget, spotlight, address, reaction, yields.
6. Lore: story books per chat, checkpoint gating (scan mode), curator propose → apply.
7. Images and GPU: queue, broker, controller, ComfyUI, backdrops (depth, loops).
8. Models and routes: pass roles, harness bridge, judge plugin, local controller vs Vast box.
9. Wizard: interview → stages → provisioning cards → validation → save.

Rendering: Mermaid in the site generator (pinned client script, or pre-rendered SVG at build if CI allows); dark/light
themes; each diagram lists the source files it describes, and a check fails when a named file or symbol disappears.

## Work packages (parallel, disjoint)

- **W1 Audit**: read every published page against the current build (live check on a lane in player and author view);
  list stale/wrong/missing per page; fix text. Output: audit table in this plan, fixes merged.
- **W2 Site engine**: Mermaid support, a Showcase section, embedding Storybook under `/ui/`, clip/image pipeline
  (compressed WebM/GIF, size budget), link checker, deploy workflow paths updated.
- **W3 Diagrams**: the nine diagrams with source-symbol checks.
- **W4 Demos**: Storybook publish config, the animated-character page, the backdrop page (after plan 45 A/B land),
  synthetic art.
- **W5 Recordings**: synthetic demo story + lane recording script (`scripts/debug/`), reproducible clips; rerun on
  demand when UI changes.
- **W6 Guards**: a privacy scan over the built site (campaign names list from the private repo checked locally, never
  committed; secrets patterns; owner paths), screenshot freshness (each image records the build it came from), all in
  `guide-pages.yml` + `npm run gates` where cheap.

Order: W1, W2, W3 start at once; W4 after W2's Showcase shell; W5 after W4's demo story; W6 alongside W2. Each merges
with full gates (one at a time machine-wide) and deploys through the existing workflow.

## Floors (informational)

- 0 broken links, 0 privacy-scan hits, every Player/Author/Setup page reviewed against the build in the audit table.
- Site loads in < 3 s on a cold cache; each page ≤ 5 MB including media; Storybook under `/ui/` builds in CI.
- Every diagram's source check green.

## Owner decisions 2026-11-08

- Publish Storybook under `/ui/`: yes.
- Demo art: generate new synthetic, SFW art on the local ComfyUI (checkpoint licence recorded per image set).
- Examples are made as part of development: every feature (plans 45, 46 and later) ships a publishable synthetic example
  (story, art, clip or page) with its merge, instead of a separate recording pass. Adolion material stays private and
  is never used (public repo; the owner plays it fresh).

## Unresolved questions (superseded where answered above)

- Publish Storybook publicly under `/ui/`? (Recommended: yes, it holds only mocks.)
- Art for demos: new synthetic art generated locally (our ComfyUI, SFW, licence of the checkpoint recorded), or keep demos
  art-free (CSS/canvas only)?
- Recorded clips need real generation on a lane (local 3090 or Vast): run them after the playtest?
- Keep the site in English only (repo rule): yes.
