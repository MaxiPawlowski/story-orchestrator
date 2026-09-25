# Codex review, 2026-09-25 (gpt-6-astra: test evidence; gpt-6-sol: forward plans)

Run read-only with `codex exec -s read-only`, reasoning effort high, on master `4ebe1db` while the v2.4 acceptance matrix was running. Prompts: `C:\dev\so-lanes\reviews\{astra,sol}-prompt.md`.

## Verification by the main session (2026-09-25)

Every finding below was checked against the source before any plan changed.

| ID | Verified | Where it went |
|---|---|---|
| AE-01 curator writes after awaits without an ownership re-check | yes (`stagecraftCoordinator.ts` `writeOp` awaits the read and `beforeHostWrite`, then writes; `revertAppliedSince` awaits the read, then `restoreBefore`) | fix in a worktree; live check after the matrix |
| AE-02 plan 03 / E3 final pairs lack run headers | yes (`03-off-path-call-hygiene.md` says the re-runs were not wrapped) | re-run with headers in v2.4 acceptance row P03 |
| AE-03 fates check recomputes | yes (`live-v24-08-fates-jump.json` calls `getMemoryInjectionBlocks()`) | fixture fix in a worktree; live x2 later |
| AE-04 fault-matrix citations do not inject the fault | yes, all three examples | fix + sweep in a worktree; plan 03 |
| AE-05 v2.3 L7 carry-ins never instantiated | yes (`09-acceptance.md:29` promises `C*` rows; none exist) | v2.5 plan 10; v2.4 plan 09 records it |
| PR-19 attestation "twice" = any two runs | yes (`attestation.test.mjs` `greenTwice`) | fix in a worktree before the attestation step |
| PR-20 no `test:plugin`, two human-score paths | yes (`09-acceptance.md:30-31`, `:75` vs `:99`) | same worktree |
| PR-08 delete vs move | yes (`legacy-inventory.md` step 8 vs V10) | legacy-inventory corrected |
| PR-10 downgrade reasoning in plan 01 | yes (W1/W3) | plan 01 corrected |
| PR-05 plugin forwards any model | yes (`index.mjs:151`) | v2.5 plan 12 |
| PR-01..04, 06, 07, 09, 11..18 | read and accepted as plan gaps | v2.5 plans 01, 03, 10, 12 |

---

## Astra report

**Audit result: five verified findings—one high, four medium.** Inspection was read-only against HEAD `4ebe1db` and the working files. No tests, builds, servers, or browsers were run. The incomplete `test/journeys/records/v2.4-acceptance/` directory was excluded.

**AE-01 — High — “Checked” ownership rows miss awaits before shared-lorebook writes**

**Claim.** The ownership census classifies `StagecraftCoordinator.applyAccepted` and `revertAppliedSince` as `checked`. Its `writeOp` explanation says:

> “its caller checks the token before every call, so a lapse prevents the write from starting.”

Evidence: [ownership-sites.json:232](test/findings/ownership-sites.json:232).

**Contradicting evidence.** In [stagecraftCoordinator.ts:311](src/runtime/coordinators/stagecraftCoordinator.ts:311), the caller checks ownership before `writeOp`. Inside that helper, the sequence is:

```ts
const live = ... await readWIEntryAt(...) ...; // line 339
await beforeHostWrite(pending);               // line 349
const written = await updateWIEntryByUid(...);// line 351
```

Neither intervening await is followed by an ownership check. The inverse path similarly checks at line 379, awaits the entry read at line 388, then calls `restoreBefore` at line 397 without rechecking.

The ownership test at [stagecraftCoordinator.test.ts:440](src/runtime/coordinators/stagecraftCoordinator.test.ts:440) deliberately switches chats **inside the completed write mock**:

> “The chat moves AFTER the first write lands”

**Why it does not hold.** That test proves that subsequent operations stop. It does not exercise a switch during the entry read or write-ahead save, before the first host write begins. Static inspection shows those continuations can reach a shared-file write after ownership lapses. This is the census’s documented blind spot, still present in current code.

