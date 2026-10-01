# Plan 14 — Tiered testing: playable first, then feature groups, fixing as we go

**Status: DRAFT 2026-09-30.**

**Decided by the user on 2026-09-30:**
- Testing starts when **all development is finished**. That build is the base.
- The list is ordered. The first goal is **playable**; after that, features are tested **group by group**.
- Findings are **fixed during the tier that found them**, not batched until the end.

This plan changes plan 10's order:
- The user's sessions come **first** within each tier, not after the machine matrix.
- Phase F's single final batch becomes **one closing run per tier**, plus a cumulative ×2 at freeze.

## Rules

1. **Tiers run in order.**
   - A tier starts only when the previous tier's exit criteria hold.
   - Later tiers depend on earlier ones: a memory finding means nothing while turns do not commit.
2. **Human first, then evals.** Each tier runs this loop:
   - the user plays that tier's charters;
   - I digest the logs;
   - we review them together;
   - fixes land;
   - evals are written from the findings;
   - the tier closes.
3. **Every finding gets a severity and a class, in the review.**
   - Severity is **blocker**, **broken**, **annoying** or **cosmetic**.
   - Class is **product**, **quality**, **expectation** (a spec or UX gap) or **harness**.
   - Blocker and broken findings are fixed inside the tier.
   - Annoying findings are fixed inside the tier or deferred, and a deferral is decided in the review.
   - Cosmetic findings go to a list.
4. **A fix is proved like any change** (overview rules 15–16):
   - it has its own gate;
   - the overall gates pass;
   - a replay fixture comes from the recorded session where the defect is deterministic;
   - one targeted real-model run proves the fix where it is not.
   - The fix commit names the finding id.
5. **Evals come from findings.**
   - A bug becomes a replay fixture or a no-LLM scenario.
   - A quality problem becomes a small scored LLM eval, with the session transcripts as its corpus.
   - Plan 13's inventory rows are mapped onto the tiers. At each tier close, a row the sessions never touched is kept only if it guards a real past defect; otherwise it is retired. This resolves plan 13's deferred suite-gap decision tier by tier.
6. **The regression set is cumulative.**
   - Each tier closes by running its own evals and its mapped suite rows ×2.
   - A fix in tier N also re-runs the evals of any earlier tier whose code it touches.
7. **The fresh-import rule stays.** Each session runs on its own lane, freshly imported with `adolion-fresh`, in a visible browser, so the real install stays clean.
8. **Blind-rating legs move into the tier that owns the feature** (overview rule 11 is unchanged otherwise). Each leg is rated when its tier runs:
   - 07 Q-M in T2;
   - 06 C3 in T3;
   - 05 R4 in T6;
   - 03's rater legs in their tier.

## Before T0: session tooling (development, gated like any plan)

`scripts/debug/so-session.mts`:
- **`start <tier> <charter>`** does the following:
  - seeds a lane with `adolion-fresh`, with images and sprites switched off unless the charter needs them (and never on the shared ComfyUI);
  - launches the browser headed;
  - captures a run header;
  - starts `so-journal follow` and `st-payload arm --persist`;
  - writes everything to `test/sessions/<tier>/<charter>-<n>/`.
- **`stop`** does the following:
  - diffs the run header;
  - exports the journal;
  - stops the tails.
- **`digest`** turns a session into `findings.md`. It includes:
  - every ⚑ flag with its surrounding turns;
  - automatic anomalies: stalls, rejected extraction lines, an empty private block, lost forced lore or a missed constant entry, judge fallbacks, lost saves, unexpected checkpoint jumps, rollback notices, console errors.
- **Gate:** a node:test over a recorded fixture session. A planted anomaly of each kind must be found, and a clean session must yield zero.

The findings register is `docs/plans/v2.6/14-findings.md`. It has one row per finding, with these columns:
- id (`T<tier>-<n>`);
- tier;
- severity;
- class;
- evidence path;
- status;
- fix commit;
- eval.

## Budget and pacing

The user has a week (decided 2026-09-30), so the plan is about **32 hours of play**. The hours per tier are targets, not caps: a tier ends at its exit criteria.

