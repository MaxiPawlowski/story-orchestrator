# Stepped Thinking — v2.4 review

Author Cierru · repo https://github.com/cierru/st-stepped-thinking · commit `9b58956` (2026-01-09, manifest 3.2.3) · 202 upvotes / 2392 msgs · source available: **y** (`source/`, 4.9k lines JS). **Installed on this ST as v3.2.0** (`public/scripts/extensions/third-party/st-stepped-thinking/`), not disabled in ST, its own `is_enabled: false`, `mode: embedded` (read from `data/default-user/settings.json`). Listeners are live; thinking runs only for a per-character override or `/stepthink-trigger`.

## What it is
Prompt chaining in front of the reply. Before the character answers, it runs N user-defined "thinking prompts" (default: Thoughts, Plans) through the MAIN model as quiet generations. It stores the results on the reply message and injects the last K thought sets back into later prompts. Thoughts render as a collapsible block above the message, with per-thought edit, regenerate and delete. In groups, each member sees only its own thoughts, except a per-character "mind reader" flag. The deprecated "Separated" mode posted thoughts as real chat messages instead.

## How it works
- **Trigger, on the reply path and blocking.** `GENERATION_AFTER_COMMANDS` → `runChatThinking` (`source/thinking/engine.js:56,186-200`). This is awaited inside ST's `Generate` (ST `script.js:4321`), so the loud generation waits for every thought. Types: `normal` only in solo; `normal|group_chat` in groups, and only while `is_group_generating` (`engine.js:504-519`). Swipe, regenerate, continue and impersonate never think, so a swipe reuses the thoughts already bound to the message.
- **The LLM call.** `context.generateQuietPrompt({quietPrompt, skipWIAN, responseLength, forceChId})` per prompt (`engine.js:448-479`). Same main model, full chat prompt plus the quiet instruction. The instruction's template includes "Pause your roleplay…" (`settings/settings.js:690`). A min-length re-ask loop has **no bound** (`engine.js:452-471`). A regex sanitizer runs on the output (`engine.js:473-476`). `generation_delay` sleeps between calls (`engine.js:370-376`). "Using a different API for thoughts" is still on their roadmap (README).
- **Input lock.** `#send_textarea` is set readonly with a placeholder, and a sticky toastr says "{{char}} is thinking…" and then "Done!" (`engine.js:401-442`).
- **Persistence.**
  - In flight: `chatMetadata.thought_generation` + `thought_target_message_id` (`mode.js:341-366`).
  - On `MESSAGE_RECEIVED`: copied onto the message object as `message.character_thoughts` (`{thoughts_id, title, is_hidden, thoughts[]}`), then `saveChatDebounced` (`mode.js:1123-1139`, `engine.js:59`).
  - Per-character settings live in `extension_settings` and are keyed by **avatar**. An `APP_READY` migration moves them over from name keys (`settings/settings.js:44,88-103`).
- **Injection.** One `setExtensionPrompt` per thought set:
  - Key `[orderPrefix_]STEPTHINK_THOUGHT__<uuid>`, `IN_CHAT`, `scan=true`, configurable role (`mode.js:1573-1591`).
  - **Depth is computed per message**: count non-system messages from the end, with offset 0 on swipe and 1 otherwise (`mode.js:1071-1096`). Each thought block therefore lands right next to the reply it belongs to.
  - All keys are purged by prefix before each generation (`mode.js:1555-1563`, `makeLast` on `GENERATION_AFTER_COMMANDS`, `engine.js:57`).
  - The `thoughts_prompts_order_prefix` setting exists because ST sorts extension prompts by key (ST `script.js:3309-3310`).
- **Visibility (epistemics lite).** `is_hidden` is recomputed on every run (`mode.js:1215-1225`):
  - hidden if the message is system, or K thoughts are already revealed for that speaker, or the thought belongs to another speaker and the current character is not `is_mind_reader` (`mode.js:1045`, `settings/settings.js:397`).
- **Name attribution by late prompt rewrite** (`prompt_adjustment.js`).
  - Inject a text padded with `۞` (2 tokens each) so that ST's context budget reserves room for the longer final form.
  - Then, first in line on `GENERATE_BEFORE_COMBINE_PROMPTS` (TC) or `CHAT_COMPLETION_PROMPT_READY` (CC), find the injected message by trimmed-content equality and swap in the instruct-formatted, name-attributed text or the CC `name` field (`prompt_adjustment.js:8-9,21-48,80-128`).
- **Mutation handling.**
  - Thoughts ride the message, so a delete removes them.
  - `MESSAGE_DELETED` re-renders and re-hides (`engine.js:60`).
  - `GENERATION_STARTED` binds or orphans intermediate thoughts (`engine.js:55,119-143`).
  - `GENERATION_STOPPED` unlocks the input (`engine.js:50,209-224`).
  - No `MESSAGE_SWIPED` or `MESSAGE_EDITED` handling. Thoughts are message-level, not swipe-level.