**Close it.** Add deferred-read and deferred-save tests for application and rollback. Switch chat/story during each await; assert zero subsequent host writes and no foreign-state journal/proposal updates. Include same-world controls and mutants removing each new check. Then run the corresponding live race twice with real curator proposals.

---

**AE-02 — Medium — Final plan-03 and E3 green pairs lack bundle attestation**

**Claim.** [Plan 03:1184](docs/plans/v2.4/03-off-path-call-hygiene.md:1184):

> “plan 03 live gates green ×2”

The table assigns the final runs to `100696d1d4a0`, except memorize to `27d0f711bf9b`. Plan 02’s E3 rerun likewise claims green ×2 on `100696d1d4a0`.

**Evidence.** The cited archives exist and contain successful run pairs:

- `test/journeys/records/v2.4-plan03/final-100696d1d4a0/`
- `test/journeys/records/v2.4-plan03/rerun-fixes/`
- `test/journeys/records/v2.4-plan02/followups-100696d1d4a0/`

However, [Plan 03:1199](docs/plans/v2.4/03-off-path-call-hygiene.md:1199) explicitly records:

> “These re-run batches were not wrapped in `so-run-header capture`/`diff`.”

The final batch JSON records `repeat: 2`, run numbers and successful exit codes, but no served-bundle hash. Earlier plan-03 headers identify `9b70d79e3b2a`.

**Why it does not hold.** The archives support successful repeated execution. They cannot independently establish that those executions used the claimed bundle or unchanged configuration. Directory names and earlier-build headers do not supply that evidence. This is missing provenance, not proof that the wrong bundle ran.

**Close it.** Rerun these gates twice on the acceptance candidate, archiving lane-specific before/after headers, served hashes and run records. A header captured now cannot retroactively attest the older runs.

---

**AE-03 — Medium — Plan-08 fate validation checks recomputation, not applied memory**

**Claim.** [Plan 08:507](docs/plans/v2.4/08-author-observability.md:507) signs off the fate/jump scenario:

> “green x2”  
> “injected rows are a subset of the blocks”

The design expressly warns at line 179:

> “a recomputation agrees only by luck”

**Evidence.** [live-v24-08-fates-jump.json:54](test/scenarios/live-v24-08-fates-jump.json:54) obtains its supposed injection evidence using:

```js
const blocks = rt.getMemoryInjectionBlocks();
```

That delegates through `runtimeManager.ts:631` and `memoryCoordinator.ts:464` to [memoryInjector.ts:128](src/runtime/memoryInjector.ts:128):

```ts
return buildMemoryInjectionBlocks(entries, activeSpeakerId(story), this.options());
```

It does not read the applied extension-prompt slots or captured request. The archived run logs show all observed fates were `injected`; neither run exercised overflow or quarantine.

**Why it does not hold.** Real extraction occurred, but this assertion only establishes consistency with a fresh render. A missing/stale prompt write can remain invisible when recomputation still contains the text. Counting badges by fate also does not establish that each particular row has the correct badge.

The separate preview/capture scenario does inspect real requests; it does not establish the per-entry fate relationship asserted here.

**Close it.** Compare entry IDs and fate badges against applied slots and the next captured request, including different drafted speakers, quarantine and budget overflow. Add a negative control that suppresses an actual prompt-slot write while preserving the stored fate result; the check must fail.

---

**AE-04 — Medium — Fault-matrix citations do not inject their named faults**

**Claim.** [faultMatrix.json:2](test/findings/faultMatrix.json:2) defines `covered` as:

> “a test asserts the designed behaviour for this package under this fault”

Three verified counterexamples:

| Cell | Classification and cited evidence | What the test actually does |
|---|---|---|
| `extraction\|delayedError` | `covered`, matrix line 9 | [scheduler.test.ts:56](src/extraction/scheduler.test.ts:56) only asserts `expect(scheduler.onBoundary(...)).toBeUndefined()`. It injects no delayed rejection; the default profile is `null`. |
| `stagecraft\|duplicateCompletion` | `covered`, matrix line 216 | [stagecraftCoordinator.test.ts:159](src/runtime/coordinators/stagecraftCoordinator.test.ts:159) runs one successful pass, then checks `dueForRun() === false`. It delivers no duplicate completion and does not attempt a second pass. |
| `scene\|beforeHostWrite` | `partial`, matrix line 128 | [sceneCoordinator.test.ts:147](src/runtime/sceneCoordinator.test.ts:147) configures `scene_read: { inject: false }` and expects no injection. The matrix itself admits: “no failure is injected at that write.” |

