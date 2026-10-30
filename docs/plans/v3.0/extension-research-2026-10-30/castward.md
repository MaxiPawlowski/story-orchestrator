# Castward — 2026-10-30 harvest

meta: https://github.com/i5031337/ST-Castward · `59047b6..dedfd7c` (51 commits, 2026-10-21..29, v0.9 → v0.10) · MIT ·
read: commit log, `docs/feature-trimming-review.md`, `adversarial-review-20261025.md` (at `770dfd6`), final eval report
`tracker-model-evaluation-20261025-report.md`, src: `core/generation-{cancellation,activity}.js`, extractor queue/prompt/
readings/rules/profile-followups, `tracker-{edit-lock,update-commit,lifecycle}.js`, `chat/foreground-replies.js`,
`lore/{lorebook-write-target,lore-write-queue,lorebook-cleanup*}.js`, `locations/location-{lore*,background,image}.js`,
`npc/{npc-tool,npc-creation,npc-naming,npc-lore-handoff}.js`, `characters/player-adventure.js`, `story/history-notes.js`
(pre-existing, missed last time), scene-sprites diff, prompt diffs · skipped: `docs/evaluations/*.json` (~180k lines),
tests, collection/inventory pipeline internals, System Manager UI, TTS · prior:
`docs/plans/v2.8/extension-research-2026-10-21/castward.md` (rows V03, E01-E03, G15, G16 in `v2.9/01-triage-sol.md`).

## What it is / what changed

Same tracker extension; this week is hardening plus one new feature. New: a play-model function tool that creates NPCs mid
reply (`castward_create_npc`), randomised naming hints, a persona-based starting sheet, place lore as chat-owned lorebook
entries, per-place generated backgrounds, and activity chips above the composer that share ST's Stop button. Hardening:
a serialized reading queue (fixes lost turns), ownership + storage-acceptance commits, an edit lock during readings, a
persona-change abort, and an opt-in main-API fallback. They **removed** phrase bans and repetition scanning: "Writing
preferences belong in writing presets or backend controls" (`docs/feature-trimming-review.md:11`). They also republished
evals that put complete-reply and numeric rates next to the aggregate.

## How it works

- **Shared Stop** (`src/core/generation-cancellation.js:25-64`): every extension LLM task gets an AbortController chained
  with `AbortSignal.any`. It aborts on `GENERATION_STOPPED`, `CHAT_CHANGED` and, for persona-bound tasks, `PERSONA_CHANGED`.
  While a task runs the code forces `#mes_stop` to `display:flex`, and a MutationObserver re-shows it after ST hides it
  (`:10-22`). `awaitGenerationRequest` (`:67-74`) rejects on abort even when the backend ignores cancellation.
- **Activity chips** (`src/core/generation-activity.js`, `src/ui/tracker/ui-generation-activity.js:9-34`): an in-memory
  set, never persisted, and one chip per running task (tracker, location, profile, image) placed before `#send_form`,
  with `role=status aria-live=polite`.
- **Reading queue** (`src/tracker/extractor/status-extractor-queue.js`): requests run in arrival order. Each entry captures
  {metadata object, persona, System, message object, text, swipe}. Duplicates share one promise (`:13-17`). At its turn an
  entry is skipped when its source changed (`:43-51`), and `forgetFrom(index)` cancels waiting entries at or after a
  deleted message. Each reading builds its prompt only when it starts, so it sees the previous reading's applied state
  (adversarial review §1).
- **Commit = owner check + storage acceptance** (`src/tracker/tracker-update-commit.js:10-43`): the owner is chat id plus
  metadata identity, persona, System, JSON revisions of state/tracker/system, and the source message identity/text/swipe.
  Side effects are installed only in `beforeCommit` after `saveState` accepts. `captureReaderRules`
  (`status-extractor-rules.js:4-22`) drops a reading when the rules behind it changed (display fields excluded).
