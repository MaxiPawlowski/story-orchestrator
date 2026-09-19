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

## Gate record — 2026-08-12 (ACCEPTED)

### Classification table, as built (`src/engine/storyDiff.ts`, one jest fixture per row)

"Live" means the running chat actually holds the thing the edit touches; the same edit against a
fresh chat is compatible by construction. `diffStories(previous, next, state)` diffs the **merged**
stories (expansions included) so a generated beat is never read as a removed checkpoint.

| Change | Live condition | Class | Code | What "keep playing" does |
|---|---|---|---|---|
| quality added | — | compatible | `quality-added` | — |
| quality removed | no value held | compatible | `quality-removed` | — |
| quality removed | value held | **invalidating** | `quality-removed-live` | drops the value + version + latch |
| quality retyped | no value, or value still fits | compatible | `quality-retyped` | — |
| quality retyped | value no longer fits the type | **invalidating** | `quality-retyped-live` | drops the value |
| enum values narrowed | held value dropped from the list | **invalidating** | `quality-enum-narrowed-live` | drops the value |
| latching off→on | value held | compatible | `quality-latch-enabled-live` | value locks on its next write |
| latching on→off | lock held | compatible | `quality-latch-disabled-live` | releases the lock, keeps the value |
| source changed | value held | compatible | `quality-source-changed-live` | value kept |
| checkpoint added | — | compatible | `checkpoint-added` | — |
| checkpoint removed | never reached | compatible | `checkpoint-removed` | — |
| checkpoint removed | visited anchor | compatible (invalidating-lite) | `checkpoint-removed-visited` | drops that step from history |
| checkpoint removed | **the active one** | **invalidating** | `active-checkpoint-removed` | re-anchors to the new start, restarts the checkpoint counters |
| start moved | chat already past the opening | compatible | `start-changed` | — |
| start moved | chat still at the opening | **invalidating** | `start-changed-unplayed` | re-anchors to the new start |
| transition added / removed | — | compatible | `transition-added` / `transition-removed` | — |
| gate changed | not on the active frontier | compatible | `gate-changed` | — |
| gate changed | on the active frontier | compatible | `gate-changed-frontier` | new condition applies from the next boundary |
| gate changed | frontier gate now reads a **latched** value | **invalidating** | `gate-changed-latched` | drops that value + lock so it can be re-read |
| roster member removed | still named by a checkpoint / not | compatible | `roster-member-removed` | direction falls back to the rest of the cast |
| requirements / arc_template / arc_bridges / title / description / guidance / effects | — | compatible | `requirements-changed`, `arc-template-changed`, `arc-bridges-changed`, `text-changed` | re-derived |

`pruneEngineState` implements "keep playing": drops exactly those keys (plus any value the new story
no longer declares at all), clears latches the new story no longer enforces, drops visited anchors
that are gone, and re-anchors when needed. Boundary counters, the rest of the blackboard, memory,
audits and the journal are untouched.

### What landed

- **Studio completeness (U7).** Two new tabs: **Story** (`data-so="story"`) — id (slug, derived from
  the title, **locked once the draft came from a saved record**), read-only version, description,
  dramatic shape, requirements (`data-so="requirements"`: persona / cast / lorebook, each with a
  datalist fed from the live ST context) and thread bridges (`data-so="arc-bridges"`: keyword /
  anchor picker / amount) — and **Roster** (`data-so="roster"`, id + character name rows), which is
  what every cast picker reads, so `talk_control`/`npc_replies`/`cast_changes` are no longer empty
  for a Studio-born story. `.stories.tsx` for both.
- **Extended by plan 07**: format-2 gained `stagecraft.lorebooks` (the background curator's write
  allowlist) and `effects.background`, so "a whole story is authorable in the Studio" now also means
  the Story tab's **Stagecraft** panel (`[data-so="stagecraft"]`) and the Effects editor's
  **Background** section, with `setStagecraft` joining the copilot op union at parity. J2.3 asserts
  both. Nothing else in this plan's completeness claim changed.
- **`requirements` is typed** (`StoryRequirements {personas?, members?, lorebooks?}`) and authored
  aliases (`persona`, `groupMembers`, `group_members`, `globalLorebooks`, `global_lorebooks`)
  normalize at parse time, so `runtime/requirements.ts`, the editor and plan 06's wizard read one
  vocabulary. Existing stories keep working; the pinned copies normalize on load.
- **Copilot parity.** `setRequirements`, `setArcTemplate`, `setArcBridges` joined the op union with
  parser readers, appliers, descriptions and grammar; folded into the existing `effects` stage
  (delegated decision — no new stage). Every format-2 field the Studio edits now has an op, which is
  plan 06's precondition.
- **Save → hot-swap.** `runtimeManager.applyStoryUpdate(record?)` (omit the record to take the latest
  library version) diffs, classifies, and either swaps silently or raises a **keep / restart /
  cancel** popup listing the consequences (`runtime/storyUpdate.ts`, `showChoicePopup` over ST's
  `customButtons`). Applying re-pins this chat (`pinnedStory`/`playedVersion`/`contentHashAtLoad`),
  re-derives requirements, effects, steering and injection, re-runs the basis-tracked expansion
  revalidation, and writes a `story` journal record `{fromVersion, toVersion, classification}`.
  Cancel leaves the chat on its pinned copy; the library keeps the edit either way.
- **Studio-born identity.** A draft saved without an authored id now gets one derived from its title
  (`availableStoryId`) instead of keying as `legacy-<contentHash>` — which forked a **new library
  record on every save**. This is finding U2 from the authoring side, and it was still live.
