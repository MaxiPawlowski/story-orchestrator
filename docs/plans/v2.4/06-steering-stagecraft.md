# Plan 06 — Steering and stagecraft

**Status: NOT STARTED (doc written 2026-09-23; reconciled with overview §Reconciliation X8, X9, X14,
X20, X21).**

Depends on:
- **04**: F5's "entity named in a live fact" reads facts cleaned by plan 04.
- **05**: T12 activation evidence is F5's activation proof.
- **01**, for three deliverables:
  1. The **guidance block** `INJECTION_REGISTRY.checkpointGuidance` (`story_orchestrator_guidance`, depth 4, system; X7). Its writer is `PacingCoordinator.updateSteering()` (01 §Guidance injection). The objective line is rendered inside it.
  2. The **T6 outermost-loud-generation tracker** (01 §T6). The textgen overlay needs it to tell our loud turn from a nested `Generate('quiet')`.
  3. The **over-steer probe** (X8). Plan 06 reuses it and does not build it.

## Goal

- The model hears the active checkpoint's objective when no authored note carries it.
- An author is told when a checkpoint silently plays under another checkpoint's note.
- The WI curator can no longer write text it never saw, retarget by prefix, or re-propose what
  the author declined.
- The curator `create` op (F5) is measured before it is built.
- A checkpoint preset becomes a per-request sampler overlay on both backends (X20). It replaces
  today's textgen write, which is global and never restored.

## Scope / out of scope

In:
- T16: objective line + `objective_block: auto|off` + AN-inheritance diagnostic.
- T17: rewrite-length refusal, uid addressing, declined-op memory, word diff, review-only fuzzy anchor.
- F5: Phase A, then a build only if it clears its floor.
- Seed A, decided as option A (X20): the sampler overlay, built here.

Out:
- The guidance block, the T6 tracker and the over-steer probe (all plan 01).
- Look-ahead to upcoming checkpoints (C4).
- `player_summary` (rule 7).
- Multihog write tiers and protected spans, the category digest, story-owned scenario, and the
  complication pool (v2.5, SUMMARY §8).
- Preset drift read on `PRESET_CHANGED` (SUMMARY §8, 2/S). It is not scheduled.
- Any judge use (plan 07).

## Verified current state (tree at HEAD `fcc33cc` + uncommitted V15b/V17 edits, read 2026-09-23)

| Claim | Seen at | Drift vs SUMMARY |
|---|---|---|
| No objective/guidance registry key; depths used 0,1,2,3,4,6 | `src/constants/injectionRegistry.ts:12-23`, allowlist `:25-29` | none |
| `guidance` has no runtime consumer | only `copilot/parse.ts:186`, `engine/validate.ts:344`, `generation/merge.ts:29`, `studio/components/CheckpointEditor.tsx:173`, prompt/judge inputs | none |
| Generated beats carry `objective`+`guidance`, **no effects** | `generation/merge.ts:24-31` | none |
| AN applied only when `author_note !== undefined`; `null`/empty clears | working copy `runtime/effectsApplier.ts:61-68` (`authorNoteText`), `:223-224` (now through `withLedger`) | **drift**: HEAD `:55,222`. V15b (uncommitted) ledgers the AN, so rollback reverts AN rows written after the cut (`restoreFor({since})`, `runtimeManager.ts:340`; `RESTORABLE` `effectsApplier.ts:50`) |
| Pacing hint "only when drifting" | `pacing/steering.ts:47-56` also returns a **hold** hint. It is null only without tension/expected; gated by `hintEnabled` (`pacingCoordinator.ts:99-101`) | **SUMMARY wrong**: the hint is present whenever tension is known, and it already carries the player clause (`steering.ts:24`) |
| `story_current_checkpoint` macro only if placed | `runtime/macros.ts:7-11,42` | none |
| No AN diagnostic; 21 codes | `studio/diagnostics.ts:13-35`, consequences `:40-62`, guard `diagnostics.test.ts:6,13` | none |
| Prompt shows 400 chars (whitespace-collapsed) but offers full `[rewrite]` | `stagecraft/prompt.ts:3,13,32` | none |
| `previewCuratorOp` never compares with the shown length | `stagecraft/proposal.ts:53-57` | none |
| Bidirectional `startsWith` title fallback | `stagecraft/parse.ts:15-20` (`:19`) | none |
| `CuratorEntryView` has no uid; `entriesForScope` drops it | `stagecraft/types.ts:45-51`, `stagecraft/scope.ts:29-38` | none |
| uid recorded after resolution, never used to address | `stagecraftCoordinator.ts:293-294` | **drift**: SUMMARY `:291-294` |
| Allowlist re-check at write edge | `stagecraftCoordinator.ts:278` | none |
| No declined-op memory | `setOpDecision` `:214`; `planCuratorProposal` dedupes only within one proposal (`proposal.ts:68-88`) | none |
| No diff on the review card | `StagecraftPanel.tsx:95` (textarea of op text only) | **drift**: SUMMARY `:92-96` |
| Patch already case/whitespace tolerant | `proposal.ts:3,13-20` | none |
| **New: host WI writes address by exact trimmed title, first match** | `stHost/worldInfo.ts:66,205,234` | not in SUMMARY |
| **New: `upsertWIEntry` CREATES on a title miss** | `stHost/worldInfo.ts:205-208` | not in SUMMARY. A `[rewrite]`/`[patch]` whose target vanished after `readScope` falls back to the batch view (`stagecraftCoordinator.ts:288-290`) and would create an entry. The window is small but it is an implicit create path |
| **New: `decideProposal` bulk-accepts every pending op in a record** | `stagecraftCoordinator.ts:229-231` (no panel button; reached via manager/debug) | not in SUMMARY. F5 must be excluded, like wizard provisioning (inv 8 pattern) |
| **New: `stripGlobalSettings` persists stagecraft by named fields** | `runtime/extras.ts:310` | any new `extras.stagecraft` field must be listed there or it silently never persists |
| Preset effect textgen-only, refused elsewhere | `stHost/presets.ts:36-41,54-58` | none |
| **New: the textgen preset effect is a global, never-restored write** | `presets.ts:72-86` writes `textCompletionSettings` + `saveSettingsDebounced`; `RESTORABLE` excludes preset (`effectsApplier.ts:47-50`) | it leaks to every chat until changed by hand. Retired by the overlay (X20) |
| `setStoryExtensionPrompt` returns `WriteResult` | working copy `stHost/extensionPrompts.ts:20-37`; role system and `scan=false` hard-coded | **drift**: uncommitted |
| Stagecraft coordinator has no memory import (build-enforced) | `runtime/architecture.test.ts:82-83`; warden facts are injected (`stagecraftCoordinator.ts:43`) | none |
| Real stories: sun-ruins 9/9 AN, 3/9 guidance | `examples/sun-ruins/quest-for-the-sun-ruins.json` | agrees with D7 |
| No curator-LLM fixtures exist (only the judge `curator-filter`) | `test/fixtures`, `test/goldens/judge/curator-filter*.json` | F5 Phase A starts from zero |

