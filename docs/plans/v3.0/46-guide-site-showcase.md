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

## W2/W3/W6 as built (2026-11-08): contract for W4, W5 and plan 45

- **Site-only sections**: `docs/guide/how/*.md` and `docs/guide/showcase/*.md` render on the site only
  (`SITE_ONLY_DIRS` in `scripts/docs/guide-bundle.mjs` keeps them out of `pages.generated.ts`, so the extension bundle
  is unchanged). Nav sections "How it works / Diagrams" and "Showcase / Demos"; order = the section README's links.
  Header links: How it works, Showcase, UI components (`ui/index.html`).
- **Fences in site pages**: ` ```mermaid ` (client render, `mermaid@11.4.1` ESM from jsdelivr, dark/light follow
  `prefers-color-scheme`, script added only to pages with a diagram); ` ```embed ` with `src:` (local path only),
  `title:`, optional `height:` → iframe + "Open full page" link.
- **Media**: `docs/guide/assets/showcase/**` (png, jpg, jpeg, webp, gif, webm), referenced from site pages as
  `![alt](../assets/showcase/<path>)` (webm renders as a muted looping `<video>`). Every file needs a sidecar
  `<file>.json` `{ "build": "<commit sha>", "source": "<how it was made>", "licence": "<licence>" }`
  (`mediaProblems`). Flat `docs/guide/assets/*` stays the in-extension image set (150 KB cap).
- **Standalone demos**: `docs/guide/showcase/<name>/index.html` + its own files, copied verbatim to
  `showcase/<name>/`; optional `build.mjs` (`export default async ({ outDir, root }) => …`, not copied) runs at site
  build, for demos that bundle `src/` code (esbuild is a devDependency). Remote scripts only from jsdelivr/unpkg/cdnjs
  pinned to an exact version (`demoProblems`). Link a demo from a showcase page with `[label](<name>/)` or an embed.
- **Storybook** under `/ui/`: the workflow runs `npm run storybook:build` and
  `node scripts/docs/guide-site.mjs --storybook .sb-static`; without the flag `ui/index.html` is a stub. CI has no
  `.st-root`, so ST webfonts (icons) are absent in the published Storybook.
- **Guards** (`scripts/docs/site-check.mjs`, run by the workflow after the build; tests in `site-extras.test.mjs` run
  in `test:release`, so in `npm run gates`): link checker over every own page (`ui/` internals excluded), page budget
  5 MB (HTML + local media; a demo dir counts whole), privacy scan over every text file of the built site including
  Storybook (secret patterns, owner paths), media records, diagram sources (`## Sources` lines
  `` - `path`: `Export`, `Class.method` `` must name an existing file and exported symbol).
- **Local deny list**: `node scripts/docs/site-check.mjs --deny-from <campaign build dir>` writes card names to the
  gitignored `.guide-deny.txt`; `SO_SITE_DENY_FILE` points elsewhere. Hits print as `deny-list term #n`, never the term.
  CI scans patterns only.

## Gate record W2/W3/W6 (2026-11-08)

- Branch `v3.0-46-site`, master merged in. `npm run gates` (no `--resume`, Storybook included): all green in 568.0s
  (build, typecheck, typecheck:test, test:debug, lint, debug:typecheck, test:replay, test:release, test:plugin, test,
  test-storybook:ci 199 suites / 1167 tests). `gates:quick` green earlier. Docs tests 36/36.
- Live checks: 9 diagrams parse on mermaid 11.4.1 and render in a browser (dark mode checked). Local Storybook build +
  `site-check`: 0 broken links, 0 pages over 5 MB, 0 secret or owner-path hits; local deny list: only the common word
  "grant" remains (3 Storybook chunks), left on purpose.
- Owner-approved renames: example and placeholder names matching the campaign card list replaced with neutral ones in
  stories/fixtures (12 files), `TalkControlEditor.tsx`, an `effectLedger.ts` comment, the story-guide example and the
  read-contract feature copy (same-length or shorter: no bundle growth). An owner path in `JudgeSettingsGroup.stories.tsx`
  replaced.
- W4 clash fixed: `assets/showcase/LICENSES.md` allowed; demo URL check reads only script/style/import URLs, so data files
  (`rigs/*.json`, `demo.json`) and plain links pass. Verified against the `v3.0-46-demos` tree: 0 media, 0 demo problems.
  Note: one W4 demo character name is on the local deny list (local scan only; CI scans patterns).
- After merging master again (plan 45 A): `npm run gates` run 1 RED only at test:plugin
  (`imageCache.test.mjs` RAM-headroom timing under machine load; file passes 3/3 alone, not touched here); run 2 (no
  `--resume`) all green in 480.4s, test 1040 suites, test-storybook:ci 200 suites. Site check after it: only "grant".
- Deviations: architecture-doc mismatches found while writing the diagrams are listed in the W3 report, not fixed in
  `.claude/rules/architecture.md`.

## Audit 2026-11-08

