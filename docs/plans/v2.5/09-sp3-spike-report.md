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
