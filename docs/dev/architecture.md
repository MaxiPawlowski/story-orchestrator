# Architecture

Story Orchestrator runs a format-2 story as a deterministic checkpoint graph over a live
SillyTavern chat. This document describes the shape; the normative rules (every invariant, with the
incident that taught it) live in `.claude/rules/architecture.md` and `.claude/rules/gotchas.md`, and
win wherever this page disagrees. Design rationale and per-plan build history: the plan records
(`docs/plans/`, moving to the private process repo).

**Status (2026-10-03).** The layout and the v2.3 invariants below are as built. v2.4 to v2.6 added
the pieces listed under [Since v2.3](#since-v23); v2.5 closed unreleased and was folded into v2.6.
Release status per version: `.claude/CLAUDE.md` §Status and [`CHANGELOG.md`](../../CHANGELOG.md).

## Source layout

```
src/
  index.tsx                  # boots the runtime, mounts settings panel + drawer
  engine/                    # pure — never imports STAPI
    schema.ts validate.ts    # format-2 types, normalization, graph indexes
    storyDiff.ts             # classifies an edit against live state (compatible/invalidating) + state pruning
    blackboard.ts            # typed values, versions, latching, monotonic checks
    gates.ts transitions.ts convergence.ts
    applyQueue.ts engine.ts  # serialized writes drained at boundaries; boundary log; rollback
    replay.ts                # deterministic fixture runner
  extraction/                # off-path shared read
    scope.ts contract.ts parse.ts sharedRead.ts scheduler.ts reconcile.ts
    cues.ts canonLite.ts client.ts chatWindow.ts fixtureRun.ts
  pacing/                    # tension smoothing, dramatic shapes, steering
  memory/                    # tiers, scene detection, supersession, consolidation, arcs,
                             # canon, epistemic, ledger, injection (pure except inject.ts)
                             #   v2.3 plan 04 adds derived.ts (what an artifact was built from and
                             #   what it removed) and reverse.ts (the whole memory-side reversal)
  generation/               # background beat expansion + critic
    paths.ts                 # v2.3 plan 07 (pure): every route through a generated chain
  copilot/                  # authoring + in-play driver over the studio mutation API
                            #   stages: qualities, checkpoints, transitions, effects, provisioning;
                            #   a stage may answer with `questions` instead of ops (the interview)
    agent/                  # v2.6 plan 11 (pure): the agentic wizard — typed tools, drive loop,
                            #   local route + the harness tool bridge (lazy Studio chunk only)
    guideTopics.ts          # the compact author's guide, drift-tested against docs/authoring/story-guide.md
  wizard/                   # pure wizard core: provisioning ops, create-only validation,
                            #   environment fold, interview/session helpers
  stagecraft/               # pure curator core: op types + accept modes, the curation prompt,
                            #   the strict line parser, "first || last" patch application,
                            #   and the stagecraft.lorebooks allowlist
  talk/                     # plan 14 (pure): speaker-direction rules, the director prompt + parser
  judge/                    # v2.2 (pure): the judge read model (questions, client, policy),
                            #   director + self-test; v2.3 plan 10 adds the MEASUREMENT files
                            #   (loreScore/loreRanking/loreRelevanceCalibration — pickLore unchanged);
                            #   v2.6 plan 12: providers.ts, the DecisionProvider seam (per-use routing)
  image/ sprites/           # illustrations (own ComfyUI graph through ST's proxy) and the sprite stage
  studio/                   # Checkpoint Studio v2 (zustand draft, typed mutations, diagnostics)
                            #   tabs: Graph, Story, Qualities, Checkpoints, Transitions, Roster,
                            #   Diagnostics, Wizard (interview + staged proposals + provisioning cards)
  runtime/                  # ST-facing coordination
    index.ts                # bootstrap, scheduler wiring, TurnBridge, event subscriptions
    runtimeManager.ts       # lifecycle, boundary commit, persistence boundary, event fan-out, delegation
    coordinators/           # the service layer between the pure modules and the manager
      memoryCoordinator.ts      # extras.memory: tiers, arcs, canon, epistemic, ledger, consolidation, WI, injection
      extractionCoordinator.ts  # extras.extraction: audit pipeline, scene/short-term/epistemic passes, memorize backlog
      expansionCoordinator.ts   # extras.expansion: beat cache, generation, staleness revalidation
      copilotCoordinator.ts     # authoring stages, wizard provisioning + environment, driver read-model, nudge
      pacingCoordinator.ts      # tension EMA (pending + committed), steering hint
      stagecraftCoordinator.ts  # extras.stagecraft: the WI curator pass, the review ring, the boundary write, rollback revert
      sceneCoordinator.ts       # v2.3 plan 09: the scene read + its injection; rerun() serves the next-turn preview
    boundaryWork.ts         # declarative registry of everything a committed boundary schedules
    snapshotBuilder.ts      # composes the one RuntimeSnapshot the UI subscribes to
    roster.ts               # roster <-> ST group/chat resolution
    turnBridge.ts           # ST events -> boundary commits / mutation rollback
    effectsApplier.ts persistence.ts storyLibrary.ts
    extras.ts               # RuntimeExtras factories/sanitizers, hydrateExtras, applyGlobalSettings/stripGlobalSettings
    settingsStore.ts        # install-wide settings home
    settingsRoot.ts         # the one extension-settings root, stamped schema 1 by writes (v2.5 plan 11)
    selfTest.ts snapshot.ts # model self-test over fixtures; pure snapshot readouts
    journal.ts              # SessionJournal: status/flag records, payload ring, buildSessionJournal()
    narrative.ts            # the one composed player "where am I" view (drawer, away popup, /story)
    pipeline.ts             # derived working/reading/stalled/idle/not-configured/error signal
    storyUpdate.ts          # the author's save applied to this chat: diff, choice popup, swap, re-pin
    storySelection.ts       # which story this chat plays: import, select, restart, remove
    values.ts               # typed text -> PrimitiveValue (author input paths)
    wizardSessions.ts       # wizard conversation/stage/created-asset ledger, install-wide
    memoryQueue.ts          # v2.3 plan 05: the reconciliation queue (re-read, dismiss, Lock as canon)
    memoryMirror.ts         # memory -> World Info, one book per chat
    effectLedger.ts         # v2.3 plan 06 (pure): write-ahead pending row, hydrate reconcile, CAS restore
    saveHealth.ts           # v2.3 plan 06 (pure): the pending-boundary reading a refused effect reads
    stateExport.ts          # v2.3 plan 05: the author's copy of a chat's story state
    agencyRecovery.ts       # v2.3 plan 07 (pure): the refusal a boundary log shows
    nextTurn.ts             # v2.3 plan 09 (pure): the author's next-turn preview in ST's assembly order
    repair.ts               # v2.3 plan 09 (pure): the ONE missing step, worst-first
    faultMatrix.guard.test.ts # v2.3 plan 11: the fault-matrix census guard
    runToken.ts             # v2.3 plan 03: RunOwnership / RunToken / beginRun
    macros.ts slashCommands.ts awayRecap.ts liveSuite.ts
    inlineTimeline.ts messageInspector.ts loreFired.ts  # v2.6 plan 08: notes under each message
    chapters.ts chapterPort.ts chapterKit.ts chapterSeal.ts # v2.6 plan 07: chapters (lazy chunk)
    storyLore.ts storyLoreHost.ts # story-scoped lore: a story's books scanned only in its own chats
    replyEffort*.ts thoughtLeak.ts # v2.6: the main reply's thinking budget (llama.cpp only)
    samplerOverlay*.ts      # v2.4 plan 06: a preset effect as a per-request sampler overlay
    worldInfoEvidence*.ts   # v2.4 plan 05: what World Info actually activated, observed
    chance.ts talkControl.ts judge.ts
  components/
    studio/                 # 6 reused presentational primitives
    settings/               # EntryPoints (Start/Continue/Repair/Author), CapabilitiesGroup, the setting groups
    inline/                 # v2.6 plan 08: InlineLayer/InlineStrip/InlineDetail (notes under messages)
    drawer/                 # DrawerTabs (player Overview/Memory; author adds Blackboard/Scheduler/Payload),
                            #   PlayerOverview (narrative view + pipeline signal), HudStrip, DriverPanel (author),
                            #   StagecraftPanel (author: the curator review ring in the Scheduler tab)
  services/
    STAPI.ts                # the ONLY import surface for host modules
    stHost/*                # one host wrapper per concern (dynamic webpackIgnore imports)
                            #   provisioning.ts: character + group creation; worldInfo.ts: lorebook creation
                            #   backgrounds.ts: read the active background, list installed ones, switch by name
  constants/ utils/
```

## Invariants

- `services/STAPI.ts` + `services/stHost/*` are the only files importing SillyTavern host
  modules, via dynamic `import(/* webpackIgnore: true */ …)`. The base context comes from the
  official `globalThis.SillyTavern.getContext` (extensions-module fallback); most host access
  goes through context members, leaving six directly-imported host modules (`modules.ts`).
- Host types are vendored locally in `stHost/hostTypes.ts` (narrow interfaces + index
  signatures, one ledger row per member in `docs/plans/v2/00-implementation-overview.md`), so
  typecheck/build work outside the SillyTavern tree; runtime guards remain the safety net.
- Macros register through the `registerHostMacro`/`unregisterHostMacro` seam
  (`stHost/context.ts`) — currently `MacrosParser`, the only API that feeds both the legacy and
  the flag-gated new macro engine; migrating later is a one-function-body edit.
- `engine/**` and `extraction/scope*` never import STAPI. `EngineHost` is a clock seam
  (`{ now }`), not an effects seam: host effects live in `runtime/effectsApplier.ts` and the
  `runtime/coordinators/*`, which tests fake through their injected deps.
- Coordinators own one `extras` slice each, never import one another, and never call
  `saveMetadata`: they mutate through injected accessors and ask the manager to persist/notify.
  Engine writes go through injected enqueue callbacks — the engine stays manager-owned.
- The UI reads one composed model (`snapshotBuilder`) through one subscription; coordinator
  read-models (`ledger`, `driver`, `activeNudge`) are fields on the snapshot, not getters a
  component calls during render. `src/runtime/architecture.test.ts` enforces this, the manager
  size budget and the component/studio import boundary.
- Two personas, one default: the drawer's player mode is the publishable surface (narrative view,
  memory curation, honest status); author view *adds* internals, never conditionally reveals them.
  Everything that steers the story (driver, Advance, Nudge, Probe, `/cp`) is author-only, and that is
  asserted as a **selector sweep** over every player-visible surface — the drawer's tabs, the HUD strip
  and the settings panel — not as a reading of the labels (`so-ui.mts assert-player-clean`).
  The player composition itself is pure (`narrative.ts` + `pipeline.ts`) and reaches the drawer,
  the away-recap popup and `/story` from the same snapshot fields.
