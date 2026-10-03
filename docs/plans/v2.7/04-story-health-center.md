# Plan 04 — One health center while a story is active

**Status (2026-10-03): v2.7 plan 04 (was old v2.7 31). APPROVED (all five decisions as recommended). The registry is
SEEDED in `src/runtime/checks.ts` by the 02 C2 / 08 build (`transcript-copiers`, `model-not-thinking`); its extension,
the Repair migration and the Story setup surface are not built. Built together with v2.7 03 at their seam (Sol split
item 6).** Overview: `00-overview.md`.
**Gate tiers** (v2.7 overview §Gate taxonomy): implementation D; acceptance D. Model input: none (checks read state; a
check never writes and never runs on the reply path).

The user's question: we keep adding checks on the environment (SillyTavern settings, other extensions, backends),
and many of them notify the user separately when something needs doing. Should there be one central place, active
when a story is playing in a chat?

## The scatter today

| Check | Where it lives | How it reaches the user |
|---|---|---|
| The ONE missing step (memory model → cast → lore → persona → save) | `runtime/repair.ts` | Repair entry point, HUD `#so-hud-pipeline` chip, drawer |
| Story requirements (members, lorebooks, persona) | `runtime/requirements*.ts` | author-view requirements panel, "Fix with wizard" |
| Host capabilities (macros, slash, vectors, judge) | `stHost/capabilities.ts` | settings → Host capabilities group |
| Memory self-test | `MemoryModelGroup.tsx` | settings button, PASS/FAIL rows |
| Judge readiness, calibration, privacy | `judge/readiness.ts` | Judge settings group |
| Pipeline state (reading, stalled, error, not configured) | `runtime/pipeline.ts` | HUD chip, drawer Overview |
| Save health | `runtime/saveHealth.ts` | pipeline text |
| Globally selected story books | `runtime/storyLore.ts` | its own Repair row |
| Mirror book left after a chat delete | `runtime/mirrorReaperHost.ts` | an ST popup (a decision: stays a popup) |
| Studio diagnostics | `studio/diagnostics.ts` | Studio only |
| **Built (v2.7 02 C2, v2.7 08):** `transcript-copiers` (privacy), `model-not-thinking` | `runtime/checks.ts` `CHECKS` | Repair channel + HUD `#so-hud-setup` |
| **Coming:** `story-needs-group` (v2.7 03), image backend and models (v2.8 05), `persona-fit` / `persona-switch` (v2.8 03), vector conflicts (v2.8 21, if it builds one), What's new (v2.7 01, info) | each plan | as registry entries, never their own channel |

## Design

### A. Extend the seed registry (review D8)

No second registry: `src/runtime/checks.ts` is the one. Today `Check {id, area, scope, audience, severity: blocks |
degrades, applies?, detect}` and `CheckFinding {consequence, detail, player?, targetId?}`. Extend it:

```ts
severity: "blocks" | "degrades" | "info"   // info never raises the HUD chip
CheckFinding += { action?: OneClickFix,      // add members, unmute, deselect a global book, make a group
                  target?: ShowMe }          // replaces targetId: revealSetting, or open ST's own panel
Check += { feature?: FeatureId }             // v2.7 01 registry link: features declare `needs`, needs map to checks
```

- **Host reads happen once per evaluation,** in a host-side snapshot builder (the `stHost` modules that exist today:
  capabilities, extension settings, connection profiles, persona, vectors, image backend), so every `detect` is pure.
- **When it runs:** on story select, hydrate and restart; on `CHAT_CHANGED`, settings saves, extension toggles and
  connection changes; on demand ("Re-check"). Never on the reply path.
- **Scope without an engine.** A `story` or `chat` check that needs only the selection or binding (e.g.
  `story-needs-group`, v2.7 03) declares it and runs without a loaded engine; an ordinary chat with no story stays
  quiet.
- **Migration.** Every `runtime/repair.ts` step becomes a check (memory model, roles, cast, lore, persona, save, chapter,
  WI gating, global story lore, orphaned books), as the 08 gate record's follow-up lists. Repair keeps its contract.

### B. Repair is the ordering (review F33)

`runtime/repair.ts` becomes the ordering of the registry's findings: **`blocks` first, then `degrades`** (privacy,
thinking and the other shipped `degrades` rows stay in Repair, as today), worst first within a severity, the one step to
do next. `info` findings never enter Repair; they show in the Setup list only.

### C. One surface: "Story setup"

- **Active only while a story plays in this chat**, plus the engine-free checks above. Install-scoped checks show in the
  settings panel's Start entry point as the v2.7 01 "Getting started" checklist: Getting started reads the registry's
  `install` checks (the open "registry install checks or not" note: yes).
- **HUD.** The existing `#so-hud-setup` chip shows the count by severity, or nothing when all is well; it replaces
  today's separate needs-setup chip state. `info` never raises it.
