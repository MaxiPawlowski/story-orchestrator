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
