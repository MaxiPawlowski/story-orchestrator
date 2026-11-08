# Summaryception — 2026-11-08 harvest

meta: https://github.com/vadash/Extension-Summaryception · HEAD `e89dc31` (v24.29.0, new repo) · **AGPL-3.0-or-later: ideas only** ·
read: README, CONTEXT.md, `src/core/{refusal-guard,structural-headers,slop-breaker,cache-staleness,continuity-state,promotion-planner,memory-injection,assistant-role-mask}.js`,
ADR titles · skipped: UI, tests, vendored jsonrepair, `docs/agents/*` · prior: none · SECURITY CLEAR. (Written by the parent session from the
reviewer's text: the reviewer's own write was blocked by a harness filter on the file name.)

## What it is

Layered recursive summarization. Recent chat stays verbatim; older turns become Layer 0 snippets, and crowded layers merge into deeper
ones. Covered messages are hidden from the model with `/hide`, with tracking of which hidden messages the extension owns. Optional
Continuity Auditor (v24): the model emits only per-pair booleans, code does the bond arithmetic, and the result is stored as a checkpoint
on the reply's `extra`, one message behind.

## How it works

- Output contract: one `<narrative>` envelope; prose after the close is rejected (`structural-headers.js:17-32`). A closing
  `<declined>reason</declined>` counts as a refusal and is retried (`refusal-guard.js:11`).
- Refusal guard with no judge call (`refusal-guard.js:15-28`, `:178-219`): a fixed refusal-phrase list scanned on the summary body only, plus
  a passage-shape check (the passage's top 8 names that occur at least twice; a body naming none of them while talking about
  "passage/text/request/summary" is a refusal).
- Over-merge floor (`promotion-planner.js:18-29`); stale-cache flush summarizes first when the chat sat idle past the cache TTL
  (`cache-staleness.js:47-60`); Slop Breaker summarizes and hides through the latest turn (`slop-breaker.js:23-58`); flags-to-arithmetic in
  `continuity-state.js:307-350`.

## Patterns for SO

### P1. Refusal guard on free-prose summaries — pattern · memory · partial · value 4 · S

`memory/summaryGuard.ts:49-57` only compared against a previous summary (`:52`); the scene summary was unguarded
(`extractionCoordinator.ts:402-413`; `memoryCoordinator.ts:199` rejects only empty text). Chapter records are already structured
(`chapterRecord.ts:70-76`). **Built 2026-11-08** (branch `v3.0-defects-1108`): `isRefusal` in `memory/summaryGuard.ts` (phrases outside
quotes in the head, a `<declined>` marker, the passage-shape check over `namesIn`), applied in `guardSummary` (reason `refused`) and in
`summarizeScene` (a refused part or final summary returns `""`). The `<declined>` instruction itself would be a prompt change: not added.

### P2. Compaction cut when the cache is cold anyway — pattern · plan 40 · absent · value 2 · S-M

Cut to the low mark on hydrate or after a controller restart. Breaks "the cut is a pure function of the rows", so the cut would have to
be recorded and rolled back by message. Park until A3-R passes.

### P3. "Break the loop" = compact to the ceiling on demand — feature · absent · value 2 · S

Same replay caveat as P2; depends on compaction being on.

### P4. `apologized` social act — feature · partial · value 2 · S

`continuity-state.js:323-325` vs `engine/socialActs.ts:7`. A read-contract change: bundle with the next one.

### P5. Booleans from the model, arithmetic in code — already present (socialActs, `clock.ts:91-99`, `life/beats.ts`).

## Suspected SO defects

- The first short-term summary and every scene summary skipped all checks (`summaryGuard.ts:52`; `extractionCoordinator.ts:404-411`): a
  refusal became a permanent `scene_history` row reaching every member and the chapter seal. Fixed by P1.

## Host facts

- `/hide` ghosting changes stored `is_system` and needs ownership tracking; SO's per-request `Symbol.for("ignore")` (`compactHistory.ts:8`)
  avoids that state.

## Not worth taking

Recursive layers (SO has scenes, chapters, saga); an in-chat continuity block with `[S]` secret notes (breaks the held-secret rule); the
user-to-assistant role mask (Chat Completion only); model-written timestamps.

## Security notes

CLEAR: model calls through `generateRaw`, imports ST-local only. Its husky `prepare` hook runs on `npm install`. Agent-addressed text not
followed: `docs/agents/issue-tracker.md:14` (`gh issue edit <n> --add-assignee @me`) and AGENTS.md files. The ideas need no network,
secrets or server plugin.
