# Plan 10 — Acceptance: the ×2 matrix and the sessions (Claude's, reviewed with the user)

**Status: APPROVED 2026-09-30, reordered by plan 14 and executed through plan 15 Part B (W26).** Claude plays plan 14's
charters autonomously; the user and Claude review everything together on 2026-10-01. The user's own sessions are
optional and later, and v2.6 development is done without them. Below, "the user's part" means **recorded for the user's
review**.

v2.5 `10-acceptance.md` is the template: Phase 0 harness items, entry criteria, the matrix, the critical rows and the
verdict rules. It is adopted unchanged except where stated here. Its Phase 0 items H-a, H-g, H-j and H-k were never
done and are the first work here.

## Changes from v2.5 plan 10

0. **Plan 14 reorders this plan, and plan 15 hands it to Claude** (user, 2026-09-30; W26). Sessions run first inside each test tier, played by Claude (plan 15 Part B); findings are fixed in their tier, and each tier closes with its own ×2 rows. Phase F below becomes T7: plan 09's I1–I6, then the cumulative set ×2 on the freeze. Where this plan says sessions are last or the user plays, plan 14 and plan 15 win.

1. **Corpus.** Every matrix row that has an Adolion variant (from plans 01–03) runs both toy and Adolion ×2. A row
   counts green only when both columns are green.
2. **The judge column is flipped.** The default column is judge on, and the **judge-off column** proves every fallback
   (overview rule 5). Both are ×2.
3. **Integration rows.** Plan 09's I1–I6 join the matrix ×2, and every row from 05–08, 11 (J9b, W1–W6) and 12 (every recommended provider × use) runs ×2.
4. **Spikes.** Every `include` spike's rows run ×2, and every `drop` has its removal control.
5. **Sessions are Claude's, inside the tiers; the user's are optional and later** (overview rule 6 as amended by W26;
   this supersedes v2.5 decision A4's option b and this plan's earlier "human sessions last"):
   - Claude's sessions run in plan 14's tiers on the dev build (C7), so the logs come back.
   - The user's own sessions, if they happen, run later on the frozen candidate and are not a v2.6 development gate.
   - The machine matrix is not re-run after a later user session unless its finding forces a code change. A code change
     re-freezes, and only the affected rows re-run.
6. **Attestation** goes to `docs/release/2.6.0/attestation.json`. There is no 2.5.0 attestation.

## Phase F: the final LLM suite (overview rule 13)

The one place regression and acceptance LLM runs happen.
1. **Freeze** the candidate (every plan's overall gates green, rule 16).
2. **Fresh Adolion import** on every lane (`adolion-fresh`, rule 14). The toy stories are re-seeded the same way.
3. **Run plan 13 R5's suite list** in order, cheapest first so that an early failure costs little:
   1. no-LLM scenarios;
   2. journeys;
   3. carry-over rows (01);
   4. recommended-config rows (05, 11, 12);
   5. kept spike rows (03);
   6. integration (09);
   7. the judge-off column.
4. **Run it ×2**, the whole list on one lane series, with a run header diffed around each pass.
5. **A failure is fixed, the candidate re-freezes, and only the affected rows re-run ×2.** The fix commit names them.

## The blind-rating pack (recorded for the user's review)

Overview rule 11 collects every human-rated A/B leg into one pack. Claude records both arms of each leg in its tier
(plan 14 rule 8); the pack is **built from the recorded arms** and goes to the joint review (2026-10-01, plan 15 Part B
hand-off), where the user rates it:
- 05 R4: 20 climax turns;
- 06 C3: 30 decision-point pairs;
- 07 Q-M: the quality legs;
- 11 W6: agent story vs the staged wizard on the same premise (3 premises);
- any rater leg from 03.

Pairs are shuffled and unlabelled, and each shows the context window and the two replies. Scores are written to
`human/rating-pack.json`, and each plan reads its own floor from it. The pack is built only after every contributing
plan has its arms recorded. Until the user rates it, each of those floors reads **recorded, not rated**, never green.

## Sessions (Claude's, recorded for the user's review)

Claude plays after all development is done (plan 15 Part B). Each session hands back the session journal
(`so-journal.mts export`), flags filed in play (⚑), and a rubric scored with evidence for the user to check. The user's
own sessions of the same shape are optional, later.

| Session | Story | What it judges |
|---|---|---|
| HU-P1 Player | `adolion-adventurer`, a fresh chat, player mode | whether the story steers without narrating the player; whether memory holds; whether images/sprites/voices help or distract; whether the timeline (player level) is wanted |
| HU-P2 Player, long | the Saga across an act change | continuity across acts, cast changes, opening quality, pacing over a long run |
| HU-A1 Author | the wizard: create a small story, then edit one checkpoint in the Studio | the author loop, Repair, author-view panels, the timeline author level and its inspector click-through (A1, decided by W18) |
| HU-X Interaction | any story with everything on, deliberately swiping, editing and switching chats | whether features still agree after mutations; anything that "felt wrong" |

The rubric is one row per feature and one row per feature pair that the user noticed interacting. Each row takes a
score (works / annoying / broken / not noticed) and a note. Rows still unscored are listed with the
`--require-human-record` check. The old unscored rows J1.8, J1.9, J10.9, J10.10 and L7d (NVDA) are scored here too.

**Outputs.** Every "annoying" or "broken" row becomes a finding. A blocker or broken finding is fixed in its tier;
the rest are recorded for the joint review, which makes the fix-or-defer call. Rule-7 surface decisions (C5, C6, SP1
S4, D6/T22) are recorded for the user's review with the scores as evidence. Anything deferred goes to `v2.7-seeds.md`.

## Verdict

ACCEPTED needs all of the following:
- every critical row green ×2;
- every group-A decision answered;
- every plan 14 tier's exit criteria met, with Claude's four session shapes above scored with evidence; every item that
  needs a human or blind rating listed as recorded for the user's review in `14-review-pack.md`;
- every "broken" row fixed and its rows re-run;
- `test:release` green after the attestation.

Anything short of that is PARTIAL, with the reason.