**Why it does not hold.** These are synchronous-return, cadence and feature-disable checks. They do not demonstrate the named fault handling. `faultMatrix.guard.test.ts` verifies citation existence, not whether the cited test exercises the fault; a green census therefore cannot validate these coverage classifications.

**Close it.** Replace the citations with tests that actually inject delayed rejection, duplicate delivery and write failure—or downgrade the cells. Each fault test needs a successful control and an assertion on resulting state, persistence or payload, not merely a return value.

---

**AE-05 — Medium — v2.3 L7 carry-forward lacks concrete acceptance rows**

**Claim.** The final [v2.3 acceptance record:1013](docs/plans/v2.3/11-acceptance.md:1013) leaves open:

> “The fault matrix live run … the three independent stories, the privacy capture across two stories”

Its closing paragraph says the open rows:

> “are carried into v2.4 plan 09”

**Evidence.** [v2.4 acceptance:29](docs/plans/v2.4/09-acceptance.md:29) promises:

> “joins the matrix as a `C*` row with its original recipe”

But its matrix contains no instantiated `C*` rows for those obligations. The census entry condition requires zero `todo` cells; that is not the live fault-injection recipe. JM’s privacy row per host is not the two-story capture requirement.

[v2.5 overview:213](docs/plans/v2.5/00-overview.md:213) inherits v2.4’s acceptance shape, while its explicit L7 reference at line 240 carries the **human legs**. It does not assign these three remaining recipes.

**Why it does not hold.** There is a general promise of inheritance, but no executable row, assigned plan or explicit disposition for these obligations. Reusing the current matrix can leave them perpetually outside acceptance.

**Close it.** Add separate carry-in rows for live fault injection, three independently authored stories through both routes, and two-story privacy captures. Preserve the original recipes and record either completion or an explicit approved deferral.

**Checks that did not justify additional findings**

- The logged `refuseIncomplete` per-site gap was subsequently closed: `refuseIncomplete.review.test.ts` exists, and `v24-03-wiring.txt` records W17–W19 killed. I found no verified abandoned non-equivalent survivor warranting a separate finding.
- Plan 06 explicitly documents replacing J8 with its curator scenario and using an authored no-note checkpoint as the objective-path substitute. These are recorded deviations, not missing evidence concealed by the report.
- `git log -p` shows a post-measurement FACT-floor change in acceptance policy: **0.85 → an explicit 0.68 override**, derived from the earlier 16/22 result. This is documented and accepted as **X15**, rather than hidden retuning. Both plan-04 reports still score 16/22; their green result supports non-regression only, not achievement of the 0.85 target. The inspected role-calibration floor history did not show a subsequent lowering to erase its reported misses.

Before accepting v2.4 or finalizing v2.5, prioritize:

1. Close the curator application/rollback ownership gaps with tests at every intervening await.
2. Reattest final plan-03 and E3 pairs with archived served-bundle headers.
3. Make fate checks observe applied slots and real requests, with a suppressed-write negative control.
4. Replace fault-matrix classifications unsupported by actual fault injection.
5. Instantiate the missing L7 carry-in recipes as acceptance rows or explicit approved deferrals.

---

## Sol report

# Story Orchestrator roadmap review

**Assessment:** the v2.5 checklist addresses several obvious release gaps: it calls for an installable artifact, first-run and uninstall documentation, privacy disclosure, accessibility checks, and removal of debug globals. Those items should stay. The main problems are that some are documentation-only gates, some cannot be verified with the planned harness, and several release-critical behaviors have no acceptance test.

This is a read-only plan review. I read the requested rules and plans and spot-checked the cited source. I did not run builds, tests, servers, or browsers. Findings below identify **plan gaps or inconsistent acceptance claims**, not unproven product failures.

