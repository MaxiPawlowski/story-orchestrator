# Recast (ST Post-Processing for Better Prose) — v2.4 review

author: closure (closuretxt) · repo: https://github.com/closuretxt/recast-post-processing · commit `a7ac25a` (2026-09-03, per research README) · manifest v1.86 · 86 upvotes / 1872 msgs · source available: **y** (`source/`, ~3.3k lines JS, no tests)

Paths: `R/` = `C:/dev/st-extensions-research/recast-st-post-processing-for-better-prose/source/`; ours relative to the extension root; ST = `C:/dev/SillyTavern-MainBranch/public/`.

## What it is
Rewrites each AI reply after it is generated. The reply goes through N passes in order: character-voice validator, prose rhythm, optional grounding. Each pass is its own chat-completion request, with its own system prompt, context length and Connection Manager profile. The result overwrites `chat[id].mes` in place, after an optional word-level diff review (accept / edit / reject). Per-message snapshots let you reopen the diff later. It is a prose-quality tool with no story or state model. Its value for SO: (a) it is a popular extension that mutates committed replies, so it can collide with SO; (b) it shows a few host techniques we have not used.

## How it works
- **Trigger.** `GENERATION_STARTED` records `type` and arms stream hiding for `normal|swipe|regenerate|impersonate|continue` (`R/index.js:1500-1535`). `MESSAGE_RECEIVED` then **awaits** the whole pipeline (`R/index.js:1538-1546` → `triggerPipelineOnMessage` `:1400`). ST's emitter awaits listeners one at a time (ST `lib/eventemitter.js:130-152`), and ST emits `CHARACTER_MESSAGE_RENDERED` only after `MESSAGE_RECEIVED` resolves (ST `script.js:3799-3800` streaming, `:6691/6693` non-streaming). So every pass delays the render event. It skips `mesId === 0` and replies shorter than `min_chars` (default 60, `R/settings/settingsManager.js:24`).
- **Hiding the stream.** A `MutationObserver` on `#chat` catches the new `.mes` node and blanks `.mes_text` on every mutation until the pipeline releases it (`R/index.js:1311-1376`). For swipe/regenerate/continue it blanks the existing node (`:1514-1529`). "Dynamic substitution" instead streams the next pass paragraph by paragraph over the old text (`blendStreamingText` `:392-419`).
- **Pass prompt shape** (`runPass`, `R/index.js:548-825`):
  - System message: the pass prompt, plus `<world_info>` from `getWorldInfoPrompt(chat.reverse(), 100000, true)` (dry-run scan), plus WI **outlets** (`{{outlet::name}}` placeholders, or auto-appended `<outlet name>` blocks) (`:560-618`).
  - User message: `<characters>` (card fields), then `<scene_context>` (last N messages, `Name: text`, or as role messages when `scene_context_as_roles`), then `<text_to_transform>`.
  - Each context message goes through ST's **prompt-only regex** at its own depth: `getRegexedString(mes, USER_INPUT|AI_OUTPUT, {isPrompt:true, depth})` (`R/util/contextRegex.js:6-24`, called at `R/index.js:651`).
  - Macros are expanded with `substituteParams` (`:684`). An optional prefill message is added with a chosen role (`:734`).
- **LLM call.** `ctx.ConnectionManagerRequestService.sendRequest(profileId, messages, undefined, {stream})` (`R/index.js:757`), consuming the async generator when streaming (`:764-779`).
  - On a 400/401/403 it retries once on the currently selected profile. If streaming failed, the retry goes out non-streaming (`:795-810`).
  - "Legacy API" mode instead swaps the global profile through the `/profile` callback, waits on `CONNECTION_PROFILE_LOADED`, polls `online_status`, sleeps 1.5 s, then swaps back (`R/util/profileSwapper.js:44-82`).
  - Reasoning is stripped with the **profile's own reasoning template**: `ctx.parseReasoningFromString(text, {}, ctx.getReasoningTemplateByName(profile['reasoning-template']))` (`R/index.js:223-248`).
  - Each pass output also goes through non-prompt AI_OUTPUT regex at depth 0 (`applySTRegex` `:1101-1117`). An empty result keeps the previous text (`:971`).
