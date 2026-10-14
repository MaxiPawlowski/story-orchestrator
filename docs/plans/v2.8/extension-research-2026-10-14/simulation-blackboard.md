# Simulation Blackboard — 2026-10-14 harvest
meta: https://github.com/st1ksi/Extension-Blackboard · head `561506e` (single import, v1.12.1) · **AGPL-3.0: ideas only, no code** ·
read: index.js, state.js, transaction.js, review.js, issue-ledger.js, private-runner.js, private-host.js, private-api.js, recovery.js (head),
setup-gate.js (head), turn-instructions.js, tool-journal.js, prompts/systems/compact-base.md (Ultra v6), README, CHANGELOG, manifest ·
skipped: inspector/dashboard/panel UI, dice.js, D&D profile prompts, lower-tier prompts (derived from Ultra), tests · prior review: none (new repo)

## What it is / what changed
- Single-character Chat Completion extension. One markdown "Objective Blackboard" per chat (`[CATEGORY #id]` blocks: SCENE, ENTITIES,
  NARRATIVE, LORE, MISC) injected into the system prompt; the reply model edits it through a function tool `UpdateBlackboard`
  (upsert/delete/replace_all) during its own generation.
- Core idea is a prompt doctrine, not code: prepare reality before contact (the "N−1 law"), detail allocated by "contact distance",
  closed contents, root truth ≠ plot, every trace has an author, deterministic off-screen processes on an absolute clock.
- Optional **Private Turns**: the extension takes over generation, stages board revisions in a draft, runs 4 audit aspects
  (time/actors, facts/resources, reachable space, final answer) as detect → repair → verify with an issue ledger, and publishes only
  a passing candidate. Single-character only; ≥ 5 requests per turn; no streaming.
- Board snapshots ride `message.extra` and `swipe_info[i].extra`; restored on swipe/delete/regenerate/chat change.

## How it works
- **Tool + validation.** Schema `index.js:369-394`; handler `:352-364`. `applyUpdate` (`state.js:199-236`): unique block ids,
  `replace_all` refused if it drops any existing block (`:212`), empty upsert refused, model cannot delete the progression ledger
  (`:170-177`). Invalid batch leaves board intact. Pure module (`state.js:1`).
- **Doctrine** (`prompts/systems/compact-base.md`): §2 contact-distance ladder across six vectors (spatial, temporal, social,
  informational, capability, causal) with resolution per distance 0–4+ (`:28-53`); N−1 law: everything at distance 1 at turn end is
  fully collapsed before the player replies (`:48`); promotion may only add detail compatible with the skeleton (`:49`). §3 capability
  layers only for abilities the player has (`:57-66`). §4 root truth records what is true, never what the player will do; NPC beliefs
  stored apart from truth (`:70-75`). §5 every trace has a committed origin (`:79-83`). §6 closed contents: complete lists at
  distance 1–2 can never gain items on a search or a good roll; missing detail is committed before a dependent roll, never after
  (`:87-92`). §10 Psyche + knowledge/beliefs/prepared lies committed before questioning; no "if X then Y" scripts (`:150-157`).
  §15 calibration example: the nervous innkeeper with a bloody apron stays innocent whatever the player suspects (`:216-225`).
- **Process register** `MISC #simulation_processes` (fenced JSON) with mechanical checks (`transaction.js:24-41,73-91`): owner must be
  an existing block; active/blocked `accounted_through == through`; `next_at <= through` = unresolved deadline error; closed process
  needs `next_at: null`; an active process cannot vanish (must be closed first); clock never moves backwards; world_clock and register
  share one absolute time.
- **Monitor** injected each prompt (`index.js:176-203`): size vs corridor directive (COLD START / UNDER-BUDGET / ABOVE CEILING) and
  STALE blocks (user turns since content changed, `state.js:238-253`).
