# Scene Archivist — 2026-10-30 harvest

meta: https://github.com/AmiBastian/SillyTavern-SceneArchivist · `pre-refresh-2026-10-30` `b9a09c5` (1.0.3, 2026-10-21) .. HEAD
`5a3c1b1` (1.0.8, 2026-10-26), 12 commits, 89 files (+2,531/−433; ~65 are screenshots/GIFs) · **AGPL-3.0: ideas only, no code** ·
read: CHANGELOG, README diff, `entry-journal.js`, `world-info-io.js`, `recovery-tools.js` 1-80, `workbench-help.js` 1-20, 147,
`memory-engine.js` diff, `workbench.js` 1.0.8 diff · skipped: layout/CSS, `workbench-layout.js`, `workbench-tools.js`,
`workflow-tools.js`, media · prior: `docs/plans/v2.8/extension-research-2026-10-21/scene-archivist.md` (P1–P5), triage rows
M01–M04 and V10 in `docs/plans/v2.9/01-triage-sol.md:41, 63-69`.
`A/` = `C:/dev/st-extensions-research/scene-archivist/source/`.

## What it is / what changed

Same archive-in-lorebooks memory tool; five releases in five days:
- 1.0.4: every WI write verified by direct read-back, ST cache refreshed with a copy, no second save (`A/world-info-io.js`).
- 1.0.5: optional archive shared across chats (one writer); per-job **entry journal** with partial Undo that previews
  conflicts (`A/entry-journal.js`); knowledge "as of a fictional learning date"; character roster with aliases.
- 1.0.6: Essentials / All tools display modes; per-action help (uses AI? what changes? example); memory browser; Redo a
  ledger range; branch modes inherit / fresh / verified-history (`A/recovery-tools.js:22-80`).
