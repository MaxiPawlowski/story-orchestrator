# Plan 10 — Epistemic Map + State Ledger

## Objective

Per-character knowledge tracking (knows / suspects / believes-falsely / unaware / hiding-from) with **private injection** — each responding character sees only their own knowledge — plus the right-now state ledger whose gate-relevant fields are blackboard qualities. Port of Smart-Memory's epistemic + state-card modules, threaded through the shared read exactly as plan 09 did arcs.

Why now: without private injection a group member's prompt carries the *last speaker's* facts (`getActiveSpeakerId()` = last rendered message), so every character effectively knows everything — the spine can gate on secrets but narration can't keep them. The ledger closes the loop between the narration layer's "current state" and the gate spine's qualities with a single writer that cannot diverge.

## Context

- Spec: §Memory subsystem (tiers table: Epistemic map / State ledger; shared read; bridges), §Cast model (private perspective), §ST integration (`GROUP_MEMBER_DRAFTED`), §Data model (`ledger_binding`).
- Consumes from 07: per-character stores, injector, P2 scene passes, `getEnabledCharacterIds`. From 08: budgets/scoring, supersession concept. From 01/03: blackboard, apply queue, shared-read contract/parse/scheduler.
- **Base**: `vendor/smart-memory/prompts.js` `buildEpistemicExtractionPrompt` (5-tag map, `[retire]` supersession, **all participants in one call**) + `buildStateCardPrompt` (`[state:Entity:type] field=value | …`); parsers `vendor/smart-memory/parsers.js` `parseEpistemicResponse`, `parseEpistemicRetireIndices`, `parseStateCardResponse`. (Doc plan-11 note said "likely within longterm/profiles" — actual location recorded here: `prompts.js` + `parsers.js`.)
- ST facts (verified): `GROUP_MEMBER_DRAFTED` = `'group_member_drafted'` (`events.js:59`), payload = numeric `chId` index into `characters[]`, emitted **awaited** at `group-chats.js:1059` **before** `Generate()` (`:1063`); `eventemitter.js:146` awaits each listener sequentially. `setStoryExtensionPrompt`/`clearStoryExtensionPrompt` (`stHost/extensionPrompts.ts`, in-chat/system) for the private block.

**Already in the tree (do not re-add):** `ledger_binding` schema type (`engine/schema.ts:28-43`) + validator reject-on-`source:code` rule (`engine/validate.ts:71-91`), added "part 1" as a placeholder. `git grep` shows **no runtime consumer** — that is the open work.

## Scope

**In**: epistemic tier + extraction (P2 pass + shared-read tags), private per-speaker injection on draft, state-ledger tier, ledger↔blackboard single-writer mirror, capability-profile gate, dramatic-irony fixtures.
**Non-goals**: Studio surfacing (11 may expose read-only); relationship-state per-pair tier (stays as facts-tier `relationship` type); solo (non-group) chats need only the single-speaker degenerate case; WI writing of epistemic (privacy — never) or ledger (deferred).

## Resolved decisions (exploration + user)

- **Storage = arc precedent.** New separate typed arrays on `MemoryRuntimeState` (`epistemic: EpistemicEntry[]`, `ledger: LedgerEntry[]`), **not** new `MemoryTier`s in the `entries[]` pool — their shapes/lifecycle (per-subject retirement on reveal; per-entity current-state overwrite; blackboard mirror) don't fit the append-only scored `MemoryEntry` model. Mirrors `arcs: ArcEntry[]` (`runtime/types.ts:61`).
- **Extraction placement = P2 passes + shared-read tags** (user). Cadenced read gains epistemic + `[state:…]` tags for high-signal moments; confirmed scene breaks run the full combined P2 pass. Both **capability-gated** so the fragile local hot-path only carries them when the model is capable; lean on the existing B2/B3 parser hardening (`extraction/parse.ts`).
- **P2 batching = one combined call** over all participants (Smart-Memory-native), resolving the doc's delegated batching decision.
- **Reveal supersession = `[retire] N`** indices in the P2 epistemic pass (existing-entries context) — the epistemic-native analog of 08's supersession. Shared-read tags are additive only; retirement happens in the P2 pass.
- **Capability profile = single toggle, both** (user). `epistemicLedgerCapable` (default on) gates both P2 passes + the shared-read epistemic/state tags. Off → passes stop, tags dropped from the contract, private injection falls back to shared facts only, ledger view shows blackboard-mirrored bound fields only.

