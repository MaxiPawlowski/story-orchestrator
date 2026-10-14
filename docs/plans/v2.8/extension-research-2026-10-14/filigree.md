# Filigree: A Narrative RPG — 2026-10-14 harvest

meta: https://github.com/fordinator/Filigree · head `e27c839` (2026-10-10, single commit in clone) · **no licence** (no LICENSE file, no `license` in package.json/manifest) = ideas only, no code · read: all of `src/` (core, engine, services, adapter, app), README, docs/*, manifest, scene-bank head; skipped: ui/wizard, scene-builder, tests, scripts, style · prior review: none (new repo)

## What it is / what changed
- Port of a Python Discord "DM Bot". Solo-chat only (rejects groups, `adapters/sillytavern.js:14-19`); owns its own panel, transcript, and turn loop; bypasses ST's prompt build.
- FUDGE-like 4d6 (2 plus, 2 minus) stats -8..+8; action check = 8 dice (4 plus, 4 minus) + stat + FV vs DV.
- Per action the LLM classifies: creative/unique (YES/NO), CV stakes -7..7, stat + base DV; code does all arithmetic.
- "Scene bank" JSON = seeds, cues, scene cards, authored world; sampled into a per-run palette and a 3-movement compass with a turn budget.
- After the budget, the next Critical Action forces a code-computed ending verdict.
- Narration followed by a second "continuity" LLM call: rolling brief + coherence audit; one automatic repair.
- Card is a sidekick/DM voice via `generateQuietPrompt({quietToLoud:true})`, not the narrator of record.

## How it works
- Engine transaction (`engine.js:74-199`): `op` record persisted before each model call (`checkpoint()` :102-104), RNG draws recorded and replayed on retry (`draw` :96-101), reply cache by key (:105-111), revision + chat-id guard on every step (:92-95), outbox for messages published after the save (:188-190, :67-73).
- Rules (`core/rules.js`): margin ladder of 8 tiers (:55-57); erratic event when |4d6 diff| > 6 (:38-41) replaces the turn; Critical CV>=5 shifts DV by floor(cv/2) (:42-45).
- Pressure clock (`rules.js:68-73`, `engine.js:134,147`): chance += 12 + min(48, |margin|*6) per non-critical roll, +4 per no-roll action; d100 <= chance triggers a "development" permission; reset on trigger or on any Critical; trigger suppressed on a Critical.
- Arc (`scenes.js:47-68`): turn budget sampled from an authored min/max range; phase labels at 30%/70% of budget are advisory mood only.
- Finale (`rules.js:79-84`, `engine.js:157-162`): determining = (current margin + mean of prior critical margins)/2 -> success% -> victory / defeat / fatal defeat. Immediate death asks the model YES/NO only on "Very bad failure" (:151-156).
- Cue/card selection (`scenes.js:72-108`): excludes the last 8 cues / last 6 cards per slot; a value repeated 3 turns running fades for 5 turns.
- Audit (`core/ledger.js:20-27`): hard issues (mechanics/continuity/agency) must quote the candidate verbatim, checked by `narrative.includes(evidence)`; pacing issues are advisory only and become a next-turn hint (`story-turn.js:44-46`).
- Prompt clauses worth noting: `BOUNDED_ESCALATION` (`rules.js:96`), "success grants the attempted effect, not another opportunity; failure is an actual failed attempt, not indefinite nearly-succeeding" (`scenes.js:158`), stat-blind CV/DV prompts (`engine.js:133,136`).
- Edit/swipe/delete detection: compares each canonical assistant turn to the annotated chat message text, pauses play and offers rewind to the checkpoint (`app.js:118-130, 53-61`).
- Save = `saveChat()` then `/api/chats/get` read-back, exact JSON compare, revert on mismatch (`sillytavern.js:62-75`).

## Patterns for SO

### P1. Chance-ramp pressure trigger — pattern · pacing/pressure · planned: plan 49 G17 (threshold meter), v2.7 35 Ph4 (not built) · value 3 · effort M
- What: rising seeded probability instead of a fixed threshold. Small per-turn fill, bigger fill when a check lands far from its target. Reset on release. Suppressed on a boundary that already moves the plot.
- Their evidence: `rules.js:68-73`; fills `engine.js:134,147`; release is only "advisory permission" for one moderate development from existing actors (`rules.js:100`).
- Our state: G17 is a deterministic meter (`49-complications-and-twists.md:20-25`). `stretch.pressure`/`trigger` refused (`engine/validate/stretch.ts:10`). SP6 still owed (queue R12). v2.7 35 lists "odds or chaos triggers after K1–K5" as later.
- Fit: pure, seeded (`unitDraw([chat, story, boundary, "pressure"])`, `engine/chance.ts`). Derivable from the boundary log, so rollback ≡ replay holds. Filling from check margins is a world-side source; it never fills from refusal (35:232), so no invariant conflict.
- Suppression maps to "no release on a boundary that fired a transition or a check".
- Sketch: one more G17 trigger variant `{fill: {turn, check_margin_step, cap}, base}` after K1–K5. No player copy (17 decision 4).

