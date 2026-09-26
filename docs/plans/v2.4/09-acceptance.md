# Plan 09 — Acceptance

**Status: RUN 2026-09-25 on `4ebe1db` (bundle `65733265d301`): PARTIAL, not accepted — see §Gate record.** Drafted 2026-09-23; depends on plans 01–08. Kind: gate. No product code except
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

Filled 2026-09-25 from the matrix. Ids are this register's; the lane agents' own labels are in brackets. Record
paths are relative to `test/journeys/records/v2.4-acceptance/`. "v2.5" = routed to v2.5, see `v2.5-seeds.md`.

**Product**

| Id | Row | Symptom (measured) | Cause | Status |
|---|---|---|---|---|
| A1 [lane1 A1] | I7, I3 | After `reloadCurrentChat` the checkpoint guidance reached **0 of 1** real `/trigger` requests; the control without the reload **1 of 1**. `story_*` blocks before `{story_orchestrator_guidance:166}`, after `{}`, same chat, epoch 71→71. Re-setting an identical nudge gives `injected:null` | `stHost/extensionPrompts.ts` skips a rewrite whose text+depth match its module-level `lastWritten` cache; ST's `clearChat` (`script.js:1590`, `extension_prompts = {}`) wipes the blocks and nothing clears the cache (H9: `/persona-sync`, persona change on an untainted group). Guidance, memory, private and nudge blocks stay out until their text changes | v2.5 (NEW, high). `interop/reload/v24-acc-A-reload-blocks-run1.log`, `-control-run1.log`, `interop/foreign-emitter/v24-acc-A-extprompt-cache-run1.log`; fixtures `test/scenarios/v24-acc-A-*.json` stay red until fixed |
| A2 [lane1 A2] | I3 | `getActiveNudge()` still reports the nudge after the sandbox chat was deleted and the page moved to another chat, while `extensionPrompts.story_copilot_nudge = null` | the one-turn nudge is not cleared on chat switch; A1 then dedupes a re-set | v2.5 (NEW, medium). `interop/foreign-emitter/v24-acc-I3-run3.log`, `-run4.log`; the in-page read is a lane `.debug` file, not archived |
| A3 | J1 run2 | Lane chat `2026-09-24@04h05m33s739ms` grew 6→7: Arin's reply to the sandbox story (send_date 09:42:49.935Z) landed 8 s after cleanup switched chats (09:42:41). Journey cleanup `clean`, header diff classed it `progress` | an in-flight group generation started in the sandbox chat outlives the chat switch and is saved into the next chat; cleanup neither stops nor awaits it; `so-run-header` treats `chatLength` growth as allowed | v2.5: evidence for 02 C1's open question ("what ST does with an in-flight `Generate` when the chat changes"), plus NEW harness scope (cleanup stops/awaits generation; header flags chatLength growth on a chat the run did not own). Message left in the lane copy. `J1/run2/journal-follow.jsonl`, `J1/run2/header-diff.log`, `lane1/header-lane1-diff.log`. **Reproduced in the gap-close on lane 3** (judge-on J7): cleanup deleted the sandbox and moved to the resting chat `2026-09-20@07h06m38s396ms` at 19:39:00.4Z; a Ponticius reply (send_date 19:39:02.886Z) was saved there, 0→1. Cleanup `clean`, header diff `chatLength 0 -> 1 (allowed by progress)`. The A33 save settle ran (`saveSettleMs` 1538) and did not help: it waits on `isChatSaving`, not on a running generation. Residue archived and removed with `/cut 0`; lane-3 session-end diff after the cut 0 blocking. `cost/J7-judge-on/A3-residue-lane3-resting-chat-2026-09-20@07h06m38s396ms.jsonl`, `cost/J7-judge-on/A3-residue-cut.log`, `cost/J7-judge-on/header-diff.log`, `cost/header-lane3-session-end-diff{,-after-cut}.log` |
| A4 | J1 | "◈ Accept the Mission" note posts ~20 s after the transition (cp1→cp2 09:45:02.751, status 09:45:23.460), after the entry narration | `commitBoundary`: `applyActive('activate')` awaits `fireNpcReplies(onEnter)` (`effectsApplier.ts:261`) before `announceTransition` | v2.5 (NEW, low, UX order). `J1/run3/journal-follow.jsonl` |
| A5 [lane2 D1] | J7 | `DELTA mission_accepted=true evidence="[12] Max: 'We'll take it,' …"` rejected in 4 reads ("evidence not in window"); story stuck at cp2 for 900 s. Probe: same quote `withLabel:[]`, `withoutLabel:[12]` | `extraction/evidence.ts` `evidenceSources` matches the quote against `message.text`, but the window prints each line with its `[n] Name:` label, so an exact copy of the transcript fails | v2.5 (NEW, high). `J7/run1/evidence-label-probe.out.json`, `J7/run1/evidence-J7.2-audits.json`, `J7/run3/evidence-J7.3-audits.json` |
| A6 [lane2 D2] | J7 | Reads held ~32 min (11:23–11:58) while turns kept rendering; "did not answer within 64214 ms", pipeline `stalled-rechecking` | breaker recovery probes use a fixed 10 s `PROBE_TIMEOUT_MS` (`breaker.ts`) that a queued llama-server cannot meet, so the backoff never closes | v2.5 (NEW, medium; the fixed-timeout-as-hardware class). `J7/run3/evidence-J7.6-breaker-health.json`, `evidence-J7.6-stalled-pipeline.json` |
| A7 [lane2 D3] | J7 | `tension_current='calm'` / `value="stirring"` rejected "invalid value" in almost every read; tension stayed 0 all of run 1 | prompt says "one quoted level"; the parser accepts one quote form only | v2.5 (NEW, low). `J7/run1/evidence-J7.2-audits.json`, `J7/run3/evidence-J7.5-late-accept.json` |
| A8 | J11 | J11.25 prepare-ahead 1/4 (2/2 on 2026-09-22). Scene judge timeouts inside J11.25: 3/5, 7/8, 3/9, 6/6; in J11.11–16 (same judge, no lookahead) 0 timeouts at 237–1723 ms | `SCENE_TIMEOUT_MS` 2500 (`src/judge/policy.ts:49`) lapses on most boundaries of this check. Hypothesis (unverified): the in-page judge fetch queues behind J11.25's concurrent long same-origin requests. **Gap-close: not confined to J11.25.** The judge-on J7 (no lookahead check, 33 boundaries) timed out the scene judge on **19 of 33** calls (p50 2502 / p90 2512 / max 2538 ms) and the warden on 4 of 19 at 4000 ms; the J11 ring over all four runs has scene 18 of 48. The J11.25-specific hypothesis does not explain the J7 | v2.5 (NEW, major). `J11/*/journal-follow.jsonl` (kind judge), `J11/seriesB-run1/record.json`, `cost/cost-report-J7-judge-on.log`, `cost/cost-report-J11-follow-ring.json`, `cost/J7-judge-on/record.json` (`cleanup.judgeCalls`). The post-candidate fix on master (`9524384`, scene-read bursts share one call) is not on the attested bundle; nothing here measures it |
| A9 | J11 | J11.23: judge answered `lever_pulled` p 0.93 < `STALL_DIRECT_P` 0.95 → re-read queued, not a direct write (3/4 pass) | model-dependent; the product followed its policy; floor not retuned | by-design. `J11/seriesB-run1/record.json` |
| A10 | J12 | Early reads are triggered (`scene:cast`, `cue`) over window 0-1 even when they run after boundary 2-3; with nothing extractable there no read sets `path`. The cadence read (window 0-5) accepted `path=wendhope` 2/2 | window fixed at trigger time (whether by design was not determined) | v2.5 (NEW, open question). `J12/run2/journal-follow.jsonl`, `J12/seriesB-run1/journal-follow.jsonl` |
| A11 | P03 | Memorize run 4: "did not answer within 256462 ms", backfill 2/3; pod prefill 481 tok/s, decode 3.7–12 tok/s under three lanes | full-pass timeout scaled to a 500 tok/s prefill floor (plan 03 D1); no retry for the whole-chat pass | v2.5 (NEW, medium; a slow backend loses the whole-chat pass). `P03/live-v24-03-memorize-run4.log`, `-run4-failure.json` |
| A12 | P03 | `memorize:full` reply hits the 1200-token cap in 2 of 5 samples, then an identical ~88k-token re-ask (promptMs 364 only thanks to the prefix cache) | designed truncation retry; costs a second full prefill on a backend without a prompt cache | by-design (observation). `P03/live-v24-03-memorize-run5.log` step 16 |
| A13 | P03 | Estimate below true tokens by 358–374 on budget-sized windows (87707 est vs 88319 true) | known 03-H11 tokenizer gap, inside the 10 % margin | in v2.5 00-overview §05 (token estimate). `P03/live-v24-03-memorize-run5.log` |
| A14 | P08 | Authoring role: a16 (es) after repair sets a snapshot on unknown quality `reliquia_recuperada`; es validity 7/8 = 0.875 < 0.90 | the checkpoints stage can still emit a draft `parseStoryV2` refuses | not recommended (floor kept); in v2.5 residue (T18 calibration → 06). `test/goldens/live/role-calibration/authoring-shared-65733265d301.json` |
| A15 | JM | House-rule note: pooled defect rate on 0.4 vs off 0.3; on-run1 real replies m4, m6 broke the rule after the note applied | the note does not reliably prevent the next break (measurement) | in v2.5 residue (agency/house-rule effect on replies → 06). `judge/houseRules/overstear/rescore-pooled.json` |
| A16 | JM | Agency check: every flagged reply in every arm is the scripted m2; the real model never wrote the player | the transcript cannot show an effect | in v2.5 residue (needs a control arm → 06). `judge/agencyCheck/overstear/rescore-pooled.json` |
| A17 | LS | Tiers scored: deltas/facts/rejected only; `facts.vacuous ['mustContain: ""']` | no fixture scores epistemic/ledger/arcs; vacuous needle | v2.5 (NEW, info). `live-suite/run1/so-live-suite-report.json` |
| A35 | J7 (post-freeze) | "evidence not in window" rejects real quotes; 14/15 and 23/28 match once markdown `*` is stripped | `normalizeEvidenceText` (`src/extraction/evidence.ts:17-23`) keeps `*`/`_` | open, high; found on `ca25e4a632ed`, see §Post-freeze live checks |
| A36 | J7 (post-freeze) | quoted bool/int (`value="true"`, `value="1"`) rejected "invalid value" | `src/extraction/parse.ts:133-136`; D3 tolerance covers enums only | open, low; see §Post-freeze live checks |

