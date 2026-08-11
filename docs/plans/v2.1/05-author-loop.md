# Plan 05 — Author loop

## Objective

Close the author↔play loop: an author can build a **complete** story in Studio (no JSON hand-editing), play it, hit a wrong gate, edit, save, and keep playing the *same chat* with progress preserved — with an explicit, understandable flow only when an edit genuinely invalidates live state. Phase-7's "full story authorable without touching JSON" actually met.

## Context

- Findings U2 (loop half — identity mechanics landed in plan 02), U7. Spec addendum §Story identity (version-change semantics).
- Current state: Studio Save writes the library and nothing else (`StudioToolbar.tsx:36`); no editors for roster, requirements, `arc_template`, `arc_bridges`, description (mutations exist — `mutations.ts:98-120` — and copilot already emits roster ops, `copilot/types.ts:36`); the drawer has no path into Studio; plan 02 left version-mismatch as hydrate + warning.
- Consumed: plan-02 id/version + `contentHashAtLoad` drift detection + `restartStory()`; plan-03 coordinators (revalidation logic near `expansionCoordinator`/engine); journey J2 (must flip to green).

## Scope

In: Studio completeness, save→same-chat hot-swap, invalidation flow, drawer→Studio entry, copilot parity for new editors.
Non-goals: new authoring features beyond format coverage; graph editor rework; multi-author/versioning beyond the single `version` int.

## Deliverables

- **Studio completeness** (persona: `author`): Story tab (or toolbar-adjacent panel) — description, `arc_template` select, `id` (slug, auto-derived from title, editable until first save), version (read-only, auto-bump on save-with-changes); Roster editor (id/name rows — feeds cast/npc_replies/talk_control pickers, which currently render empty options for Studio-born stories); Requirements editor (personas/members/lorebooks with pickers from live ST context where available); `arc_bridges` editor (arcMatch/anchor/amount rows, anchor picker). Each with `.stories.tsx` per v2 convention.
- **Copilot parity**: proposal ops for requirements/arc_template/arc_bridges/description (roster ops exist); stage list extended or folded into `effects` stage (delegated).
- **Save→hot-swap**: saving a story whose id is selected in the **active chat** triggers `runtimeManager.applyStoryUpdate(record)` — this is the only automatic path, and it exists because the author is editing *from* this chat; on success it **re-pins** the chat's story copy to the saved version (spec addendum §Story identity: other chats keep their pinned copies untouched; new chats pin latest):
  1. Diff old→new normalized stories (qualities/checkpoints/transitions by key/id).
  2. Classify: **compatible** (guidance/effects/rubric/text changes, additions) → hot-swap silently, keep engine state, re-derive scope/steering/injection; **invalidating** (active checkpoint removed, quality with live value removed/retyped, gate on latched value changed, start changed with no progress) → popup listing consequences with choices: keep playing (drop only orphaned values) / restart story / cancel save-apply (library still saved).
  3. Inserted expansions revalidate via existing basis-tracked drift check (v2 acceptance mechanism — reuse, don't reinvent).
  4. Journal event `story-updated {fromVersion, toVersion, classification}`.
- **Drawer→Studio entry** (author view): "Edit story" button opens Studio on the active story draft (resume-draft prompt logic from `index.tsx:47` reused/moved); after save, drawer reflects the update without chat reload.
- **Restart affordance surfaced** (author view + settings): plan-02 `restartStory()` gets its button here if plan 02 shipped it headless.
- Tooling: `so-scenario` verbs `studioSave`, `assertStoryVersion`, `assertHotSwap`; J2 journey extended to cover an invalidating edit path.

Exports: `applyStoryUpdate` + classification contract (plan 07's curators reuse the compatible-update path; plan 08 asserts it); complete mutation/op parity — plan 06's wizard emits only these ops, so any format field without an op here is a plan-06 blocker.

## Implementation notes

- Diff/classify is pure — new `engine/` or `studio/` module (`storyDiff.ts`), fully jest-covered with fixture pairs per classification row. The classification table in this plan doc is the spec; enumerate it exhaustively before coding (qualities: removed/retyped/enum-narrowed/latch-flag-changed; checkpoints: removed-active/removed-visited/removed-future; transitions: gate-changed-on-active-frontier/elsewhere; roster: member-removed-while-enabled…).
- Hot-swap runs at a boundary (apply-queue discipline — never mid-generation): queue the update, apply on next commit or immediately when idle.
- Auto-version-bump: content-hash change on save with same id ⇒ `version+1` unless the draft already raised it.
- The Studio dirty/close guard and stale-closure lesson (`ux-eval` incident: re-read store state at action time) apply to the new editors.
- `so-library.mts` and docs updated for id-based operations (rule 5).

## Validation gate

Harness: baseline + storyDiff classification suite + Storybook (new editors, interaction + a11y). Live journey gates (fresh-start, real LLM): **J2 green end-to-end** — Studio-born story (with roster, requirements, talk_control) played to a transition, a deliberately wrong gate edited mid-chat, same chat continues, progress intact; invalidating-edit variant shows the popup and both choices behave; J3 regression floor. Gate record: classification table as-built.

## Delegated decisions

- Studio layout for the new editors (new "Story" tab vs toolbar panel).
- Copilot stage shape for the new ops.
- Whether visited-checkpoint removal is compatible (history references it) — leaning invalidating-lite: keep playing, mark history entry orphaned.

## Resolved decisions (user, 2026-08-11)

- No cross-chat propagation, ever: chats play their pinned copy indefinitely; only the chat being edited from re-pins (above); new chats pin the latest library version. Optional author-view "Update story to latest version" button (explicit, goes through the invalidation flow, re-pins) — delegated whether to ship it this plan or seed v2.2.
