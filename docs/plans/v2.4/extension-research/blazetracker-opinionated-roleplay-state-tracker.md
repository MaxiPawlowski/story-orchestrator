# BlazeTracker (v2.5.1) — Opinionated Roleplay State Tracker — v2.4 review

Author: Lunar Blaze (post) · repo linked in post: `bmen25124/SillyTavern-WTracker` · commit `8a5e42e` 2026-06-09 ("Add WTracker prompt role setting") · 57 upvotes / 1551 msgs · **source available: NO for BlazeTracker.** The post's only repo link is to **wTracker**, the lighter tracker the author recommends as the alternative ("Try wTracker instead") and says BlazeTracker was influenced by. The scraper cloned that link. So `source/` holds WTracker 0.1.1 by bmen25124 (`source/manifest.json`: `"display_name": "WTracker"`), not BlazeTracker. BlazeTracker itself is reviewed from `post.md` only, and every BlazeTracker claim below is marked *(post only)*. The WTracker code is real and small (~1.4k lines), and it is where the code evidence comes from.

## What it is
- **BlazeTracker** *(post only)*: a heavy, multi-call-per-message tracker. It tracks time/date, location, sun, weather (a "forecasting system based on real climate data"), characters (mood/status/activity/position), outfits (an add/remove log), relationships (wants/feelings/secrets/level), a "multi-resolution narrative summary", and tension type + level with graphs. It injects state back into the prompt. Initial state is seeded from the character card's `extensions` field and persona settings. It uses a separate connection profile ("pick a different connection profile and go"). "Everything is atomic events, everything is editable." Its target is Gemma 3 27B+.
- **WTracker** (the code we have): after a message, it calls a chosen Connection Manager profile to fill a user-editable JSON Schema ("SceneTracker": time/location/weather/topics/characters with outfit etc.). It stores the result on the message, renders it with a user Handlebars HTML template above the message text, and feeds the last N tracker values back into the main prompt through a `generate_interceptor`.

## How it works (WTracker, code)
- **Entry / settings**: `src/index.tsx:501` `settingsManager.initializeSettings().then(main)`. Settings go through `sillytavern-utils-lib` `ExtensionSettingsManager` under key `WTracker` (`src/components/Settings.tsx:27`, `src/config.ts:258`). A React settings panel is appended to `#extensions_settings` (`src/index.tsx:474-494`).
- **Trigger**: `eventSource.on(CHARACTER_MESSAGE_RENDERED)` / `USER_MESSAGE_RENDERED` gated by `autoMode` (responses / input / both) (`src/index.tsx:389-396`). There is no message-type filter. A manual truck icon is prepended into `#message_template .mes_buttons .extraMesButtons`, with one document-level click delegate that reads `mesid` (`src/index.tsx:347-371`).
- **LLM call**: `buildPrompt(apiMap.selected, {messageIndexesBetween, presetName/contextName/instructName/syspromptName from the profile, includeNames: !!selected_group})` rebuilds a real chat prompt from the profile's own templates (`src/index.tsx:226-237`). Then `Generator.generateRequest({profileId, prompt, maxTokens, custom:{signal}, overridePayload})` (`src/index.tsx:241-273`). Three prompt-engineering modes (`src/config.ts:3-7`):
  - `native`: appends the instruction and sends `overridePayload.json_schema = {name:'SceneTracker', strict:true, value}` (`src/index.tsx:276-282`). Relies on backend structured output.
  - `json` / `xml`: a Handlebars prompt carrying `{{schema}}` + `{{example_response}}` auto-derived from the schema (`src/schema-to-example.ts:29-65`). The parse extracts the first fenced block, then `JSON.parse` or `fast-xml-parser` with `ensureArray` schema-driven array repair (`src/parser.ts:14-56`).
  - The instruction role is configurable user/assistant (`src/index.tsx:275`, the head commit).
