# Plan 09 — Player and author flows

**Kind:** enhancement (UX), with one accessibility fix.
**Roadmap package:** 8; integration review recommendation 3.
**Closes:** the review's UX assessment table, the Studio tab keyboard gap, the composed next-turn
preview, settings scope labels, the save/resume vocabulary, `recommended-config` surfacing.
**Revised 2026-09-20** per `review-astra-2026-09-20.md`: `player_summary` is decided by plan 11,
not here; the recommended configuration is *linked* here and *rewritten* by plan 11 from final
evidence; the review's theme, real-browser zoom and assistive-technology rows are in scope.

## Objective

The v2.1 player/author split hid controls; it did not organise either persona's work. A player
still cannot tell a queued update from a stalled story without author vocabulary, an author has
no single place to see what the next reply will receive, the Studio advertises tabs it does not
implement, settings do not say which lifetime they belong to, and "saved" means three things.
This plan organises entry points around **Start · Continue · Repair · Author**, without hiding
correctness problems behind copy (the review's explicit warning).

## Context

- Review `ux.md` §Reviewer assessments: eight rows with proposed acceptance criteria; the
  responsive probe (24 views, no overflow) and the keyboard trace (ArrowRight on Graph stays on
  Graph; no `aria-controls`); the manual authoring walkthrough stopped on the Story tab.
- `src/studio/StudioModal.tsx:93–107` handles Escape and Tab only; `:174` renders `role="tab"`.
  ST's `a11y.js` rewrites `role="button"` onto `.menu_button` live (gotchas), so the live selector
  is the tablist, not the role.
- Integration review recommendation 3: a read-only "Next turn" preview from the injection registry
  and the snapshot — owner, target speaker, source message/revision, freshness, fallback, one-shot
  vs persistent — with only existing safe controls (clear a one-shot note, rerun the scene read,
  open the owning editor).
- `narrative.ts` and `pipeline.ts` already compose the player view; `pipeline.detail` carries
  author-grade text. The player "Noted" line and status need a next action.
- v2.2 leaves `recommended-config` inside `acceptance-report.md`; the settings panel does not link
  it, and the judge self-test reports only director accuracy
  (`components/settings/JudgeSettingsGroup.tsx`).
- The wizard exposes stage names ("Qualities", "Transitions", "Run stage") and a `state_snapshot`
  warning to first-time authors.

## Scope

In: entry points; player status copy with next action; Studio tabs to the APG pattern; settings
scope labels; save/resume vocabulary; the next-turn preview; wizard guided steps over the existing
stages; long-content/error/loading Storybook fixtures; the `recommended-config` link and a
readiness summary.

Non-goals: redesigning the Studio editors; the player-safe summary field (a proposal in
`spec-addendum-v2.3.md`; **plan 11's human eval decides it and a v2.4 plan builds it** — this
plan neither builds nor decides it); rewriting the recommended configuration (plan 11 owns
that once the final calibrations and human sessions exist).

## Deliverables

### Entry points

Settings panel and drawer footer present **Start** (wizard or import), **Continue** (this chat's
story, with readiness), **Repair** (the one missing step: profile, lorebook, group member, or the
plan-04 recovery action) and **Author** (Studio, author view). The HUD chip deep-links Repair.

### Player status with a next action

`pipeline.text` gains a short next action only when one exists: "waiting for the next reply",
"retrying", "paused — open Repair". Queue vocabulary stays in `pipeline.detail` (author).

### Studio tabs (a11y)

Arrow keys move focus and selection with wrapping, Home/End, one tab stop for the list,
`aria-controls`/`aria-labelledby` between tab and panel; the live selector stays
`#drawer-manager [role="tablist"] button`. Storybook play covers left/right wrap, selected/focused
states and a keyboard-only authoring pass that saves, reopens and exports (the walkthrough the
review left partial).

### Settings scope

Each settings group states its lifetime in its header: **this install**, **this chat**, **this
story**. A change to an install-wide value shows a one-line "affects every chat" note.

### One save vocabulary

"Saved to library" vs "applied to this chat"; the invalidating popup explains retained/dropped
state in those words; a failed durable save (plan 06) stays visibly pending; drafts say "unsaved
draft" and never silently discard.

### Next-turn preview (author view)

A Payload-tab section built from `INJECTION_REGISTRY` and the snapshot: ordered contributors with
owner, target speaker (group), source message/revision, freshness (plan 03), fallback state,
one-shot or persistent. Controls: clear a one-shot note (warden), rerun the scene read, open the
owning editor. Its order must match a captured real payload (`capturePayload`) for solo and group
generation, **correlated per request**: in a group the target speaker is verified against the
member ST actually drafted for that capture (`onMemberDrafted`), never inferred from the roster
(at `road-to-wendhope` Narrator, Belle and Dalan all remain candidates); a timed-out scene read
shows stale/unknown, never current.

### Theme, zoom and assistive technology

The review's closeout rows the plan set had dropped: the drawer, HUD, settings panel and Studio
are checked under ST's bundled dark and light themes and one community theme (no unreadable
contrast, no clipped controls), at real browser zoom 150% and 200% (not only `ST_DEBUG_VIEWPORT`
widths), and with a screen reader pass over the tablist, the wizard cards and the reconciliation
queue (NVDA on Windows; the Storybook axe run is not a substitute). Findings are fixed here or
listed for v2.4 with the reason.