**Harness and fixtures** (a harness finding is still a finding; fixed by property)

| Id | Row | Symptom (measured) | Cause | Status |
|---|---|---|---|---|
| A18 [lane1-A2] | J6 | Run 1 header diff: +4 `storyOrchestratorDebug*Response` globals, undeclared | `so-journey.mts` cleared debug mocks at setup only (`so-scenario` clears both ends) | fixed in the working tree (`scripts/debug/so-journey.mts` runCleanup), uncommitted; J6 runs 2–3 `cleanup.debugResponses.cleared` 4 keys, diff 0 |
| A19 | J1 | J1.7 failed runs 1 and 3 in ~1 s | fixed 5 s UI settle around a real generation (A4) | fixed: `test/journeys/j1-first-contact.journey.json` J1.7 `timeoutMs 180000`, uncommitted; series restarted, runs 4–5 green (the longer wait was never exercised: 8 ms, 6 ms) |
| A20 | J7 | J7.5 run 3: `chamber_entered` accepted after the neutral turn's last boundary, then 900 s with nobody talking | a delta applies at the next boundary | fixed: `j7-long-haul.journey.json` (schedulerIdle + `attempts: 2, retryBack: 2` on the neutral turn), uncommitted; seriesB-run2 took exactly that retry |
| A21 | J11 | Run 1: the heading read landed after boundary 5, the check's last | same shape as A20 | fixed: `j11-judgment-backend.journey.json` (wait for the scene read, then one more real turn), 53ba8d8a→932a47dd, uncommitted |
| A22 | J12 | Runs 3–4: `path=wendhope` accepted ~2 s before the check read the checkpoint | same shape as A20 | fixed: `j12-unaided-schedule.journey.json` (one more real turn + schedulerIdle, reports accepted-but-unapplied), 47a18344→f3761d4d, uncommitted |
| A23 | J11 | Run 1 cleanup `notDeleted`: the file was gone but a stale ST group save re-listed it | `deleteSandboxChats` required absence from the listing AND the file | fixed: `scripts/debug/st-navigation.mts` decides `gone` by the file, a listing goes through the existing resurrection repair; `test:debug` 278/278, uncommitted |
| A24 | P01 | `so-turn-types-check` a-reply failed runs 2–3: one send drafted two members, two boundaries | the check demanded one commit per send | fixed: `scripts/debug/so-turn-types-check.mts` one commit per rendered reply; `test:debug` 273/273, uncommitted; runs 4–5 green |
| A25 | P02 | `inventory.v2Stories +v24-01-delete-decode@1` and `+sun-ruins@2` leaks | Studio save gives a legacy story a title id; an `expectFail` `import_story` keeps the record and `so-scenario` removes only successful imports | fixtures fixed (`v24-02-settings-save-swallowed.json`, `v24-02-unrecognized-blob.json`), uncommitted; the runner-level gap stays open → v2.5 (NEW). `P02/header-v24-02-*-run1-diff.log` |
| A26 | P03 | Memorize step 16 counted 4 requests for 2 windows + 1 pass | `runSharedRead` re-asks once on a refused truncated reply (`sharedRead.ts:170-173`) | fixed: `live-v24-03-memorize.json` drops one identical re-ask per pass, uncommitted |
| A27 | P05 | `inventory.lorebookCount 38→39`, `lorebooksSelected +SO-V2405 Lore` after forced-pick run 1 | `live-v24-05-forced-pick.json` creates and selects its marker book and never removes it; the plan-05 record hid it (book pre-existing) | worked around in the lane wrapper (`so-assets remove --marker SO-V2405`); fixture unchanged → v2.5 (NEW). `P05/header-forced-pick-run1-diff.log` |
| A28 | J11 | J11 run 1 leak diffed as 0 differences | `so-run-header` captures no group chat lists | v2.5 (NEW). `J11/run1/header-diff.log` vs `J11/run1/record.json` |
| A29 | J11 | `st-lanes run` log stamps every line with the end time | `st-lanes.mts:180-182` buffers child stdout until exit | v2.5 (NEW, minor). `J11/run1/journey.log` |
| A30 | I3 | v24-acc-I3 runs 1–2 red | the new fixture filtered `story_orchestrator_*`, the nudge key is `story_copilot_nudge` | fixed during the series (filter widened, then clear-first); both restarts reported |
| A31 | J8, J7, P05 | `build.head` moved mid-series (f97c302→f11ab3b, 4ebe1db→e9fd5f8) as a blocking header difference | peers committed to master during the matrix; entry criterion 4 (freeze) breached for the tree, not for the served bundle | process: J8 run 1 and J7 seriesB-run2 counted failed; later runs declared `--allow build.head`. v2.5 (NEW): freeze the checkout (worktree) for a matrix |
| A32 | — | `j1-first-contact.journey.json`, `j12-unaided-schedule.journey.json`, `v24-02-unrecognized-blob.json` are LF in the working tree (repo is CRLF) | the agents' edits flipped endings; `core.autocrlf=true` normalises on commit | note for the committing session; the fixture hashes above are over the LF bytes as run |
| A33 | P08 | Gap-close `live-v24-08-routing` run 2: all 15 steps passed, cleanup `notDeleted ["2026-09-25@16h03m53s991ms"]` ("Deleted file", then the file back 1 ms later with both messages) | a chat save in flight when the open sandbox chat is deleted lands after the delete and re-creates the file | fixed, committed in `e7626d7`: `deleteSandboxChats` waits for a 1.5 s window without `isChatSaving` (cap 30 s) before deleting, re-checks every deleted file, re-deletes a late one and reports `lateFileRepaired` / `saveSettleMs`. Orphan deleted by hand (`P08/live-routing-run2-orphan-cleanup.log`); routing series restarted, runs 3–4 and the judge-on J7 used the fix; every P05 gap-close run predates it. Does not cover A3 |
| A34 | P05 | `live-v24-05-mirror-rate` ×2 in the gap-close, each after `st-session reload` + J3 ×2 on the same page: "nothing to measure", `mirrorRates()` = `[]` (`P05/mirror-rate-run{1,2}/mirror-rates-raw.log`). With the three plan-05 measurements, 5 of 5 on 3 bundles | structural: all four J3 runs report no mirror book (`cleanup.mirrorBooks.deleted []`), so no `so_` entry is ever in a loud scan; the recipe cannot produce the population the predeclared rule measures | v2.5 (§08 mirror key hygiene): the measurement needs a recipe that builds a mirror book. Rule not retuned; key strip not built |