- **Write.** Sets `msg.mes`, then `updateMessageBlock` + a manual `messageFormatting` re-render, then **emits `MESSAGE_EDITED`** itself (`safeUpdateMessageText`, `R/index.js:334-389`), then `saveChat()` (`acceptChanges` `:1086-1097`).
  - `MESSAGE_EDITED` also fires on the *restore-original* paths: before the diff modal opens (`:1054-1060`, `:1469-1473`), on reject (`:1067-1073`) and on stop (`:1549-1563`).
  - Default settings show the diff (`replace_inline: false`), so the rewrite lands **when the user clicks Accept**, possibly minutes after the reply rendered.
- **Persistence.**
  - Settings and presets (pass lists) live install-wide in `extension_settings.Recast` (`R/settings/settingsManager.js:7-27`).
  - Per-message `msg.extra.recast = {original, transformed, snapshots[], passNames[]}` is saved in the chat file and powers the "reopen diff" button (`R/util/diffViewer.js:438-446`).
  - Macros `{{recast_latest}}`, `{{recast_original}}` and `{{recast_<passId>}}` go through `macros.registry.registerMacro` (new macro engine only, `R/index.js:1123-1171`).
- **Mutation handling.**
  - No swipe/edit/delete listeners. A 5 s `recentProcessedMessages` set suppresses re-entry (`R/index.js:31, 1430-1435`).
  - `isProcessing`/`currentMessageId` are module globals with no chat scoping. A chat switch mid-pipeline writes into `chat[currentMessageId]` of whatever chat is then open.
  - The send button is locked during processing (`setSendButtonState(true)` `:323-331`, `:849`).
- **Slash commands.** `/rc-run [mesId]`, `/rc-runbulk a-b [wait]` (rewrites a past range in sequence, `R/util/slashCommands.js:60-103`), plus toggles.
- **Compat.** Listens to Stepped Thinking's custom `GENERATION_MUTEX_CAPTURED/RELEASED` events to skip or re-arm (`R/util/compatibility.js:19-30`).

## Overlap with Story Orchestrator
- **Post-reply LLM work.**
  - Recast runs **on the reply path**: it blocks render and locks send.
  - SO runs everything off-path and never touches the reply (baseline inv. 5; `src/extraction/scheduler.ts`). SO's design is stricter and correct for state.
  - Recast rewrites prose; SO's closest analogue, the continuity warden, only *notes* a contradiction for the next turn (`src/runtime/continuity.ts:60`). Our position is better: a note cannot invalidate a committed boundary.
- **Profile routing.** Both use Connection Manager `sendRequest` with a per-task profile (`src/services/stHost/connectionProfiles.ts:43`). We send one memory profile with instruct templating. Recast sends a profile per pass, falls back to the current profile on auth errors, and has no instruct path (chat-completion only; README "Text Completion Support" is a TODO).
- **Mutation model.**
  - SO: `TurnBridge` treats `MESSAGE_EDITED/UPDATED` of any message as a rollback from that id (`src/runtime/turnBridge.ts:54-57, 159-170` → `runtimeManager.ts:347`). It rolls back a boundary that consumed the message if it fired a transition or applied deltas whose `turnRange` covers it (`src/engine/engine.ts:307-314`). Memory rows sourced from that message are dropped or quarantined. `noteMutation` invalidates in-flight reads (`runtimeManager.ts:350`). No boundary is re-committed for the edited message; the next reply's boundary picks it up.
  - Recast has no mutation model at all.
