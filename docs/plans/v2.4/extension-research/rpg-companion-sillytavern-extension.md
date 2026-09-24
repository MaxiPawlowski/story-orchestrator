# RPG Companion — v2.4 review

Marinara (SpicyMarinara) · https://github.com/SpicyMarinara/rpg-companion-sillytavern · commit `9c48009` (2026-08-29), manifest v3.7.4 · 128 upvotes / 976 msgs · source available: **yes** (`source/`, ~48k lines incl. 12k CSS). Repo is marked **DEPRECATED** (README "What's New"), community-maintained. License conflict: README says AGPL-3.0, package.json says MIT. Copy patterns, not code.

Paths: theirs relative to `C:/dev/st-extensions-research/rpg-companion-sillytavern-extension/`, ours relative to the SO extension root, ST host relative to `SillyTavern-MainBranch/public/`.

## What it is

Tracker extension. It gives the player sidebar panels for their stats, an info box (date/weather/location), and present characters with their "thoughts". State is either parsed out of the main reply ("together" mode) or produced by a second LLM call after each reply ("separate", or "external" to an OpenAI-compatible URL). Around that sit many prompt toggles: immersive HTML, dialogue colouring, hidden `<lie>` deception tags, an "omniscience filter", CYOA option lists and Spotify songs. It also has plot-progression buttons, a dice roller, a combat "encounter" side-mode, avatar and expression generation, themes and mobile UI. No tests (package.json only has an i18n validator).

## How it works

**Wiring.** Plain JS modules. Host is imported statically from `script.js`, `extensions.js`, `slash-commands.js` and `group-chats.js`, with no seam. Events are registered in one table at `source/index.js:1429-1441`: MESSAGE_SENT, GENERATION_STARTED, MESSAGE_RECEIVED, GENERATION_STOPPED/ENDED, CHAT_CHANGED, CHAT_LOADED, MESSAGE_DELETED, MESSAGE_SWIPE_DELETED, MESSAGE_SWIPED, USER_MESSAGE_RENDERED and SETTINGS_UPDATED. Extra listeners follow at `index.js:1444-1498` (CHARACTER_MESSAGE_RENDERED and MESSAGE_UPDATED, for expression refresh).

**State lives on the messages, per swipe.** Each assistant message carries `extra.rpg_companion_swipes[swipeId] = {userStats, infoBox, characterThoughts}`. The same payload is mirrored into `swipe_info[swipeId].extra` (`source/src/core/persistence.js:462-492`, `getSwipeData` `:801`). `chat_metadata.rpg_companion` holds only a display/committed cache (`persistence.js:714`). Loading a chat, deleting a message or branching re-derives the state from the tail message's active swipe (`source/src/systems/integration/sillytavern.js:82-106`, `:311-323`, `:646-692`, `:784-812`).

**The "N-1 commit" rule.** Before a new generation they commit the tracker state of the prior assistant message (`persistence.js:854` `commitTrackerDataFromPriorMessage`, called at `source/src/systems/generation/injector.js:~612`). A new swipe commits from message N-1, not from the sibling swipe on screen (`sillytavern.js:724-731`). Navigating to an *existing* swipe just loads that swipe's stored state; there is no LLM call and no re-derivation (`sillytavern.js:698-782`). If auto-update is off, a reply inherits the prior message's state so the chain never breaks (`persistence.js:911`).

**Injection.** Everything goes through `setExtensionPrompt`, `IN_CHAT`:
- The instructions go in at depth 0 as a USER message.
- The previous tracker state goes in as an ASSISTANT message at the depth of the last assistant reply, so the model imitates it (`injector.js:633-677`).
- Separate mode instead injects a `<context>` summary at depth 1 (`injector.js:760-782`).
- Toggles each get their own key at depth 0. They name the CYOA key `rpg-companion-zzz-cyoa` so it sorts last (`injector.js:752`).