## Host facts (ST 1.19.0, `C:/dev/SillyTavern-MainBranch/public`, `package.json:118`)

These rows are copied into `docs/plans/v2.4/host-facts.md`, which plan 01 creates (X9, rule 2).
The overlay and F5 builds cite that table, not this one.

| Fact | Where |
|---|---|
| `CHAT_COMPLETION_SETTINGS_READY(generate_data)` is emitted **awaited** inside `sendOpenAIRequest`, before `fetch(JSON.stringify(generate_data))`. In-place mutation reaches the request | `scripts/openai.js:3146,3148-3153` |
| `generate_data.type` exists for CC (`quiet`, `normal`, …) | `openai.js:2803-2804` |
| ST deletes sampler keys per model **before** the emit (e.g. `claude-(fable\|opus-5\|sonnet-5)` drop temperature/top_p/top_k/penalties) | `openai.js:3095-3120` |
| Callers: main Generate `script.js:6118,6154`; `generateRawData` quiet `:4077`; test-connection `openai.js:6180` | — |
| `TEXT_COMPLETION_SETTINGS_READY(params)` is awaited in `getTextGenGenerationData`, for main Generate (`script.js:5275`, **also on dry runs**, before `:5320`) and `generateRawData` quiet (`:4063`). `params` has **no** `type` (only `api_type`) | `scripts/textgen-settings.js:1844-1848` |
| Connection Manager requests fire neither event: they build params directly | `custom-request.js:411` (textgen), `:601` (CC, `createGenerationParameters` without the emit) |
| `GENERATE_AFTER_DATA(generate_data, dryRun)` is main-`Generate()` only (not `generateRawData`). It fires before send with the same object | `script.js:5318`, send `:5393,:5449` |
| `GENERATION_STARTED(type, params, dryRun)` fires on every Generate, dry runs included; `generateRawData` emits none | `script.js:4299`; `generateRawData` `:4000-4120` emits only COMBINE_PROMPTS / CHAT_COMPLETION_PROMPT_READY |
| `OAI_PRESET_CHANGED_BEFORE({preset, presetName, settingsToUpdate, settings, savePreset, presetNameBefore})` hands a mutable `structuredClone` of the preset. Deltas apply in `.finally`, then `saveSettingsDebounced`, `OAI_PRESET_CHANGED_AFTER`, `PRESET_CHANGED{apiId:'openai'}`. The promise is not awaited by the UI path (`getPresetApplicationPromise`) | `openai.js:5020-5080`, `:5014-5016` |
| A CC preset carries `prompts`/`prompt_order` (+ connection fields when `bind_preset_to_connection`) and `extensions` | `openai.js:305,377-378`, `:5047-5057` |
| `/preset`: `getPresetManager()` for `main_api`; case-insensitive exact, else **Fuse fuzzy**; `waitForConnection` after a switch | `scripts/preset-manager.js:917-975` |
| `createWorldInfoEntry(_name, data)` ignores the name and mutates `data.entries` from the template; `deleteWorldInfoEntry(data, uid, {silent})` exists | `scripts/world-info.js:4137`, `:4043` |

## Design

### T16a — Objective line (extends plan 01's guidance block; no new registry key)

- **What:** one line, `Objective: <checkpoint.objective>` plus `objectiveClause(agency.objective_kind)` (`engine/agency.ts:26-29`). Plan 01 renders it inside **its** guidance block.
  - No player clause: the pacing hint already carries it (`steering.ts:24`).
  - No checkpoint names beyond the active one, no `reachableFrom`, no transition text. **C4: no look-ahead.**
- **Condition:** a pure predicate `objectiveLineApplies(story, checkpoint)` in `engine/` next to `agency.ts`. It returns true when `story.objective_block !== "off"` AND the active checkpoint authors no non-empty AN of its own:
  - `effects.author_note === undefined` (inherited), `null`, `""` or `{text:""}`, or
  - a generated beat (`merge.ts:24-31` gives it no effects).
- **Module:**
  - Plan 01's writer (`PacingCoordinator.updateSteering()`) appends the line to the `checkpointGuidance` text when the predicate holds.
  - When there is no guidance but the predicate holds, the block holds the objective line alone.
  - It refreshes on plan 01's existing call sites (boundary, activate, load, swap, rollback, settings; 01 §Guidance injection), so inv 16 holds without a new trigger.
  - Because the line rides the plan-01 block, it needs no new `INJECTION_REGISTRY` entry, no collision-allowlist row, and no second block. The next-turn preview (`runtime/nextTurn.ts`) sees it for free.
