# Tracker — v2.4 review

Author: Kaldigo · repo `kaldigo/SillyTavern-Tracker` · commit `65e0acb` 2025-07-26 ("Fix: Workaround for new normal type generation"), manifest `0.0.2` · 167 upvotes / 4843 msgs · **source available: yes** (plain JS, ~7.5k lines, no build). Paths below are relative to `C:/dev/st-extensions-research/tracker/`. **The same commit is installed on this ST** (`public/scripts/extensions/third-party/SillyTavern-Tracker`, `diff -rq` empty), and it is **disabled** there (`settings.json` `disabledExtensions` lists `third-party/SillyTavern-Tracker`). It shares the "generation mutex" protocol with Stepped Thinking, which is also installed.

## What it is
- A per-message scene-state tracker. A user-defined field tree (default: Time, Location, Weather, Topics, CharactersPresent, and per-character Hair/Makeup/Outfit/StateOfDress/PostureAndInteraction) is filled by an LLM and stored on each chat message.
- The latest tracker is injected as a `<tracker>` YAML block at depth 0, and rendered as an HTML preview inside each message.
- It has three modes. **single-stage** makes one extra call. **two-stage** makes a "change list" call, then a structuring call. **inline** asks the main model to prepend the tracker to its own reply.
- It is the genre's reference tracker, and most later trackers (WTracker, BlazeTracker, SimTracker) define themselves against it.

## How it works
- **Entry**: `source/index.js:32-43`. There are static imports of ST core modules (`script.js`, `group-chats.js`, `textgen-settings.js`…) and no context API. It subscribes to `CHAT_CHANGED`, `CHARACTER_MESSAGE_RENDERED`, `USER_MESSAGE_RENDERED`, `GENERATION_AFTER_COMMANDS` and `GENERATE_AFTER_COMBINE_PROMPTS` (debug only). It registers five slash commands through `SlashCommandParser.addCommandObject` (`index.js:46-137`): `/generate-tracker`, `/tracker-override`, `/save-tracker`, `/get-tracker` and `/tracker-state`. Each returns tracker JSON for STscript pipes.
- **Staged mode, the default: state is computed BEFORE the reply and blocks it.** `onGenerateAfterCommands` (`source/src/events.js:31-45`) awaits `prepareMessageGeneration` → `handleStagedGeneration` (`source/src/tracker.js:275-362`):
  1. It **hijacks sending.** It reads `#send_textarea`, clears it and calls `sendMessageAsUser` itself (`tracker.js:387-405`), because ST emits and awaits `GENERATION_AFTER_COMMANDS` before it appends the typed message.
  2. It calls `generateTracker(mesId)` for the *upcoming* reply (`mesId + 1`, `tracker.js:328-331`).
  3. It parks the result in `chat_metadata.tracker.tempTracker/tempTrackerId` (`tracker.js:336-339`).
  4. It injects the result via `setExtensionPrompt("tracker", yaml, 1 /*IN_CHAT*/, depth, true /*scan*/, SYSTEM)` (`tracker.js:79-90`). The depth is clamped by `minimumDepth`.
  5. When the reply renders, `addTrackerToMessage` moves the temp tracker onto `chat[mesId].tracker` (`tracker.js:412-472`).

  So the tracker is the *pre-reply* state that conditions the reply, not a record of it. The reply path waits on one or two extra LLM calls.
