# BB Interactive Map (+ BB Enhance Gen) — 2026-10-30 harvest

meta: https://github.com/maxkara14/BB-Interactive-Map `7e13f65..c339ff1` (1 commit, v2.0.3, 18 files +1319/−214) · companion
https://github.com/maxkara14/BB-Enhance-Gen `c14e681..17e187b` (2 commits, no version change, 8 files +535/−43) · **no licence in
either repo: ideas only, never code** · read: full diff of map `CHANGELOG.md` (EN), `docs/map-format-v3.md`, `map-state.js`,
`map-links.js`, `map-topology-view.js`, `index.js` (added lines); Enhance `CHANGELOG.md` (EN), `core.js`, `index.js` · skipped: CSS,
READMEs, tests (titles only) · prior: `docs/plans/v2.8/extension-research-2026-10-14/bb-interactive-map.md` (triage rows H16a, H16b,
R27–R30, R78 in `docs/plans/v2.8/61-harvest-triage-2026-10-14.md`; none reopened by this diff).

Paths: map/Enhance relative to their `source/`; SO paths relative to this repo.

## What it is / what changed
Map 2.0.3 (2026-10-29):
- Scan settings: history depth 1–100 messages (default 3); scan every N character replies, with switches to not count Continue and
  swipes/regenerations; a token budget on the added history (oldest messages dropped first, an oversized newest message cut from its start).
- Per-field tracking toggles (atmosphere, characters, objects, mood, attitude, thoughts) for new scans, display and context.
- A user colour palette (accent, surface, text, threat levels, mention colours).
- The auto-scan wait names what it waits for; it pauses after 2 min with Retry and can be cancelled.
- Mention aliases: the same scan asks the model for short names and inflected forms. They are stored with the entity and kept out of story context.

Enhance (2026-10-23, 2026-10-30):
- Streaming requests time out on idle, not on total duration; reasoning chunks count as activity.
- On failure, partial text is kept and no fallback model runs once text has arrived.
- Main generations triggered by the extension no longer get an extension timeout.

## How it works
- **Busy reason + bounded wait** (map `index.js`, `autoWaitMessage`, `AUTO_WAIT_TIMEOUT = 120000`): the reason is `generation` when
  `document.body.dataset.generating` is set, `saving` when `isChatSaving` is set, and `scan` when another map scan runs. The widget and settings show
  "Waiting for SillyTavern generation to finish…". After 2 min the state turns `blocked`: "Waiting paused: … Finish the current operation and
  select Retry". A pending reply also retries a blocked wait.
- **Reply-count interval** (`scheduleReplyScan`): skips `quiet|impersonate|first_message|extension`, plus `continue` or `swipe|regenerate`
  when the matching switch is off. Dedupe is `WeakMap<message, JSON([mes, gen_finished])>`. The counter resets on chat switch and on any settings
  change. An old pending proposal is discarded at every counted reply ("never leave an old proposal available for automatic saving").
- **History budget** (`scanHistoryText`): `getTokenCountAsync` over the joined tail. If it fits, it is used whole. Otherwise a binary search finds
  the largest suffix of messages that fits. If even the newest message alone is too big, a binary search over its code points (`Array.from`, so no
  split surrogates) keeps its newest part. A limit too small for any text is an error. This budget covers history only; the prompt itself and the
  previous map are outside it.
- **Field toggles** (`trackedMapData`): a read-time projection. Disabled fields are blanked in display and context, but stored snapshots are
  never rewritten. New scans get an explicit `TRACKING OVERRIDE: Do not generate or infer these disabled fields …` appended. The scan options
  are part of the staleness compare-and-set: if the settings changed mid-scan, the result is dropped.
- **Mention aliases** (`map-state.js` `normalizeMentionAliases`, `inheritMentionAliases`; `docs/map-format-v3.md` §Optional mention metadata):
  - Size limits: at most 16 aliases, each 2–120 UTF-16 units. `<`, `>` and control characters are refused. Duplicates and the canonical name are removed.
  - An absent list means legacy matching. An explicit `[]` means "full name only".
  - Aliases are inherited only when the entity id is reused and its canonical name is unchanged; a rename drops them.
  - The scan prompt carries the existing lists in a scan-only `<mention_alias_memory>` block. `buildMapContextString`, the macro and the read API
    exclude aliases. The editor shows them only in a closed disclosure.
  - In the index, an alias shares its entity's one-mention-per-message slot. An alias that collides with another entity's name or alias is dropped.
- **Empty labels dropped** (`buildMapContextString`): `Atmosphere:` is omitted when empty. A character renders `Name (mood, attitude: x)`
  only with the parts that exist (it used to print `Name (, attitude: )`).
- **Enhance idle timeout** (`core.js` `createRequestTimeout`):
  - The timer is reset by every received byte (`readStream(..., onActivity)`) and by every Connection Manager chunk, reasoning-only chunks included.
  - On abort, `GenerationError.partial` carries the text received so far.
  - The fallback to the main model is skipped once any text has arrived (`receivedText`).
  - The extension-owned timeout around ST's main `Generate` was removed ("SillyTavern controls the main generation lifetime").

## Patterns for SO