**History persistence.** Optional. At prompt-assembly time they append "Context for that moment: …" after each *past* message. For text completion this goes into `GENERATE_BEFORE_COMBINE_PROMPTS.finalMesSend`, with a string fallback in `GENERATE_AFTER_COMBINE_PROMPTS`. For chat completion it goes into `CHAT_COMPLETION_PROMPT_READY.chat`. Messages are located by **content substring match** (`injector.js:58-548`, listeners `:892-904`). The chat itself is never modified.

**LLM calls.**
- Separate mode builds a message array: a system intro, the character cards, `{{persona}}`, the last N messages as user/assistant turns plus per-message historical state, a `<previous>` block with the committed state (with lock markers), then a "JSON only" instruction (`source/src/systems/generation/promptBuilder.js:1203-1370`, `<previous>` at `:1108-1170`).
- The call goes through `generateRaw`, wrapped in `safeGenerateRaw`. That wrapper **monkeypatches `window.fetch`** to salvage an empty extended-thinking reply (`source/src/utils/responseExtractor.js:84-121`).
- External mode is a raw `fetch` to `baseUrl/chat/completions`, with the API key in `localStorage` (`source/src/systems/generation/apiClient.js:53-125`).
- They have no Connection Manager profile routing (still "coming soon" in the README).

**Mutation handling.**
- A module counter, `separateGenerationId`, is bumped on a new reply and on delete. A separate-mode result whose id is stale is discarded (`sillytavern.js:605`, `:791`; `apiClient.js:269-272`; `source/src/core/state.js:408-426`).
- It is **not** bumped on CHAT_CHANGED (`onCharacterChanged`, `sillytavern.js:646`).
- Rehydration after a chat change polls 15×200 ms until the DOM and state appear (`sillytavern.js:336-386`).

**Other mechanics.**
- Guided-generation suppression reads `chatMetadata.script_injects.instruct` and the quiet prompt, with regexes to spot impersonation (`source/src/systems/generation/suppression.js:18-80`).
- Plot buttons call `Generate('continue', {quiet_prompt, quietToLoud:true})` after setting `extensionSettings.enabled=false` for 1 s (`source/src/systems/features/plotProgression.js:93-163`).
- The chapter checkpoint runs `/hide 0-(N-1)` and re-hides after every generation (`source/src/systems/features/chapterCheckpoint.js:36-80`, `:128-189`; `sillytavern.js:639`, `:866-875`).
- Locks are prompt-only: a `"locked": true` marker is sent to the model and stripped from the reply, and nothing enforces it (`source/src/systems/generation/lockManager.js:18`, `:383`).
- The encounter mode runs its own LLM loop in a modal, then posts a summary with an unquoted `/sendas name="…" ${summary}` (`source/src/systems/ui/encounterUI.js:1074-1127`).
- On first load it silently pushes two prompt-only regex scripts into the user's global `extension_settings.regex` (`source/src/systems/features/htmlCleaning.js:45-110`, `:118-190`).
- It emits a custom `rpg_companion_update_complete` event on `eventSource` when an update finishes (`apiClient.js:12`, `:411`).

## Overlap with Story Orchestrator

