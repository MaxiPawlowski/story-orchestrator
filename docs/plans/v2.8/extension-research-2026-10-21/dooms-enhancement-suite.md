# Doom's Enhancement Suite — 2026-10-21 harvest
meta: https://github.com/DangerDaza/Dooms-Enhancement-Suite · `pre-refresh-2026-10-21` (`c97bac0`, 3.0.1) .. HEAD `876a36f` (3.1.4-beta.1), 74 commits, 66 files, +12.7k · licence **AGPL-3.0-or-later**: ideas only, never code · read: CHANGELOG 3.1.0–3.1.4, `src/systems/features/diceRolls.js` (head, pending check, ruling, send, verdict, regenerate offer), `src/utils/d20.js` (verdict, margin, ownership, call instruction, override), `generation/injector.js` diff, `generation/trackerRecovery.js`, `rendering/thoughts.js` diff, `voices/{delivery,voiceSettings,transport}.js` diffs, `voices/segmenter.js` head, `core/config.js` version check, `promptBuilder.js` NPC-list sentence · skipped: stats/handover/phase docs, UI audit, Workshop/attributes/dice panel UI, beta report, fab guard, CSS, vitals UI, sheet-suggest body · prior: `docs/plans/v2.8/extension-research-2026-10-14/dooms-enhancement-suite.md` (triaged as H16c, H16d, R39, R40 in `61-harvest-triage-2026-10-14.md`)

## What it is / what changed
Same narrator-runs-a-cast overlay. The new code is "Project Short Fuse", a stats beta, all off by default:
- **Vitals:** 0–100 bars per character that the model moves each reply, kept per swipe.
- **Attributes and d20 checks the player triggers:** the player tags their next message with an attribute or skill and a line of context. On send, a small model call rules the difficulty, the die rolls, the roll is stored on the player's message, and a verdict is injected.
- **Checks the game master calls:** a `[CHECK: …]` tag at the end of a reply, or a function tool.
- **More dice rules:** saves, tiers, casting checks, talents.
- **A result the player can set:** the player steps the die face, then is offered a Regenerate.
- **Tracker recovery:** a reply that skips the in-reply data block triggers one separate fetch, and a one-time reminder goes to the next generation.
- **Voices:** a delivery note per character, a per-line "anchor" built from the voice's description, Steadiness (TTS temperature), Never whisper.
- **Stale scripts check:** the code's version is compared with the server manifest at page load.

The voice work is still TTS only. Nothing in DES rewrites reply text.

## How it works
- **Roll lifecycle** (`diceRolls.js`):
  - `tagCheck` (`:342`) holds one pending check.
  - `onDiceMessageSent` (`:558-603`) runs in `MESSAGE_SENT`, which ST awaits. There it rules the difficulty (`rateAttempt` `:400`: one small call with a 20 s timeout; on a timeout or an unreadable answer it falls back to the configured default, and `source`/`error` say which happened), rolls with crypto RNG, and writes `message.extra.dooms_roll` on the **player's** message.
  - The verdict is rebuilt from the chat each generation (`buildDiceVerdictForGeneration` `:605-624`), so swipes and regenerates narrate the same outcome.
  - The injection is set twice (`injector.js` `refreshDiceInjection` `:699`): at `GENERATION_STARTED`, which fires before the sent message exists, and again from `MESSAGE_SENT`.
- **Verdict text** (`d20.js:931`): the arithmetic, then an outcome word plus a margin word (`marginWord` `:875`: narrowly ≤2, clearly ≤7, decisively), then "This outcome is final: narrate … Do not re-roll, reverse or soften it." `ownershipSentence` (`:904`) says whose roll it is ("This roll is X's: it decides whether X succeeds…, nothing about Y's own attempt"), because the model mixed up NPC and player rolls. A `STILL_REQUIRED` tail (`diceRolls.js:261`) tells the model that the reply's format does not change.
- **Injection placement** (`injector.js:674-697`): the verdict goes at the same depth and role as the tracker instructions, and its key sorts before theirs, so the format instruction stays the last thing the model reads. As a system message at the same depth, the verdict landed after the instructions and replies dropped the block.
- **Setting the result** (`diceRolls.js:838-907`): the die steps one face at a time. The original roll is kept under `before`. When the reply is the chat's last, closing a changed die offers ST's own `#option_regenerate`. The reply already written stands until its next swipe.
- **Game master calls** (`d20.js:1364-1385`):
  - The rules are explicit: "The game rolls the dice; you never do", at most ONE check per reply, never for routine actions, and "the result arrives with the next message".
  - A tag on an NPC rolls when the reply renders, is stored per swipe and is shown in place of the tag.
