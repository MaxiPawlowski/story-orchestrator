# Plan 01 — Documentation by feature, and an extension that explains itself

**Status (2026-10-03): v2.7 plan 01. APPROVED; BUILT (docs half `cf35ec22`, in-app half `6dcfccb8`). Open: the triage
review with the user (§Triage proposal), the owed deterministic live checks (`16-test-plan.md` row 01), close-out step Z.
The fresh-install real reply is owed to `v2.8/01-v27-carry-over.md` O1.** Overview: `00-overview.md`.
**Gate tiers** (v2.7 overview §Gate taxonomy): implementation D; acceptance D, except O1 (RP or CL, v2.8 01).

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
- **Internal records move to the private `so-sessions` repo** (decision 3: "move"; it already holds session evidence).
  `docs/review` alone is 8.4 MB of screenshots. Not done yet: a close-out item (step Z).

## C. In ST: an extension that explains itself

1. **Help panel ("?")** in the drawer header and the settings header.
   - A searchable index of the registry, grouped by area. Each feature shows its one line, whether it is on, its
     needs, a **Show me** button (`revealSetting`, the Repair pattern), and "Read more" (opens the guide page on the
     repo, `homePage`).
   - Player mode lists player features only; Author view adds the rest (two-personas rule).
   - The author's guide index (all 33 topics, not only per Studio tab) lives here too.
2. **Getting started checklist**, an extension of Repair: memory model → (optional) judge → (optional) images.
   - Each step has its consequence, Show me, and a one-click check.
   - It sits in the Start entry point until done, then folds away.
3. **First-run and briefing:**
   - v2.7 05's briefing modal carries a one-time collapsible "How Story Orchestrator works": what the HUD, chips,
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
**dev-only** (left out of the release build, behind `__SO_DEV__` like the spike modules) or **remove**:

- Spikes and off-by-default experiments with no measured floor are candidates for dev-only.
- Settings nobody should touch become fixed defaults: the control **and** the setting key go (no-legacy rule; the
  sanitizer drops the stored key).

The triage table is filled in during build and reviewed with the user before anything is hidden or removed.

## Gates

- **Pure:** registry tests (A), the generated settings reference, the guide drift test after the split.
- **UI:** Storybook for the Help panel, checklist, What's new, legend (a11y plays, 390/768/1440), and an
  `assert-player-clean` sweep including the Help panel in player mode.
- **Live (D, v2.7):** the in-app walk on an adolion-fresh lane with our settings cleared, up to the first send,
  scripted through `so-ui`, with the steps recorded; Help in player mode under `assert-player-clean` (v2.8 01 O2).
- **Live (RP or CL, v2.8 01 O1):** the same walk reaching a first real reply. Not a v2.7 gate.
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
there is no big rewrite at the end. A short **close-out step at the end of v2.7** (v2.7 overview §Build order, row Z)
then:
- regenerates the settings reference and the README feature table;
- runs the feature triage again with everything v2.7 added, for your review;
- checks every guide page against the shipped UI;
- writes "What's new" for 2.7.

## Links

v2.7 06 (C6 wand entry; the panel frame that hosts Help), v2.7 05 (briefing modal, C8 first-run section), v2.7 02
(judge readiness leak), v2.7 04 (Getting started reads the check registry), v2.7 03 (the guide says stories are group
chats, K3), v2.8 01 O1/O2 (owed live rows), v2.8 09 (the wizard assistant reads this registry).

## Triage proposal

PROPOSED (2026-10-03, in-app half). Nothing below has been hidden or removed; the "advanced" rows already sit under an
"Advanced" disclosure as part of decision 4, every other change waits for the review with the user (decision 5). One row
per registry feature (`src/features/registry.ts`) or per control group; judge uses are one row.

