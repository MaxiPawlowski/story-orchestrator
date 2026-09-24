# Sorcery — v2.4 review

meta: author p-e-w · repo https://github.com/p-e-w/sorcery · commit `77b885b` (2025-05-24, v1.1.1) · 66 upvotes / 293 msgs · source available: y (`source/`, ~380 lines of own JS + vendored `lib/code-input.js`)

## What it is
Main-model "marker" protocol. User writes rules `condition → STscript and/or JavaScript`. Before each generation Sorcery appends instructions to the system prompt telling the model to emit `%[<id>]` at the exact point in its reply where the condition happens. A stream hook detects markers mid-stream, strips them from the displayed/saved text and runs the bound script immediately. No function-calling model needed. Pitched for real-world effects (smart bulbs via `fetch`), `/bg`, music, UI animation.

## How it works
- **Prompt injection = global-state mutation.** `GENERATION_AFTER_COMMANDS` → `injectInstructions` (`main.js:174`, `:65-88`): saves `power_user.sysprompt.content` and the prompt-manager `main` prompt, then appends a Handlebars-rendered block (`main.js:77-80`) to BOTH. `GENERATE_AFTER_DATA` → `restorePrompts` (`main.js:176`, `:90-96`) writes the originals back. `instructionsInjected` flag guards double-injection from dry-run interleaving (`main.js:66-70`). Author admits in post (2025-02-17 04:24) a crash between the two events leaves the global prompt permanently modified; users reported the block repeated 4x.
- **Instruction template** (`settings.js:8-35`): per rule `When {{condition}}, insert … %[{{id}}]` + `Do this ONLY when {{condition}}` (`settings.js:17-18`), anti-overuse lines, one worked example with a fake id 987. Template is user-editable (stored in settings).
- **Stream hook.** `STREAM_TOKEN_RECEIVED` → `installStreamHook` (`main.js:182`, `:124-172`), once per generation (`hookToBeInstalled`). Monkey-patches the current `streamingProcessor.onProgressStreaming` instance: `matchAll(markerRegex)` over cumulative text, dedupe by `match.index` in a Set (`main.js:129-149`), run script, strip trailing partial marker when `!isFinal` (`partialMarkerRegex` `%(?:\[\d*)?$`, `settings.js:42`; `main.js:160-162`) to avoid flicker, strip complete markers, delegate to original.
- **Execution**: STscript via `executeSlashCommandsWithOptions` (unawaited, `main.js:98-100`); JS via `Function(javascript)()` (`main.js:102-104`), global scope. Optional icon flash (`main.js:109-113`). Per-rule Run buttons for manual test (`main.js:279-290`).
- **Persistence**: `extension_settings.sorcery` only (`settings.js:54-66`, defaults-then-saved merge). Nothing per chat; no record that a marker fired.
- **Mutation handling**: none. Scripts fire during streaming, so a swipe/regenerate/continue re-fires them; an aborted stream has already fired; nothing reverts. Non-streaming replies never pass the hook → markers stay visible in chat. Impersonate also streams through the hook (ST routes it to the textarea, `script.js:3675`) → scripts fire on impersonations.
- **LLM calls**: none of its own; rides the main generation.
- **UI**: own top-bar drawer (`settings.html:1`), wired by stealing `doNavbarIconClick` out of jQuery's private event table (`main.js:192-197`); rows copied from ST's WI entry markup (`script.html`); `code-input` + hljs for highlighting, loaded as a raw `<script>` tag (`main.js:207-210`).

