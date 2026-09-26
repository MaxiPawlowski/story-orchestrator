# v2.5 plan 09 — SP3 roster aliases spike report

**Verdict: pending.** Phase A runs first on archived records (no product code). Phase B is built only if A1 or A2 passes on a sample A3 accepts.

The conditions are plan 09's predeclared table (`09-research-spikes.md` §SP3, committed in `9eaee9e4` before any measurement) and are
**never retuned** (rule 1). The measurement is `scripts/spike/sp3/phaseA.mjs` (tests: `node --test scripts/spike/sp3/phaseA.test.mjs`).

## Conditions

| # | Condition | Pass (build only if either holds) | Measured | Result |
|---|---|---|---|---|
| A1 | Split keys: epistemic subjects, ledger entities and memory `entity=` tokens that name a roster member by a non-canonical form | ≥ 5 % of cast-referencing rows | pending | pending |
| A2 | Director misses: `SPEAKER:` answers that resolve to no roster id although a member was meant | ≥ 1 per 50 decisions | pending | pending |
| A3 | Sample | ≥ 300 cast-referencing rows and ≥ 100 decisions; below it, one more J7 + J11 run each (procedure change stated in the report, rule 1). Still below it: A3 fails, A1/A2 are reported with their n but not decided, and SP3 is recorded not built (FAIL leaves exact matching). Never decide A1/A2 on an undersized sample | pending | pending |

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

## Measurements

pending

## Live legs

pending