## Data shapes (`src/memory/types.ts`)

```ts
export const EPISTEMIC_TAGS = ["knows","unaware","suspects","believes","hiding"] as const;
export type EpistemicTag = typeof EPISTEMIC_TAGS[number];
export interface ParsedEpistemicSignal { tag: EpistemicTag; subject: string; content: string; hiddenFrom?: string; }
export interface EpistemicEntry { id: string; subject: string; tag: EpistemicTag; content: string; hiddenFrom?: string; createdAt: number; messageId?: number; pinned?: boolean; supersededBy?: string; }
export interface ParsedLedgerSignal { entity: string; entityType: string; field: string; value: string; }
export interface LedgerEntry { id: string; entity: string; entityType: string; field: string; value: string; createdAt: number; messageId?: number; pinned?: boolean; }  // unbound only; bound derived, never stored
export interface LedgerView { entity: string; field: string; value: string; bound: boolean; turn: number; }  // computed at read time
```

`subject`/`entity` normalize lowercase-trim (keep display name). Ledger drop-key + mirror key = `` `${entity.toLowerCase()}|${field.toLowerCase()}` ``.

## Deliverables

- **`src/memory/epistemic.ts`** (pure) — `applyEpistemicSignals(entries, signals, retireIndices, {boundary,messageId})` (dedup subject+tag+content jaccard like `arcs.ts`, apply `[retire]` → `supersededBy`/drop), `rollbackEpistemic`, `capEpistemic`, `setEpistemicPinned`/`removeEpistemic`, `epistemicForSubject`, `renderPrivateEpistemicBlock(entries, rosterId, name)` → 2nd-person block ("You know / suspect / believe (may be false) / are unaware that / are hiding from <Y>").
- **`src/memory/ledger.ts`** (pure) — `applyLedgerSignals(entries, signals, boundKeys, ...)` (drop `entity|field ∈ boundKeys` = single-writer; else merge-by-key newest-wins), `rollbackLedger`, `capLedger`, pin/remove, `buildBoundKeySet(story)`, `buildLedgerView(entries, blackboardValues, story)` (stored unbound + one derived `{bound:true}` row per `ledger_binding` quality), `renderLedgerBlock(view)`. Export both from `src/memory/index.ts`.
- **Shared-read tags** — `memory/contract.ts` `renderEpistemicContractSection`/`renderLedgerContractSection(entities)` spliced into `renderMemoryContractAddendum(openArcs, capable, entities)` only when `capable`; `memory/parse.ts` `parseEpistemicLine`/`parseEpistemicRetire`/`parseLedgerLine` (port vendor regexes + `STATE_NOISE_VALUES`). Thread through `extraction/{types,contract,parse,sharedRead,scheduler}.ts` exactly as plan 09 threaded `arcs`/`openArcs` (new `ParsedSharedRead`/`SharedReadResult` fields `epistemic`/`ledger`; `SharedReadContract` gains `epistemicLedgerCapable`/`entities`; both in `hashContract`; two new ordered branches in `parseSharedReadResponse` after the arc block `:90-95`).
- **P2 combined pass** — `runtimeManager.runEpistemicLedgerPass(audit)` (shape of `runSceneBreakPass`): guard `loaded && memory.enabled && capable && audit.sceneBreak`; participants = `getEnabledCharacterIds()` names; **one** `callExtractionModel(buildEpistemicPassPrompt(...), {debugResponse: storyOrchestratorDebugEpistemicResponse})` + one `buildLedgerPassPrompt(...)` (`…DebugLedgerResponse`); apply + `[retire]` + `updateMemoryInjection` + persist. Scheduled P2 on `onSceneBreakConfirmed` in `runtime/index.ts` beside the scene-summary schedule (`:61-63`).
- **Private injection** — new `group_member_drafted` subscription (via `subscribeToHostEvents`, same wrapper `turnBridge.ts` uses) → `runtimeManager.onMemberDrafted(chId)`; `generation_ended`/`generation_stopped` → `clearPrivateInjection`. Pre-stage `stagedPrivate: Map<rosterId,{facts,epistemic}>` at each `updateMemoryInjection`; the awaited draft handler does a **sync** map lookup + `setStoryExtensionPrompt(EPISTEMIC_INJECTION_KEY, …)` + facts-key swap (no scoring/IO in the awaited path). Injection keys `story_orchestrator_epistemic` / `story_orchestrator_ledger` (`constants/defaults.ts`), one slot per purpose (content swaps, no per-character slot leak). Solo/non-group: set the active-speaker's block statically in `updateMemoryInjection`. `inject.ts` gains `apply/clearEpistemicInjection` + `apply/clearLedgerInjection`; both keys added to `clearAllMemoryInjection`.
- **Capability profile** — `MemoryRuntimeSettings.epistemicLedgerCapable` (default true) + `setEpistemicLedgerCapable`; settings toggle "Epistemic/ledger extraction (model-capable)" with heuristic warning on a small/local model (never downgrade for cost — spec). Off path per Resolved decisions.
- **Runtime plumbing** — `applyExtractionAudit(audit, facts, memory, arcs, epistemic=[], ledger=[])` writes both when `capable` (pass through all call sites `:639/:670/:689` + scheduler `:116`); `createMemory` init; `sanitizeMemory` preserve+coerce; `rollbackFromMessage` calls `rollbackEpistemic`/`rollbackLedger` (join `rollbackArcs` `:332`); reverse helper `rosterIdForName` (inverse of `getActiveSpeakerId`, reuse `stHost/characters.ts` `getCharacterNameById`); getters `getEpistemic`/`getLedger`(→`LedgerView[]`) + pin/remove ops. Macros `{{story_epistemic}}` (active-speaker) + `{{story_ledger}}` (`macros.ts`). UI: `EpistemicPanel` (per-subject, tag + `hiddenFrom`, char filter) + `LedgerPanel` (bound rows badged read-only) in the memory drawer (`index.tsx`).
- **Fixtures** — dramatic-irony suite `test/fixtures/dramatic-irony.{story,transcript,expected}.json` (A hides X from B) + goldens `test/goldens/{epistemic1,ledger1}.response.txt` (+ reveal variant). Assertions: A's block contains `hiding`/`knows` X; B's block contains nothing about X; B keeps `believes(false)` until reveal; reveal P2 pass flips B to `knows` X and `[retire]`s the false belief (08 supersession reused). Port `vendor/smart-memory/tests/parsers.test.js` cases into `src/memory/{epistemic,ledger}.test.ts`.