## Overlap with Story Orchestrator
- Injection: we use keyed `setExtensionPrompt` blocks (`src/services/stHost/extensionPrompts.ts:19`, `INJECTION_REGISTRY`) — no global prompt mutation, nothing to restore, survives crashes. Strictly better.
- Effects: ours are deterministic, authored per checkpoint, applied at a rendered-reply boundary through `EffectsApplier` with a write-ahead owned-effect ledger and rollback revert (`src/runtime/effectsApplier.ts:160`, `src/runtime/effectLedger.ts:72`). Sorcery's are mid-stream, unowned, unrevertible. Ours better for correctness; theirs wins on latency ("exactly when it happens") and on arbitrary reach (music, HTTP, anything).
- Event detection: ours = off-path extractor reads + authored regex cues (`src/extraction/cues.ts:5`, `transition.extractor_trigger`) that only force a read. Theirs = the main model self-reports in-line. Different trust model: ours never lets prose write state (invariant 4).
- Drawer: we call the exported `doNavbarIconClick` (`src/services/stHost/drawers.ts:4`), not a jQuery-internals hack.
- dry-run: we already filter `dryRun`/quiet/impersonate at `GENERATION_STARTED` (`src/runtime/coordinators/stagecraftCoordinator.ts:458`, `src/runtime/index.ts:156`); Sorcery handles it only by a re-entrancy flag and ignores quiet/impersonate.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Validate authored cue regex at parse/Studio + "test against this chat" | enhancement | studio / extraction | partial | 3 | S |
| 2 | Main-model self-report marker as a **forced-read cue** (never a write) | new-feature | extraction | absent | 2 | M |
| 3 | Authored STscript checkpoint effect (escape hatch) | new-feature | stagecraft | absent | 2 | M |
| 4 | Rule: never mutate a global host prompt and "restore later" | anti-pattern | host | present | 2 | S |
| 5 | Rule: no side effect fired mid-stream / before the boundary | anti-pattern | stagecraft | present | 2 | S |

**1. Cue regex validation + test button.** Sorcery compiles `new RegExp(settings.markerRegex)` unguarded inside the stream hook (`main.js:126-127`) and offers per-rule Run buttons (`main.js:279-290`) — the one thing it gets right UX-wise is "try the rule right here". Ours: `extractor_trigger` is copied verbatim at parse (`src/engine/validate.ts:403`), has a plain text field (`src/studio/components/TransitionEditor.tsx:123`), and an invalid pattern is swallowed at use (`src/extraction/cues.ts:9-13` `catch { continue; }`) — a silently dead cue, no diagnostic (grep: no `extractor_trigger`/`RegExp` in `src/studio/diagnostics.ts`). Add a diagnostic code (with its `DIAGNOSTIC_CONSEQUENCES` line: "this cue never fires") and a Studio "matches in the current chat: N messages" readout. Fits all invariants (read-only, author-only).

**2. Self-report marker → forced read.** Their evidence: whole extension (`settings.js:17`, `main.js:124-172`); author claims IQ3_M Mistral Small complies. Our state: cues are regex only (`src/extraction/cues.ts:5`); default cadence 3 (`src/runtime/settingsStore.ts:30`) so a transition can wait up to 2 boundaries for a read. Idea: an optional per-transition natural-language `self_report` condition rendered into an injected block; a marker in the reply schedules a P0 read exactly like `scheduleForcedCues` — never a delta. Fits invariant 4 (cue only forces a read) and 5 (reply path does not wait). Strains: (a) needs the marker stripped before it persists — only possible by patching `streamingProcessor` (no public seam; would be a new `stHost/` module over a private instance) or by editing `chat[id].mes` post-render; non-streaming leaves it visible; (b) spends main-prompt tokens and risks prose quality/immersion — the thing our main-path steering is careful about; (c) swipes re-emit. Worth only as a measured spike vs cadence-1 cost; low priority.

**3. Authored STscript effect.** Their evidence: the whole product is "bind script to event" (`main.js:98-122`). Ours: `CheckpointEffects` has no script key (`src/engine/schema.ts:87-94`); `executeSlashCommands` seam exists (`src/services/stHost/slashCommands.ts:45`). A boundary-applied `effects.stscript` (on enter) would give authors ambience/music/QR hooks without new host seams — the addendum's "ambience later only with a verified seam" could ride it. Conflicts: owned-effect ledger + rollback ≡ replay (invariant 11) — arbitrary STscript has no compare-and-set restore; security (story files are shareable, a script in an imported story runs on the player's install). If built: author-only, off by default install-wide, journaled as non-revertible, confirm on first run per story. Value 2 because nothing in current seeds asks for it.