### Wizard guided steps

The Wizard tab wraps the existing stages in four author-facing steps — premise, characters,
turning points, setup — with the technical stage names and diagnostics behind "details".
Diagnostics render a plain consequence first ("this quality is never used by a gate, so nothing
can react to it") with the technical text second.

### Readiness summary and recommended configuration

`docs/plans/v2.2/recommended-config.md` is extracted from the acceptance report (unchanged
content) and linked from the judge settings group; the judge self-test grows into a readiness
summary listing every enabled usage with its calibration verdict, not only the director.

### Fixtures

Storybook stories for long canon, many proposals, long quality names, error and loading states;
search/filter on the Memory tab when entries exceed 50.

## Verification

- **Story and recipe:** `live-gate-playbook.md` §Plan 09 — adventurer at `road-to-wendhope`
  for the next-turn preview against a **freshly armed** captured group payload, correlated to
  the drafted member; the stale-scene preview check against the nearest judge-on baseline (P0 is
  judge-off, so no scene read exists there); the academy story in the Studio for the
  keyboard-only authoring pass; the phone-width run against its own header.
- Storybook interaction + axe green (`test-storybook:ci` from plan 08), including the tabs
  pattern plays and the keyboard-only authoring pass.
- `so-ui assert-player-clean` extended with the new selectors; J3.3 green.
- `npm run typecheck && npm run lint && npm test && npm run build`.
- Live, real LLM, headed: J1 twice (Start → first reply without author vocabulary), J2 twice
  (author makes, provisions, saves, edits and resumes through visible controls), J3 twice (status
  next-action lines), the next-turn preview compared to `capturePayload` in a solo and a group
  chat; `ST_DEBUG_VIEWPORT=390x844` for J1/J3 once each.
- Human (plan 11): an unfamiliar player describes the objective and whether tracking is waiting
  or paused from the view alone; an unfamiliar author completes a two-anchor story on a phone
  without JSON.

## Persona tags

| Element | Tag |
|---|---|
| Start / Continue / Repair, status next action, scope headers, save vocabulary | `both` |
| Author entry, next-turn preview, readiness summary, wizard details | `author` |

## Delegated decisions

- Whether Repair opens the settings panel or a dedicated dialog (proposed: the panel, scrolled to
  the missing step; it already deep-links).

## Unresolved questions

- None here; the player-safe summary decision sits with plan 11 (`00-overview.md`).

## Gate record

**2026-09-22 — machine gates GREEN; live gate NOT GREEN.**

### Shipped

- **Entry points** (`src/components/settings/EntryPoints.tsx`, `#so-entry-points`). Four rows — Start
  (wizard / import), Continue (which story this chat plays), Repair, Author (Studio, author view) —
  each naming its task and holding only the controls that do it. The import block is the Start row's
  body (`#so-entry-import`, disclosure state in the panel) and the old `#so-open-studio` /
  `#so-new-story-wizard` buttons moved into their rows rather than being duplicated.
- **Repair is one derived step** (`src/runtime/repair.ts`, pure). Worst-first: memory model → cast →
  lore → persona → an unlanded save; `consequence` (plain) before `detail` (technical), `targetId` for
  the panel control that fixes it, `provisionable` only where the wizard can create the asset — never a
  persona. `#so-entry-repair [data-so="repair-step"]` + `revealSetting()` (scroll + `so-revealed`
  outline), so Repair points at the control instead of describing it. 7 jest cases.
- **Next-turn preview control surface** moved behind `manager.previewActions` (`clearNote`,
  `rerunScene`), which brought `RuntimeManager` from 704 back under its 700-line budget (702 → 700);
  `SceneCoordinator.rerun()` is the scene read re-asked with the reason recorded.
- **Studio tabs (APG)** and **settings scope headers** landed earlier in this plan; **one save
  vocabulary** finished here: `Saved "X" vN to the library.` + `Applied to this chat: …` /
  `Not applied to this chat: …` (`StudioToolbar.savedTo`, `applySavedStory` returns only the chat
  half), the invalidating popup rewritten in those words (`renderStoryUpdate`), and the Studio toolbar
  states `unsaved draft` (`#so-draft-unsaved`, `role="status"`) instead of implying it with a disabled
  button.
- **Memory tab search/filter** (`#so-memory-filter`, `#so-memory-search`, `[data-so="memory-tier-filter"]`,
  `#so-memory-count`) appears past 50 rows (`MEMORY_SEARCH_FROM`): needle over text and character, tier
  pills, and a "Showing N of M" line counted over what the current persona can see.
- **Wizard steps** (`WIZARD_STEPS`, `stepForStage`): Premise / Turning points / Characters / Setup over
  the five unchanged stages, with the technical stage chips and their hints behind
  `<details data-so="wizard-stage-details">`. Nothing about the pipeline moved; only what the author is
  asked to think about.
- **Diagnostics state the consequence first** (`DIAGNOSTIC_CONSEQUENCES`, one line per code, rendered by
  `DiagnosticsPanel` and `ProposalReview` above the technical message). A jest case fails the build if a
  new code ships without one, or if a consequence leaks a schema name.
- **Fixtures**: crowding/long text (`CrowdedMemory`, `LongCanonAndManyThreads`), many ops (`ManyOps`),
  long names (`LongNames` + `longNameStory`), error/loading (`WorkingWhileTheModelRuns`,
  `UnavailableWithoutAProfile`, `WarningStatesTheConsequenceFirst`).
- `assert-player-clean` gained the three next-turn selectors.

### Deviations

- The delegated decision is taken as proposed: **Repair opens the panel, scrolled to the missing step**
  (`revealSetting`), not a dialog — the panel already owns every control it names.
- A **reader** of the continuity key is now allowed by the architecture guard: `runtime/nextTurn.ts`
  labels the row from `INJECTION_REGISTRY.continuityNote` without writing it. The guard changed from
  "which files mention the key" to "which files mention it **and** call a prompt write seam", and it now
  reads the registry row's own `writer` field, so the declaration and the check cannot drift.
- `nextRepairStep` reports an **unlanded save** as the last resort. A repair that competes with a
  retrying save would ask the player to fix something already being fixed.
- A validation-only stub (`lifecycleDispose.review.test.ts`) returned `{}` where
  `readInjectedPromptBlocks` returns a list; it crashed the jest worker with
  `TypeError: blocks is not iterable` **outside** any test's scope, which aborts the whole run rather
  than failing one suite. Fixed at the stub.

### Commands run (final tree)

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | **144 suites / 2431 tests passed** |
| `npm run build` | pass (manifest: bundle `d0be5263e6a2`, source `fc3992646aad`, ST 1.19.0) |
| `npm run test:storybook:ci` | **31 suites / 175 tests passed** |
| `npm run test:debug` | 96 pass / 0 fail |
| `npm run typecheck:test` | pass |
| `npm run debug:typecheck` | pass |
| `npm run test:release` | 4 pass / 0 fail |

### NOT green (live)

Every live check in §Verification is **unrun**, for the reason recorded in plan 05's gate record: the
Artemis pod's tunnel is down, the pod's host has no free GPU for it, and the session's safety
classifier refuses pod mutations, so `http://127.0.0.1:18080` is unreachable and `<no backend>` means
no real generation, no real extraction and no real judge. Explicitly outstanding:

- J1 twice (Start → first reply without author vocabulary), J2 twice (author makes, provisions, saves,
  edits, resumes), J3 twice (status next-action lines) — J3.3 is the `assert-player-clean` sweep and it
  is the one part of J3 that is machine-checkable; it has not run against this tree either.
- The next-turn preview compared to `capturePayload` in a solo and a group chat, correlated to the
  member ST actually drafted for that capture.
- The stale-scene preview check against a judge-on baseline.
- `ST_DEBUG_VIEWPORT=390x844` for J1/J3 once each, and the phone-width run against its own header.
- **Theme, real-browser zoom (150 %/200 %) and the NVDA pass** over the tablist, the wizard cards and
  the reconciliation queue. No finding is claimed either way.
- Human rubrics (plan 11): an unfamiliar player describing the objective and whether tracking is waiting
  or paused; an unfamiliar author completing a two-anchor story on a phone without JSON.

No mock was substituted for any of these.

## §The responsive probe: built, and it found a control escaping its panel (2026-09-22)

This plan's Context quotes the review: "the responsive probe (24 views, no overflow)". **No such probe
existed** — nothing in `scripts/debug/` measured layout, and the row had been carried as context
through three plans. It is browser-only (the finding is DOM geometry), so it runs with the model down.

`scripts/debug/so-responsive.mts` — 24 viewports from 320×568 to 2560×1440, against three surfaces
(drawer, settings panel, Studio modal). Per viewport it reports:

- **overflow** — one of our roots (`#drawer-manager`, `#story-orchestrator-settings`, `#so-hud-root`,
  `#so-studio-modal`, `#so-studio-root`) scrolls horizontally, i.e. its content is wider than its box;
- **offscreen** — a `[data-so]` control's box leaves the viewport, so a real pointer cannot reach it.

ST's own layout is out of scope on purpose: the page-level number is recorded but never decides a
finding, so the probe cannot blame the host for our markup. It restores the original viewport in
`finally`, because a viewport left behind fires ST's resize handlers into a peer's run (gotchas,
2026-09-19), and it **exits 1** on any finding — a probe that only prints is a probe nobody reads.

### What it found, and what it did not

**Found — a real defect.** The capabilities row in the settings panel (`CapabilitiesGroup`: "Host
capabilities" + Recheck + "Copy for a bug report" + a status span) did not wrap. In ST's extensions
drawer that row is wider than the panel: measured at 1024×768 the panel is 271 px wide, and
`#so-copy-diagnostics` ended **28 px past the panel's right edge**, its label 101 px past it, with
`scrollWidth` 371 against a `clientWidth` of 270 all the way up the chain. **12 of 24 viewports**
reported it on the settings and Studio surfaces. Fixed with `flex-wrap` on that row.

**Measured after the fix**: `drawer 24/24 clean · settings 24/24 clean · studio 24/24 clean` — 72 of
72 viewport-surface pairs, in the live browser, on the rebuilt bundle (`st-session.mts reload` first,
or the probe would have measured the previous build). Records, before and after:
`test/journeys/records/v2.3-plan09-responsive/{before,after}-fix.json`.

**Not found, and worth saying**: the drawer surface was clean *before* the fix too, and no control was
ever off-viewport — the row spilled out of its panel but stayed inside the page at these widths. The
defect is real (content outside its container, overlapping whatever is beside it) and it is not the
"unreachable control" the review row feared. Both statements are measurements, not readings.

### Deliberately not a Storybook assertion

The fix is layout, and `test-storybook`'s runner uses its own viewport: a story asserting `flex-wrap`
would assert the class, not the layout. The measurement above is the evidence; the component's
existing story still covers its rendering and a11y.

### Status

The **responsive half of the review row is closed by measurement**. The rest of this plan's live rows
(the `ST_DEBUG_VIEWPORT=390x844` J1/J3 runs, real-browser zoom at 150 %/200 %, the theme pass and the
NVDA trace) remain **unrun** — they need a configured model and, for the assistive-technology row, a
human at the keyboard. **Plan 09's live gate is NOT green.**

Harness: `test:debug` **119** (the probe's own 24-view list is guarded — a list that quietly shrank to
six views would still print CLEAN), jest 151/2480, `test:release` 10/10 after re-pointing
`build.current`. `so-responsive.mts` is in the debug skill's tool table.

## §Zoom: what could be measured, what could not, and a residue left standing (2026-09-22)

The plan's row asks for "real browser zoom 150 % and 200 % (not only `ST_DEBUG_VIEWPORT`)". Two
measurements, one of which is a negative result:

**Real browser zoom cannot be driven from this harness — measured, not assumed.** `so-responsive.mts
--zoom 150` presses `Ctrl + '+'` eight times and reads `window.devicePixelRatio` before and after:
**1 → 1**. Chromium does not apply its zoom shortcut to a page attached over CDP, so the probe refuses
to present the run as a zoom finding and says so on stdout. **The real-zoom row therefore keeps a
human step**; it is not something this harness can close.

**What is measurable is the layout consequence**, which is the part that breaks a UI: zooming to
150 % reflows the page into a CSS viewport 1/1.5 as wide. `--zoom <pct>` emulates exactly that, and
every row records the scale it ran at, so no record can be misread as a real-zoom measurement.

**Residue, left standing on purpose.** At 150 % and 200 % the settings panel's content box overflows
at the smallest viewports (**213–240 px CSS width**: 3 of 24 views at 150 %, 10 of 24 at 200 %;
`overflow: #story-orchestrator-settings`, **no control ever off-viewport**). The panel is 190 px wide
there — ST's own extensions drawer — and the overflowing elements are help **text spans**, not
controls. Two attempts to clear it were made and **did not** (`min-w-0`, then `min-w-0 flex-1` on two
long-text spans; both kept, neither fixed it, and the cause at those widths is still unidentified —
my diagnostics at 213 px pointed at a span whose box had measured width 0 and an element with a
negative overhang, i.e. readings that do not agree with each other). Rather than churn more CSS blind,
the state is recorded: the probe exists, the numbers are archived
(`test/journeys/records/v2.3-plan09-responsive/zoom{150,200}-residue.json`), and any future fix has a
one-command verification. A v2.4 seed, not a claim of green.

Records for this pass: `before-fix.json`, `after-fix.json`, `after-fix-100pct.json` (72/72 clean at
100 %), `zoom150-residue.json`, `zoom200-residue.json`.

### The residue, diagnosed and then closed down to a boundary (2026-09-22, same pass)

The paragraph above recorded the zoom residue as *unidentified*. Re-diagnosing it with the panel open,
settled, at a known width (213 px CSS) found the actual cause, and it was **not** a mystery: in flex
rows whose text had been given `min-w-0`, the text items got less width than their own **longest word**
("Steering" needs 55 px; the item had 33), and a `grid grid-cols-2` split 160 px into two 76 px
columns that its inputs could not fit — neither of which any amount of `min-w-0` can fix, because a
word cannot wrap inside itself and a grid column cannot reflow.

The fixes are the ones that can work at those widths: **`flex-wrap` on the rows** and
**`grid-cols-1 sm:grid-cols-2`** on the two grids (Tailwind's `sm:` is 640 px, so a narrow panel gets
one column). `flex-1` was dropped again — it was what gave the span a 0 px box in the first place.

**Measured after: `--zoom 150` is 72/72 CLEAN**, and `--surface all` at 100 % stays 72/72 clean.
Records: `zoom150-clean.json`, `after-fix-100pct.json`.

**The boundary, now identified rather than vague.** At `--zoom 200` the smallest viewports (320–414
px → **160–207 px CSS**, where ST's extensions drawer gives our panel **137 px**) still overflow by
5–40 px, and the cause is now known: rows holding a `menu_button` whose **label is wider than the
panel** ("New story (wizard)" measures 142 px) — a button label ST renders `nowrap`, so it cannot
shrink and there is nowhere for it to wrap to. That is a v2.4 seed with a named candidate fix (let
button labels wrap under a narrow-panel condition) rather than a mystery: the probe verifies either
outcome in one command, and ST's own UI at a 137 px drawer is not usable in the first place.

The probe itself gained a guard this pass: **Escape before every surface**, because a Studio modal
left open by a previous run intercepts every click and presents as a click timeout in whichever
surface came next (measured — a 200 % run died on `#so-studio-modal intercepts pointer events`).

## Audit 2026-09-23 — reopened (status: mostly done)

- Next-turn preview has no "open the owning editor" control (`DrawerTabs.tsx:629` text only) → V19.
- Keyboard-only authoring Storybook pass (save, reopen, export) missing → V19.
- HUD chip opens settings but does not reveal the Repair step; no drawer-footer entry points → V19.
- APG tabs verified correct in code; NVDA unrun → L7.


### V19 gate (2026-09-23) — owners reachable, Repair deep-linked, keyboard-only authoring

- **Next-turn preview reaches its owners.** Each row's `edited in: <tab>` text is now a control (`[data-so="next-turn-open-owner"]`, `data-owner-tab`). `Open Memory` and `Open Scheduler` switch the drawer tab, and `Open settings` opens the settings panel for install-configured blocks (pacing). A copilot nudge says it is edited here, in the driver. Covered by the `NextTurn` story (a pacing row was added so the settings path is exercised).
- **Repair is deep-linked, and the drawer footer carries the entry points.** The HUD's needs-setup chip used to open the panel and stop. It now opens it and reveals `#so-entry-repair` (`openRepairStep` in `index.tsx`, the same `revealSetting` the panel's own rows use). The drawer footer (`#so-drawer-entry-points`) gains `Repair: <what the story loses>` (`#so-drawer-repair`, only while a step is missing, from the same `nextRepairStep`) and `New story` (`#so-drawer-new-story`). Continue is the drawer itself, and Author (Edit story) was already there. Stories: `FooterEntryPoints` and `FooterWithoutARepairStep`. The drawer story fixture gained `saveHealth`; every DrawerTabs story crashed on `nextRepairStep` until it did, because the fixture never had a field every real snapshot carries.
- **Keyboard-only authoring: two halves, because a simulated Tab is not a real one.** The Storybook story `KeyboardOnlyAuthoring` opens the Studio from a host button, renames the story, moves to the Story tab with ArrowRight (APG), then Tabs to Save and Export JSON and presses Enter. It closes with Escape and reopens with Enter, and the draft is still there, all without a pointer event. Its first draft Tabbed across the graph tab and failed: user-event's simulated Tab never got past the graph panel. The real-key walk below found the product correct, so that was a simulation artifact, not a defect, and the story now reaches the toolbar through the Story tab. **The graph path is proven with real key presses**: `scripts/debug/so-studio-keyboard.mts` (new; verdict in `lib/focusWalk.mts`, 4 node tests) walks the live Studio from the title field. Every stop is inside the dialog, Save, Export JSON and Close are reached, and focus wraps back to the title (`records/v2.3-replan/V19/`).
- **Live** (sandbox group `1759606632088`, no model): `test/scenarios/live-v19-repair-deep-link.json` clears the memory model, so the pipeline reads `not-configured`. The HUD chip (hit-tested) opens the panel and reveals the Repair row, and the drawer's `Repair: The story will not advance on its own until this is set.` (hit-tested) lands on the same row. **8/8 twice** (`repair-run{1,2}.log`); the extraction settings were restored and read back each time. **Live mutation** (the chip opens the panel without the reveal): FAILS with `the HUD chip opened the panel but did not reveal the Repair row` (`live-mutation-hud-opens-without-reveal.log`). `so-studio-keyboard.mts` passed twice (14 stops, wrapped, nothing escaped: `keyboard-walk-run{1,2}.log`). Run-header diff: build fields only.
- Mutations: **5 of 5**, each caught by its own case (`test/findings/mutations/V19-honest-toggles-and-entry-points.txt`). The first pass's filter read only jest output, so M3–M5 were re-run to name what caught them: node `a walk that never comes back…`, Storybook `NextTurn`, Storybook `FooterWithoutARepairStep`.
- Machine: typecheck 0, typecheck:test 0, lint 0, jest **167 / 2665**, test:debug 131, debug:typecheck 0, build 0 (bundle `be9a1bd94764`), test:release 10/10, Storybook **31 / 188**.
- APG tabs verified in code; NVDA is still unrun (L7).