- **Drawer.** A "Setup" section at the top of Overview, shown only when something is found: consequence, then **Show
  me** and the one-click fix. Player mode shows `player` findings in player copy; Author view adds author findings and
  the detail.
- **"Before you start."** v2.7 05's modal lists this story's `blocks` findings first (activation sequence step 2, owned
  here). A player sees, before the first message, that the story needs X and how to fix it.
- **No popups or toasts for checks.** ST popups stay only for decisions that need an answer now (keep / restart, delete
  the mirror book).
- **Dismissal (decision 4, review F34).** A `degrades` or `info` finding the user dismisses ("I know, keep it") is
  remembered per install and per check, like `worldInfo.keptGlobal`. **A `blocks` finding cannot be dismissed**: it has
  no dismiss control and a stored dismissal for it is ignored.

### D. What each plan contributes (review D9)

Each plan adds checks; none adds its own alert channel:

| Check | Plan | Severity | Version |
|---|---|---|---|
| `transcript-copiers` | v2.7 02 C2 (+ K1 fix) | degrades | built; K1 in v2.7 |
| `model-not-thinking` | v2.7 08 | degrades | built |
| `story-needs-group` | v2.7 03 | blocks, action "make a group" | v2.7 |
| migrated Repair steps | this plan | as today | v2.7 |
| What's new | v2.7 01 | info | v2.7 |
| `persona-fit`, `persona-switch` | v2.8 03 | blocks / degrades / info | v2.8 |
| image backend, model missing, broker idle | v2.8 05 | degrades | v2.8 |
| vector conflicts | v2.8 21 (if it builds one) | degrades | v2.8 |

The registry test fails a check without consequence copy (like `DIAGNOSTIC_CONSEQUENCES`), a player-audience check
whose copy uses a jargon word (v2.7 01 list), a duplicate id, and a `blocks` check with a dismiss path.

## Gates (tier D)

- **Pure:** every check's `detect` over fixture snapshots; registry tests above; Repair ordering regression (existing
  steps in the same order; `degrades` still listed after `blocks`); `info` never in Repair, never on the HUD; a `blocks`
  dismissal ignored.
- **Privacy leg (review F34, K1):** the `transcript-copiers` player output (HUD chip, drawer Setup row, settings row,
  Help) is identical with and without a held secret, for each copier; the author detail differs only in Author view.
- **UI:** Storybook for the HUD chip, drawer Setup section and "Before you start" with 0, 1 and many findings, each
  severity (a11y; 390/768/1440); `assert-player-clean`.
- **Live (D), complete fixture:** a lane with no memory profile, Summarize on, a group story missing one member, and a
  solo chat with a bound story. Expected: findings in the declared order, each Show me lands, each one-click fix clears
  its finding, the `blocks` row has no dismiss, nothing toasts; the solo chat shows only `story-needs-group`; run with
  and without a seeded held secret (`seed_metadata`). ×2.
- `npm run gates`.

## Decisions for the user

1. One check registry, with Repair as its "next step" ordering? **Recommended: yes.** yes
2. Active only while a story plays in the chat (plus install checks in Getting started)? **Recommended: yes.** yes
3. No toasts or popups for checks; findings only? **Recommended: yes**, popups kept only for decisions.  Lets do as you recommend
4. Dismissible per check per install? **Recommended: yes**, except `blocks` findings, which stay until fixed. Lets do as you recommend
5. Build position: right after plan 01 (it uses the registry areas and the plain-language rules), before 03/04/06/26/30
   land their checks. **Recommended: yes.** The plan 06 / 02 C2 build in progress is shaping its alert as the seed of
   this registry. Lets do as you recommend

