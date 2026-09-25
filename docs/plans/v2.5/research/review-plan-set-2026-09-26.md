# v2.5 plan-set review — 2026-09-26

Review of plans 00–13 (drafts dated 2026-09-25) against master `e7626d7`, the ST host tree (1.19.0) and the v2.4 records.
Every finding below was verified against the plan text and the source before it was applied. The table lists the verdict
and the edit that landed. Where the verifier corrected the proposed edit, the corrected edit is the one applied. The
rejected findings are listed after the table, with their reasons, so the review can be audited.

Counts: **81 confirmed** (1 blocker, 46 major, 34 minor), **3 rejected**. Scripts: `.debug/v25lib.py` + `.debug/v25r<nn>.py`.
Docs only; `src/` and `docs/plans/v2.4` untouched.

## Confirmed and applied

| # | Finding | Severity | Verdict reason | Edit applied (file: section) |
|---|---|---|---|---|
| 1 | ACCEPTED ("production ready") reachable with signed-off non-critical deferrals; S1 non-critical | blocker | 10:245/235/248 let any non-critical row sit in `deferred`; S1 deferral ships legacy code, violating hard rules 1 and 2; overview §10 said the same | 10: Goal, Verdict rules, Attestation `deferred.length > 0`, gate-table preamble, S1 **yes**; 00: §10 Acceptance |
| 2 | Model-leg 3/4 exception loosens ×2; U10 and Q1 list different rows | major | U10 named J7 only, plan 10 J7 + J3.7; verdict already counted model legs toward ACCEPTED before Q1 was answered | 10: ×2 table (default none), J7 row, Verdict, Risks; 00: U10 (default ×2) |
| 3 | Matrix rows ×1/"a log" vs "every row green ×2"; SK/CX/TK non-critical vs ck-H2 | major | RP log row could block ACCEPTED; CL/H5 had no predicate; SK deferral broke ck-H2. J7f ×1 left to plan 01 G4/U1 | 10: new "Row predicate" (`×2 series` / `one-shot` / `recorded`), Runs column per row, ck-H2 |
| 4 | REF-2.5 = shipped default (`file`) but every journey in scan mode; no normalise step | major | `settingsStore.ts:36` default `file`; no scripted confirm on lanes. J7f ×1 kept (plan 01 G4) | 10: Entry 5 (REF-2.5-default / REF-2.5-scan), Environment Seeding, J7f/J3f row |
| 5 | Seven v2.4 residue items routed to 02 but absent there; 03 waits on a non-existent 02 item | major | `writeAhead` has no hydrate reader (`stagecraftCoordinator.ts:356-364`); residue rows are conditional on a v2.4 deferral | 02: C10 (unconditional), C11–C13 (conditional), AE-03 in C8, C5 condition line |
| 6 | C1 describes the post-await check and matrix correction as future work; both on master (`644aa05`) | major | `effectsApplier.ts:383-385` has the check; `faultMatrix` `effects\|aborted` is `partial` | 02: C1 verified rows, Consequence, Design 1/3, Tests; 00: rule 13 (historical) |
| 7 | H-a, H-g, H-j owned by nobody (A3 harness half routed in a circle) | major | 03→02→10, plan 10 is "gate"; `seriesVerdict` unchanged. H-h already owned by 13, H-b–f by 03, H-i by 12 | 10: Kind line, entry-3 owners, **Phase 0 harness** (+ H-k); 02: C6; 03: Out; 00: seeds A3 row |
| 8 | Entry criterion 1 circular with 06 J2 and 07 A3 | major | A3 gates its own UI so needs pre-freeze runs; J2 is a pure measurement that can close in plan 10 | 10: entry 1 carve-out, new J2 matrix row; 07: A3 correctness check on own J3/J7 ×2; 06: Order step 3 |
| 9 | HU on frozen candidate gates changes that would force a re-freeze | minor | Only C7 and D6/T22 affected; rule-7 items already out of scope (overview) | 10: §Human sessions note; 02: C7 fallback |
| 10 | C4 closes 1.18.0 rows via a non-existent "clean-host-older run" | minor | V10 Q4 makes the minimum latest stable; CH runs static gates only | 02: C4 `01-H10/01-H13` row |
| 11 | Plan 01 still carries downgrade/v2.4-reader reasoning | minor | Rule 9 / E9; the "v2.4 sanitizer" is the current `sanitizeWorldInfoSettings`, which must be extended | 01: S4 row, Mode-flag note, Provider-scope note, §B ledger, step 1 test |
| 12 | P02 lists A5/A7, A6/A11, A8/A10 under 02 at ×2; C5 is ×5 | minor | 02 C8 routes them to 05 F0 / 06 J2; no new P05 row needed; overview :306 already correct | 10: P02 row (run counts split), P04–P09; 05: F0 ownership sentence |
| 13 | Dead `Memory Local` profile fails PONG; entry 6 cannot pass | minor | Seeding copies it into every lane; fix on the clone only | 10: Environment Seeding (PONG + repoint on clone, `profiles.urls`) |
| 14 | CX1 cites a journal string as pipeline text | minor | `pipeline.text` is `TRANSPORT_PLAYER_TEXT`; detail is the breaker's last failure, not "reads held" | 10: CX1 pass |
| 15 | Plan 02 header omits the plan 11 dependency | minor | overview sequence: 02 depends on 11 (plan 01 header has the same, not in scope) | 02: header |
| 16 | S6 guard met by name; coordinators reach STAPI through helpers | major | memoryInjector, consolidationMatches, entryTokens, roster import STAPI; stagecraft→client closes via D1 | 03: D2 guard (transitive walker), host table, done criterion; Tests S6 |
| 17 | D3's new runtime units escape every coordinator guard | major | Budget/cross-import guards scan `coordinators/` only; no blanket runtime ban (host effects live there) | 03: D3 `DELEGATED_UNITS` + two guards; Tests "D3 units" row |
| 18 | Step 4 waits on a plan 02 write-ahead item nobody owned | major | Confirmed; fixed by adding 02 C10 (overview routing kept) | 02: C10; 03: Out line |
| 19 | D0 commits every guard red; master red through steps 2–6 | major | Step 2 gate "full jest" contradicts red guards | 03: D0 ratchet rule, step 1/6 gates, Tests S2 |
| 20 | S1 guard committed red with 115 hits vs "each step lands green" | major | 115 hits in 21 files re-measured; baseline keyed by file+text, not line | 11: Step 0 (green baseline), Tests row |
| 21 | S1 guard scans only `src/`; H19–H21 live in scripts/test | major | Twin guard over scripts+test; `scripts/review/**` excluded as history | 11: Step 0 twin guard, Source row, Goal, Step 8 H21, Tests |
| 22 | A7 `availableStoryId` forks every re-import | major | `storyLibrary.ts:96-103` suffixes taken slugs; contradicts Risk + Q5 | 11: Step 6 A7 + red test; Tests row |
| 23 | Optional-field list inherited, no sweep; `storyStart?` missing | minor | `storyStart` confirmed; `integrity` legitimately optional (host may omit) | 11: Goal bullet, Step 0 sweep |
| 24 | Foreign `schema` stamp branch is downgrade tolerance | minor | No writer stamps today; rule 9 covers it; M6 kept | 11: Step 4 `stampSchema`, tests |
| 25 | C1 allowlist keyed by file:line breaks after plan 03 | minor | Plan 03 comment/line work moves the lines | 11: Step 0 allowlist (file + text + count) |
| 26 | I1/I2 "moved to plan 03" but plan 03 has no intake | minor | Not a D2 row (EffectsApplier is not a coordinator) | 03: Sources, In scope, new **D10**, step 6; 11: Step 7 |
| 27 | A6 live gate cannot fail on the A6 regression | major | Dead-then-idle arm closes with a fixed 10 s probe too; header said uncontended | 05: F0 A6 row (slow arm + mutant control), E1 exception note |
| 28 | A11 gate passes with no timeout | major | Step-15 eval never requires `timeoutRetries`; needs a new debug budget scale | 05: F0 A11 row (forced-timeout arm, control, build item) |
| 29 | F1a leaves `provenance.messageId` at `window.to` | minor | Drawer label diverges; quarantine keys on `entry.messageId` already | 05: F1a Budget, red test |
| 30 | F8 claims `callExtractionReply` path exists for authoring | minor | `runAuthoringStage` uses `callExtractionModel`; overlaps plan 03 D1 | 05: F8 scope + sequencing |
| 31 | A5 gate vacuous and over-strict | minor | Other-line/bare labels are correct rejections by D1 | 05: F0 A5 row |
| 32 | F0 ownership conditional | minor | 02 C8 routes to F0; no separate P05 row | 05: F0 sentence, Unresolved Q removed |
| 33 | Budget reservation omits plan 05 | minor | F3 ≤ 8 lines real; F1a net 0 | 03: D3 reservation; 05: Risks |
| 34 | English red case already passes (Jaccard 0.8) | major | `similarity.ts` whitespace split; `dup` band holds it today | 04: Tests red-first |
| 35 | K0 band assignment moves after floors are declared; no in-band `agrees` rows | major | Floors read a mode-dependent, bundle-dependent denominator | 04: K0 frozen assignment paragraph, J1 floor |
| 36 | J8.5 compares held counts across runs | minor | Different paraphrases per run (v2.4 J8.5) | 04: Live gates J8.5 row |
| 37 | J1 releases through the author Dismiss path | minor | `commitDecision` sets/clears the author refusal; token minted after the await | 04: J1 What |
| 38 | J2 closes on ≥ 100 warden calls with no sizing | major | ~0.5 calls/boundary; plan 10 unsized | 06: J2 close + Else; 10: JM sizing, J2 row |
| 39 | CAL ×1 vs J1's ×2 protocol | major | Plan 06 owns the protocol | 10: CAL row ×2 |
| 40 | J6c says A7 must be fixed; it is fixed | minor | `c64c540`; what is owed is 05's live check | 06: J6 Phase 0, Order step 4 |
| 41 | `judge.shadowTyped` outside `judge.uses`; J6b keyless | minor | `settings.ts` is the only default/sanitize path; bundle loses all families on one timeout | 06: J6 Key row |
| 42 | Authoring-es fix scored on the fixture that chose it | minor | 8-row es slice; a16 alone flips the verdict | 06: J1 authoring Gate (hold-out) |
| 43 | Gate replay reads `after.blackboard` (post-progress) | major | `engine.ts:229-250` applies progress before serialize; manual entries have no evaluation | 07: A3 core (`evaluated` field), semantics, Tests, Mutants |
| 44 | A3 correctness input (engine history) never archived | major | No journey record holds engine history | 10: H-k; 07: A3 correctness check |
| 45 | `unknown` for declared-but-unset qualities | minor | `gates.ts:5` evaluates unset as false | 07: A3 core (in #43's edit) |
| 46 | A4 IN_PROMPT ±2 % is vacuous; SO double-counted | major | `extensionPrompts.ts:5` IN_CHAT only | 07: A4 UI row, live gate A4 |
| 47 | A1 gated on a rubric row that exists nowhere | major | Neither v2.4 nor v2.5 rubric has it | 07: A1 gate; 10: Human sessions (row wording) |
| 48 | `macros.register` "owed"; live-flag gating needs reload | minor | Static binding (`macro-system.js:57`); engine chosen per substitution | 07: A2 Seam, Legacy engine, Host facts |
| 49 | A5 asks 13 for a `callId` 13 already commits to | minor | 13:206; real gap is who stamps audits | 07: A5 row 3, Unresolved Q |
| 50 | L5 suppression breaks timed effects and churns vectors | major | Hash after ENTRIES_LOADED; vectors deletes absent hashes | 08: L5 bullets, X5, X6 |
| 51 | L5 enabled by a story flag, not an install-wide judge opt-in | major | Every usage its own install-wide opt-in; no new privacy row | 08: L5 (`judge.uses.loreExclusive`), D4, G-L5 column |
| 52 | L1 reuses a guard that requires `ready` | major | Mirror lost when requirements unmet; file mode scans it | 08: L1 guard, U7 |
| 53 | L2 chat-bound source collides with the file-mode mirror slot | major | `bindChatLorebook` refuses occupied; mirror binds only on adoption | 08: L2 file-mode bullet, G-L2 legs |
| 54 | L7 grows the combined warden request without regression or J2 bar | major | `continuity.ts:67` drops all families on one failure | 08: R4, R5, R6 rows, Order step 7; 06: J2 note |
| 55 | Model-dependent gates run once; L6 "unmeasurable" passes | major | Plan 10 P08 needs a built book ×2 | 08: G-L1/L5/L6; 10: P04–P09 |
| 56 | L1/L5 undefined if plan 01 ships no scan mode | minor | Plan 01 Q1 "no" stops at step 2 | 08: header, Order step 4 |
| 57 | L7 no over-steer probe; L5 schema lacks storyDiff/diagnostic | minor | storyDiff row exists (reword); new diagnostic code needed | 08: L5 schema bullet, R6 |
| 58 | Codex argv loads user config and MCP servers | major | `~/.codex/config.toml` defines a Playwright MCP | 13: rule 3 Codex argv; P0 H-N1b; 12: PS-H 3 |
| 59 | P0-2 cannot fail at user level | major | No user-level instruction files on this box; control arm needed | 13: host-fact qualifier, P0-2, gate line |
| 60 | PS-H 5 writes canaries into the real home | major | Lanes are data roots, not OS users | 12: PS-H 5 (throwaway config homes); 13: Q7 |
| 61 | Claude `system` in argv from a request field | major | Rule 2 vs rule 3 contradiction; opencode env too | 13: rules 2, 3, 7 (`MAX_SYSTEM_CHARS`); 12: PS-H 1, 2 |
| 62 | Admin check reads `request.user.admin` (undefined) | major | `request.user = {profile, directories}` | 13: host fact, rule 9; 12: PS-H 10 |
| 63 | `text/plain` makes routes CORS-simple; JSON bodies parsed by ST first | major | CSRF can be off; `DEFAULT_USER.admin` true | 13: rule 7; 12: PS-J 2, 6, PS-H 8 |
| 64 | One call per user per harness collides with two lanes; kinds unmapped | major | Scheduler runs two lanes; `malformed`/`refused` absent from `ModelFailureKind` | 13: rules 6, 7, H3 kinds, Tests; 12: PS-H 7 |
| 65 | P1 harness egress/residue measured by nobody | major | Phase 0/A have no network or home-dir row | 13: P0-7; 12: P1 row, EG, harness uninstall inventory |
| 66 | Env allowlist strips proxy/CA/telemetry opt-outs | minor | Failure mostly loud, not silent bypass | 13: rule 5, rule 10, owed facts |
| 67 | Prod and dev builds share `dist/` | major | Gate order runs prod checks on the dev bundle | 12: R two builds, R6, allowlist Never; 10: Environment, Attestation |
| 68 | `111.index.js` is the live dagre chunk, not stale | major | `index.js` calls `.e(111)`; SM never opened the Studio | 12: Verified row, allowlist, SM 3b, F1 check |
| 69 | Version compiled in; rc builds never the release bytes; tag check on every build | major | `index.tsx:4,36`; `clean-host.sh` sed breaks rc suffixes | 12: R4, R-t split, UP |
| 70 | Route A force-push breaks ST's `git pull` updates | major | Depth-1 clone + pull; UP would catch it, construction rule missing | 12: Distribution Route A, UP |
| 71 | Repo-move script list promised but absent | major | Seven derivation sites; `manifest.test.mjs` already guards nulls | 12: P3, Risks |
| 72 | PASS spike code stays in the frozen prod graph | major | T13 precedent; D3 list did not cover spikes | 09: rule 2; 12: D3; 10: P04–P09, D3 row |
| 73 | Rule 1 measures live conditions once | major | Plan 10 P09 ×2; unmarked live rows in SP4/5/6/8/9 | 09: rule 1 |
| 74 | Spike FAIL has no green in plan 10; SP1 S4 circular with HU | major | SP6 claim wrong (K1–K5 need no session) | 10: P04–P09 (P09 green); 09: Q4 |
| 75 | A3 decides below its own sample floor | minor | Rule 1 "never retuned" | 09: SP3 A3 row |
| 76 | NPC roll is not the only unseeded chance | minor | `talkControl.ts:214` passes no `random` | 09: SP7 Verified rows, D4b |
| 77 | Report column "1.18.0 note" vs V10 | minor | Minimum is latest stable | 09: rule 3 |
| 78 | `npm sbom --omit=dev` does not describe the bundle | minor | `yaml` unused; loader runtimes bundled; examples lack provenance | 12: LI |
| 79 | Shipped manifest leaks `host.root` | minor | `dirty` half rejected (package step refuses dirty) | 12: R6 design + check |
| 80 | SM plays sun-ruins without its requirements | minor | Needs 4 cards, a group, global lorebook | 12: SM 2b, 3, cleanup |
| 81 | CAL ×1 vs H2 ×2 for the same measurement | minor | Profile routes in CAL, harness routes in H2 | 10: CAL row (merged with #39) |

## Blocker and major findings, one line each

- **#1 (blocker)** ACCEPTED now requires `deferred[]` empty. Any deferral gives PARTIAL. S1 is critical, and the overview §10 matches.
- #2 The model-leg exception applies only if the user approves Q1/U10 before the matrix. Otherwise ×2. One row list.
- #3 Every matrix row declares `×2 series`, `one-shot` or `recorded`. ck-H2 reads the predicate. RP, CL and H5 are recorded.
- #4 REF-2.5 splits into default (`file`) and scan configurations. Seeding runs the plan-01 confirm on the lanes.
- #5 Plan 02 gains C10 (curator write-ahead reconcile, unconditional), C11–C13 (conditional residue) and AE-03 in C8.
- #6 C1 is marked done in `644aa05`. Only the conditional stop remains. Rule 13 cites the example as historical.
- #7 Plan 10 gains a Phase 0 harness section (H-a, H-g, H-j, H-k) with its own gate record. The 02/03/00 routing now points at it.
- #8 06 J2 closes as a plan-10 matrix row, carved out of entry 1. 07 A3 runs its own pre-freeze J3/J7 ×2.
- #16 S6 becomes a transitive value-import guard. Host interfaces are added for memoryInjector, consolidationMatches, entryTokens and roster.
- #17 A `DELEGATED_UNITS` list gets its own no-STAPI and type-only cross-import guards, with controls.
- #18 The write-ahead dependency is resolved by 02 C10.
- #19 D0 guards land as shrinking ratchets, so `npm test` stays green on every commit.
- #20 The S1 guard lands green with a file+text baseline that only shrinks and must be empty by step 8.
- #21 A twin S1 guard covers scripts/ and test/, with kept history excluded.
- #22 An id-less import keys by the plain title slug and updates on re-import. The fork is gone.
- #27 A6 gets a slow-backend arm plus a fixed-10 s mutant as its negative control.
- #28 A11 gets a forced-timeout arm through a new default-inert debug budget scale, plus a mutant control.
- #34 The red case is replaced with a pair measured below 0.4 Jaccard, asserted in-test.
- #35 K0 band assignment is frozen with the fixture. Per-mode counts are fixed, with ≥ 5 in-band `agrees` rows per mode.
- #38 J2 below 100 warden calls is "unmeasured", not closed. Plan 10 JM is sized to reach 100.
- #39 CAL runs ×2 consecutive under plan 06's protocol.
- #43 Gate replay reads a new `evaluated` blackboard (before progress) and skips manual entries.
- #44 A new harness item H-k archives engine history per journey check.
- #46 A4 drops the vacuous IN_PROMPT bound. SO is shown inside chat history and never summed.
- #47 The A1 rubric row is written into plan 10's Author session. Without it, A1 is not built.
- #50 L5 never suppresses timed-effect entries and never adds a disable key. It is scoped to the main scan. X5 and X6 are added.
- #51 L5 needs the install-wide `judge.uses.loreExclusive` as well as the story flag.
- #52 The L1 mirror append drops the `ready` requirement. U7 is added.
- #53 In file mode, the chat-slot source counts only when the slot is not the mirror. The conflict is named in the author view, with G-L2 legs.
- #54 L7 adds a combined-request regression (R5), the J2 timeout bar and an over-steer probe, and runs after J2.
- #55 G-L1/L5/L6 run ×2. P08 is green only when a mirror book was built in both runs.
- #58 The Codex argv gains `--ignore-user-config`. H-N1b plants an MCP canary.
- #59 P0-2 covers user-level canaries in throwaway config homes, with a control arm.
- #60 PS-H 5 uses throwaway per-CLI config homes and never touches the real home.
- #61 `system` is passed by file, never through argv or env, with `MAX_SYSTEM_CHARS`. PS-H 1/2 vary `system`.
- #62 The admin check is now `request.user.profile.admin`, with single-user and non-admin cases.
- #63 Both plugins require a custom header and a same-origin check. JSON bodies are refused after ST's parse. A CSRF-off lane row is added.
- #64 Single-flight is per role, and queuing replaces refusal. The deadline starts at dequeue. `malformed`/`refused` kinds are defined.
- #65 New P0-7 measures hosts contacted and home/app-data residue per CLI version. P1, EG and the uninstall inventory point at it.
- #67 Prod builds to `dist/`, dev to `dist-dev/`. `test:release` names the flavour and refuses a dev manifest in `dist/`.
- #68 `111.index.js` is the live chunk. The allowlist comes from the manifest file list. SM opens the Studio graph.
- #69 The candidate is built at `2.5.0` and tagged on that commit. The tag check runs in release mode only. The rc parse is fixed.
- #70 Route A release commits are fast-forward only, and the packaging step refuses anything else. UP uses ST's update control.
- #71 The seven root-deriving script sites are listed. Each requires `ST_ROOT`/`ST_PUBLIC` explicitly.
- #72 Spike code that is not built under an approved build plan leaves the prod graph at the freeze. It is on the D3 list.
- #73 Every live or model-dependent spike condition runs ×2 consecutive, and its control arm runs in the same series.
- #74 P09 is green when the verdict is recorded and FAIL code is removed. SP1 leaves the 2.5 pick list.

## Rejected

| Finding | Claim | Reason |
|---|---|---|
| 10 RP ("a log, not a gate") | RP demotes open v2.3 L1 / R1 by redefinition, a deferral under hard rule 2 | The replay was never a gate. v2.4 defined R1 as recorded, not scored (`v2.4/09-acceptance.md:90`), and v2.3 described it the same way. Plan 10 only renamed it RP. The human half of v2.3 L1 is ck-H1, which is critical, so an unrun session already blocks the label. The row is now explicitly `recorded` (finding #3) |
| 03 T4 eslint 8 deferral | Planning a T4 deferral conflicts with "no label by deferral" | Plan 03 only asks the user (Q2) and forbids loosening T2. After finding #1, any deferral makes the verdict PARTIAL, so the question stays valid and cannot produce ACCEPTED |
| 05 F1a duplicates on re-read | Keeping a fact through a rollback of `window.to` makes the re-read duplicate it | Overlapping cadence windows (8 messages, overlap 7) already re-read the same message today. Known facts are in the prompt (canon-lite) and P4 dedups within a tier. F1a adds no new duplication class, so any concern belongs to a general dedup finding |
