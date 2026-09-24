# ST Generation Locks (STGL) — v2.4 review

Author Aiko Apples (aikohanasaki) · repo https://github.com/aikohanasaki/SillyTavern-GenerationLocks · commit `f0ad9a5` (2026-03-13, manifest 1.2.4) · 7 upvotes / 480 msgs · source available: **y** (`source/`: `index.js` 2800 lines, `promptManager.js`, `migration.js`)

## What it is
- Merge of the author's Character Locks (STCL) + CC Prompt Manager (CCPM). **Chat Completion only.**
- "Locks" 3 host items: connection profile, generation preset, CC prompt-manager "template" (prompts + prompt order snapshot).
- 5 dimensions: character, model, chat, group, individual-in-group. Each item resolves independently by a user-ordered priority (default Model > Chat > Character/Group).
- Auto-apply mode never / ask / always on context change and on generation start; status line injected above ST's prompt-manager list.
- No LLM calls, no prompt injection, no story logic. It is a settings switcher.

## How it works
- **Imports** host modules by relative path (`index.js:7-15`): `script.js`, `extensions.js`, `group-chats.js` (`selected_group`, `groups`, `editGroup`), `slash-commands.js`, `openai.js` (`oai_settings`, `promptManager`, `getChatCompletionModel`).
- **Context id**: `primaryId` = `groupId` in groups (`index.js:135`), **character name** in solo chats (`:153`). No chat id in the guard.
- **Storage** (README §Storage, code): character locks `extension_settings.STGL.characterLocks[chId|name]`; model locks keyed by `getChatCompletionModel()`; chat lock `chat_metadata.STGL` + `saveMetadataDebounced` (`:378-406`); group lock written onto the group object `group.stgl_locks` then `editGroup(id,false,false)` (`:429-455`); templates in extension settings.
- **Resolution** (`:561-717`): cascade built from priority order, CHARACTER swapped for GROUP in groups (`_buildCascade :561`); first non-null value per item wins, profile never from Model (`_resolveItem :595`); `detectConflicts :685` lists items with >1 distinct candidate (debug log only, `:1225`).
- **Apply** (`_applyLocksToUI :1263`): strict order profile → preset → template; snapshots before/after and toasts only when something actually changed (`:1326`). Each locker re-reads `primaryId` right before its host write and aborts on mismatch (profile `:894`, preset `:971`, template `:1153`).
  - profile: current read from `extension_settings.connectionManager.selectedProfile` (`:844`), switch via `executeSlashCommandsWithOptions('/profile <name>')` (`:901`), unquoted.
  - preset: current read `oai_settings.preset_settings_openai` (`:925`), switch via `/preset <name>` (`:978`), unquoted, no post-switch equality check.
  - template: `promptManager.setPrompts(...)`, remove+add prompt order for `activeCharacter`, `saveServiceSettings()` (`:780-822`); equality check by identifier + content + role/injection fields + order/enabled (`compareWithTemplate :1013`).
- **Events** (`registerAllEventHandlers :1903`): `CHAT_CHANGED`, `GROUP_CHAT_CREATED`, `GENERATION_STARTED` (**sync wrapper `() => onContextChanged(...)` at `:1908` → the async apply is not awaited**), `GROUP_MEMBER_DRAFTED` (async, awaited by ST), `OAI_PRESET_CHANGED_AFTER`, `SETTINGS_UPDATED`, `SETTINGS_LOADED_AFTER`; boot on `APP_READY` (`:2789`).
- **Individual-in-group** (`onGroupMemberDrafted :1665`): resolves normal winners, overlays the drafted member's own lock only on items whose winner is Group, applies via the same locker path.
- **Preset → template drift** (`onPresetChanged :1721`): after any CC preset switch, compares prompts to the locked template; always = restore, ask = popup "Restore Template / Keep New Template".
- **Ask mode** (`_shouldApplyAutomatically :1401`): confirm popup listing each value and the dimension it came from; only asks when something would change.
- **Status line** (`updateDisplay :1806`): winner + source per item, orange "(not active)" when the live host value ≠ locked value. Kept fresh by **monkey-patching `promptManager.render`** (`:2719-2727`).
- **Migration** from STCL/CCPM with a backup copy first (`migration.js:15-130`, `backup :110/:277`).
- Mutation handling: none (no chat-state semantics; swipes/edits irrelevant). Queue debounce + `isApplyingSettings`/`isHandlingPresetChange` flags (`:1338`); CHANGELOG 1.2.3 "fix generation apply loop".

