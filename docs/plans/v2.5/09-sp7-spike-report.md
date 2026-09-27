# v2.5 plan 09 — SP7 seeded chance gates (and the RNG seam) spike report

**Verdict: deterministic side PASS (D1, D2, D3); D4, D4b live legs pending ×2; D5 pending the user.** No deterministic condition failed,
so the code stays behind its flag and the worth review (rule 8) waits for the live legs. The conditions were predeclared in `607f59dd`
(copied verbatim from `09-research-spikes.md` §SP7) and were not retuned. The user decided D1–D5 all run (Q2, 2026-09-26).

## Conditions

| # | Condition | Pass | Measured | Result | ST note (latest stable, V10) |
|---|---|---|---|---|---|
| D1 | Replay | jest: same chat/story/boundary → same draw; rollback + replay → same draws, 4 seeds × 200 cuts | Real `StoryEngine` over `sp7-chance.story.json`, 150 boundaries per seed, seeds 11/23/37/51, 200 random cuts each: **0 mismatching replays of 800**. Same inputs twice → identical trace. Controls: another chat draws another `clue_die` sequence; an unseeded draw fails the same comparison (>0 mismatches); with the engine seam disabled, 4 of the suite's cases fail (the replay case alone passes vacuously, which is why the loop and control cases exist) | PASS (jest, once) | n/a (our code) |
| D2 | Distribution | 10 000 seeds: observed rate within ± 1.5 pp of `target/sides` | Gate draw: d20 ≤ 12 **59.87 %** (−0.13 pp), d6 ≤ 1 **16.61 %** (−0.06), d100 ≤ 35 **34.93 %** (−0.07), d2 ≤ 1 **50.04 %** (+0.04). NPC roll on the seam: p 0.25 → 25.49 % (+0.49), 0.5 → 50.34 % (+0.34), 0.9 → 89.87 % (−0.13). Talk pick 3:1 → 75.35 % (+0.35) | PASS (jest, once) | n/a |
| D3 | Engine purity | `architecture.test.ts` green; the seed is a clock-like seam, no host import | `architecture.test.ts` green. `EngineHost` gained `derive?(view)` beside `now()`; `engine.ts` imports no chance/spike/runtime/host module and holds no `Math.random`; `engine/chance.ts` imports only `./schema` (types) and `@utils/guards`, and holds no `Math.random`/`Date.now` (jest `SP7 D3`). Control: the draw changes when the view the engine hands over changes | PASS (jest, once) | n/a |
| D4 | NPC reply roll on the seam | a rolled-back and re-entered checkpoint draws the same outcome, ×2 live | 2026-09-27 lane 3, dev `fd8efa441c80`, ×2: **not measured, fixture defects**. Run 1 failed at step 9 (`gate @ 2`, want `hall @ 0`): step 5's `/cp set opened true` commits its own boundary at once (`RuntimeManager.setQuality` enqueue + `commitBoundary`, `src/runtime/runtimeManager.ts:254-255`), so the gate is entered at boundary 1 on message 0 (draw `boundary: 1`, `gateEntered: 1`), before `chatStart`; deleting messages ≥ 1 cannot undo it, and the reply's boundary 2 applied nothing, so no rollback is due (`engine.ts:338-345`). Run 2 failed at step 8 (`saw 2` onEnter rolls): the dev ring `storyOrchestratorSpikes.draws` still held run 1's draw (chat `…01h08m20s255ms`) and the step does not filter by chat. Records `test/journeys/records/v2.5-batch2/plan09/SP7/D4-D4b/`, `test/journeys/records/v2.5-batch2/plan09/SP7/diag/` | **not measured** | `/sendas` posts as type `command` (`public/scripts/slash-commands.js:6011-6013`), so the NPC reply commits a boundary; `deleteMessage` emits `MESSAGE_DELETED` with the new `chat.length` (`public/script.js:1699`) |
| D4b | Talk weighted pick on the seam | a rolled-back and re-entered boundary picks the same speaker, via `options.random` seeded from `hash(chatId, storyId, boundary, 'talk')`, ×2 live | 2026-09-27 lane 3, ×2 (+1 diagnostic): **not measured**. Both runs failed at step 8 (`did not roll back to boundary 0: 1`). Diagnostic copy: after the deletes the engine holds `hall`, `lastMessageId 0`, boundary **1**, boundary log `[{boundary 1, last 2, fired null}]`, no rollback journaled: the reply's boundary fired nothing and applied nothing, so `shouldRollbackFromMessage` is false (`src/engine/engine.ts:338-345`) and only the chat end is clamped; the counter is not rewound, so the re-sent turn is boundary 2 and seeds another draw. Step 7 also reads `talk[0]` from the page-wide ring without a chat filter (run 1 read D4 run 1's draw). The fixture's premise (a delete rewinds a no-op boundary) does not hold | **not measured** | group generation runs our interceptor before the request (`public/script.js:4564`, `public/scripts/extensions.js:2024`) |
| D5 | Authored use: ≥ 1 shipped example story uses a chance gate and the user accepts it | yes | Machinery built (a `roll` on a `source: code` quality); no shipped example changed | **pending: user decision** | n/a |

