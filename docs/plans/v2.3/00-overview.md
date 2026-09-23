# Implementation Overview — Story Orchestrator v2.3: owned, reversible, provable

v2.2 (plans 01–08) is built and its automated side is green; its human eval is outstanding. Two
inputs drive v2.3:

1. **The 2026-09-18 external review** (`../../review/2026-09-18/`, GPT "astra" lead + "Sol"
   memory/engine reviewer): 21 reproduced findings, a test-credibility audit, a v2.2 integration
   review (C1–C4) and a 9-package roadmap. Its verdict: keep the checkpoint spine, fix ownership,
   history reversal, extraction authority and generated branching before any shareable release.
2. **The v2.2 acceptance outcome** (`../v2.2/08-acceptance.md`, `../v2.2/acceptance-report.md`,
   `../v2.2/00-overview.md` §Live gate status): what stayed open, six findings F1–F6, and a long
   seed list written from real campaign use on 2026-09-20.

v2.3 builds **no new autonomous agent**. It makes what exists correct under chat switches, edits and
reloads, makes the harness unable to pass vacuously, and only then finishes the v2.2 acceptance the
integrated system deserves. Judge additions are seeds behind spikes (plan 10), exactly as v2.2
rule 2 demands.

## The review, validated on this tree (2026-09-20, HEAD `9561bac`)

The review ran against a frozen 2026-09-18 snapshot and its closeout classified the later tree by
inspection only. Before planning, every finding was re-measured here:

- The five review harnesses (`scripts/review/*.test.ts`) were copied under `src/runtime/` and run
  with the project jest config, then removed. Result: **19 failed / 15 passed of 34** across
  `reviewRegression`, `memory-engine`, `turn-boundary`, `selftest-grading`; `independent-story`
  2/2 pass. Every failure is an intended-contract assertion, every pass a control or R3.
- `npm run typecheck` green; `npm test` **1949/1949** green (all suites). The review's clean-host
  typecheck failure (`@types/toastr` ambient collision) does **not** reproduce in-tree: host types
  are vendored (`stHost/hostTypes.ts`, 2026-07-07). It stays a clean-install question (plan 08).
- Source inspection confirmed the integration review's C1–C4 at their current locations.

| Id | Finding | Review | On `9561bac` | Plan |
|---|---|---|---|---|
| R1 | Late curator result written into a different chat | reproduced | **still fails** (`stagecraftCoordinator.ts:107–165` captures story/state, awaits, then `patch`es whatever `getStagecraft` now resolves to) | 03 |
| R2 | Stagecraft rollback restores the wrong text across records | reproduced | **still fails** (`revertAppliedSince` :254–276 walks records chronologically; ops reversed only inside a record) | 04 |
| R3 | False host result recorded as applied | fixed 09-18 | **passes** (`writeOp` checks `found` / `"failed"`) | — |
| R4 / E1 | Rollback lost after reload; silent no-op past the 200-snapshot horizon | reproduced | **still fails** (`engine.ts:104–109` hydrate clears snapshots + log; caps at :166/:208/:269; `rollbackFromMessage` :289–313 does nothing when `changed` is false) | 04 |
| R5 | Extraction can write code-owned qualities | reproduced | **still fails** (`parse.ts:118/:125` stamp `quality.source`) | 02 |
| R6 | Declared scope is prompt guidance only | reproduced | **still fails** (`sharedRead.ts:72` accepts every parsed delta not judge-answered) | 02 |
| R7 | Story title reaches popup `innerHTML` unescaped | reproduced | **still fails** (`storyUpdate.ts:35–43` → `popup.ts:48` → ST `popup.js:534`) | 02 |
| R8 | Wizard treats a required lorebook as owned | reproduced | **still fails** (`copilotCoordinator.ts:45` feeds `requirements.lorebooks` as `storyLorebooks`; `provisioning.ts:38` treats membership as a grant) | 02 |
| R9 | Generated alternative outcomes discarded | reproduced | **still fails** (`merge.ts:35/:38`, `revalidate.ts:6`, `critic.ts:38` use `outcomes[0]`) | 07 |
| R10 / R11 | Reply dedupe by 250 ms instead of message identity | reproduced | **still fails** (`turnBridge.ts:46–47`; handlers :24–25 drop `messageId`) | 03 |
| R12 | Self-test certifies unrelated tier content | reproduced | **still fails** (`selfTest.ts:84/:90/:96/:109/:115`) | 01 |
| M1–M4 | Supersession / read coverage / ledger overwrite / retirement not reversible | reproduced | **still fail** (`consolidate.ts:118`, `stores.ts:38–57`, `ledger.ts:38–43/:67`, `epistemic.ts:39/:109`) | 04 |
| M5 / M6 | Pin freezes truth; pinned removed-source knowledge stays injectable | reproduced (contract) | **still fail** (`consolidate.ts:78–118`; every rollback filter exempts `pinned`) | 05 |
| M7 | Edited text keeps its cached token cost | reproduced | **still fails** (`stores.ts:78`, `budget.ts:10`) | 05 |
| C1 | v2.2 late results (lore, scene, typed, judge ring) lack chat/session identity | source-traced | **confirmed** (`loreSelect.ts:40–68` no recheck; `sceneCoordinator.ts:78` and `extractionCoordinator.ts:116` compare message index only; `judge.ts:106–116` reads context after the await) | 03 |
| C2 | Failed scene read keeps the old scene live | source-traced | **confirmed** (`sceneCoordinator.ts:78` returns without aging; `sync` :89–100 keeps injecting) | 03 |
| C3 | Derived truth stores reinforce each other without provenance; "Store anyway" is not an override | source-traced | **confirmed** (`continuity.ts` `establishedFacts`; `StagecraftPanel.tsx:61` labels every input "established"; `memoryCoordinator.ts:282–292`) | 05 |
| C4 | Player agency implicit; pacing + look-ahead + first-outcome narrow choice | design | **confirmed** (`steering.ts`, `merge.ts:38`) | 07 |
| — | Author's Note role not sent | baseline | **fixed 2026-09-18** (`authorNotes.ts:47/:57` send `/note-role`) | — |
| — | Presets use the text-completion adapter only | source | **confirmed** (`presets.ts:4–17,:67`) | 06 |
| — | Studio tabs advertise `role="tab"` without arrow navigation | UX | **confirmed** (`StudioModal.tsx:93–107` handles Escape/Tab only; :174) | 09 |
| — | `dist/` tracked despite `.gitignore`; package version `2.0.0` | delivery | **confirmed** (`git ls-files dist`, `package.json`) | 08 |
| — | Five story states retained per chat, undisclosed | delivery | **confirmed** (`persistence.ts:10,:45–49`) | 05 |
| — | J1 wizard button click intercepted by the chat overlay | live, isolated host | **not reproduced**: v2.2's judge-off J1 matches the v2.1 matrix. Kept as a J1 check to write (plan 01) | 01 |
| — | J5 private block empty on attempt 1 | live | **explained**: v2.2 F6, a check that drafted a member `cast_changes` had disabled. Fixed | — |
| T1–T6 | Test-credibility audit (unknown `expect` keys ignored, verbs return `ok:false` without throwing, strict ≠ human/cleanup, `--only` exits green, live suite scores deltas only, J9.2 subcases silently skipped) | source | **confirmed** (`so-scenario.mts:142–330,:418–462,:834`; `so-journey.mts:427–432,:463`; `so-live-suite.mts:93`) | 01 |