**Environment**

| Id | Row | Symptom (measured) | Cause | Status |
|---|---|---|---|---|
| E1 | I1, J3, J7, P03 | 8-token curl 38.9 s; replies 150–500+ s at <1 tok/s; J7 seriesB ~2 tok/s against ~300k prompt tokens in 8 min; memory reads timed out and opened the breaker | one llama-server (`LLM_PARALLEL` 2) shared by lanes 1–3 | recorded; every red run of I1 live, J3 run 1, J7 series B and P03 memorize run 4. `interop/middle-delete/monitor-v24-acc-I1-live-run4.log`, `J7/seriesB-run2/backend-throughput-samples.txt` |
| E2 | all lanes | `Story Orchestrator Memory Local` (:1235) fails PONG in 5 ms | dead local endpoint | recorded; not first in the list, no row used it |
| E3 | JM | Sandbox group chat resurrected in 10 of 12 runs; repaired every time (`notDeleted []`) | ST group save debounce (V18) | recorded; harness repair works. `judge/*/*/run*/record.json` `cleanup.chat.resurrected` |

## Gate record

**2026-09-25. Verdict: PARTIAL, not accepted.** `docs/release/2.4.0/attestation.json` status `PARTIAL`, 18 `notGreen`
lines after the gap-close below; `npm run test:release` 37/37 pass against it.

**Gap-close (2026-09-25 18:50–19:40Z, same candidate, records committed in `e7626d7`).** Read
`gap-close/README.txt` first. Lanes 1 (P08) and 3 (P05 mirror-rate, then the CL judge-on J7), group `1759606632088`,
real model, no `debugResponse`. All 22 run-header captures read `bundle.served` = `65733265d301`; every run and batch
declared `--allow build.head` up front (master moved `27d0bf8`→`582d56a` during the runs, no rebuild). One harness change
mid-session: `deleteSandboxChats` save settle + late-file repair (A33), after P08 routing run 2; routing runs 3–4 and the
J7 used it, every P05 run predates it.
- **P08 → green.** The five `live-v24-08` fixtures ×2 on lane 1: preview-capture, preview-capture-solo, fates-jump,
  quality-macro 2/2 each; routing 1 pass, 2 fail (every step passed, cleanup left the sandbox chat: A33), harness fix,
  **series restarted**, 3–4 pass. Batch diffs 0 blocking; lane-1 session end 0 blocking. `P08/runs.jsonl`.