W1. Build `457fed84` (staged), lane 30 (no-model, images and sprites off), group "Group: Arin, DM Narrator", stories
`examples/sun-ruins` and the synthetic fixture `test/scenarios/v28-18-q7-sheet.story.json`; player view and Author view
walked live (story bar, story card, story sheet, wand, workspace: Play, Story settings, Author, Library, Features,
Display, Models, Images & stage, Diagnostics, Help), claims checked against `src/` copy. 34 pages (33 + 1 new).
Totals: 41 stale, 10 wrong (1 outside the site), 14 missing; all fixed in this package except the handed-off
rows at the end.

Player
- `player/drawer-and-hud.md` (rewritten): stale 10 (Play page layout: scene header, attention line, You card, tabs,
  footer; story card buttons; Story settings rows and chips; "I know, keep it" → Hide/Undo/"N hidden"; notes under
  messages as an icon table → one line of words with eight kinds; journal/stat sheet/panels as floating panels → story
  sheet pages; Illustrations on Play → Settings → Images & stage → Pictures in this chat; "Flag this moment" → "Flag a
  moment"; inspector levels; wand entries); wrong 1 (branch chip `branch — continue?` → `You went back: continue from
  here?`); missing 5 (story sheet: tabs, dock/pop-out, phone bottom sheet; characters on stage and live heads;
  `needs setup` / `waiting for a character` chips; Help in the wand; `<!-- showcase -->` slots). Fixed.
- `player/playing.md`: stale 5 (Library opening and Getting started; Choose a story and New chats in group live on
  Story settings; What could I do? location; branch chip; "untick" for switches); missing 4 (talk pacing: voices per
  shape, named members answer, actions get the world first, quiet companions, narrator cap; stuck leads; minimum turns
  in tense scenes; `/story help`). Fixed.
- `player/memory.md`: stale 3 (memory list is the Play Memory tab and the sheet's Memory page; "This chat → Settings" ×2
  → Story settings); wrong 1 (VectFox shows on Play, not a story bar check). Fixed.
- `player/troubleshooting.md`: stale 4 (Setup list / Status line naming; I know, keep it; N dismissed); wrong 2 (bug
  report copy is Settings → Diagnostics, not Help → Setup → Host capabilities, ×2). Fixed.
- `player/README.md`: stale 2 (page title, where Author view is switched on). Fixed.
- `quick-start.md`: wrong 1 (clicking the strip opens the story card, not Play); stale 1 (memory location); missing 1
  (story sheet button). Fixed.
- `README.md` (guide home): stale 1 (page title); missing 1 (new setup page link). Fixed.

Setup
- `setup/README.md`: stale 6 (This chat → Settings is Story settings; route icon reopens the last page; Library,
  Images & stage, Display, Help rows); wrong 1 (Host capabilities path); missing 1 (own reply model row). Fixed.
- `setup/local-model.md` (new): missing 1 (no page on running the reply model: plain llama.cpp, the local controller in
  `scripts/local`, the rented GPU path from `vast-runbook.md` without owner paths). Written.
- `setup/gpu-sharing.md`: stale 1 (`managed` row pointed at an undocumented "older standalone controller"). Fixed.
- `setup/models.md`: stale 1 (drawer setup list); missing 1 (link to the new page). Fixed.
- `setup/setup-path.md`: stale 4 (page list, feature cards → rows, chip/reset wording, Studio path); wrong 2 (Author
  view is switched on in Story settings; a story-declined feature shows a Story chip). Fixed.
- `setup/settings-reference.md`, judge use table: generated by `docs:settings`, in sync.
- `setup/images.md`, `sprites.md`, `judge.md`, `harness.md`, `memory-model.md`: spot-checked (paths, labels), no change.

Author
- Generated pages (`author/README.md`, `how-a-story-plays.md`, `step-by-step.md`, `good-practices.md`, `fields/*` ×8):
  `docs:guide` reproduces them byte for byte; talk pacing, stuck leads, minimum turns and lore lifetimes already
  covered. wrong 1 in the source (`Settings › Interface` → `Settings › Display`). Fixed in `docs/authoring/story-guide.md`.
- `author/studio.md`: stale 3 (drawer → Author page / Library → Author). Fixed.
- `author/wizard.md`, `macros-and-commands.md`: match the build (four steps, `/cp`, `/so-mem`, `/so-image`).
- `author/lorebook-mechanics.md`: a SillyTavern host reference with file:line cites; not re-verified against the host.

Outside the site
- Repo `README.md`: wrong 1 (bug report path). Fixed.

Handed off (product copy in `src/`, a code change with full gates; not W2-W6):
- `src/features/settingsCopy.ts:68` "Untick a kind of note to hide its icon": notes are words now.
- `src/features/settingsCopy.ts:117,121` and `gameFeatures.ts:9,18`: Journal and Stat sheet "a movable panel" → story
  sheet pages.
- `src/features/settingsCopy.ts:134`: What could I do? "on This chat → Play and the wand menu": no wand entry; it is the
  sheet's Ideas page, the Ideas chip and the Now tab.
- Display "Story entries in the wand menu" help omits Story sheet and Help.
These strings also feed `setup/settings-reference.md` (regenerate after the fix).

Showcase slots left for W4 (`<!-- showcase: <name> -->`): hud-overview, story-sheet, workspace, inline-notes,
in-chat-elements, live-characters, talk-pacing, rented-gpu.