Two review claims are read narrowly, with the reviewer's agreement (`review-astra-2026-09-20.md`
Q2): M6 shows a rolled-back fact still reaching its *intended* subject — the review's own words
are "it does not demonstrate disclosure to another character or a human data leak" — so plan 05
treats it as validity under rollback; and the toastr build failure does not reproduce in this
installed tree, which is **not** an explanation: plan 08 reproduces it on identical extension
bytes under both host layouts before anyone calls it environment-bound. Everything else stands.

## Peer review (2026-09-20)

The plan set was reviewed by the review's lead author before any implementation
(`review-astra-2026-09-20.md`: verdict, Claude's verification of every factual claim against
source, and the disposition of each of the thirteen requested edits). All thirteen were applied.
The three that changed the shape of the work: the finding ledger is id-keyed with an expected
failure reason and a positive control per finding (plan 01), rollback / provenance / host
restoration / migration are specified as one persisted schema before code (plans 04–06), and the
playbook's "one variable" rule became per-experiment baselines with a positive-activation
prerequisite, so no recipe can pass because the mechanism under test never ran.

## What v2.2 hands over

| Item | Status at handover | Plan |
|---|---|---|
| Judge-off matrix J0–J10 | green, matches v2.1 check for check | 11 re-runs on the final tree |
| Judge-on: J11 26/26 ×2, J8 6/6 ×2, J3/J4/J5/J6 | green | 11 (full option-C matrix outstanding) |
| Calibration | 11/11 at floor; `scene/location`, `director`, `lore/recall` within 3–5 points of floor | 10 (lore), 11 |
| Cost: $/1000 boundaries, GPU time saved, on-path 1500 ms budget | **not measured** (20-call sample; `director` logs no duration; `lore` never fired) | 03 (log duration), 11 |
| Human eval (player + author, carried-over J8.4 / J9.6 / J9.7, v2.1 player rubric) | **outstanding** | 11 |
| `recommended-config.md` | lives inside `acceptance-report.md`; the settings panel does not link it | 09 |
| F1 wizard rating rubric fails validation intermittently; one repair pass | open | **02** (owner: first-attempt pass rate is the criterion); 01 only supplies the retry/reporting verb |
| F2 in-memory settings view disagrees with stored settings after reload | open, unverified | 06 |
| F3 17 of 26 J11 checks inherit their story; `--only` misleads | open | 01 |
| F4 lore-select ranks by a Noul | bounced | 10 |
| F5 WI curator has no `create` op | by design; narrow op seeded | 10 |
| F6 J5.6 drafted a disabled member | fixed | — |
| S1 latching-enum placeholder diagnostic | seeded | 02 |
| S2 `cast_changes` writes install-wide group state | seeded | 06 |
| S3 away recap fires in a brand-new chat (blob read before `chat_metadata` swap) | seeded | 03 |
| S4 example story pins a sampler stack that degenerates on Artemis | seeded | 06 |
| S5 single-sample model assertions have no retry class | seeded | 01 |
| S6 tooling reads absence as "nothing" (`libraryBefore`, guard chat ids, config snapshot) | seeded | 01 |
| S7 a crashed journey leaves the config cleared, self-perpetuating | seeded | 01 |
| S8 `so-assets remove` trusts a marker session's whole ledger without a baseline | seeded | 01 |
| S9 cleanup gaps: `worldInfoCache`, regex/QR sets, legacy mirror books, unmarked wizard draft | seeded | 01 |
| S10 chat-integrity popup dismissed as routine | seeded | 01 |
| S11 journeys leave install-wide extraction settings behind (cadence 50) | seeded | 01 |
| S12 config restore clobbers the story library (`writeGlobalConfig` now keeps live `v2Stories`; pre-run restore still open) | partly fixed | 01 |
| S13 no journey proves the scheduler fires unaided at the shipped default | seeded | 01 (J12) |

## Rules for every v2.3 build agent (additive to v2, v2.1 and v2.2)