- **Place lore** (`src/locations/location-lore-store.js:11-57`, `location-lore-scan.js:4-26`): one WI entry per place, marked
  with a custom entry field `castwardPlace: {owner, id}`, where owner = `["place", groupId, avatar-if-solo, chatId]`
  (`location-lore.js:7-9`). They state that a group must not key by the drafted character (`dd69952`). On every scan, every
  array drops all marked entries, then re-adds this owner's. The current place's trail goes in as `constant:true,
  ignoreBudget:true` with sticky/cooldown/delay/group zeroed, on the scan copy only. Writes go through a per-book promise
  queue (`lore/lore-write-queue.js`) on a `structuredClone` of the loaded book.
- **NPC handoff** (`src/npc/npc-lore-handoff.js:2-42`): a just-created NPC's lore entry is pinned the same way, constant on
  the scan copy, only until the next user message. `compactNpcToolHistory` (`:45-57`) shrinks old tool results in
  `CHAT_COMPLETION_PROMPT_READY` without touching the saved chat.
- **Naming brief** (`src/npc/npc-naming.js:29-49`): weighted syllable count (1-4), stress position, and 4 candidate initials
  drawn from letters no existing cast name starts with, labelled "creative hints only". Reserved names (user, narrator, the
  player) and cast names are refused after generation (`npc-tool.js:21-37`).
- **History notes** (`src/story/history-notes.js`, `entry/entry-history-notes.js`; this predates the diff and the last review
  missed it): the generate interceptor prefixes each message in ST's *copy* of the history with that message's snapshot,
  for example `[Location: Streets | Time: 2007/12/31 17:33]`. A message that already starts with its note is skipped, so
  the interceptor can run twice. Echoed notes are stripped from the reply on arrival, the active swipe included
  (`:102-139`), but only when the first line is bracketed or `|`-separated and names a configured field. A reply that is
  only a note is kept. Off by default, and the trimming review kept it (`feature-trimming-review.md:49-70`).
- **Place descriptions** (`src/prompts/prompt-texts-locations.js` diff `4bc8b25`): 2-4 concrete sentences. Elaboration is
  decorative only: "do not invent named people, history, secrets, plot hooks". Descriptions are **self-contained**, with no
  "like the previous room". The background prompt reads only that place, at 1280×720, with a negative of
  people/text/logo (`location-image.js:9-21`).
- **Evals** (`tracker-model-evaluation-20261025-report.md`): E4B scores 584/606 checks, but only 45/60 complete replies and
  84/99 numeric, and the report says these figures "belong together". They admit that the 20 scenes "are not a fresh
  holdout despite their historical `holdout` metadata". The residual failures are mostly **missed changes** (narrated
  damage or fatigue left unchanged) plus invented acquisitions. Malformed output is not the problem.

## Patterns for SO

### P1. Time/place notes on ST's history copy — pattern · prompt / continuity · absent · value 3 · effort M (measure first)
What: each past message tells the play model when and where it happened. Without that, the model sees "a wall of
messages with no time and no place" (`history-notes.js:6-9`). Their evidence: `noteHistory` `:54-67`, echo strip `:102-139`.
Our state: we have `story_time`/`time_of_day` (`engine/life/clock.ts`), the location on the scene card
(`runtime/sceneCard.ts:18,67`), and boundary logs keyed `{lastMessageId, chatLength}`. Nothing writes to the history copy:
`.mes =` grep finds only `stHost/chatMessages.ts:23` and `polishWrite.ts:9`. The one interceptor is
`talkControlInterceptor` (`manifest.json:13`, set once in `runtime/index.ts:247`).
Fit:
- Engine stays pure. The note is derived at read time from committed boundaries, so it needs no stored state, and
  rollback is the same as replay.
- Prefix stability (13): a message's note is fixed once its boundary commits, so the head does not churn. A per-turn
  "now" note would churn, so do not add one.
- Annotate only scene-break and time-step messages, not every message. That costs fewer tokens and gives the model less
  to echo.
- An echo strip is a write to a rendered reply. It must use the polish write path and the thought-leak rules, never a
  new `.mes` writer.
- Gotchas: never re-assign the interceptor (add to its body), and the note must not leak a held secret (the location of a
  hidden scene).
