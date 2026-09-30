# Plan 02 — Data gaps: where Adolion falls short, and what to build

**Status: DRAFT 2026-09-30, awaiting user approval.** This plan builds nothing until its audit (step 1) is committed.

The user's request (2026-09-30): where the campaign does not cover a measurement, create more data. The lab already
covers SP1–SP9 and four judge uses. Each lab README ends with "What it cannot measure", and those sections are this
plan's starting list.

## Step 0: `adolion-fresh` (overview rule 14)

- Script it: seed a lane fresh, run the campaign installer at the pinned commit, take a `so-assets` baseline, and select
  the Adolion lorebooks the stories require.
- Then run an inventory check against the campaign manifest: counts of stories, cards, books and groups, and
  `requirements.ready` on every story.
- Output: `scripts/debug/adolion-fresh.mts seed <lane>` plus its node:test.
- Gate: two consecutive seeds produce identical inventories, and a planted missing book fails the check.

## Step 1: audit (before any data is built)

The audit is written to `v2.6/02-audit.md` as one table. Each row is one measurement from v2.6 plans 01, 03, 04, 06, 07 and 10, with these columns:
- the data it needs;
- whether Adolion covers it: yes, partial or no, citing the lab or campaign path;
- the toy fallback, if any;
- the gap;
- the smallest artifact that closes the gap.

A row is closed only by a citation, never by a claim.

## Known gaps (from the lab READMEs and the v2.5 gate records; the audit confirms or removes each)

| # | Gap | Who needs it | Candidate artifact |
|---|---|---|---|
| D1 | **No real Adolion play corpus.** Every lab row is authored or seeded, and no archived lane run of the real stories exists. | SP3 A1 (natural alias rate), J6a intent mining, SP1 swipe rate, J2 (≥ 100 warden calls), v2.5 plan 04 K0 cosine column, soak, 07 Q-M runs, 06 intent-lapse K | **A machine playthrough corpus.** Drive `adolion-adventurer`, `adolion-academy` and the Saga on lanes with a scripted player that runs a per-act turn list the campaign already has (`tests/routes-*.json`, `make_saga_routes.py`). Judge uses stay on. Archive the chat, journal, audits and payload captures under `test/corpora/adolion/<story>/<run>/`, outside `public/` once A2 lands. Target ≥ 300 player turns per story. |
| D2 | **Needles on the real story.** SP4's fixture imports one open checkpoint, so nothing transitions and no lore loads. | SP4 T3, v2.5 plan 05 memory rows | Needles planted in a D1 route of `adolion-academy`, with `needed_by` read by a live step at the checkpoint that uses the fact |
| D3 | **Tool-call turns.** Nothing exists for SP10. | SP10 Q1–Q3 | 20 turns with ST function-calling on a CC profile, recorded both folded and unfolded. Built: W3 re-evaluates all ten spikes. |
| D4 | **Spanish slices** are missing for SP8 W3 and SP9. The judge rule wants ≥ 1 Spanish slice, and decision C1 is still open. | SP8, SP9, v2.5 plan 05 F3 | 8 Spanish W3 lines on the Chronicle; a Spanish variant of the Nightriver witness transcript |
| D5 | **Memory contradictions on Adolion.** v2.5 plan 04's N1/J1 ran on toy seeds, and J1 Phase A met no floor. | v2.5 plan 04 N1, K0, J1 | ≥ 40 contradiction pairs drawn from the Chronicle and card facts (polarity, negation, low-overlap), 8 in Spanish, each labelled |
| D6 | **Ledger tier.** The F2 ledger scored 0.5 against a 0.8 floor on toy fixtures, and 14 fixtures' facts checks are vacuous (C2). | v2.5 plan 05 F2 | Extractor fixtures built from D1 transcripts where Adolion's ledger qualities change (debts, wounds, pacts), with real phrases in `mustContain` |
| D7 | **Lore contradictions.** Nothing exists for v2.5 plan 08 L7. | L7 (v2.6 04) | Chronicle rows vs player-stated contradictions, drawn from D1 |
| D8 | **Warden volume.** J2 needs ≥ 100 warden calls. | v2.5 plan 06 J2 | Counted from D1 once the warden is on (a judge default under overview rule 5) |
| D9 | **Features added after `544975fb`.** The image director cue, sprites, openings, the commit guard, chained voices and the GPU broker have no measured cadence (plans 15–19 name these "unmeasured"). | v2.6 01 rows for 14–19, v2.6 09 | D1 runs carry the image/sprite/voice switches on, with the cadence and cue landing read from the journal |
| D10 | **Lore select at scale.** A 263-entry book costs 5 judge requests per turn (C11), and there is no live token measurement. | C11 (v2.6 04) | the token column from D1 payload captures |
| D11 | **Structural limits** that are design questions, not data: C12 (onEnter replies bury the gating reply), C13 (guidance secrets reach every drafted member), and the swipe rate under real play. | SP1, SP2, SP9 | none; these go to v2.6 04 as design calls |

## Rules

- **Data lives in the campaign when it is story content**, and here when it is a plugin fixture. The formats are the
  plugin's own (the lab's convention). Every set has a `check.py` or jest case that fails on drift from `build/`.
- **Generated data is labelled as generated.** A model-written player line is marked, and a measurement that needs
  human judgement keeps the lab's "one labeller" note.
- **D1 is the expensive item.** Size it once the audit has run, not before. A lane at the current backend speed does
  roughly 100 turns an hour, so D1 at its target size is about 9–10 lane-hours.

## Gate

The audit is committed. Each confirmed gap either has an artifact, with its check green in both `check_all.sh` and the
plugin's gates, or a signed "not built" line with the reason.

## Resolved 2026-09-30 (review)

| Question | Answer | Why |
|---|---|---|
| Who plays D1: scripted routes or an LLM player? | **Both, kept as separate sets.** The scored corpus is the route lists (`tests/routes-*.json`, `make_saga_routes.py`). One LLM-player run per story is a labelled extra set, never pooled with the routes. | The routes are reproducible, which a ×2 needs. The LLM player finds paths nobody scripted, which plan 09 and SP1's swipe rate want. Pooling them would hide which kind of play a number came from. |
| Where does corpus text live? | **In the campaign repo** (`adolion-campaign/corpora/<story>/<run>/`), with a hash manifest. The plugin repo holds only fixtures derived from it. | It is chat text, and v2.5 plan 12 P3 keeps chat text out of anything ST serves. The campaign repo is outside `public/`, and the corpus is story content (rule 2 of this plan). |

## Unresolved questions

None. The D1 size gets fixed after the audit, and the user is not asked for it.