1. **A review finding closes only when its ledger row's evidence is green.** Plan 01 §A keeps an
   id-keyed ledger (`test/findings/ledger.json`, built 2026-09-20): one owning plan, the
   **reason** an open finding must fail with (any other exception is a broken reproduction, not an
   open finding), a positive control beside it, and the evidence type — `jest` for the R/M/E
   reproductions, `live` for what a scenario or journey must show (R7's popup, the final-payload
   privacy check, the clean-host install), `human` for C4's agency outcome and the UX rows. An
   open jest row is an ordinary test stating the intended contract, run by `finding()`; a fix
   flips the row to `closed` and the same body must then pass. A jest reporter proves each row's
   test actually executed, because a source scan cannot see a skipped suite. The open count is
   printed on every run, never quoted from a document. Nobody closes a finding by inspection.
2. **One ownership token for every asynchronous write.** Plan 03 exports `RunToken`; every later
   plan that awaits before writing extras, the queue, an injection, a ring or the host validates it.
   A write without a token check is a review finding by definition.
3. **Rollback ≡ replay without the removed input** is a layer-1 property across engine, memory,
   epistemic, ledger, scene, stagecraft, judge ring and host effects (spec v2 line 299 already says
   so; v2.3 makes it a test).
4. **Persistence changes bump the blob version** with a migration, a fixture captured from a real
   chat (v2.1 J10.11 precedent), and an explicit policy for history the old blob never held.
5. **Contract changes go into `spec-addendum-v2.3.md` before code**: pins, outcome identity,
   asset ownership, agency. Each row is ratified by the plan gate that lands it.
6. **Harness rules**: closed schemas, verbs throw, three separate gates (automated / human /
   cleanup), single-sample model assertions carry a bounded retry, every journey pins its group,
   lorebooks and extraction settings, and cleanup restores the install to what it held *before*
   the run.
7. **Docs truth** (v2.1 rule 5) and **journeys twice, `--strict`, archived** (v2.1 plan 08) still
   bind. `.claude/CLAUDE.md`'s status line is updated per gate.
8. **No judge default flips** (v2.2 rule 4). Plan 10's additions are spike-gated and opt-in.
9. **One story, a declared baseline, a positive activation.** Every live gate names its story
   from the reference table below, opens and closes with `so-run-header capture` (plan 01 §A0),
   names the archived run it is compared with and the header fields expected to differ, and
   proves the mechanism under test fired before asserting on its effect. The recipes are in
   [live-gate-playbook.md](live-gate-playbook.md); a plan's Verification section points at its
   recipe and never restates it.
10. **Closure dependencies are explicit.** A plan whose invariant needs a later plan's work says
   so in its gate: plan 04's cross-store rollback closes for engine, memory and stagecraft at its
   own gate and for host effects at plan 06's; plan 03's chat stamp rides plan 04's v4 bump; the
   `player_summary` decision belongs to plan 11's human eval, not to plan 09. Docs truth (rule 7)
   is per plan: each plan updates `.claude/rules/*` and the debug skill for what it changed.

## Reference stories