## Implementation notes

- **Draft-swap timing verified**: the awaited emit → handler → `Generate` ordering means a synchronous swap in the handler is correct; pre-staging is a perf/robustness choice (keeps the awaited handler O(1), no store/scoring work delaying every group generation), not a correctness requirement. Restore keys off the existing `generation_ended`/`generation_stopped` handlers.
- **Ledger single-writer is strict**: bound `(entity,field)` pairs are dropped from *both* the P2 ledger pass and the shared-read `[state:…]` lines; the blackboard (apply queue, extractor source) is the sole writer; the bound row appears in the view only via `buildLedgerView` reading the blackboard snapshot. Bound qualities already flow into extraction scope when gate-relevant (`extraction/scope.ts` `source==="extractor"` filter) — no special routing.
- **No epistemic in World Info** — WI is shared/global; writing a private block would leak across characters.
- **Suggested milestones** (negotiate before build, per 07/08/09): M0 types + pure modules + unit tests (gate: typecheck/lint/test); M1 shared-read tag threading + capability gate; M2 runtime write path + ledger mirror; M3 P2 combined pass + `[retire]`; M4 private injection (subscription/staging/swap/restore/solo); M5 capability toggle + macros + UI; M6 fixtures + scenarios + tooling + real-LLM live gate.
- **Tooling grows with the build** (mandatory): `so-state.mts` memory block gains `epistemicCount`/`hidingCount`/`ledgerCount`/`boundLedgerCount`/`epistemicBySubject`/`capable`; `so-scenario.mts` gains `epistemic`/`ledger`/`privateInjection`/`capability` expect verbs; `test/scenarios/plan10-epistemic-ledger.json` (deterministic, `storyOrchestratorDebug{Epistemic,Ledger}Response`) + `live-plan10-epistemic-ledger.json` (real-LLM); update `scripts/debug/README.md`, `.claude/rules/gotchas.md` (handle methods + debug globals), debug skill.