- **Regenerating a past thought.** It **hides every later message** by toggling `is_system` via `hideChatMessageRange` (which saves the chat), regenerates, then reveals them again (`mode.js:1177-1206,1287-1371`).
- **Cross-extension "generation mutex".** Custom `GENERATION_MUTEX_CAPTURED/RELEASED` events on ST's `eventSource` (`interconnection.js:5-61`). The check is `async` but is called **without `await`** (`engine.js:232,261`), so `!promise` is always false and the mutex never blocks anything.
- **Separated mode (deprecated, kept for upgraded installs).**
  - Pushes a message with `is_thoughts: true`, `thoughts_for`, `owner_extension`, `extra.api:'script'`, `extra.model:'stepped thinking'`.
  - Emits `MESSAGE_RECEIVED` + `CHARACTER_MESSAGE_RENDERED` with **no type** (`mode.js:586-641`).
  - Posts as `is_system: false` by default, under the character's own name.
- **Slash commands.** `/stepthink-trigger [prompt_ids=] [name]` (`index.js:63-83`) sets ST's global `setCharacterId/setCharacterName` to aim at a group member, and swallows the resulting errors (`index.js:44-58`). `/stepthink-delete-hidden` (`index.js:99-111`).

## Overlap with Story Orchestrator
- **Private per-member knowledge.**
  - Theirs: raw generated thoughts, own-speaker visibility, a mind-reader flag.
  - Ours: a typed epistemic store (`knows/suspects/believes/unaware/hiding`) with provenance, quarantine and rollback, swapped in per drafted member (`src/runtime/coordinators/memoryCoordinator.ts:486`, `src/memory/epistemic.ts:110`).
  - We are better on structure and rollback. They have "intent/plans" (we have no tag for it) and an omniscient-reader override (we have none).
- **Extra LLM compute.** They put N main-model calls **on the reply path**. We keep the reply path LLM-free and run passes off-path on a separate profile (baseline invariant 5; `.claude/sillytavern-docs/community/prompting-memory-prior-art.md:460` already records this trade-off).
- **Rollback on mutation.**
  - Theirs: data rides the message, so delete is implicit; swipes keep stale thoughts.
  - Ours: explicit cross-store rollback (`src/runtime/rollback.ts:35`).
- **Injection.** Ours are fixed-depth registry blocks (`src/constants/injectionRegistry.ts:12`), always `scan=false` and system role (`src/services/stHost/extensionPrompts.ts:24`). Theirs are message-anchored depths, `scan=true`, and the role is configurable.
- **Settings keyed by avatar vs ours by name.** Our roster resolves by display name (`src/runtime/roster.ts:49` `rosterIdForName`). Theirs survives a rename; ours does not. This is minor, because a story's roster is authored by name on purpose.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | One-turn blocks survive a nested quiet generation | host-integration | engine/memory/stagecraft (runtime) | absent | 4 | M |
| 2 | Coexistence probe: nested quiet generation inside a loud turn | testing | harness | absent | 4 | S |
| 3 | `[intends]` epistemic tag (private plans, off-path) | enhancement | memory | partial | 3 | M |
| 4 | Omniscient reader: authored roster flag that gets every member's private rows | enhancement | memory/talk | absent | 3 | M |
| 5 | Treat foreign "about-a-message" posts (`is_thoughts`/`owner_extension`) as non-turns | host-integration | host (TurnBridge, extraction) | absent | 2 | S |
| 6 | Per-block `scan` flag so a memory tier can trigger World Info | enhancement | memory/host | absent | 2 | S |

**1. One-turn blocks survive a nested quiet generation.**
- *What:* ST fires `GENERATION_STARTED(normal)` (ST `script.js:4299`) before `GENERATION_AFTER_COMMANDS` (`:4321`). Stepped Thinking then awaits `generateQuietPrompt` inside that window (`source/thinking/engine.js:56,453`). Each quiet call is its own `Generate('quiet')` (`script.js:3108`), and it ends through `unblockGeneration → activateSendButtons → hideStopButton`, which **emits `GENERATION_ENDED`** (`script.js:5693-5703,7075-7079,3532-3536`). It also deletes `body.dataset.generating` mid-turn.
- *What that does to us (read from code, not reproduced live):*
  - `GENERATION_STARTED('quiet')` calls `withholdPrivateKnowledge()` (`src/runtime/runtimeManager.ts:633`, `memoryCoordinator.ts:482`).
  - `GENERATION_ENDED` calls `clearPrivateInjection` + `clearCopilotNudge` + `clearContinuityNote` (`runtimeManager.ts:634`, wired at `src/runtime/index.ts:189-192`).
  - Net effect: in a group, the drafted member's private block, the one-turn Nudge and the warden note are **gone before the real reply's prompt is assembled**.
  - The warden note is also already marked `applied` (`stagecraftCoordinator.ts:464`), so it is lost for good rather than retried.