- **LLM call**: `generateRaw(prompt, null, false, false, systemPrompt, responseLength)`, the positional form (`source/src/generation.js:155,171`). The "system prompt" is a hand-written context template with **hard-coded Llama-3 header tokens** (`source/src/settings/defaultSettings.js:32,101,203`). It routes to another model by **globally swapping** `/profile <name>` + `/preset <name>`, sleeping 2 s, and swapping back afterwards (`generation.js:62-81, 92-117`).
- **Prompt shape** (`generation.js:200-222`): system prompt + character descriptions + auto-generated example trackers + the last N messages, each carrying its tracker, + the current tracker + a field-rules list built from the field tree (`trackerDataHandler.js:633-646`). The model must return the **full** tracker inside `<tracker>` tags, "retain the most recent value" for unchanged fields, and "assume reasonable defaults" for missing ones (`defaultSettings.js` two-stage system prompt). The parse is a regex for the tag, then YAML/JSON (`generation.js:170-189`). The result is deep-merged over the previous tracker (`generation.js:109-112`, `trackerDataHandler.js:133-160`), and unknown keys are kept in `_extraFields` (`trackerDataHandler.js:252-273`).
- **Field presence** (`trackerDataHandler.js:18-22, 311-316`) controls what is generated and what is fed back:
  - `STATIC`: generated only with `include=static`.
  - `DYNAMIC`: generated and fed back.
  - `EPHEMERAL`: generated, but excluded when past trackers are replayed into the recent-messages history (`generation.js:352` uses `DYNAMIC` without ephemerals).
- **Injection trimming**: default-valued fields are stripped before injection (`cleanTracker`, `trackerDataHandler.js:193-214`).
- **Inline mode** (`tracker.js:106-184, 210-267`) needs no extra call. It prepends `<tracker>` YAML into the `mes` text of the last N past messages, saves the chat, injects an instruction, and after the reply strips the tracker out of the new message and all past ones, saving again. On swipe it **fabricates a new swipe** whose text is the tracker, and patches the swipe counter DOM (`tracker.js:221-258`).
- **Persistence**: `chat[mesId].tracker` is a top-level message field, not `extra` (`tracker.js:424`, `trackerDataHandler.js:41-49`). Transient state lives in `chat_metadata.tracker` (`temp*`, `inlineTrackerId`, `cmdTrackerOverride`). Settings and presets live in `extension_settings.tracker` (`index.js:29-30`).
- **Mutations**:
  - Swipe/regenerate reuse the existing tracker, which is consistent because it is pre-reply state (`tracker.js:304-322`).
  - An edit is never invalidated.
  - A delete takes the message's tracker with it.
  - There is no ownership check across awaits: `saveTrackerToMessage(mesId, await generateTracker(...))` writes into whatever `chat` is current (`tracker.js:463-464`).
  - `tracker.js:352` references an undefined `lastMesReverseIndex`, so the "no new tracker, reuse the last one" branch throws.
- **Cross-extension mutex** (`source/lib/interconnection.js:6-65`): custom events `GENERATION_MUTEX_CAPTURED {extension_name}` / `GENERATION_MUTEX_RELEASED` go over `eventSource`. `isEnabled()` *captures* the mutex as a side effect of the check (`source/src/settings/settings.js:16-19`), so every handler both checks and captures. Stepped Thinking speaks the same protocol. Tracker also treats a message carrying `owner_extension` as a system message (`source/lib/utils.js:40,45-49`).
- **UI**: a settings drawer, a field-tree "prompt maker" editor (`src/ui/components/trackerPromptMaker.js:167-290`), a per-message button in `#message_template .extraMesButtons` (`src/ui/trackerInterface.js:250-253`), and an HTML preview inserted into each `.mes`. It is driven by a `MutationObserver` on `#chat` and preserves the scroll position (`src/ui/trackerPreviewManager.js:24-110`).
- **User JS**: a settings textarea is `new Function`-evaluated at every load (`settings.js:133, 608-620`) and is part of exported/imported presets (`settings.js:539, 494`).