| Tier | Play | Charters |
|---|---|---|
| T0 Playable | 2 h | 3 |
| T1 Story engine | 6 h | 7 |
| T2 Memory and continuity | 6 h | 6 |
| T3 Player surface | 5 h | 6 |
| T4 Mutations | 3 h | 4 |
| T5 Author loop | 5 h | 5 |
| T6 Model and judge | 4 h | 4 |
| T7 Freeze | 1 h + machine | 1 |

**Overlap.** Tiers stay in order, but a tier does not wait for every fix:
- The next tier's first charter may start once the current tier has **no open blocker**.
- Broken and annoying findings are fixed while the user plays the next tier.
- The tier closes (evals ×2) once its fixes land.

**Coverage.** Across the week, every one of the nine Adolion stories is played at least once:
- academy, adventurer, aegis, deep, east, esha, night, saga, war.

Every charter also names a story from outside Adolion when it needs one:
- the wizard's own stories;
- `wendhope-gate` as the small example.

**Charter card.** Each charter is one row in `test/sessions/charters.json`, and `so-session start` prints it:
- the story, persona, mode and settings;
- what to try;
- what to watch;
- a rubric with one row per feature it touches, each scored works, annoying, broken or not noticed, with a note.

## Charter cards

Every charter becomes a card in `test/sessions/charters.json`, and `so-session start` prints it. The cards are written from the pinned story files (checkpoint names, gates, roster, guidance), so each "drive" step points at a transition that really exists. A card has these fields:

| Field | What it holds |
|---|---|
| **Question** | The one question this session answers, in one line. |
| **Setup** | Lane, story, persona, mode (player or author), settings that differ from default, and any seeded state (for example "start at `at-the-walls`"). |
| **Drive** | An ordered list of beats: where to steer and why, each naming the checkpoint it aims at. Each beat has 1–2 **sample lines** you can use or ignore. Beats are signposts, not a script; wandering off them is fine and often useful. |
| **Look for** | Expected behaviour at each beat, and **where** to see it: chat, HUD, Overview, timeline chip, Memory tab, author panel. |
| **Must not happen** | Red flags. Press ⚑ immediately with a word or two. Examples: the narrator decides your action; a checkpoint name or id appears in player mode; a character knows something they were never told; the story advances with nothing having happened; a reply arrives in the wrong chat. |
| **Provocations** | Optional deliberate stress moves for this session's feature: say something ambiguous, contradict yourself, go silent, swipe right after a transition. |
| **Flag when** | When to press ⚑ even if unsure: "felt wrong", "slow", "repeated itself", "I don't understand what the UI is telling me". A flag with no note is still useful, because the log has the context. |
| **Stop when** | The end condition or time box, plus what "done" looks like. |
| **Rubric** | One row per feature the session touches. You score each works, annoying, broken or not noticed, with a note, after the session. |
| **Logged automatically** | What the session records without your help (extraction, judge calls, saves, prompts sent), so you never need to take notes on it. |
| **Known limits** | What not to report: features switched off for this session, known deferred items, things another tier covers. |

### Example card: T1-2 Refuse the hook

- **Question:** When the player says no to the story's offer, does the story answer the refusal without forcing or narrating compliance?
- **Setup:**
  - `adolion-adventurer`, fresh chat, player mode, defaults.
  - Starts at `guild-hall` (The Guild Hall).
- **Drive:**
  1. **Look around the hall** (`guild-hall`). Let Tobias pitch the Wendhope posting.
     - Sample line: "What's the job on the board with the red seal?"
  2. **Refuse it clearly.**
     - Sample line: "A collapsed mine shaft for that pay? No. We'll find something else."
     - Aim: the story answers with `the-sheridan-steward` (a steward comes back with double the fee and the missing detail).
  3. **Refuse again, differently.** Stall, bargain, or walk out to the tavern.
     - Sample line: "Tell the Sheridans to hire soldiers."
     - Aim: `adv-guild-tavern` or another path, never a forced departure.
  4. **Accept on your own terms, and name the party.**
     - Sample line: "Fine. Triple the fee, and we ride as the Ash Lanterns."
     - Aim: `road-to-wendhope`; that transition needs the path set to Wendhope and a party name.