## Findings

### PR-01 — High — “Production ready” can still pass with release-critical rows deferred

**Evidence.** `docs/plans/v2.5/research/prod-readiness-criteria.md:8-10` defines prod ready as a user being able to “install, run, update and uninstall” from an artifact with “no debug surface.” The same file at `:5-6` says an unmet row is “recorded as a deferral the user signs off.” `docs/plans/v2.5/00-overview.md:216` repeats “every row met or a deferral the user signs off.”

**Addition.** In **plan 10**, distinguish a documented deferral from a production-ready verdict. Make R1–R4, D1–D3, P1–P3, a successful artifact install, and clean uninstall **non-deferrable for the `PRODUCTION READY` label**. A deferred critical row produces `PARTIAL`, as v2.4 plan 09 already does for its acceptance result.

### PR-02 — High — The release-artifact live gate cannot use the existing journey runner

**Evidence.** `docs/plans/v2.5/research/prod-readiness-criteria.md:17` requires installing the release artifact and running “one live journey.” Its D2 row at `:25` removes debug handles from production. Yet `scripts/debug/so-journey.mts:472` reads `globalThis.storyOrchestratorRuntime`, and `test/journeys/j1-first-contact.journey.json:30` requires that handle. `docs/plans/v2.5/00-overview.md:108` says “The harness runs on a dev build.”

**Addition.** In **plans 12 and 10**, define two separate proofs: full instrumented journeys on a dev build, and a **black-box production-artifact smoke journey** driven through ordinary ST UI and observable chat/asset state. Pass only if the artifact-installed bundle completes first run, story selection, a real turn, and restart with zero debug globals. Archive the installed artifact hash and served bundle hash.

### PR-03 — High — The proposed artifact omits the judge installer

**Evidence.** `docs/plans/v2.5/00-overview.md:104-106` allowlists `server-plugin/**` but excludes `scripts/**`. `README.md:55` tells users to run `npm run plugin:install`; `package.json:31` maps that command to `scripts/plugin-install.mjs`. That script’s own usage at `scripts/plugin-install.mjs:5-9` copies the plugin into ST’s `plugins/` directory and requires a restart.

**Addition.** In **plan 12**, specify how an ordinary artifact user installs the optional judge without a source checkout or npm. Include the installer in the artifact if it is the chosen route, or provide a tested manual/plugin-package route. Add an artifact-only test that installs it, enables server plugins, restarts ST, obtains `/status`, and makes one opt-in judge call. Make the optional nature and separate install steps explicit.

### PR-04 — High — The served-tree gate checks one old path, while other sensitive paths remain

**Evidence.** `docs/plans/v2.5/research/prod-readiness-criteria.md:60` defines P3 as a `404` on the old Chromium profile path. `docs/plans/v2.5/00-overview.md:110-113` says `.debug/` still contains “run logs, journals and payload captures, which hold chat text,” and `docs/` and `test/` are still served. `research/code-health-audit.md:194` records HTTP `200` for a `.debug/*.json`, docs, and a source map.

**Addition.** In **plan 12/P3**, move the existing sensitive `.debug` contents as well as changing the default output directory; account for historical files left in the extension folder. Add a served-tree check against representative logs, journals, payload captures, profiles, source maps, and internal docs on both the developer install and the release artifact. Pass when sensitive paths return `404` and the artifact contains only its allowlist.

### PR-05 — High — Judge security coverage stops at key-source disclosure

**Evidence.** P2 at `prod-readiness-criteria.md:59` asks only for a key-scope decision and README text. `server-plugin/story-orchestrator-judge/index.mjs:146-153` accepts a request, resolves a key, and forwards it upstream; `:151` accepts any nonempty requested model. Request size is checked in `validateRequest` at `:106-108`, after a parsed body reaches the handler. The plugin tests at `plugin.test.mjs:64-105` cover forwarding, one invalid body, retry, and timeout, but no concurrent-user or abuse scenario.