The playthrough story is **Adolion: The Adventurer's Road** (`adolion-adventurer` v9, from
`C:\dev\adolion-campaign\build\story\`, group `1789797226071`): 14 anchors, 14 extractor
qualities, four `cast_changes` checkpoints, per-checkpoint talk control, a 264-entry world book
and a curator allowlist — the only story that composes every feature, already live-gated on
Artemis. **Adolion: House Nightriver** (`adolion-academy` v11, group `1789797226079`) is the
"other chat" in every switch and ownership gate; it **shares** `Adolion World` and the
curator-writable `Adolion Chronicle` with the adventurer story, so ownership is asserted by chat
id and sentinel, never by book name. `quest-for-the-sun-ruins` stays the regression fixture the
archived matrices ran on and is never the playthrough. `two-ways-across` (review) is the authored
branching regression; `generated-fork` (plan 07) is the generated one, because `two-ways-across`
has no stub. Details and the per-checkpoint watch list: `live-gate-playbook.md`.

**P0 — the characterization run.** After plan 01 §A0 (the two observation scripts) and before
any fix, one full adventurer playthrough is recorded at the reference configuration (judge off,
curator off, cadence 3, Artemis) under `test/journeys/records/p0-adventurer/`: run header,
journal, persisted captures of every request, the raw chat file, flags, v2.1 rubric scores. It
is an observation of the shipped tree in real play, which nobody has made. It is **not** a
causal baseline (plan 11 compares the final tree by matched replay of P0's transcript, and
separately by a fresh natural-play session) and it is **not** the v2.2 judge-on player session
(that runs at plan 11 with the judge on).

## Plan sequence

Sequential, one build agent per plan, a plan's gate green before the next starts. Each doc states
its kind: **fix** (a reproduced defect), **hardening** (a contract gap without a reproduced user
failure), **enhancement** (a capability that does not exist), **tooling** (harness or release).

| Plan | Kind | Closes | Delivers |
|---|---|---|---|
| [01 §A0](01-evidence-hardening.md) observation tooling | tooling | — | `so-run-header`, `so-journal follow`, persisted payload captures — gated on their own before P0 |
| P0 characterization run ([playbook](live-gate-playbook.md#p0--the-adventurer-characterization-run-before-plan-01s-fixes)) | measurement | — | The shipped tree observed in one real playthrough; input to plan 11's matched replay |
| [01-evidence-hardening](01-evidence-hardening.md) | tooling + fix | R12, T1–T6, F3, S5–S13; the F1 retry verb | The finding ledger in-tree; a harness that cannot pass vacuously; journeys that leave the install as found; J12 unaided schedule |
| [03-async-ownership](03-async-ownership.md) | fix | R1, C1, C2, R10, R11, S3 | `RunToken`, cancellation, lifecycle cleanup, scene freshness, identity-based turn dedupe, chat-stamped blobs |
| [02-input-authority](02-input-authority.md) | fix | R5, R6, R7, R8, F1, S1, the judge-input structure (was plan 10 §B) | Parser/consumer authority and scope, evidence-span semantics, safe popup rendering, ownership ≠ requirement |
| [04-rollback-invariant](04-rollback-invariant.md) | fix (migration) | R2, R4, E1, M1–M4 (engine, memory, stagecraft at this gate; host effects at 06's) | Persisted history + explicit horizon, dependency reversal, write-order stagecraft revert, the shared v4 schema with 05 |
| [05-provenance-and-pins](05-provenance-and-pins.md) | fix + contract | M5, M6, M7, C3, retention disclosure | One provenance envelope, pin = retention, hard conflict exclusion, author override, warden consumes valid records only |
| [06-host-integration](06-host-integration.md) | hardening | presets (chat completion diagnosed unsupported), S2, F2, save evidence, S4; closes 04's host-effect half | Write-ahead owned-effect ledger with compare-and-set restore, typed host results, settings-load seam |
| [07-generated-branching-and-agency](07-generated-branching-and-agency.md) | fix + enhancement | R9, C4 | Every outcome becomes a gate; agency policy fed to pacing, generation, critic |
| [08-release-reproducibility](08-release-reproducibility.md) | tooling | clean-host build, manifest, version, `dist`, Windows Storybook CI | A fresh host installs, builds and loads without developer caches |
| [09-player-author-flows](09-player-author-flows.md) | enhancement | UX table, Studio a11y, next-turn preview, settings scope | Start / Continue / Repair, one save vocabulary, accessible tabs, preflight view |
| [10-judge-seeds](10-judge-seeds.md) | enhancement (spike-gated) | F4, F5 seed, v2.2 seed list | Lore Score ranking, narrow WI create op, and the rest only past their floors |
| [11-acceptance](11-acceptance.md) | gate | v2.2 leftovers, roadmap 9 | Full off/on matrix, cost, fault matrix, independent stories, human eval, release qualification |

Why this order: 01 §A0 first because P0 cannot be recorded without it; then P0, so the shipped
tree is observed before anything changes; then the rest of 01 because every later gate is
measured by it, and the review showed green tests hiding red behaviour. **03 before 02** because
plan 02's scope enforcement needs the request-window revision the token carries, and the wizard's
ownership check writes after an await. 04 after 03 because rollback across stores needs session
identity to know *which* chat it is reversing; 04 and 05 share one persisted schema, designed in
04 before either is coded; 04's host-effect half closes at 06's gate. 07 needs 03's token and
02's source authority. 08 and 09 are delivery and can overlap with 10's spikes; 10's structural
fixes moved into 02 and 05 because they are correctness work, not seeds. 11 last, on a frozen
candidate, and it owns rewriting the recommended configuration from final evidence.

## Findings register

Ids carry over from the review (R/M/E/C/T) and v2.2 (F); S is a v2.2 seed, V is v2.3-found.
This table is the human view of **`test/findings/ledger.json`** (built in plan 01 §A); the ledger
is what runs. A finding closes with the evidence its row names, never with prose. Evidence types:
**jest** (the promoted reproduction, with the reason it must fail with), **live** (a scenario or
journey check), **human** (a scored rubric row).

An open jest row is an ordinary test stating the intended contract; `finding()` asserts it still
fails *and* fails for the recorded reason, so a reproduction that breaks stops counting as
evidence. `it.failing` is deliberately not used: jest passes a `.failing` test whenever its body
throws, for any reason at all. A jest reporter then proves each row's test actually executed — a
source scan cannot see a skipped suite. Every run prints the open count; no document quotes it.

| Id | Finding (one line) | Owner | Evidence (type) |
|---|---|---|---|
| R1 | Late curator result enters another chat | 03 | jest `reason: "chat"` + live `live-switch-mid-read` (sentinel absent from B) |
| R2 | Stagecraft revert order across records | 04 | jest (oldest before-image restored) + live J8 two-write rollback, hash equality |
| R3 | False host result reported applied | — | **closed 2026-09-18**; jest control stays green (regression only) |
| R4 | Rollback lost after reload | 04 | jest (hydrated engine rolls back) + live J6 reload variant |
| E1 | Silent no-op past the horizon | 04 | **rewritten** jest: `{ok: false, reason: "history-unavailable"}` and the notice — the review's assertion (rollback to boundary 0 succeeds) conflicts with the accepted remedy + live 205-boundary variant |
| R5/R6 | Extractor authority and scope | 02 | jest (`code-owned quality`, `outside requested scope`, with the 7-char `"crossed"` evidence **accepted**) + live rejections |
| R7 | Popup HTML injection | 02 | **rewritten** jest: structured description, text nodes only (the review's escaped-string assertion targets the old string API) + live hostile-title J2 variant (popup actually opened by an invalidating change) |
| R8 | Requirement treated as ownership | 02 | jest + live J9 collision subcases (seeded proposal refused) |
| R9 | Alternative outcomes lost | 07 | jest (two transitions from a two-outcome beat) + live `generated-fork` both routes ×2 (`two-ways-across` is authored and cannot show R9) |
| R10/R11 | Timing-based reply dedupe | 03 | jest + live `so-turn-types-check` four identity cases |
| R12 | Self-test grader permissive | 01 | jest (wrong-entity fixture fails every tier) + live J0.4 |
| M1–M4 | Memory maintenance irreversible | 04 | jest + rollback≡replay property (seeds recorded) |
| M5/M7 | Pin freezes truth; cached token cost | 05 | jest |
| M6 | Pinned removed-source fact still injected | 05 | jest (quarantined) + live J5.6 variant (private block) + human "what is a pin" |
| C1/C2 | v2.2 late results; stale scene | 03 | jest ownership tests (started-call precondition) + live J11.11–15 twice |
| C3 | Derived stores without provenance; "Store anyway" | 05 | jest (conflicted record **absent** from injection; warden skips) + live J8.5/6 with a positive contradiction control |
| C4 | Agency implicit | 07 | jest refusal fixtures + precedence + **human** railroading rubric (plan 11) |
| T1–T6 | Harness credibility | 01 | jest schema/strict tests; T5 per-tier **floors** bind the live suite |
| F1 | Wizard rating rubric intermittent | **02** | live: first-attempt pass on ≥ 3 of 4 consecutive J9.1 runs **without** retry; 01's retry verb is reporting, not the criterion |
| F2 | Settings view vs stored | 06 | jest reload test + live J10 |
| F3 | J11 checks not self-contained | 01 | live `--only` on every J11 check |
| F4 | Lore ranks by Noul | 10 | calibration at floor (precision@4, tie rate) + live J11.16–19 |
| F5 | Curator has no create op | 10 | **by design**; the narrow create op is a spike-gated enhancement, not a fix |
| F6 | J5.6 drafted a disabled member | — | **closed** in v2.2 |
| S1–S13 | v2.2 seeds (handover table) | per plan | per plan; S10 is already detected (`so-journey.mts:243–254`) and plan 01 verifies it rather than builds it |

## Unresolved questions

- Which of "scope `cast_changes` to the chat" and "make it revertible" is the contract (plan 06)?
  The seed argues both symptoms come from one defect; the plan proposes the chat mirror.
- Is `dist/` to stay tracked (with a manifest) or move to a release artifact (plan 08)?
- Does the player-safe summary field justify a format bump, or ride as an additive optional
  field old readers ignore? Decided by plan 11's human eval; plan 09 does not build it.
- The OpenAI-preset adapter is deferred (plan 06 diagnoses chat completion as unsupported).
  Does v2.4 build it, or does the preset effect stay textgen-only by contract?
- Should out-of-horizon history (plan 04) default to "re-read from checkpoint start" or "restart",
  when the user is a player and not an author?

## Replan 2026-09-23 — after the independent audit

The 2026-09-23 audit (seven parallel read-only reviews + spot verification; machine gates on the
tree at audit time: typecheck, typecheck:test, lint, debug:typecheck, jest 151/2493, test:debug
122, test:release 10, test:plugin — all green) found that the green machine gates hide partial
fixes, and that several "COMPLETE"/"GREEN" claims are not backed by archived evidence. This
section supersedes every status claim above it and in `.claude/CLAUDE.md`. Each plan doc carries
an `## Audit 2026-09-23 — reopened` section with its items; this table is the queue.