- Runtime state persists per chat in `chat_metadata.story_orchestrator`; the story library lives
  in extension settings.
- A chat plays its own pinned copy of the story. The one automatic path from the library into a
  running chat is the author's own save from that chat (`runtime/storyUpdate.ts`): the edit is
  diffed against live engine state, applied silently when compatible, and put to the author as
  keep / restart / cancel when it invalidates something the run holds. Keeping drops exactly the
  orphaned values and re-pins; every other chat keeps playing what it started with.
- The wizard may create SillyTavern assets, and it may only ever *create*. `wizard/provisioning.ts`
  is the single decision point — the review card and `copilotCoordinator.applyProvisioning` both
  call it, so an op naming an existing character, a foreign lorebook or an existing group is
  rejected regardless of what the model asked for. Provisioning ops ride the `ProposalOp` union for
  one grammar and one audit path, but `applyOp` ignores them and `diffProposal` keeps them out of
  the bulk-accept list: each is edited and applied on its own. What a created asset leaves in the
  story is an ordinary `setRequirements`/`addRosterMember` mutation, so the requirements panel goes
  green from evidence rather than from optimism. Personas are never provisioned.
- Stagecraft proposes and never writes. A curator returns typed ops on the memory LLM off-path; the
  runtime applies the *accepted* ones inside `commitBoundary`, through the same effects path as every
  other host write. Its entire scope is the story's authored `stagecraft.lorebooks` — nothing is
  inferred from `requirements` or from `world_info` effects — and the allowlist is checked again at
  the write edge, so an edited proposal cannot widen it. `StagecraftCoordinator` holds no engine,
  memory, generation or pacing dependency, which is what makes "a curator can never move the
  blackboard or a memory tier" a fact rather than a promise; `architecture.test.ts` fails the build
  if that changes. Proposals and applications are journaled, each applied op records the entry's
  pre-write state so a mutation rollback reverts it, and the curator ships
  with accept mode `review | auto | off` (on by default since v2.5 plan 19, accept mode `review`). Deterministic stagecraft comes first: `effects.background`
  is an ordinary checkpoint effect, applied idempotently on activate and hydrate.