## Validation gate

Harness: `npm run typecheck && npm run lint && npm run debug:typecheck && npm test && npm run build`. New suites `src/memory/{epistemic,ledger}.test.ts`; extended `parse`/`runtimeManager`/`scheduler`/`validate` (incl. a `ledger_binding`-on-`source:code` rejection test if absent) + dramatic-irony replay.

Live (real-LLM default — profile selected, **no** `debugResponse`):
1. Baseline green; dramatic-irony fixtures pass on goldens (extraction + injection-content assertions).
2. `plan10-epistemic-ledger.json --sandbox` exit 0.
3. 2-member group, planted secret, real generation across consecutive replies → capture **both** members' extension prompts (`st-payload` per `group_member_drafted`, or `st-context` extension prompts) → each saw only their own epistemic/private-facts block; replies stay perspective-accurate (manual read, note in Gate record).
4. Ledger: a bound quality (e.g. `location`) changes via real extraction → ledger view mirrors it, blackboard sole writer; an unbound field lands ledger-only; a `[state:…]` line for a bound field is dropped.
5. Capability toggle off → passes + tags stop, no errors, shared injection continues, ledger view shows bound-mirror only.
6. Cleanup: restore group `disabled_members`, delete sandbox chats/imported stories (group-scoped-`disabled_members` gotcha).

Gate record must state exact commands + results; if the real-LLM live gate can't run, say so and mark the gate NOT green.

## Delegated decisions