(Decision 5's numbers are old: 03/04/06/26/30 are now v2.7 05, v2.7 06, v2.7 08, v2.8 05, v2.8 03.)

## Links

v2.7 01 (feature registry, Getting started, jargon list), v2.7 02 C2 + K1, v2.7 03 (`story-needs-group`), v2.7 05
("Before you start"), v2.7 06 (Activity panel lists check findings), v2.7 08, v2.8 03, v2.8 05, v2.8 21.

## Review 2026-10-03

Applied: D8 (extend `checks.ts` with `info`, `action`, `target`, `feature`; migrate the Repair steps; no competing
registry), D9 (C2 and 08 shipped; v2.7 03 and v2.8 03 checks listed with their versions), F33 (Repair orders `blocks`
then `degrades`), F34 (blockers cannot be dismissed; complete live fixture; privacy leg with and without held secrets
after K1), the Claude-D note on Getting started (it reads the `install` checks), Sol split item 6 (built with v2.7 03),
B12 (references).

## Gate record (2026-10-03)

Built after v2.7 03 on branch `worktree-agent-a63e828dd1ddd52c3` (off master `506a7ca4`), sharing its
`story-needs-group` check. Commits: `4d87d2f1` (registry, migration, dismissal, Setup section, HUD chip, Getting
started), `39262713` (one Fix with wizard control; AgentWizard stories give the scripted draft its group).

**As built**

- **Contract** (`runtime/checks.ts`): `Check {id, area, scope, audience, severity: blocks | degrades | info,
  engineFree?, feature?, applies?, detect}`, `CheckResult` adds `consequence`, `detail`, `targetId`, `target`
  (`{kind: "setting" | "group" | "drawer", id}`), `provisionable`, `player`, `action`, `opensGroup`, `dismissable`.
  A check whose `feature` is off is not run.
- **Migration** (`runtime/checksSetup.ts`): every `repair.ts` step is a check, in the old order: `memory-model`,
  `model-role`, `story-needs-group` (03), `cast-absent`, `cast-unbound`, `cast-muted`, `lore-absent`,
  `lore-unscanned`, `lore-hidden`, `persona-absent`, `persona-unselected`, `memory-slot-taken`, `save-unconfirmed`,
  then the degrading ones `transcript-copiers`, `model-not-thinking`, `chapter-unsummarized`, `wi-gating-drift`,
  `story-lore-global`, `orphaned-lorebooks`. `repair.ts` keeps its exports (`repairSteps`, `nextRepairStep`,
  `viewerRepairStep`, the cast one-click fixes) as a view over the registry, so EntryPoints, castRepair and the HUD
  did not change shape.
- **Ordering (F33):** Repair = every `blocks` result, then every `degrades`, each in registry order; a degrade never
  outranks a block whatever its position (`checksRegistry.test.ts`, with a planted early degrade as the control).
- **Dismissal (F34):** `help.dismissedChecks` (install-wide, registry feature `repair` owns it),
  `setCheckDismissed(id, bool)` on the manager (`managerDelegates`). A dismissed `degrades`/`info` result moves to
  `dismissed` and can be restored; a `blocks` result is never dismissable and an id in the list is ignored for it
  (test plants `memory-model` in the list).
- **Story setup surface:** drawer Overview `SetupSection` (`#so-setup`, rows `[data-so="setup-row"]` with
  `data-check`/`data-severity`, Show me, the one-click fix where the check has one, "I know, keep it" for
  dismissable rows, a dismissed disclosure with Restore); `#so-before-you-start` at boundary 0 in the player view
  lists blockers only. Author view adds `detail`. HUD: `#so-hud-setup` chip "fix setup (n)" / "check setup (n)" with
  `data-blocks`/`data-degrades` replaces the `needs setup` pipeline chip. Getting started reads the install checks.
- **Privacy leg:** `transcript-copiers` says the same words whether or not a secret is held (story + jest).
- Docs: guide README, `player/troubleshooting.md`, `player/drawer-and-hud.md`; `live-v19-repair-deep-link.json`
  selector moved to `#so-hud-setup`.

**Gates**

- Jest: `checksRegistry.test.ts` (contract, order, F33, F34, engine-free run with no story, feature gating),
  `repair.test.ts` and the Repair/castRepair/EntryPoints/HUD tests kept passing over the migrated steps.
- `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run gates -- --no-storybook` → green, see the overall gates below.
- Storybook (same out-of-gates run as 03): 73 suites, 471 tests passed, including `Drawer/SetupSection` (nothing
  found, one block not dismissable, one degrade dismissed, many with a one-click fix, info row, author detail,
  dismissed comes back, before you start blockers only, privacy leg, 390/768/1440) and the HudStrip chip stories.
- **Live: NOT run** (lanes 0–5 busy). Owed: the 04 live fixture ×2 (Setup section, Show me, one-click fix,
  dismissal survives reload, blocks cannot be dismissed), `so-ui.mts assert-player-clean` with findings shown,
  `live-v19-repair-deep-link.json` with the new selector.

**Deviations / not done**

- No `info` check ships yet: the "What's new" check belongs to v2.7 05; the info row is covered by a story only.
- `story-lore-global` keeps its Repair row actions; no new one-click deselect was added.
- "Before you start" is an inline section here; the modal is v2.7 05.
- No per-row Fix with wizard: the author requirements panel's `#so-fix-with-wizard` stays the one control
  (a second one broke the DrawerTabs story's single-button query and duplicated the control).
- Model input unchanged: the registry only reads state.

**Overall gates (03 + 04 together, on `39262713`)**: `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run gates -- --no-storybook`
→ all ok: typecheck, typecheck:test, lint, test (513 suites passed, 1 skipped; 6220 tests passed, 1 skipped), build,
build:dev, test:debug (958 pass, 0 fail), debug:typecheck, test:release (94 pass), test:replay, test:plugin (87 pass);
`test-storybook:ci` SKIPPED (`--no-storybook`: the runner finds no stories under `.claude/worktrees` paths; the
Storybook run above was done by hand instead). Earlier runs: the first, without `ST_ROOT`, went red at `build`
(the worktree has no `.st-root`; environment, not code); one went red at `test:debug` `legacyFree` (scenario name,
fixed in `d3109389`).