- Boundary counters are not ST message indexes; snapshots/logs record `{lastMessageId,
  chatLength}`.
- Pending queue writes are not persisted; a reload drops them and reconciliation recovers.

## v2.3 invariants (added 2026-09-22)

These are stated in full in `.claude/rules/architecture.md`; this is the shape.

- **Every asynchronous writer takes a `RunOwnership`** (`runtime/runToken.ts`): a `RunToken` minted at
  the top of the unit and re-checked immediately before each write, because comparing the last message
  index cannot tell two chats apart at the same index. `ownership.guard.test.ts` +
  `test/findings/ownership-sites.json` census every write-after-await in `runtime/`, `wizard/`, `extraction/`, `generation/` and
  `copilot/agent/`.
- **Provenance and pins** (plan 05): one `Provenance` envelope (`source/messageId/boundary/pass/
  validity`, `override`, `inputs`, `confidence`) rides memory entries, epistemic rows, ledger versions,
  scene reads, curator proposals and the canon's inputs. **Pin = retention, lock = truth.** A
  quarantined (`source-removed`/`conflicted`) row is *excluded* from every injection, canon and warden
  fact list — not ranked lower. The **reconciliation queue** (`runtime/memoryQueue.ts`, author-only
  drawer panel) covers facts, ledger, blackboard and scene conflicts with source-window re-read, and
  `Lock as canon` is atomic. The warden's fact list is records (id + envelope + conflicting value), so
  its card cites the message a truth was read from.