Reveal-detection wording (stay close to Smart-Memory's DECEPTION/CONTRADICTION rules); ledger entity-naming normalization vs roster ids (entities may be objects/places, not roster members — record mismatches surfaced live); whether to narrow cadenced epistemic tags to `[hiding]`/`[believes]` if the local model degrades DELTA/FACT quality with the full set present (P2 keeps the full set regardless); optional validator hardening — `{entity,field}` uniqueness across `ledger_binding`s (template: arc_bridges anchor check `validate.ts:407-411`); adjacent retro finding F1 (expansion should reject outcome gates contradicting a latched value) — fold into M6 or defer to 11.

## Gate record

Date: 2026-07-06

Executed as milestones M0–M6 (per plan). Each gated during the build; final numbers cumulative over all of plan 10.

Command outputs (final):
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run debug:typecheck`: passed.
- `npm test`: passed, **23 suites / 1223 tests** (up from 21 / 1192 at the plan-09 retro — new: `src/memory/{epistemic,ledger}.test.ts` [+24]; extended `src/extraction/extraction.test.ts` [routing], `src/runtime/runtimeManager.test.ts` [+5: epistemic write, ledger single-writer drop, P2 retire, private-injection swap, ledger injection, capability-off]).
- `npm run build`: passed with pre-existing size warnings only (`dist/index.js` ~382 KiB).

Live checks (SillyTavern at `http://127.0.0.1:8000/`, backend `gemma4-31b-mtp` online, shared session):
- **`plan10-epistemic-ledger.json --sandbox`: 11/11**, deterministic path against real ST — epistemic write (verb), ledger single-writer drop of a bound `[state:…]` line, blackboard bound-mirror via `getLedger()` after a real `commitBoundary`, P2 `[retire]` reveal flipping a false `[believes]` to superseded + adding `[knows]`, capability toggle off/on, and **real `setExtensionPrompt` injection** of both the private epistemic block (`You know / are concealing…`) and the ledger grounding block (`mood=grim`).
- **`live-plan10-epistemic-ledger.json --sandbox`: 4/4 real-LLM** (extraction profile `Story Orchestrator Memory Local` → gemma4-31b-mtp, **no `debugResponse`**) — a planted dramatic-irony scene → real `runEpistemicLedgerPass` (12.4 s gemma call) → ≥2 parsed epistemic entries including a `[knows]` landed in the store. Confirms the LLM-consuming P2 path produces parseable epistemic/state tags on the local model.
- Cleanup: both scenarios `--sandbox` (scratch chats deleted, imported stories removed — library verified clean afterward). No `cast_changes` in either fixture, so the ambient group's `disabled_members` was untouched.

As-built:
- `src/memory/`: `types.ts` (`EPISTEMIC_TAGS`, `EpistemicEntry`/`LedgerEntry`/`LedgerView` + parsed-signal types), `epistemic.ts` (`applyEpistemicSignals` dedup+`[retire]`→`supersededBy`, `activeEpistemic`, `epistemicForSubject`, `renderPrivateEpistemicBlock` — excludes `[unaware]`, frames `[believes]` as subjective truth, per-subject; caps/rollback/pin/remove), `ledger.ts` (`applyLedgerSignals` drop-bound + merge-by-`entity|field`, `buildBoundKeySet`, `buildLedgerView` = stored unbound + derived bound rows, `renderLedgerBlock`; caps/rollback/pin/remove). `contract.ts` gains `renderEpistemicContractSection`/`renderLedgerContractSection` (spliced into `renderMemoryContractAddendum(openArcs, capable, entities)` only when capable) + `buildEpistemicPassPrompt`/`buildLedgerPassPrompt` (ported verbatim from `vendor/smart-memory/prompts.js`). `parse.ts` gains `parseEpistemicLine`/`parseEpistemicRetire`/`parseLedgerLine` (ported regexes + `STATE_NOISE_VALUES`). `inject.ts` gains `apply/clearEpistemicInjection` + `apply/clearLedgerInjection`; `clearAllMemoryInjection` clears both keys.
- `src/extraction/`: `types.ts` `ParsedSharedRead`/`SharedReadResult` gain `epistemic`/`ledger`, `SharedReadContract` gains `epistemicLedgerCapable`/`entities`; `contract.ts` threads both into the prompt + `hashContract`; `parse.ts` routes `[knows|unaware|suspects|believes|hiding]`→`epistemic` and `[state:…]`→`ledger`; `sharedRead.ts` options + return; `scheduler.ts` host gains optional `getEpistemicLedgerCapable`/`getEntities` and forwards `epistemic`/`ledger` to `applyExtractionAudit`.
- `runtime/`: `types.ts` `MemoryRuntimeState` gains `epistemic`/`ledger`, `MemoryRuntimeSettings` gains `epistemicLedgerCapable`. `runtimeManager.ts`: create/sanitize init both arrays + default capability true; `applyExtractionAudit(…, epistemic=[], ledger=[])` writes both when capable (ledger via `buildBoundKeySet(ledgerBindings())`); `rollbackFromMessage` rolls back both; `ledgerBindings()` reads `story.qualityByKey[*].ledger_binding`; `runEpistemicLedgerPass` (P2 combined, one gemma call each for epistemic + ledger, `[retire]` from all-active existing list); `updateMemoryInjection` injects the ledger block + stages per-enabled-member `{facts,epistemic}` and sets the active-speaker epistemic block; `onMemberDrafted(chId)` swaps in the drafted member's private block synchronously; `clearPrivateInjection` restores; getters/ops `getEpistemic`/`getLedger`/`getEpistemicBlock`/`getLedgerBlock`/`setEpistemicLedgerCapable`/`setEpistemic|LedgerPinned`/`removeEpistemic|LedgerEntry`. `index.ts` schedules `runEpistemicLedgerPass` at P2 on scene-break and subscribes `group_member_drafted`→`onMemberDrafted`, `generation_ended`/`generation_stopped`→`clearPrivateInjection` (via `subscribeToHostEvents`). `macros.ts` adds `{{story_epistemic}}` + `{{story_ledger}}`. `constants/defaults.ts` adds `EPISTEMIC_INJECTION_KEY`/`LEDGER_INJECTION_KEY` + depths. `global.d.ts` adds the two debug-response globals.
- UI (`index.tsx`): capability checkbox + heuristic hint in `MemoryPanel`; `EpistemicPanel` (per-subject, tag + `hiddenFrom`, pin/remove) + `LedgerPanel` (bound rows badged read-only `blackboard`, unbound removable).
- Tooling: `so-state` memory block gains `epistemicCount`/`hidingCount`/`ledgerCount`/`epistemicLedgerCapable`; `so-scenario` gains `epistemic`/`ledger`/`capability` expect verbs; `test/scenarios/{plan10,live-plan10}-epistemic-ledger.json`; `README.md` + `.claude/rules/gotchas.md` updated.

Decisions recorded (delegated):
- **P2 batching**: one combined call per scene (Smart-Memory-native), not per-character.
- **Reveal supersession**: `[retire] N` indices from the P2 pass → `supersededBy` marker; injection/views/verbs exclude superseded. Ported DECEPTION/CONTRADICTION rule wording verbatim.
- **Ledger entity normalization**: `entity|field` lowercased-trimmed key for the single-writer drop and mirror; entities may be objects/places (not roster members) — the ledger prompt lists roster + bound + tracked entities.
- **Shared-read tags**: full epistemic + `[state:…]` set carried on the cadenced read when the capability profile is on (user decision); narrowing deferred unless a live finding shows DELTA/FACT degradation.

Deviations from plan:
- **P2 retire existing-list is all-active, not participant-scoped** — the plan/first cut built the retire candidate list from `epistemicForSubject(participants)`. Live-caught: `--sandbox` inherits the ambient group ("Arin, DM Narrator"), which enabled only `Arin` from a plan-10 roster, so a non-present character's false belief could never be offered for retirement and the reveal never fired. Changed to `activeEpistemic(all)` (participants stay as the prompt's presence hint). More correct — a reveal can contradict an absent character's stored belief — and makes the pass deterministic regardless of ambient cast. Unit + live re-verified.
- **Heuristic capability warning is a passive hint**, not model-name detection (snapshot carries no model id); the checkbox + hint text satisfy the "downgrade only when the model can't, never for cost" intent.

