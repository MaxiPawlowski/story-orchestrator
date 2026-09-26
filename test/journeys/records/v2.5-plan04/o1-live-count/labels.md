# O1 live count (v2.5 plan 04), 2026-09-26

Source: the latest J3/J7 ×2 records, `v2.4-postfreeze/ca25e4a632ed/{J3,J7}/run{1,2}` (bundle `ca25e4a632ed`) and
`v2.4-postfreeze/e080b9749436/J7/run{1,2}`. Read offline, nothing run live.
`python extract.py <root> <run>...` pulls every non-template `MEMORY … text=` line from each run's extraction audits
(raw responses), deduped per run: `rows.txt`, in this order: ca25 J3/run1 (15), J3/run2 (9), J7/run1 (50), J7/run2 (69),
then e080 J7/run1 (51), J7/run2 (55). 249 rows.

The records carry no memory store (journal kinds: audit, boundary, delta, extraction, payload, reconciliation, session,
status, story, transition), so how many `contradicted` soft marks landed **cannot be read from them**; `contradictedMarks=0`
in `rows.txt` counts the string in the record files and is not evidence of absence.

Hand-labelled same-subject pairs whose claims disagree (every other same-subject pair is a paraphrase, a refinement or a
distinct detail):

| Run | Rows | Label | Why |
|---|---|---|---|
| e080 J7/run1 | 14 "decided to leave Luke behind" vs 18/20/21 "agreed to let Luke join" | update | an in-story reversal of the same decision, a later turn |
| ca25 J7/run2 | 45 "helping Max find his brother Garret" vs 48 "finding Luke's brother" | contradicts | whose brother; row 45 is an extraction error |

Result: 1 ordinary contradicting pair (2 counting the reversal), below the build condition of ≥ 3 missed by consolidation
whatever the unrecorded marks were. O1: **not observed**; the v2.4 decision (union bands for established rows only, mutant
B4) stands.