- 1.0.7: sidebar nav, bounded excerpts in Preview range, deferred hidden-tab rendering.
- 1.0.8: shared archives skip **automatic** whole-list memory audits, because a full pass in one chat rewrote other chats'
  existing lists and lost detail (`A/workbench.js` `automaticMemoryAuditAllowed`; README "does not automatically recover
  previously lost text").

## Patterns for SO

### P1. Feature and action help says whether it calls a model, which route, and what it writes — pattern · UI rework 29 / feature help · our state: absent · value 3 · effort S
- Theirs: one table `ACTION_HELP` of `{title, description, changes, ai: yes|no|optional, example}` drives hover, keyboard,
  touch help and the searchable guide (`A/workbench-help.js:3-4`); the badge renders "uses AI" and a "What changes:" line
  (`:147`).
- Ours: `Feature` has `oneLine, what, where, settings, status, needs, isOn` (`src/features/registry.ts:57-71`), no
  model-use or write-surface field. v2.9 09 made Help show effective on/off state, "no model call" by design
  (`docs/plans/v2.9/09-effective-feature-help.md:1-12`). Plan 29 phase 2 builds "one FeatureList for Settings, This chat →
  Settings and Studio features" (`docs/plans/v3.0/29-ui-rework.md`); its review lists "which model calls ran" as 3 clicks +
  scroll (`ui-review/author.md:82`).
- Sketch: add `calls?: PassRole[]` (or `judgeUse`) and `writes?: "chat" | "lorebook" | "library" | "nothing"` to `Feature`;
  the FeatureList row renders "uses: <route label from snapshot.roleRoutes>" and "changes: …". Route label comes from the
  snapshot (no second resolver, 09 rule). A registry test fails on a feature whose settings name a role but declares no
  `calls`. Player copy stays plain ("uses the story model"); author view shows route + model. Helps the owner see GPU cost
  per feature before leaving it on.
- Fit: player/author split kept; no invariant conflict. Fold into 29 phase 2 FeatureList, not a separate plan.

### P2. Never let an automatic model pass rewrite a whole stored list — anti-pattern confirmation · memory consolidation · our state: present · value 2 · effort —
- Theirs: 1.0.8 had to switch off automatic whole-list audits after they silently dropped details from lists other chats
  wrote; only explicit, reviewed organization remains.
- Ours: consolidation never asks a model to rewrite text: it drops, supersedes or confirms rows by pair decision, records
  the losers in a `dedup` derived record and rolls back (`src/runtime/coordinators/memoryCoordinator.ts:438-462`,
  `src/memory/consolidate.ts:28-33`). Short-term compaction never summarizes past the last read window (architecture rule).
- Keep it that way: any future "tidy memory with a model" (69 K1-style compression, a memory audit for the wizard) must be
  row-level ops with provenance, never a whole-list text replacement. One line for `.claude/rules/architecture.md` §Memory if
  such a feature is proposed. Nothing to build.

### P3. Knowledge stamped with story time, "what did X know by day N" — feature · memory / calendar 50 · our state: partial · value 2 · effort S
- Theirs: knowledge rows carry a learning date distinct from the event date; a view answers "what did they know by this
  date"; undated rows are listed apart and never become dated certainty; retcon edits clear dated history, in-story
  belief changes preserve it (README §"What did they know by this date?").
- Ours: `EpistemicEntry` has `createdAt`, `messageId`, `retiredAt {messageId, boundary}`, `affirmedAt` (`src/memory/types.ts:105-124`),
  no story-time stamp; `story_time` is a code int (`src/engine/life/clock.ts`). An as-of-message view is derivable today.
- Sketch: author-only line in Memory (author) "learned day 3, dusk" from the blackboard's `story_time` at the row's write
  boundary (read at render from boundary log, no new state). Player surfaces unchanged (held-secret rule). Low priority;
  pairs with M02 (story-time span on chapter cards, 50 B1c).

### P4. Feasibility pre-check before a "must be shorter" model call — pattern · chapters / 69 K1 · our state: absent · value 1 · effort S
- Theirs: skip a condensation request when the mandatory heading + code-built chronology alone already reach the source
  size (`A/memory-engine.js:147-160`). Saves a doomed call.
- Ours: M03 folded into 50 + 69 K1 (count chronology tokens before accepting "shorter"). If K1 lands with a size rule, add the
  pre-check there: one line. No separate work.

## Host facts

- Scene Archivist states twice that ST has no conditional whole-book WI save, so shared books allow one writer
  (CHANGELOG 1.0.4/1.0.5). SO already solved this with the `story-orchestrator-lore` plugin commit (expected revision, 409;
  architecture §World Info K12); its fallback is ST's unconditional save after a preflight read.
- Their confirmed save refreshes ST's `worldInfoCache` with a deep copy of the read-back, never the cache's own object
  (`A/world-info-io.js:30-31, 45-47`). Matches our "evict worldInfoCache after API book writes" note.
- Fictional calendar dates parsed with `Date.parse` shift a day with the browser's time zone; they now build UTC dates
  (`A/memory-engine.js:329-341`). SO's story time is an int, no exposure.
- No SO bug found from this code.

## Security notes

- SECURITY.md verdict CLEAR. No text addressed to an AI agent found in the files read.
- Network: same-origin `/api/worldinfo/get|edit` only (`A/world-info-io.js:14, 24, 41`); `localStorage` for UI prefs. No
  server plugin, no secrets endpoints, no remote code.
- Ideas above need none of these.

## Not worth taking

- Essentials / All tools mode switch: plan 29 decision 11 rejects an expert-mode switch ("Expert settings always reachable
  on sub-pages").
- Entry journal with conflict-aware Undo: SO's curator revert is already compare-and-set newest-first and marks
  `externally-edited` (`src/runtime/curatorWriter.ts:165-236`); rollback ≡ replay covers the rest.
- Branch modes: SO detects a branch by `main_chat` + integrity and steps the copied state back to the branch point on
  Continue from here (`src/runtime/chatIdentity.ts:73-120, 156-170`); the parent's mirror book is unbound
  (`unbindBranchMirror`). Their "verified history" is what our rollback already guarantees.
- Shared archive across chats: SO's only cross-chat input is carry's public projection (45); sharing memory rows across
  chats would break per-chat held-secret scoping.
- Requests-per-Resume allowance, manual job preview, Redo ledger range, roster/alias merge (SO name fold present,
  architecture §Name fold), searchable memory browser: author chores for a free-form archive tool.
- Diary (M01, V3.0) and chronology (M03), lore-fired reasons (M04): already triaged; nothing in this delta changes them.