## Overlap with Story Orchestrator
- Per-context model selection: SO never switches the global connection. Every memory/extraction pass calls a Connection Manager profile **by id** without touching the user's selected profile (`src/services/stHost/connectionProfiles.ts:43` `sendConnectionProfileRequest`; `:39` reads `selectedProfile` only). Strictly better for off-path work: no global state, no restore, no race with the reply.
- Preset switching: SO's checkpoint `preset` effect is **textgen-only** and refuses on CC (`src/services/stHost/presets.ts:36-45` `presetBackend`/`PRESET_UNSUPPORTED_REASON`; `src/runtime/effectsApplier.ts:226-232`). STGL is the inverse (CC-only). Open seed "OpenAI/chat-completion preset adapter" (`docs/plans/v2.3/v2.4-seeds.md:16`).
- Race guard: SO `RunToken` is chat-scoped and re-checked before each write (`src/runtime/runToken.ts:138`); STGL's `primaryId` is character name / group id — same class of bug SO already fixed (talk decision key, gotchas).
- Restore on leave: SO owned-effect ledger with write-ahead row + compare-and-set restore (`src/runtime/effectLedger.ts:72,112`). STGL never restores; locks overwrite global settings permanently.
- Drift reading: SO reconciles the ledger **only on load/hydrate** (`src/runtime/runtimeManager.ts:532`). STGL reads live host vs intended on every settings/prompt-manager render. STGL better here, narrowly.
- Accept modes: STGL never/ask/always ≈ SO curator `review|auto|off` (`src/stagecraft/types.ts:9`). Same shape, SO journals + reverts.
- Group member draft hook: SO already uses `GROUP_MEMBER_DRAFTED` for the per-member private epistemic block (`src/runtime/index.ts:188`).
- Settings lifetime: SO has fixed homes (install / chat override / story); STGL's user-ordered multi-dimension priority is more flexible, but SO's fixed homes are deliberate (invariant 13).

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | CC preset adapter = `/preset` for the active API + exact-name read-back + prompt-manager side-effect handling | host-integration | stagecraft (effects) | absent | 3 | M |
| 2 | Live drift read for owned effects on `PRESET_CHANGED` / `OAI_PRESET_CHANGED_AFTER` (author view shows "not active", never re-applies) | enhancement | stagecraft / effect ledger | partial | 2 | S |
| 3 | Anti-pattern set: unawaited `GENERATION_STARTED` apply, name-keyed race guard, fuzzy `/preset` without read-back, monkey-patched host render | anti-pattern | host | present (we avoid all four) | 2 | S |
| 4 | Per-roster-member preset/profile on `GROUP_MEMBER_DRAFTED` (e.g. narrator on another sampler stack) | new-feature | talk / stagecraft | absent | 1 | L |

**1. CC preset adapter.** What: answer the open contract seed with a concrete mechanism. Their evidence: CC preset switch via `/preset <name>` (`index.js:978`) and read of `oai_settings.preset_settings_openai` (`:925`); template-drift handler exists because a CC preset carries the prompt list (`:1721-1790`). ST source (verified by me, not theirs): `/preset` resolves `getPresetManager()` for `main_api`, exact match else **Fuse fuzzy match** (`public/scripts/preset-manager.js:917-970`, `:83`); `onSettingsPresetChange` copies `prompts` and `prompt_order` (`openai.js:377-378`), `extensions`, and, when `bind_preset_to_connection`, the connection fields too (`openai.js:5044-5074`), then emits `OAI_PRESET_CHANGED_AFTER` + `PRESET_CHANGED {apiId:'openai'}` (`:5078-5079`). `OAI_PRESET_CHANGED_BEFORE` hands subscribers the mutable `preset` object before deltas apply (`:5034-5041`). Our evidence: refusal at `presets.ts:41`, effect path `effectsApplier.ts:226-232`. Fit: a CC preset effect is **not a sampler change, it replaces the user's prompt manager** (and maybe the connection) — that is the answer to the seed's contract question. If built: adapter in `stHost/presets.ts` → `WriteResult` (inv 16), exact-name check via `getSelectedPresetName()` after the switch (fuzzy match = `couldNot`), ledger row with before-name for compare-and-set restore (inv 21 changes deliberately), and either strip `prompts/prompt_order/connection` in an `OAI_PRESET_CHANGED_BEFORE` listener gated to our own write, or refuse presets with `bind_preset_to_connection`. Live check must assert samplers changed AND prompt order did not.

**2. Live drift read.** What: STGL marks a locked value "(not active)" whenever the live host value differs (`index.js:1806-1898`), refreshed on `SETTINGS_UPDATED`/render. Ours: `reconcileEffectLedger` runs only at hydrate (`runtimeManager.ts:532`); `PRESET_CHANGED` is typed (`stHost/events.ts:35`) but only emitted by us (`presets.ts:97`), never subscribed. Fit: read-only — subscribe, re-read the ledger's `applied` rows, mark `externally-changed` in the author-only `EffectLedgerPanel` (label exists, `DrawerTabs.tsx:348`). Must ignore our own emit (`presets.ts:97`) and must not re-apply (user change wins, matches compare-and-set). No invariant strain; per-chat write → `RunToken` check (inv 10).