Not fully green (flagged honestly per real-LLM policy):
- **The per-draft private swap during a REAL group generation, captured in the generation payload (`st-payload`), was NOT run end-to-end** — no clean 2-member planted-secret group was available in the environment, and standing one up (custom characters + group + planted scene + real rounds) was out of session scope. What IS proven: the swap *logic* (`onMemberDrafted` → drafted member's block, hiding others') by unit test; the `setExtensionPrompt` injection path against *real* ST (deterministic scenario step 6); and real-model epistemic extraction (`live-plan10`). The one unproven link is the real `group_member_drafted` event firing `onMemberDrafted` mid-round with payload capture. Recommended first task next session: a 2-member group with a planted secret → `send_generate` rounds → `st-payload` per draft asserts each member saw only their own `story_orchestrator_epistemic` block.
- Adjacent retro **finding F1** (expansion should reject outcome gates contradicting a latched value) deferred — not folded into M6; carry to plan 11.

## Gate record — code review + validation pass (2026-07-06)

Full code review of the plan-10 surface + real-ST validation. Cross-checked every seam against real ST host source, the vendored Smart-Memory port, and this plan. **Result: correct and well-integrated; one real finding (F-A) fixed; the previously not-green sub-check now closed.**

Verified correct (no change): vendor port fidelity (prompts + parsers); collision-free tag routing (`[arc|resolved]`→arc, `[knows|unaware|suspects|believes|hiding]`→epistemic, `[state:`→ledger — `\w+` can't match `state:E:type`); single-writer ledger (bound keys dropped in `applyLedgerSignals`, view derives bound rows from blackboard); retire-index mapping (same `activeEpistemic(...)` ordered list, 1-based→0-based); private-injection identity chain against host source (`group-chats.js:1051-1063` — `chId` = `characters[]` index, awaited before `Generate()`; `getCharacterNameById`→`rosterIdForName`→`stagedPrivate`, all roster-id space); event strings (`group_member_drafted`/`generation_ended`/`generation_stopped`); contract hash includes capability+entities; sanitize/create init both arrays; rollback covers epistemic+ledger; macros/keys/depths/UI panels consistent.

**F-A fixed** — `onMemberDrafted` fail-open leak. On an unresolved/unstaged draft (a non-roster group member, e.g. a DM/narrator persona) it returned early **without clearing**, leaving the previously-drafted member's private epistemic block injected → cross-character leak. Now routes both paths through `setPrivateInjectionBlocks(facts, epistemic)`: on an unresolved draft it clears the epistemic key and restores the shared/active-speaker facts view (fail-safe). Regression test added (`runtimeManager.test.ts`: non-roster draft id → epistemic prompt empty, no leak of the staged member's block).