**Addition.** In **plan 12**, add a plugin security gate on a real ST route: verify host authentication and CSRF behavior, distinct users’ key isolation, bounded body size before expensive parsing, per-user concurrency/rate limits, and a permitted model list. Run parallel requests from two users plus oversized and repeated calls; pass only if calls cannot consume another user’s key or cause unbounded upstream work. Resolve U7 before this gate.

### PR-06 — High — First run is documentation-only despite a known unconfigured default

**Evidence.** `research/code-health-audit.md:209` says “extraction is enabled with no profile” and the drawer says “not configured.” `prod-readiness-criteria.md:61` asks for a “first-run walkthrough,” verified by “doc review by the user.” `README.md:54` says that without a memory profile “the story does not advance on its own.”

**Addition.** In **plan 12**, add an artifact-installed, fresh-user first-run gate. Start with no memory profile and no judge plugin; verify that the UI names the missing step, offers a working path to configure it, does not silently call an unintended model, and resumes advancement after configuration. Match the published walkthrough to those recorded screens and actions.

### PR-07 — High — Uninstall is documented, but cleanup is not tested

**Evidence.** `prod-readiness-criteria.md:8` includes uninstall in the definition of prod ready, while U1 at `:61` requires only uninstall/cleanup documentation. `docs/plans/v2.5/00-overview.md:115` names only “mirror lorebooks, wizard assets.” Architecture rules at `.claude/rules/architecture.md:100-103` identify three persistence homes and a wizard asset ledger. `.claude/rules/debug-scripts.md:15` says deleting a chat does **not** delete its mirror lorebook.

**Addition.** In **plan 12**, inventory all assets the extension creates or changes: mirror and gated lorebooks, wizard cards/groups, library records, wizard sessions, chat metadata, settings, judge secret, and installed server plugin. Add a clean-install create→uninstall exercise with a before/after inventory. Document both “remove extension, retain authored data” and “remove extension and its owned data,” with foreign assets untouched and any retained data explicitly listed.

### PR-08 — High — Plan 11’s cleanup instructions conflict

**Evidence.** The plan 11 outline at `docs/plans/v2.5/00-overview.md:96-97` says old books move “to a backup folder outside the ST tree, never deleted.” Its named source, `research/legacy-inventory.md:149-151`, instead instructs “delete 8 fixed-name mirror books and the unmarked per-chat books.”

**Addition.** Write **plan 11** before any one-time data action and replace the research instruction with V10’s backup decision. Predeclare the exact candidate inventory, destination, collision behavior, manifest of moved files, and restore test. Pass only when every moved file can be restored byte-for-byte and no unlisted book moved.

### PR-09 — Medium — Plan 01’s live gates depend on plan 02’s unresolved save race

**Evidence.** `docs/plans/v2.5/00-overview.md:80-82` schedules 01 and 02 in parallel. Plan 01 acknowledges at `01-wi-scan-gating.md:219-220` that plan 02’s save race “can wedge a lane page mid-gate,” then calls a wedge “a harness stop, not a product verdict.” Plan 02 at `02-carry-in.md:68-78` describes a nonempty save posted under another chat name and says the current watcher guards only empty saves.

**Addition.** Keep implementation parallel if useful, but make **01 G1–G8 sign-off depend on 02 C2 attribution or a recorded nonreproduction result**. A wedged lane is neither a pass nor a waived attempt; rerun the full affected series on a stable lane after C2 closes.

### PR-10 — Medium — Plan 01 retains downgrade reasoning and has an ambiguous host gate

**Evidence.** `01-wi-scan-gating.md:9-12` says its downgrade leg was dropped, but W1 at `:155` still argues from “on downgrade,” and W3 at `:157` still says “a v2.4 downgrade.” G7 at `:201` passes if sticky WI “stays active, **or the one-time loss is stated**.”

**Addition.** In **plan 01**, remove the obsolete downgrade rationale and test references; justify W1/W3 only by current schema and measured scan behavior. For G7, choose a functional pass rule before testing. If one-time loss is acceptable, specify the exact user-visible state and recovery action; a statement in a record alone should not satisfy a live behavior gate.

### PR-11 — Medium — Long-chat performance has no production gate