- **P05 stays partial (structural).** `live-v24-05-mirror-rate` ×2 per the plan-05 recipe (reload, J3 ×2 on the same
  page, the fixture): "nothing to measure" both times, `mirrorRates()` `[]` (A34). The four J3 feed runs were 8/8 each,
  first try, header diff 0; they are real J3 runs on the unchanged fixture and are listed under J3 (6/8).
- **CL recomputed, still partial.** Metered totals now over 13 records (12 JM + the judge-on J7); J11 read from its live
  `so-journal follow` tails as a ring reading (`cost/j11-follow-ring.mts`). Director and lore sit inside 1500 ms on the
  J11 ring (max 630 / 1392 ms, 0 over budget), but no metered run issued a director or lore call.
- **A8** scene-judge timeouts are not J11.25-specific: 19/33 in the judge-on J7. **A3** reproduced on lane 3 after the
  J7 cleanup. Both in the register.
- Post-candidate src fixes on master (A1/A2 `b30b8ac`, A5/A7 `2702435`, A8/A10 `9524384`, A6/A11 `efbe189`) are not on
  the attested bundle; nothing in this record covers them.

**Candidate.** Commit `4ebe1db` ("v2.4.0: version bump for the plan 09 acceptance candidate"), extension 2.4.0, bundle
`65733265d3015e620e5f26221d4cbfdbce59541b49e356c69c13642f386f0cab` (1 827 372 bytes), source `3b2655c2305f…` (326 files),
built 2026-09-25T09:22:29Z. Reproducible from git: six clean-host builds of `4ebe1db` produced the same bundle and source
hash. All 285 run-header captures under the records root (263 matrix + 22 gap-close) read `bundle.served` = the candidate.

**Deviations.**
- Live rows ran on **lane copies 1–3** (`st-lanes`, ST :8101–8103), not lane 0. A lane result is evidence about the lane's copy.
- One llama-server (`LLM_PARALLEL` 2) served all three lanes at once (E1). Every red run whose cause is a timeout sits on it.
- **Human sessions not held**: no run passed `--require-human-record`; `human/scores.json` does not exist; every journey human
  row is unscored. D6/T22 and every rule-7 item stay **waiting**, not decided.
- **R1 not runnable**: P0′ needs v2.3 L1, which was never recorded (entry criterion 2 not met).
- **Downgrade leg dropped** by user decision E9 (J10.12, `persistenceDowngrade.test.ts`, the clean-host downgrade leg): not owed.
- **Not frozen**: peers committed to master during the matrix, including src (`2368cba`, `74867d5`), never rebuilt or served
  (A31). The host checkout was not pulled.
- Lane 1 browser headless (the plan asks headed). `so-journal export` not possible (cleanup deletes the sandbox chat); a
  live `so-journal follow` tail is archived per run instead from J1 run 2 on.
- Rows I4, I5, I7 and the no-backend P01/P02 fixtures seed reads through `debugResponse` by design (host-mutation paths);
  I2/I3 seed the private row the same way. The real model drives I1 live, the `/trigger` turns, all journeys, JM, LS.
- JM columns are plan 07's check-scoped `--only` runs: records `partial: true` by construction, cited as JM rows, never as
  journey runs.
- Entry criterion 3 (the full machine-gate line, census todo counts) is not evidenced in the records; the clean hosts ran
  typecheck, lint, test, build and release only (no storybook, `typecheck:test`, `test:debug`, `test:plugin`).
- Verdict convention: the lanes called a row red when any run of its final series failed, even with two consecutive greens
  after it (J3 runs 3–4, J12 seriesB 2–3, P03 memorize 5–6, I1 fork 5–6). `attestationRules.mjs` reads those as ×2 but still
  requires `notGreen` to name them, so the attestation is consistent either way.

**Matrix.** Pass rate = green runs / runs. firstTry is from each record's `tallies.firstAttempt`.

