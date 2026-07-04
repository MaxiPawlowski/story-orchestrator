# Plan 02 — ST Runtime Wiring

## Objective

Make a format-2 story run live in SillyTavern with mechanical gates end to end: persistence, turn-boundary commits, checkpoint effects (author note / preset / world info / cast / NPC replies), minimal UI, slash commands. After this plan the extension is functional again for code-source gates.

## Context

- Spec: §Turn loop & commit semantics, §Cast model (effects half), §Talk Control, §ST integration, §Data model (runtime state).
- Consumes from 01: `StoryEngine`, `EngineHost`, `EngineState`, `NormalizedStoryV2`, apply-queue semantics.
- Existing code: `stHost/` modules (events, authorNotes, worldInfo, presets, slashCommands, selectors), TalkControl subsystem internals, `story-library.ts`, `storySessionStore`, drawer/settings shells. v1 `persistenceController` key pattern: `story_orchestrator:{chatId}:{storyKeyHash}` in `chat_metadata` via `saveMetadataDebounced` (see plan 01 gate record).
- Pattern reference: MultihogDnDFramework's state-memo — a compact always-visible state block; our drawer blackboard table serves the same role (read-only here).

## Scope

**In**: `src/runtime/` host binding, effects, TalkControl retarget (onEnter/afterSpeak), story selection UI, drawer status, `/cp` commands, requirements re-check (minimal).
**Non-goals**: no extractor (blackboard changes only from mechanical qualities + slash/debug writes), no memory, no Studio editing, no generation.

## Deliverables

`src/runtime/`:
- `persistence.ts` — save/load `EngineState` + runtime extras under `chat_metadata['story_orchestrator']` keyed by story hash; debounced saves; hydrate on `CHAT_CHANGED`; version field for future migrations.
- `turnBridge.ts` — subscribes host events (via `stHost/events`): message received/sent, generation started/ended, chat changed, and the mutation events `MESSAGE_SWIPED/EDITED/DELETED/UPDATED` (`events.js:7-12`). Defines the **turn boundary** = reply fully rendered ∧ no generation in flight; on boundary: update mechanical qualities (message_count, messages_in_checkpoint, elapsed), `engine.commitBoundary()`, persist. Guards: no commits while any generation (incl. quiet) is running; queue the boundary instead. On a mutation at turn T: `engine.rollbackTo` per spec §Chat mutations, re-apply the restored checkpoint's effects idempotently, notify extraction (plan 03 schedules the re-read; until then, log only).
- `effectsApplier.ts` — implements `EngineHost.applyEffects`: author note (`applyCharacterAN`), preset (`applyTextGenPresetRuntime` + existing preset composition), world info (`enableWIEntry`/`disableWIEntry`), cast changes (new `stHost/groups.ts`: read/write `disabled_members` — verify mutation + persistence in `public/scripts/group-chats.js` before writing; ST may need `editGroup` call), scripted line + NPC replies via TalkControl.
- TalkControl retarget: v2 checkpoint effect `npc_replies[]` `{trigger: 'onEnter'|'afterSpeak', member, kind: scripted|llm, maxTriggers, probability?}` feeding the existing DispatchPipeline/ReplySelector/MessageInjector; keep interceptor semantics (abort loud only, suppression depth) from v1.
- `requirements.ts` — minimal: story `requirements` (personas/members/lorebooks) checked on load + chat change; unmet ⇒ effects deferred (queue until satisfied), surfaced in drawer.
- Slash commands: `/cp list`, `/cp state` (blackboard dump), `/cp activate <id>` (manual advance — bypasses gates, records `manual` source), `/cp set <quality> <value>` (debug write via apply queue, mechanical source).
- UI: settings panel — story library select/load/import (raw JSON textarea/file), validation errors displayed from `parseStoryV2`; drawer — active checkpoint, objective, blackboard table (key/value/source/latched), requirements badges.
- `{{story_blackboard}}` macro (via `MacrosParser`, already wrapped): compact gate-relevant state memo (DnD-framework pattern — feeds the *model*, not just the drawer), plus an optional AN-injection toggle; plan 13's full macro set absorbs it.
- Update `scripts/debug/so-state.mjs` to the v2 state shape (chat_metadata based).

## Implementation notes

- Boundary detection is the subtle part: ST fires `GENERATION_ENDED`/message events in varying orders across streaming/non-streaming and group queues. Instrument first (debug log event sequences via a throwaway listener + `st-chat.mjs`), then encode. v1's `turnController` had signature-dedup + epoch tracking — consult git history if needed.
- Group rounds: one user message can trigger several member replies. Boundaries between member replies are permitted (a fully rendered reply is a boundary), so a checkpoint may advance mid-round and its effects apply to subsequent members; cast changes take effect from the next draft. Verify ST's group queue behavior instrument-first and record the observed semantics; if mid-round effects prove disruptive, defer *effects* (not state commits) to round end — record the decision either way.
- Pending apply-queue writes are not persisted; a reload drops them (stall reconciliation, plan 03, recovers).
- Effects must be idempotent per activation (re-hydration must not re-fire `onEnter` replies; persist per-checkpoint fired counters in runtime state).
- Story selection stays per chat: store selected story hash in the same chat_metadata blob (not localStorage).
- `so-state.mjs` reads persisted state — keep the persisted shape debug-friendly (plain JSON, no class instances).