### Honest status per plan (2026-09-23)

| Plan | Code | Machine gate | Live gate | Blocking gaps (V-ids below) |
|---|---|---|---|---|
| 01 | partial | green | NOT green (no J12, no plan-01 records, P0 never recorded) | V20, L1 |
| 03 | partial | green | partial (J4 ×2 archived; turn-types + ownership race unarchived) | V2, V3, V4, V5, V6, L6 |
| 02 | mostly | green | partial (J2 ×2 + F1 archived; J3 ×2, live-suite not run) | V1, V14, V18 |
| 04 | partial | green | partial (J6 ×2 archived; R2 live mocked, no hash equality) | V9, V10, V11 |
| 05 | partial | green | NOT green (J3 7/8 unarchived + cherry-picked; J8.5/6 planted-conflict never run; recipe off reference story) | V7, V8, L3 |
| 06 | partial | green | NOT green (fixture exercised the one working leave path) | V15a–c, V16, V17, L5 |
| 07 | partial | green | NOT green (live fork scenarios never written) | V12, V13, L4 |
| 08 | done, stale evidence | green | clean-host runs predate the current tree | V21, L8 |
| 09 | mostly | green | NOT green | V19, L7 |
| 10 | spike refuted, B partial | green | n/a | V19 |
| 11 | not run | — | NOT green; attestation overstates the matrix | V22, L1–L8 |

### Process corrections (bind every remaining iteration; additive to rules 1–10)

11. **A claim cites an archived record that exists.** No gate claim cites `.debug/`. A docs
    citation check (V22) fails the release suite on a missing path.
12. **"Twice" means two consecutive runs on an unchanged fixture and build, and every run of the
    series is reported.** A series with failures reports its pass rate (e.g. J3.7 4/8); picking
    the last two greens is not "twice".
13. **Acceptance runs are `--strict`** and land in `test/journeys/records/v2.3-acceptance/`.
14. **A plan is COMPLETE only with zero unrun spec items and zero `todo` census rows**, or with
    each one listed as a deferral the user signed off. Otherwise it is `partial`.
15. **Status lives in the table above, not in prose.** `.claude/CLAUDE.md` carries a pointer and a
    one-line state per version; history goes to the gate records.
16. **Work is committed per item** once the user approves committing (V0). Until then every
    iteration ends with the tree backed up.
17. **P0 can no longer precede the fixes.** It is re-scoped as P0′: one adventurer playthrough on
    the first frozen candidate, the baseline plan 11 replays against. The deviation is recorded,
    not hidden.

### Work queue (one item per loop iteration, in order)

Status: `todo` → `doing` → `done` (machine gates green) → `live` (live check green, record path
cited). Items needing the backend stay `done` with the live half listed under L-items.