- **Rollback**: pre-action snapshot stamped on `MESSAGE_SENT` (`index.js:927-931`), post-state on `MESSAGE_RECEIVED` and
  `TOOL_CALLS_PERFORMED` (`:948-962`); on swipe/regenerate `GENERATION_STARTED` restores the turn-start snapshot so tool effects
  cannot apply twice (`:940-947`); delete/swipe walk back to the nearest snapshot (`:302-318`, `state.js:276-282`). Per-swipe
  snapshot in `swipe_info[swipe_id].extra` (`state.js:284-294`); an ungenerated swipe (`swipe_id >= swipes.length`) gets no snapshot;
  a multi-swipe message without its own snapshot never inherits another alternative's (`state.js:264-274`).
- **Private Turn host** (`private-runner.js:155-336`): manifest `generate_interceptor`; calls `abort(true)` before any await
  ("ST catches interceptor exceptions", `:210-212`), builds the real prompt by a dry-run `generate(type, opts, true)` captured from
  `GENERATE_AFTER_DATA` (`:250-258`), sends its own non-streamed requests via `createGenerationParameters` + emitting
  `CHAT_COMPLETION_SETTINGS_READY` (`private-runner.js:396-441`), publishes with `ctx.saveReply` (`:297`). Staleness guard: history
  fingerprint + same metadata/chat object + same connection settings (`:221-229`); `GENERATION_STOPPED`/`CHAT_CHANGED` cancel.
- **Transaction** (`transaction.js:98-403`): serializable state machine, checkpoint saved before and after every request (IndexedDB,
  Web Locks per chat). `UpdateBlackboard` gains a required `base_revision` in private mode (`private-runner.js:413-417`); a stale
  revision is refused (`transaction.js:59`). Non-repeatable tool (dice) records `inFlightTool` before invoking; an uncertain outcome
  blocks automatic replay on resume (`:239,334-349`). Budgets: 16 staging steps, 48 requests, 4 repairs, 2 per aspect (`:192,243,302`).
- **Review** (`review.js`): per-aspect targets generated from the diff (owner bundles per actor/process, changed-block targets,
  removed-line cues, reachable scene targets, `makeAudit` `:60-105`). Reviewer returns JSON with checks + exact-quote evidence;
  `validateEvidence` verifies every quote exists in the cited source/revision and that each target's `required_evidence` is cited
  (`:189-197`); pending issues must each get open/resolved/rejected; "resolved" without a changed board/candidate is refused
  (`:199-234`). After a repair, approvals of affected aspects are invalidated by changed blocks and stale candidate quotes
  (`:130-144`). Issue ledger keeps stable ids across invalid reports (`:237-295`).

## Patterns for SO