- Measure echo rate and blind-rate prose before adoption: "prompt layout is quality-rated".
Sketch: `runtime/historyNotes.ts` (pure) gets `(chatCopy, boundaryLog, story)` and returns `[Day N, evening, <location>]`
on the first message of each scene or time step. It is called inside the existing interceptor behind
`continuity.historyNotes`, and it updates the payload golden.

### P2. Deterministic scan-copy pin for "here" and "just introduced" — pattern · lore · partial · value 3 · effort S-M
What: the current place's entry, and an entity first met this turn, go into the next scan as constant + ignoreBudget, on
the scan copy only, until the next user turn. Their evidence: `location-lore-scan.js:17-21`, `npc-lore-handoff.js:23-38`.
Our state: the force path already exists, but only judge-rated (`runtime/loreSelect.ts`, `loreForceWiring.review.test.ts`).
`scanGatePlan.ts` only turns entries off (`:68-85`). Nothing pins by state, whether location quality, newly latched
codex entry or living-director `liv_` stub.
Fit:
- Reuse the force seam with a code-decided pick. No judge is needed, so it stays deterministic and rollback-safe.
- Respect `scanGatePlan.ts:70`: never add keys the copy lacks. Castward zeroes `sticky/cooldown/delay/group`, which can
  disturb ST's timed-effects bookkeeping, so do not copy that part.
- Gated or secret entries stay out, because a pin never overrides the gate.
- Place it through `lorePlacement` late depth, so the cache head is unaffected.
Sketch: add `pinnedFor(snapshot)` = [location entry by authored binding or exact comment, codex/person entries latched
at the last boundary], merged into the force list.

### P3. Seeded naming brief for new names — feature · prose / distinct characters · absent · value 2 · effort S
What: random syllable count, stress, and initials not yet used by the cast, given as hints against name collapse.
Evidence: `npc-naming.js:29-49`. Our state: no name-diversity hint anywhere (grep `initial|usedNames` in `src/`: UI only).
New names come from the wizard (Sol, so lower risk), the living director's new checkpoints, and encounters
(`generation/encounters.ts`). Fit: the draw must use the seeded chance (hash of chat, story, boundary, key), not
`crypto.getRandomValues`. Used initials should come from roster + `knownEntities`, never a hidden entity's name (that
would leak it to the prompt). Sketch: `generation/namingHint.ts` (pure), with one line added to the director/encounter
prompts when an op introduces a person.

### P4. Name each running side pass at the composer — feature · UI 29 / readable state · partial · value 2 · effort S
What: one chip per running background task (kind and label), live region, transient. Evidence:
`ui-generation-activity.js:9-34`. Our state: `#so-hud-pipeline` reports pipeline status and stalls (`runtime/pipeline.ts`)
but shows no per-pass chip. Fit: it rides the snapshot (one subscription) and lives in the HUD, not a new DOM root above
`#send_form`. Do **not** copy the shared Stop: forcing `#mes_stop` visible breaks our own "generating" test and theirs
(see host facts). A player Stop aborting side passes would also switch off reads the owner wants on. Fold into 29 phase work.

### P5. Eval honesty update — test-idea · live suite · planned (E01/E02) · value 2 · effort S
No new verdict. It confirms what E01/E02 should record:
- complete-fixture rate next to per-delta rate (their 96% checks vs 75% replies);
- "a holdout used during development is not a holdout", so record first use automatically and do not trust a metadata
  flag (E02);
- most residual misses are missed changes, so E01's no-change fixtures need the mirror case: a narrated small change
  that must move.

### P6. Self-contained, decorative-only place descriptions — pattern · plan 20 place pack / wizard · absent · value 2 · effort S
What: the description rules quoted above, which make a description usable as an image prompt on its own and keep the
reader from inventing plot. Our state: plan 20 place pack `description` is "visible description only" (20 §Place pack)
with no rule against cross-references or invented hooks. Sketch: one guide line in `story-guide.md` place topic, plus a
warning when a description references another place or character by name.

## Host facts

- **`hideStopButton` emits `GENERATION_ENDED`** whenever `#mes_stop` goes from shown to hidden
  (`public/script.js:3533-3538`). An extension that forces Stop visible, as Castward does, therefore causes a
  `GENERATION_ENDED` with no generation when ST next hides it. With Castward installed it also breaks any "generating =
  stop visible" test, which `debug-scripts.md` and our harness use. SO runtime does not read `#mes_stop` (grep: none), so
  this is a harness-only risk. Worth a line in `gotchas.md` "Third-party extensions here".