- **Cancel**: one `AbortController` per request. A per-message `pendingRequests` map means clicking the icon again aborts the in-flight call (`src/index.tsx:187-192, 243-257`).
- **Persistence**: the value and the HTML template are both copied into `message.extra.WTracker` (`src/index.tsx:301-304`), then `saveChat()`. The data rides ST's per-swipe `extra` snapshot (host fact below), so a tracker follows its swipe for free. Per-chat schema choice goes to `chatMetadata.WTracker.schemaKey` (`src/index.tsx:199-202, 425-470`) **but is never read**: generation uses the global `settings.schemaPreset` (`src/index.tsx:204-205`). The "Modify schema for this chat" feature is dead.
- **Injection**: `globalThis.wtrackerGenerateInterceptor` (manifest `generate_interceptor`) rewrites the interceptor's chat array in place. For each of the last `includeLastXWTrackerMessages` (default 1) messages carrying a tracker, it splices in a synthetic **user** turn named `name1` containing ```` Tracker:\n```json …``` ```` (`src/index.tsx:70-105, 418-422`). No extension prompt and no depth registry are used.
- **Render**: `Handlebars.compile(html, {noEscape:true, strict:true})` produces `innerHTML`, inserted before `.mes_text` (`src/index.tsx:51-67`). Every `CHAT_CHANGED` re-renders every message, and a message whose template throws has its tracker data **deleted and the chat saved** (`src/index.tsx:397-415`).
- **Edit / delete**: a JSON textarea popup via `callGenericPopup` + `Popup.show.confirm`. The `<details>` open state is preserved across the re-render (`src/index.tsx:107-181`).
- **Mutation handling**: none of its own. Swipes are covered by ST swapping `extra`. Edits and deletes leave the tracker stale on the message. There is no rollback concept, and no chat-ownership check across the await: `message` is captured before the request, and `saveChat()` runs after it (`src/index.tsx:184, 301-323`).

