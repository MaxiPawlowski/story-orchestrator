# Plan 09 — Acceptance

**Status: DRAFT 2026-09-23. Not run. Depends on plans 01–08.** Kind: gate. No product code except
fixes the acceptance run finds. A fix bigger than trivial either gets a mini gate record here or goes
to v2.5. Shape: v2.3 `11-acceptance.md`, with v2.3 process corrections 11–17 applied
(`../v2.3/00-overview.md` §Replan) and v2.4 rules 1–8 (`00-overview.md`).

## Goal

Accept v2.4 on one frozen candidate:
- every journey J0–J12 green under `--strict`, twice in a row, with **every run of the series reported**;
- the interop shapes from plans 01/02 proven live on a real install (Stepped Thinking present);
- each plan's live gate re-run on the final tree;
- the new judge uses from plan 07 measured on and off;
- extraction measured at plan 04's floors, and the judge's cost measured from T24's ring;
- the clean host qualified on three ST revisions;
- the player and author sessions scored.

The outcome is an attestation that cites only archived records. If anything is not green, the
attestation is written PARTIAL and names it. It is never withheld and never rounded up.

## Entry criteria

1. **Plans 01–08:** each has a `## Gate record` that is green (machine and live), or each open item
   is a deferral the user signed off (v2.3 rule 14). A deferred item appears in the matrix as `not
   run (deferred, <date>)`. It is never silently absent.
2. **v2.3 baseline:** v2.4's entry condition holds. v2.3 is frozen and **P0′ (L1) is recorded**,
   because it is the run §Matrix row R1 replays against. Any v2.3 live row (L2–L8) the user routed
   into v2.4 joins the matrix as a `C*` row with its original recipe.
3. **Machine gates green on the candidate:**
   - `npm run typecheck && npm run typecheck:test && npm run lint && npm test && npm run test:debug && npm run test:plugin && npm run debug:typecheck && npm run build && npm run test:release && npm run test-storybook:ci`
   - census files hold 0 `todo` rows: `test/findings/ownership-sites.json`, `test/findings/faultMatrix.json`.
4. **Freeze:**
   - The candidate is a commit if the user has approved committing (rule 16). Otherwise it is
     fingerprinted the way v2.3 plan 11 §Freeze did it, and the Gate record says the build is
     **not reproducible from git**.
   - `dist/manifest.json` names the candidate, and every run header's `bundle.served` equals it.
   - The ST host is frozen too: no `git pull` in `C:\dev\SillyTavern-MainBranch` during the
     matrix. Today it is on `staging` at `7c3994196` (`1.19.0-2`).
5. **Harness owed by earlier plans has landed** (`00-overview.md` §Reconciliation), with node:test coverage:
   - **01 (X10):** the setting flip/restore verb for another extension (Stepped Thinking
     `is_enabled`), run-header capture of third-party extension state, the test-only foreign-emitter
     fixture, the replay-equality check, and the P0′ transcript → scenario converter;
   - **02 (X11):** `expect.rollbackOutcome`, the next-read-window assertion, the branch-adopt UI verb
     with cleanup that owns branch chats, and the generalised `attestation.test.mjs`;
   - **07 (X12, X23):** the judge-on journey mode (`setup.judge` / `--judge-uses`; today
     `so-journey.mts:303-308` forces every use off), the cost aggregation verb over the
     rollback-exempt meter, `so-judge calls --use/--chat`, the T22/T23 fixtures, and
     `so-lore-probe diff`.
   Without them the matching rows are `not-runnable`, and that is not green.
6. **Install at REF-2.4:** v2.3 REF plus the following, checked by `so-run-header capture --label v24-acc-start`:
   - cadence **3**, because J12.1 refuses any other value and this install read 1 on 2026-09-22;
   - `stagecraft.acceptMode` `review` (found `auto` on 2026-09-22);
   - judge off;
   - Stepped Thinking `is_enabled` recorded (it reads `false` here).
7. **Backend up** (§Clean host and release → Backend bring-up), confirmed by a real `PONG`, not by `onlineStatus`.

## Matrix

Every run follows the same protocol:
- Headed, real model, no `debugResponse`.
- Wrapped in `so-run-header capture` before and `diff` after. Each **batch** gets its own
  header pair too, because leaks show up across a corpus rather than within one run.
- Archived when the run ends, not later.

Records live in `test/journeys/records/v2.4-acceptance/<row>/`. `.debug` is never cited.