ST facts verified against `C:\dev\SillyTavern-MainBranch` at `7c3994196`.

**Deviation before measurement (implementation, not a bar).** The seed hash was first FNV-1a + a murmur finaliser (D2 also inside the bar:
−0.45 / +0.18 / +0.30 / −0.39 pp). The code-health S8 ratchet allows one FNV copy (`runtime/hash.ts`) and the engine may not import
runtime, so the hash became xmur3 before this report; the table records the shipped hash only.

## What was built (all behind `settings.spikes.sp7Chance`, install-wide, default off, never flipped here)

- `src/engine/chance.ts` (pure): `chanceSeed(parts)` (xmur3), `seededStream` (mulberry32), `unitDraw`, `dieFace`, `readChanceRoll`, `rollOutcome`.
- Engine seam: `EngineHost.derive?(view: {boundary, activeCheckpointId, checkpointStartedBoundary})` returns code writes applied with the mechanical qualities in `refreshMechanicalQualities` (the blackboard refuses a non-`code` or mistyped write itself). No host import; the engine never draws.
- Chance gate (D5 machinery): a raw story quality `{ source: "code", type: "bool"|"int", roll: { sides, target } }` is drawn from `hash(chatId, storyId, checkpointStartedBoundary, quality)` — committed at checkpoint entry, so every boundary of one visit reads the same value, a swipe or rollback re-draws the same value, and a re-entry at a new boundary draws afresh. `bool` = face ≤ target, `int` = the face. Read from the pinned raw story; the validator is untouched.
- NPC reply roll (D4): `EffectApplierDeps.roll?(key)`; `null` keeps today's `Math.random()`. The seam draws `hash(chatId, storyId, boundary, key)`; plan 02 C9's journal line is unchanged.
- Talk pick (D4b): `TalkControlHost.random?()` feeds `chooseByRules`' existing `options.random`; the seam streams from `hash(chatId, storyId, boundary, 'talk')`.
- Prod carries only the seam holder (`runtime/spikeSeams.ts`), the flag sanitizer (`runtime/spikeFlags.ts`) and three optional deps. The spike itself (`runtime/spikes/install.ts`, `runtime/spikes/sp7Chance.ts`, `engine/chance.ts`) loads only through a `__SO_DEV__` dynamic import in `runtime/index.ts`; the dev chunk publishes `storyOrchestratorSpikes.draws` (ring of 200) for the live legs.
- Plan 12 D3: the three spike modules are on `devOnly.guard.test.ts`'s list; control: a planted static import of `./spikes/install` from `runtime/index.ts` fails it.

## Live legs (pending; rule 1 ×2 consecutive, rule 4 lane copy + run header + `--strict`)

Dev build on the lanes first: `npm run build:dev && npm run serve:dev`, then `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-session.mts reload`.
Group `1759606632088` holds Arin and Ponticius. Judge uses stay off. Records: `test/journeys/records/v2.5-plan09/sp7/live-<bundle12>/`.

| # | Command |
|---|---|
| D4 (+ D5 machinery) | `node scripts/debug/so-run-header.mts capture --label sp7-d4` → `node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group 1759606632088 test/scenarios/live-v25-09-sp7-d4.json` → `node scripts/debug/so-run-header.mts diff <capture>` |
| D4b | `node scripts/debug/so-run-header.mts capture --label sp7-d4b` → `node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group 1759606632088 test/scenarios/live-v25-09-sp7-d4b.json` → `node scripts/debug/so-run-header.mts diff <capture>` |

Both legs switch `spikes.sp7Chance` on in their first step and off in their last; a failed run leaves it on (restore by hand, see each fixture's `_note`).
Extraction is pinned to `SCENE_NONE` so only the scripted `/cp set` writes move the story; the replies are real generation. Neither condition's number
depends on the model (no pass role recorded, rule 5). Every eval passed the fixture syntax check (`npm run test:debug`, `scenarioSchema`).

## D5 — for the user

A chance gate ships only if a shipped example uses one and you accept it. The proposal: `examples/sun-ruins` gains one `roll` quality where
a checkpoint already branches (the pattern is `live-v25-09-sp7.story.json`: `lock_gives` d20 ≤ 12, drawn at gate entry, routing `through` / `barred`).
Not done here: it changes a shipped story before the verdict.

## Worth review (rule 8)

Waits for the D4/D4b live legs (no deterministic condition failed). Cost so far: prod +1 126 B on the main entry (flag sanitizer only; 1 175 536 B of
1 250 000); manager +2 lines; no new host seam.