## Overlap with Story Orchestrator
- **Separate model for state**: we call a Connection Manager profile directly, with a message array and the instruct template (`src/services/stHost/connectionProfiles.ts:43`), and never touch the user's live profile or preset. They swap them globally with a 2 s sleep. Ours is strictly better.
- **Typed deltas vs full-state rewrite**: our shared read emits closed-vocabulary `DELTA`s with an evidence quote checked against the window (`src/extraction/contract.ts:38-40`, `src/extraction/evidence.ts:28`). They regenerate the whole tree and invite invention ("reasonable defaults"). Ours is better on truthfulness. Theirs is richer on free-form scene description (outfits, posture), which our ledger `[state:Entity:type]` only partly covers (`src/memory/ledger.ts:31`).
- **Scene block**: our `SceneCoordinator` injects `story_orchestrator_scene` at depth 1 (`src/constants/injectionRegistry.ts:21`, `src/runtime/coordinators/sceneCoordinator.ts:33`). Equivalent in intent. Ours is off-path.
- **Timing**: ours is off-path and applied at the next boundary (invariants 3 and 5). Theirs is on the reply path, so every turn pays 1–2 extra generations, which buys a fresher state for the reply. We deliberately do not make that trade.
- **Mutation safety**: we have rollback across all stores (`src/runtime/rollback.ts:35`) and `RunToken` ownership (`src/runtime/runToken.ts:138`). They have none.
- **Per-message display, STscript getters, manual pre-reply edit popup**: we have no message-DOM UI (baseline §4). Author state is in the drawer, `/cp state` (`src/runtime/slashCommands.ts:73-74`, text memo) and `{{story_*}}` macros. Their per-message tracker history is the one UX edge they have.
- **Where we are behind**: every one of our injections hard-codes `scan=false` (`src/services/stHost/extensionPrompts.ts:24`), so our scene state can never trigger keyword World Info. Their block is scanned. We also ignore both community coexistence signals they rely on (`owner_extension`, the generation mutex): grep for `MUTEX|owner_extension|is_thoughts` in `src/` returns 0.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Treat extension-owned messages (`owner_extension` / `is_thoughts`) as non-turn and keep them out of extraction windows | host-integration | engine(turnBridge) / extraction | absent | 3 | S |
| 2 | Opt-in `scan` per injection-registry entry; scan the scene block so current location/cast fire keyword WI | enhancement | stagecraft / memory / host | absent | 3 | S |
| 3 | Honour the community generation mutex: defer off-path reads while a peer holds it; announce our own scripted posts | host-integration | extraction / host | absent | 2 | M |
| 4 | If current quality values enter the read prompt, add a per-quality "don't feed back" flag (Tracker's EPHEMERAL) and measure anchoring | pattern | extraction | absent | 2 | S |

**1. Extension-owned messages are not turns.**
- *What*: in `TurnBridge.onRenderedReply`, read `chat[id]` and drop a message carrying `owner_extension` (or Stepped Thinking's `is_thoughts`) before the dedupe, the same way `NON_TURN_MESSAGE_TYPES` is dropped. In `chatWindow.readMessage`, skip such messages too.
- *Their evidence*:
  - Tracker treats `owner_extension` as system (`source/lib/utils.js:40,48`).
  - Stepped Thinking's Separated mode pushes a message with `owner_extension` + `is_thoughts` and emits `MESSAGE_RECEIVED`/`CHARACTER_MESSAGE_RENDERED` with **position only, no type** (`C:/dev/st-extensions-research/stepped-thinking/source/thinking/mode.js:614,638,640`).
- *Our evidence*:
  - `turnBridge.ts:79-90` filters by `type` only.
  - `turnBridge.review.test.ts:155` knows Stepped Thinking is an untyped emitter.
  - `chatWindow.ts:8` drops only `is_system === true`.
  - `.claude/rules/gotchas.md` names the symptom: thoughts become boundaries and extraction evidence.
  - Worse for us: a character's *private thoughts* read as speech feed epistemic `[knows]` rows and could surface in another member's context.
- *Fit*: keeps the denylist philosophy. It only excludes a message that positively identifies as extension-owned, so an unknown reply type still commits. There is no invariant conflict. It needs a live check with Stepped Thinking on, via the `so-turn-types-check` style.

**2. Scannable scene block.**
- *What*: add an optional `scan: true` to `INJECTION_REGISTRY` entries and pass it through `setStoryExtensionPrompt`. Enable it for `sceneTracker` only, so "Location: guild hall / Present: Arin" activates keyword WI entries even when the last few messages never name them.
- *Their evidence*: `tracker.js:89` (scan=true). The host consumes it in `world-info.js:4719-4725` (`buffer.addInject` for every `extensionPrompts[key].scan`).
- *Our evidence*: `extensionPrompts.ts:24` and `:31` hard-code `false`. `injectionRegistry.ts:21`.
- *Fit*:
  - Keep epistemic/ledger/memory blocks unscanned. A scanned private block could pull secret-keyed lore into the prompt, which violates the spirit of invariant 15.
  - It does not touch the path replay of gated sets (invariant 14), because scanning only activates entries that are already enabled.
  - It interacts with the judge `LoreSelector`, and the next-turn preview should label scanned blocks.
  - It should be a story- or install-level toggle, off by default, and measured with `so-lore-probe`-style captures.

**3. Generation-mutex participation.**
- *What*: a new `stHost` seam that subscribes to raw custom event names. `events.ts` resolves only `eventTypes` keys, so the seam is needed. While `GENERATION_MUTEX_CAPTURED` is held by a peer (for example Stepped Thinking mid-thought, which hides and unhides messages), the scheduler defers reads until `RELEASED`, with a timeout. Optionally, emit capture around our scripted `npc_replies` / `/trigger` reconcile so Tracker and Stepped Thinking do not react to our posts.
- *Their evidence*: `source/lib/interconnection.js:22-65`, `settings.js:16-19`, and Stepped Thinking `interconnection.js:6-44`.
- *Our evidence*: 0 hits for `MUTEX` in `src/`.
- *Caveats*:
  - The protocol is advisory and buggy on both sides. Tracker's `isEnabled` captures as a side effect of a check. Stepped Thinking calls the async `generationCaptured()` without `await` (`stepped-thinking/source/thinking/engine.js:232,261`), so its guard never refuses.
  - The holder is a module global with no expiry, so a crashed holder would stall us. A hard timeout is mandatory.
- *Fit*: invariant 2 needs a new seam, and invariant 5 is fine because only off-path work is deferred. Value is low because both peers are niche and Tracker is disabled here.

**4. Feedback opt-out if current values are shown.**
- *What*: the BlazeTracker review proposed putting each in-scope quality's current value into the shared-read prompt; that idea is still absent (`contract.ts` lists keys/allowed values only). Tracker is the counter-evidence to weigh before doing it. It always feeds the current tracker back (`generation.js:205,371-390`), and its author reports that more tracker history "can make the tracker get stuck with certain values" (post.md follow-up 2024-11-06 12:46). Their mitigation is the per-field `EPHEMERAL` presence (`trackerDataHandler.js:18-22, 311-316`).
- *Proposal*: if we adopt current values, make them per-quality opt-out, and A/B them on `so-live-suite` for anchoring (a value repeated despite contrary evidence) before shipping.
- *Fit*: pure extraction change. It needs a golden refresh and does not conflict with invariant 4, because evidence is still required.

## Patterns to copy / anti-patterns to avoid
Copy (minor):
- Omit default or empty fields from injected state (`trackerDataHandler.js:193-214`). This is cheap token hygiene for our scene/ledger blocks.
- STscript-returning commands (`/get-tracker` returns JSON, `index.js:108-123`). If `/cp state` ever serves scripters, return structured JSON, not only the memo. It stays author-only.
- Keep unknown model output instead of dropping it (`_extraFields`). We already do this better with rejected-line audits.

Avoid (all present in their code; several already bit us):
- **Blocking the reply on state generation, and hijacking `#send_textarea` to do it** (`tracker.js:275-405`). This violates our invariant 5, and a failed call leaves send buttons toggled by hand (`deactivateSendButtons`, `:276-277`).
- **Global `/profile` + `/preset` swap for a side model, with `delay(2000)`** (`generation.js:62-81`). It flips the user's live connection mid-turn and races any concurrent generation. Our gotchas already note that `/profile` awaits, so the sleep is superstition.
- **Hard-coded instruct tokens in templates** (`defaultSettings.js:32,101,203`). It is model-specific and double-templated. We shipped the inverse fix at v2 acceptance, where the instruct template was bypassed.
- **Rewriting past messages' `mes` and fabricating swipes** (inline mode, `tracker.js:106-184, 221-258`). A crash between add and remove persists the YAML into the chat. It also pollutes any other extension's reading, including our extraction window.
- **A read that writes**: `isEnabled()` emits a mutex capture (`settings.js:16-19`).
- **`new Function` over settings text that travels inside importable presets** (`settings.js:133, 494, 539, 608-620`). Importing a shared preset executes arbitrary code at next load. Never let a story, preset or wizard artifact carry executable code.
- **Full-state regeneration with "assume reasonable defaults"** (two-stage system prompt). It manufactures state. Our delta + evidence contract exists to prevent that.
- **No ownership check across the LLM await** (`tracker.js:463-464`), and an undefined identifier on a fallback path (`tracker.js:352`). Both are classic untested async branches, the class our `RunToken` census targets.

## ST host facts learned
- `GENERATION_AFTER_COMMANDS` is emitted **and awaited** before the textarea message is appended: ST `public/script.js:4321` vs `sendMessageAsUser` at `:4453`. Tracker exploits this (`tracker.js:387-405`). Anything awaited in that handler delays the whole send.
- `setExtensionPrompt(key, value, position, depth, scan=false, role, filter=null)` (`script.js:8926-8935`). With `scan: true` the block is added to the World Info scan buffer (`scripts/world-info.js:4719-4725`). Tracker uses `scan=true` (`tracker.js:71,89`). Our seam always passes `false`. There is also a per-prompt `filter` param we do not use.
- `generateRaw` positional arguments are deprecated. The current signature takes one object (`{prompt, api, instructOverride, quietToLoud, systemPrompt, responseLength, trimNames, prefill, jsonSchema}`) and `console.trace`s positional calls (`script.js:4122-4126`). Tracker still calls it positionally (`generation.js:155,171`). `jsonSchema` is a first-class `generateRaw` option, which is relevant to the constrained-decoding idea in the BlazeTracker review.
- `owner_extension` is a **third-party convention, not ST core**. There are 0 hits in `public/script.js` and core `scripts/*.js`. It is set by Stepped Thinking (`mode.js:614`) and honoured by Tracker (`lib/utils.js:40,48`).
- `GENERATION_MUTEX_CAPTURED` / `GENERATION_MUTEX_RELEASED` are **custom** `eventSource` events, absent from `event_types`, shared by Tracker and Stepped Thinking (`lib/interconnection.js:6-7`). Our `events.ts` constant-key resolution cannot subscribe to them as-is.
- Stepped Thinking's Separated mode emits `MESSAGE_RECEIVED` / `CHARACTER_MESSAGE_RENDERED` with an id and **no type** (`mode.js:638,640`). This is consistent with our gotcha ("untyped emitters such as Stepped Thinking"), and it refines it: the id *is* present, so our id-keyed dedupe path applies, not the 250 ms fallback that `turnBridge.review.test.ts:155` describes.
- `CONNECTION_PROFILE_LOADED` fires on profile change (`settings.js:190`). `ctx.extensionSettings.connectionManager.{profiles, selectedProfile}` hold profile objects with `id`/`name` (`generation.js:94-96`).
- A custom top-level message field (`chat[i].tracker`) survives `saveChatConditional` (`tracker.js:424-430`). It does **not** follow swipes, unlike `extra`, which ST snapshots per swipe (see the WTracker review).
- Tracker treats `is_system === ''` as system (`lib/utils.js:47`). **Unverified**: no core ST site writing `''` was found. Our `chatWindow.ts:8` tests `=== true`, and there is no contradiction unless such a writer exists.
- No contradiction with our gotchas found. Their 2 s post-`/profile` sleep is made unnecessary by our note that `/profile` now awaits the switch.

## Verdict
Relevance: **medium**. As a tracker it is behind us on every axis that matters: truthfulness, off-path timing, mutation safety and routing. It is mainly a catalogue of anti-patterns we already avoid. What it does give us is two concrete host-integration gaps. The one thing worth taking is **idea 1**: recognise extension-owned messages (`owner_extension` / `is_thoughts`) as non-turns and keep them out of extraction windows. It is small, it fits the denylist rule, and it closes a known gotcha where Stepped Thinking's thoughts become boundaries and leak "private" thoughts into memory. Idea 2 (a scannable scene block) is the runner-up.