- **Every derived artifact records its inputs and its removals** (plan 04): `memory/derived.ts` keeps
  what a compaction, scene summary, arc summary, canon, exclusion or dedup was built from and what it
  took away verbatim; `memory/reverse.ts` composes the whole memory-side reversal, so
  `rollbackFromMessage` is one line. `rollback ≡ replay` is a property test, not a claim.
- **Host effects are owned and observable** (plan 06): every `stHost` write answers
  `{ok:true,…} | {ok:false,reason}` (`stHost/typedResults.test.ts` fails the build on a new one
  answering `boolean`/`void`); effects go through `EffectsApplier.withLedger`, which persists a
  `pending` row **before** the host call, reconciles it on hydrate by reading the host, and refuses the
  effect when that write-ahead row did not reach disk (the save-evidence seam in `saveHealth.ts`, since
  `persist()` cannot answer the question). Restore on leave is compare-and-set. A missing host feature
  **blocks** rather than fails (`stHost/capabilities.ts`). (Preset effects were refused on non-textgen
  backends here; v2.4 plan 06 replaced that with the per-request sampler overlay, see below.)
- **Every generated outcome is a route** (plan 07, R9): `mergeExpansions` emits one transition per
  outcome, priority = declaration order descending (the engine sorts by priority desc and fires the
  first match); the anchor-entry threshold is the **minimum over routes** unless the anchor authors one;
  the code checks and revalidation enumerate every route (`generation/paths.ts`). A cache does not
  survive its contract (`EXPANSION_CONTRACT`). **`Checkpoint.agency` is optional and `DEFAULT_AGENCY`
  applies when it is absent** — steering, both generation prompts, the critic, the away recap and the
  driver panel all read it, and narrating the player's compliance is the defect it prevents.
