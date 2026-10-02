# T5 summary

## T5-2 Wizard, premises 2 and 3 (lane 4, `test/sessions/T5/T5-2-1` INVALID, scores provisional)

- **T5-2-1 (INVALID, harness reason, scored provisionally):** played 2026-10-02 07:59-08:36Z on a fresh lane 4 seed (pin be0696b), served bundle `d6737acda880` (dev, master `7b93a6cc`), media off. Author mode. The agentic wizard ran in Agent mode "Write to the draft, review before saving" (auto-draft), local route (DeepSeek). It made two stories, saved as `the-pawnbroker-of-forgotten-days@1` (then @2 after a hand fix of its requirements) and `the-hoard-of-the-unflown@1`, and created 2 lorebooks with 12 entries, 9 cards and 2 groups. Each group got one chat with 2 smoke turns: `2026-10-02@05h10m03s963ms` (Pawnbroker) and `2026-10-02@05h20m15s843ms` (Hoard), both adopted. 22 driver rows, 5 flags plus 1 accidental flag "x" (seq 4, operator slip, ignore).
- **Why INVALID:** stop's run-header diff blocked on `inventory.characterCount`, `lorebookCount`, `lorebooksSelected`, `v2Stories` (+2 stories) and `wizardSessions`, exactly what this card exists to create. T5-2 declares no `headerAllow`, and ids and names are only known at run time, so every wizard card (T5-1 too) fails the same way. Confirmed before the smoke turns: `x-prediff-before-smoke.txt`. Fix: a wizard-aware allow (assets in the session's wizard ledgers).
- Route: P2 needed 3 goals (build, finish structure, provision; each ended "Out of budget" at step 26-27), then an Undo provocation, Save, Close, "New story (wizard)". P3 needed 4 goals (build, cast, provision "done" at 18, effects). Pawnbroker was not ready in its own group (requirements by roster id), fixed by hand (v2, compatible hot-swap), 2 turns. Hoard ready at once, 2 turns, transition start -> summons fired.

| Row | Score (provisional) | Evidence (T5-2-1) |
|---|---|---|
| auto-draft | annoying | shots/002-p2-out-of-budget.png, shots/005-p2-continue-dead.png, x-p2-steps8-14.json, x-p2-undo-before.json, x-p2-undo-after.json, wizard-drafts.json:2486 |
| provisioning waits | works | x-watch-p2.log:15, :16, x-applied-p2.log:10, shots/007-p2-lorebook-card-waiting.png, x-applied-p3.log:56 |
| diagnostics | annoying | x-p2-diagnostics.json, x-p3-diagnostics.json, shots/016-p2-not-ready-in-own-group.png, wizard-drafts.json:2486 |

Must-not checks: no asset before its card was applied (all 25 cards waited; chars 163->172, books 24->26, groups 12->14 moved only on Create it); the two stories share nothing (89 P3 prompts, 0 with "Pawnbroker"); no save over an existing id; same-title save not provoked.

Findings:
- HIGH (product): the agent's `setRequirements` wrote roster ids as members (`["clerk","collector","queen","thief"]`, `wizard-drafts.json:2486`), replacing the card follow-ups that used names; `requirementsRead` matches names, so the story was not ready in the group the wizard had just built. Diagnostics silent, save allowed.
- MEDIUM (product): 150k-token agent budget ends every run at step 26-28 of 40; Continue after "Out of budget" is dead (`resumeAgent` keeps `usedTokens`, `src/copilot/agent/loop.ts:120`).
- MEDIUM (product): `addCheckpoint`/`addQuality` with an existing id append a duplicate (`src/studio/mutations.ts:35`); `removeCheckpoint` then removes both; P2 run 1 lost 10 of 26 steps to it.
- MEDIUM (product): the agent session is keyed by the draft title at drive start (`untitled-story`), so a new story shows the previous story's first run, and New goal erases it.
- MEDIUM (story content): each card's first message is written for that character's later beat; all members greet at once in a fresh group, spoiling the thief at message 0; no start-checkpoint `cast_changes`.
- LOW: one Undo removes a created lorebook from requirements/stagecraft/lore-select without telling the agent or bumping `runEpoch`; Studio tab switch resets the Wizard to "Step by step".
- LOW: `house-rule-compound` flags one-fact world rules as two demands (agent spent 6 steps on it).
- LOW: agent summary miscounts entries; repeated `readStory` because the step window drops older steps.
- Harness: wizard cards INVALID by design; flags with no chat open reach no journal (digest shows 1 of 5); runbook sends the premises as `turn` lines with no chat; `so-ui.mts` lacks Agent-mode verbs; `score` accepts scores on an INVALID session.
- Judge 44 calls, 3 timeouts. DeepSeek 209 calls, 1,030,213 in / 53,605 out. Main RP 16. Pod about 48 min (seed + play). Assets left on lane 4's copy.