### P1. Prepare facts before contact (N−1 law, distance-scaled depth) — feature · memory/living · absent · value 4 · effort L
What: before the player can touch something (a drawer, an NPC's knowledge, who left a trace), a pass commits it as a checkable datum,
including the NPC's prepared lie; depth falls with distance (dist 1 full, dist 2 skeleton, beyond: role + agenda). Later turns
collide with it instead of inventing. Theirs: `compact-base.md:28-53,70-92,150-157`.
Our state: everything about the unvisited world is either authored (lorebooks, checkpoints, `life` agendas/schedule
`engine/lifeSchema.ts:31-75`) or extracted after it was narrated (`memory/contract.ts:33-45`). The living director prepares the
**graph** ahead (one anchor, `generation/living/frontier.ts:33-44`; one-checkpoint prefetch, plan 22 §prefetch), never world facts.
Plans 42–59: none prepares facts (52 codex = what is already known; 49 = authored pool; 55 = authored commitments).
Fit: off-path, at a boundary, never in the reply (Artemis is Text Completion; no tool calls in the play reply). Fits as one more
`boundaryWork` entry or a section of the shared read on the memory role, with a `RunToken`. Prepared rows = held facts by default:
`[prepared] Subject | datum` with a holder (the member it belongs to, or the narrator role); rendered only into that drafted member's
private block, kept out of every shared tier (secrets invariant holds if they go through `HeldSecret`/`withoutSecretLines`); never to
WI (epistemic-to-WI ban). Derived artifact with `inputs/range`, so rollback ≡ replay. Distance = present members + the location
quality + `reachableByCheckpoint` (graph distance), not physical radius. Player surfaces unchanged. No thinking/inner-voice impact.
Risk: an extra call or a bigger read per boundary; model over-prepares (their corridor/monitor exists for this); a prepared row that
the reply never uses is noise in the private block. Measure first (P4).
Sketch: v2.8 candidate plan "prepared facts": A authored `prepare:` hints per checkpoint/location (what must be fixed before
arrival: container contents, who knows what, the culprit) filled by the memory model when the checkpoint enters distance 1;
B emergent (the read proposes rows for named-but-unvisited things in the window). Floors: P4 agreement; secrets payload goldens 0 hits.

### P2. Closed lists and "commit before the roll" — pattern · warden/chance · partial · value 3 · effort S (after P1)
What: a list marked complete (container contents, vendor stock, carried items) cannot grow on a search or a success; a genuinely
undefined detail is fixed before a dependent outcome, never after seeing it. No retroactive wards, reinforcements, rescues
(`compact-base.md:87-92`; reviewer "reach" aspect enforces it with revision history vs dice `at_revision`, `review.js:12-15`).
Our state: chance is seeded and happens before the reply (`runtime/chance.ts`); the continuity warden flags contradictions with
established facts (`stagecraft/warden.ts:112-129`, `judge/warden.ts:262-280`), but has no notion of "closed": an addition to a list
is not a contradiction.
Fit: a `closed: true` flag on a prepared (P1) or authored fact turns "a new item appeared" into a warden continuity finding. Warden
note stays the carried next-turn note (no blocking; judge invariant intact). Only worth it with P1.

### P3. Root truth vs player itinerary, as an authoring/director rule — pattern · director/wizard prompts · partial · value 3 · effort S
What: record what is true and how it can be resolved ("the contract dies only with the original dagger"), never what the player will
do; every approach collides with the same truth; a genuinely new branch creates new truth consistent with canon
(`compact-base.md:70-75`).
Our state: the agency policy refuses narrated compliance (`engine/agency.ts`), the director writes routes/gates; nothing asks the
director or wizard to separate a hidden truth from the route. Living director ops are graph ops (`generation/living/guard.ts`).
Fit: a director/wizard prompt rule + optional author field `truth` on a checkpoint (author-only, held from members except an
authored holder). Small; guide topic needed (rule: every authorable field has a topic). Ties to plan 44 F (claims vs truth).

### P4. Quantum-ogre probe — test-idea · measurement · absent · value 4 · effort S–M (RP tier)
What: their failure mode as a metric. Same contact, N swipes (or N fresh chats from one snapshot): ask about something not in the
transcript (what is in the drawer, who forced the lock); score agreement across swipes, and later agreement with a prepared row.
Our state: nothing measures cross-swipe fact stability. Swipe rollback exists (`runtime/turnBridge.ts:249-281`).
Fit: a `so-scenario` with `send_generate` + swipe verbs on an adolion-fresh lane; baseline before P1 decides whether P1 is needed.
Predeclare the floor; record a miss, do not retune.

### P5. Swipe A→B→A identity — test-idea · rollback · unverified · value 3 · effort S
What: theirs stores state per swipe (`swipe_info[i].extra`) so returning to an earlier alternative restores exactly that
alternative's state; an ungenerated swipe restores turn start; an alternative without its own snapshot never inherits
(`state.js:264-294`, `index.js:302-318`).
Our state: a swipe onto a stored reply rolls back and **recommits** a boundary (`turnBridge.ts:258,279-281`); whether the
extraction read reruns on A (nondeterministic model → A's second state can differ from its first) was not verified here.
Fit: property test / live check: swipe to B, back to A; assert blackboard + memory equal to the first A. If they differ, key the
accepted read by (chat, message id, reply-text hash) and reuse it.

### P6. Required evidence per target + "resolved must cite the changed state" — pattern · LLM readers · partial · value 2 · effort S
What: beyond quote-exists checks, each audit target names sources that must be cited, and a closing verdict must cite current state
(`review.js:189-197,220-221`).
Our state: quote verification exists (`extraction/evidence.ts:1-40`, word-span rule; commit guard `extraction/commitGuard.ts:225-232`).
Fit: only for the living director's critic if it ever returns grounded findings; not needed elsewhere.

### P7. Pre-publication private turn — anti-pattern for SO play path · judge/warden · n/a
Hold the reply, audit, repair, publish only on pass. Conflicts with "the judge never blocks and never writes", multiplies latency
by ≥ 5 on Artemis locally, loses streaming, and a group send is N loud generations. Our warden's carried note
(`stagecraftCoordinator.ts:453,480-496`) is the right shape. Keep only P1/P2 ideas from it.

## Host facts
- **Dry-run `Generate` skips interceptors** (`public/script.js:4562-4572`). Known (v2 overview line 99), but note the consequence:
  payload goldens record ST's dry-run prompt (`scripts/debug/so-payload-golden.mts:104-106`), so anything our interceptor does at
  interceptor time — chapter `recall`/`fold` of `chat`, `onLoreIntercept` forcing, the drafted beat settle
  (`runtime/wiring/talk.ts:58-66`) — is absent from goldens. Check that no golden claims to cover chapter fold or interceptor-time
  lore. Not a product bug; a coverage blind spot.
- **Interceptor exceptions are swallowed and the loop continues** (`public/scripts/extensions.js:2036-2040`); only `abort(true)` stops
  later interceptors. An interceptor that must block has to abort before anything that can throw. Ours aborts on refusal before
  awaiting inner work (`runtime/loudGenerationGate.ts:36-43`); if `hold` throws, ST proceeds with the generation (acceptable).
- An extension with a higher `loading_order` that calls `abort(true)` skips every later interceptor; SO is `loading_order: 1`
  (`manifest.json:3`), so ours runs first. Blackboard Private Turns refuse group chats, so it never co-runs with an SO story.
- `ToolManager.canPerformToolCalls` excludes `impersonate`, `quiet`, `continue` (`public/scripts/tool-calling.js:694-700`): tools never
  run on Continue.
- Tool invocations are saved as an `is_system` message with `extra.tool_invocations`, pushed, `TOOL_CALLS_PERFORMED` emitted
  **before** `addOneMessage`, then `TOOL_CALLS_RENDERED`, then save (`tool-calling.js:899-920`). No `MESSAGE_RECEIVED`, so TurnBridge
  commits no boundary for it, but it shifts message ids/chat length if any CC tool extension runs in a story chat.
- `getContext()` exposes `saveReply` and `canPerformToolCalls`/`isToolCallingSupported` (`public/scripts/st-context.js:162,183-186`);
  `createGenerationParameters(settings, model, type, messages)` is exported from `openai.js:2691`.

## Not worth taking
- Board as one model-edited markdown blob with `replace_all`: our typed blackboard + queue is stricter.
- Process register with model-written timestamps: our agendas/schedule are code-owned and never call a model; plan 50 already makes
  `story_time` monotonic and code-written; plan 55 derives overdue.
- STALE block ages / size-corridor monitor in the prompt: chars/4 heuristics; our budgets are token-based (`extraction/scopeBudget.ts`).
- D&D XP ledger validation: game-specific; quests/widgets cover our needs.
- IndexedDB checkpoints + Web Locks for paused paid turns: our runs persist in `chat_metadata`, chance is seeded so replay is free.
- Setup gate that flips host function-calling/system-prompt settings: we never write the owner's connection settings.
- Model-requested scene backgrounds via `/imagine`: our image routing and `effects.background` already cover it, with lane rules.