"×2" means two consecutive runs on an unchanged build and fixture. If a run fails, the series
continues and reports its pass rate (for example `J3 3/4`), and a fix restarts the series. The Gate
record lists every run.

| Row | What | Runs | Records path (`…/v2.4-acceptance/`) | Owner plan |
|---|---|---|---|---|
| **J0** | Runner self-test, graded against expected outcomes: J0.3 `blocked`, J0.5 `fail`, J0.4 human placeholder | ×2 `--strict` | `J0/` | harness (v2.3 01) |
| **J1–J6, J8–J10** | `node scripts/debug/so-journey.mts run <id> --strict --group <id> --require-human-record test/journeys/records/v2.4-acceptance/human/scores.json`. J8 and J9 must end with `cleanup.removeCreatedAssets` clean and `so-assets.mts assert-clean`. J5 and J6 carry the plan 01/02 fixture changes | ×2 each | `J<n>/` (matrix, run JSON, log, `so-journal export`, header pair) | 01–08 per touched path |
| **J7** | Long haul through the sun-ruins spine. v2.3 walked it 2 of 3 times and each failure was a model-dependent leg. Every run is reported | ×2 minimum, each run listed | `J7/` | — |
| **J11** | Judgment backend. Needs `enableServerPlugins` and the plugin `configured`. J11 toggles the judge inside its checks, so the judge configuration is recorded **per check**, not per run | ×2 | `J11/` | 07 |
| **J12** | Unaided schedule on the adventurer story at cadence 3: no `runExtractionNow`, no `/cp` | ×2 | `J12/` | 04 (window changes), 02 |
| **I1** middle delete | Delete a consumed message from the middle of the chat (`st-actions delete <mid>`). The result must equal a clean replay (plan 01's replay-equality check, X10): T1's identity-snapshot diff, with an ambiguous diff journaled rather than guessed | ×2 | `interop/middle-delete/` | 01 |
| **I2** Stepped Thinking | Thinking switched on: flip `st-stepped-thinking.is_enabled` with plan 01's flip/restore verb, restore it, and prove the restore with the third-party run-header diff (X10). The private block reaches the drafted member's captured request (`expect.payloadContains` scoped to `story_orchestrator_epistemic`), and the warden note is carried once across the nested quiet generation (T6) | ×2 | `interop/stepped-thinking/` | 01 |
| **I3** foreign emitter | A `{source}`-shaped STARTED/ENDED and an unpaired STARTED do not clear the private, nudge or note blocks (T6, D9). The source is our **test-only fixture** that mimics Guided Generations' `{source}` shape (X10, X26); GG is not installed and is not installed for this | ×2 | `interop/foreign-emitter/` | 01 |
| **I4** no-op edit | Save an edit with the same `mes`. Nothing rewinds (`expect.rollbackOutcome`, X11): the boundary count and blackboard are unchanged (T3) | ×2 | `interop/noop-edit/` | 02 |
| **I5** `/hide` | Hide a consumed message (`MSYS_NO_PATHCONV=1 st-actions slash "/hide <n>"`). No rollback (`expect.rollbackOutcome`), the message is absent from the next read window (the read-window assertion, X11), and its facts stay live (D5) | ×2 | `interop/hide/` | 02 |
| **I6** branch mid-story | `/branch-create` (`bookmarks.js:495`) at a mid-story message. The branch shows the non-blocking **Continue from here** notice, with no popup and no auto-adopt. Adopting it through the branch-adopt verb (X11) rolls back to the branch tail, and the parent's mirror is unbound until adoption (T2, D3). Cleanup owns and removes the branch chat | ×2 | `interop/branch/` | 02 |
| **I7** same-chat reload | Reload the same chat (`reload` verb) after a silent `mes` rewrite and after a plain reload. Reconcile runs at hydrate (`expect.rollbackOutcome`), and a legacy boundary is `unknown`, not a mismatch (T3) | ×2 | `interop/reload/` | 02 |
| **P01–P08** | Each plan's own live gate recipe, re-run on the final tree, as named in its Gate record. Examples: 01 T10 group `/comment` probe and guidance in a captured request (authored and generated checkpoints); 03 pause and resume without `extraction.enabled` being written, and abort on rollback mid-read; 05 T12 forced-vs-landed evidence and the T13 verdict; 06 over-steer probe on the objective line; 08 next-turn cost/fate and `/chat-jump` | ×2 each | `P0<n>/` | 01–08 |
| **JM** judge-on matrix | Scope (X26): every `judge.uses.*` that plan 07 **built** (T22 agency, T23 house rules, `sceneOoc`/`memoryRerank` if wired, `backgrounds` if re-calibrated), **plus the existing warden as the over-steer baseline**. Driven by plan 07's judge-on journey mode (X12). Each runs as two columns: **judge-on** and a **judge-off control** on the same story and transcript. Each also gets `so-judge calibrate --use <u> --model <pinned> --record` at its predeclared floor (no retune), the over-steer probe (rule 5), and a privacy-report row per host. A use below its floor is `not recommended` and is not a failure of this plan | ×2 per column | `judge/<use>/{on,off,calibration}/` | 07 |
| **LS** live suite | Run after T7 cleaning: `so-live-suite.mts run --min <04> --min-tier <04 floors> --expect-count <n> --record`. Every tier is reported, and an `incomplete` fixture fails the run | ×2 | `live-suite/` | 04 |
| **CL** cost/latency | Totals read from T24's **rollback-exempt meter** (X23), never summed from the call ring: the ring rolls back, so a total read from it undercounts. The ring (`JudgeCallRecord.usage`, exported before cleanup) supplies only per-call latency and fallback detail. Sources: the JM, J11 and one judge-on J7 run, via plan 07's aggregation verb (X12). Reported per use: calls per boundary; p50/p90/max; tokens in/out; `$` per 1000 boundaries; fallback rate by reason; `director`/`lore` on-path latency against the 1500 ms budget; the model each use was measured on | once, over the runs above | `cost/` | 07 |
| **R1** P0′ matched replay | P0′'s player lines are re-sent turn by turn at REF-2.4. The record is the per-turn diff of qualities, transitions, rejections, boundaries and discarded results. It is recorded, not scored. Needs plan 01's transcript → scenario converter | ×1 (a log, not a gate) | `p0prime-replay/` | 01 (converter) |
| **CH** clean host | See the next section | ×2 per host | `clean-host/<host>/` | 02, 08 |
| **H** human | See §Human sessions | per session | `human/<session>/` | — |

Commands per journey run (the shape every row uses):

```bash
node scripts/debug/st-navigation.mts open-group <id>          # pin the group; an open-group timeout is a hard stop
node scripts/debug/so-run-header.mts capture --label v24-<row>-<n>-start --out test/journeys/records/v2.4-acceptance/<row>/header-<n>-start.json
node scripts/debug/so-journey.mts run <Jn> --strict --group <id> --require-human-record test/journeys/records/v2.4-acceptance/human/scores.json
node scripts/debug/so-run-header.mts diff test/journeys/records/v2.4-acceptance/<row>/header-<n>-start.json --allow <declared>
node scripts/debug/so-journal.mts export                      # then copy into the row dir
```

Rules on top of the table:
- A run whose header diff shows an undeclared difference is `fail`, not "environmental".
- `--only` runs are `partial` and never count toward ×2.
- `firstAttempt` is reported for every check.

## Clean host and release

**Hosts**, all using `scripts/release/clean-host.sh --ref <sha> --store test/journeys/records/v2.4-acceptance/clean-host/<host>`
(or `clean-host.ps1`). Each host runs the gates typecheck, lint, test, build, storybook and release.

| Host | Revision | Why |
|---|---|---|
| pinned | `06bde939fb1e9c4c8d8641d810f0a916b5bce127` (`release`, reports 1.19.0) | v2.3's pin (`README.md` Tested on); kept (X26) |
| **1.19.0** | tag `1.19.0` = `7e8663cd9c184a550b37238218bdd32c6efc68e9` | The working tree reads 1.19.0 (`C:\dev\SillyTavern-MainBranch\package.json`, verified 2026-09-23). The overview asks for a Tested-on row for it |
| older declared | `1.18.0` = `51ad27fb86d39a3daca3adaa970375c9670c12df` | Plan 02's `minimum_client_version: 1.18.0`, which `test:release` asserts |

- Each host runs ×2 consecutive on the frozen candidate, and each `*.host.json` records `status:
  green` plus the candidate's bundle and source sha.
- The clean-host runs qualify the **machine** gates only. Live play runs on the live host alone,
  and the attestation says which is which.

**Attestation.** The attestation is written to `docs/release/<package version>/attestation.json`.
It is checked by plan 02's generalisation of `scripts/release/attestation.test.mjs` (X11). Today that
test hardcodes `recordsDir = …/v2.3-plan05-live` and the id list J0–J11, and it demands
`firstAttemptRetried: 0` on every run. The generalised test must:
- read the records root from the attestation, which must equal `test/journeys/records/v2.4-acceptance/`;
- derive the journey set from `test/journeys/*.journey.json`, so J12 is included;
- require every cited path, whether journey, interop, `P0n`, JM, LS, CL, clean-host or human, to
  exist under that root, and refuse any path outside it;
- allow a failed run only in a PARTIAL attestation whose `notGreen` names it (rule 12: all runs are
  reported, so a failing run is listed, not hidden);
- check that the attested bundle equals the `bundle.served` in every cited run header;
- keep computing `current` at test time. It is never hand-kept (V21).

The green predicate is `scripts/release/attestationRules.mjs` (unit-tested with negative controls in
`attestationRules.test.mjs`, which never skips; mutations in `test/findings/mutations/v24-09-attestation-rules.txt`).
Each attestation run cites its record (`{record: "J<n>/run<k>/record.json", header?, fixture?}`, header
defaulting to the `header-start.json` beside it) rather than restating a tally, and the fixture identity
(sha256 of the journey file) is required for a pair to count, because the record does not carry one.

**`npm run test:release` is re-run AFTER the attestation is written.** Before it exists the
attestation's file-reading tests skip, so a run taken earlier checked none of its claims.

**Release docs, touched only after the matrix:**
- `README.md` Tested on: the 1.19.0 rows already exist (`README.md:64-66`), so plan 09 **re-verifies** them against the clean-host records and the live host rather than adding one (X26), and states the live host's local edits;
- `CHANGELOG.md`;
- the `.claude/CLAUDE.md` status pointer (rule 15);
- `docs/plans/v2.3/recommended-config.md` is superseded by `docs/plans/v2.4/recommended-config.md`,
  written from JM, CL and the human sessions.

**Backend bring-up** (before any live row; `../v2.3/live-gate-playbook.md` §0 as corrected by
`.claude/rules/gotchas.md` 2026-09-23):
1. **Start the pod.** Use RunPod `list-pods`, then `pod-action start <pod>`, stating the price first
   ($0.72/hr, RTX PRO 4500, EU-RO-1, volume `x9gi6f1rig`).
   - The session classifier may refuse the start. Then the user starts it, and until they do the
     live gate stays NOT green.
   - If the host has no free GPU, create an equivalent pod in the same DC.
2. **Tunnel to the pod.** `get-pod` gives `ssh.direct` (only while RUNNING). Then run
   `ssh -i ~/.ssh/id_ed25519_runpod -N -L 18080:127.0.0.1:8080 -p <port> root@<ip>` in the background.
   - Every profile already points at `http://127.0.0.1:18080`, so nothing install-wide changes.
   - **Do not use the HTTPS proxy.** It returns 502 when `llama-server` binds loopback. Playbook §0
     steps 4–6 are stale.
3. **Check the server.** `curl -s http://127.0.0.1:18080/v1/models` must return 200, followed by a
   real `PONG` via `ConnectionManagerRequestService.sendRequest` on **every** profile the panel
   offers (J1 picks the first one).
4. **Re-select the profile.** Run `MSYS_NO_PATHCONV=1 node scripts/debug/st-actions.mts slash "/profile <name>"`,
   then confirm `#send_but` is not `displayNone`. `st-session reload` does not clear it.
5. **Reload after every build.** Run `node scripts/debug/st-session.mts reload` after each
   `npm run build`, then take a header capture that shows `bundle.served` equal to the built bundle.

## Human sessions

**The user runs both sessions** (X26). Rules 7 and D6 bind: nothing the player sees changes, and no default flips, without a session. Each
session is exported with `so-journal.mts export` and live-tailed with
`so-journal.mts follow --out … ` and `st-payload.mts arm --persist --out …`. Flags are placed with ⚑,
and every flag is triaged.

| Session | Story / config | Rubric | What waits on it |
|---|---|---|---|
| **Player** | Adventurer (`adolion-adventurer`) from `guild-hall`, final tree, recommended config from JM (curator and warden `review`) | v2.1 player rubric (`../v2.1/test-plan.md` §Human-eval), v2.2 player rows (`../v2.2/08-acceptance.md:77`), plus: did steering feel like railroading? did the objective line or agency note restate itself? | **D6:** the `evidence_from` default and the opt-in "player writes attempts" clause, which are revisited here together with T22. **Rule 7 items:** options menu, visible qualities, cross-chat Continue list, wand-menu entry, objective-block player echo. Seed A `player_summary` |
| **Author** | Academy (`adolion-academy`) in the Studio | v2.2 author row ("were the judge's calls explainable from the author view?"), plus: the `evidence_from` diagnostic, `house_rules`, `objective_block`, next-turn cost/fate (T19), per-pass profiles (T18), the branch notice | T18 and T19 usability; whether the `house_rules` wording is understood |
| **Journey human rows** | Scored in `test/journeys/records/v2.4-acceptance/human/scores.json`, the one human-score file every `--require-human-record` names (`readScoredHumanIds` format `{id, score}`) | J0.4, J1.8/9, J2.10/11, J3.9–13, J4.5/6, J5.7, J6.5, J7.9/10, J8.4, J9.6/7, J10.9/10 | `--require-human-record` fails an unscored row |

- Each session's rubric scores and flag triage go into the Gate record: fixed / v2.5 / by-design,
  each with a reason.
- Without the sessions, plan 09 is **PARTIAL**. The D6 and rule-7 items are then recorded as
  "still waiting" and are not decided.

## Findings and v2.5 seeds

- **Register:** `§Findings register` in this doc, one row per finding: id `A<n>`, the row that found
  it, a measured symptom, the cause, and the status (`fixed <sha/record>` | `v2.5` | `by-design`),
  each with evidence.
  - A fix re-freezes, resets the affected series, and is named in the register.
  - A finding in a harness fixture (stale literal, vacuous check) is still a finding. It is fixed
    by property, not by literal (gotchas J10/J11.25).
- **v2.5 seeds:** `docs/plans/v2.4/v2.5-seeds.md`, in the same shape as `../v2.3/v2.4-seeds.md`.
  Every seed gives its **reason** and a **measurement** (a record path and a number). A seed
  without a measurement is labelled `unmeasured` and stays in that file.
  - Already destined there: the overview's v2.5 candidates;
  - D10 hosted routes;
  - D12 per-message inspector;
  - any judge use below its floor;
  - any rule-7 item the sessions approve.

## Risks

- **Backend.** The pod can be refused by the classifier, left with no free GPU, or stopped by its
  8 h cap mid-series. A cap hit mid-series breaks "consecutive", so plan series inside one pod
  window.
- **Model-dependent legs.** J7 and J3.7 (FACT lines) fail on the model's choices. Rule 12 means the
  pass rate is reported, not re-rolled.
- **The live host is not a clean ST**, and its edits are **recorded, not reverted** (X26: it is the user's install). `C:\dev\SillyTavern-MainBranch` is a patched `staging` checkout at `7c3994196` with local edits:
  - `public/scripts/textgen-settings.js` now exports `setSettingByName`, which
    `stHost/presets.ts:18` reads, although nothing calls it;
  - `public/global.d.ts` has +131 lines.
  So the live host's `host.files` hash differs from every clean host, and the live matrix measures a
  patched host.
- **Install-wide leakage.** The I2 flip, J12's cadence, the curator `acceptMode` and disabled
  members all outlive a run. Only header diffs catch them, so there is one header pair per batch.
- **Shared browser.** Peers share the browser, so pin the group on every navigation, and treat an
  `open-group` timeout as a stop. A stale CSRF token or a cached ETag can make a run look green on
  the wrong bundle, so check `bundle.served`.
- **Branch chats (I6)** are new chat files outside the sandbox guard's owned list. Cleanup must own
  them, or they leak.
- **The test-only emitter fixture (I3)** proves the shape predicate, not interop with a real Guided Generations install. The Gate record says so.

## Unresolved questions

None open. The draft's four were answered in `00-overview.md` §Reconciliation X26.

## Findings register

| Id | Row | Symptom (measured) | Cause | Status |
|---|---|---|---|---|
| — | — | — | — | — |

## Gate record

_Placeholder. On completion: date, candidate sha/fingerprint, every run of every series with its
tally and record path, header diffs, clean-host records, calibration and live-suite numbers, the
cost report, human scores and triage, attestation status (ACCEPTED | PARTIAL + notGreen)._
