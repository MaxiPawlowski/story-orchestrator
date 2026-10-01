# Plan 03 — SP7 restated (seeded chance gates and the RNG seam)

**Step 0, committed before any run.** Bars are v2.5's (`v2.5/09-research-spikes.md` §SP7), copied verbatim. Nothing
here may change after a run.

## Conditions and bars (unchanged from v2.5)

| # | Condition | Pass (verbatim) | Tier |
|---|---|---|---|
| D1 | Replay | jest: same chat/story/boundary → same draw; rollback + replay → same draws, 4 seeds × 200 cuts | toy jest, keeps running |
| D2 | Distribution | 10 000 seeds: observed rate within ± 1.5 pp of `target/sides` | toy jest + lab offline (70 Adolion rows) |
| D3 | Engine purity | `architecture.test.ts` green; the seed is a clock-like seam, no host import | toy jest |
| D4 | NPC reply roll on the seam | a rolled-back and re-entered checkpoint draws the same outcome, ×2 live | **live, Adolion** |
| D4b | Talk weighted pick on the seam | a rolled-back and re-entered boundary picks the same speaker, via `options.random` seeded from `hash(chatId, storyId, boundary, 'talk')`, ×2 live; if not built, recorded as a known non-replayable choice | **live, Adolion** |
| D5 | Authored use | ≥ 1 shipped example story uses a chance gate **and the user accepts it** | read on all 7 Adolion rolls; acceptance is the user's |

D4/D4b compare the exact unit draw (`draw.unit`), the draw boundary, fire/skip and the committed roll quality across
the two passes of one run; the run is ×2 consecutive on one lane (`st-lanes batch --repeat 2 --strict`).

## What changed since v2.5 (restated conditions, not bars)

- **Data.** v2.5 used a 4-checkpoint toy (`live-v25-09-sp7*.json`). v2.6 uses the campaign lab at the pin
  (`scripts/debug/adolion-fresh.pin.json`: `adolion-campaign@e1c91fb`): `lab/chance/live-adolion-sp7-d4.json`
  (Act IV `adolion-deep`, `deep-the-tunnels`: afterSpeak Narrator reply p 0.3 maxTriggers 2, `deep_swarm` d6≤2
  drawn at entry) and `lab/chance/live-adolion-sp7-d4b.json` (Act V `adolion-east`, `east-the-rounds`: the saga's one
  director-off talk table, 6 speakers, lead + `no_repeat`). Stories: `build/story/adolion-deep.story.json`,
  `adolion-east.story.json` at the same commit. Fixture sha256 prefixes: d4 `4a4ac4c4f33030f8`,
  d4b `1b0e47977635cf3e`, deep `3f23e3090c8a8203`, east `ec2dbc6cc683dfa5`.
- **Fixture defects recorded in v2.5 are designed out by the lab** (its README §D4 and D4b): the checkpoint-entering
  `/cp set` follows a posted player line (so deleting the line rolls the entry back), the draw ring is cleared and read
  per chat and per pass, and D4b picks right after a boundary that fired. A step that throws `NOT MEASURED` (lead
  short-circuit, mention pick, judge took the pick) is reported as not measured, never as PASS or FAIL.
- **Procedure (stated):** lane 2, adolion-fresh at the pin, dev build `6f56533e8608` (commit `747561fd`) as staged.
  RP replies on `Artemis RunPod RP`; extraction is pinned to `SCENE_NONE` by the fixtures, so no orchestrator pass
  depends on a model (no pass role recorded, rule 5). The judge defaults ON since v2.6 rule 5, and D4b's first step
  refuses a judge use (the pick must be the rules pick), so **`judge.enabled` is switched off on lane 2's copy for
  both legs and restored after**. `spikes.sp7Chance` is switched on/off by the fixtures. Run header captured and
  diffed around each batch. Group ids are the lane's (`Adolion - Crimsonwing & Ebonwing`,
  `Adolion - The Eastern Road`).
- **D5 read.** The lab's `inventory.json` verdicts (7 rolls, all "good" after the campaign rebuild) are re-read against
  the built saga at the pin: roll present, `source: code`, branch reachable only via the roll, a player-driven
  co-condition, non-dead fallback, no re-entry. The read is recorded; D5's bar needs the user's acceptance, so the
  verdict is `pending: user` unless they have accepted.

## Arms and controls

- Arm: `sp7Chance` on (both passes of each run). The control inside each run is pass 1 vs pass 2 after a rollback.
- Negative control (toy, jest): an unseeded draw fails the D1 replay comparison (`sp7Chance.test.ts`); keeps running.

## Records

`test/measurements/v2.6-03/sp7/` (summaries, run headers, scenario logs). Bulky raw captures stay local (gitignored).