- **State extraction.** Their separate mode is our off-path shared read in miniature: one free-form JSON blob, no scope, no evidence check, no typed deltas. We are far stricter: typed closed vocabulary, evidence spans, audits, a scheduler (`src/extraction/sharedRead.ts:87`, `evidence.ts:28`). Their together mode (state parsed out of the main reply, then `mes` and `swipes` rewritten) is what we deliberately avoid (invariant 5: nothing on the reply path).
- **Swipes and deletes.** Same intent as our TurnBridge rollback (`src/runtime/turnBridge.ts:54`, `:159`). Their per-swipe store beats us in one place: returning to an **existing** swipe restores that swipe's state for free. We roll back and wait for the next reply (see idea 2).
- **Async ownership.** Their generation counter is a weaker `RunToken`. It is not chat-scoped and not re-checked per write (`src/runtime/runToken.ts:138`). We are better here.
- **Locks.** Theirs is prompt-only. Ours is "lock = truth", enforced in code (`src/runtime/memoryQueue.ts`, `lockAsCanon`). We are better.
- **Steering.** Their plot buttons are player-facing, one-shot "stale scene" continues. Our equivalent is author-only (Nudge/Advance, `src/copilot/authoring.ts:63`, invariant 9) plus automatic pacing steering (`src/pacing/steering.ts:47`).
- **Injection composition.** Both use per-concern `setExtensionPrompt` keys. Ours are registry-driven with a next-turn preview (`src/constants/injectionRegistry.ts:12`, `src/runtime/nextTurn.ts:76`).
- **Where they are ahead.** They survive ST branching, and they handle guided generations from other extensions (ideas 1 and 6).

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Branch-aware adoption of a parent-stamped blob + rollback to branch tail | host-integration | host / persistence | absent | 4 | M |
| 2 | Restore a boundary on navigation to an existing swipe (per-swipe boundary cache) | enhancement | engine / turnBridge | partial | 3 | L |
| 3 | Show current value of each in-scope quality in the shared read (measured) | enhancement | extraction | absent | 3 | M |
| 4 | Extraction window reads what the model read: prompt-only regex + markup strip | enhancement | extraction / host | absent | 3 | M |
| 5 | Publish SO events on `eventSource` (boundary, transition) for other extensions | host-integration | host | absent | 2 | S |
| 6 | Treat foreign guided/impersonation generations (`script_injects.instruct`) like impersonate | host-integration | memory / talk | partial | 2 | S |
| 7 | Chapter compaction: optional `/hide` of pre-chapter messages at an anchor, ledger-owned | new-feature | stagecraft / effects | absent | 2 | M |
| 8 | Narrator-emitted hidden `<lie>`/`<ofilter>` tags as a forced-read cue for epistemic `[hiding]` | pattern | memory / extraction | absent | 2 | M |

**1. Branch-aware adoption.**
- *What goes wrong.* ST's Branch and Checkpoint buttons save the new chat with `{...chat_metadata, main_chat, integrity: uuidv4()}` (host `script.js:7406` merge; `scripts/bookmarks.js:200-201`, `:283-284`). Our `story_orchestrator` blob is therefore **copied into the branch, still stamped with the parent's chatId**. V5's rule reads it as foreign: "no story selected", and nothing is written back (`src/runtime/persistence.ts:33` `belongsHere`, `:60-75`). So a player who branches mid-story silently loses the story in the branch. If they then re-select it, `adoptChatState` (`persistence.ts:87`) adopts the parent's **tail** state, which is ahead of the truncated branch chat.
- *What they do.* They say it outright: "chat_metadata may not reflect the actual chat tail for branches" (`source/src/systems/integration/sillytavern.js:665-679`). They re-derive state from the branch's messages.
- *What we could do.* When `chat_metadata.main_chat` names the stamp's chat and the `integrity` differs, auto-adopt as a branch. Then run the normal `runRollback` to the last boundary ≤ the branch's last message id. The memory mirror already expects "a branch" and would adopt a fresh per-chat book (`src/runtime/memoryMirror.ts:65`).
- *Invariants.* Fits invariants 11 (rollback ≡ replay) and 12 (the pinned copy travels with the blob). No blob-version bump is needed.
- *Unverified.* Whether adopt-then-hydrate already reconciles an engine that is ahead of the chat. Probe it live first: branch at msg k, select, read `lastMessageId`.

