# Retro live validation — plans 02–09 (2026-07-05/06)

Full browser-level re-validation of plans 02–09 with **real LLMs at every touchpoint**, as an end user: gemma4-31b-mtp as main connection (textgen `generic` @ `http://127.0.0.1:1235`) and as the extraction Connection Manager profile (`Story Orchestrator Memory Local`, repointed from the stale plan-05 `localhost:1234` backend). Motivation: audit showed every prior "live" gate used injected `debugResponse` mocks; the only real-LLM run in nine plans was plan 05's post-gate smoke. Policy now fixed in `.claude/CLAUDE.md` / debug skill / `00-implementation-overview.md`: real-LLM live gate is the default; flag explicitly when it cannot run.

## Verdict

All plans 02–09 **green after fixes**. The mocked gates had hidden **two ship-blocking correctness bugs** (boundaries never committed in group chats under real generation; extractor first line always lost with reasoning-token models) plus one contract-tolerance gap and one generation-quality gap. All but the last fixed in this pass.

## Bugs found & fixed

| # | Severity | What | Fix |
|---|---|---|---|
| B1 | **critical** | `TurnBridge` counted `generation_started`/`generation_ended` as a ±1 depth pair. In group chats ST fires started **1 + once per drafted member** (outer `Generate` → `generateGroupWrapper` → inner `Generate`, `script.js:4324` / `group-chats.js:1063`) but ended **once** (`hideStopButton` NOOP guard, `script.js:3510`). Depth stuck ≥1 after the first round → **no boundary ever committed under real group generation** — the core loop was dead for the primary chat type. Never caught: mocked gates drove state via `/cp set` + `runExtractionNow` (which commits internally). | `turnBridge.ts` rewritten: no depth counter; pending-boundary flag + `isHostGenerating()` (new `stHost/generation.ts` → `script.js` `isGenerating()`) + bounded 300 ms flush poll. 5 new unit tests (`turnBridge.test.ts`). |
| B2 | **high** | gemma4-31b-mtp prefixes output with reasoning-channel tokens (`<|channel>thought\n<channel|>DELTA …`). Strict parser rejected the glued first line — **first directive of every extraction lost** with this model class; `player_has_key` was extracted correctly and discarded. | `parse.ts`: strip leading `[\d+]` / `<…>` token prefixes per line before matching. Test added. |
| B3 | medium | gemma sometimes emits bare `quality=value evidence="…"` lines without the `DELTA q=` prefix (after a contradictory `NO_DELTA`); with cadence 2 one sloppy response stalls a quality for 2+ boundaries. | `parse.ts`: lenient fallback accepts bare lines only when the key is a known story quality and evidence present. Test added. |
| F1 | finding (open) | Plan-05 generation quality: gemma produced a beat outcome gate `key_found == false` while `key_found` was latched `true` — structurally valid, semantically unwinnable; code check + critic pass it. Surfaced when the plan-06 drift run stalled on it (which the reconcile loop then correctly detected — see 06). | **Not fixed.** Recommend plan 10+ add a code check: outcome gates must not contradict latched values. |

Tooling fixes (blockers for any live work): shared-session attach kept the Chromium default 784×449 viewport (1920×1080 only applied to *new* contexts) → pinned-open drawers cover the recent-chats list → `st-navigation` dead — this is what blocked plan 09's post-review re-validation. Fixed in `lib/connection.mts` (enforce viewport on attach) + `st-navigation.mts` (`closeUnpinnedDrawers` mirroring ST's own auto-close). `so-scenario.mts` gained tolerant wait verbs for real-model nondeterminism: `acceptedDelta`, `reconciliationEvents`, `memoryEntries`(+`memoryTier`), `arcsSummarized`, `canonPresent`.

## Per-plan results (all real-LLM unless noted)