**4. Anti-pattern: global prompt mutation with deferred restore.** `main.js:71-80` + `:90-96`; post 2025-02-17 confirms leaks. We are already right (`extensionPrompts.ts:19`, `lastWritten` keyed map). Keep as a written rule next to "a write refreshes its own injection" (invariant 16).

**5. Anti-pattern: effects mid-stream.** Sorcery fires before the reply is final (`main.js:133-149`), so stop/swipe/regenerate re-fire or orphan effects and nothing records it. Confirms our boundary + ledger design (invariant 3, 11). Also its `executeSlashCommandsWithOptions` result is discarded (`main.js:99`) — the `WriteResult`-nobody-reads trap from our gotchas.

## Patterns to copy / anti-patterns to avoid
- Copy: condition prompt shape — per-rule "When X, do Y … ONLY when X", explicit anti-overuse lines, one worked example with a dummy id (`settings.js:8-35`). Cheap template for any main-model instruction we ever inject (director/NPC/self-report).
- Copy: partial-marker strip on non-final chunks (`settings.js:42`, `main.js:160-162`) + index-set idempotence (`main.js:129-149`) — the correct shape if we ever parse the live stream.
- Copy: per-item "Run" in the editor (idea 1).
- Avoid: mutating `power_user.sysprompt` / prompt-manager prompts; reading jQuery `$._data` private tables (`main.js:194`); `Function(code)()` from settings; unawaited slash execution with discarded result; merge-defaults `Object.assign({}, DEFAULT, saved)` writes defaults back into `extension_settings` at load (`settings.js:55-63`) — the pre-`settingsReady` stamping our F2 gate prevents.

## ST host facts learned
- `GENERATION_AFTER_COMMANDS` emitted `(type, params, dryRun)` before prompt assembly (ST `script.js:4321`); mutating prompt sources there takes effect for that build (Sorcery `main.js:174`).
- `GENERATE_AFTER_DATA` emitted `(generate_data, dryRun)` after assembly (ST `script.js:5318`); ST's own preset override restores on it for non-openai APIs (`script.js:4219`). Sorcery restores there (`main.js:176`). Consistent with our gotcha "read the prompt ST actually sent from GENERATE_AFTER_DATA".
- `STREAM_TOKEN_RECEIVED` emitted per chunk with cumulative text, awaited, immediately before `onProgressStreaming` (ST `script.js:3895-3896`); streaming only.
- `streamingProcessor` is an exported `let` (ST `script.js:456`), a new `StreamingProcessor` per generation (`script.js:5387`); `onProgressStreaming` writes `chat[messageId].mes = processedText` (`script.js:3683`) and swipe slots (`:3704-3706`) — so text rewritten by a hook is what persists and what `MESSAGE_RECEIVED` consumers (incl. our extraction windows) read. Impersonate routes to `#send_textarea` (`script.js:3675`).
- `doNavbarIconClick` IS exported now (ST `script.js:10953`) — **contradicts Sorcery's comment** (`main.js:188-191`, written against older ST); agrees with our `stHost/drawers.ts:4`.
- `renderExtensionTemplateAsync(..., sanitize=false)` needed for custom elements, DOMPurify strips them (Sorcery `main.js:226-228`, their claim, not re-verified).
- `Handlebars`, `hljs` exported from `lib.js` (Sorcery `main.js:9`).
- Sorcery's injection only reaches the model when instruct sysprompt is enabled (text completion) or main prompt enabled (chat completion) (README §Requirements) — `setExtensionPrompt` has no such dependency.

## Verdict
Relevance **low**. Clever main-model marker trick, but its core mechanics (global prompt mutation, mid-stream unowned side effects, arbitrary JS) sit on the wrong side of invariants 3, 4, 11 and 16. The one thing worth taking: idea 1 — diagnose/test authored cue regexes (ours fail silently today). Idea 2 is a possible later spike, not a v2.4 item.