- **Chat scoping.** SO's RunToken is a direct answer to Recast's unscoped globals (`src/runtime/runToken.ts:138`).
- **Reasoning stripping.** SO hand-lists the forms (`src/extraction/parse.ts:51`). Recast asks ST's own template.
- **Extraction window.** SO reads raw `mes` (`src/extraction/chatWindow.ts:10`, no regex). Recast reproduces the prompt-side view with per-depth prompt regex.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Survive a third-party rewrite of the newest committed reply: roll back, then re-commit that reply's boundary | host-integration | engine / host (TurnBridge) | absent | 4 | M |
| 2 | "Post-processor" compat scenarios: rewrite of the last reply + bulk rewrite of a past range | testing | testing harness | partial | 3 | S |
| 3 | Extraction window = what the main model saw (ST prompt-only regex per depth) | enhancement | extraction | absent | 3 | M |
| 4 | Strip reasoning with the extraction profile's own reasoning template first | enhancement | extraction | partial | 2 | S |
| 5 | Post-reply agency check: flag a reply that narrates the player's act (propose, never rewrite) | new-feature | judge / agency | absent | 3 | M |
| 6 | Do NOT adopt in-place prose rewriting, send-button locking or stream-hiding | anti-pattern | host / player-ui | present | 2 | S |

**1. Re-commit after rewrite of the newest reply.**
- What:
  - If `MESSAGE_EDITED`/`MESSAGE_UPDATED` targets the newest message and that message was consumed by the last boundary, run the rollback as today.
  - Then queue a fresh boundary for the same message id: same pending/flush path, keyed `id:<content stamp>`, as the continue path already does (`CONTINUE_MESSAGE_TYPES`, `turnBridge.ts:11, 85`).
  - Journal the cause ("reply rewritten") so the rollback notice does not read as the player's edit.
- Their evidence: with defaults (autorun on, diff on), `MESSAGE_EDITED` fires on every accepted reply, and also on the restore-original paths (`R/index.js:382-388, 1054-1060, 1086-1092`). `/rc-runbulk 5-10` edits old messages one after another (`R/util/slashCommands.js:103`).
- Our evidence:
  - `turnBridge.ts:159-170` deletes the turn key and rolls back, and nothing re-commits. Every Recast-accepted reply that fired a transition therefore un-fires it and loses its memory rows. The story lags one reply behind, systematically, until the next render.
  - Delta evidence quoted from the pre-rewrite text can fail `evidenceInWindow` (`src/extraction/evidence.ts:38`) on the next read.
  - A bulk rewrite of message 5 rewinds SO to the boundary before message 5, and possibly past the horizon (E1 notice).
- Status: this is **derived from code, not live-measured**. We had no Recast install and did not run anything. Measure it first (idea 2).
- Invariants:
  - Fits inv. 3 (still one transition per boundary; the new boundary is a real rendered reply).
  - Fits inv. 11 (rollback ≡ replay with the edited input).
  - Does not fit a naive "ignore edits by extensions". An edit cannot be attributed to its author, so the only safe move is rollback + replay. Past-range rewrites must keep today's behaviour.

**2. Compat scenarios for a post-processor.**
- What: two `so-scenario` fixtures built on the existing `edit` verb (`scripts/debug/lib/scenarioSchema.mts:19, 160`).
  - (a) Real send → transition fires → `edit` the newest reply with meaning preserved → assert the checkpoint is still (or again) active and unpinned facts from that message are re-derived.
  - (b) `edit` messages N..N+3 in sequence → assert rollback lands before N, with a notice, and no journal spam.
- Optional live leg with Recast installed and autorun + `replace_inline` on.
- Their evidence: the idea-1 citations.
- Our evidence: the `edit` verb exists, and no fixture models an *extension* rewrite.
- Invariants: the live leg must be real-LLM (inv. 20). Recast is install-wide, so the run-header diff must allow/restore it.

**3. Prompt-view extraction window.**
- What:
  - New `stHost/regex.ts` wrapping `getRegexedString(mes, is_user ? USER_INPUT : AI_OUTPUT, {isPrompt:true, depth})`, with depth = distance from the chat end, the way ST builds the prompt.
  - `getChatWindow` uses it behind a capability probe.