| Plan | Scenario / checks | Result |
|---|---|---|
| 02 | `live-plan02-runtime.json` 13/13: real group rounds (`send_generate`, Arin + DM Narrator both drafted across rounds) → boundary commits (after B1); `/cp` commands; scripted NPC `onEnter` maxTriggers=1; AN effect + `inject_blackboard` rendered in the **captured real generation payload** (`st-payload`), no `{{story_blackboard}}` leak; real llm-kind NPC reply (`plan03a-llm-npc-reply.json` 4/4 re-run, real generation); delete of a no-state-change tail correctly no-ops rollback (03a fast path). | PASS |
| 03/03a | `live-plan03-extraction.json` 13/13, fully real: cue (`cue:start->door` P0, trigger matched in a real reply) + cadence (P1) shared reads on the gemma profile → strict parse (after B2/B3) → accepted delta → apply-queue drain at next boundary → transition fired, `player_has_key` latched. Two degenerate model responses ("own own own…" loops) were rejected + audited without wedging the scheduler. Rollback after a real accepted delta: deleting the boundary message rolled boundary 3→2, checkpoint door→start, unlatched the quality, pruned audits ("Rolled back to boundary 2"). | PASS |
| 04 | `live-plan04-pacing.json` 20/20: real tension deltas across escalating exchanges → EMA at boundary → `story_orchestrator_pacing` prompt injected (pos 1 / depth 2 / role 0, non-empty). Payload-level proof of the `extensionPrompts` channel done in plan 07's check (same mechanism). | PASS |
| 05 | `live-plan05-expansion.json` 8/8 first try: real scaffold JSON generation + real critic call (verdict raw: ` ```json {"pass":true,"issues":[]}``` `) → cache insert → runtime merge → intermediates traversed. See F1 for the quality gap. | PASS |
| 06 | Real expansion on the drift story; 9 real drift exchanges; stall detected (turns ≥ max(ceil(4×1.5),6), `reconcile:key_found`) → **real targeted read** window 1–13 → honest `NO_DELTA` → event resolved with empty evidence (correct). Deterministic `plan06-convergence.json` 22/22 re-run as regression after B1–B3. `live-plan06-convergence.json` committed for repeat runs (traversal tail dropped — real generated gates vary per run). | PASS |
| 07 | Deferred re-run `plan07-memory.json` **23/23** via script runner. `live-plan07-memory.json` 12/12: real MEMORY/FACT tier writes from cadence reads; real P2 scene-summary pass (10.5 s gemma call) → `scene_history` entry; sceneBreak scripted NPC reply; facts injection active; **real extracted facts confirmed inside the captured generation payload**. | PASS |
| 08 | **Deferred story-loaded P4 chain shipped + proven**: `plan08-hygiene.json` 10/10 — live embedding dedup (dropped 1/confirmed 1 on ST vectors), marker-based supersession, **real gemma supersession-bridge DELTA** (`vault_status=breached`) enqueued → next real boundary fired start→breach, WI write + `loadWorldInfo` round-trip, lorebook deleted in cleanup. First run failed on the same-topic band (cosine < 0.55) — fixture texts tightened; classifier itself behaved correctly both times. | PASS |
| 09 | Deferred re-run `plan09-arcs.json` **9/9** (the plan-09 gate-record blocker was the viewport/drawer tooling bug, now fixed). `live-plan09-arcs.json` 10/10 via the real scheduler P4 lane: arc resolved → scheduled arc-summary pass (real) → canon synthesis (real) → `{{story_canon}}` resolves. First attempt raced the async P4 lane by calling `runArcSummaryPass`/`regenerateCanon` directly (`canonInFlight` short-circuit) — scenario now waits on the lane like a real session. | PASS |

## Model-behavior notes (gemma4-31b-mtp via `generic` textcompletion)

- Reasoning-channel tokens leak into `content` (`<|channel>thought`, `<channel|>`) — handled by B2.
- Occasional full degeneration (token loops) at extraction sampling (temp 0.1) — parser/audit/scheduler absorb it; a retry at the next cadence boundary recovered every time.
- Format compliance otherwise good: DELTA/FACT/MEMORY emitted with usable evidence; arc/canon/scene prompts produced coherent output; critic JSON valid.

## Harness gates (after all fixes)

`npm run typecheck` ✓ · `npm run lint` ✓ · `npm run debug:typecheck` ✓ · `npm test` ✓ 21 suites / **1192 tests** (+7: 5 TurnBridge, 2 parser) · `npm run build` ✓.

## Environment / cleanup notes

- Extraction profile `afcc7073-3510-4f67-8070-35ce449d4792` updated in place: `api generic`, `api-url http://127.0.0.1:1235`, `model gemma4-31b-mtp` (intended persistent change).
- Extraction settings are per-chat (`extras.extraction.settings`, default disabled/no profile) — every live scenario sets them via an `eval` step; end users set them per chat in the settings panel.
- Group `disabled_members` verified unchanged (Luke/Ponticius were disabled before this session; plan-07 scenario re-enabled what it disabled). Sandbox chats deleted; imported test stories removed; hygiene lorebook deleted. Pre-existing library entries (`Debug Cast`, `Pacing Gate Check`, `Restore Cast`) left untouched — older-session leftovers, not created here.

## Files changed

- `src/runtime/turnBridge.ts` (+`turnBridge.test.ts`), `src/services/stHost/generation.ts`, `src/services/STAPI.ts` — B1
- `src/extraction/parse.ts` (+2 tests in `extraction.test.ts`) — B2, B3
- `scripts/debug/lib/connection.mts`, `scripts/debug/st-navigation.mts`, `scripts/debug/so-scenario.mts`, `scripts/debug/README.md` — tooling
- `test/scenarios/live-plan0{2,3,4,5,6,7,9}-*.json`, `test/scenarios/plan08-hygiene.json` — real-LLM gate scenarios
- `.claude/CLAUDE.md`, `.claude/skills/debug/SKILL.md`, `.claude/rules/debug-scripts.md`, `.claude/rules/architecture.md`, `docs/plans/v2/00-implementation-overview.md` — policy (real-LLM gate default, `LIVE=1` marked not implemented until plan 13)

## Open items for plan 10+

- F1: expansion code check should reject outcome gates contradicting latched blackboard values.
- `LIVE=1 npm test` re-record path still unimplemented (docs corrected); lands in plan 13.
- Cue scan (`scheduleForcedCues`) only reads the last message at boundary time — a user-message trigger only fires if the reply echoes it; consider scanning the boundary window.
