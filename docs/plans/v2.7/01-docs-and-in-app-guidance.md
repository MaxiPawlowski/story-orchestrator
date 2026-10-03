# Plan 01 — Documentation by feature, and an extension that explains itself

**Status: DRAFT 2026-10-03 (topic from the user). Not approved, not built.** Overview: `00-overview.md`.

The user's words: the feature count has grown absurd. We need a better way to manage and share it. Nobody will make a
course about it, so it has to be intuitive inside SillyTavern.

## Where we are (inventory 2026-10-03)

### Docs

- **`docs/` is 423 files / 18 MB, and about 95% is internal process:**
  - plans: 236 files;
  - reviews: 137 files, 8.4 MB of screenshots and evidence;
  - release attestations, spikes, and 15 scraped community guides.
- **No player guide, no troubleshooting or FAQ, no settings reference, and no setup guide for the three server
  plugins.** None of the three plugins has a README.
- **`README.md`** (227 lines) carries everything user-facing and is stale or self-contradicting:
  - judge defaults are described as both "off" and "on";
  - the judge table misses 2 uses and lists a non-key;
  - 4 macros and 3 `/story` verbs are missing;
  - 0 mentions of chapters, the inline timeline, sprites, reasoning effort, the talk chain, inner voice, role profiles,
    the group binding or the harness;
  - its install steps are for a source checkout, not the release zip.
- **The other docs are stale too:**
  - `CHANGELOG.md` stops at 2.4.0.
  - `docs/architecture-v2.md` says "current through v2.3".
  - `manifest.json` `homePage` is empty, so ST's extension list links nowhere.
- **The author's guide** (`docs/authoring/story-guide.md`, 445 lines) is good, and drift-tested against its compact twin
  `src/copilot/guideTopics.ts`. But `docs/` is excluded from the package, so inside ST it is reachable only as
  collapsed per-tab topics in the Studio.

### In-app

- **Settings panel:** about 148 controls in 4 sections and 13 groups. About 46 have help, about 102 do not.
  - Jargon: "Smoothing α", "Cadence / Reconcile × / Lag", "shared read extraction", raw tier names in the self-test,
    "Stagecraft", "Lorebook gating: File writes / Per chat (scan)", "Expansion variants".
  - Help texts that use jargon themselves ("epistemic read", "measured floor", llama.cpp benchmark trivia).
  - A plan-doc path leaks into the panel (`judge/readiness.ts:192`), and a raw `report.id` too (`CapabilitiesGroup.tsx:83`).
- **Inline chips** are icon-only with no legend. The levels 0–4 are explained by one tooltip. Drawer tabs have no
  descriptions. The HUD "branch — continue?" is cryptic.
- **No onboarding, no "what's new", no docs link** (only 3 README anchors in the image settings).
- **Patterns that already work** and should become the house style:
  - **Repair:** consequence first, then "Show me" via `revealSetting` (opens the enclosing `details`, scrolls, flashes),
    then a one-click fix or "Fix with wizard".
  - **Diagnostics:** consequence-first (`DIAGNOSTIC_CONSEQUENCES`, build fails without one).
  - **`GuideDisclosure`** per Studio tab.
  - **Judge use tooltips** with "Sends:" privacy disclosure.
  - Scope labels on groups ("this install").
  - Disabled buttons that state why.
  - Plain pipeline copy.

## Principle

**One feature registry is the source of truth, and everything a user reads is generated from it or tested against
it.** That includes the settings help, the in-app Help panel, the README feature table, the docs index and the settings
reference. That is the only way about 150 controls and about 20 features stay explained as they keep changing. The
`guideTopics` drift test and `DIAGNOSTIC_CONSEQUENCES` already prove the pattern here.

## A. The feature registry

`src/features/registry.ts` (pure, bundled). One entry per feature:

```ts
{ id: "memory", name: "Story memory", area: "memory", audience: "player" | "author" | "setup",
  oneLine: "Remembers what happened so characters stay consistent.",
  what: "…two or three plain sentences…",
  where: { selector: "#so-memory-model", label: "Settings › Memory model" },
  settings: ["extraction.profileId", "extraction.cadence", …],
  guideTopic?: "…", doc: "player/memory.md", status: "shipped" | "off-by-default" | "experimental",
  since: "2.6.0", needs?: ["memory-profile" | "judge-plugin" | "comfyui" | …] }
```

**Areas (the one split used everywhere: docs, settings groups, Help panel):**

| Area | Features (examples) |
|---|---|
| Playing a story | stories, checkpoints, briefing, HUD, inline timeline, recap, Continue |
| Memory | extraction, memory tiers, chapters, canon |
| Characters | speaker direction, private knowledge, inner voice, relationships (18) |
| World | lorebooks and lore gating, curator, backgrounds, images, sprites |
| Judge | each use, provider, privacy |
| Authoring | Studio, wizard, diagnostics, examples |
| Setup and diagnostics | models per task, plugins, self-test, capabilities, Repair |

**Tests (build fails when):**

- a settings key in `settingsModel.ts` belongs to no feature;
- a settings control has no help string;
- a feature has no `doc` page;
- a UI string contains a repo path, a plan id or a raw id;
- player-audience text uses a word from a jargon list. The list is seeded from the inventory above, and each entry
  carries its plain replacement.

## B. Docs restructure (repo)

```
docs/
  guide/                 public, user-facing, generated index from the registry
    README.md            start here: install (release zip vs source), first story in 5 minutes
    player/              playing, the drawer/HUD/chips, memory, troubleshooting + FAQ
    author/              the story guide split one page per topic (from story-guide.md), Studio, wizard, examples
    setup/               memory model, judge plugin, GPU/ComfyUI plugin, harness, settings reference (generated)
  dev/                   architecture (refreshed), contributing, debug harness pointer
  internal/              plans, review, release, spikes, tutorials (process record)
```