- **Look for:**
  - Each refusal gets exactly one neutral, in-world answer.
  - The steward's new detail (the lost caravan and riders) appears only after the refusal.
  - The HUD checkpoint changes only at beats 2 and 4.
  - The timeline chip under the transition reply says a new scene started, with no internals.
  - Belle and Dalan voice their own opinions about the money (group direction).
- **Must not happen:**
  - The narrator writes your character agreeing, packing or leaving town.
  - The story jumps to `road-to-wendhope` without a party name.
  - The steward's secret suspicion shows up in anyone's mouth unprompted. It sits in the guidance's "Who knows what" line; that leak is C13.
  - Ids like `the-sheridan-steward` or `adv_looking_for_hands` are visible anywhere in player mode.
- **Provocations:**
  - Swipe the steward's arrival once.
  - Answer with an ambiguous "maybe".
  - Say nothing meaningful for two turns.
- **Flag when:** a refusal is ignored, or answered twice; the pressure feels heavy-handed; the party name you gave is wrong later.
- **Stop when:** you are on the road with a named party, or after 45 minutes.
- **Rubric:** agency (refusal handling), transition timing, speaker direction, the timeline at level 1, HUD.
- **Logged automatically:**
  - every extraction read (did it see "no"?);
  - blackboard `path` / `party_name` writes;
  - talk decisions;
  - the prompts sent.
- **Known limits:** images and sprites are off; the inner voice is off by default.

## Tiers

The charters list what to try, not steps to follow.

### T0 — Playable (2 h)

| Charter | Story | Try | Exit signal |
|---|---|---|---|
| T0-1 First contact | adventurer, player mode | Fresh install; Start from the entry points; 20 turns | requirements green; boundaries commit; the HUD and Overview read right |
| T0-2 Come back | the T0-1 chat | Reload the page; reopen the chat next day (away recap); continue 10 turns | state restored; no Repair row |
| T0-3 First slips | adventurer | Swipe, edit your own line, delete the last reply, regenerate | the story rewinds only what was undone |

**Exit when:**
- a one-hour session has no blocker;
- no console errors from the extension;
- every story in the library reads ready.

### T1 — Story engine loop (6 h)

| Charter | Story | Try |
|---|---|---|
| T1-1 Follow the hook | adventurer | Play cooperatively to the second checkpoint and beyond |
| T1-2 Refuse the hook | adventurer, new chat | Refuse the prepared route three different ways |
| T1-3 Group direction | war (or any group-heavy story) | Narrator plus 2–3 members; talk to one by name, then to nobody |
| T1-4 Effects | east or deep | Watch each checkpoint change: background, AN, lore that appears and disappears, cast joins and leaves |
| T1-5 Off the map | night | Push into territory the story did not author; watch generated routes |
| T1-6 Pacing | esha | A slow, talky stretch, then a rush; does tension follow? |
| T1-7 Second story | aegis | Start a different story in a fresh chat; nothing carries over |

**Exit when:**
- transitions fire from play (never from `/cp`);
- the player's actions are never narrated;
- no story stalls longer than its authored beats;
- speaker choice feels right in at least 4 of 5 group turns.

### T2 — Memory and continuity (6 h)

| Charter | Story | Try |
|---|---|---|
| T2-1 Long run | saga | 80+ turns across one act change (chapters, the saga summary) |
| T2-2 Secrets | academy (group) | Tell one character something another must not know; later check who acts on it |
| T2-3 Contradiction | the T2-1 chat | Assert something that contradicts an established fact; watch the warden and the memory queue |
| T2-4 Away and back | any 40+ turn chat | Leave for a day; read the recap cold |
| T2-5 Memory tab | the T2-1 chat | Pin, edit and exclude facts; lock one as canon; check the next turns obey |
| T2-6 Two chats, one story | adventurer ×2 | Play two chats of the same story side by side; nothing crosses |

**Exit when:**
- established facts hold across 80 turns;
- no private knowledge leaks;
- the recap and chapter titles are correct;
- the 07 Q-M legs are rated.

### T3 — Player surface and presentation (5 h)

