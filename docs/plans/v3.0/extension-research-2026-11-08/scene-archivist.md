# Scene Archivist — 2026-11-08 harvest

meta: `pre-refresh-2026-11-08..HEAD` = 18 commits (1.1.0 → 2.0.1; `12cdfc1` … `ce9ac4c`), 146 files, +5093/−1977 · **AGPL-3.0: ideas only** ·
read: `little-things.js` (new), `scene-recall.js` (new), `prompt-inspection.js` (new), `flow.js`, `token-estimate.js` · skimmed:
`story-library.js`, `workbench-extras.js` exports · skipped: workbench UI, media, styles · prior:
`docs/plans/v3.0/extension-research-2026-10-30/scene-archivist.md` (P1 feature help → built in 37; P3 story-time stamped knowledge →
parked in `30-harvest-index.md` "learned-at story time") · SECURITY.md verdict CLEAR.

## What changed

- "Little Things": the archive pass may add up to 12 small easy-to-lose details (habits, gifts, callbacks, quiet promises) each with cue
  phrases, a `knows` list, participants, open/closed thread, optional date and a verbatim evidence quote that must be a substring of its
  source (`little-things.js:105-128`, prompt `:98-100`). Uncertain awareness → the model is told to omit it.
- Scene recall per generation (`scene-recall.js:43-90`): a frame from the last 24 messages detects `Place:`/`Date:`/`Flashback:`/`Scene:`
  markers and scene breaks (`little-things.js:136-180`); notes recalled when a cue phrase appears in the newest or 3 prior messages,
  only for speakers in `knows`; budget min(280, 20 % of memory budget), at most 4 items.
- Flashback filter: in a flashback to date D, memories dated after D (or with no dated evidence) are withheld (`little-things.js:204-212`,
  `:180-182`).
- Carry: a recalled note stays for up to 3 replies in the same scene/place/date, then drops at the boundary (`little-things.js:196-202`,
  `scene-recall.js:92-104`).
- "Memory trail": per reply, record which entries loaded/skipped, token cost, and the shared-prefix token count with the previous prompt
  (`prompt-inspection.js:66-118`); stored on `message.extra` and the swipe's `extra`, pruned past 24 replies.
- Coverage by `index:hash` pairs, so a repeated identical message does not inherit an earlier receipt (`flow.js:13-29`).

## Patterns for SO

### P1. Flashback-aware recall: withhold memories learned after the flashback's moment — feature · memory recall + story time 50 · our state: absent · value 2 · effort M
Evidence: `little-things.js:180-182`, `:204-212`. Our state: grep `flashback` in `src/` = nothing; story time is forward-only
(`engine/life/clock.ts:91-99`). Needs per-row "learned at story time", which is the parked row in `30-harvest-index.md` ("learned-at story
time (36)"). This is a second consumer for that design, not a new plan: add it to the reopen trigger. Detection must be code (an authored
or read `flashback` flag), never a marker regex over prose in English-only text alone.

### P2. Sticky recall inside a scene — pattern · memory retrieval · our state: partial · value 2 · effort S
Evidence: recalled item kept up to 3 replies while scene/place/date unchanged (`little-things.js:196-202`). SO: lore has hold rounds
(`worldInfo.holdRound`, `runtime/wiring/lore.ts:112`); memory rows have `usedAt` (`memory/types.ts:238`) and keys
(`memory/score.ts:126`) but I found no hold of a recalled memory row across the next replies of the same scene. A cue that appears once
then fades makes the row flicker in and out, which also churns the prompt (13 prefix stability). Sketch: score bonus while
`usedAt.last` is within N boundaries and no scene break since (`memory/sceneDetect.ts`). Measure with the A5 availability probes
(`test/support/memoryProbes.ts`) first.

### P3. Prospective cue phrases on small details — confirmation · present
Little Things cues = SO read `keys=` (`memory/readTags.ts:6-8`, `:55-66`; scored `memory/score.ts:85`, `:126`). `knows`/omit-if-uncertain
= SO epistemic rows. Verbatim quote must be a substring of the source = SO evidence rule (`extraction/evidence.ts`) and promise quotes.

### P4. Per-reply memory trail with prefix reuse — confirmation · present
SO: message inspector (Why / Prompt tabs) and `storyOrchestratorPrefixDrift.summary()` (debug-scripts.md §Payload goldens). Their
per-reply token count of the shared prefix is a nice player-invisible number; SO already measures it per member.

## Suspected SO defects

- Flashbacks advance story time. `engine/life/clock.ts:96-98`: a time read that names an earlier day part (a narrated flashback "that
  morning") computes `ahead` modulo the cycle and steps the clock forward one part per boundary while the flashback lasts. Low confidence
  that the read reports flashback time rather than the present; worth one recorded-read check (`life_time_read` values inside a
  flashback scene) before acting. Contrast `little-things.js:163-167` (flashback resets the frame, does not move "now").

## Host facts

- Writing per-reply data to both `message.extra` and `swipe_info[swipe_id].extra` (`prompt-inspection.js:107-109`) is their answer to ST
  copying `extra` across swipes; SO's rule (swipe-id stamp) is in gotchas.md §SillyTavern host.

## Not worth taking

- Regex marker parsing for `Place:`/`Date:` lines: SO's place/time come from reads and code (34 notes), not prose markers.
- Per-script token estimate (`token-estimate.js`): SO counts with the host tokenizer (41 A1).
- Story library / workspace UI: SO workspace (29) covers it.

## Security notes

- CLEAR per SECURITY.md: new modules use only same-origin `/api/characters/chats`; `package.json` re-added with `node --test` only.
- No agent-addressed text found in the diff. Ideas above need no network, secrets or server plugin.