| # | Id | Plan | Item | Status |
|---|---|---|---|---|
| 0 | V0 | repo | v2.3 is uncommitted on `master` (212 M / 163 ??) and `master` is 91 ahead of `origin`: branch + commit + push — **needs user approval**; backup tarball taken 2026-09-23 | blocked (user) |
| 1 | V21 | 08 | Attestation `current` computed, not hand-edited (built as: `scripts/release/attestation.test.mjs` computes the current bundle from `dist/` and prints drift; no separate `attest.mjs` was written — citation corrected by V22a); source hash includes `styles.css`; manifest records the extension commit || done 2026-09-23 |
| 2 | V1 | 02 | R7 residual: `showConfirmPopup` string → DOM text nodes (`index.tsx:272` library title reaches innerHTML); drop `showTextPopup`'s `innerHTML` sink; guard test: no string reaches `callGenericPopup` || live 2026-09-23 (`records/v2.3-replan/V1/`) |
| 3 | V2 | 03 | Extraction ownership across the shared read: mint the token in `ExtractionScheduler.pump` before `runSharedRead`, gate `enqueueExtractorDeltas` + apply on it; test moves the world during the read | live 2026-09-23 (`records/v2.3-replan/V2/`) |
| 4 | V7 | 05 | Quarantine exclusion completeness: `rollbackLedger` quarantines pinned rows; `mirroredEntries` filters `isLive`; stale canon kept out of steering consumers; consolidation `groupOf` live-only; scene conflicts excluded; one exclusion census test over every consumer | live 2026-09-23 (`records/v2.3-replan/V7/`) |
| 5 | V12 | 07 | Contract drop strands a chat on a generated checkpoint: migrate legacy `inserted` chains on the path (single outcome → id `<beat>:0`), and hydrate guard for a missing active checkpoint (nearest path anchor + notice) | live 2026-09-23 (`records/v2.3-replan/V12/`) |
| 6 | V9 | 04 | Ledger: no new version for an unchanged value; cap per key above the history floor, never cross-key eviction | live 2026-09-23 (`records/v2.3-replan/V9/`; history-floor alignment not done, see plan 04) |
| 7 | V10 | 04 | Stagecraft revert: keep records holding `revert-failed` ops; preserve op order; address entries by recorded target uid; tests for `revert-failed`/`externally-edited` | done 2026-09-23; **target-uid addressing done 2026-09-23 (V10 part 2, `records/v2.3-replan/V10b/`)**: revert reads + restores by `{lorebookFileId, uid}` with a server read-back, renamed entry re-checked against the write scope; live ×2 + live mutation, which showed the old name-addressed revert CREATED a duplicate entry under the old name; 3/3 mutants (1 survived first); stale duplicate the old src/runtime copy of the stagecraft coordinator test deleted. Real-curator variant still L2 |
| 8 | V15a | 06 | Host-effect restore on every leave (story→story too), against the RECORDED group; restore status persisted before `loaded = null` | live 2026-09-23 (`records/v2.3-replan/V15/`; persistence replaced by hydrate reconcile, see plan 06) |
| 9 | V15b | 06 | Author's Note + background through `withLedger`; ~~cast mirror READ on hydrate~~ (done with V15a, live); dead `effectHost` branches fixed or removed | live 2026-09-23 (`records/v2.3-replan/V15b/`; ×2 + once on final bundle; live mutation caught; 8/8 mutations; preset restore stays a v2.4 seed) |
| 10 | V15c | 06/04 | Restart and rollback restore host effects (closes plan 04's host-effect half) | done 2026-09-23 (restart live; rollback jest only) |
| 11 | V16 | 06 | Save evidence: real server read-back (chat file fetch) or rename the claim; observation attributed per request; "retrying" backed by a bounded retry or the copy changed | live 2026-09-23 (`records/v2.3-replan/V16/`, ×2 + live mutation; copy changed, no retry loop) |
| 12 | V4 | 03 | TurnBridge: `continue`/`appendFinal` on the same message id commits a boundary (verify ST `script.js` continue path first); group round keeps one boundary per reply; null id not keyed "0" | done 2026-09-23, live on the host event bus ×2 + 2 live mutations; **real-generation half NOT run** (pod start refused by the classifier) → owed to L6 |
| 13 | V5 | 03 | `getMetadataBlob` never blanks a foreign blob on read; mismatch journaled | live 2026-09-23 (`records/v2.3-replan/V5/`, ×2 + 2 live mutations; also fixed: a renamed chat lost its story) |
| 14 | V6 | 03 | `RunOwner.lowestMutatedMessageId` scoped to since-mint, not the epoch | done 2026-09-23 (landed with V2; jest only) |
| 15 | V3 | 03 | Remaining unowned writers: `JudgeRuntime.ask` fallback, `syncMemoryMirror` (check before each host write), `clearStory` mid-await, curator `inFlight` per chat; census covers arrow functions + property writes, or each blind spot gets rows; resolve the 11 `todo` / 9 `partial` rows | live 2026-09-23 (`records/v2.3-replan/V3/`; census 108 rows, 0 todo; 25/25 mutations; backlog race live ×2 + live mutation) |
| 16 | V11 | 04 | `runRollback` `history-unavailable` from a missing snapshot → notice + journal, never silent; `boundary === null`; E1 notice offers re-read AND Restart; E1 ledger test asserts manager behaviour, not a constructed object | live 2026-09-23 (`records/v2.3-replan/V11/`; J6.9 ×2 + live mutation; 8/8 mutations; history measured 201,165 B) |
| 17 | V8 | 05 | M7: recompute tokens after edit; manual edit writes an override; ~~ConflictQueue lists conflicted rows once~~ (done with V7); Discard goes through `commitDecision` | live 2026-09-23 (`records/v2.3-replan/V8/`; ×2 + live mutation; 8/8 mutations) |
| 18 | V14 | 02 | Evidence matching on token boundaries with a minimum span; sub-word cases tested | done 2026-09-23 (pure module; 5/5 mutations; 136 recorded real-model quotes replayed, 0 newly rejected) |
| 19 | V13 | 07 | Refusal signal needs an unclassified player action, not any two quiet boundaries; author copy states only what is known; `headingTo` consumer; threshold-0 guard; `commitValidated` test; "Generate the road ahead" works on authored checkpoints or is hidden there | live 2026-09-23 (`records/v2.3-replan/V13/`; refusal half ×2 real-LLM; control ×1 — run 2's control failed on V25; 13/13 mutations; live mutation survived, stated) |
| 20 | V17 | 06 | Probes: `macros` via `registerMacro`; non-OK vectors status not cached as `absent`; typed-results guard uses inferred return types (catches `applyCharacterAN`, `enableWIEntry`, `applyBackground`, …) | live 2026-09-23 (`records/v2.3-replan/V17/`; probes all present live + live mutation; found ST's `_save` never reads the answer → WI toggles read the server back, lost write evicts the cache, checkpoint world_info journals refusals; WI read-back ×2 + live mutation; 13/13 mutations) |
| 21 | V18 | 02 | Spec addendum rows ratified or narrowed per landed plan; S1 warning at parse + the orphan fixture used; R8 ownership ledger filtered by asset kind; `sharedRead` keeps the judge's error | live 2026-09-23 (`records/v2.3-replan/V18/`; addendum 5 ratified / 7 narrowed / 1 not; R8 collision proven real by live mutation; S1 warning was wiped by the load, found live; typed calibration 0.826/0.835/0.843 < 0.85, NOT met, not retuned; harness: `--min` ignored with families, sandbox chats resurrected by ST's debounced group save; 7 leftover sandbox chats NOT removed (classifier); `so-live-suite` not run, no pod) |
| 22 | V19 | 09/10 | Dead toggles `sceneOoc`/`memoryRerank` hidden until wired; next-turn "open owning editor"; keyboard authoring story; tie rate over top-4 as specified; fixture count note | live 2026-09-23 (`records/v2.3-replan/V19/`; unbuilt uses read `not-built`; next-turn rows open their owner; HUD + drawer footer land on Repair (live); keyboard-only authoring: Storybook story + real-key walk (live); tie rate NOT changed: handed to v2.4 T21, which owns that metric; fixture note corrected) |
| 23 | V20a | 01 | Harness: runner modifier list imported from the schema (`expectFail` dispatch bug); T2 execution test; `firstAttempt` = fail on a first-attempt failure | live 2026-09-23 (`records/v2.3-replan/V20a/`; J0 --strict ×2, 4/4 first try; 4/4 mutations; header diff 0) |
| 24 | V20b | 01 | Ledger rows for T1–T6 + S1–S13 with evidence; ledger test checks the register's id set; R12 live half (J0.4 planted wrong-entity) | live 2026-09-23 (`records/v2.3-replan/V20b/`; 50 rows, 12 open / 38 settled, every register id checked; `node` evidence cited by file + title; R12 live as J0.6 (J0.4 stays the human-checklist placeholder), J0 --strict ×2 + live mutation) |
| 25 | V20c | 01 | F3: J11 checks import their story + `--only` guard; T6: J9.2 per-subcase outcomes; J1.10 clicks | **part 1 done 2026-09-23** (`records/v2.3-replan/V20c/`): T4 closed (`so-journey archive` refuses a partial/runner-errored record, release suite refuses a cited partial record); F3 `--only` guard built and live (J11 --only J11.3 fails naming F3, header diff 0); 5/5 mutants. **Part 2 todo (needs the pod):** the 16 J11 story imports proven by real `--only` runs, T6 J9.2 subcases, J1.10 clicks |
| 26 | V20d | 01 | S6–S9, S12: `libraryBefore` trusted flag, empty-root recovery, `so-assets --baseline`, cleanup gaps (worldInfoCache, regex/QR, legacy mirrors), `setup.extraction` required, `writeGlobalConfig` merges `wizardSessions`; restore jest test | **part 1 live 2026-09-23** (`records/v2.3-replan/V20d/`; S6/S7/S10/S12 closed on node tests in `lib/configRestore.test.mts`, 6/6 mutants killed; J0 --strict ×2 5/5; S10 planted-dialog refusal + live mutation; header diff 0; S12 live half refused by the classifier, S7 not reproduced live; library captured after J1's clear fixed). **Part 2 live 2026-09-23:** S8 explicit `--baseline` (no default — deliberate deviation), S9 WI-cache eviction + read-back (live mutation found remove reported clean over a stale cache), marker regex/QR sets, exact-name `--legacy-mirrors`, J9 draft marker-named; every journey declares `setup.extraction` (cadence 1 / lag 0 = the measured condition, NOT the shipped default 3); ledger 6 open / 44 settled; J9 live not run (model) |
| 27 | V20e | 01 | §A journal contract: audit id through the queue, zero-apply boundaries recorded, discarded writes listed; live-suite default floors; remove fixed sleeps | **live 2026-09-23** (`records/v2.3-replan/V20e/`; `ApplyQueueEntry.origin` = audit id, journal links read→queued→applied/discarded by id, every boundary journaled, discards named; T5 closed — default floors bind, and the last live measurement now FAILS them (not retuned); found `ctx.saveSettings` does not exist, so every harness settings save was un-awaited → `saveSettingsNow` observes the server's answer; fixed sleeps gone; live-v20e-journal-contract ×2 7/7 + live mutation; 6 jest + 2 node mutants; ledger 5 open) |
| 27b | V24 | 01/07 | Scenario corpus stale since plan 07: `plan05-background-generation.json` expects `status: "inserted"` right after `expand`, but a fresh chain now sits in `validated` until the next boundary (found live 2026-09-23 while writing the V12 scenario). Re-run the whole mocked corpus and fix every stale expectation by property, not literal | **live 2026-09-23** (`records/v2.3-replan/V24/`; mocked corpus 17/22 in one batch, 4 stale fixtures fixed by property with new `oneOf`/`contains` matchers, 3 now green twice; `effects-preset` was wrong on a Text Completion backend AND left the install's sampler on the probe preset while the run-header diff read 0 — restored, fixture now restores it; `plan06-convergence` still red for a different cause → V24b; `plan08-hygiene` needs the model → L-queue) |
| 27c | V24b | 07 | `plan06-convergence`: after `validated` is accepted it reaches step 10 and never stalls — six calm boundaries at `gen_bridge_a_1` converge the story to `midway` (`progress_toward_midway: 2`) instead of producing the stall its reconciliation check needs. Decide whether plan 07's minimum-over-routes threshold changed the fixture's premise or the convergence is wrong, then fix the one that is | **done 2026-09-23** (`records/v2.3-replan/V24b/`): the product was right, the fixture's premise was stale twice over — it needed the cadence read to MISS planted evidence (a pre-V25 window artifact) and posted that evidence before the stuck checkpoint's re-read window. Rebuilt: cadence 50, evidence inside the window, step 14 asserts `activeCheckpointIn`; green ×2 (25/25, red since plan 02); live mutation (reconciliation off) caught; mocked corpus now 21/22 (plan08-hygiene needs the model) |
| 27b | V25 | 03/07 | **Found live by V13:** the cadence read window counts MESSAGES (`cadence` ending at `stableTo`, `scheduler.ts:137`) while cadence counts BOUNDARIES — at cadence 1 a read sees only the newest reply, never the player's line; in a group the player's line falls outside every window; solo at cadence 3 half the transcript is never read. Window from the last read's end, bounded; re-run the V13 control ×2 + J3 ×2 | live 2026-09-23 (`records/v2.3-replan/V25/`; V13 control ×2 21/21; J3 7 runs, three harness defects fixed on the way (rAF-starved click, fixed 15 s send wait, J3.2 read race); last two runs 8/8 and 7/8, the miss being model-dependent J3.7, so NOT 8/8 twice; 5/5 mutations; header diff 0) |
| 28 | V22 | docs | `.claude/CLAUDE.md` status → pointer + table (history moved to `docs/plans/v2.3/status-history.md`); attestation `statusNote`/`notGreen` corrected; citation check test; line-budget squeeze undone (long single-line imports reformatted, budget raised or code split honestly) | **V22a done 2026-09-23** (`.claude/CLAUDE.md` status is a pointer + one line per version, the 54 KB of prose moved verbatim to `status-history.md`; `scripts/release/citations.test.mjs` in `test:release`, 4 cases, 5/5 mutants; 4 broken citations fixed incl. V21's row naming an `attest.mjs` that was never written; 12 legitimate absences listed with a kind and reason; P0′ records home unified to `test/journeys/records/p0-adventurer/`). **V22b done 2026-09-23**: attestation corrected (note no longer claims 'twice'; J12 `notRun`; J2/J4/J10 second runs `recorded:false`; J11's unarchived failure named; notGreen +J7/J12/--strict/frozen candidate/live fault injection/backgrounds; fault matrix labelled census-only) with 3 new release cases (4/4 mutants); run header records every profile's api-url and the active sampler; architecture budgets now count effective 120-char lines — the squeeze hid manager 766 vs 700 and memoryCoordinator 676 vs 620, budgets RAISED to 780/700 as a stated decision, split queued as V26 |
| 28b | V26 | 03 | Split `runtimeManager.ts` (775 effective lines) and `memoryCoordinator.ts` (687) back under the plan-03 budgets (700/620), then lower the guard to them again. Behaviour-preserving; ownership census rows follow the moved code | **part 1 done 2026-09-23** (`records/v2.3-replan/V26/`): prompt injection moved to `runtime/memoryInjector.ts` (stores stay in the coordinator, rendering to ST's slots + the staged per-member blocks move out; synchronous, so no census rows move); memoryCoordinator 687 → 597 effective, **coordinator budget back to 620**; bundle rebuilt and 4 injection scenarios green ×2 live (model-free), header diff 0; 2/2 mutants in the moved code caught. **Part 2 done 2026-09-23** (`records/v2.3-replan/V26b/`): save chokepoint → `runtime/chatSave.ts` (census rows rekeyed to `ChatSave.*`), shared `view`/`lifecycle` deps; manager 775 → 738, NOT ≤700 — the rest is the public delegate API + lifecycle/boundary/load, so `MANAGER_LINE_BUDGET` = 740 (measured) as a stated decision rather than repacking; 2 of 3 mutants in the moved code SURVIVED the existing suite → `chatSave.test.ts` (5 cases) kills 3/3; 5 model-free scenarios green ×2 live, header diff 0 blocking |

### Live queue (needs ST + a reachable backend; none is up on 2026-09-23)

| Id | What | Replaces the claim |
|---|---|---|
| L1 | P0′ adventurer playthrough on the first frozen candidate | P0 (never recorded) |
| L2 | J0–J12 `--strict` ×2 consecutive, archived under `records/v2.3-acceptance/` | plan 11 "matrix ran green twice" |
| L3 | Plan-05 recipe on the adventurer: J3 provenance check, J8.5/J8.6 with a planted conflict + positive control, three per-member payload captures | plan 05 "live gate green" |
| L4 | `live-generated-fork-a/b` written and run ×2; refusal fixture | R9 closed on jest alone |
| L5 | Host restore: leave to a story chat, to a solo chat, restart, rollback | plan 06 "live check green" |
| L6 | Turn types: continue, appendFinal, group round | plan 03 unarchived turn-types gate |
| L7 | Plan 09 live rows; plan 11 judge-on matrix, cost/latency, live fault injection, privacy capture, load, independent stories, human eval | plan 09/11 |
| L8 | Clean-host ×2 on the frozen candidate | plan 08 records from an older tree |