| Row | Runs (outcome, firstTry) | Verdict | Records |
|---|---|---|---|
| J0 | 1 pass 5/5 (5/5); 2 pass 5/5 (5/5). J0.3 blocked, J0.5 fail, both as expected | green 2/2 | `J0/run{1,2}/` |
| J1 | 1 fail 7/8 (J1.7); 2 pass 8/8 (8/8, A3 leak); 3 fail 7/8 (J1.7); fix A19; 4 pass 8/8 (8/8); 5 pass 8/8 (8/8) | green on 4–5; 3/5 overall | `J1/run{1..5}/` |
| J2 | 1 pass 10/10; 2 pass 10/10 (10/10 each) | green 2/2 | `J2/run{1,2}/` |
| J3 | 1 fail 7/8 (J3.6 model timeout 60918 ms, E1); 2 fail 7/8 (J3.7 no FACT line in 6 audits); 3 pass 8/8; 4 pass 8/8 (all passing checks first try); gap-close 5–8 pass 8/8 each (8/8 first try, lane 3, the P05 mirror-rate feed, same fixture) | **red** 6/8 by the series convention (runs 3–8 consecutive green) | `J3/run{1..4}/`, `P05/mirror-rate-run{1,2}/J3-{a,b}/` |
| J4 | 1 pass 5/5; 2 pass 5/5 | green 2/2 | `J4/run{1,2}/` |
| J5 | 1 pass 7/7; 2 pass 7/7 | green 2/2 | `J5/run{1,2}/` |
| J6 | 1 11/11 but **fail** by header rule (A18); fix; 2 pass 11/11; 3 pass 11/11 | green on 2–3; 2/3 by protocol | `J6/run{1,2,3}/` |
| J7 | A: 1 fail 7/8 (J7.2, A5); 2 pass 8/8; 3 fail 6/8 (J7.3 A5, J7.5 A20). Fix A20. B: 1 fail 5/8 (E1: 694 s/723 s turns); 2 fail 7/8 (J7.1 schedulerIdle, J7.5 retried, undeclared build.head). Gap-close: one judge-on run (CL source, every built use + warden auto) pass 8/8 (8/8 first try), 33 boundaries, header 0 blocking with A3's `chatLength` progress; a different configuration, no series | **red** A 1/3, B 0/2 | `J7/run{1,2,3}/`, `J7/seriesB-run{1,2}/`, `J7/series.json`, `cost/J7-judge-on/` |
| J8 | 1 10/10 but **fail** by header rule (A31); 2 pass 10/10; 3 pass 10/10; assert-clean SO-J8 exit 0 each | green on 2–3 | `J8/run{1,2,3}/` |
| J9 | 1 pass 8/8; 2 pass 8/8; removeCreatedAssets + assert-clean SO-J9 clean | green 2/2 | `J9/run{1,2}/` |
| J10 | 1 pass 11/11; 2 pass 11/11; J10.12 dropped (E9), J10.13 passed both | green 2/2 | `J10/run{1,2}/` |
| J11 | 1 fail 25/26 (J11.25 A21, cleanup leak A23); fix; B1 fail 24/26 (J11.23 A9, J11.25 A8); B2 pass 26/26; B3 fail 25/26 (J11.25 A8). Judge config per check in `judge-config-per-check.json` | **red** 1/4 (B 1/3) | `J11/run1/`, `J11/seriesB-run{1,2,3}/` |
| J12 | 1 pass 5/5; 2 fail 2/5 (A10); 3, 4 fail 4/5 (J12.5, A22); fix; B1 fail 3/5 (A10); B2 pass 5/5; B3 pass 5/5. Group 1789797226071 (its own setup.group) | **red** 3/7 (B 2/3) | `J12/run{1..4}/`, `J12/seriesB-run{1,2,3}/` |
| I1 | ambiguous half 2/2; live base `live-v24-01-t1` F F P F (1/4); fork `v24-acc-I1-live` (600 s) F P F F P P (3/6); every red a throughput timeout (E1) | **partial** | `interop/middle-delete/` |
| I2 | 2/2; arm A quiet 1 / loud 1 / carrying 1 / applied; control quiet 0; flip restored (thirdParty diff 0). Payload check body-level, not scoped to the epistemic block | green | `interop/stepped-thinking/` |
| I3 | 1–2 fail (A30), 3–4 fail (A1 dedupe of residue), 5–6 pass on the final fixture; test-only emitter, GG not installed | green on 5–6 | `interop/foreign-emitter/` |
| I4 | 2/2 (control: real edit rolls back from 2) | green | `interop/noop-edit/` |
| I5 | 2/2; window excludes 1, keeps 0 and 2; `/unhide` re-includes | green | `interop/hide/` |
| I6 | base 2/2; `v24-acc-I6` (no popup, no auto-adopt, chip present) 2/2; branch chat + book owned by cleanup | green | `interop/branch/` |
| I7 | `v24-acc-I7` 2/2 (plain / silent rewrite / legacy arms), `v24-02-same-chat-reload` 2/2; defect probe fail vs control pass (A1) | **red** (A1) | `interop/reload/` |
| P01 | 14 no-backend fixtures ×2 (28/28), 6 live ×2 (12/12), plan03a + turn-identity ×2 (8/8); turn-types 1 fail (header, open-chat location only), 2–3 fail (A24), 4–5 pass | green | `P01/` |
| P02 | 11 fixtures ×2 (22/22); settings-save-swallowed 1–2 fail (A25) → 3–4 pass; unrecognized-blob 1 fail, 2 pass (vacuous), fix → 3–4 pass; live E2–E5 ×2 (8/8) | green | `P02/` |
| P03 | breaker, abort, wedges ×2 (6/6); npc-switch, turn-identity, llm-npc-reply ×2 (6/6); memorize A: 1 fail (A26), 2 pass; B: 3 pass, 4 fail (A11), 5 pass, 6 pass | **red** (memorize B 3/4) | `P03/` |
| P04 | window-hygiene, live window-hygiene, player-evidence, player-evidence-control, each 2/2 | green | `P04/` |
| P05 | gated-constant 2/2, foreign-filter 2/2, forced-pick 1 fail (A27) 2 pass → B 3–4 pass, t13-spike 2/2 (S8 p95 3.6/3.2 ms), t13-manual + S1c 1/1; gap-close mirror-rate 0/2, "nothing to measure" both times (`mirrorRates()` `[]`, A34: structural, the J3 recipe creates no mirror book) | **partial** (median rule still unmeasured) | `P05/`, `P05/mirror-rate-run{1,2}/` |
| P06 | objective, objective-off, overlay TC, overlay CC, curator: 10/10 first try | green | `P06/` |
| P07 | meter 2/2 + `--keep` cross-check (meter {1, 447, 22} = scenario log); token guard 2/2 (106 411-char state → 0 plugin requests; direct POST over cap → 400 in 5 ms) | green | `P07/` |
| P08 | curator recal: validity 20/20, opShape 14/14, decision 19/20, **meets every floor overall and es** (first time); authoring: validity 19/20, es 7/8 = 0.875 < 0.90 (A14), firstTry 16/20; replay jest 33/33. Gap-close lane 1: preview-capture, preview-capture-solo, fates-jump, quality-macro 2/2 each; routing 1 pass, 2 fail (cleanup, A33), fix, restarted: 3 pass, 4 pass; header diff 0 blocking on every run | green after the routing restart | `P08/`, goldens `*-shared-65733265d301.json` |
| JM agencyCheck | on 2/2 (3 calls each), off 2/2 (0 calls); calibration writes 23/23, clean 28/28, es 10/10, p50 1438 ms → recommended at floor | green | `judge/agencyCheck/` |
| JM houseRules | on 2/2, off 2/2; calibration 95/96 = 0.9896, es 16/16, p50 465 ms → recommended at floor; A15 | green | `judge/houseRules/` |
| JM warden | on 2/2, off 2/2; continuity 83/85 = 0.9765 (combined request identical); pooled defect on 0.154 vs off 0.3 | green | `judge/warden/` |
| JM privacy | every on run 3 bodies = meter 3 = ring 3; off 0; bodies only `{state, questions, model}`. TypeSafe terms citation still owed | green | `judge/crosscheck.json` |
| LS | 1: deltas 22/22, facts 16/22 = 0.727 (≥0.68), rejected 14/15 = 0.933 (≥0.9); 2: 22/22, 0.727, 15/15; 22 of 22 ran | green 2/2 | `live-suite/run{1,2}/` |
| CL | 12 JM records: 18 calls, 11 225 in / 474 out, $0.000471, $0.0089 per 1000 boundaries, 0.34 calls/boundary, p50 579 / p90 1225 / max 1329 ms, 0 fallbacks, jev-1.13.0. **Gap-close, metered over 12 JM + judge-on J7** (`cost-report-v2`): 99 calls (1 cached), 129 340 in / 7 572 out, $0.005432, 86 boundaries, $0.063 per 1000 boundaries. J7 alone: 81 calls, 118 115 in / 7 098 out, 33 boundaries, 2.45 calls/boundary, $0.150 per 1000 boundaries; memoryVerify 24 (p50 567 / p90 600 / max 2287), scene 33 (p50 2502, timeout 0.576, A8), warden 19 (p50 747 / p90 4002, timeout 0.21), memoryPairs 4, stall 1; no director or lore call. **J11 ring only** (no meter; follow tails, deduped): 184 calls, 350 956 in / 32 458 out, 22 timeouts; director 48 (p50 262 / p90 593 / max 630 ms, timeout 0.083), lore 8 (p50 750 / p90 1392 / max 1392 ms), 0 over the 1500 ms budget; scene 48 (timeout 0.375) | **partial** (director/lore latency is a ring reading only, no metered sample; J11 not in the metered totals) | `cost/` |
| CH | pinned, 1.19.0, 1.18.0 each 2/2 on typecheck, lint, test, build, release; bundle + source = candidate; storybook **not run** | **partial** | `clean-host/*/` |
| R1 | — | **not runnable** | — |
| H | — | **not run** | — |

