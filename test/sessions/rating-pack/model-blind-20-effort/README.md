# Blind model pack: 20 turns x 4 replies

Built for the plan 14 review (item 10 of `docs/plans/v2.6/14-review-pack.md`: how much the model should think; experiment record in `docs/plans/v2.6/15-model-config.md`, section Reasoning effort A/B). Each of the 20 turns is a real moment from the T0/T1 Adolion sessions; each was answered by 4 different server/model setups from the 2026-10-02 reasoning-effort A/B (production pod, RTX PRO 4500; two setups reuse earlier runs). The replies are labelled A–D in a random order that is drawn **independently for every turn**, so "A" is not the same setup from one turn to the next.

## How to rate

1. Read `pack.md` turn by turn: the situation lines, the recent chat, then replies A–D.
2. Fill in `rating-sheet.csv` (one row per turn and reply). Score each reply 1 (bad) to 5 (excellent) on:
   - `coherence_1to5` — coherence / no loops: the reply makes sense and does not repeat lines or sentences
   - `prose_1to5` — prose quality: no dropped, doubled or glued words; reads as finished English
   - `scene_1to5` — follows the scene and the addressee: answers what the player just did or asked, in the right voice, consistent with the context
   - `agency_1to5` — agency respected: does not narrate, speak for or decide for the player
   - `overall_1to5` — overall: which reply would you rather have in the game
   - `rank_1to4` — your order for the turn, 1 = best (no ties).
   - `note` — optional.
3. Partial sheets are fine; skip a column you do not want to judge. Ranking alone is enough if time is short.

A reply marked *(cut off at the length limit)* ran to the 600-token cap; judge what is there.

Some setups think before they answer. Their reasoning is shown folded under the reply (*Reasoning written before this reply*). Rate the reply only; the reasoning is there for context and the player never sees it. Other setups answer without reasoning, so a folded block also tells you which replies came from a thinking setup, and its length hints at how much thinking the setup allowed. Rate the reply on its own merits.

## The key stays sealed until you have rated

`key.sealed.json` maps each turn's letters to the setups and records the shuffle seed. Do not open it before your sheet is done. Its sha256 (LF line endings) is:

```
3f74df80371149d4672ec2746106f0bae1ff8219b2526fd668f5bffe305af259
```

Check it has not been touched: `node scripts/debug/so-model-blind.mts verify-key`.

A judge model scored the same pack blind first. Its output lives in `judge-first-pass/`, and its per-setup result in `judge-first-pass/unsealed-summary.md` is unsealed — read it only after rating, or it will steer you.