- **Drawer → Studio (author).** The Studio moved into its own React root (`#so-studio-root`) with a
  module-level open flag, so the settings panel and the drawer's author view drive one instance.
  Overview footer: `#so-edit-story` (author), `#so-update-story` "Update to v*N*" (author, only when
  the library has moved on), `#so-restart-story-drawer` (both personas — the spoiler checklist
  claimed Restart was in the drawer since plan 04; it was not).
- **Manager budget.** `runtimeManager.ts` **687 → 677** lines (rule 3 satisfied, net −10): the away
  recap became `AwayRecapController` (popup injected, module stays jest-pure), the transition
  announcement moved to `EffectsApplier`, `parseQualityValue` to `runtime/values.ts` and the
  possible-transitions readout to `snapshot.ts`.
- **Tooling.** `so-ui.mts studio-save [keep|restart|cancel]` (also `studio_save` as a step key and
  `ui: {action:"studio-save"}`), `expect: {storyVersion}` and `expect: {hotSwap}`, `lastStoryUpdate`
  in `so-state current`, `so-library wipe-chat-meta --id`.

### Harness

- `npm run typecheck` ✓ · `npm run lint` ✓ · `npm run build` ✓ (pre-existing bundle-size warnings
  only) · `npm run debug:typecheck` ✓
- `npm test` ✓ **56 suites / 1519 tests** (54/1490 before; new `engine/storyDiff.test.ts` 18 tests —
  one per classification row plus the prune/hydrate path — and `runtime/storyUpdate.test.ts`;
  extended `copilot/parse.test.ts` and `copilot/proposal.test.ts`).
- `npm run test-storybook:ci` ✓ **23 suites / 84 tests** (21/74 before; new `StoryEditor.stories.tsx`,
  `RosterEditor.stories.tsx`, `DrawerTabs` Author/PlayerStoryControls, `StudioToolbar`
  SaveOffersTheUpdateToTheChat).

### Live — real LLM (gemma4-mtp profile, headed, no `debugResponse`), fresh-start journeys

| Journey | This run | Previous | Verdict |
|---|---|---|---|
| **J2 author-loop** | **9 pass / 0 fail / 0 blocked** / 2 human | 4 pass / 2 fail / 2 blocked (plan-04 build: authoring checks blocked) | U7 and the U2 loop closed |
| J3 player-session | 8 pass | 8 pass | no regression |
| J4 return-and-adopt | 4 pass | 4 pass | away-recap refactor is behaviour-identical |
| J6 mutation-storm | 4 pass | 4 pass | no regression |
| J10 identity-and-settings | 8 pass | 8 pass | identity + typed requirements did not disturb it |

J2 now proves, on the real model: the Studio opens on every authoring surface (J2.1–J2.3); one
identity across edits (J2.4); the drawer's **Edit story** opens Studio on *this chat's* story
(J2.5); a compatible edit saved mid-play hot-swaps with boundary **and** blackboard intact (J2.6);
an invalidating edit (a live quality removed) raises the choice, and "keep playing" drops exactly
that key while the run continues (J2.7); "cancel" leaves the chat on its pinned version while the
library keeps the edit, so identity reads drifted (J2.8); the author driver still works (J2.9).

Beyond the journeys (scripted live check, since J2 covers keep/cancel but not restart): a
library-only edit made the chat drifted, `applyStoryUpdate()` with no record raised the popup with
the custom **Restart story** button, and choosing it restarted the chat on the new version with
drift cleared (`hotSwap {applied:true, classification:"invalidating", choice:"restart"}`).

### Findings fixed during the live gate

1. **A native `<dialog>` closed from outside React left the Studio mounted but invisible.** ST's
   popup, a debug script or the browser can call `dialog.close()`; React still rendered the modal,
   so everything that counts the node thought the Studio was open while nothing in it was clickable.
   Fixed with `onClose={onClose}` on the dialog — the close event is now the single source of truth.
2. **The Studio's dirty-draft guard could wedge the page.** Closing with unsaved changes raises an
   ST confirm; left unanswered it intercepts pointer events for the whole document, so the next
   click anywhere times out. `so-ui.closeCheckpointStudio` now answers it (and `openCheckpointStudio`
   answers the resume-draft prompt, keeping a prepared draft), waits for the node to detach, and
   treats a hidden modal as closed.
3. **A save whose hand-off threw left the toolbar stuck on "Saving…"** with no feedback either way.
   `handleSave` now reports the failure and always clears pending — the library write already
   succeeded, and the author must be told which half worked.

### Deviations

- **Delegated: Studio layout** → a new **Story** tab plus a separate **Roster** tab (not a toolbar
  panel): Roster is a first-class list like Qualities, and a tab label is a stable capability probe.
- **Delegated: copilot stage shape** → folded into `effects` rather than adding a stage; the wizard
  (plan 06) drives stages by intent anyway.
- **Delegated: visited-checkpoint removal** → compatible ("invalidating-lite"): the chat keeps
  playing and the orphaned history entry is dropped from `visitedAnchors`.
- **Delegated: ship "Update to latest" now or seed v2.2** → shipped now, author-view only and behind
  the same invalidation flow; it is one call to the same entry point, and without it a chat whose
  library moved on had no way back except Restart.
- **Beyond the deliverables**: the Studio-born `legacy-<hash>` fork (above) and the Restart button in
  the drawer. Both are U2/plan-04 debts this plan is the natural owner of.
- **`so-scenario` verb names**: `studioSave` / `assertStoryVersion` / `assertHotSwap` from the plan
  ship as `studio_save` and `expect: {storyVersion}` / `expect: {hotSwap}`, matching the existing
  step-key and expect-verb grammar rather than introducing a third naming style.

### Not done

- **Human eval (D2)**: J2.10 and J2.11 plus the standing "what would make you stop using this?" are
  the user's to score. The automated half is green and the checklist is emitted in
  `.debug/journey-J2.md`.