**2. Existing-swipe navigation.**
- *The gap.* ST emits only `MESSAGE_SWIPED` when the player flips to a swipe that already exists. `Generate('swipe')` runs only for a new one (host `script.js:10315-10320`). We roll back on every swipe event (`src/runtime/turnBridge.ts:159`), and no render event follows. Flipping back to swipe #1 therefore leaves the story rewound until the next reply. A transition that fired on #1 fires one boundary late, and the read is paid again.
- *What they do.* They keep state keyed by `(message, swipeId)` and just reload it (`source/src/core/persistence.js:462`, `sillytavern.js:698-782`).
- *What we could do.* Cache the committed boundary snapshot plus its accepted deltas, keyed `chatId:messageId:swipeId:textHash:storyVersion`. On an existing-swipe flip, re-apply the cached result as a replay.
- *Invariants.* It strains invariants 3 (commits only at rendered-reply boundaries) and 11 (a cache hit must be byte-equal to replaying the same input). Key on text hash plus story id/version, so an edited swipe or a hot-swapped story misses the cache (compare the LoreSelector cache-key lesson in gotchas).

**3. Current value in the shared read.**
- *What they do.* Their updater sends the previous committed state (`<previous>`, `source/src/systems/generation/promptBuilder.js:1108-1170`).
- *Our state.* Our shared-read prompt lists each in-scope quality's rubric and allowed values but **not its current blackboard value** (`src/extraction/contract.ts:14-24`, `:29-51`; `SharedReadContract` has no values, `src/extraction/types.ts:39`). The model cannot tell "changed" from "restated". That likely feeds the rejected tier (live-suite rejected 14/21).
- *What we could do.* Add `current=<value>` to each quality line and include it in `hashContract`.
- *Invariants.* No conflict, but it is a prompt-shape change on an LLM path. It ships only if `so-live-suite` beats today's 22/22 delta result and the facts/rejected tiers against a floor declared before the run (plan-10 rule, invariant 7 spirit). Anchoring bias is the risk to measure.

**4. Read what the model read.**
- *The problem.* The user's prompt-only regex scripts (`promptOnly`, placement 2) rewrite the outgoing prompt, never `mes` (host `scripts/extensions/regex/engine.js:334-354`). Extensions like this one fill replies with HTML/CSS/JS blocks, tracker JSON fences and hidden self-closing tags (`htmlCleaning.js:78-92`, `:160-176`).
- *Our state.* Our window reads raw `mes` (`src/extraction/chatWindow.ts:6-13`), and nothing in `src/extraction` or `src/memory` strips markup (grep html → 0). So a read can quote or react to markup the main model never saw, and every such token is paid for.
- *What we could do.* Add an `stHost/regex.ts` seam that calls `getRegexedString(text, regex_placement.AI_OUTPUT|USER_INPUT, {isPrompt:true})`, plus a markup strip. The evidence check must run on the same sanitized text.
- *Invariants.* Invariant 2 needs a new stHost module. Invariant 4 needs evidence in the (sanitized) window.