- **The four tasks are named once, and Repair is derived** (plan 09): Start/Continue/Repair/Author in
  `components/settings/EntryPoints.tsx`; the one missing step comes from `runtime/repair.ts`
  (worst-first, consequence before detail) and **reveals** the control it names rather than
  duplicating it. The next-turn preview (`runtime/nextTurn.ts`) is composed from `INJECTION_REGISTRY`
  and the blocks ST actually holds, in ST's own assembly order.
- **One save vocabulary**: `Saved "X" to the library.` and `Applied to this chat: …` /
  `Not applied to this chat: …` — two events, two owners. Every diagnostic code declares its
  consequence (`DIAGNOSTIC_CONSEQUENCES`), enforced by a jest case.
- **A fault matrix cell is checked, not asserted in prose** (plan 11): `test/findings/faultMatrix.json`
  + `faultMatrix.guard.test.ts` declare nine packages × nine shapes, require a citation that really
  exists for `covered`/`partial`, refuse one on `todo`/`na`, and print the counts.
- **Release reproducibility** (plan 08): `npm run build` writes `dist/manifest.json` (bundle sha256,
  source sha256 over the tree, ST version, the hash of every host file the extension imports, the
  capability list read from the code), checked by `npm run test:release`. `dist/` is untracked. The
  **acceptance attestation** (`docs/release/<version>/attestation.json`) is the second file: which
  bundle was served and verified, on which host commit, browser, model, judge model and which journeys
  ran green — and it must declare drift when the tree has moved past the attested build.

## Since v2.3

One line each; the full rule is in `.claude/rules/architecture.md`.

- **The host changes the chat under the story** (v2.4): hiding never rewinds; edit/delete/swipe roll
  back exactly what the message fed; a branch shows *Continue from here*; a save asked for one chat
  never lands in another (save evidence reads the server back).
- **A preset is a per-request sampler overlay**, never an install write (v2.4 plan 06, X20). The
  reply thinking budget (v2.6) is the one overlay that adds keys, five named ones, llama.cpp only.
- **World Info activation is observed, not inferred** (v2.4 plan 05 T12). Checkpoint `world_info` is
  rebuilt from the chat's path; a scan-time gating mode exists as a spike behind
  `worldInfo.gatingMode`.
- **A story's lorebooks reach only the chats that play it** (2026-10-02): `runtime/storyLore.ts`
  appends them to each scan of the owning chat; nothing is selected globally.
- **No chat, no story**: with no chat open an import only saves to the library and every effect is
  refused.
- **Judge** (v2.2, extended through v2.6): every use on by default except `houseRules`; a
  `DecisionProvider` seam routes each use to a provider, refuses an uncalibrated route, and never
  sends a request over the provider's documented size limits. The judge never blocks and never writes.
- **Chance is seeded** (v2.6 SP7.b): rolls, NPC reply probability and the talk pick are drawn from
  (chat, story, boundary, key), so rollback and reopen replay the same value.
- **Inline timeline** (v2.6 plan 08): notes under each message, rendered into the DOM by
  `stHost/inlineMount.ts`, never posted as messages; levels 0–4, author levels only in Author view.
- **Chapters and the saga** (v2.6 plan 07): chapter seals, fold, "Previously…", chronicle; the
  features beyond sealing stay off until their floors are measured.
- **Agentic wizard** (v2.6 plan 11) writes only through typed tools, and only the author confirms an
  asset. The harness plugin's tool bridge (opencode only) changes the transport, not the rule.
- **Release packaging** (v2.5 plan 12): `npm run package` builds the allowlisted zip;
  `npm run stage` installs it into a SillyTavern slot. The repo lives outside SillyTavern.

## Turn flow

1. ST renders a reply → `TurnBridge` detects a boundary and calls `runtimeManager` to commit.
   Greetings (`first_message`) and extension posts such as `/sd` images (`extension`) are not
   turns and commit nothing (`NON_TURN_MESSAGE_TYPES`).