- Why: `isPrompt:true` applies **only** scripts flagged `promptOnly` (ST `scripts/extensions/regex/engine.js:346-354`). Those are the "alter outgoing prompt" scripts users write to strip tracker HTML and status blocks, or to hide old content by `minDepth/maxDepth` (`:362-372`). Today our memory model reads that noise while the main model never saw it.
- Their evidence: `R/util/contextRegex.js:6-24`.
- Our evidence: `src/extraction/chatWindow.ts:5-14` reads raw `mes`; grep for `getRegexedString`/`regex_placement` in `src/` finds 0 hits.
- Invariants:
  - Inv. 2: needs a new stHost module and verified shapes.
  - Evidence spans (inv. 4) must be checked against the *same* transformed text, or valid quotes fail.
  - A promptOnly script can also *add* text, so record which window form a read used in the audit.
  - Size: interacts with the "no request-size bound" seed; it only shrinks the common case.

**4. Profile reasoning template first.**
- What: in `callExtractionModel`, look up the profile's `reasoning-template` (a Connection Manager profile field, ST `scripts/extensions/connection-manager/index.js:48, 67`) and try `ctx.parseReasoningFromString(text, {}, ctx.getReasoningTemplateByName(name))` (both exposed on context, ST `scripts/st-context.js:296-297`). Fall back to `stripReasoningBlocks`.
- Their evidence: `R/index.js:223-248`.
- Our evidence: `src/extraction/parse.ts:51` hard-codes the forms. This is consistent with our gotcha that CMRS never applies the template itself: Recast applies it manually.
- Caveats:
  - `parseReasoningFromString` is `strict` by default. A null result means "no block", not "unterminated", so keep our unterminated-block rule (`""`) as the authority.
  - Low value while our list covers Gemma/Harmony/think.
- Fits inv. 2 via `stHost/connectionProfiles.ts`.

**5. Post-reply agency check.**
- What:
  - After a boundary, an off-path check asks whether the reply narrates the player acting, accepting or refusing. This is exactly the defect `DEFAULT_AGENCY.never_narrate_player_action` exists to prevent (`src/engine/agency.ts:8, 19`).
  - Output is a flag only: an author-view card, plus optionally a player-safe "the reply spoke for you — swipe?" line. Never a rewrite.
- Their evidence: Recast's "Character Behavior Validator" pass is the same post-hoc checker idea, but as a rewrite (`R/settings/defaultPresets.js:23-46`).
- Our evidence: agency today is prompt-only (`agency.ts:19-35`). `agencyRecovery` detects only a *refused* route from the boundary log (`src/runtime/agencyRecovery.ts:25`). No detector exists (grep `narrate` in `src/` finds only prompt/UI text).
- Invariants:
  - Inv. 7: a new judge use, default off, with its own predeclared floor and ≥20-case Phase A.
  - Inv. 9: the author card is author-only.
  - Rewriting is out: SO never rewrites message DOM (baseline §4), and a rewrite would trigger idea 1's rollback anyway.

**6. Anti-pattern record.**
- Recast's core mechanics are the opposite of our invariants: in-place rewrite of a committed reply, a `MutationObserver` blanking `.mes_text`, `setSendButtonState(true)` for the whole pipeline, unscoped `isProcessing/currentMessageId`, and a 5 s re-entry set (`R/index.js:31-41, 323-331, 1311-1335, 1435`).
- We keep ours: nothing on the reply path (inv. 5), RunToken ownership (inv. 10), no message DOM (baseline §4).
- Listed so v2.4 does not drift toward a "polish pass" feature.

## Patterns to copy / anti-patterns to avoid
Copy:
- **Prompt-only regex at per-message depth** to reconstruct the main model's view (idea 3).
- **The profile's own reasoning template** instead of a hard-coded tag list (idea 4).
- **Fallback retry on auth errors** (400/401/403) to the currently selected profile, and a non-streaming retry after a streaming failure (`R/index.js:200-203, 795-810`). This fits our self-test/repair flow only as a *reported* fallback. A silent switch of the memory profile would break run-header reproducibility, so any fallback must be journaled and visible in `pipeline.detail`.
- **XML-tagged sections** separating card / scene / target text (`R/index.js:627-710`). Our prompts already section their input; nothing new here.