## T5-5 Author view (lane 1, `test/sessions/T5/T5-5-1` VALID)

- **T5-5-1 (VALID):** played 2026-10-02 09:23-09:41Z on a fresh lane 1 seed (pin be0696b) with the default thinking overlay (e29821df), served bundle `d6737acda880` (dev), media off. Author mode, chat `2026-10-02@06h23m29s662ms`. 4 player turns, Nudge once, Advance once (war-the-summons -> war-the-front), Report once, Author view off/on once, inline level 3/4 for the inspector then back to 1. 3 flags. Stop: header diff clean (repo build moved, served bundle identical: allowed warning). First `start` failed on a seed race (cards "not installed" read too early after the page reload); the retry passed.

| Row | Score | Evidence (T5-5-1) |
|---|---|---|
| blackboard | annoying | shots/001-blackboard-council.png, shots/011-blackboard-pending-commission.png |
| scheduler | works | shots/002-scheduler-council.png, shots/013-curator-proposal-diff.png |
| payload / next-turn preview | annoying | x-nextturn-before-t1.json, x-nextturn-before-t2.json, payloads.jsonl:1, :9, journal.jsonl:206 |
| driver (Nudge / Advance) | annoying | payloads.jsonl:9, :12, journal.jsonl:139, :208, shots/012-after-advance.png |
| A1 inspector decision | annoying | x-inspector-msg11.json, shots/015-inspector-msg11.png |

Must-not checks: nudge in exactly one prompt then cleared; no author panel leaked with Author view off (`assert-player-clean` ok); preview listed blocks all matched the sent prompts but it omits the drafted member's private block (flagged).

Findings (detail in `T5-5-1/findings.md`):
- HIGH (product/preset, thinking overlay): every Forre reply starts damaged: msg 4 a repeated `Forre: `, msg 6 `rre's eyebrow…`, msg 8 `re: "A wise decision."`. The model rewrites the name after the thought channel; names-as-stop off. The model-defect check caught none.
- MEDIUM: next-turn preview omits the per-member private block (`Your private aims`).
- MEDIUM: the Advance (engine log `source: manual`) is not shown as an author move in any panel or inline level.
- MEDIUM: Blackboard tab lists only written keys; a pending delta shows only on the HUD.
- MEDIUM: the inspector opens at the top of a drawer that stays scrolled down (off-screen).
- MEDIUM: thinking 1038-2436 chars against a "under 100 words" brief, 77-91% of each reply's time; replies 46-102 s, turns 88-139 s.
- LOW: lost spaces after closing asterisks (msgs 6, 8, 11); stale driver Report; duplicate memory/epistemic rows; ST Summarize quiet run takes the thought prefix; nudge row not marked one-turn; Inner voice lists all 20 cast.
- Thinking: 5/5 replies with parsed reasoning, 0 empty, 0 leaks, 0 character-line cuts, 3 repeated-name starts, 0 loop-guard swipes; harvest fed 2 epistemic passes that stored `[intends]` rows (Forre, Aristhide).
- DeepSeek 24 calls, 61,688 in / 10,987 out. Judge 69 calls (1 director timeout). Main RP 6 (5 replies + 1 ST summarize).