**3. Anti-patterns (confirming our rules).** (a) `GENERATION_STARTED` listener is a sync wrapper (`:1908`) so `/profile`/`/preset` land after `Generate()` has moved on; ST's `emit` awaits async listeners serially (`public/lib/eventemitter.js:130-150`), so returning the promise would have made it blocking — they got neither the safety nor a clean off-path. CHANGELOG 1.2.3 "generation apply loop" is the symptom. (b) Race guard on character name / group id (`:135`, `:153`) cannot tell two chats of one character apart. (c) `/preset ${name}` unquoted + fuzzy host match, no equality read-back → a renamed/deleted preset silently loads a neighbour. (d) `promptManager.render` monkey-patch (`:2719`) + `window.stglSettingsManager` global (`:2775`). SO already avoids each (typed seams, chat-scoped tokens, `quoteSlashArg` strict mode, no host patching). Value: keep as review checklist for idea 1.

**4. Per-member preset/profile.** What: `onGroupMemberDrafted` switches profile/preset for the drafted member (`:1665-1716`); ST awaits `GROUP_MEMBER_DRAFTED` before that member's `Generate()` (`group-chats.js:1059-1063`), so the window is real. Ours: `onMemberDrafted` swaps only the private epistemic block (`runtime/index.ts:188`); roster has no sampler/profile field. Fit: weak. Global profile switching mid-wrapper adds reconnect latency on the reply path (`/profile` awaits connection) and needs restore after the wrapper — strains inv 5 spirit and 21. Park unless an author asks.

## Patterns to copy / anti-patterns to avoid
- Copy: before/after snapshot → notify only on real change (`index.js:1326`). Our effect toasts/journal could skip no-op re-applies the same way (ledger already de-dups by target? verify before adopting).
- Copy: ask-mode confirm names each value **and where it came from** (`:1462-1478`). Matches our "consequence first" copy rule; useful for idea 1's keep/restore prompt.
- Copy: migration makes a backup copy before converting a predecessor's data (`migration.js:110`). We migrate blobs in place (v2→v3→v4); a pre-migration copy in the journal would make a bad migration recoverable. Low priority.
- Avoid: global host switching for per-context model choice (we call profiles by id already).
- Avoid: unawaited host writes on generation events; name-keyed context guards; fuzzy name resolution without read-back; monkey-patching host methods; storing extension state on host objects (`group.stgl_locks`) — it rides into the group JSON file and survives uninstall.
- Avoid: popups at `GENERATION_STARTED` (ask mode prompts while the generation already runs with the old settings).

## ST host facts learned
- `GROUP_MEMBER_DRAFTED` fires per member, awaited, before that member's `Generate()` (their use `index.js:1665`; host `group-chats.js:1059-1063`). Consistent with our gotchas.
- `/preset <name>` works for Chat Completion (acts on the preset manager of `main_api`); exact match, else **fuzzy** (their use `index.js:978`; host `preset-manager.js:917-970`). Matches our gotcha "`/preset` fuzzy-matches".
- Current CC preset name = `oai_settings.preset_settings_openai` (`index.js:925`; host `openai.js:5024`).
- Selected CM profile = `extension_settings.connectionManager.selectedProfile` → `profiles[].name` (`index.js:844-852`). Agrees with our `connectionProfiles.ts:39`.
- A CC preset switch rewrites `oai_settings.prompts` + `prompt_order` (+ connection fields when `bind_preset_to_connection`) and emits `OAI_PRESET_CHANGED_AFTER` (their handler `index.js:1721`; host `openai.js:377-378, 5044-5079`). **Extends** our `presets.ts` comment: on CC a preset is prompt state, not only a sampler stack.
- Extension data can be stored on the group object and persisted with `editGroup(id, false, false)` (`index.js:437-438`); we already call the same signature for `disabled_members` (`stHost/groups.ts:47`).
- `getChatCompletionModel()` exported from `openai.js` gives the active CC model name (`index.js:13, :200`).
- No contradictions with our gotchas found.

## Verdict
Relevance **low**. A generation-settings switcher; no story, memory or prompt logic. The one thing worth taking: its evidence for the open CC-preset seed — on Chat Completion a preset switch replaces the prompt manager (and possibly the connection), so a v2.4 adapter must strip or refuse those parts and read back the exact name. The rest either confirms rules we already enforce or is an anti-pattern.