| Feature / control | Audience | Now | Proposal | Why |
|---|---|---|---|---|
| Stories (select, import, restart) | player | visible | **keep** | the core task |
| Group story binding | player | visible | **keep** | one select, only in a group |
| Story drawer, Memory tab | player | visible | **keep** | the player surface |
| Status strip (HUD) toggle | player | visible | **keep** | one checkbox people do switch off |
| Notes under messages: level | player | visible | **keep** | the one inline control a player needs |
| Notes under messages: kinds + window | player | advanced | **advanced** | 9 controls almost nobody changes |
| Chat note when the story moves on | player | visible | **advanced** | off by default and costs the swipe; the notes under messages say the same |
| Chapters: "Previously…" recap | player | visible | **keep** | player-facing, on by default |
| Chapters: seal / story so far / fold / budget | author | advanced | **dev-only** until the Q-M floors pass | off until measured; no player benefit yet |
| Speaker direction (per chat) | player | visible (drawer) | **keep** | group play depends on it |
| Several voices per turn + max | player | visible | **keep** | |
| Chain: stop on scene change, hold reading | author | advanced | **fixed default** | both defaults were chosen deliberately; nobody should need to flip them |
| Pacing: steer the tension | author | visible | **keep** | |
| Pacing: smoothing (α) | author | advanced | **fixed default** | a tuning constant, not a preference |
| Memory model, fallback | setup | visible | **keep** | the one required step |
| Reply thinking | setup | visible | **keep** | measured, user-facing trade-off |
| Reading cadence | setup | advanced | **advanced** | a real cost knob for slow/paid models |
| Look further back when stuck (reconcile ×) | setup | advanced | **fixed default** | no session has needed another value |
| Wait before newest messages (lag) | setup | advanced | **advanced** | useful to heavy re-rollers; default 0 |
| Track what each character knows | author | advanced | **advanced** | the self-test switches it; rarely by hand |
| Models per task (+ harness, effort, on failure) | setup | advanced | **advanced** | power users and the harness only |
| Memory model test | setup | visible | **keep** | the setup check |
| Inner voice (harvest, beat, fan-out) | author | visible (author) | **dev-only** | "off until its measured floor passes"; no floor measured yet |
| Continuity warden + mode | author | visible (author) | **keep** | measured, review mode recommended |
| Lorebook curator + mode | author | visible (author) | **keep** | |
| Lorebook switching mode (file / per chat) | author | advanced | **advanced** | one-time choice with a confirm |
| Memory can trigger lore | author | visible (author) | **advanced** | on by default; turning it off is a tuning act |
| Story lorebooks selected globally (Repair row) | author | visible when it applies | **keep** | it is a Repair row, not a setting |
| Judge: key, on/off | setup | visible | **keep** | |
| Judge uses list (on by default) | setup | advanced | **advanced** | each says what it sends; the default is right for most |
| Judge uses below floor: house rules | author | advanced | **keep advanced, off** | below its floor, already off by default |
| Judge uses unmeasured: exclusive lore selection, sprite expressions | author/setup | advanced | **dev-only** until measured | the readiness rows say "not measured yet, keep it off" |
| Judge provider per use | setup | advanced | **advanced** | only one calibrated provider today |
| Outlines per gap + picked by | author | visible (author) | **advanced** | 1 is the shipped default; extra outlines cost story-model runs |
| Wizard switch | author | visible | **keep** | |
| Illustrations: on, when, every N, prompt model, ComfyUI address, safe mode | setup | visible (collapsed group) | **keep** | needed to set up images at all |
| Illustrations: picture types, fallback looks | setup | advanced | **advanced** | install tuning |
| Sprite stage: on, show the stage | player | visible | **keep** | |
| Sprite stage: expression model, dim, breathing | player | advanced | **advanced** | cosmetic tuning |
| Host capabilities, copy for a bug report | setup | visible (Diagnostics) | **keep** | |
| Experiments (`spikes.*`) | author | no prod control | **dev-only** | already dev-only; keep it that way |
| Memory tier budgets, injection depths, score weights, judge model/timeout | — | no control | **fixed default** | already fixed; keep them out of the UI |

Count after the proposal: about 25 controls in a fresh player's default view (story select + import, group story,
HUD, notes level, recap, speaker direction, voices on + max, memory model, fallback, reply thinking, memory test, judge
key + on, images on/when/prompt model/ComfyUI/safe mode, sprites on/stage, wizard), which is decision 4's target.

Decided 2026-10-03 (user: as recommended):

- **"dev-only"** = left out of the release build: behind `__SO_DEV__`, like the spike modules (not an Author-view-only
  control).