- **Tracker recovery** (`trackerRecovery.js`): a pure check of whether this swipe holds data. After a function call, ST stores the reply in three messages: the first part, a tool record and the continuation. Only the continuation gets `MESSAGE_RECEIVED`, so a block in the first part is found by walking back to the user's message (`earlierPartsOfTurn`). The reminder ("Your previous reply left out …", `injector.js:684`) goes out once.
- **Voice delivery** (`delivery.js`):
  - `noteFor` (`:121`) uses the speaker's own note only when the line is theirs. A line the narrator reads gets the global note.
  - `anchorForVoice` (`:45`) adds gender, language and the first clause or two of the voice's design description, capped at 120 chars and cut at a clause, then a word, to every line. It is re-sent on every request because the provider otherwise re-imagines the voice per request.
  - `NEVER_WHISPER_NOTE` (`:31`) is a global ban that overrides per-line cues.
  - When the provider refuses an optional field (the note or the temperature), the line is retried once without it and the field is dropped for the rest of the session (`transport.js` `postDirect`).

## Patterns for SO

### P1. Player-declared attempt with a seeded roll on the player's message — feature · game layer/player-ui · absent · value 3 · effort M
- **What:** the player marks their next message "I'm trying this" (pick an approach, one line of context). On send, a difficulty is set, a seeded draw resolves it, and the outcome rides that message. Every reply answering it (swipe, regenerate, every group member in the round) narrates the same outcome. Today the player can only make an attempt the author already wrote as a check.
- **Their evidence:** `diceRolls.js:342, :400-445, :558-624`; the verdict format at `d20.js:875-940`.
- **Our state:**
  - Only authored checks exist: `StoryCheck` (`src/engine/gameSchema.ts:118-128`).
  - They are evaluated when their gate holds, recorded in `extras.checks`, and narrated by `checkOutcomeBlock` (`src/runtime/storyCheckDraws.ts:94-110`) through `INJECTION_REGISTRY.checkOutcome` (`src/runtime/checkOutcomeHost.ts`).
  - Nothing lets the player ask for a roll (grep for "player-declared", "ad hoc" or "improvised" check in plans and src: 0).
  - Not in triage 61.
- **Fit:**
  - Draw from `unitDraw([chatId, storyId, boundary, "attempt:" + messageId])`, never `Math.random`. Then rollback equals replay, and an edit or delete of the player's message rolls the attempt back through the existing quarantine path.
  - Record the attempt in the `extras.checks` ring as a `RollRecord` with `source: "attempt"`, keyed by `messageId`. Narrate it through the existing outcome block. That header already says "never change it … never mention dice", which is more immersive than DES's arithmetic.
  - Difficulty, in this order:
    - when an authored check's `when` gate matches the attempt, use that check;
    - else the story's default band;
    - optionally a judge Choice use (calibration needed: our "uncalibrated → refused" rule applies) with a timeout fallback to the default, as DES does.
  - **Narration-only by default.** An attempt writes no blackboard key, so "the world decides outcomes in code" and the boundary order stay intact. A later version could let an author map attempt kinds to qualities.
  - The player sees the outcome chip (C9 roll chips exist), not numbers. Author view sees the draw.
  - **Must not run in `MESSAGE_SENT` as an awaited model call.** Gotcha: never await model work there; start it there and await it in the interceptor (`runtime/loreSelectTiming.ts` pattern).
  - DES's die you can set yourself = T7 viewer write (`27-gamification-report.md:159`). Skip that part, or make it an author-only override recorded as a boundary write.
- **Sketch:**
  - UI: an "Attempt" toggle by the input (HUD or `#so-hud` chip) holding the pending attempt in memory.
  - On `MESSAGE_SENT`, bind it to the message id.
  - Boundary work entry `attempt` (before `recap`, order < 7) draws and records.
  - Detector: covered by the existing `extras.checks` rollback; add a planted-control test.

