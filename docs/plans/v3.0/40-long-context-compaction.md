# Plan 40 — A3 long context: chunked history compaction (+ D6 structural cut check)

**Status 2026-10-30: BUILT on `v3.0-a3-compaction` (CPU), behind `memory.chapters.compact` = **off** until the blind Sol
rating passes. D6: no clean structural cut found, nothing changed, miss stays recorded.** Source: `00-overview.md` A3,
`gpu-queue-2026-10-30.md` §3 C-A3 / C-D6, research `research/context-chunking-web.md` §3 idea 3 and
`research/fable-context-slicing.md` §7. Base: `v3.0-harvest-1030-fixes` @96e74c62 (chapter-fold M05 fix next door).

## Why

Once a chat fills the prompt budget, ST's Text Completion fit loop (`script.js:4902-4925`) drops the oldest message on
every generation, so the history start moves every turn and every member's cached prefix dies after the head (Fable §7:
~30 s re-prefill per member turn at 32K). Dropping a large leading chunk at once, only when the history passes a high
mark, keeps the prompt start fixed for many turns.

## What was built

- `src/memory/historyCompaction.ts` (pure, no imports): `compactionBand(contextTokens)` = high 75 % / low 50 % of ST's
  prompt budget, keep at least 12 messages; `compactionCut(costs, band)` replays the chat's growth (the cut moves only when
  the kept history passes high, then drops to low in one step); `planCompaction(entries, band, ceiling)` clamps the cut so
  no message past `ceiling` leaves.
- `src/runtime/compactHistory.ts` (chapter kit chunk, lazy): at the generate interceptor, after the chapter fold
  (`wiring/talk.ts`), it marks a **leading** run of rows `Symbol.for("ignore")` (same mechanism and leading-only rule as
  the M05 fold fix, so Chat Completion gets no interior hole and the fold + compaction union is one block).
  Ceiling = `min(readCoverageEnd(extraction audits), memory.shortTermSummaryEnd)`: compaction never removes a message the
  story read and the short-term summary have not covered. No read yet, memory off, quiet/impersonate, or no budget: nothing.
  A journal line (ids and token counts only) when the cut moves.
- Setting `memory.chapters.compact` (Chapters and long-chat context, Story → Features control `compact`), default
  **false**; settings copy, `featureState` UNMAPPED_CONTROLS row, `docs/guide/setup/settings-reference.md`
  (`npm run docs:settings`), guide bundle (`npm run docs:guide`), session baseline `compact: false`.
- Invariants:
  - Rollback ≡ replay: the cut is a pure function of the rows, the prompt budget, the audits and
    `shortTermSummaryEnd`, all of which rollback already restores; the port's `compactedTo` drives only the journal line.
    Test: prefix replay property (`historyCompaction.test.ts`) and rollback-to-earlier-message (`compactHistory.review.test.ts`).
  - Held secrets: compaction only removes rows and adds no text; the memory tiers that stand in for the dropped messages
    are the existing resting-filtered tiers. Test: kept rows reach the prompt byte-identical, nothing added.
  - Never past the last read window: ceiling clamp, test "never drops a message past the last read window or the
    short-term summary".
  - Thinking / inner voice untouched (no preset, sampler, reasoning or inner-beat path changed).

### Exception to "every built feature on by default"

`memory.chapters.compact` ships **off**: it changes what reaches the play prompt (owner decision 4, prompt layout is
quality-rated). It flips on only when rating row **A3-R** below passes its predeclared floors.

## Rating prep (A3-R, owed: GPU)

Tool: `scripts/debug/so-compaction-rating.mts` (+ `lib/compactionRating.mts`, tests `scripts/debug/compactionRating.test.mts`).
Arms per recorded chat prompt: **trim** = ST's message-by-message fit under the budget; **compact** = this plan's cut
(same pure module), then ST's fit. No recorded chat reaches 32K (max 17.3K), so the budget is simulated at 8,192 tokens
(ratio-preserving stand-in; stated limitation: a native 32K chat, e.g. from the owner playtest, is the better corpus).