2. The engine drains its apply queue, evaluates gates, fires at most one transition, applies
   checkpoint effects (author's note, world info, cast changes, NPC replies, preset, background),
   applies any curator changes the author accepted, and logs the boundary.
3. `runtime/boundaryWork.ts` (a declarative registry `runtime/index.ts` just runs) schedules
   off-path work: forced cues over the boundary window, cadence
   extraction, reconciliation, expansion, scene-break, the World Info curator pass (P4, coalesced,
   only on a checkpoint change or scene break), short-term rolling compaction (a single
   `short_term` entry summarizing play since the last watermark, updated every ~12 messages,
   replaced not appended, skipped while pinned), and consolidation passes.
4. The `ExtractionScheduler` runs a shared read on the memory LLM; accepted deltas are enqueued
   and applied at the *next* boundary — the response path stays AI-free. Cadence windows end
   `stabilityLag` messages behind the newest (default 0; swipes are covered by rollback + a P0
   re-read); cue/scene/rollback/reconcile reads always include the newest message.
   Live expected tension prefers the active checkpoint's authored `tension_target`
   (`levelToNumeric`) and falls back to the `arc_template` curve; steering hints name the
   expected level and switch to stronger wording past 0.5 drift.
5. `generation_started` captures the injected prompt blocks into a ring buffer for the Payload
   tab; `generation_ended` clears the copilot nudge and private per-speaker injection.

## Injection registry

All extension-prompt injection keys and depths are declared once in
`src/constants/injectionRegistry.ts` and projected into `constants/defaults.ts`. Same-depth
`IN_CHAT` prompts merge deterministically (key-sorted by the host), so intentional depth
collisions are recorded in an allowlist and asserted by a unit test.

| Key | Depth | Writer |
|---|---|---|
| `story_orchestrator_memory_facts` | 4 | memory/inject |
| `story_orchestrator_memory_session_details` | 3 | memory/inject |
| `story_orchestrator_memory_short_term` | 2 | memory/inject |
| `story_orchestrator_memory_scene_history` | 6 | memory/inject |
| `story_orchestrator_epistemic` | 4 | memory/inject |
| `story_orchestrator_ledger` | 3 | memory/inject |
| `story_orchestrator_pacing` | 2 | runtimeManager |
| `story_copilot_nudge` | caller | runtimeManager |

Epistemic state is never written to World Info (privacy).

Write-on-change: `stHost/extensionPrompts.ts` caches the last written `{text, depth}` per key and
skips identical rewrites (the wrapper is the only writer of `story_*` keys), so per-boundary
re-injection is a no-op when nothing changed. Author's Note and World Info toggles write
unconditionally by design — they only fire on checkpoint activation/hydrate, and `upsertWIEntry`
already skips unchanged content.

## Testing & tooling

- Jest suites are colocated as `src/**/*.test.ts` (excluded from tsconfig/lint), run
  `--runInBand`. Fixtures live in `test/fixtures/`, recorded goldens in `test/goldens/`.
- Storybook stories (`*.stories.tsx`) cover studio and drawer components with play-function
  interaction + a11y checks (`npm run test-storybook:ci`).
- **Judgment model (v2.2).** `server-plugin/story-orchestrator-judge` is an ST server plugin
  (`npm run plugin:install`, `enableServerPlugins: true`, restart) and the only reader of the
  TypeSafe key. Its own tests run with `npm run test:plugin` (`node:test`; `JUDGE_LIVE=1` adds one
  real API call). Calibration has two halves: `scripts/spike/typesafe/calibrate-node.mts` (real
  plugin handler + `src/judge`, no ST) and `so-judge.mts calibrate` (page → plugin → API). Fixtures
  live in `test/fixtures/judge/`, goldens in `test/goldens/judge/`.
- `scripts/debug/*.mts` drive a live SillyTavern over CDP for E2E validation; `so-scenario.mts`
  replays scenario JSON in `test/scenarios/`.
- **Journeys** (v2.1 evaluation layer 5) are the composition gate above scenarios:
  `scripts/debug/so-journey.mts` runs `test/journeys/*.journey.json` fresh-start against the real
  model, wrapping the same `so-scenario` step engine. Per-check outcomes are
  `pass|fail|blocked|not-runnable|skipped`; catalog, checks and the spoiler checklist live in
  `docs/plans/v2.1/test-plan.md`. `--strict` (acceptance mode) makes `blocked` a failure. The run
  that greens a gate is archived under `test/journeys/records/<gate>/`, because `.debug` rotates.
  Journeys are run **twice** before a gate is called green: the v2.1 acceptance run found two defects
  that only a second consecutive run exposed (a chat-scoped cache bug and a 0-op curator proposal).
- **Nondeterminism belongs in the checks, never in a mock**: `wait: {talkDecisions}` waits for the
  signal instead of reading at `idle`; `stagecraft: {expectOps, attempts}` re-asks the curator when a
  small model formats every line unparseably; unreadable-path gates use `seed_metadata: {file|blob}` so
  they run over a blob this build never wrote rather than one synthesized from live state.
- **Session journal**: `runtime/journal.ts` merges the persisted rings (boundary log, transitions,
  extraction audits + accepted deltas, reconciliation, payload captures, talk decisions) with
  status transitions and player ⚑ flags into one ordered timeline. Only status/flag records are
  persisted (`extras.journal`, cap 200); everything else is derived at read time. Handle:
  `getSessionJournal()`; export: `scripts/debug/so-journal.mts`.
- **Live delta accuracy** is measured by `scripts/debug/so-live-suite.mts`, which runs every
  `test/fixtures/extractor*` triple through the real memory model
  (`globalThis.storyOrchestratorLiveSuite.runFixture`, built from the same pure `fixtureRun.ts`
  path the deterministic jest suite uses) and scores exact-match on `{q,v}` deltas. The corpus is
  directory-discovered (a complete `.story/.transcript/.expected` triple auto-joins both suites);
  an `.expected.json` may carry an optional `spec` (activeCheckpointId/window/canon/blackboard)
  and `promptExcludes` (e.g. proving a latched quality is never asked about).
- Studio diagnostics include `quality-never-in-scope` (warning): an extractor quality in no gate
  or `state_snapshot` never enters extraction scope, so the extractor is never asked about it.
- **Wizard runs are driven through the UI, not the store**: `so-ui.mts open-wizard | new-story-wizard |
  wizard-run | wizard-answer | wizard-apply | wizard` (also `ui` actions in scenarios and journeys),
  because the review step is the feature under test. A wizard journey creates real assets in the
  user's install, so `scripts/debug/so-assets.mts list|remove|assert-clean --marker <prefix>` scopes
  cleanup to the marker plus the created-asset ledger of *test* wizard sessions (marker-keyed, or
  recorded since the run's baseline — a real author's sessions are never touched), and `cleanup.removeCreatedAssets`
  runs in the runner's `finally` and re-checks for leaks. J9 fails on a leaked asset.
- **The curator is reviewed through the drawer, not the store**, for the same reason: `so-ui.mts
  stagecraft | curator-accept [index] [text] | curator-reject [index]` (also `ui` actions), with
  `{stagecraft: {action}}` for the runtime side and `expect: {background}` / `expect: {stagecraft}`
  for the assertions. J8 switches the curator on inside the journey, snapshots the global config, and
  deletes the `SO-J8` lorebook it wrote into.

## Packaging

`manifest.json` loads the gitignored `dist/index.js` produced by `npm run build` (prod; `build:dev`
writes the dev bundle with debug handles to `dist-dev/`). `npm run package` builds the release zip
from `scripts/release/artifact-allowlist.json`; `npm run stage` copies the same file list into a
SillyTavern extension slot. The
`generate_interceptor` (`talkControlInterceptor`) is the live speaker-direction enforcement point,
assigned once inside `startRuntime()` (plan 14) — never re-assigned after startup, which silently
disabled the feature once.