- **Invariants:**
  - 1: the predicate is pure engine.
  - 9: model-facing only; nothing is added to player copy.
  - 16: the plan-01 writer returns `WriteResult` (`extensionPrompts.ts:20`, working copy).
  - 22: no boundary work is added.
  - architecture.md "agency defaults ARE the policy": the clause comes from `agencyFor`.
- **Schema (rule 6):** story-level `objective_block?: "auto" | "off"`.
  - Absent means `auto`. This is an **explicit behaviour change under D7** (X14): it applies only where the checkpoint has no AN of its own, and it is recorded as such per rule 6.
  - Precedent: `scene_read.inject: false` (`validate.ts:548-557`).
  - `validate.ts` rejects any other value.
  - `storyDiff`: a new row **`story-objective-block-changed`** (X14), **compatible**, "Whether the objective line is added changed.", beside `stagecraft-changed` (`storyDiff.ts:224`), with a fixture per the table rule (`storyDiff.ts:4-5`).
  - `DIAGNOSTIC_CONSEQUENCES`: none needed for the switch (it is not a defect).
  - Studio control: a checkbox "Add the objective when a checkpoint has no author note" in the `StoryEditor` story panel, modelled on the scene-read inject box (`StoryEditor.tsx:182-183`), via `setStoryField` (`mutations.ts:120`). Copilot parity through the same op.

### T16b — AN-inheritance diagnostic

- **What:** a new code `checkpoint-inherits-author-note`, severity `info`. It fires for a checkpoint with `author_note === undefined` that is reachable from a checkpoint which authors one (`buildReachable`, `diagnostics.ts:85-100`).
  - Message: "plays under the note of <previous checkpoint>".
  - `DIAGNOSTIC_CONSEQUENCES`: "The model keeps being told an earlier checkpoint's note here." (no schema words; guard `diagnostics.test.ts:13`).
  - When `objective_block` is `auto` the message adds "the objective line is added"; when `off` it says it is not.
- **Scope:** static only. The runtime twin is the author driver panel line for generated beats ("generated beat, no note; objective line on/off"). It is snapshot-fed (inv 18) and author-only (inv 9).

### T17 — Curator hardening (pure `src/stagecraft/` + coordinator; inv 6 strengthened, never widened)

1. **Rewrite-length refusal.**
   - Add `CURATOR_SHOWN_CONTENT = 400` to `types.ts`, used by `prompt.ts:13`.
   - `previewCuratorOp` refuses `rewrite` when the whitespace-collapsed `entry.content.length` exceeds it: "only part of this entry was shown; propose a [patch]".
   - The prompt marks such entries `[shown in part — patch only]`.
   - The refusal sits in `previewCuratorOp`, so it binds at plan time **and** at the write edge (`stagecraftCoordinator.ts:291`), in `auto` too.
2. **uid addressing.**
   - `CuratorEntryView.uid` is filled by `entriesForScope`, and the prompt lists `#<uid> "title"`.
   - `findEntry` resolves in this order: uid, then exact unique title (case-insensitive, trimmed), then **drop** with a reason ("ambiguous: 2 entries titled X" / "unknown"). The `startsWith` fallback (`parse.ts:19`) is deleted.
   - `WiCuratorOp` gains `uid`.
   - New uid-addressed, **update-only** host functions in `stHost/worldInfo.ts`:
     - `readWIEntryByUid`;
     - `updateWIEntryByUid(lorebook, uid, {content?, disabled?})`, which returns `couldNot` on a missing uid and never creates (inv 16);
     - `writeOp` / `restoreBefore` use them. This closes the `upsertWIEntry` create-on-miss path for curator ops.
   - At the write edge the live entry's **current** comment is re-checked with `isCuratorWritable` (`scope.ts:24`), so a rename into a gated title is refused (inv 6, 14).
   - Legacy records without a uid keep today's title path, read-only for revert.
3. **Declined-op memory.**
   - Pure `declinedKeys(proposals)` over the per-chat ring: kind + `opTargetKey` + normalized text of `rejected` WI ops, since the active checkpoint was entered.
   - `planCuratorProposal` drops matches as `declined earlier`.
   - The prompt gets at most `CURATOR_MAX_OPS` lines "the author declined: [kind] title". The list is bounded (seed D).
   - It is derived from the ring, so a rollback that drops records drops the memory (inv 11). The ring is capped (`capProposalRing`, `types.ts:150`).
4. **Word diff on review cards.**
   - Pure `utils/wordDiff.ts` (word LCS, no dependency) over `record.before.content` (`proposal.ts:86`) vs `previewCuratorOp(editedOp).content`.
   - Rendered as `<del>`/`<ins>` **text nodes** (no `innerHTML`: CREC anti-pattern). The textarea draft recomputes the diff.
   - Author-only (inv 9), inside CSS roots (inv 19).