## Overlap with Story Orchestrator
- **Separate model profile for tracking**: both do this. We already have it and go further, with a message-array + instruct template (`src/services/stHost/connectionProfiles.ts:43`) and reasoning stripping (`src/extraction/parse.ts:51`). They rebuild the full chat prompt from the profile's context/sysprompt. We send our own compact contract, which is cheaper and scope-bounded.
- **Scene state (time/location/present)**: ours is `SceneCoordinator` + `{{story_scene_*}}` macros (`src/runtime/coordinators/sceneCoordinator.ts:33`). Per-character outfit/relationship ledgers map to our ledger `[state:Entity:type] field=value` (`src/memory/ledger.ts:31`) and epistemic rows (`src/memory/epistemic.ts:50`, which covers BlazeTracker's "secrets"). Ours is typed, evidence-checked (`src/extraction/evidence.ts:28`), provenance-enveloped and rollback-safe. Theirs is a free-form JSON blob that the prompt tells the model to *invent* when missing (`src/config.ts:36`: "make reasonable assumptions").
- **Multi-resolution summary** *(post only)*: we have four tiers + canon (`src/constants/injectionRegistry.ts:12`, `src/memory/canon.ts:23`).
- **Tension type + level with graphs** *(post only)*: we have a level + EMA + an expected shape (`src/pacing/tension.ts:21`, `src/pacing/shapes.ts:33`), shown as scalars only (`src/components/drawer/DrawerTabs.tsx:98-99`). We have no tension *type* and no graph.
- **Injection**: we use extension prompts at registered depths (`src/services/stHost/extensionPrompts.ts:19`) and never fabricate chat turns. That is better than their fake user message.
- **Per-message inline display**: we deliberately have none (baseline §4). Their message-level UI (regenerate/edit/delete per message) is the tracker genre's core UX.
- **Where they are ahead**: request cancellation, and optional native structured output.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Cancel in-flight memory-model calls with the epoch `AbortSignal` (`custom.signal`) | host-integration | extraction / engine(runtime) | partial | 4 | S |
| 2 | Show the current value of each in-scope quality in the shared-read prompt | enhancement | extraction | absent | 3 | S |
| 3 | Optional constrained decoding (json_schema / GBNF) behind a capability probe | enhancement | extraction / wizard / generation | absent | 3 | M |
| 4 | Author-only tension history sparkline, actual vs expected | ux | pacing / player-ui (author) | partial | 2 | S |
| 5 | Author-only "state at this reply" message button | ux | player-ui (author) | absent | 2 | M |

**1. Cancel in-flight memory calls.**
- **What**: pass `RunOwner.signal()` through `callExtractionModel` → `sendConnectionProfileRequest` → `sendRequest(…, {…, signal})`. A chat switch, story swap or restart then aborts the running shared read, scene, epistemic, canon and curator calls instead of letting them finish into a refused write.
- **Their evidence**: `source/src/index.tsx:241-257`, and click-again-to-cancel at `:187-192`.
- **Our evidence**: `src/runtime/runOwner.ts:60-63` says "ConnectionManagerRequestService.sendRequest takes no signal (shared.js:423)". `src/judge/types.ts:68` and `src/runtime/epochAbort.review.test.ts:9-10` repeat the claim. **That claim is wrong on the current host.** `public/scripts/extensions/shared.js:415` documents `custom.signal`, `:424` destructures it, and `:463`/`:483` pass it to `ChatCompletionService`/`TextCompletionService.processRequest`, which forwards it to `fetch` (`public/scripts/custom-request.js:125,152,468`). The signal is the 4th-argument `custom` field, not a separate parameter. That is probably why it was missed. `src/extraction/client.ts:11-19` sends no signal today.
- **Fit**: strengthens invariants 5 and 10. The RunToken stays the write-edge defence, and abort only saves GPU time, which matters on the ~33 tok/s pod. The debt has three parts:
  - A `stHost` change with a typed abort outcome, so an abort is not reported as an extraction error: the scheduler must not pause extraction install-wide on an `AbortError`. (A failed read already pauses extraction install-wide, per memory.)
  - A new census/fault-matrix row.
  - Correcting the three comments.
- **Invariant conflict**: none.

**2. Current values in the shared read.**
- **What**: WTracker always hands the model the previous tracker (`includeLastXWTrackerMessages` default 1, `source/src/config.ts:276`; `source/src/index.tsx:70-105`) and asks for an update. Our `renderSharedReadPrompt` lists each in-scope quality's rubric, allowed values and hints, but never its current blackboard value (`src/extraction/contract.ts:14-24, 30-51`). `SharedReadContract` has no values field (`src/extraction/types.ts`).
- **Why add it**: a "currently: X" line could cut redundant or regressive deltas (a latching or monotonic quality re-proposed at a lower value) and help `rating` reads. The risk is anchoring: the model repeats the current value, or omits changes.
- **Fit**: evidence quotes are still required (invariant 4 intact). It changes `hashContract` inputs and invalidates live goldens. It must be decided by a predeclared floor on `so-live-suite` (delta accuracy + rejected tier) before and after, never by feel (invariant 7 style).
- **Invariant conflict**: none, if it ships only past the floor.

**3. Structured output, opt-in per backend.**
- **What**: WTracker's `native` mode sends `json_schema` via `overridePayload` (`source/src/index.tsx:276-282`). It falls back to prompt + auto-generated example (`source/src/schema-to-example.ts:29-65`) and repairs XML arrays against the schema (`source/src/parser.ts:14-34`).
- **Our evidence**: nothing in `src/` sends `json_schema` or grammar, and our JSON passes (copilot, generation, stagecraft) rely on prompt + repair. For us, the stronger version is a **GBNF for the DELTA line grammar**, with quality keys and allowed values baked in, so the closed vocabulary is enforced at decode time, not only at parse.
- **Traps**:
  - On the chat-completion path ST `JSON.parse`s the content into an **object** when `json_schema` is set (`public/scripts/custom-request.js:490-492`). Our `sendConnectionProfileRequest` then returns `""` (`src/services/stHost/connectionProfiles.ts:51-54`).
  - Per memory (Image Director), llama.cpp ignores `json_schema` when ST also sends a grammar.
  - The textgen path is unverified.
- **Fit**: it needs a capability probe (`src/services/stHost/capabilities.ts:68`) and must stay install-wide opt-in, default off.
- **Invariant conflict**: invariant 2, verify each backend's shape. It is not a conflict if gated.

**4. Tension sparkline.**
- *(post only: "tension type & level tracking with graphs")*.
- **Our evidence**: we keep the last 50 raw levels (`src/runtime/extras.ts:28`, `TENSION_LEVEL_LIMIT` in `src/runtime/coordinators/pacingCoordinator.ts:40`) but show only level/smoothed/expected scalars (`src/components/drawer/DrawerTabs.tsx:98-99`). Expected-per-point is not stored, so it needs a boundary-indexed `{raw, smoothed, expected}` ring.
- **Fit**: author view only. The expected curve is a steering internal and must never reach the player (invariant 9, `assert-player-clean`).
- **Tension *type*** (combat/romance/mystery): not proposed. There is no gate consumer.
- **Invariant conflict**: 9, if it were shown to the player.

**5. Per-message state inspector.**
- **What**: WTracker prepends a button to ST's message template (`source/src/index.tsx:347-351`) and renders state at that message.
- **Our evidence**: we hold boundary snapshots keyed by `{lastMessageId, chatLength}` (`src/engine/engine.ts:100`), so "what did the engine believe after this reply" is answerable. We add nothing to messages today (baseline §4).
- **Fit**:
  - A new DOM seam into `#message_template`, which needs its own `stHost` module.
  - Our CSS is scoped to mount roots, so the popover must be a native `<dialog>` (invariant 19).
  - The button must be author-only. A player-mode message button would leak state (invariant 9).
- **Value**: low. The Payload tab and journal already cover most debugging.
- **Invariant conflict**: 9 and 19, manageable.

## Patterns to copy / anti-patterns to avoid

**Copy**
- Abort + click-again-to-cancel per unit of work (`source/src/index.tsx:187-192`). See idea 1. A player-visible "stop reading" is not needed, but an author "cancel pass" in the Scheduler tab is cheap once the signal is wired.
- Validate before persisting (`source/src/index.tsx:300-331`): the result is written only if it renders, and otherwise rolled back and reported. We already do this with the strict parse and the audit.
- Keep UI disclosure state (`<details>.open`) across a re-render (`source/src/index.tsx:148-166`). React gives us this for free unless a panel remounts.

**Avoid**
- **Model output into `innerHTML` with `noEscape: true`** (`source/src/index.tsx:51-55`): any tracker value can inject markup or script into the chat DOM. We use text nodes (`src/services/stHost/popup.ts:13`).
- **Deleting stored data because a view failed** (`source/src/index.tsx:397-415`): one bad template edit wipes every message's tracker on the next `CHAT_CHANGED` and saves. Never make persistence depend on presentation.
- **State as a fabricated user turn** (`source/src/index.tsx:92-100, 418-422`): the model sees JSON "said" by the player, for every generation type, including quiet/impersonate. Use extension prompts with a registry.
- **No ownership across the await** (`source/src/index.tsx:184, 301-323`): after a chat switch mid-request, the result lands on a detached message object and `saveChat()` saves the other chat. The result is silently lost. This is what our RunToken exists for.
- **Auto-run on every `CHARACTER_MESSAGE_RENDERED` with no type filter** (`source/src/index.tsx:389-392`): greetings and `/sd` posts cost a model call. Compare our `NON_TURN_MESSAGE_TYPES` (`src/runtime/turnBridge.ts:9`).
- **"Make reasonable assumptions" in an extraction prompt** (`source/src/config.ts:36`): it manufactures state with no evidence, the opposite of our evidence rule.
- **A per-chat setting written and never read** (`schemaKey`, `source/src/index.tsx:199-205`). It is the same class as our run-header `null` field: a value nothing reads can never fail.
- Invalid schema JSON is silently ignored in settings (`source/src/components/Settings.tsx:80-96`, where the catch does nothing).

## ST host facts learned

Line numbers are in ST `public/`.

1. **`ConnectionManagerRequestService.sendRequest(profileId, prompt, maxTokens, custom, overridePayload)` honours `custom.signal`.** See `scripts/extensions/shared.js:415,424,463,483`, then `scripts/custom-request.js:125,152,468` (the fetch). **CONTRADICTS** our `src/runtime/runOwner.ts:60-63`, `src/judge/types.ts:68` and `src/runtime/epochAbort.review.test.ts:9-10`, which say it takes no signal. Their use: `source/src/index.tsx:249`, via the utils-lib `Generator`.
2. `overridePayload` is spread last into the request body on both paths (`scripts/extensions/shared.js:460,478`). With `json_schema` on the chat-completion path, the returned `content` is a parsed **object**, not a string (`scripts/custom-request.js:490-492`). Their use: `source/src/index.tsx:279`.
3. The `generate_interceptor` signature is `(chat, contextSize, abort, type)`, and interceptors run in manifest order (`scripts/extensions.js:2033-2037`). They run only when `!dryRun` (`script.js:4562-4564`). `chat` is `coreChat`: a filtered **copy** of the array whose items are **shallow** copies `{...chatItem, mes, index}` (`script.js:4496, 4501, 4524-4528`). Splicing is therefore prompt-only (their `source/src/index.tsx:418-422` relies on this), but mutating `item.extra` would mutate the saved chat.
4. ST snapshots `message.extra` into `swipe_info[swipe_id].extra` at generation end (`script.js:3705-3712`) and restores it on swipe (`script.js:7015`, `syncSwipeToMes`). Per-message extension data therefore follows its swipe. Unverified caveat: data written into `extra` after that snapshot (as WTracker does, `source/src/index.tsx:301-304`) may be absent from `swipe_info` until something re-snapshots. Not measured.
5. Per-message buttons are injected by prepending to `#message_template .mes_buttons .extraMesButtons` once. ST clones the template for every message (their `source/src/index.tsx:351`; not checked in ST source).
6. `USER_MESSAGE_RENDERED` carries `messageId` (their `source/src/index.tsx:393-396`; consistent with our events notes, not re-verified).

## Verdict

**Relevance: medium**, carried almost entirely by one host finding rather than by the product. BlazeTracker's own code is not in the corpus. WTracker is a minimal, unowned, JSON-blob tracker whose design choices (fabricated user turns, `innerHTML` of model output, a destructive re-render, "assume missing details") are mostly what SO is built to avoid.

**The one thing worth taking**: `sendRequest` accepts `custom.signal`. Our code states three times that extraction calls cannot be cancelled at the host, and that is false on the current host. Wiring the epoch signal into `callExtractionModel` is an S-sized v2.4 item that stops stale-world reads from burning pod time. Second: a measured A/B of "current value" lines in the shared read.