**Evidence.** `research/code-health-audit.md:174` says `getSnapshot()` is uncached, four React roots rebuild per notification, and macros rebuild snapshots. F2 at `prod-readiness-criteria.md:49` bounds builds per state change, but neither it nor plan 10 measures a 1,000+ message chat.

**Addition.** In **plan 10**, add a 1,000-message and a sustained 100-turn session on the production artifact. Predeclare reference hardware and a latency/memory budget before the run; compare opening, switching, rendering, and generation overhead with a 100-message baseline. Require no lost boundaries, leaked assets, or steadily growing retained heap.

### PR-12 — Medium — Backend-outage behavior has no mid-boundary chaos gate

**Evidence.** `src/extraction/scheduler.ts:300-303` has a breaker that reports “memory model not answering; reads held.” `prod-readiness-criteria.md:61` asks for troubleshooting text for “backend down,” while v2.4 plan 09 at `09-acceptance.md:56` requires the backend to be up before live rows.

**Addition.** In **plan 10**, interrupt and restore the memory model during an extraction and during a boundary with pending work. Verify no stale result applies after ownership changes, player generation remains usable, status explains the pause, and queued work resumes or is explicitly discarded after recovery. Archive the timeline and exact state before and after the outage.

### PR-13 — Medium — Mobile and keyboard use are outside the accessibility gate

**Evidence.** A1 at `prod-readiness-criteria.md:56` requires Storybook stories and zero axe violations. `README.md:68` records a desktop browser and a `390x844` viewport; `research/code-health-audit.md:210` says nothing was checked against ST themes. The v2.5 acceptance outline adds no touch or keyboard session (`00-overview.md:212-216`).

**Addition.** In **plan 10**, run the production artifact at phone and desktop sizes with touch and keyboard-only navigation in at least the default and a contrasting ST theme. Cover first-run settings, drawer, Studio dialog, wizard, Repair, and confirmation dialogs. Pass with no clipped controls, unreachable action, trapped focus, or loss of visible focus; retain the Storybook contrast gate.

### PR-14 — Medium — Data portability covers a chat-state export, not a complete recoverable backup

**Evidence.** `src/runtime/stateExport.ts:3-8` describes an “Export state” that places **this chat’s** state on the clipboard; its fallback logs the text to the console at `:25-28`. Architecture rules at `.claude/rules/architecture.md:100-103` also place settings, library stories, and wizard sessions outside that chat. No v2.5 checklist row asks for an import or restore test.

**Addition.** In **plan 12/U1**, state exactly what users can export and restore. Add a round-trip test for authored library stories and documented backup/restore of settings and owned assets; include chat state only if a supported import path exists. Do not describe the current clipboard export as a complete backup.

### PR-15 — Medium — The update gate presumes a prior release that does not exist

**Evidence.** R2 at `prod-readiness-criteria.md:18` says “install N, update to N+1 on a clean host.” The owner decision quoted in `docs/plans/v2.5/00-overview.md:27-28` says the plugin has never been released; V10 at `:260` defers real migrations until after the first public release. `manifest.json:11-12` currently has an empty `homePage` and `auto_update: true`; U6 at `00-overview.md:272-273` has not chosen the distribution form.

**Addition.** In **plan 12**, test update *mechanics* with two deliberately versioned release candidates through the chosen ST install/update route, then publish v2.5 as the first baseline. State the post-release migration policy and add a future-release gate for v2.5→next-version persisted data. Do not claim an upgrade from a previous public release in the v2.5 attestation.

### PR-16 — Medium — Privacy disclosure lacks a verification gate

**Evidence.** P1 at `prod-readiness-criteria.md:58` requires a README section, verified by “doc review.” `research/code-health-audit.md:195-196` identifies main/memory model destinations and judge `state` sent to TypeSafe, with an environment variable that can redirect the judge endpoint. Debug logs also contain chat text (`00-overview.md:110-112`).

**Addition.** In **plan 12**, pair the disclosure with an egress and retained-data inventory made from actual requests and storage paths on the production artifact. Verify that judge-off emits no TypeSafe request, judge-on sends only the documented fields to the configured destination, and logs/support exports follow a stated redaction and retention policy. Update the README from that record.