Counts over 37 rows after the gap-close: **25 green, 6 red** (J3, J7, J11, J12, I7, P03), **4 partial** (I1, P05, CL,
CH), **2 not run/runnable** (R1, H). Before it: 24 / 6 / 5 (P08 partial).

**Header diffs.** Every per-run diff is 0 blocking except those named above (J6 run 1, J8 run 1, J7 seriesB-run2, P01
turn-types run 1, P02 settings-save-swallowed 1–2 and unrecognized-blob 1, P05 forced-pick 1). Batch pairs:
`lane1/header-lane1-*` (0 blocking, 1 progress = A3), `lane1-A2/header-batch-diff.log` (0), `interop/lane1-A3/` (0 with
`--allow build.head`), `J7/header-lane2-acc-end-diff.json` (build.head only), `lane2-B2/` (0 with allow), `lane2-B3/` (0),
`P04/header-lane3-end-diff.log` (0), `lane3/header-lane3-diff-end.log` (0 blocking), `lane3-C3/` (0). Gap-close (all
`--allow build.head`): every per-run diff 0 blocking; `P08/header-live-batch-diff.log` (0), `P08/header-routing-B-batch-diff.log`
(0), `P08/header-lane1-session-end-diff.log` (0 blocking), `P05/header-mirror-batch-diff.log` (0),
`cost/J7-judge-on/header-diff.log` and `cost/header-lane3-session-end-diff.log` (0 blocking, 1 progress = A3),
`cost/header-lane3-session-end-diff-after-cut.log` (0 after the A3 residue was cut).

**Install end state (per lane).** REF-2.4 (cadence 3, `acceptMode` review, judge off with every use off, Stepped Thinking
`is_enabled` false). Lanes 1–3 were moved from cadence 1 / `acceptMode` auto to REF-2.4 during prep and left there. No
sandbox, branch or mirror residue; `disabled_members []`; `so-assets assert-clean` clean for every marker used. Residue kept
on purpose: the A3 message in lane 1's chat `2026-09-24@04h05m33s739ms` (message 6, Arin) awaits a decision. The
gap-close's lane-3 A3 message (resting chat `2026-09-20@07h06m38s396ms`) was archived and removed with `/cut 0`; the P08
routing run 2 orphan was deleted by hand (A33). Lane-1 and lane-3 session-end diffs are 0 blocking.

**Harness and fixture changes the agents made** (reasons in A18–A30; written as uncommitted, since committed with the
matrix records in `df90f8b`; the A33 `deleteSandboxChats` change in `e7626d7`):
`scripts/debug/so-journey.mts` (A18), `scripts/debug/st-navigation.mts` (A23), `scripts/debug/so-turn-types-check.mts`
(A24); journeys `j1` (A19), `j7` (A20), `j11` (A21), `j12` (A22); scenarios `v24-02-settings-save-swallowed.json`,
`v24-02-unrecognized-blob.json` (A25), `live-v24-03-memorize.json` (A26); new scenarios `v24-acc-I1-ambiguous.json`,
`v24-acc-I1-live.json`, `v24-acc-I3.json`, `v24-acc-I6.json`, `v24-acc-I7.json`, `v24-acc-A-reload-blocks.json`,
`-control.json`, `v24-acc-A-extprompt-cache.json` (the A1 probes stay red until A1 is fixed); new goldens
`test/goldens/live/role-calibration/{curator,authoring}-shared-65733265d301.json`. Lane wrappers kept in gitignored or out-of-repo dirs are
not cited; the archived ones are `lane3/row.sh`, `P07/token-guard-probe.js`, `P05/t13-manual-S1c-check.js` and
`P06/cc-setup-body.js`. `calibrate --record` and `live-suite --record` overwrote tracked goldens; the lane restored the originals from
backups, and the outputs are in the records.

**Attestation.** `docs/release/2.4.0/attestation.json`: PARTIAL; evidence root `test/journeys/records/v2.4-acceptance/`;
every journey run cites its record, header and fixture hash; 191 cited paths checked on disk. `npm run test:release`: 37
pass, 0 fail. The record-level predicate reads J6 and J8 as ×2 on runs 1–2; under the header rule their pair is runs 2–3
(recorded in the attestation). `test:release` rewrote `dist/manifest.json` `builtAt` (expected). **Gap-close update**:
status still `PARTIAL`, attested bundle still `65733265d301`; J3 gains runs 5–8 (predicate: 6/8, ×2 on runs 3–4), J7
gains the judge-on run (2/6, not ×2); rows P05, P08, CL rewritten with the gap-close records; `notGreen` 16→18 (A8
outside J11.25, A3 on lane 3; P05/P08/CL lines rewritten). 212 cited paths (row records + journey records/headers +
the gap-close README and A3 residue) checked on disk, 0 missing. `npm run test:release`: 37 pass, 0 fail.

**Human scores and triage.** None: sessions not held.

**v2.5 seeds.** `docs/plans/v2.4/v2.5-seeds.md`.