| Charter | Story | Try |
|---|---|---|
| T3-1 Everything on | deep | Images, sprites, inner voice, timeline level 1; note what helps and what distracts |
| T3-2 Timeline levels | the T3-1 chat | Levels 0–2 in player mode, 3–4 in author view; the message inspector |
| T3-3 Inner voice | esha or night | Decision moments; does the voice add or repeat? |
| T3-4 Spoiler hunt | any story, player mode | Actively look for leaks: ids, gated lore names, future checkpoints, internals |
| T3-5 Curator ring | east | Review curator proposals in the drawer; accept some, reject some |
| T3-6 Small screen | any | Narrow viewport (phone width) across the drawer, HUD, timeline and Studio |

**Exit when:**
- no spoilers in player mode;
- every surface is scored works, annoying or not wanted;
- 06 C3 is rated;
- the C5/C6 surface decisions are made.

### T4 — Mutations and robustness (3 h)

| Charter | Story | Try |
|---|---|---|
| T4-1 Abuse | any group story, everything on | Swipe, edit and delete at every feature's moment: a transition, a memory write, a curator proposal, a chapter end |
| T4-2 Switching | two stories | Switch chats mid-generation; branch; reload during generation |
| T4-3 Cleanup | a throwaway chat | Delete it; answer the mirror-lorebook prompt both ways |
| T4-4 Restart and update | adventurer | Restart the story; take a library update mid-run |

**Exit when:**
- the story, memory, timeline and saves agree after every mutation;
- nothing leaks across chats;
- no chat loses messages.

### T5 — Author loop (5 h)

| Charter | Story | Try |
|---|---|---|
| T5-1 Wizard, premise 1 | new | Create a story from the user's first A11 premise, review mode; play 20 turns |
| T5-2 Wizard, premises 2–3 | new | Auto-draft mode; provisioning cards (characters, lorebook, group) |
| T5-3 Studio edit | a T5 story | Edit a checkpoint, gate and effect; save; take the hot-swap and the invalidating choice |
| T5-4 Repair | a T5 story | Break a requirement (disable a member, drop a book); follow Repair and Fix with wizard |
| T5-5 Author view | war | Author view on: the blackboard, scheduler, payload, next-turn preview and driver; steer with Nudge/Advance |

**Exit when:**
- the whole loop runs without touching JSON;
- the wizard never writes without confirmation;
- the A1 inspector decision is made.

### T6 — Model and judge configuration (4 h)

| Charter | Story | Try |
|---|---|---|
| T6-1 Reasoning | replay T1-1 | Each recommended reasoning setting (05) |
| T6-2 Judge providers | replay T1-3 | Each recommended provider per use (12) |
| T6-3 Harness routing | replay T5-1 | The wizard through the CLI harness route (04 H) |
| T6-4 Judge off | replay T2-2 | Judge fully off; every feature falls back silently |

**Exit when:**
- each recommended configuration plays no worse than the default;
- the judge off falls back silently;
- 05 R4 is rated.

### T7 — Freeze and cumulative run

- Freeze the candidate.
- Run the whole cumulative regression set ×2 (plan 10 phase F, expected green on arrival).
- The user plays one final free session on the frozen build (1 h).
- Write the attestation.
- The verdict follows plan 10, with "all four sessions scored" replaced by "every tier's exit criteria met".

## Before T0, from the user

- The three A11 wizard premises (T5-1/T5-2).
- A claude/codex CLI login refresh (T6-3).

## Unresolved

None.

## Gate record

### 2026-09-30: session tooling (Before T0)