## Validation gate

1. Baseline commands green.
2. Live Playwright sequence (scripted, repeatable):
   - `st-navigation.mjs recent-group` → load fixture story (message_count-gated 3-checkpoint story) via settings UI or `/cp` import.
   - `st-actions.mjs send` × N → `so-state.mjs current` shows checkpoint advanced exactly at the gate, at a boundary (never mid-generation).
   - Two-member round: a gate that opens after the first member's reply — record whether the second member generated under the new checkpoint's effects (this documents the group-boundary semantics for later plans).
   - Mutation: advance a checkpoint via a mechanical gate, then delete the triggering message → checkpoint and blackboard revert, effects re-derived (AN/WI back to prior checkpoint's); swipe path likewise.
   - Effects verified: author note set (`st-context.mjs` extension prompts), WI entry toggled, one `onEnter` NPC scripted reply injected once (not re-fired after reload).
   - Reload chat (`st-navigation.mjs recent-group`) → state hydrated identically.
3. `/cp list|state|activate|set` all function; `{{story_blackboard}}` resolves in an AN template with live values.

## Delegated decisions

Exact chat_metadata blob layout; boundary heuristics details (must be recorded in Gate record); how much of v1 PresetService composition survives vs simplification; drawer visual design.

## Gate record

Date: 2026-07-04

Baseline:
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed: 1 suite, 12 tests.
- `npm run build` passed with warnings only: stale Browserslist data and webpack asset/entrypoint size over 244 KiB (`dist/index.js` 263 KiB).

Live checks:
- `node scripts/debug/st-navigation.mjs recent-group` passed: opened group `1759606632088`, chat `2026-03-26@12h08m16s199ms`, user `Max`.
- `node scripts/debug/so-runtime-check.mjs` passed: imported `Runtime Gate Check`, `/cp state` returned no parser error, `/cp set found_key true` advanced `start -> door`, `onEnter` scripted reply fired once (`door:onEnter:DM Narrator:0 = 1`), `{{story_blackboard}}` resolved with live values, `/cp activate end` persisted active checkpoint `end`.
- `node scripts/debug/so-state.mjs current` passed after reopening recent group: read `chatMetadata.story_orchestrator`, version `2`, selected story `v2-8373d2be`, active checkpoint `end`, boundary `3`, fired reply counter persisted.
- `node scripts/debug/st-actions.mjs generation-state` passed: `isGenerating: false`.
- `node scripts/debug/so-ui.mjs all` passed for extension load: settings and drawer mounted. It starts on the welcome screen, so the generic drawer dump is empty unless a chat is opened first; `so-state.mjs current` now opens recent group before reading state.

Boundary and persistence decisions:
- TurnBridge commits on `MESSAGE_RECEIVED` / `CHARACTER_MESSAGE_RENDERED`, debounced by 250 ms to avoid duplicate host events.
- If any generation is in flight, a boundary is queued and committed on `GENERATION_ENDED` / `GENERATION_STOPPED`; quiet and loud generations both block commits.
- Group member replies are treated as boundaries. In the live check, an `onEnter` scripted `/sendas` reply produced an additional boundary after checkpoint activation.
- Chat mutations subscribe to `MESSAGE_SWIPED`, `MESSAGE_EDITED`, `MESSAGE_DELETED`, and `MESSAGE_UPDATED`; rollback currently maps message id to nearest engine boundary and re-applies restored checkpoint effects.
- Runtime state persists in `chatMetadata.story_orchestrator = { version, selectedStoryHash, stories }`, keyed by story hash. Saves call both `saveMetadataDebounced()` and immediate `saveMetadata()` so reload checks are durable.
- Story library records live in extension settings under `v2Stories`; selected story remains per chat in chat metadata.

Deviations / incomplete plan items:
- Mechanical live check used `/cp set found_key true` instead of `st-actions.mjs send × N`; extractor is plan 03, and `/sendas` scripted replies were enough to verify boundary commits.
- Two-member group-round semantics were not fully validated with a model-generated multi-member round. Current decision remains spec-aligned: every rendered member reply is a boundary and effects can apply before subsequent members.
- Real delete/swipe mutation was not validated live. Event subscriptions and rollback path are wired, but the gate used persisted state checks instead of destructive chat edits.
- WI toggling was implemented via existing `enableWIEntry` / `disableWIEntry` wrappers but not live-verified because the active test chat has no known disposable lorebook entry.
- LLM NPC replies use `/trigger await=true <member>`; the old v1 loud-generation intercept semantics were not fully reintroduced beyond keeping `globalThis.talkControlInterceptor` as a no-op. Scripted NPC replies are functional and persisted with counters.
- Preset effects accept a named preset or inline settings object and apply through `applyTextGenPresetRuntime`; v1 composition/base-preset merging was not restored.