### PR-17 — Medium — Dependency licensing is absent from the release checklist

**Evidence.** `README.md:152-158` declares AGPL-3.0 and a vendored Smart-Memory adaptation. `package.json:5-11` lists runtime dependencies. T4 at `prod-readiness-criteria.md:41` checks dependency use and `npm audit`, but no row checks dependency licenses, notices, or source-offer contents.

**Addition.** In **plan 12**, generate and review an SBOM/license inventory for shipped dependencies and vendored code. The artifact gate should verify required notices and the AGPL source-availability statement against the exact release tag.

### PR-18 — Medium — Several “done” conditions are not objectively checkable yet

**Evidence.** S8 at `prod-readiness-criteria.md:36` requires “one definition each” for shared helpers, but its proposed grep guard covers only `const isRecord =`. E2 at `:44` says every user-visible string is “reviewed,” P1 at `:58` says “doc review,” and U1 at `:61` says “doc review by the user.” Plan 03 at `00-overview.md:134-135` requires `npm test ×3 under a parallel load” without defining that load.

**Addition.** Before **plans 03, 12, and 10** run, commit the helper allowlist and scanner scope, error-copy inventory with pass/fail fields, privacy/doc review rubric, and the exact parallel-load command and environment. Add a negative control for each guard. This preserves the roadmap’s rule that thresholds are declared before measurement.

### PR-19 — High — v2.4’s attestation test can endorse a misleading “twice” claim

**Evidence.** `docs/plans/v2.4/09-acceptance.md:68-70` defines ×2 as consecutive runs and says every run is reported. The current `scripts/release/attestation.test.mjs:140-141` defines `greenTwice` as **any two** recorded all-pass runs; `allPass` checks only `fail` and `blocked`, not `notRunnable`, `skipped`, cleanup, or human scoring. The test is skipped when the attestation is absent (`:21-22`). Plan 09 calls `test:release` in its entry gate (`09-acceptance.md:30-31`).

**Addition.** Change **v2.4 plan 09 before closure** to require an attestation validator with negative controls for pass–fail–pass, missing human score, not-runnable check, failed cleanup, missing attestation, and a cited path escaping the records root. Run it **after** writing the attestation as well as during machine preflight. Its green predicate must implement the plan’s exact consecutive and strict rules.

### PR-20 — Medium — v2.4 omits the plugin test and gives two human-score paths

**Evidence.** `docs/plans/v2.4/09-acceptance.md:30-31` lists machine commands but omits `npm run test:plugin`, although J11 at `:77` requires the plugin. Its matrix row at `:75` names `J/human-scores.json`; the executable command at `:99` names `human/scores.json`. `package.json:32` defines `test:plugin`.

**Addition.** In **v2.4 plan 09**, add `npm run test:plugin` to the frozen-candidate gate, choose one human-score file path, and preflight that file’s scored IDs before the journey batch. Preserve the existing `PARTIAL` outcome if the user sessions have not occurred.

## Prioritized top 10 additions for v2.5

1. Make release-critical checklist rows non-deferrable for the **production-ready** verdict (PR-01).
2. Add a black-box install and first-turn test from the **production artifact** (PR-02, PR-06).
3. Specify and test artifact-only installation of the optional server plugin (PR-03).
4. Add plugin authentication, tenant isolation, and abuse/concurrency gates (PR-05).
5. Audit the entire served tree, including historical debug files (PR-04).
6. Add a create→uninstall owned-asset inventory test (PR-07).
7. Reconcile plan 11’s delete-versus-backup instructions before data action (PR-08).
8. Gate plan 01 sign-off on plan 02’s save-race finding (PR-09).
9. Add a 1,000-message soak and mid-boundary backend-outage gate (PR-11, PR-12).
10. Add mobile/touch/keyboard acceptance and verify privacy egress against actual requests (PR-13, PR-16).

**Before v2.4 plan 09 closes:** repair the attestation validator’s consecutive/strict predicate, run it after the attestation exists, add `test:plugin`, and resolve the human-score path. Otherwise a “green twice” record can be technically green while failing the plan’s own acceptance definition.