Harness: `npm run typecheck && lint && debug:typecheck` clean; `npm test` **23 suites / 1224 tests** (+1); `npm run build` OK (pre-existing size warnings only).

Live (real ST, shared session):
- `plan10-epistemic-ledger.json --sandbox` → **11/11**, exit 0.
- `live-plan10-epistemic-ledger.json --sandbox` → **4/4**, exit 0 (real gemma P2 pass, 11.1s, ≥2 epistemic incl. a `[knows]`, no `debugResponse`).
- **Previously-flagged sub-check now CLOSED — per-draft private swap captured in a REAL group generation payload.** 2-member group `AdolionGroup` (Adolion Storyteller + Ellie), planted secret (Adolion `[knows]`/`[hiding from Ellie]` a well-poisoning; Ellie `[believes]` the water is safe), real `/trigger await=true <member>` → `group_member_drafted` → `onMemberDrafted` swap → outgoing generation HTTP body hooked per draft. **Adolion's** payload: own block present (`poisoned the village well`, `concealing from Ellie: the well poisoning`), Ellie's false belief absent (`hasSafe=false`). **Ellie's** payload: own block present (`the well water is safe to drink`), the secret absent (`hasPoisoned/hasConcealing/hasPoisoning=false`). Dramatic-irony privacy holds in the real payload. (Tooling note: the Playwright MCP browser launches a *separate* Chromium from the `st-session` 9222 browser that `st-payload`/`st-actions` attach to — cross-surface state doesn't share; the capture was run entirely on the 9222 browser via a throwaway `connectToST`+`/trigger` script.)
- **Confirmed again through the genuine UI text-input send** (not just `/trigger`): fresh AdolionGroup chat, story loaded + secret seeded, `st-actions send` (fills `#send_textarea` + clicks `#send_but`) with a message addressing both members → a real group round drafted **both**. `st-payload` per-draft: **Adolion** (`draftMember:1`) payload has `poisoned the village well`=1 / `concealing from Ellie`=1 / Ellie's `well water is safe to drink`=0; **Ellie** (`draftMember:9`) payload has `You believe: the well water`=1 / `poisoned`=0 / `concealing`=0. Each member's own private block only — the end-user typed-message flow (`generateGroupWrapper`→`group_member_drafted`→`onMemberDrafted`) produces the same per-draft isolation.

F-B (informational, not a bug): `runSharedRead` short-circuits to `NO_DELTA` without a model call when `scope.length === 0`, so cadenced shared-read epistemic/ledger tags don't extract at checkpoints with no in-scope qualities. The P2 scene-break pass runs independently and covers it; matches existing arc behavior.

Cleanup: F-A code + test + harness all committed to working tree; live residue removed (temp capture script deleted; scratch AdolionGroup chat `/delchat`'d; Plan10 story removed from `extension_settings["story-orchestrator"].v2Stories` + settings flushed; per-chat `story_orchestrator` metadata wiped from the touched real chat; orphaned scratch-chat backups deleted; `data/` grep clean of `v2-f5761a32`/title). All groups' `disabled_members` unchanged (none disabled). Shared session stopped.