- *Fix shape:* track the outermost loud generation. Ignore `GENERATION_ENDED` while a loud turn is open and a nested quiet one ran inside it. Clear the one-turn blocks on the loud turn's reply render or `GENERATION_STOPPED` instead.
- *Alternative:* ST's `setExtensionPrompt(..., filter)` 7th arg (`script.js:8926`) would let a block gate itself at assembly time. Our seam's type omits it (`extensionPrompts.ts:6`).
- *Open question:* should a quiet call with `force_chid` equal to the drafted member (its own inner voice) keep its private block? Today it is withheld (gotcha: quiet drafts a member, `group-chats.js:1008/1021`).
- *Also exposed:* any extension or STscript using `/gen` inside a turn.
- *Invariants:* none strained; it enforces #16 ("a write that changes injected state refreshes its own injection") at the lifecycle level.

**2. Coexistence probe.**
- *What:* a scenario step that registers an in-page `GENERATION_AFTER_COMMANDS` listener which awaits one `generateQuietPrompt`. Then assert that the loud request captured at `GENERATE_AFTER_DATA` still carries the epistemic, Nudge and warden blocks. This reproduces idea 1 without depending on the third-party install.
- *Also:* one journey with the installed st-stepped-thinking switched on for a member, since it is already on this box.
- *Our evidence:* no `GENERATION_AFTER_COMMANDS|generateQuietPrompt` anywhere in `src/`, `scripts/` or `test/` (grep). The gotchas list Stepped Thinking only for Separated-mode boundaries (`.claude/rules/gotchas.md:68`).
- *Fit:* matches the real-LLM live-gate rule (#20). It needs a real backend for the quiet call.

**3. `[intends]` epistemic tag.**
- *What:* their value comes from "Plans" (a character's private goal), which is not the same as knowledge. Add `intends` to the private tags (`src/memory/epistemic.ts:102-121` renders only `knows/suspects/believes/unaware/hiding`). The existing P2 epistemic pass extracts it off-path, and the per-member block renders it as "You intend: …".
- *Their evidence:* `settings/settings.js:705` (default Plans prompt), `mode.js:1071-1096`.
- *Fit:* stays off the reply path (#5), inherits provenance, quarantine and never-to-WI (#15).
- *Risk:* extraction infers intent from narrative instead of generating it, so recall will be low on reticent characters. It needs its own live-suite fixtures before it counts. Agency policy applies: never an intent attributed to the player.
- *Rejected form:* their on-path pre-reply call. It conflicts with #5.

**4. Omniscient reader.**
- *What:* `is_mind_reader` gives a member every other member's thoughts (`mode.js:1045,1222-1225`; `settings/settings.js:397`). For us, a narrator/GM member in a group (the Adolion narrator pattern) would get the union of the cast's private rows, rendered in third person ("Kael is concealing the theft from Lyria") instead of the empty resting block.
- *Our evidence:* the private block filters to the subject's own rows (`epistemic.ts:97-111`). `onMemberDrafted` stages per roster id only (`memoryCoordinator.ts:486-498`).
- *Fit:* an authored story/roster field (story record = config home #13), prompt-only, never WI (#15), never the player surface (#9).
- *Watch:* token budget (`capEpistemic` per subject), and a narrator leaking secrets into prose. The agency/"never narrate what you conceal" header needs a narrator variant.

**5. Foreign non-turn markers.**
- *What:* Separated-mode posts carry `is_thoughts: true` + `owner_extension` and emit untyped `MESSAGE_RECEIVED`/`CHARACTER_MESSAGE_RENDERED` (`mode.js:597-641`). Today they commit a boundary and enter extraction windows as the character's own speech.
- *Our evidence:* `NON_TURN_MESSAGE_TYPES` is type-only (`src/runtime/turnBridge.ts:9`). `chatWindow.ts:8` drops only `is_system`. Zero hits for `is_thoughts|owner_extension` in `src/`.
- *Fit:* stays a denylist (keeps the "unknown reply type must not freeze the story" rule). Deprecated mode, so value is low. Our own `/sendas` NPC replies must stay turns.

**6. Per-block `scan`.**
- *What:* they inject with `scan=true` (`mode.js:1588`), so thought text can activate World Info. Ours hard-code `false` (`extensionPrompts.ts:24`). An opt-in per registry entry (e.g. the `facts`/`scene` tiers) would let remembered places and people pull their lore entries.
- *Fit:* it interacts with judge lore selection (`src/runtime/loreSelect.ts:33`) and gated `world_info` (#14 is untouched, since activation is not a write). It needs measurement of budget crowding. It is small but a behaviour change, so it ships off by default.

## Patterns to copy / anti-patterns to avoid
Copy:
- Message-anchored injection depth (count non-system messages, swipe offset 0) for any artifact that belongs to one reply (`mode.js:1080-1090`).
- Purge extension prompts by key prefix, and put an order prefix in the key, because ST sorts by key (`mode.js:1555-1563`, `settings.js:159`).
- Key per-character config by avatar, with a one-shot `APP_READY` migration from names (`settings.js:44,88-103`).
- Visible "X is thinking…" plus a locked input with an explanatory placeholder while extra work blocks the turn (`engine.js:401-442`). We don't block, but a similar HUD cue fits if we ever do.

Avoid:
- **Blocking the reply path with N main-model calls.** This is exactly the cost we designed out.
- **An unbounded retry loop** on output length (`engine.js:452-471`). It spends tokens forever on a model that answers short.
- **An `async` guard called without `await`** (`engine.js:232,261`). The mutex is decorative. The same "a return value nobody reads looks like success" class as our WriteResult rule.
- **Mutating real chat state for a temporary view.** Toggling `is_system` on later messages (and saving) to regenerate a past thought (`mode.js:1177-1206`) leaves the chat hidden on a crash. Concurrent readers (our `chatWindow.ts:8` skips `is_system`) also see a truncated chat. Our source-window re-read (`memoryQueue`) is the pure alternative.
- **Setting ST's global `setCharacterId` to aim at a group member, then swallowing the errors** (`index.js:44-58`).
- **Finding its own injection by trimmed-content equality, after padding it with filler symbols** (`prompt_adjustment.js:23,37`). It breaks on any other extension rewriting the prompt, and it only warns.

## ST host facts learned
- `GENERATION_AFTER_COMMANDS(type, opts, dryRun)` is awaited inside `Generate`, and handlers can run whole generations there before prompt assembly (`engine.js:56`; ST `script.js:4321`).
- `eventSource.makeFirst` / `makeLast` exist for ordering handlers (`engine.js:57`, `prompt_adjustment.js:21,35`).
- `generateQuietPrompt({quietPrompt, skipWIAN, responseLength, forceChId})` uses the object form. `forceChId` targets a group member, and `responseLength` is temporary (`engine.js:453-458`; ST `script.js:3084-3116`).
- **A quiet generation emits its own `GENERATION_STARTED('quiet')` and `GENERATION_ENDED`, even nested inside a loud one.** It also clears `body.dataset.generating` (ST `script.js:3108,5693-5703,7075-7079`).
  - Our gotchas treat `dataset.generating` as "sturdier than the `#send_but` swap". It is not sturdy across nested quiet calls.
  - This **contradicts our assumption** that `GENERATION_ENDED` = the loud turn ended (idea 1).
- `setExtensionPrompt(key, value, IN_CHAT, depth, scan, role)`: `scan=true` makes the text visible to the WI scan (`mode.js:1583-1590`). Extension prompts are assembled in sorted-key order (ST `script.js:3309-3310`). A 7th `filter` arg exists (ST `script.js:8926`).
- Late prompt rewrite hooks: `GENERATE_BEFORE_COMBINE_PROMPTS` (`event.finalMesSend[].message`, TC) and `CHAT_COMPLETION_PROMPT_READY` (`event.chat[]`, CC) (`prompt_adjustment.js:21-48`).
- `hideChatMessageRange(start, end, unhide)` flips `is_system` and saves the chat (`mode.js:1186,1201`; ST `chats.js:157,168`).
- `formatInstructModeChat` and `oai_settings.names_behavior` (−1 none, 0 default, 1 completion, 2 content) decide how a name prefix reaches the model (`mode.js:1707-1734`, `prompt_adjustment.js:113,154`).
- Separated mode confirms our gotcha: untyped `MESSAGE_RECEIVED` + `CHARACTER_MESSAGE_RENDERED` from an extension-posted message (`mode.js:636-640`). It commits a boundary under our TurnBridge denylist, which is consistent with `gotchas.md:59,68`.

## Verdict
**Relevance: medium.** Stepped Thinking does not reach any of our core subsystems. The one thing worth taking is what it exposed, not what it does: **our one-turn injections (the drafted member's private epistemic block, the Nudge, the warden note) are cleared by `GENERATION_ENDED` from any quiet generation nested inside the real turn** (idea 1). The extension that does exactly that is installed on this box. Fix it together with its probe (idea 2). `[intends]` and the omniscient reader (ideas 3–4) are the only feature ideas, and both fit off-path.