5. **Fuzzy anchors, review mode only.**
   - On an exact miss, `findSpanFuzzy`: a token window with normalized-Levenshtein similarity ≥ **τ = 0.8 per side**. τ is declared here, before any fixture is read.
   - It returns `{start,end,score}`, and the card shows the matched span and score.
   - **Accept rewrites `op.anchor` to the exact matched text**, so the write edge stays exact and re-previews identically.
   - `auto` never takes a fuzzy match (SUMMARY T17 verification: auto keeps today's tolerance).
   - Fixture floor, declared now: **0 false matches** on ≥10 anchor-absent negatives, and ≥10 shortened-anchor positives with the lift reported. Below 0 false matches, fuzzy is not built.

### F5 — curator `create` op: Phase A first (seed B; `v2.3/10-judge-seeds.md` §C)

- **Contract (only if Phase A passes):**
  - `{kind:"create", lorebook, comment, keys[], content}` is allowed only when:
    - the book is on `stagecraft.lorebooks`;
    - accept mode is `review`;
    - the entity is named in ≥1 **live** fact, supplied as an injected dep `establishedEntities()` like `warden.facts` so the coordinator stays memory-free (`architecture.test.ts:82`);
    - the per-chat count of live created rows is below `stagecraft.createCap` (default 5).
  - In `auto` a create is dropped with its reason; in `off` it is never shown.
  - Refused in code:
    - an existing title in the book (never a silent convert to edit: WREC anti-pattern);
    - a key equal to a roster name (it would fire every turn; T14 lesson);
    - empty keys.
  - Near-dup: char-trigram Jaccard (punctuation stripped) over title+content vs every allowlisted entry. **τ_dup = 0.85, declared now.** Top 3 are shown on the card as "may duplicate X". A warning, not a refusal.
  - Excluded from `decideProposal` bulk accept (`stagecraftCoordinator.ts:229`): one card, one accept.
  - Host: `createWIEntry` in `stHost/worldInfo.ts`, `WriteResult<{uid}>`, create-only, refuses an existing title, never creates a book (architecture.md "upsertWIEntry never creates a book").
  - Write-ahead + journal as for other ops (inv 6).
  - Revert on rollback (X21): **delete the entry by uid under compare-and-set** (content+keys unchanged since our write), via `deleteWorldInfoEntry` behind a new `WriteResult` host function. An entry edited meanwhile is **kept** and marked `externally-edited`.
  - Kept out of `decideProposal`'s bulk accept (X21).
  - Created rows live in `extras.stagecraft.created` (uid, book, messageId). The field is additive: it is sanitized in `extras.ts:151`, rollback trims it, and there is no blob bump (rule 3).
    - **It must also be added to `stripGlobalSettings`' persisted field list (`extras.ts:310`)** (X21), because that function copies stagecraft field by field. An unlisted field is never saved. A mutation check covers this.
  - Schema: `stagecraft.createCap?: number` (1–20), covered by the existing `stagecraft-changed` compatible row (`storyDiff.ts:224`). The Studio control is a number input in the `data-so="stagecraft"` panel (`StoryEditor.tsx:122`). No diagnostic is needed.
- **Phase A protocol** (X21: over the curator's model, i.e. the memory profile; not a judge use):
  - The fixture `test/fixtures/curator-create/*.json` has ≥20 cases with **≥8 Spanish**. Labels are frozen in the file **before any model answer is read**, which prevents the v2.3 plan-10 audit defect.
  - Positives (≥10): an entity established by ≥2 live facts with no entry.
  - Negatives (≥10):
    - named once only;
    - already covered under another title;
    - a roster member;
    - covered by a near-dup;
    - a scene with nothing new.
  - Run: new `scripts/debug/so-curator-suite.mts`, modelled on `so-live-suite`.
    - Real memory profile, pinned model recorded (`so-run-header`).
    - 3 samples per case; the parse and code validation are the shipped path.
    - Goldens in `test/goldens/live/curator-create/`, replayed deterministically in jest.
  - **Floor (declared before the run; from `10-judge-seeds.md:78-79`):**
    - ≥ **0.90** of should-propose samples yield a valid create card;
    - **1.00** of must-not samples yield none (end-to-end, after code guards).
    - Model-alone rates are reported, not scored.
  - Below the floor means **not built**, recorded with the numbers. `prompt.ts:40` "Never invent new entries" stays, and no floor is retuned (inv 7 spirit).

### Seed A — preset effect as a per-request sampler overlay (DECIDED: option A, built here; X20)

- **Contract:** a checkpoint `preset` is a sampler overlay on that checkpoint's **loud** generations. It never changes ST's selected preset and never writes install-wide settings.
  - This replaces `applyTextGenPresetRuntime` (`presets.ts:72-86`), a global write that is never restored (`effectsApplier.ts:47-50`).
  - **Inv 21 is reworded** from "preset effects are textgen-only" to "a preset is a per-request sampler overlay".
  - The `PRESET_UNSUPPORTED_REASON` refusal (`presets.ts:41`) goes, except for backends that fire neither hook (kobold, novel, horde), which keep a reasoned refusal.
- **Seam:** a new `stHost/samplerOverlay.ts` (inv 2) holds the active overlay: a resolved sampler map plus checkpoint id, per chat, set by `EffectsApplier` on activate and hydrate, and cleared on leave.
  - It needs no host write and no ledger restore. It records an audit row, `applied` per generation, in the effect ledger (inv 16 spirit: no silent effect).
- **Textgen hook:** `GENERATE_AFTER_DATA(generate_data, dryRun)` (`script.js:5318`): main `Generate()` only, the same object sent at `:5393,:5449`.
  - It applies only when `dryRun !== true` AND plan 01's T6 tracker says this is the **outermost** loud generation (not `quiet`/`impersonate`).
  - `TEXT_COMPLETION_SETTINGS_READY` is **not** used: it also fires for foreign `generateRawData` quiet calls and carries no `type` (`textgen-settings.js:1844-1848`, `script.js:4063`).
- **Chat-completion hook:** `CHAT_COMPLETION_SETTINGS_READY(generate_data)` (`openai.js:3146`). It applies when `generate_data.type` is a loud type AND the T6 tracker agrees (`generateRawData` quiet uses type `quiet`, `script.js:4077`).
- **Key rules:**
  - Overwrite only sampler keys **already present** in the payload. This respects ST's per-model deletions (`openai.js:3095-3120`); re-adding a deleted key would draw HTTP 400.
  - Never touch `messages`, `prompt`, `stop`, `model`, `chat_completion_source` or any prompt-manager state.
  - Map key names per backend (textgen `temperature`/`top_p`/`repetition_penalty`… from `createTextGenGenerationData`; CC `temperature`/`top_p`/`frequency_penalty`/`presence_penalty`) in a pure table under `src/utils/`.
  - Unknown authored keys are reported, not sent.
- **Unaffected:** Connection Manager memory/curator calls fire neither hook (`custom-request.js:411,601`).
- **Author visibility:** the next-turn preview shows the overlay (a row "Sampler overlay: temperature 0.7…", author-only, inv 9). Plan 08 T19 builds on that row.
- **Invariants:**
  - 2: new stHost seam.
  - 5: synchronous mutation, no waits on the reply path.
  - 10: the overlay is keyed by chat id and ignored when the open chat differs.
  - 11: rollback re-applies through `reapplyCheckpoint`.
  - 13: no install-wide write remains.
  - 21: reworded.
- **Schema:** unchanged (`effects.preset` string or `{name, settings}`, `resolvePreset` `effectsApplier.ts:83-92`). A string name is resolved from `tgPresetObjs` (textgen) or the CC preset list at **activation**, never through `/preset`.
  - Studio `EffectsEditor` note: "applies to this checkpoint's replies only; your selected preset is untouched".
  - Migration: none. Old chats with a leaked global preset are left alone. The journal notes the first overlay apply.
- **Never** copy the `Object.assign(oai_settings, …)` swap (rewrite-extension anti-pattern), and never use `/preset` (a fuzzy match, `preset-manager.js:917-975`).

## Order of work

1. **Prerequisites (plan 01):** the `checkpointGuidance` block, the T6 outermost-loud-generation tracker, the over-steer probe (X8), and `host-facts.md` (X9) have all landed.
2. T17.1–T17.3 (pure + the uid host seam), with jest and mutation checks.
3. T17.4 word diff + T17.5 fuzzy fixture (build only past its floor), with stories.
4. T16b diagnostic, then T16a schema + predicate + the hook in the plan-01 writer + Studio control.
5. Sampler overlay (X20): seam, both hooks, retire `applyTextGenPresetRuntime`, preview row, inv 21 reworded in `.claude/rules/architecture.md` and `_baseline.md` §2.
6. F5 Phase A: label the fixture, then one live run, recorded. **Build only past the floor**, then the J8 checks.

## Tests and gates

- **Jest:**
  - `objectiveLineApplies` table (own AN / inherited / null / empty / generated / `off`);
  - the `story-objective-block-changed` row fixture; the validator rejects a bad `objective_block`;
  - the diagnostic plus its consequence guard;
  - parse: uid / ambiguous / prefix now dropped;
  - `previewCuratorOp` rewrite refusal at the write edge; `declinedKeys` + rollback drop;
  - `wordDiff`; the fuzzy fixture; `updateWIEntryByUid` never creates;
  - overlay: key map, present-keys-only, quiet/dry/nested skipped, wrong-chat skipped;
  - the typed-results guard for the new host functions (`typedResults.test.ts`);
  - ownership census rows for any new write-after-await (`test/findings/ownership-sites.json`);
  - F5 goldens replay (if built).
- **Mutation checks, one at a time, each failing only its own case:**
  - remove the length refusal;
  - restore the `startsWith` fallback;
  - skip the declined filter;
  - let `auto` take a fuzzy match;
  - let `updateWIEntryByUid` create;
  - overlay: re-add a key the payload lacked;
  - overlay: apply on quiet;
  - (F5) drop `created` from `extras.ts:310`;
  - (F5) allow a create in `auto`;
  - (F5) allow a create through bulk accept;
  - (F5) delete an edited entry on revert.
  Records go in `test/findings/mutations/`.
- **Storybook:**
  - `StagecraftPanel`: `DiffOnPatch`, `RewriteRefusedPartialView`, `FuzzyAnchorShownSpan`, `DeclinedDropped`, (F5) `CreateCardNearDup`;
  - `StoryEditor`: `ObjectiveBlockOff`;
  - `DiagnosticsPanel`: `InheritsAuthorNote`.
  Each has interaction + a11y (`test-storybook:ci`).
- **Over-steer probe:** plan 01's probe (X8), reused. It runs on a generated beat (objective line on) against a control with `objective_block: off`, on the real model. The next reply must not restate the objective line or narrate the objective as achieved.
- **Live (real LLM, headed, `--strict`):**
  - the objective line appears in a captured request on a generated checkpoint and is absent on an authored-AN checkpoint;
  - **overlay:** a captured request carries the overlaid sampler values on a textgen profile **and** on a chat-completion profile. The selected preset name and the settings file are unchanged after the turn (read back), and a memory-model request in the same turn does not carry them;
  - **J8 ×2 consecutive** with the curator on (uid ops, a declined op not re-proposed, a diff card);
  - F5 (if built): positive check first, then the negatives; a run whose positive never fires is `blocked`;
  - `so-run-header` diff around every batch;
  - `so-assets assert-clean`.
- **Machine gates:** `npm run typecheck && npm run typecheck:test && npm run lint && npm test && npm run build && npm run test:release && npm run test:debug`, then `st-session.mts reload`.
- **Records:** `test/journeys/records/v2.4-plan06/`.

## Risks

- **An AN that refers to the objective without restating it** ("see objective") reads as "own AN", so the line is not added. The diagnostic's message covers this case.
- **uid churn:** an author's delete/recreate in the ST editor changes the uid. A pending proposal then drops as "unknown", which is correct but noisy.
- **Declined memory hides a legitimately re-needed change** until the checkpoint changes. This is accepted.
- **F5 revert deletes an entry.** It is gated by compare-and-set and journaled, and an edited entry is kept.
- **F5 `created` on a v2.3 downgrade:** v2.3's sanitizer drops the field and the cap resets. This is accepted and not a bump (rule 3).
- **Overlay:**
  - It depends on plan 01's T6 tracker being right, or a foreign nested `Generate('quiet')` takes the overlay.
  - A third-party extension that also mutates the payload at the same event wins or loses by listener order.
  - A user who relied on the old leaking global preset sees their own preset again outside the checkpoint. That is the intended change, and it is journaled.

## Unresolved questions

None open. Seed A (X20) and the F5 revert (X21) are decided in the overview.

## Gate record

_Placeholder: date, commands and exact output, mutation table, Storybook counts, over-steer probe
verdict, overlay live captures (textgen + chat completion + preset read-back), J8 ×2 matrices, F5
Phase A numbers vs floor (or "not built")._

### Build (worktree, 2026-09-25)

Branch `worktree-agent-a129903dbe5e68430` on `e4d69db`. Commits: `eb6a742` (T17), `148e576` (T16), then the sampler overlay + F5 Phase A instruments + live fixtures + this record. **No live gate ran** (brief: build only). Every live item below is NOT green until it runs on the real model.

**As built**

| Item | State | Where |
|---|---|---|
| T17.1 rewrite-length refusal | built. An entry longer than `CURATOR_SHOWN_CONTENT` (400) is shown collapsed and marked `[shown in part — patch only]`; `previewCuratorOp` refuses a rewrite of it at plan time and again at the write edge | `stagecraft/types.ts`, `prompt.ts`, `proposal.ts` |
| T17.2 uid addressing | built. Entries are named `#uid` (`#<book>.<uid>` when two books share a uid) or an exact unique title; the `startsWith` fallback is gone and an ambiguous title is dropped with its count. Every write is ONE `updateWIEntryByUid` (update-only, keeps the entry's own `disable`, read back from the server, never creates); `writeOp` reads the live entry by uid, fails an entry that is gone, and re-checks `isCuratorWritable` on the LIVE title (a rename into a gated title is refused) | `stagecraft/parse.ts`, `scope.ts`, `stHost/worldInfo.ts`, `stagecraftCoordinator.writeOp` |
| T17.3 declined memory | built. Ops the author rejected at this checkpoint since `checkpointStartedBoundary` are listed in the prompt (capped) and dropped as `was declined earlier` if proposed again | `proposal.ts` `declinedOps`, coordinator `runCuratorPass` |
| T17.4 word diff | built. `utils/wordDiff.ts` (LCS, whitespace kept, 250k-cell bound, whitespace between two changes coalesced so a phrase change reads as one del + one ins); the card diffs against the live draft (`data-so="curator-diff"`, text nodes only) | `StagecraftPanel.tsx` |
| T17.5 fuzzy anchors | built (floor held). `test/fixtures/curator-fuzzy/anchors.json`: 12 positives / 12 negatives, 0/12 false matches, lift 12/12. Review mode only; accept rewrites the anchor to the exact matched text | `stagecraft/fuzzy.ts` |
| T16a objective line | built. `objective_block?: "auto" \| "off"`; `objectiveLineApplies` = not off, non-empty objective, and the checkpoint authors no note of its own; the line rides the plan-01 guidance block (`composeGuidanceBlock`) | `engine/agency.ts`, `pacing/guidance.ts`, validate/storyDiff/copilot/Studio/driver |
| T16b diagnostic | built. `checkpoint-inherits-author-note` (info) with its consequence | `studio/diagnostics.ts` |
| Seed A sampler overlay (X20) | built. See below | `utils/samplerKeys.ts`, `runtime/samplerOverlay(.Host).ts`, `stHost/samplerOverlay.ts`, `effectsApplier.ts` |
| F5 create op | **NOT built**: Phase A not run live. The instruments are built: frozen fixture (22 cases, 9 Spanish, 11/11), candidate prompt + parser + code guards (`stagecraft/createCandidate.ts`, not wired into the coordinator), in-page `storyOrchestratorLiveSuite.runCuratorCreate`, `scripts/debug/so-curator-suite.mts`, golden replay in jest | |

**Sampler overlay.** `EffectsApplier.applyCheckpoint` disarms the overlay, then for a checkpoint `preset` resolves it at activation (a string: exact name from the connection's own preset manager, never `/preset`; an object: its inline `settings`), maps it through the per-API key table, and arms `samplerOverlay` keyed by chat + checkpoint, inside `withLedger` (one row per activation, `before: null`). Refused with a reason, `failed` row: a connection with neither hook (`OVERLAY_UNSUPPORTED_REASON`), a missing preset, a preset with no sampler the connection sends. Unknown keys are journaled. `samplerOverlayHost` writes it on `GENERATE_AFTER_DATA` (textgen) and `CHAT_COMPLETION_SETTINGS_READY` (CC) only for a loud request (T6 outermost open, not dry, innermost/type not quiet/impersonate, same chat, same API) and only over keys the payload already carries (`SAMPLER_OVERLAY_NEVER` guards messages/prompt/model/stream/…); the first apply is journaled. Leave/exit/restart disarm it; a preset row is neither restored nor reported as "left in place". `applyPreset`/`applyTextGenPresetRuntime`/`presetBackend`/`PRESET_UNSUPPORTED_REASON`/`readAppliedPreset` are retired; `effectHost` reads the overlay for reconcile. Payload tab: author-only `data-so="next-turn-overlay"` row via `snapshot.samplerOverlay`; `EffectsEditor` note `data-so="preset-overlay-note"`. Inv 21 reworded in `.claude/rules/architecture.md`, `_baseline.md` §2 and the gotchas v2.3-plan-06 bullet. Host facts 06-H1..H9 appended to `host-facts.md`.

**Decisions (mine, on evidence)**
- Entry ref `#uid`, or `#<bookOrdinal>.<uid>` on a cross-book uid collision (the plan said `#uid`; two books sharing uid 0 is the common case).
- Every curator write is a single uid-addressed update that keeps the entry's disabled flag; the upsert + re-disable pair and create-on-miss are gone. Legacy records without a uid keep the title path for revert only. The existing `readWIEntryAt` serves as the plan's `readWIEntryByUid`.
- Declined memory is scoped by `checkpointStartedBoundary`, so a decline on an earlier visit does not bind the next visit (M6 found this unpinned).
- Objective-block Studio checkbox: checked = absent (auto), unchecked = `"off"`. The plan-01 `guided` runtime fixture is pinned to `objective_block: "off"` so its assertions keep measuring guidance alone.
- Overlay: one ledger row per ACTIVATION, not per generation (a per-generation row would evict restorable rows from the 200-row ledger); the per-generation audit is the overlay view (`applied`, `lastApplied`, `lastSkipped`) plus the first-apply journal line. The overlay state lives in a pure runtime module; `stHost/samplerOverlay.ts` holds only the hooks and the preset read (the plan put the state in stHost; state is not host access).
- A string preset is looked up in the CONNECTION'S API's preset list only; a textgen preset name on a CC connection is a refusal, not a cross-API guess.
- F5 Phase A candidate path is a standalone pure module plus a live-suite handle; nothing reaches the coordinator, the prompt the shipped curator sees, or any lorebook.

**Deviations**
- Plan table "(F5)" mutations not run: the op is not built.
- Plan's Storybook `CreateCardNearDup` not built (F5 not built).
- J8 ×2 is a new scenario `live-v24-06-curator.json` (J8-style), not an edit of `j8-stagecraft.journey.json`.
- The "generated checkpoint" arm of the objective live check uses an authored checkpoint without a note (`cp-bare`): the predicate is identical (no own note), and plan 01's `live-v24-01-guidance-generated.json` already covers the generated-merge path.

**Gates (worktree, exact)**
- `npm run typecheck` 0 · `npm run typecheck:test` 0 · `npm run lint` 0 · `npm run debug:typecheck` 0
- `npm test`: 240 suites / 3536 tests passed (architecture, ownership census, fault matrix and typed-results guards included; manager 737/740, memoryCoordinator 619/620, stagecraftCoordinator 552/620, untouched by the overlay/F5 work)
- `npm run test:debug`: 258 tests, 257 pass, 0 fail (1 skipped). A first run before `npm run build` failed `so-run-header` "reads plan 08s nested manifest" because the worktree had no `dist/manifest.json`; green after the build.
- `npm run build`: compiled, 2 size warnings (pre-existing); manifest `ST unknown` (worktree is nested, not under an ST root).
- `npm run test:release`: 20/21, the one failure is "the host section names the SillyTavern it was built against" — the same `ST unknown`, environmental to a nested worktree.
- Storybook: `storybook:build` 0; `test-storybook --index-json --url http://127.0.0.1:6348 --maxWorkers 1` 32 suites / 225 tests passed. The first run failed `StagecraftPanel` `DiffOnPatch` and `FuzzyAnchorShownSpan` (both from the T17 commit): the diff interleaved single-word del/ins runs across unchanged spaces. Fixed in `wordDiff` (coalesce), red test first, M34.

**Mutations**: `test/findings/mutations/v24-06-steering-stagecraft.txt`. 34 mutants, all applied, all killed after one fix: M6 (declined memory ignoring the checkpoint boundary) survived the first sweep and is killed by a new coordinator test. Plan-table rows: M1, M2, M4, M7, M11, M20, M21.

**Live fixtures written, NOT run** (schema-valid via `scenarioSchema.test.mts` 17/17, every eval compiled with the runner's wrapper):
- `test/scenarios/live-v24-06-objective.json` (+ `live-v24-06.story.json`): objective line on `cp-bare`, absent on `cp-noted`; over-steer family `objective` against the `cp-noted` control reply.
- `test/scenarios/live-v24-06-objective-off.json` (+ `live-v24-06-off.story.json`): control, `objective_block: off`.
- `test/scenarios/live-v24-06-overlay.json`: run ×2 on a Text Completion AND ×2 on a Chat Completion main profile; overlay values in the loud request, selected preset + settings file read back unchanged, a real memory read without the overlay, disarm on `cp-bare`.
- `test/scenarios/live-v24-06-curator.json`: J8-style ×2, real curator in review mode: uid on every op, diff card for text ops, a declined op listed in the next prompt and never reaching a card again, partial-view entry never rewritten; restores the curator settings; `so-assets` removes `SO-V2406`.
- F5 Phase A: `node scripts/debug/so-curator-suite.mts run --record --expect-count 22` (capture a run header first). Build the create op only if it clears propose ≥ 0.90 and none = 1.00.

**Remaining**: all live gates above (headed, `--strict`, run-header diff around each batch, `so-assets assert-clean`), then F5 Phase A and, only past its floor, the F5 build + its four mutations + `CreateCardNearDup` + the J8 create checks.

### Live gates (2026-09-25, bundle 56f299a98ea5)

Lane 1 only (ST :8101, CDP 9301, lane browser headless), Artemis 31B Q4_K_M via `127.0.0.1:18080`. Main profile `Artemis RunPod RP` (llamacpp, Text Completion); memory profile `Story Orchestrator Memory RunPod`; curator role on "Same as memory model" (no per-role route set). Before every batch: `st-session reload`, `open-group 1759606632088`, `/profile Artemis RunPod RP`, served `dist/index.js` sha checked against the manifest. Records: `test/journeys/records/v2.4-plan06/live-56f299a98ea5/` (green set) and `live-48816ebec4fc/` (the first pass, which found the fixture faults and the defect below).

Started on 48816ebec4fc. The fix below was rebuilt to **56f299a98ea5** (logged in `.debug/bundle-change.txt`; the plan-08 agent built from the same tree within the same minute, and the bundle carries both changes). Every green record below ran on 56f299a98ea5.

| Gate | Text Completion | Chat Completion | Evidence |
|---|---|---|---|
| `live-v24-06-objective.json` ×2 | green, green | n/a | cp-bare guidance block carries `Objective: Find the brass key…`, cp-noted none; over-steer probe ok both runs (restate span 2/6, no meta hits, length ratio 1.14 / 1.22 vs the cp-noted control) |
| `live-v24-06-objective-off.json` ×2 | green, green | n/a | no request (3, 1 recorded) carries `Objective:` |
| `live-v24-06-overlay.json` ×2 | green, green | green, green | TC: the loud request on cp-overlay carries temperature 0.37 / top_p 0.83; `Artemis v1.1 RP` and the settings file (temp 1, top_p 1) read back unchanged; a real memory read (1 request) does not carry 0.37; cp-bare back to 1. CC: same, `type: normal`, preset `Default` + file (temp 0.9) unchanged, 2 memory requests clean, cp-bare back to 0.9 |
| `live-v24-06-curator.json` ×2 | green, green | n/a | uid on every op; a `rewrite` card shows the word diff; the decline lands and the second prompt carries `THE AUTHOR DECLINED` + the op; the long entry is marked shown in part; records `wi-4-4` then `wi-4-4-2` |
| `so-assets assert-clean --marker SO-V2406` | clean | | |
| `so-run-header` diff | 0 blocking (TC, after cleanup) | 0 blocking (CC) | `--allow build.head` (docs commits by other sessions), plus `build.manifest.builtAt/fileSha256` on TC (the plan-08 rebuild of the same bundle) |

Not exercised live: the "re-proposed op dropped as `was declined earlier`" branch. In four green curator runs the model never re-proposed the declined rewrite (it proposed a `disable` instead), so the drop path stays covered by jest only (`StagecraftCoordinator T17.3`).

**Chat Completion profile.** None existed on lane 1. Created on lane 1 only: `/api custom`, `/api-url http://127.0.0.1:18080/v1`, `/model <served gguf>`, `/profile-create SO-V2406 CC Artemis` (mode cc, preset `Default`). The first two CC runs failed on an empty reply, not on the overlay: the server log shows the request with temperature 0.37 / top_p 0.83, but llama-server applies the Gemma 4 thinking template on `/v1/chat/completions` and spends all 300 tokens on `reasoning_content` (reproduced with curl). Set `custom_include_body: chat_template_kwargs: {enable_thinking: false}` on lane 1, then ×2 green. Afterwards the profile was removed, `custom_url`/`custom_model`/`custom_include_body` put back to the install's values (read back from the settings file), and `/profile Artemis RunPod RP` re-selected. Run-header diff: 0.

**Product defect found and fixed: curator record ids collided within a boundary.** `runCuratorPass` named its record `wi-<boundary>-<lastMessageId>`, so two passes at one boundary (the fixture's decline-then-re-curate, or an author pressing Curate twice) produced two records with one id (`wi-2-2` twice on 48816ebec4fc). `updateOps` maps every record with that id, so accepting op N on the second card also flipped the first card's declined op N to `accepted`, and the declined write would land at the next boundary. It also made the fixture's "never on a card again" check vacuous, because it excluded the first record by id. Fix: `uniqueRecordId` suffixes `-2`, `-3`… (`stagecraftCoordinator.ts`). Red test first (`two passes at one boundary are two records: accepting the second never un-declines the first`); M35 (suffix loop disabled) killed by it, 1 of 222. Live: `wi-4-4` / `wi-4-4-2`.

**Fixture faults fixed** (`live-v24-06-curator.json`):
- The curator reads only the checkpoint and canon, never the chat, so the collapse on the `gorge` checkpoint gave it nothing to act on (`NONE … the existing entries remain relevant`). Now the author advances to `far-side`, whose objective states the collapse, before the pass (the `live-curator-write` pattern).
- The review cards live in the author-only Scheduler tab, so the `ui: stagecraft` step found no tab. The setup eval now sets `authorView: true` on the sandbox chat.
- A mid-run failure skips the fixture's own restore and removal steps. Both failures leaked `SO-V2406 Lore` (removed with `so-assets`).

**Environmental, not product:** lane 1's CSRF token went stale mid-batch (07:17 Z, curator run 2 on 56f299a98ea5: `ForbiddenError: Invalid CSRF token` in the lane server log). The runner's cleanup then got 403 on every save, leaving the sandbox chat, the story, `SO-V2406 Lore`, extraction cadence 50 and accept mode `review` behind. Cleaned by hand (setters + `so-library remove` + `/delchat` + `so-assets remove`), run-header diff back to 0, then the curator ×2 re-ran green.

**F5 Phase A** (`so-curator-suite.mts run --record --expect-count 22`, 22 cases × 3 samples, curator role = memory profile, run header `run-header-f5.json`, diff 0 after):
- End to end: **propose 1.000 (33/33)**, **none 0.879 (29/33)**. Floor: propose ≥ 0.90 AND none = 1.00. **Verdict: NOT BUILT.** No floor retuned; `prompt.ts` "Never invent new entries" stays.
- Model alone (reported, not scored): created on 100 % of propose samples, 12.1 % of none samples.
- Misses, both `named-once`: n01 (en) 1/3, a valid card `Garrick` (keys stall-keeper, bread); n07 (es) 3/3, a valid card `Paquito` (keys pastor, Paquito). Every other negative (covered, roster, near-dup, nothing-new) held 3/3.
- Observation for a later plan, not acted on: both misses are cases the contract's code guard admits by design (it needs ≥1 live fact naming the entity, while the prompt and the labels say "at least twice"). A ≥2-fact guard would be a new contract measured against a fresh frozen fixture, not a retune of this one.
- Goldens: `test/goldens/live/curator-create/` (22), replayed in jest (`createCandidate.test.ts`, green).
- F5 mutations, `CreateCardNearDup` and the J8 create checks are therefore not built.

**Machine gates after the fix (exact):** `npm run typecheck` 0 · `npm run typecheck:test` 0 · `npm run lint` 0 · `npm run debug:typecheck` 0 · `npm test` 256 suites / 3717 tests passed · `npm run test:debug` 273 / 273 pass · `npm run build` 2 size warnings (pre-existing), bundle 56f299a98ea5.