### P2. Margin word and "whose roll" in the outcome block — pattern · game layer/prompt · partial · value 2 · effort S
- **What:**
  - Add a margin word (narrowly/clearly/decisively) next to the outcome.
  - In a group, name who made the attempt and that it decides nothing about anyone else's attempt.
- **Their evidence:** `d20.js:875-880, :904-917`. They added the ownership sentence after the model mixed up whose roll it was.
- **Our state:**
  - `OUTCOME_PROSE` has degree words for banded checks (`strong`/`weak`/`miss`) but plain `succeeds`/`fails` otherwise.
  - The line names the check label, not the actor (`storyCheckDraws.ts:94-107`).
- **Fit:**
  - A margin word for plain d-target checks is a pure render from `record.total - record.target`.
  - The actor name comes from the roster or the player name. Use names only, never ids. Respect `withheldNames`.
  - Payload golden diff: declared hunk.
  - Fold into 18 Q3/Q7 (check-outcome header clause H16e), not a new plan.

### P3. Stale-bundle check — pattern · checks/dev chores · absent · value 2 · effort S
- **What:** at boot, compare the version the running code was built as with the version the server now serves. When they differ, show one row: "This page runs an older build; reload".
- **Their evidence:** `src/core/config.js:39-60` (`CODE_VERSION` vs `manifest.json` fetched with `cache: 'no-cache'`; per-device advice, since iOS Safari has no hard reload).
- **Our state:**
  - `dist/manifest.json` carries `bundle.sha256`, but only the harness compares it (`so-run-header`, `lib/servedBundle.mts`).
  - Gotcha "A plain reload can re-run the cached bundle (ETag)".
  - No runtime check (grep `src` for stale/served bundle: 0).
- **Fit:**
  - Webpack injects a build id. The check reads the staged manifest once.
  - Register it as an `info` check in the one registry (`runtime/checks.ts`) with player copy and a firing fixture.
  - It saves the owner a class of "my fix didn't work" moments (phone over the tunnel included). Not a player-story feature.

### P4. Per-member voice notes as a re-sent anchor in the private block — pattern · per-character presentation · absent · value 3 · effort S–M
See §For per-character polish.

## For per-character polish
DES has **no text post-processing**: no rewrite, validator, repetition pass or grounding pass. Its per-character work is TTS. What carries over is how it keeps per-character config and applies it.

- **Mechanism:**
  - Per character it keeps a voice ref carrying an optional `note` (delivery). The global settings hold the default note, Never whisper, Steadiness and anchoring.
  - For each line, `noteFor(ownRef, reason, globalNote)` (`delivery.js:121`) picks the speaker's note only when the line is attributed to them. Lines nobody owns, or that the narrator reads, get the global note.
  - `anchorForVoice` re-sends a ≤120-char head of the character's description on every request.
  - Global bans (`NEVER_WHISPER_NOTE`) override per-line cues: a per-character note cannot re-enable what a global ban forbids.
- **Attribution:** a segmenter (`segmenter.js`, `segments.js:67-148`) splits a reply by speaker using the dialogue colouring its own prompt asks for (`<font color>`). With no colouring the whole reply is narration. It merges adjacent same-speaker lines, caps at 24 segments (the overflow goes to the narrator) and splits long segments at sentence ends.
- **Safety:** nothing is written back to `mes`, so it cannot add facts or player actions. A provider refusing an optional field degrades to sending without it, for the session only (`transport.js` `postDirect`).
- **Cost:** one TTS call per segment, cached. Audition ×3 renders one test line three times to judge consistency.
- **Swipes, edits, streaming:**
  - One arm per loud generation (`voiceBoot.js:133-203`, covered by the prior review). The read happens after render, never during the stream.
  - A Continue reads only the new part (`dropAlreadyRead` `:126`).
  - Swipe, delete, stop and chat change clear the arms.