**Unresolved questions.**
- Does "×2" allow earlier failures in the same series (J3, J12, P03, I1 fork), or does any failure in a series make the row red?
- The A3 message in lane 1's chat: delete it (`st-lanes run 1 -- scripts/debug/st-actions.mts delete 6`) or keep it as evidence?
- Commit the working-tree harness and fixture fixes (A18–A30) with the records, or re-run the affected series first?
- Close the gap rows (P08 fixtures, P05 mirror-rate, CL with J11/J7, CH storybook) in v2.4, or defer them with a sign-off?
  Gap-close answered P08 (green). P05 cannot close with the current recipe (A34), CL lacks a metered director/lore
  sample, CH storybook not attempted: defer with a sign-off, or build a mirror-book recipe and a judge-on run that
  drafts through the director?
- The A3 message cut from lane 3 is archived; A3 now has two reproductions. Is the cleanup-awaits-generation harness
  fix v2.4 scope (it gates every "cleanup clean" claim) or v2.5?
- `v2.5-seeds.md` still lists P08 fixtures as "not run", P05 as "not run" and CL as JM-only; update it with the
  gap-close?

## Post-freeze live checks (master e7626d7, bundle ca25e4a632ed)

**2026-09-25 20:00Z – 2026-09-26 00:00Z.** Each fix merged to master after the freeze, checked live on a build of
`e7626d7` (bundle `ca25e4a632ed`). **This does not change the verdict above**: `docs/release/2.4.0/attestation.json`
still describes the frozen bundle `65733265d301` and stays `PARTIAL`. It carries only a `postFreeze` note pointing
here. Lanes 1–3, group `1759606632088` (J12: `1789797226071`), real model, no `debugResponse` except where a row's
fixture seeds by design (I7, A2/I3, as in the matrix). Every run captured a run header before and diffed it after, and
each one read `bundle.served` = `ca25e4a632ed` with 0 blocking (`--allow build.head`). The only exceptions are the four
superseded AE-01 switch runs (blocking 2 each) and AE04-S1 run 1 (fixture red, diff 0), named below. Session-end diffs:
lane 1 `header-session-end-diff.log` and lane 3 `lane3-batch/header-batch-diff.log`, both 0 blocking.
`so-assets list --marker SO-PF` was clean before each lane started. Records root:
`test/journeys/records/v2.4-postfreeze/ca25e4a632ed/`. Paths below are relative to it. Each row dir has a
`runs.jsonl` or `runs.txt` that summarises it.