- **Fixed defaults** lose both the control and the setting key (no-legacy rule: the sanitizer drops the stored key; no
  compatibility shim).

The table itself is still a proposal for the review with the user (decision 5).

## Gate record (in-app half)

2026-10-03, branch `worktree-agent-a8b2febba449b190e`, merged with master `cf35ec22` (docs half) before the final gates.

### Built

- **A. Registry** `src/features/registry.ts` (pure, `@features` alias in tsconfig paths + include, webpack, Storybook,
  jest `moduleNameMapper` + roots). 39 hand-written features plus one per judge use (generated from `JUDGE_USE_COPY`),
  areas exactly as §A, each with `where {selector, label, surface}`, `settings`, `doc` (a real `docs/guide/**` page),
  `status`, `since`, `needs`, optional `guideTopic` and `isOn(settings)`. `HOME_PAGE` comes from `manifest.json`
  `homePage` (master's value, the guide README; the repo base is derived from it), `guideUrl(doc)` builds Read more.
- **B. Tests** `src/features/registry.test.ts` (22 cases): every install-wide settings key (defaults flattened + the
  optional keys, whose list is compile-checked against the types) belongs to exactly one feature; no feature names a
  missing key; every `doc` and every author's-guide topic page exists under `docs/guide`; every `SETTING_COPY` entry
  has a label and help and resolves to a real key a feature owns; a source scan of the settings controls (all of
  `components/settings`, `ImageGroup`, `SpriteSettingsView`, the drawer's chat preferences) fails on a `CheckRow` /
  `FieldLabel` without `setting=` or `help=` and on any raw `<label>`; no UI copy (registry, settings copy, judge use
  copy, judge readiness recommendations, player copy tables, inline/help copy, slash help) carries a repo path, plan
  id, internal id (T6-2, J11.23 …) or camelCase key; no snake_case id in copy a player can see; no jargon-list term
  (`src/features/jargon.ts`, each with its plain replacement) in player-audience copy; controls for each matcher.
- **C. Plain language** `src/features/settingsCopy.ts` is the one help table (label + what it does / when to change
  it / what it costs), read by `CheckRow`/`FieldLabel` through `setting=`. Advanced disclosures (`Advanced` in
  `Field.tsx`): memory (cadence, look further back, wait before newest, knowledge tracking, models per task), inline
  kinds + window, chapter records (author), chain stop/hold (author), pacing smoothing, lorebook switching mode, judge
  uses + providers, sprite profile/dim/breathing, image picture types + fallback looks. Leaks fixed: the plan path in
  `judge/readiness.ts`, "v2.5 plan 08 X1/X2", "T6-2", "v2.2", `sceneTrigger`, `no-roles`, `read_as`; README.md
  links in `ImageGroup` and the judge "measured at" link now go to the guide; `CapabilitiesGroup` raw `report.id`
  NOT changed (see deviations). Self-test results read "Works / Does not work" + plain tier names, detail and raw
  reason in Author view only. HUD "branch — continue?" → "You went back: continue from here?". `/story` helpString
  and enum list from one `STORY_VERBS` table (`runtime/slashHelp.ts`), `/story help` added, `/so-mem` loses "v2".
  Inline state icons carry titles; a legend popover on the newest strip only (`InlineLegend`, `data-so="inline-legend"`).
  Judge notice now names "Use the judge" (the coordinator's extra item).
- **D. Help panel** "?" in the drawer header (`#so-help-toggle-drawer`) and the settings header (`#so-help-toggle`),
  lazy chunk (`HelpHost` → `HelpPanel`): search, grouped by area, on/off, needs, Show me (`showFeature` in
  `index.tsx`: settings → open the panel + `revealSetting`; drawer → open the drawer + reveal), Read more. Player
  mode lists player + setup features; Author view adds author features and all 33 author's-guide topics.
  `so-ui.mts assert-player-clean` opens the drawer Help panel and sweeps it; new forbidden selectors
  `[data-so="help-feature"][data-audience="author"]`, `[data-so="help-guide-topics"]`,
  `[data-so="whats-new-feature"][data-audience="author"]`.
- **E. What's new** `WhatsNewCard` (lazy `WhatsNewHost`) at the top of the settings panel: features whose `since`
  is newer than `help.lastSeenVersion` (new install-wide slice `help {lastSeenVersion, checklistDismissed}`;
  `test/sessions/baseline-settings.json` lists `help` as install-owned). Fresh install (no memory model, nothing seen)
  shows nothing; an upgraded install with nothing seen shows everything since 2.4.0; Got it stores the newest `since`.
  **Getting started** fits `runtime/repair.ts` cleanly (`gettingStartedSteps`, `gettingStartedShown`): memory model
  (required) → judge key (optional) → ComfyUI (optional), each with consequence + Show me, inside the Start card;
  it stays while the memory model is missing and folds away when done or hidden.
- **F.** Triage table above (§Triage proposal), proposed only.
- Stories: `HelpPanel` (player, search, author view + guide, 390/768/1440), `WhatsNewCard`, `GettingStarted`,
  `InlineLegend`, a settings-header Help story in `SettingsPanel.stories`; existing stories updated for the renamed
  labels.

### Commands and results

- `npm run gates -- --no-storybook` on `922ff707` (same tree as the gated `d1886991`, renamed when commit trailers were added): **all green** (typecheck, typecheck:test, lint, test 496 suites /
  6067 passed + 1 skipped, build, build:dev, test:debug, debug:typecheck, test:release, test:replay, test:plugin);
  test-storybook:ci SKIPPED by the flag, run separately as below.
- `npm run gates` (full) one commit earlier: green through `test:plugin`;
  `test-storybook:ci` could not run **in this worktree**: the Storybook test runner finds its project root by
  walking up to a `.git` *directory* (`STORYBOOK_PROJECT_ROOT` overrides it) and then jest's crawler finds no stories
  under a path containing `.claude`, so it reports "No tests found". Port 6006 was also held by another agent's
  server. Storybook was therefore run on an exact `git archive HEAD` copy outside the dot-path, on port 6016:
  `npm run storybook:build` + `test-storybook --url http://127.0.0.1:6016 --maxWorkers 1` → **71 suites, 441 tests
  passed** (a11y on every story). The main session should re-run `npm run gates` from the main checkout after merge.
- Prod main bundle after the change: 1,108,488 B (budget 1,250,000); the Help panel, What's new and the judge/image
  groups that read the registry load as lazy chunks.

### Not run

- **Live ST gate: NOT run** (no ST access from this agent; the main session runs it). Owed: `so-ui.mts
  assert-player-clean` with the Help panel open in player mode, the Show me landings (settings and drawer), the
  settings-header "?" next to ST's own inline-drawer toggle (the click opens a closed panel and toggles help in an
  open one), the inline legend on the newest strip, and plan §Gates' fresh-install walk to a first reply.
- Human gate: not run.

### Deviations

- Player mode lists **player + setup** features (setup is not a spoiler and a player has to set up); only `author`
  audience waits for Author view. Two judge uses whose copy is author-facing (`lookahead`, `curatorFilter`) are
  classed author.
- `CapabilitiesGroup` still shows `report.id` (capability names: `macros`, `vectors`, …): they are SillyTavern
  feature names a bug report needs, in the Diagnostics section. Left as is; a plain-label map is a small follow-up.
- `since` values are approximated from the architecture notes (package.json still says 2.4.0, so What's new keys
  off the registry's newest `since`, not the bundle version).
- Getting started's "one-click check" is Show me only (the memory model test and the judge Recheck sit next to the
  revealed controls); no separate check buttons.
- "A drawer opened with no story says what to do next" and the briefing's first-run section are left to v2.7 05.
- `npm run lint` already lints all of `src` (`eslint src`); the gotcha about enumerated dirs is stale, nothing added.

## Review 2026-10-03

Applied: A13 (33 author's-guide topics, not 34), decision 3 recorded (internal records move to `so-sessions`, a
close-out item), Sol split item 2 (the fresh-install real reply is v2.8 01 O1; the deterministic half stays here), B10
(this registry is the gate every feature plan uses), B12/F36 (links version-qualified). K3 (the guide's solo FAQ line)
is fixed with v2.7 03.

2026-10-03 (user: as recommended): the two triage questions are decided (§Triage proposal): dev-only = out of the
release build behind `__SO_DEV__`; a fixed default drops the control and the setting key.