- **What SO can take for per-member polish:**
  1. **Steer before the reply, not only after it.** A `roster[].voice` block (a few short fields: register, lexicon to use, words to avoid, rhythm) rendered as a ≤N-token anchor into the **drafted member's private block** through the existing hook `memory.injector.addPrivateSource(rosterId => lines)` (`src/runtime/managerWiring.ts:81-152`). It re-sends every generation like DES's anchor, costs no model call and is safe against new facts.
     - The private block already exists per member. `RosterMember` has `role`/`drive` but no voice fields (`src/engine/schema.ts:326-339`).
     - Prompt-cache note: private blocks already vary per member, so this adds no new cache break.
  2. **Resolve the note per segment, never per reply.** A Recast-style post-pass in a group reply is per member (one member, one reply), so the attribution is trivial. On a narrator card that voices many people, the post-pass must segment first and apply each member's notes only to lines attributed to them. Unattributed lines get the narrator's or the story's defaults. DES's rule: own note only on own lines.
  3. **Global bans outrank per-member notes** (story-level "never" list > member lexicon), so a member note cannot reintroduce a banned tic.
  4. **Graceful degrade:** if a polish pass is refused, times out or returns something the safety diff rejects, keep the original reply for this turn and record why. Never block the reply.
  5. **Audition as an authoring test:** in the Studio, generate one prompt line three times with the member's notes and once without, so the author can see whether the notes steady the voice. Our wizard or Ask route runs it, never Artemis for authoring.
- **Still owed by any SO post-pass (from the Recast rows, not from DES):** the swipe-sync and listener-order rows R3–R6 (`61-harvest-triage-2026-10-14.md:221-224`, plan 69 K6/K6b/K8). The thinking/inner voice stays on. A rewrite must not orphan `extra.reasoning`.

## Host facts
- **Prompt assembly order for injected prompts.** `getExtensionPrompt` sorts `extension_prompts` keys and joins every prompt sharing position, depth and role into one message (`public/script.js:3309-3318`). In `doChatInject` (`:5628-5668`) the role order is [system, user, assistant] spliced into the reversed chat, so in the final prompt a depth's assistant message comes first and its system message last, closest to the end. Verified.
  - So at equal depth our `story_orchestrator_*` system-role blocks land after any user-role injection, and after any lower-sorting key of the same role.
  - That matches DES's finding that the last instruction the model reads wins format adherence.
  - The next-turn preview claims to follow ST's assembly order. Worth a test that pins this role order.
- **ST splits a reply that calls a function tool into three messages:** the first part as its own message, a tool record (`extra.tool_invocations`), and the continuation. Only the continuation gets `MESSAGE_RECEIVED` (`trackerRecovery.js` `earlierPartsOfTurn`). SO handles tool-call turns (`61-harvest-triage` §built, "tool-call turns"), and play runs Text Completion with no tools. Not verified against ST here.
- `GENERATION_STARTED` fires before `sendMessageAsUser` adds the player's message; `MESSAGE_SENT` listeners are awaited before the prompt is built (`injector.js` comment on `refreshDiceInjection`). Consistent with our `MESSAGE_SENT` gotcha.
- ST's Regenerate can be driven by `#option_regenerate` with the options menu closed (`diceRolls.js:900-906`). Not verified.
- Nothing found that looks like a bug in SO.

## Not worth taking
- Game-master `[CHECK: …]` tags in reply text: a model-emitted tag rewritten at receipt. Plan 68 rejected exactly this (dynamic-response P2). The function-tool variant does not fit Text Completion play.
- Setting the die yourself, and regenerate-on-change: T7 viewer write (`27-gamification-report.md:159`). It kills the stakes for a solo player; author override only, if ever.
- Vitals moved by the model each reply: model-written numbers outside the boundary. Our qualities come from typed reads and clamps (`Blackboard.applyDelta`).
- D&D 5e sheets, saves, tiers, casting, talents: a ruleset, not a story mechanism. Our checks are authored and banded.
- Tracker recovery and the "you left out the block" reminder: extraction runs off-path, so a reply carries no data block for us.
- "List every NPC in the scene" tracker sentence: our scene read is typed. At most a wording check for the cast-in-play read (value 1).
- Steadiness temperature, Never whisper, designed or cloned voices: TTS provider UX (R40 SKIP stands).
- Sheet suggestions from the story with an "AI-suggested" badge: our wizard is already confirm-only.
- Beta report, fab guard, the Doom button: their own UI chores.