- **`stopGeneration` emits `GENERATION_STOPPED` on every Stop click**, even with nothing running (`script.js:5605-5619`).
  Our handlers (`turnBridge.ts:91`, `wiring/generation.ts:156`, `polish/install.ts:44`, `sprites/stage.ts:164`) must
  tolerate a stop with no generation. Probably fine, but unverified.
- **`POST /api/chats/recent` with `{metadata:true}` and no `max`** returns every chat (character, group and root) with its
  `chat_metadata`, without switching chats (`src/endpoints/chats.js:1054-1149`). Unreadable files are **dropped silently**
  (`allSettled` filter, `:1144-1145`). So Castward's "fail closed when a header lacks metadata" guard
  (`lorebook-cleanup.js:27`) cannot see a chat the server could not read. This would be useful for a carry picker or a
  mirror orphan sweep only with that caveat. SO does not call it.
- `registerFunctionTool` `shouldRegister` runs before each request is serialized (`public/scripts/tool-calling.js:224`).
  This is CC only and not usable on our Artemis TC route.
- Castward stores a custom key (`castwardPlace`) on WI entries and relies on it surviving `saveWorldInfo`. SO uses an
  in-content stamp (`{{// so:created …}}`), which is visible to the author. Not verified whether ST's entry editor keeps
  unknown keys; no reason to switch.

## Not worth taking

- Model-called NPC creation tool: needs CC function calling, and our play route is TC. The living director already owns
  new future content.
- Shared Stop aborting side passes: switches off background work the owner wants, and the button hack breaks host state
  (see host facts).
- Reading queue / owner-revision commits / edit lock: we already have the serialized apply queue, RunOwnership checks per
  write, deltas applied only at a boundary, and rollback by message. The rule-signature discard is covered by
  `applyStoryUpdate` diff + prune.
- Removal of phrase bans/repetition scan: their reason (sampler bans belong to presets) does not touch V03. Ours is a
  prompt-side, per-member avoid list, and the token-ban host fact from the last review stands.
- Persona-based starting sheet: our stories author initial state, and a model-written start would need the carry-seed path
  for little gain.
- Opt-in main-API fallback: we already refuse rather than silently replace a route (`model-role-outage`, harness not
  offered → refused).
- Per-place generated backgrounds: plan 20 makes prepared place packs the authority, and an unreviewed generated
  background would undercut it.
- Speaker focus on scene sprites: present (`sprites/VnStage.tsx:113-118`, z-index and `so-speaking`).
- JSON numeric repair / numeric-string schema patterns: line contract, V49 SKIP stands.
- Lorebook cleanup of own books: present (`runtime/mirrorReaper.ts`, check `orphaned-lorebooks`).

## Security notes

- SECURITY.md verdict: **CLEAR (AGENTS.md note)**. Nothing was run, built or imported. Reads and `git log/diff/show` only,
  from this repo's cwd.
- Agent-addressed text in `AGENTS.md` (not followed): "rerun the check with `exec_command` using `sandbox_permissions:
  \"require_escalated\"`". It also tells agents to drive the live ST at :8000 (`node tests/ui-npc-voices.cjs`). New in
  this diff are coding/documentation rules addressed to agents, among them "Explicitly confirm with the user every time
  you edit README.md". They are benign but still agent-directed.
- Network calls in the new code are same-origin ST endpoints only: `/api/sprites/upload`, `/api/chats/recent` (reads
  **every chat's metadata**, which is a privacy-relevant reach even though it stays local), plus a fetch of the image path
  ST's generation returned. `new URL(path, 'http://localhost/')` is only a parse base. There are no new hosts, no server
  plugin and no `new Function`/`eval` in `src/`.
- The NPC tool lets the play model trigger writes: cards in the extension's settings, lorebook creation, and portrait
  generation. That is a model-driven write surface. None of the ideas above need it.
- Licence MIT, so code could be copied, but nothing above needs code; ideas only.