**Built.**
- `scripts/debug/so-session.mts`: `start <charterId> [--lane n] [--allow-comfy] [--no-seed]`, `stop [<dir>] [--stop-lane]`, `digest [<dir>]`, `cards [--write|--check]`, `validate`, `index`.
  - `start` refuses an images/sprites card before touching anything unless `--allow-comfy`; seeds with `adolion-fresh seed <lane> --headed` (a `continue` card reuses its predecessor's lane and chat, no seed); deep-merges the card's settings into the settings root (images and sprites always written, off unless asked); reloads; opens the story's group in a fresh chat (`chats: 2`, `also: <story>` supported), `activateCheckpoint(startAt)`, seeds qualities, sets Author view per mode; captures a run header; spawns the journal, payload and console tails detached; writes `session.json` (pids, lane, chats, build, `playFrom`); prints the card.
  - `stop` kills the tails, diffs the run header (`--allow chatId,chat,story,group,inventory.journal --allow-warnings`, output kept in `run-header-diff.txt`), reopens each chat and writes `journal-<chat>.json|md`, `chat-<chat>.json`, `state-end-<chat>.json`, then `rubric.json` from the card's rubric rows (all unscored).
  - `digest` (pure, `lib/sessionDigest.mts`): flags with +-3 turns, and 12 anomaly kinds with `path:line`. Rows before `playFrom` are ignored.
- `test/sessions/charters.json`: 36 cards (T0 3, T1 7, T2 6, T3 6, T4 4, T5 5, T6 4, T7 1) in the "Charter cards" format, written from the pinned story files. Validated by `lib/sessionCharters.mts` against `test/sessions/adolion-stories.json` (story index built by `so-session index` from the adolion-fresh pin `5e2974bd`: checkpoints, edges, qualities, roster, group per story). Every drive beat's checkpoint must exist in its story; every card needs a mustNotHappen item.
- `docs/plans/v2.6/14-cards.md` (generated, drift-tested) and `docs/plans/v2.6/14-findings.md` (register skeleton).
- node:test: `lib/sessionCharters.test.mts` (14) and `lib/sessionDigest.test.mts` (6) over `scripts/debug/fixtures/session/{clean,planted}`.

**Commands (worktree, on `67888aef` + this work).**

| Command | Result |
|---|---|
| `npm run typecheck` | 0 |
| `npm run typecheck:test` | 0 |
| `npm run lint` | 0 |
| `npm test` | 364 suites passed, 1 skipped; 4862 tests passed, 1 skipped |
| `npm run build` | 0 |
| `npm run build:dev` | 0 |
| `npm run test:debug` | 477/477 (first run 475/477: one legacy-pattern hit in the new file, fixed; one `identityVerbs` reap-prompt timing flake, 3/3 green alone and green in the re-run) |
| `npm run test:release` | 79 tests, 77 pass, 0 fail |
| `npm run test:replay` | 30 of 30 killed |
| `npm run debug:typecheck` | 0 |

**Live smoke.**
- `start T0-1 --lane 4` (seeding): **failed inside `adolion-fresh seed`**, at the story imports. The staged dev bundle (built 21:53, bundle `b0bbadd6d160`) throws `TypeError: Cannot read properties of undefined (reading 'getState')` from `importStory → loadStory → updateInjection → MemoryInjector.update → ChapterPort.inject → chapterKit.returning`. Cause: `MemoryCoordinator.chapters` is a class field initialised with `deps: this.deps`, and the babel build assigns the constructor parameter property `this.deps = e` after the field initialisers (visible in `dist/index.js`), so the chapter host's `deps` is `undefined`. Jest (ts-jest) does not reproduce it. Not fixed here (plan 07 code); every adolion-fresh seed on this build fails until it is. Lane 4 stopped.
- `start T0-1 --lane 1 --no-seed` (lane 1 seeded earlier at the same pin): all six steps ran; the tails wrote `journal.jsonl`/`console.jsonl`; `stop` exported journal, chat and end state and wrote `rubric.json`; the run-header diff had 0 differences; `digest` reported 0 flags, 0 anomalies. No message was sent. Lane 1 stopped, the smoke session dir removed.

**Deviations.**
- `start <charterId>` instead of `start <tier> <charter>` (the id carries the tier).
- T1-2: The Guild Hall's alternate `the-sheridan-steward` has no gated edge in the pinned build (the other eight stories gate their refusal alternate on a quality); it is reached only from the author Driver panel. The card says so and aims beat 2 at `guild-hall`.
- T0-1: adolion-fresh binds each group to its story, so a fresh group chat already plays it; the card reads the entry points instead of picking the story from scratch.
- Wizard cards (T5-1..T5-4, T6-3) carry no checkpoint ids; `start` opens no chat for them.
- The register keeps plan 14's columns; the digest's draft rows add a `what` column for the review.

**Re-run after merging master `eba02fc8`:** typecheck 0, typecheck:test 0, lint 0, `npm test` 4909 passed / 1 skipped, build 0, build:dev 0, test:debug 477/477, test:release 77 pass / 0 fail, test:replay 30/30 killed. `MemoryCoordinator.chapters` is still a field initialised with `deps: this.deps` on master, so the seed blocker above stands.