- **`README.md`** shrinks to about 80 lines: what it is (one screenshot), install, first story, links into
  `docs/guide/`, and a generated feature table (area → feature → one line → status).
- **`story-guide.md` becomes `docs/guide/author/*.md`**, one file per topic. `guideTopics.ts` stays its compact twin,
  and the drift test follows the split.
- **The settings reference is generated** from `settingsModel.ts` plus the registry (`npm run docs:settings`), and a
  test fails when it is stale.
- **Fix the stale facts found:**
  - judge defaults and table;
  - macros and `/story` verbs;
  - CHANGELOG 2.5–2.7, or a "since 2.4" summary;
  - architecture doc to current;
  - `manifest.json` `homePage` set to the guide;
  - plugin READMEs.
- **Internal records:** keep them in the public repo under `docs/internal/`, or move them to the private `so-sessions`
  repo (it already holds session evidence). `docs/review` alone is 8.4 MB of screenshots.

## C. In ST: an extension that explains itself

1. **Help panel ("?")** in the drawer header and the settings header.
   - A searchable index of the registry, grouped by area. Each feature shows its one line, whether it is on, its
     needs, a **Show me** button (`revealSetting`, the Repair pattern), and "Read more" (opens the guide page on the
     repo, `homePage`).
   - Player mode lists player features only; Author view adds the rest (two-personas rule).
   - The author's guide index (all 34 topics, not only per Studio tab) lives here too.
2. **Getting started checklist**, an extension of Repair: memory model → (optional) judge → (optional) images.
   - Each step has its consequence, Show me, and a one-click check.
   - It sits in the Start entry point until done, then folds away.
3. **First-run and briefing:**
   - plan 03's briefing modal carries a one-time collapsible "How Story Orchestrator works": what the HUD, chips,
     drawer and Memory tab are, in about 6 lines with icons.
   - A drawer opened with no story says what to do next (today it is bare).
4. **"What's new" card** after an update: features whose `since` is newer than the last seen version, one line each,
   with Show me, dismissible. The version is stored install-wide.
5. **Plain-language pass on every control** (the jargon list in A): rename labels, and rewrite help as
   "what it does / when to change it / what it costs".
   - Advanced knobs (smoothing α, cadence, lag, reconcile, gating mode, expansion variants, models per task) move under
     an "Advanced" disclosure per group.
   - Default view: about 25 controls a normal player touches.
6. **Chips and HUD:**
   - a legend popover on the inline strip (icon → meaning, level names explained);
   - titles on the detail state icons;
   - the HUD branch chip reworded ("You went back: continue from here?").
7. **Slash help:**
   - `/story help` lists the verbs in plain words;
   - fix the `/story` helpString (missing verbs);
   - drop the "v2" wording from `/so-mem`;
   - `/cp` stays author-worded.
8. **Remove the leaks:** plan paths and raw ids in UI strings (the test in A keeps them out).

## D. Feature triage (the "absurd" part)

The registry makes the count visible. Each feature is classified **keep visible**, **advanced** (behind a disclosure),
**dev-only** (not in prod settings) or **remove**:

- Spikes and off-by-default experiments with no measured floor are candidates for dev-only.
- Settings nobody should touch become fixed defaults.

The triage table is filled in during build and reviewed with the user before anything is hidden or removed.

## Gates

- **Pure:** registry tests (A), the generated settings reference, the guide drift test after the split.
- **UI:** Storybook for the Help panel, checklist, What's new, legend (a11y plays, 390/768/1440), and an
  `assert-player-clean` sweep including the Help panel in player mode.
- **Live:** a fresh install (adolion-fresh lane with our settings cleared) reaches a first reply using only in-app
  guidance, scripted through `so-ui`, with the steps recorded.
- **Human:** the user, or a delegated rater who has never used the extension, sets it up from the release zip with no
  docs open. Every point where they had to ask is a defect.
- `npm run gates`.

## Decisions for the user

1. One feature registry as the source for docs and in-app help, enforced by tests? **Recommended: yes.** yes
2. Docs split `guide/` (player, author, setup) + `dev/` + `internal/`? **Recommended: yes.** yes
3. Internal records: stay public under `docs/internal/`, or move to the private `so-sessions` repo? move
4. Settings default view about 25 controls, the rest under "Advanced" per group? **Recommended: yes.** yes
5. Run the feature triage (D) and review the hide/remove list together before acting? **Recommended: yes.** sure
6. Where "Read more" points: the GitHub repo's `docs/guide/` (zero hosting), or a docs site? **Recommended: the repo
   first.** as you recommend.

user concern: should this be built after all development? or should we have a second update plan at the end?

**Answer (2026-10-03): both, in that order.** The registry, its tests and the guide layout go first, because they are
the frame every later plan writes into. Each later plan's gate then includes "registered in the registry, guide page
written, help strings plain", and the tests fail the build otherwise. So the docs cannot fall behind silently, and
there is no big rewrite at the end. A short **close-out step at the end of v2.7** (overview §Build order, row Z) then:
- regenerates the settings reference and the README feature table;
- runs the feature triage again with everything v2.7 added, for your review;
- checks every guide page against the shipped UI;
- writes "What's new" for 2.7.

## Links

04 (C6 wand entry, C8 onboarding), 03 briefing (first-run section), 02 carry-in (judge readiness leak).