`verdict` is the row on this bundle (green = two consecutive green runs on an unchanged fixture).
`fixVerdict` says whether the run shows the named fix working: `fixed`, `not-fixed`,
`inconclusive` (green, but the fix's path was never exercised), `n/a` (no fix is attributed to this row).

| Row | Fix commit | Verdict | fixVerdict | Runs | Record |
|---|---|---|---|---|---|
| A1 same-chat reload keeps prompt blocks | `b30b8ac` (A1/A2) | green | fixed | `v24-acc-A-reload-blocks` 2/2 (the matrix's red defect probe, now passing); `-control` 2/2 | `A1/` |
| I7 same-chat reload | `b30b8ac` (A1) | green | fixed | `v24-acc-I7` 2/2, `v24-02-same-chat-reload` 2/2 | `I7/` |
| A2 copilot nudge belongs to its chat | `b30b8ac` (A2) | green | fixed | `v24-acc-I3` 2/2; new `v24-pf-A2-nudge-leftover` 2/2 | `A2/` |
| AE-03 fates fixture reads the applied slots | `9178162` | green | fixed | `live-v24-08-fates-jump` 2/2 | `AE-03/` |
| AE-01 curator write edge re-checks ownership | `2368cba` (merge `ac190b4`) | green | fixed | new `v24-pf-curator-switch`: runs 5, 6, 7 pass 14/14 (sha256 `4968679769…`; runs 6–7 hash-recorded, run 5's inferred from mtimes). Runs 1–4 superseded: 1–2 hit a 50 s memory-model timeout, 3–4 were fixture false positives (below). New `v24-pf-curator-same-chat` 2/2, 11/11 (`0710199804…`) | `AE-01/` (`runs.jsonl`, `fixture-sha.jsonl`) |
| AE04-L1 lore cache only owned and answered selections | `74867d5` (merge `70b8eed`) | green | fixed | new `v24-pf-AE04-lore-cancel` 2/2 (`3ab3258ad368…`) | `AE04-L1/` |
| AE04-S1 scene tracker marked injected only on an ok write | `74867d5` (merge `70b8eed`) | green | fixed | new `v24-pf-AE04-scene-refused`: run 1 red on a fixture defect, fixture fixed (`fec33969…` → `f9c6af66a0a4…`), series restarted; runs 2–3 pass | `AE04-S1/` |
| J3 | none specific (the matrix reds were E1 and a J3.7 model leg; A6/A11 `efbe189` are on the bundle) | green | fixed (lane call, see notes) | 8/8, 8/8, first try 8/8 each, cleanup clean | `J3/run{1,2}/` |
| J11 (A8 scene-judge burst) | `9524384` (A8/A10) | green | fixed (attribution uncertain) | 26/26, 26/26, all first try; scene-judge timeouts 0/28 (16 + 12) vs 18/48 in the matrix | `J11/run{1,2}/`, `J11/judge-ring-combined.json` |
| J12 | `9524384` (A10) on the bundle, not isolated by this run | green | n/a | 5/5, 5/5, first try, group `1789797226071` | `J12/run{1,2}/` |
| J7 (A5 evidence label) | `2702435` (D1/D3 = A5/A7) | **red** | **not-fixed** | run 1 6/8 (J7.4, J7.5), run 2 7/8 (J7.5); no third run, since it could not produce ×2 | `J7/run{1,2}/`, `J7/diagnosis.json` |
| LS live suite | — | green | n/a | deltas 22/22, facts 16/22 = 0.727 (≥ 0.68), rejected 15/15 (≥ 0.9), both runs, 22 of 22 ran | `LS/run{1,2}/` |
| P03 memorize (A11 retry) | `efbe189` (A11) | green | inconclusive | `live-v24-03-memorize` 2/2 (978 s, 787 s); `timeoutRetries []` in both, so the retry path never ran. Fixture change: `P03/fixture-change-live-v24-03-memorize.diff` | `P03/` |
| P03 breaker (A6 probe) | `efbe189` (A6) | green | inconclusive | `live-v24-03-breaker` 2/2; the backoff probe closed the breaker after restore (resume 12 951 / 13 266 ms), but the backend answered fast (probe 880 ms), so the "slow but answering closes it" path never ran | `P03/` |

Totals: 14 rows, 13 green and 1 red (J7). fixVerdict: 9 fixed, 1 not-fixed, 2 inconclusive, 2 n/a. J3 is counted as
fixed on the lane's call.

**Notes on the verdicts.**
- **The AE-01 fixture edit makes the check sharper, not weaker.** Run 3 failed at step 9 because chat B gained a blob
  (`hasBlob` false → true). The blob is B's own empty runtime blob, `{chatId: B, selectedStoryId: null, stories: []}`.
  The check now fails only on a blob that names another chat, has a selected story, or holds any stories. Run 4 failed at step 11 on an
  absolute `curatorJournal: 1`: A's own "applied" line, still in the in-memory journal while no-story B is open. The check
  now compares after with before, so a leaked revert (1 → 2) is still caught. Minor observation, not a defect: the
  in-memory journal keeps A's line while B is open, and nothing reaches B's file.
- **J3 "fixed" is the lane's call.** No commit targets J3's matrix reds (E1 timeout, J3.7 no FACT line). What this run
  shows is J3 green ×2 on a less contended backend, on a bundle that carries A6/A11. It is not evidence that a J3 fix works.
- **J11/A8 attribution.** Judge latency was much lower overall this time (p50 about 285 ms vs 628 ms in the matrix J11
  run 1), so lower load may explain part of the 0 timeouts. The one director timeout per run is J11.4's intentional 1 ms budget.
- **AE04 would fail on the frozen code.** At `4ebe1db` the lore cache was written unconditionally, and the scene tracker set
  `injected` before the write, ignored the result and journaled nothing. Each fixture's DEFECT branch names that behaviour.
  Each fixture also restores the judge settings itself and asserts the restore.

**New defects found** (numbering continues the findings register).

| Id | Row | Symptom (measured) | Cause | Status |
|---|---|---|---|---|
| A35 | J7 | "evidence not in window" rejected 15 quotes in run 1 and 28 in run 2. Replayed through the shipped `evidenceSources`, none matches as written. Once markdown `*` is removed, 14/15 and 23/28 match a message inside the window. J7.5 run 2 fails on this alone: `chamber_entered=true` was rejected at 23:37:00 (window 32-39, quote in message 38) and at 23:37:19 (window 39-41, quote in message 39). Both 300 s checkpoint waits then timed out, and the reconcile read accepted it at 23:51:24, after the check had failed | `normalizeEvidenceText` (`src/extraction/evidence.ts:17-23`) strips quotes, `.!?,;:()[]{}` and dashes, but not `*` or `_`. ST narration is `*italic*`, so a message's edge word is `*the` or `area*`, and a quote that starts or ends at an emphasis boundary never matches whole words. The D1 label fix (`2702435`) holds: label-prefixed quotes also resolve once `*` is gone. The remaining quotes really are outside the window: the checkpoint objective text ×2 and three quotes stitched across messages | open, high. It is why A5 is `not-fixed` in practice. `J7/diagnosis.json`, `J7/run{1,2}/evidence-replay-markdown-stars.txt`, `J7/evidence_replay.ts` (to run it, put a copy of `evidence.ts` beside it with `PLAYER_MARK` inlined) |
| A36 | J7 | `chamber_entered value="true"` and `guardian_respect value="1"` rejected as "invalid value" (run 1, 20:22:23) | `src/extraction/parse.ts:133-136`: a quoted bool or int parses as a string. The D3 tolerance (`2702435`) covers enums only | open, low. `J7/diagnosis.json` (`secondary`) |

J7.4 in run 1 did not fail on the riddle. `riddle_answer=moon` was accepted at 20:22:23, and cp-4a → cp-4a1 fired at 20:38:32.
The check failed its 600 s drain wait (queue depth 2, one read in flight). Between 20:18 and 20:37 the memory model timed
out repeatedly, with three lanes on one backend (E1, `J7/run1/backend-metrics.log`). J7.5 in run 1 hit the same drain
timeout, and A35 also rejected it at 21:02.

**Harness and fixture changes in this session** (uncommitted). New scenarios under `test/scenarios/`:
`v24-pf-A2-nudge-leftover.json`; `v24-pf-curator-switch.json` and `v24-pf-curator-same-chat.json` (AE-01, with the run 3
and run 4 corrections above); `v24-pf-AE04-lore-cancel.json`; and `v24-pf-AE04-scene-refused.json` (`detail`
JSON-stringified after run 1). Changed: `test/scenarios/live-v24-03-memorize.json`. For A11, one same-prompt retry after
a timeout now counts as `timeoutRetries`, not as a failure or an extra pass, and the backlog wait went from 25 to 40 min.
Lane drivers are archived under the root: `run-scenario.sh`, `journey-pf.sh`, `journey-pf-lane2.sh`,
`lane3-batch/ae04-drive.sh`, `lane3-batch/pf-drive.sh`. No product code changed.

**Still open after these checks.**
- **J7 stays red** on A35 (and A36). A5's label half is fixed, but the evidence check still rejects real quotes.
- **A6 and A11 are inconclusive live.** Both P03 fixtures are green, but neither run slowed the backend enough to take the
  new path. Proving them needs a recipe with a throttled or queued backend.
- **J11/A8** is green, but on a quieter backend. A re-run under contention would separate the fix from the load.
- **Unchanged by this session:** I1 (live replay-equality), P05 (structural, A34), CL (no metered director/lore sample),
  CH (storybook), R1 and the human sessions. A3 (an in-flight generation lands in the next chat) and A4 have no fix. A10
  has a fix on the bundle that no run isolates.
- **The attested verdict is still the frozen candidate's.** Re-attesting v2.4 needs a new frozen candidate carrying these
  fixes and a full matrix on it. These rows are post-freeze evidence, not an attestation.

### J7 after the A35 fix (2026-09-26, master 7034eec, bundle e080b9749436, lane 2)

A35 (`normalizeEvidenceText` kept markdown `*`/`_`, `5e9f95d`) was the cause of the post-freeze J7 red. J7 `--strict`, same fixture, two consecutive runs: **8/8 pass, cleanup clean, both runs** (`test/journeys/records/v2.4-postfreeze/e080b9749436/J7/run{1,2}/`). J7: **green ×2, fixVerdict fixed**. This build also carries v2.5 plan 11 (legacy removal), which J7 does not exercise beyond a fresh sandbox chat. With it, every post-freeze row is green; A6/A11 stay "green, trigger not exercised" (v2.5 plan 02 arms), A36 goes to v2.5 plan 05 (an explicit no-coercion control makes it a decision, not a defect).
