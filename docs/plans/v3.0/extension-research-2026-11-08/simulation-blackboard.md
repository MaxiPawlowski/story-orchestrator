# Simulation Blackboard — 2026-11-08 harvest

meta: `pre-refresh-2026-11-08..HEAD` = 4 commits (`fb9c182` 1.16.0 separate narration, `0e99bc8` 1.17.0 built-in dice, `4811f25` 1.18.0
contextual choice rolls, `ee64233` 1.19.0 layout), 61 files, +3763/−400 · **AGPL-3.0: ideas only** · read: CHANGELOG/README diff,
`choice-resolution.js`, `narration-validation.js` · skimmed: `dice-engine.js`, `preset-compatibility.js` names · skipped: prompt
markdown rewrites, tests, dashboard · prior: `docs/plans/v2.8/extension-research-2026-10-14/simulation-blackboard.md` (P1-P7),
`-2026-10-21/` (P1-P4; P1 parked as owner decision 6 in `30-harvest-index.md`) · SECURITY.md verdict CLEAR.

## What changed

- Separate narration (1.16): tool-using executor resolves the world turn; one tool-free narrator writes the answer in the user's preset;
  an independent review checks outcomes / agency / disclosure / format, up to two rewrites, no new dice or time.
- Built-in dice (1.17): `RollBlackboardDice`, `crypto.getRandomValues`, NdS, keep/drop, exploding, symbolic weighted faces; no reroll
  across retry/resume, partial receipts binding.
- Contextual choice rolls (1.18, default off): when several credible NPC reactions remain, the model lists bounded alternatives with
  coarse weights BEFORE rolling, encodes weight by repeating faces, follows the returned face, records the choice and its cause, never
  rerolls (`choice-resolution.js:3-15`). Review criteria per aspect forbid post-result reinterpretation and "splitting one outcome into
  extra weighted paraphrases" (`:21-26`). Instruction text frozen into the turn's checkpoint; a changed policy refuses resume (`:32-37`).
- Narration report validator (`narration-validation.js:41-74`): every finding must quote an exact substring of the final candidate and of
  its evidence source; evidence from `preset_context` may only support the `format` aspect, never outcomes/agency/disclosure (`:59`);
  `pass` cannot carry findings; `revise`/`blocked` need one.

## Patterns for SO

### P1. Evidence source restricted by finding kind — pattern · judge / warden / living guard · our state: partial · value 3 · effort S
What: a finding citing an author-only or instruction source can establish only the kinds of claim that source is allowed to establish
(`narration-validation.js:59`: preset text → format only; `:22-23`: the board can show a contradiction but never authorizes disclosure).
Our state: SO's rule "disclosure is not knowledge" (architecture §Boundary order) and the resting filter keep secrets out; reads verify
evidence spans against chat messages (`extraction/evidence.ts:26-84`). I found no typed "source class → allowed claim kinds" table for
model-written findings (continuity warden note, `runtime/continuity.ts`; living director guard `checkDirectorOps`). Fit: when a warden or
director output cites author truth (blackboard, held secrets, lore) as grounds for something said to the player, refuse in code by
source class, like `CURATOR_SECRET_REFUSAL`. Check `runtime/continuity.ts` first; may already hold by construction (warden never sees
held secrets).

### P2. Weighted alternatives fixed before the draw, weight not inflated by paraphrase — pattern · chance / scene test (v2.8 48) · our state: partial · value 2 · effort S
`choice-resolution.js:7-9`, `:23`. SO draws are seeded and frozen (scene test `generation/living/sceneTest.ts`, chance `runtime/chance.ts`)
and outcome tables are authored (v2.8 49 G19). Where a model ever proposes options that code then picks among (director way-ins, suggestion
chips), dedupe near-paraphrases before weighting (`memory/similarity.ts` wording fallback) so a model cannot raise an option's odds by
restating it. Test-idea for the next model-proposed pick; nothing to build today.

### P3. Separate narration = engine first, presentation second — confirmation · present
SO already resolves state in code at boundaries and lets the play model narrate; outward narration (31) limits the narrator to what the
player could observe. Their extra review pass is SO's post-generation revision (17, off; one line of evidence for it in
`30-harvest-index.md`). Nothing new.

## Suspected SO defects

None from this diff.

## Host facts

None new (dice tool needs CC function calling; SO play is TC).

## Not worth taking

- Crypto randomness for rolls: breaks SO's seeded chance (rollback ≡ replay). Anti-pattern for SO.
- Model-called dice tool on the play path: TC has no tools; extra round trips per turn.
- Frozen instruction snapshot refusing resume when the policy changed: SO has no resumable multi-call play turn (prior review P4, present).
- Up to two narration rewrites per turn: same verdict as 17 (off).

## Security notes

- CLEAR per SECURITY.md: local dice engine/panel (no scripts loaded), private runner executes its own dice tool; "secret" hits are RP
  prompt text. No network.
- No agent-addressed text in the diff. Ideas above need no network, secrets or server plugin.