**5. Publish events.**
- *What they do.* They emit `rpg_companion_update_complete` (`apiClient.js:12`, `:411`).
- *Our state.* We emit nothing of our own (grep `.emit(` → only `PRESET_CHANGED` and a WI activation, `src/services/stHost/presets.ts:97`, `worldInfoActivate.ts:23`).
- *What we could do.* Emit `story_orchestrator_boundary` / `story_orchestrator_transition` with **names only**. That lets companion extensions react to chapter changes without polling macros (e.g. the user's own Image Director, a scene image per checkpoint).
- *Invariants.* The payload must follow the player-safe vocabulary (invariant 9: no future checkpoints, no gates).

**6. Guided generations.**
- *Their mechanism.* GuidedGenerations-style extensions put an ephemeral `/inject id=instruct`, stored at `chat_metadata.script_injects` (host `scripts/slash-commands.js:3814-3822`). They detect it plus impersonation phrasing (`suppression.js:18-80`).
- *Our state.* We withhold private epistemic knowledge only for ST's own `impersonate`/`quiet` types (`src/runtime/runtimeManager.ts:633`). A guided "write my next action" run through a normal generation would still carry the active member's private block and our steering hint.
- *What we could do.* A narrow, opt-in classifier (presence of `script_injects.instruct` → treat as impersonate) is cheap. Keep their regex list out: it's a heuristic, and "first person" matches ordinary prose.

**7. Chapter compaction.**
- *What they do.* The chapter checkpoint hides everything before a message with `/hide` (`chapterCheckpoint.js:36-80`).
- *Why it could fit us.* We already carry the past in canon and memory tiers, so a per-anchor `effects.compact_history` could reclaim context on long stories.
- *Costs.* `/hide` flips `is_system` in the chat file. It must be an owned-effect ledger row, reverted on rollback (invariants 11, 16). Our window drops `is_system` messages (`src/extraction/chatWindow.ts:8`), so the memorize backlog could no longer read hidden history. Their need to re-hide after every generation (`sillytavern.js:639`, `:866-875`) suggests the state is fragile. Low priority.

**8. Hidden in-reply deception tags.**
- *What they do.* A prompt asks the narrator to append `<lie character= truth= reason=/>` or `<ofilter event= reason=/>`. ST's renderer hides unknown tags, but the model keeps seeing them in history (`promptBuilder.js:35`, `:41`; the hiding claim is theirs, `sillytavern.js:536`).
- *For us.* This is high-precision evidence for our `[hiding]`/`[unaware]` rows. Under invariant 4 a tag could only **force** an epistemic read, never write.
- *Conflicts.* It puts an instruction on the reply path (invariant 5 is about compute, not prompts, but it costs tokens every turn). The truth is stored in the visible chat file, readable in edit mode, which is a spoiler (invariant 9).
- *Verdict.* Author opt-in at most.

## Patterns to copy / anti-patterns to avoid

**Copy.**
- Derive state from the chat tail, not from metadata, when the two can disagree (branches, deletes): `sillytavern.js:665-679`.
- Distinguish a new swipe from navigation to an existing one by `swipes[swipe_id]` presence (`sillytavern.js:717-735`).
- Resolve the active swipe by matching `mes` against `swipes[]`, because `swipe_id` can be stale mid-transition (`sillytavern.js:243-265`). Worth a test case in our turn-types check.
- Defer a chat save until `chat_metadata.integrity` and a chat id both exist (`persistence.js:257-264`, `:700-735`).

**Avoid** (each is something we already guard against; keep it that way).
- Prompt-only locks: the model may ignore `"locked": true` (`lockManager.js:18`, `:383`).
- A `window.fetch` monkeypatch around `generateRaw` (`responseExtractor.js:84-121`). Any concurrent main-chat request in that window is captured too, and a throw between patch and `finally` is the only restore path.
- A generation counter not bumped on CHAT_CHANGED (`sillytavern.js:605`, `:791` vs `:646`). A late separate-mode result writes into whatever `chat` is now open (`apiClient.js:304-333`). This is the exact RunToken lesson.
- Toggling the global `extensionSettings.enabled` for 1 s to keep your own injection out of a generation (`plotProgression.js:96`, `:163`). It races, and a crash inside leaves the feature off.
- An unescaped `/sendas name="…" ${llmText}` (`encounterUI.js:1097-1099`). A `|` or `{{…}}` in model text becomes a pipe or a macro (see our slash-quoting gotcha).
- Silently pushing global regex scripts into the user's install and never removing them (`htmlCleaning.js:45-110`).
- A plaintext API key in `localStorage` (`apiClient.js:56`).
- Rewriting `mes`/`swipes` after render to strip tracker blocks (`sillytavern.js:523-562`).
- 15×200 ms polling rehydration instead of an event (`sillytavern.js:336-386`).
- Locating a message in the assembled prompt by content substring (`injector.js:214-251`, `:302-375`). A repeated line or a truncated message lands the annotation on the wrong turn.

**Conflicts with our design.** A player-facing "Natural plot / Randomized plot" button is a steering control, and invariant 9 keeps those author-only. The closest player-safe form is the existing ⚑ flag, whose reason is read by the author.

## ST host facts learned

All verified against current ST source unless marked.

1. Navigating to an existing swipe emits only `MESSAGE_SWIPED`. `Generate('swipe')` runs only when a new swipe is created. Host `script.js:10315-10320`; theirs `sillytavern.js:717-735`. Consistent with our TurnBridge, and it exposes idea 2.
2. `message.extra` is **per swipe**. `syncMesToSwipe`/`syncSwipeToMes` structured-clone it to and from `swipe_info[swipe_id].extra` (`script.js:6896-6958`). Their comment "message.extra is in-memory only" (`persistence.js:739`) is **inaccurate**: `extra` is saved with the message but replaced on every swipe. This contradicts their comment, not our gotchas.
3. Branch and checkpoint copy the whole `chat_metadata` and override only `main_chat` + a fresh `integrity` (`script.js:7406`; `scripts/bookmarks.js:200-201`, `:283-284`; group path `scripts/group-chats.js:2370`). Our blob follows a branch, still stamped for the parent (idea 1). New to our gotchas.
4. `chat_metadata.integrity` is a uuid minted on load if missing (`script.js:7665-7666`; groups `scripts/group-chats.js:276-278`). Group saves reject on an integrity error (`group-chats.js:646`). It is stable across renames and fresh per branch, so it could serve as a stamp that needs no restamp on CHAT_RENAMED. It is not obviously better for imported files, which carry theirs.
5. `CHAT_LOADED` is emitted only from solo `getChat` (`script.js:7669`), never from `group-chats.js`. Their `onChatLoaded` (`sillytavern.js:388`) therefore never fires for groups. That fits our CHAT_CHANGED-only approach.
6. `/inject` persists to `chat_metadata.script_injects[id]` (`scripts/slash-commands.js:3814-3822`). Guided Generations uses id `instruct` (their `suppression.js:20`).
7. Extension prompts at the same depth assemble in key-sort order (`script.js:3310` `.sort()`). They rely on it with a `zzz-` key (`injector.js:752`). That matches our next-turn preview's "depth, then key".
8. `GENERATE_BEFORE_COMBINE_PROMPTS` passes the mutable `finalMesSend` for text completion (`script.js:5234`). `CHAT_COMPLETION_PROMPT_READY` passes the mutable `chat` array for chat completion (`scripts/openai.js:1619`). `GENERATE_AFTER_COMBINE_PROMPTS` passes the combined string (`script.js:5243`). Their use: `injector.js:461-548`.
9. Prompt-only regex scripts (`promptOnly: true`) apply when `getRegexedString(..., {isPrompt:true})` runs, and never to the stored `mes` (`scripts/extensions/regex/engine.js:334-354`). Their auto-installed scripts: `htmlCleaning.js:78-92`.
10. `Generate(type, {quiet_prompt, quietToLoud, ...})` (`script.js:4290`) with type `continue` appends a directed continuation to the last message (`plotProgression.js:148-154`).
11. Their claim, unverified here: `GENERATION_STARTED` data carries `quietImage`/`quiet_image` for image-generation requests, which they skip (`injector.js:567`). Our lore listener skips `quiet_prompt` (`src/runtime/index.ts:156`).

No fact contradicts our gotchas. Fact 3 is a new gotcha candidate.

## Verdict

**Relevance: medium.** As a product it is the thing SO chose not to be: tracker UI, together-mode reply rewriting, prompt-only locks. Most of its code is UI and themes. The value is in how it survives ST's chat mechanics.

**The one thing worth taking:** idea 1, branch-aware adoption. ST copies our parent-stamped blob into every branch or checkpoint (`script.js:7406`, `bookmarks.js:201`). V5 then reads it as "no story selected", so branching mid-story silently drops the story, and re-selecting it adopts the parent's tail state. Second: idea 3 (current values in the shared read), cheap to try and measurable with the live suite.