Avoid:
- **Emitting `MESSAGE_EDITED` for your own programmatic write** (`R/index.js:382-388`). Every listener takes it as a player edit, SO included. If SO ever writes a message, it needs its own event or none.
- **Global profile swapping** via `/profile` plus sleeps (`R/util/profileSwapper.js`). It races the main generation and every other extension. We already use `sendRequest` with a profile id and never swap.
- **Awaiting long work inside `MESSAGE_RECEIVED`.** It delays `CHARACTER_MESSAGE_RENDERED` for every extension (ST `lib/eventemitter.js:144-146`). Our handlers return `void` and must stay that way.
- **Hard-coded 500 ms / 5 s timers** as correctness devices (`R/index.js:1435, 1492`).

## ST host facts learned
- `eventSource.emit` awaits each listener in sequence, errors caught per listener (ST `lib/eventemitter.js:130-152`). A listener that awaits in `MESSAGE_RECEIVED` delays `CHARACTER_MESSAGE_RENDERED` (ST `script.js:3799-3800`). Recast relies on this (`R/index.js:1538-1546`). **Consequence for us:** with Recast installed, render-based timing includes Recast's whole pipeline. Consistent with our gotchas; not previously written down.
- `getRegexedString(raw, placement, {isPrompt, depth, characterOverride})` with `isPrompt:true` runs **only** `promptOnly` scripts and honours `minDepth/maxDepth` (ST `scripts/extensions/regex/engine.js:334-376`). Used at `R/util/contextRegex.js:21`. `regex_placement.USER_INPUT=1`, `AI_OUTPUT=2` (`engine.js:281-288`).
- `getWorldInfoPrompt(chat, maxContext, isDryRun)` returns `outletEntries: {[name]: string[]}` alongside `worldInfoBefore/After` (ST `scripts/world-info.js:892, 913`). Recast passes `chat` newest-first as plain strings (`R/index.js:568-569`). We did not verify whether the dry run advances sticky/cooldown.
- `getContext()` exposes `parseReasoningFromString(str, {strict=true}, template)` and `getReasoningTemplateByName` (ST `scripts/st-context.js:296-297`, `scripts/reasoning.js:1461`). Connection profiles carry a `reasoning-template` field (ST `scripts/extensions/connection-manager/index.js:48`). Recast applies it manually (`R/index.js:223-248`). This **agrees** with our gotcha that CMRS does not apply it.
- `GENERATION_STARTED` args are `(type, {automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, force_chid, signal, quietImage}, dryRun)` (ST `script.js:4299`). Recast uses `dryRun` to skip (`R/index.js:1502`).
- `ConnectionManagerRequestService.sendRequest(profileId, messages, maxTokens, {stream})` returns a **generator factory** when `stream:true`; chunks carry cumulative `.text` (`R/index.js:757-779`, ST `scripts/extensions/shared.js:423`).
- Third-party (not ST core): Stepped Thinking emits `GENERATION_MUTEX_CAPTURED` / `GENERATION_MUTEX_RELEASED` on `eventSource` (`R/util/compatibility.js:19-30`). This is a possible signal for our known Stepped-Thinking "Separated mode" boundary issue. Unverified in ST source because it is not an ST event.
- No finding contradicts our gotchas.

## Verdict
Relevance **medium**. This is a prose tool, not a story tool, so most of it is out of scope. The one thing worth taking is **idea 1 + 2**: with a very popular extension in the same install, every accepted rewrite currently rolls back the boundary its reply committed, and nothing re-commits it (derived from code; measure before building). Ideas 3–4 are cheap host-technique wins for extraction fidelity.
