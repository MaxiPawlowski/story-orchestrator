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