### P2. Anti-limbo clause for check outcomes — pattern · checks/prompt · partial · value 3 · effort S
- What: tell the narrator that a success delivers the attempted effect, not a further chance to try. A failure is a real failure, not "almost". A high roll grants no unearned power or rank.
- Their evidence: `scenes.js:158`, `rules.js:96`. README:27 names "limbo" as the failure that drove the design.
- Our state: `CHECK_OUTCOME_HEADER` (`runtime/storyCheckDraws.ts:91-92`) says only "show each one happening… never change it… never mention dice". "weak" = "succeeds, at a cost" (:87-89).
- Fit: one sentence in the header. Changes the `checkOutcome` injection, so it needs a payload-golden declared hunk. Claiming an effect needs an RP measurement. Does not touch thinking or the inner voice.

### P3. Ending verdict from accumulated check results — feature · game layer/living ending · absent · value 2 · effort M
- What: the ending's valence is computed from the history of consequential checks: (last + mean of prior)/2, then tiers. Narration must honour it.
- Their evidence: `rules.js:79-84`, `engine.js:157-168`. Turn budget plus "next Critical ends" (`engine.js:158`).
- Our state: check records hold outcomes per visit (`storyCheckDraws.ts:14-25`) but no aggregate quality. `LivingEnding` = `open | director-proposes | {when: gate}` (`engine/schema.ts:507-509`) cannot read a tally.
- Fit: plan 18 principle 1 says every game fact is a quality, so add a code-derived tally quality (e.g. strong/weak/miss counts or a net score over checks marked `consequential`). Authors gate endings or final-chapter transitions on it.
- Derived in `chanceGateValues`/`checkGateValues` style, so it is replay-safe. A forced "budget then next check ends" needs director work. Skip that part.

### P4. Hard critic evidence must be a verbatim quote, checked in code — test-idea · judge/critics · partial · value 2 · effort S
- What: any LLM critic that rejects a candidate must cite an exact substring. A non-matching quote invalidates the critique, not the candidate. Pacing-type concerns are advisory only and never veto.
- Their evidence: `ledger.js:20-27`, `story-turn.js:44-47`.
- Our state: the warden and house rules go through typed judge choices (no free text, `judge/curators.ts:24`), so they are immune. Not audited: the LLM-text critic paths, i.e. the expansion critic (`judge/expansion.ts`, `generation/`) and living director refusals.
- Sketch: grep for critic/refusal reasons that cite reply text, then add a substring check plus a jest case.

### P5. Cue fade after repetition — pattern · pools/encounters · planned: plan 49 G19 spent-ness, 19 encounter pool · value 1 · effort S
- `scenes.js:84-87, 102-107`: avoid the last N picks per slot. A value picked 3 times in a row is barred for 5 turns.
- Plan 49 G19 already derives "spent" from the path. Fading is a softer reuse rule for non-spending slots (focus picks, G21), if those ever repeat. Note only.

## Host facts
- `generateRawData`/`generateRaw` take no AbortSignal and cancel themselves on any `GENERATION_STOPPED` (`script.js:4000-4018, 4108`). Filigree emits that event to cancel its own call (`llm.js:68`), which cancels every in-flight `generateRaw` on the page. SO does not call `generateRaw` (grep empty), so this does not affect us today.
- `stopGeneration()` emits `GENERATION_STOPPED` with no args unconditionally, even when nothing was running (`script.js:5607-5618`).
  - Filigree calls `ctx.stopGeneration()` to cancel its own quiet prompt (`llm.js:44`), which would also kill a loud reply.
  - SO treats a no-arg stop as a host stop (`runtime/generationLifecycle.ts:33,87`) and releases the loud gate unconditionally (`runtime/wiring/generation.ts:130`).
  - Idle case: harmless (no outermost generation, gate not held). Mid-turn case: the reply really is aborted, so closing it is correct. Not a bug, but a peer can end our group turn this way.
- `generateQuietPrompt` takes an options object `{quietPrompt, quietToLoud, skipWIAN, jsonSchema, removeReasoning, …}` (`script.js:3084`).
- `getCharacterCardFields({chid})` (`script.js:3476`) needs `unshallowCharacter(chid)` (`:7607`) first under lazy character loading.
- Save read-back via `/api/chats/get` with exact compare matches our save-evidence approach (`runtime/saveEvidence.ts`); `saveChat` swallowing errors is already in gotchas.

## Not worth taking
- LLM-decided difficulty/stakes (CV/DV): conflicts with plan 18 principle 3 (odds never from the model).
- FV "wordy +2 / brief -2" (`rules.js:46-54`): rewards verbosity, gameable.
- Interceptor that aborts every non-quiet generation while a campaign exists (`app.js:131-135`): hostile to other extensions. SO is group-only, so the two never share a chat.
- Own transcript plus `chat.push`/`addOneMessage` outbox, bypassing ST's prompt build: the opposite of our host integration.
- Op record with recorded draws for retry: our seeded hash draws already give replay (`runtime/chance.ts`, `storyCheckDraws.ts:33-34`).
- Edit/swipe detection by exact-text compare that pauses play: we roll back instead (`runtime/rollback.ts`).
- Suggested "trivial actions" with a verb whitelist (`rules.js:90-94`): we already have suggestions (`display.suggestions`).