### P1. Name what a read is waiting on, and turn a long wait into Retry — pattern · HUD pipeline (v3.0 29) · partial · value 3 · effort S
What: while background work is blocked, the player sees what blocks it (the reply being written, a save, another pass). After a bound it
becomes an explicit "paused, Retry" rather than an endless spinner (map `index.js` `autoWaitMessage`, 2 min bound).
Our state: the pipeline line has no cause. It says "Reading the last few messages…" (in flight) or "Working through what just happened…"
(queued) (`src/runtime/pipeline.ts:141-142`). The extraction yield gate waits at most 15 s (`src/extraction/yieldGate.ts:1`). On the local
3090 a side pass can also sit in the GPU broker's text queue behind the reply or an image. None of that reaches `#so-hud-pipeline`.
Fit: player copy comes from `pipeline.ts` only (invariant), so add a `waitingOn` input and leave the components alone. The bound must not
cancel work. Only the copy changes, to `stalled-rechecking` + `retry`.
Sketch: verify which of scheduler/yield gate/GPU broker can report "blocked by X" today, and add only what is already observable. Example
copy: "Waiting for the reply to finish…", "Waiting for the picture to finish…". For 29: one line in the HUD card status row, with the detail in Author view.

### P2. Idle timeout for streamed side calls — pattern · model calls · absent (we do not stream side calls) · value 2 · effort M
What: the deadline is renewed by every chunk, reasoning included, so a long thinking pass is never cut while it is still producing tokens (Enhance
`core.js` `createRequestTimeout`, `index.js` CM stream loop).
Our state: side calls are non-streaming (`src/services/stHost/modelReply.ts:158,177`). Their deadline is a total: 30 s + 50 ms per output
token (`maxTokens + reasoningBudget`) + 2 ms per input token (`src/extraction/callBudget.ts:16-20`, `src/extraction/reply.ts:52`). Time spent
waiting in the GPU text queue counts against it.
Fit: streaming through Connection Manager (`stream: true` yields **accumulated** text, see Host facts) would let a stall be told apart from a
slow thinker. This keeps thinking on (owner rule) instead of trimming the reasoning budget to fit a timeout. Not worth building blind.
Reopen when breaker/timeout logs on thinking-on passes show timeouts with tokens still flowing. The pod `predictedMs` vs timeout comparison
is the evidence to look for.

### P3. Scan-only name variants kept out of story context — pattern · name fold / `same-character` check · partial · value 2 · effort M
What: the reading model proposes nicknames and short forms alongside its normal output. They are stored apart and used only for matching:
- never shown, never injected;
- ambiguous ones are dropped;
- a rename forgets them;
- `[]` and absent mean different things.
Our state: the name fold uses the authored roster aliases plus codex names, and folds only exact unambiguous fits
(`src/memory/nameFold.ts:29-30`). An unmatched name seen in three reads becomes the author-only `same-character` check, and is never merged
automatically (architecture §Name fold).
Fit: a model-proposed variant may only ever feed that author check as a suggestion ("the reads also call X 'the captain'"). It must never fold
on its own, or it breaks the "unambiguous or nothing" rule. Their separation rule (matching metadata never enters a prompt block) is the part
worth keeping. It also protects prefix stability (v3.0 13). Lean SKIP. Triage R29/R36 verdicts unchanged.

### P4. No empty labels in injected blocks — test-idea · payload hygiene (v3.0 13) · unverified · value 2 · effort S
What: a context line drops a field label when the field is empty, instead of printing `(, attitude: )` (map `map-state.js` `buildMapContextString` diff).
Our state: not checked. Payload goldens record every `story_*` block (`scripts/debug/so-payload-golden.mts`).
Sketch: one assertion over the golden blocks. It fails on `\(\s*,`, `:\s*[,.)]` or a label line with nothing after the colon. Cheap, and it
catches token waste that also churns the prefix when a field flips between empty and set.

## Host facts
- Connection Manager streaming (`ConnectionManagerRequestService.sendRequest` with `stream: true`) returns a generator that yields
  `{ text, swipes, state }` with `text` **accumulated**, not a delta. Verified at `ST public/scripts/custom-request.js:165-187` and `:506-529`.
  `state.reasoning` carries reasoning-only progress. Anyone adding streaming side calls must replace the text each chunk, never append it.
- `getTokenCountAsync(text, 0)` (`public/scripts/tokenizers.js`) counts with the current connection's tokenizer. The map warns that counts
  differ across modes. SO's side-call budgets use our own estimate (`callBudget.ts` `estimateTokens`). No change asked.
- `document.body.dataset.generating` + `isChatSaving` is the map's busy test. It matches our gotchas (generation state, save race). Nothing new.

## Not worth taking
- User colour palette: v3.0 29 derives colour from ST theme tokens (`src/styles/tokens.css`, `styleTokens.guard.test.ts`). A second palette would fight the native theme.
- History depth / reply-interval / Continue and swipe count switches: we already have a cadence (`src/runtime/settingsModel.ts:220`). A swipe is
  a rollback plus a recommit, not a counted reply. More knobs are chores for one user.
- Token-budget binary search over the tail: present (`src/extraction/inputBudget.ts` tail fit with `TRUNCATION_MARKER`).
- Field toggles with a prompt override: every feature already has its own switch (`features/registry.ts`). Every built feature is on by default (owner rule).
- Enhance "keep partial streamed text in the input box": our box fills are whole, never streamed (`src/services/stHost/generation.ts:92-100`).
- Enhance custom API with its key in extension settings: unchanged anti-pattern (prior review).

## Security notes
- SECURITY.md: both CLEAR. New network surface in this diff: none. The map's new import is ST's own `tokenizers.js`. Enhance only touches its existing
  request paths.
- Pre-existing and still present: Enhance's optional "custom API" sends prompts from the browser to a user-set OpenAI-compatible URL
  (default `api.groq.com`). The bearer key sits in plain `extension_settings`. That makes it unsafe to enable next to any other
  extension, given last week's trojan. Nothing proposed here needs it.
- Tests use Playwright, `node:vm` and fs (dev only, never loaded by ST). Not run.
- No text addressed to an AI agent found in the diff.