- CPU part DONE 2026-10-30 (`arms`, over `C:\dev\so-lanes\42\debug\v29gpu2\payloads.jsonl` and
  `45\debug\s6h\payloads.jsonl`): 43 chats, 346 chat prompts, 18 compaction moves, 52 candidate points right after a move
  (within 3 prompts), 16 chosen. Offline prefix reuse (chars, same member consecutive prompts, 265 pairs):
  trim p50 0.312 of the prompt reused, 131 trunk moves; compact p50 0.636, 66 trunk moves. Arms written to
  `C:\dev\so-lanes\rating\a3-compaction\` (private: prompts hold chat text; repo gets numbers only).
- Floors (predeclared, never retuned): >= 24 rated pairs; compact preferred or tied in >= 45 % of pairs; mean overall
  compact - trim >= -0.15; mean continuity compact - trim >= -0.20.
- Commands owed (GPU on the owner's "resume", controller running, model alone not required: functional row):
  1. `node scripts/debug/so-compaction-rating.mts gen --url http://127.0.0.1:18888 --seeds 1,2` (16 points x 2 arms x
     2 seeds = 64 Artemis generations from the recorded request bodies, thinking as recorded; est. ~25 min derived from
     ~20 s/reply).
  2. `node scripts/debug/so-compaction-rating.mts pack` (32 blind A/B pairs, sealed key).
  3. `node scripts/debug/so-compaction-rating.mts rate` (Sol `openai/gpt-6.1-sol`, owner-approved 2026-10-30; ~32 calls).
  4. `node scripts/debug/so-compaction-rating.mts score` -> `verdict.json`; pass = flip the default to on, record it.
- Also owed after a pass: real-LLM live gate on a model lane with a chat past the budget (ST context lowered to 8K on a
  lane copy), checking the journal line, the boundary/rollback path and `so-payload-golden prefix` drift per member.

## D6 — P5 matcher structural cut: not built

Tried: collapse branch spawns that land in the same dedupe group (pattern, rev, next, bindings) to the one dedupe would
keep, before allocating (equivalent by the dedupe ordering). Persisted state byte-identical (791,630 B), but on the P5
fixture the count of branches entering `dedupe` was unchanged (42,700 old and new): every spawn there is already
unique per group; the churn is the 16 start spawns per check ref plus the per-delta `added`/`removed` copies, which only
a state-format change would cut (not clean: changes persisted state and its rollback). Timings under a saturated machine
(parallel builders, CPU 100 %) were noise (old 5.8-6.5 / new 4.4-7.7 ms interleaved). Reverted; P5 stays a recorded miss
(0.03-0.19 ms over 2 ms on a quiet machine), floor not retuned.

## Unresolved questions

- Pre-story rows (chat started before the story) are inside the compactable range once read coverage passes them; fine?
- Should the next-turn preview (`foldPreview`) also count compacted rows? Not done (UI-rework zone).
- 32K native corpus: rate again on the owner's first long chat, or accept the 8K stand-in?

## Gate record 2026-10-30 (v3.0 40 build, branch v3.0-a3-compaction)

- Base `v3.0-harvest-1030-fixes` @96e74c62; `npm run worktree:setup` run. Commits `0e9ade8d` (A3 product), `b2f86e5b`
  (rating prep, plan, D6 record), this record.
- `npm run gates:quick -- --base v3.0-harvest-1030-fixes` per slice: green (395.0 s, 286.0 s).
- `npm run gates -- --no-storybook` (full, no `--resume`, waited for a free slot per the coordinator's two-run limit):
  `gates: all green in 646.4s` (typecheck, typecheck:test, test, build, debug:typecheck, lint, test:replay, test:release,
  test:debug, test:plugin).
- Storybook alone on port 6235 (`npm run storybook:build`, then http-server + test-storybook `--maxWorkers 2`):
  Test Suites 169 passed / 169, Tests 1025 passed / 1025.
- Main bundle `dist/index.js` 1,267,640 B (budget 1,300,000); compaction code rides the chapter kit chunk (only
  `readCoverageEnd` import and one call line in `wiring/talk.ts`).
- Offline A3-R `arms` run: numbers in §Rating prep (CPU, recorded lane payloads, no model call).
- NOT run: real-LLM live gate and the A3-R generation + Sol rating (no GPU, owner "resume" owed); lane check (no staging,
  unmerged branch). D6 timings taken on a saturated machine: informational only.
- Deviations: `memory.chapters.compact` default off (exception above); no `story-guide.md` paragraph (it is an install
  setting, documented in the generated settings reference); no change to `ChapterRecordControls.tsx` (UI-rework zone): the
  control appears through `featureControls.ts` on Story → Features / Defaults.
