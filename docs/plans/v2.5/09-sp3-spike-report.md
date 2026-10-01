# v2.5 plan 09 — SP3 roster aliases spike report

**Verdict: pending on A3's live procedure** (2026-09-26). Phase A on the archived records: A1 0.29 % (n = 343), A2 0 misses in
54 decisions, A3 **undersized on decisions** (54 < 100; rows 343 ≥ 300). A1/A2 are therefore reported, not decided. A3's own procedure
(one more J7 + J11 run each, ×2 per rule 1 / review #73) is the pending live leg. No Phase B code exists; none is built unless A1 or A2
passes on a sample A3 accepts.

The conditions are plan 09's predeclared table (`09-research-spikes.md` §SP3, committed in `9eaee9e4` before any measurement) and are
**never retuned** (rule 1). The measurement is `scripts/spike/sp3/phaseA.mjs` (tests: `node --test scripts/spike/sp3/phaseA.test.mjs`).

## Conditions

| # | Condition | Pass (build only if either holds) | Measured | Result |
|---|---|---|---|---|
| A1 | Split keys: epistemic subjects, ledger entities and memory `entity=` tokens that name a roster member by a non-canonical form | ≥ 5 % of cast-referencing rows | **1 / 343 = 0.29 %** (`Guild Master` for Ponticius, one `entity=` token, J3 run3). Sensitivity `--group-cast`: 2 / 456 = 0.44 % (+ `Luke,Arin,Ponticius` as one J8 epistemic subject) | not decided (A3) |
| A2 | Director misses: `SPEAKER:` answers that resolve to no roster id although a member was meant | ≥ 1 per 50 decisions | **0 / 54** (0.0 per 50; sources judge 44, rules 4, mention 4, director 2, fallback 0) | not decided (A3) |
| A3 | Sample | ≥ 300 cast-referencing rows and ≥ 100 decisions; below it, one more J7 + J11 run each (procedure change stated in the report, rule 1). Still below it: A3 fails, A1/A2 are reported with their n but not decided, and SP3 is recorded not built (FAIL leaves exact matching). Never decide A1/A2 on an undersized sample | rows 343 (ok), decisions **54 (< 100)** | pending: procedure step (live) |

## Procedure (stated before measuring)

- Sources: `test/journeys/records/v2.4-acceptance/{J3,J5,J7,J8,J11}/**/journal-follow.jsonl`. The J7 run directories hold no
  journal tail; the only J7 tail in that tree is `cost/J7-judge-on/journal-follow.jsonl`, so it stands for J7.
- A row is one key the model wrote in an audit's raw response: the subject of a `[knows|unaware|suspects|believes|hiding]` line,
  the entity of a `[state:<entity>:<type>]` line, or one comma-separated token of a `MEMORY … entity=` field. The line shapes are the
  product parser's (`memory/parse.ts:9,85-102,113-134`). Audits repeated in a tail are counted once (summary + window + raw response).
- A row is cast-referencing when it names a member of the roster of the story the chat was playing at that audit (the latest
  `session` event's `storyId`). Canonical = the roster name, case-insensitive (what `runtime/roster.ts` matches today). Non-canonical =
  a title/role/id (`guild master`, `little brother`), one word of a multi-word name (`Narrator`), the name with extra words, or a
  key holding several members (`Luke,Arin,Ponticius`). Every distinct key and its verdict is printed by `--distinct`, so the
  classification is auditable row by row.
- A decision is one `talk` event. A director miss is a decision whose source is `fallback`: `talkControl.ts` falls back when the
  director's answer parses to no candidate (`talk/parse.ts:18-36` returns null). It also falls back when the breaker is open and
  when the director times out or errors (`talkControl.ts:210-213,275-278`), so this count is an upper bound on misses.
- The player persona (Max) is not a roster member and never counts.
- The J8 stories declare an empty roster, so under the condition's wording ("a roster member") none of their rows is
  cast-referencing. A sensitivity arm (`--group-cast`) counts the group's members (the run header's `group.members`) for a story
  with no roster. It is reported beside the decided number and never replaces it.

## Measurements (2026-09-26, `node scripts/spike/sp3/phaseA.mjs [--group-cast] [--all] [--distinct]`)

| Arm | Tails | Cast rows (epistemic / ledger / memory) | Non-canonical | A1 | Decisions | Misses |
|---|---|---|---|---|---|---|
| **decided** (plan sources, story roster) | 14 | 343 (74 / 52 / 217) | 1 | 0.29 % | 54 | 0 |
| sensitivity `--group-cast` | 14 | 456 (88 / 86 / 282) | 2 | 0.44 % | 54 | 0 |
| info only: all of `v2.4-acceptance` | 40 | 506 (86 / 72 / 348) | 20 | 3.95 % | 78 | 0 |
| info only: all, `--group-cast` | 40 | 629 (100 / 108 / 421) | 21 | 3.34 % | 78 | 0 |

- The "all" arms add the other journeys. Their split keys: `Dalan Evergreen` for roster `Dalan` 11 times (J12 Adolion; memory 9,
  ledger 2) and `Guild Master` for Ponticius 9 times (sun-ruins runs; memory 8, ledger 1). They are outside the plan's source list and
  decide nothing; they are the largest split seen.
- Per tail (decided arm): J11 ×4 carry 283 of the 343 rows and 52 of the 54 decisions (13 per run); J5 ×2 carry 2 decisions; J3,
  J8 and the J7 judge-on tail carry none. J8's 0 cast rows is the empty-roster rule above.
- Every director miss the journal can show is a `fallback` decision: none in any arm, so A2's measured rate is 0 whatever the sample.
  Only 2 decided-arm decisions (19 in "all") came from the LLM director at all; the rest are judge, mention and rules picks,
  which cannot miss by construction.

## Live legs (pending; nothing live was run for this report)

A3's procedure is one more J7 and J11 run each. Rule 1 (review #73) runs a live leg ×2 consecutive, so each journey runs twice,
back to back on one lane, on the DEV build (`npm run build:dev && npm run serve:dev`, then `node scripts/debug/st-lanes.mts run <n> --
scripts/debug/st-session.mts reload`). Each run captures a run header, tails the journal, runs `--strict`, and diffs the header
(`scripts/spike/sp3/live-a3.sh`; records `test/journeys/records/v2.5-plan09/sp3/live-<bundle12>/`):

```bash
bash scripts/spike/sp3/live-a3.sh 1 J7 run1 && bash scripts/spike/sp3/live-a3.sh 1 J7 run2
bash scripts/spike/sp3/live-a3.sh 1 J11 run1 && bash scripts/spike/sp3/live-a3.sh 1 J11 run2
node scripts/spike/sp3/phaseA.mjs --add=test/journeys/records/v2.5-plan09/sp3
```

The last line re-measures A1–A3 over the archived tails plus the new ones. Route (rule 5): the rows come from the `read` pass role
and the decisions from `director`; the new runs record both routes in their run headers. Projection, not a decision: the archive's
J11 tails give 13 decisions a run and its only J7 tail gives 0, so four runs add about 26 and A3 would stay below 100. Then A3 fails,
A1/A2 stay undecided, and SP3 is recorded not built (exact matching stays). No spike code needs removing: Phase A added none to `src/`.

## v2.6 Adolion re-run (plan 03, 2026-10-01)

Restated conditions: `docs/plans/v2.6/03-sp3-restated.md` (committed before any run; bars unchanged). **Procedure change
(stated there):** A3 counts the lab's calibration-lane director decisions, `adolion-campaign@e1c91fb`
`lab/aliases/director.json`, **174 rows** (plan 03 said 199; W25 removed the Spanish rows), run ×2 through the real
director prompt and parser on `deepseek 4.1 flash` (pass role `director`). A2 counts a decision as a miss when it resolves to
no candidate **or** to a member outside `acceptable`; the null-only count is reported beside it. Records:
`test/measurements/v2.6-03/sp3/` (`summary.json`, `a2-live.json`, `phaseA-adolion-real.json`, `score-authored.txt`).

| # | Measured | Result |
|---|---|---|
| A1 | Real Adolion audits: v2.4 J12 tails + this plan's SP2 reads (3 act stories, DeepSeek): **13 of 1672 cast rows = 0.78 %**, all `Dalan Evergreen` for `Dalan` from J12; 0 in the 1619 SP2 rows. Authored lab rows (information only): 47.6 % labelled, 31.3 % found by today's classifier | **FAIL** (< 5 %) |
| A2 | Run 1: 23 wrong / 0 null of 174 = **6.61 per 50**; run 2: 20 / 0 = **5.75 per 50** (alias rows 7.10 / 6.17; canonical controls 12/12 both runs). 20 wrong picks repeat across runs; 13 and 12 of them are the lead (Adolion Narrator) chosen over a member addressed by full name, surname, kinship or nickname. Null-only: 0 per 50 | **PASS** on the declared count |
| A3 | rows 1672 ≥ 300; decisions 174 × 2 ≥ 100 (procedure change) | accepted |

## Worth review (v2.6)

| | |
|---|---|
| Value | Harm measured: about 1 in 8 alias-addressed director decisions drafts the wrong member (mostly the lead), stable across two runs; canonical names are 12/12. Memory, epistemic and ledger keys do not split in real reads (A1 0.78 %), so the value is director-only. The gain of aliases is not measured yet; Phase B's own condition measures it. |
| Cost | Phase B scoped to the director: `roster[].aliases` (schema + validator, the lab's 312 `ship[]` aliases), aliases shown beside each candidate in the director prompt (~+10 prompt tokens per candidate, ~+60 per call on a 6-candidate window), one resolver for `SPEAKER:` answers in `talk/parse.ts`; est. < 1 kB min, ~60 lines, 0 coordinator lines. Latency unchanged (DeepSeek median 755–764 ms per decision). |
| Surface | Author: an aliases field per roster member (Studio roster editor); player: none. |
| Risk | Ambiguous aliases (lab: 44 shared, 18 unresolvable by scope) must never resolve by guess; `rollback ≡ replay` untouched (director only). |
| Call | **include → `SP3.b`** (Phase B, director scope only), gated by v2.5's Phase B condition: the A2 rate re-measured on two fresh runs of the same 174 windows, each ≤ half its Phase A rate (≤ 3.30 and ≤ 2.87 per 50). If it misses, drop and keep exact matching. Memory/epistemic/ledger aliasing: **drop** (A1 FAIL on real audits). |

### SP3.b Phase B re-measure (v2.6, 2026-10-01 21:33Z) — **PASS**, SP3.b kept

Restated `docs/plans/v2.6/03-sp3-restated.md` §SP3.b (+ addendum 1). Lane 2 (adolion-fresh at `884380b`, overlay
`4af4006b7801`), served bundle `8319f7535e1e` (master `948e0d13`, SP3.b built), the same 174 director windows (pin
`59e8821` rows, JSON-identical to Phase A) with the lab's 312 `ship[]` aliases attached by `phaseB-rows.mjs`, real
director prompt and parser on `deepseek 4.1 flash`, ×2 back to back. An earlier attempt (19:52Z) hit DeepSeek's
outage (every call timed out) and was stopped unscored. Record `test/measurements/v2.6-03/sp3b/a2-live.json`.

| Run | Wrong | Null | Per 50 | Bar (½ Phase A) | Result |
|---|---|---|---|---|---|
| 1 | 7 | 0 | **2.01** | ≤ 3.30 (≤ 11.5 of 174) | PASS |
| 2 | 10 | 0 | **2.87** | ≤ 2.87 (≤ 10 of 174: half of Phase A's 20) | PASS (at the bar) |

Canonical controls 12/12 both runs. Lead-over-member misses fell from 13/12 (Phase A) to 3/5; the residue repeats across
runs (AD038 Shiya↔Eriana, AD062/AD063 Lirael↔Celedir, AD096 Yuna, AD102 Rikako, AD132 Gabriel, AD142 the Lady of the
Forest). Run 2 sits exactly on its bar (10 of 174 = 2.874 per 50 = half of 5.747); compared in counts, 10 ≤ 10.
**SP3.b stays** (director scope only). Remaining owed: the campaign build carries `roster[].aliases` before a session
relies on it (04 §SP3.b).
