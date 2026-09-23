# v2.3 live-gate playbook — what to see, on which story, and how

The v2.2 gates found that harness failures present as product faults and that green checks can
push the thing they then verify. This playbook is the answer to "too many variables": every live
gate names its **story**, declares its **baseline and expected differences**, proves the
mechanism under test **actually fired** before asserting on its effect, states **what to watch**
per step, and gives the **commands**. Where a command does not exist yet, the script extension is
named here and built in the plan that first needs it. Revised 2026-09-20 after the peer review
(`review-astra-2026-09-20.md`): every recipe now carries a positive-activation prerequisite, so
none can pass because the thing it tests never ran.

## §0 — Bring the backend up first, or nothing below can run

Written 2026-09-22, after two sessions lost the live gate to the same sequence. **Do this before
any recipe in this playbook.** A dead backend does not look dead: `ctx.onlineStatus` and the
settings panel keep naming the model, `send` still posts the player's line, and every check fails
five steps later with its own unrelated symptom.

| step | command / action | what tells you it worked |
|---|---|---|
| 1 | `list-pods` (RunPod MCP) | the pod's `status`. All four pods on this account were `EXITED` at the end of 2026-09-22 |
| 2 | `pod-action start 8g1vdb619mk21u` — **$0.72/hr**, `IDLE_MINUTES=30`, `MAX_UPTIME_HOURS=8` | `RUNNING`. **This may be refused by the session's safety classifier** (it was, twice, on 2026-09-22); then only the user can start it, and the live gate stays NOT green |
| 3 | if it will not start, create an **equivalent** pod in the same DC (`EU-RO-1`) on the same volume (`x9gi6f1rig` → `/workspace`), stating the price first | a fresh equivalent pod came up first try when the old one's host had no free GPU. An EXITED pod can hold the GPU *and* the volume; a new one in the same DC still claims them |
| 4 | publish `8080/http` (`update-pod … ports: ["22/tcp","8080/http"]`) | the RunPod HTTPS proxy then reaches the container's loopback `llama-server`. **An `update-pod` restarts the container**, so the model reloads (~3 min for the 19 GB GGUF). No SSH tunnel is needed, and no `--host 0.0.0.0` either |
| 5 | verify with a REAL completion, not a status field: `curl -s -o /dev/null -w '%{http_code}' https://<podId>-8080.proxy.runpod.net/v1/models` | `200`. A **404** means the pod is down (the proxy has no target) — that is how the 2026-09-22 outage was confirmed, after `curl` to the old `127.0.0.1:18080` route was unavailable |
| 6 | point the CM profiles at `https://<podId>-8080.proxy.runpod.net` and **write down the previous `api-url`** (`Artemis RunPod RP` and `Story Orchestrator Memory RunPod` both point at `http://127.0.0.1:18080` in the shipped state) | the settings panel shows the profile as selected and the model name |
| 7 | **re-select the profile**: `MSYS_NO_PATHCONV=1 node scripts/debug/st-actions.mts slash "/profile <name>"` | `ctx.onlineStatus` reads the model name and `#send_but` is no longer `displayNone`. A page loaded while the backend was dead keeps the button hidden and **`st-session.mts reload` does NOT clear it** — it re-probes at load and fails again |
| 8 | `node scripts/debug/st-session.mts reload` after every `npm run build` | the served bundle hash in `so-run-header` changes with the build; a plain reload can re-execute the cached bundle (plan 08's ETag trap) |
| 9 | `node scripts/debug/so-run-header.mts capture --label <name>-start` before the first run and `diff` after | only the declared differences. **After 2026-09-22 the header also records `bundle.served`** (the hash of what the page is running) and warns when it differs from `dist/manifest.json` |
| 10 | restore the profiles to `http://127.0.0.1:18080` when the session ends | repointing a CM profile is an install-wide change |

## Reference stories

| Story | Where | Use it for | Why |
|---|---|---|---|
| **Adolion: The Adventurer's Road** (`adolion-adventurer` v9) | `C:\dev\adolion-campaign\build\story\adolion-adventurer.story.json`; group `1789797226071` on this install (a fresh host gets its own id); requires `Adolion World`, `Adolion Adventurer Checkpoints`, `Adolion Chronicle`; curator allowlist `Adolion Chronicle` | **The playthrough story.** Every plan's "real play" gate, the human player session, J12 | 14 anchors in one chain, 14 extractor qualities (enum/bool/int, latching), 4 `cast_changes` checkpoints, per-checkpoint `talk_control`, a 264-entry world book (INTEGRATION.md), a curator allowlist. Live-gated on Artemis (campaign INTEGRATION.md R7). It is the only story that composes everything at once |
| **Adolion: House Nightriver** (`adolion-academy` v11) | same folder; group `1789797226079`; requires the same `Adolion World` and `Adolion Chronicle` **plus** `Adolion Academy Checkpoints` and `Adolion - Aegis City Noble Life`; curator allowlist `Adolion Chronicle` | The **second chat/story** in every switch, ownership and effect-restore gate; the human author session | A different group and story. **It shares the world book and the curator-writable book with the adventurer story**, so a cross-chat write is unambiguous only by chat id and sentinel, never by book name (see plan 03) |
| `quest-for-the-sun-ruins` | `examples/sun-ruins/` (shipped example; every journey imports it from there) | Regression fixture for journeys J1–J7; the unfamiliar-player session **after** its sampler overlay is dropped (S4) | It is what every archived matrix ran on; keep it as the constant, not as the playthrough |
| `two-ways-across` (review) | `test/fixtures/` after plan 01 | **Authored** branching only: two authored routes to one anchor | It has no stub and no expansion (`checkpoints`/`transitions` are all authored), so it proves nothing about R9 |
| `generated-fork` (new, plan 07) | `test/fixtures/generated-fork.story.json` | Generated branching (R9): one stub whose recorded expansion has two outcomes | The only story where `outcomes[1]` exists to be lost |
| `effects-preset` (new, plan 06) | `test/scenarios/effects-preset.story.json` | The preset diagnostic, after the sun-ruins overlay is removed | A dedicated preset fixture so removing S4's overlay does not remove the only preset test |
| Journey stories (`SO-J*`) | `test/journeys/` | The automated matrix | Unchanged |

Rule: a gate that says "real play" plays the adventurer story from `guild-hall` unless the recipe
names another. The academy story is the "other chat". Sun-ruins is never the playthrough.

## Per-experiment baseline, expected differences, positive activation

Every live run starts with a **run header** and ends with one, both archived next to the run:

```bash
node scripts/debug/so-run-header.mts capture --label <plan>-<gate>   # NEW (plan 01 §A0, before P0)
```

It records: HEAD commit + `dist/manifest.json` hashes (plan 08), ST version, `st-context mainApi
onlineStatus`, the Connection Manager profile for main and extraction, `so-judge status` (plugin,
model id, every `judge.uses.*`), `stagecraft.curatorEnabled/acceptMode/wardenEnabled`, extraction
`cadence/stabilityLag/profileId`, the open group id and chat id, the story id + `playedVersion` +
`contentHash`, author-view flag, the group's `disabled_members`, and the **inventories** S12 and
S8 need: `v2Stories` ids+versions, `wizardSessions` keys, the global lorebook selection.

**The rule is not "one variable".** Journeys create chats and stories, a switch gate changes the
chat by design, and a phone-width run is a different viewport. The rule is:

1. Each recipe names its **baseline run** (an archived header) and lists the header fields that
   are **expected to differ** from it. `so-run-header diff` fails on any *other* difference.
2. Each recipe has a **positive activation** line: evidence that the mechanism under test ran
   (a started call, a journaled pass, a captured request). Without it the recipe is not a gate.
3. Each recipe asserts on **state or requests** (`so-state`, the journal, a captured payload,
   the judge ring, a lorebook read-back), never on a toast or a UI label alone.
4. Where the outcome is a real model's choice, the assertion is on whatever the model chose
   (v2.2 rule), and a deterministic `storyOrchestratorDebug*Response` run proves the enforcement
   separately.

Standing reference configuration for v2.3 ("**REF**"): judge off, curator off, warden off,
cadence 3, stabilityLag 0, Artemis RunPod profile for main and extraction, author view off,
Tobias enabled in the adventurer group. P0 is played at REF. A recipe that needs the judge or a
curator says so; its baseline is then the nearest archived run at that configuration, and the
Gate record names it.

## P0 — the adventurer characterization run (before plan 01's fixes)

Nobody has played a story end to end. P0 is an **observational characterization** of the shipped
tree at REF, so that later work can be read against what a real session looked like. It is not
a causal baseline (later runs change code, configuration, transcript and route at once) and it is
**not** the v2.2 judge-on player session (that rubric requires the judge on; it is run at plan 11).

P0 depends on two scripts that plan 01 builds first as its §A0 (`so-run-header`, `so-journal
follow`); plan 01 §A0 lands and is gated before P0 starts. Nothing else of plan 01 precedes P0.

Setup (once):

```bash
node scripts/debug/st-session.mts start --headed
node scripts/debug/so-library.mts                       # adventurer v9 present? else import from build/story/
node scripts/debug/st-navigation.mts open-group 1789797226071
node scripts/debug/st-navigation.mts new-chat
node scripts/debug/so-run-header.mts capture --label p0-start
node scripts/debug/so-journal.mts follow --out test/journeys/records/p0-adventurer/follow.jsonl   # NEW (plan 01 §A0)
node scripts/debug/st-payload.mts arm --persist --out test/journeys/records/p0-adventurer/payloads.jsonl   # every generation's request, in the archive (plan 01 §A0)
```

Two roles, two screens. The **player** plays in the browser and sees nothing below. The
**observer** runs `follow` in a terminal and keeps the watch table; the table names hidden
qualities and the intended route, so it must not be in front of the player (Astra Q6).

Observer's watch table:

| Checkpoint | Expected in `follow` / `so-state current` | Known trap | If refused or stuck |
|---|---|---|---|
| `guild-hall` | Within ≤ 3 boundaries of the player taking the job: `DELTA path="wendhope"` with evidence quoting the player; transition to `road-to-wendhope`; transition `/comment`; `cast_changes` disables Tobias | If nothing moves in 6 boundaries, read `cadence` in the header before blaming extraction (S11) | Record the boundary count; do not nudge with `/cp` |
| `road-to-wendhope` | `reached_walls=true`; Tobias never drafted (talk decisions) | Away-recap popup on a new chat (S3): dismiss, flag | — |
| `at-the-walls` → `first-night` | `inside_wendhope`, `survived_first_night` latch; memory facts appear; scene tracker absent (judge off) | — | — |
| `what-wendhope-knows` → `into-needlehaven` | `evidence` climbs to ≥ 3 and never decreases; `knows_spirit` | An int that decreases is a flag | — |
| `the-lord-spirit` | `spirit_outcome` latches `destroyed` or `appeased` | The only exit needs one of the two. **Refusing both is the plan 07 experiment and is played in a branch chat** (`/newchat` from a saved point), never in the main P0 run, or the run cannot reach the remaining anchors | — |
| `after-the-fog` → `driftmere` | Tobias re-enabled then disabled again; `next_job=god_eater`; `entered_mines` | Group `disabled_members` after the run must match the header (S2) | — |
| `the-first-descent` … `the-devourer` | `descent` ≥ 1 then ≥ 4; `knows_devourer`; `past_the_seal`; `devourer_outcome` | — | — |
| `what-filwern-left` | `visitedAnchors` lists all 14; `so-journal export` | — | — |

Recorded, beyond the header and the journal export (Astra Q6):

- the raw chat file (transcript with swipes and edits), message ids, timestamps, and every manual
  intervention (a dismissed popup, a swipe, an edit, a reload) with its time;
- per extraction read: window, trigger reason, scope, raw response, rejections, and the boundary
  it applied at (`follow` prints these; the `.jsonl` is the record);
- every generation request as sent (`st-payload` persisted captures) with the drafted member;
- the persisted blob before and after (`so-state current --full` at start and end), the group's
  `disabled_members`, the global lorebook selection;
- first-attempt failures, retries, boundary latency, and any anchor not reached, with the reason.

Score the v2.1 player rubric (the judge-off rows). Flag moments with the drawer ⚑ as you go.
Close with `so-run-header capture --label p0-end` and archive under
`test/journeys/records/p0-adventurer/`. Expected header differences start→end: chat id
(same), `disabled_members` (Tobias off at the end if the story left him so; recorded, then
restored), nothing else.

## Per-plan recipes

Each recipe: story · baseline and expected differences · positive activation · what to see · how
· scripts to extend.

### Plan 01 — evidence hardening

- **Story:** adventurer for J12; sun-ruins for the J1 overlay check; every journey once at REF
  on its own story.
- **Baseline:** P0 header. **Expected differences per journey:** chat id, story id (the journey's
  own), `v2Stories` gaining the journey story during the run and losing it at cleanup. Anything
  else (cadence, lorebook selection, `disabled_members`, wizard sessions, a *pre-existing* story
  id) is the S11/S12/S2/S8 failure.
- **Positive activation:** J12 asserts an audit with `reason: "cadence"` **and** no
  `runExtractionNow`, `/cp`, or authored trigger read in the journal (`follow` distinguishes
  `cadence` from `trigger:<quality>` and `stall`); the schema test is run against a planted
  fixture that must fail.
- **See:** `so-journey run J12` at cadence 3 reproduces the P0 first transition unaided
  (`path=wendhope`, `road-to-wendhope`); a planted typo'd `expect` key fails the schema test; a
  planted leak fails `--strict`; J0's recorded expected outcomes match (J0.3 `blocked`, the new
  J0.4 unguarded throw `fail`).
- **How:**
  ```bash
  node scripts/debug/so-journey.mts run J12 --strict            # group pinned by setup.group (a --group override is built in this plan)
  node scripts/debug/so-run-header.mts diff .debug/run-header-J12-start.json --allow chatId,storyId
  ```
- **J12 as written (2026-09-22) creates no assets, so there is no `SO-J12` marker to clean.** It
  plays the **library's** `adolion-adventurer` record (`select_story`, group `1789797226071`), and
  the only host effects the story applies are its own `cast_changes` (enable Tobias/Belle/Dalan,
  which the story requires) and its checkpoint AN/WI. The `so-assets … --marker SO-J12` line this
  recipe used to carry was written before the journey existed and would have been vacuous.
  **Its first check also refuses to run at any cadence but the shipped 3** — on 2026-09-22 this
  install read cadence **1**, so J12 failed its own precondition rather than redefining itself.
- **Extend:** `so-run-header.mts` (§A0, with inventories); `so-journal.mts follow --out`;
  `st-payload arm --persist`; `so-journey --group` override + three tallies +
  `--require-human-record`; `so-scenario` closed schema + throwing verbs; `so-live-suite`
  per-tier floors; `so-assets --baseline`, `--legacy-mirrors`, cache evict.

### Plan 03 — async ownership (runs before plan 02)

- **Story:** adventurer (chat A, group `1789797226071`) and academy (chat B, group
  `1789797226079`). **Both stories share `Adolion World` and the curator-writable
  `Adolion Chronicle`**, so ownership is asserted by chat id and by sentinel, never by book name.
- **Baseline:** nearest archived judge-on run (v2.2 J11 header) — REF plus `judge.enabled`,
  `sceneTracker`, `loreSelect`, curator `review`. **Expected differences:** chat id (two), story
  id (two), `v2Stories` gaining a Studio copy of the adventurer story that declares
  `lore_select.lorebooks: ["Adolion World"]` (the shipped story declares none, so `loreSelect`
  would never fire — `loreSelect.ts:34–44`).
- **Positive activation:** in chat A, `so-judge calls --last` shows ≥ 1 **started** `sceneTracker`
  call and ≥ 1 `loreSelect` call, and the curator journal shows a pass started, all with chat A's
  id and message index, *before* the switch. A and B are brought to the **same message index**
  first, so an index-only check (C1) cannot pass by accident.
- **See:** the scenario starts the three reads in A behind a release barrier
  (`storyOrchestratorDebug*Response` resolvers held), opens B, then releases: B's proposals ring,
  scene record, injection registry, forced-WI map and judge ring are unchanged (sentinels: A's
  curator prompt is fed a proposal naming `SENTINEL-A`; B's rings are grepped for it); A's results
  are journaled `discarded` with `reason: "chat"`; switching back to A shows no application of the
  discarded results. Stale scene: **two** consecutive timed-out scene reads (the threshold is 2)
  then the Scheduler tab reads `stale` and the player line says "somewhere". S3: open the
  adventurer group → `/newchat` → send: no recap dialog, drawer at `guild-hall`. R10/R11: two
  distinct replies inside 250 ms commit two boundaries; two events for one message commit one.
- **How:**
  ```bash
  node scripts/debug/so-scenario.mts run test/scenarios/live-switch-mid-read.json --sandbox --group 1789797226071   # NEW: verbs hold_response / release_response / switch_chat, expect.discarded
  node scripts/debug/so-judge.mts calls --last 10 --chat                                                          # chatId + latencyMs per call
  node scripts/debug/so-turn-types-check.mts                                                                      # + the four identity cases
  node scripts/debug/st-navigation.mts open-group 1789797226071 && node scripts/debug/st-navigation.mts new-chat && node scripts/debug/st-actions.mts send "I look around the hall."
  node scripts/debug/so-ui.mts pipeline                                                                           # no recap dialog, checkpoint guild-hall
  ```
- **Extend:** `so-scenario` verbs `hold_response <use>` / `release_response <use>` (barrier over
  the existing debug-response globals), `switch_chat <group> <chatId|new>`, `expect.discarded`,
  `expect.judgeCalls: {use, chatId, atLeast}`; `so-state current` gains `scene.freshness` and
  `token.sessionEpoch`; `so-judge calls --chat`.

### Plan 02 — input authority

- **Story:** adventurer at `guild-hall` (R5/R6); a Studio copy with a hostile title **and** an
  invalidating change (R7; a title-only edit is `compatible` per `storyDiff.ts:229` and never
  opens the popup); the wizard against `Adolion World` (R8); `test/fixtures/placeholder-enums.story.json`
  for S1 (five placeholder latching enums authored in-tree; the campaign history holds only one
  at a committed path).
- **Baseline:** P0 header. **Expected differences:** `v2Stories` gaining the Studio copies;
  `wizardSessions` gaining the test session (marker `SO-P02`).
- **Positive activation:** the audit shows the planted candidate **in the raw response** and the
  exact rejection reason. A real model may or may not emit an out-of-scope delta for the planted
  `/sendas` line, so the enforcement proof uses a deterministic response
  (`storyOrchestratorDebugExtractionResponse = 'DELTA entered_mines value=true evidence="…"'`);
  the real-model run records whatever the model did and asserts only that nothing out of scope
  was *accepted*.
- **See:** a rejected `entered_mines` delta with reason `outside requested scope`, no blackboard
  change; a forged `DELTA` naming a code quality rejected `code-owned quality`; evidence not in
  the window rejected `evidence not in window` while the legitimate short evidence `"crossed"`
  (R6 harness) and a bare `yes` on a bool are **accepted**; the invalidating popup shows
  `<img onerror>` literally and the three buttons return their choice; the wizard refuses the
  **pre-created** upsert proposal into `Adolion World` (the scenario seeds the exact proposal;
  `wizard-apply 0` alone identifies nothing) and accepts into a book it created this session;
  diagnostics list all five placeholder enums.
- **How:**
  ```bash
  node scripts/debug/st-eval.mts "globalThis.storyOrchestratorDebugExtractionResponse='DELTA entered_mines value=true evidence=\"We entered the mines\"'; await rt.runExtractionNow(); return rt.getSnapshot().extraction.audits.at(-1).rejected"
  node scripts/debug/so-state.mts current --expect-absent bb.entered_mines        # NEW flag: `--expect x=undefined` compares the string "undefined"
  node scripts/debug/so-scenario.mts run test/scenarios/live-authority-real-model.json --sandbox --group 1789797226071   # real model: planted /sendas, assert accepted ⊆ scope
  node scripts/debug/so-ui.mts studio-save keep --title "<img src=x onerror=alert(1)>" --remove-quality evidence   # invalidating + hostile
  node scripts/debug/so-scenario.mts run test/scenarios/wizard-ownership.json --sandbox                                   # seeds the upsert proposal, expects refusal
  ```
- **Extend:** `so-scenario` `expect.rejected: [{q, reason}]`, `expect.accepted: [{q}]`;
  `so-state --expect-absent`; `so-ui studio-save --title --remove-quality`; a `diagnostics` verb
  in `so-ui studio`; `so-ui wizard-seed <proposal.json>`.

### Plan 04 — rollback invariant

- **Story:** adventurer, played to `first-night`; `Adolion Chronicle` for the curator writes.
- **Baseline:** P0 header plus curator `review`. **Expected differences:** curator flags; a
  Chronicle entry's content during the run (restored by the end).
- **Positive activation:** the preconditions are **seeded and asserted**, not hoped for: a fact
  superseded by the target message exists (`so-state current --full` shows `supersededBy`),
  two accepted curator rewrites of one Chronicle entry are journaled with their before-images,
  and `wi-status --hash` of the entry differs from its original before the rollback.
- **See:** edit the message that produced `inside_wendhope` to a text that **denies entry**
  ("We could not get past the gate tonight") — a later message can legitimately re-assert
  entry, so the edited suffix must not: checkpoint returns to `at-the-walls`, the world-info
  swap reverses, memory rows from that message are gone, the superseded fact is active again
  (M1), the Chronicle entry hash **equals** its original hash (R2); reload then edit an older
  message: still rolls back (R4); a 205-boundary scripted chat then edit message 0: the recovery
  notice with "re-read / restart", never silence, and `rollbackOutcome: unavailable` (E1).
- **How:**
  ```bash
  node scripts/debug/st-actions.mts wi-status "Adolion Chronicle" "<entry>" --hash > .debug/chronicle-before.txt
  node scripts/debug/st-actions.mts edit <messageId> "We could not get past the gate tonight."
  node scripts/debug/so-state.mts current --expect activeCheckpointId=at-the-walls
  node scripts/debug/st-actions.mts wi-status "Adolion Adventurer Checkpoints" "CP first-night - Scene"
  node scripts/debug/st-actions.mts wi-status "Adolion Chronicle" "<entry>" --hash | diff - .debug/chronicle-before.txt
  node scripts/debug/so-scenario.mts run test/scenarios/live-rollback-reload.json --sandbox --group 1789797226071   # NEW scenario; `reload` is an existing verb
  ```
- **Extend:** `so-scenario` `expect.rollbackOutcome: applied|noop|unavailable`,
  `seed_memory` (plant a superseded pair); `so-state diff <before.json>`; `st-actions wi-status
  --hash`.

### Plan 05 — provenance and pins

- **Story:** adventurer; one public fact about Belle pinned by hand **and** one private
  epistemic fact (`[hiding]`) pinned, so the private block is covered too.
- **Baseline:** nearest judge-on header (`memoryVerify` on, warden `review`). **Expected
  differences:** those flags.
- **Positive activation:** three captures, each after a real generation: **before** the edit
  (the pinned fact is in the payload and in the drafted member's private block), **after** the
  edit (absent, row `source-removed`), **after reconfirmation** (present, `source: author`). For
  the warden: a journaled warden pass that ran against the quarantined fact, plus a **positive
  control** — a planted live contradiction the warden *does* flag in the same session.
- **See:** the three payload states; a newer contradicting fact supersedes a pinned one (record
  kept, `superseded`); "Store anyway" rows read "kept by you"; an 80-word edit re-estimates
  tokens and the block respects the budget; a conflicted record is **absent** from injection,
  not ranked lower.
- **How:**
  ```bash
  node scripts/debug/st-eval.mts "rt.setMemoryPinned('<id>', true)"
  node scripts/debug/st-payload.mts arm && node scripts/debug/st-actions.mts send "…" && node scripts/debug/st-payload.mts last --member Belle > .debug/p05-before.json
  node scripts/debug/st-actions.mts edit <sourceMessageId> "…"
  node scripts/debug/st-payload.mts arm && node scripts/debug/st-actions.mts send "…" && node scripts/debug/st-payload.mts last --member Belle > .debug/p05-after.json
  node scripts/debug/so-ui.mts memory-queue reconfirm --index 0     # built 2026-09-22
  node scripts/debug/st-payload.mts arm && node scripts/debug/st-actions.mts send "…" && node scripts/debug/st-payload.mts last --member Belle > .debug/p05-reconfirmed.json
  node scripts/debug/so-journal.mts show --kind stagecraft --curator warden
  ```
- **The three verbs this recipe used to name now exist** (2026-09-22): `st-payload last --member`
  filters captures by the drafted member (filtering *before* slicing, or the newest capture for
  whoever spoke last pushes the member's own out of the window); `so-ui memory-queue` drives the
  panel (`keep|lock|reread|dismiss|reconfirm|discard`, `--key`/`--side`/`--index`); and
  `expect.payloadContains/Absent` is in the closed vocabulary, scoped by **block key** or by a region
  in a raw body, with an empty needle / unarmed ring / missing block / missing marker each failing
  rather than searching everything (the J5.8 false positive, encoded). The assertion's failure text
  names which of the four sources it searched — `current` (the next prompt's blocks), `capture` (a
  real generation's), `http` (raw bodies) — because a green line must not read as a claim about a
  request that was never sent.
- **The deterministic halves run without a backend** (both are plumbing, and say so in their own last
  step; **the live recipe above is what gates this plan**): `test/scenarios/plan05-pin-quarantine.json`
  plants a fact (mocked extraction), pins it, edits its source, and asserts the quarantine, the
  exclusion and the reconfirmation through the injected facts block;
  `test/scenarios/plan05-pin-private-rollback.json` does the same for a pinned `[hiding]` fact through
  the **drafted member's private block** (draft Arin → assert present → edit → assert absent and
  `source-removed` → reconfirm → assert back as `source: author`).
- **Extend:** `expect.memory.<tier>` takes `{count, contains, validity, source}` (built 2026-09-22);
  `so-state current --full` printing `provenance` per row is still open (the `payloadEntries` half
  exists).

### Plan 06 — host integration

- **Story:** adventurer, **two chats in the same group** (`guild-hall` enables Tobias,
  `road-to-wendhope` disables him); `effects-preset` (new fixture) on a textgen profile and on
  the Artemis chat-completion profile.
- **Baseline:** P0 header. **Expected differences:** chat id (two), `disabled_members` *during*
  the run, equal at the end; the main profile for the preset half.
- **Positive activation:** the effect ledger shows the `cast` write with its `before` for each
  switch; the preset half shows one `applied` (textgen) and one `unsupported` (chat completion)
  ledger row.
- **See:** chat 1 at `road-to-wendhope` (Tobias disabled) → chat 2 at `guild-hall` (enabled) →
  chat 1 (disabled) → leave the group: `disabled_members` equals the run header; on textgen the
  sampler values read back; on chat completion "Preset effect cannot apply on this connection"
  and no sampler change (**decision: chat completion is diagnosed unsupported in v2.3**); save
  failure: the scenario **blocks the chat-save endpoint** (`route.abort` on `/api/chats/*save*`
  from the harness; killing the model backend does not fail metadata persistence) → pipeline
  "changes not saved, retrying", then unblocks → recovered, and the read-back proves it; J5's
  final request bodies each carry their own planted secret only.
- **How:**
  ```bash
  node scripts/debug/so-scenario.mts run test/scenarios/live-effects-owned-restore.json --sandbox --group 1789797226071   # NEW; --group needs --sandbox
  node scripts/debug/st-context.mts mainApi && node scripts/debug/so-state.mts current            # effects.ledger + effects.unsupported
  node scripts/debug/st-payload.mts arm && node scripts/debug/st-actions.mts trigger Belle && node scripts/debug/st-payload.mts last --member Belle
  node scripts/debug/st-payload.mts arm && node scripts/debug/st-actions.mts trigger Dalan && node scripts/debug/st-payload.mts last --member Dalan
  ```
  (`st-payload watch N` prints captures from index 0 and exits normally on timeout; it is not a
  two-request assertion.)
- **Extend:** `so-scenario` `expect.effectsLedger`, `expect.groupDisabled: [...]`,
  `block_route <pattern>` / `unblock_route`; `so-state current` prints `effects.ledger` and
  `effects.unsupported`; `st-payload last --member <name>`.

### Plan 07 — generated branching and agency

- **Story:** `generated-fork` (new) for R9 with a real model **and** with a recorded two-outcome
  expansion golden; `two-ways-across` as the authored-branch regression; **adventurer at
  `the-lord-spirit`** in a branch chat for agency.
- **Baseline:** P0 header, then P0 + judge critic on. **Expected differences:** story id;
  `judge.uses.critic`.
- **Positive activation:** the expansion cache shows a beat with **two** validated outcomes
  (`expansion.state: inserted`, `outcomes.length ≥ 2`) before any route is played; for agency,
  the journal shows the player's refusal was read (a DELTA attempt or an `unclassified` record)
  and the policy `protect_player_choice` in effect.
- **See:** two transitions from the generated beat in `getPossibleTransitions()` and the Studio
  graph; each route reaches the anchor in its own sandbox chat; at `the-lord-spirit`, after
  refusing both destroy and appease: the next narrator reply never narrates you doing either,
  `spirit_outcome` stays unset, the world still answers (fog persists), and a **recovery is
  available** — the author view shows the policy plus a nudge/probe path, and the player line
  is the neutral one. (`the-lord-spirit`'s only exit accepts `destroyed | appeased`; a refusal is
  a stall by design, and the assertion is that it is an *honest* stall.) A beat whose guidance
  narrates the player's action is `needs-review`, not inserted. Precedence: with the policy on,
  pacing steering text contains no compliance phrasing (fixture list).
- **How:**
  ```bash
  node scripts/debug/so-scenario.mts run test/scenarios/live-generated-fork-a.json --sandbox      # NEW: real expansion, route A
  node scripts/debug/so-scenario.mts run test/scenarios/live-generated-fork-b.json --sandbox      # NEW: route B
  node scripts/debug/so-scenario.mts run test/scenarios/live-two-ways-bridge.json --sandbox       # authored regression (setup.extraction {profile: inherit})
  node scripts/debug/st-actions.mts send "I sheathe my blade and ask the spirit what it wants of Wendhope."
  node scripts/debug/so-journal.mts show --kind transition,payload,agency
  ```
- **Extend:** `so-scenario` `expect.transitionsFrom: {cp, atLeast}`, `expect.expansion:
  {state, outcomesAtLeast}`; `so-copilot context` prints the agency policy; the throwing
  semantic check helper for "reply does not narrate the player's action" (pattern:
  `live-plan04-pacing`). The bridge/ferry scenarios drop their hard-coded
  `profileId:'so-review-artemis', cadence:0` for plan 01's `setup.extraction`.

### Plan 08 — release reproducibility

- **Story:** adventurer, imported from `build/story/` into a **fresh** ST checkout with the
  campaign's install scripts **parameterized** (endpoint/port, profile creation, and a **new
  group** — the ids `1789797226071/79` belong to this install; `scripts/install_st.py` hardcodes
  port 8000 today).
- **Baseline:** P0 header. **Expected differences:** host commit, group id, chat id, bundle
  hashes (recorded, then compared to the tree's manifest).
- **Positive activation:** `dist/manifest.json` source-manifest sha and bundle sha equal those
  computed on the source tree; the clean-host script's exit codes are all zero.
- **See:** the bundle loads, requirements go green after the books are activated, J1 passes,
  and the P0 first transition happens unaided at cadence 3 in the fresh group. The toastr
  question is settled the way Astra asked: identical extension bytes under both host layouts,
  with resolved type files, lockfile and compiler version recorded per host.
- **How:** `scripts/release/clean-host.ps1 --st-commit <pin> --port <n>` then the P0 setup block
  with the fresh group id; archive `dist/manifest.json`, the host attestation and the run header.
- **Extend:** `so-run-header` reads `dist/manifest.json`; `so-library import <file>`; the
  campaign installer gains `--base-url`, `--profile`, `--create-group`.

### Plan 09 — player and author flows

- **Story:** adventurer for the player tasks and the next-turn preview (at `road-to-wendhope`,
  Tobias disabled; Narrator, Belle and Dalan remain candidates, so the preview's target speaker
  is verified against the **actual drafted member of the correlated request**, not inferred);
  academy in the Studio for the keyboard-only authoring pass; a phone-width run of J1/J3.
- **Baseline:** P0 header for the desktop checks; **its own** header for the phone run (viewport
  is a declared difference); the nearest judge-on header for the stale-scene preview check
  (P0 is judge-off, so a scene read never exists there).
- **Positive activation:** a freshly armed capture per compared turn (`st-payload arm` before
  each send; `last` without a new arm returns the previous capture); for the stale case, two
  timed-out scene reads journaled.
- **See:** the preview's ordered contributors equal the captured payload's, per drafted member,
  for one solo and one group turn; a stale scene reads "stale" in the preview; Start / Continue /
  Repair reachable from the settings panel and the drawer; settings groups carry a lifetime
  label; Studio arrow keys move between tabs and `aria-controls` points at the panel;
  `assert-player-clean` green.
- **How:**
  ```bash
  node scripts/debug/st-payload.mts arm && node scripts/debug/st-actions.mts trigger Belle && node scripts/debug/so-ui.mts next-turn --member Belle && node scripts/debug/st-payload.mts last --member Belle
  node scripts/debug/so-ui.mts assert-player-clean
  ST_DEBUG_VIEWPORT=390x844 node scripts/debug/so-run-header.mts capture --label p09-phone && ST_DEBUG_VIEWPORT=390x844 node scripts/debug/so-journey.mts run J3
  node scripts/debug/so-ui.mts studio-keys                              # NEW: Arrow/Home/End over the tablist, reports focus + aria-selected
  ```
- **Extend:** `so-ui next-turn --member`, `so-ui studio-keys`, `so-ui settings` prints each
  group's lifetime label.

### Plan 10 — judge seeds

- **Story:** a Studio copy of the adventurer story with `lore_select.lorebooks: ["Adolion
  World"]` (264 entries: the "high amount of lore" case); the adopted-guide scenario for the WI
  create op (a recurring NPC the party takes on at `road-to-wendhope`, expected to fire by name
  eleven turns later).
- **Baseline:** the same story and transcript at judge **off** (a control run in the same
  session), then judge on for one usage. **Expected differences:** that one `judge.uses.*`.
- **Positive activation:** `so-judge calls --use lore` shows calls with Scores for the turn;
  the journal shows `force` events naming the picked entries. (Mentioning Belle and Dalan
  activates their keyword entries without the judge — INTEGRATION.md — so payload presence
  proves nothing; the assertion is on the forced set vs the judge-off control.) For the create
  op: a **positive** proposal first (an established guide gets one keyed Chronicle entry
  proposed in review mode), then the negatives (an unestablished name is never proposed;
  `createCap` holds).
- **See:** the forced set differs from the judge-off control by the judge's picks; the top-4
  has no tie fallback to `uid` order (levels + scores, not identical Nouls); the create card
  appears in review only and never in `auto`.
- **How:**
  ```bash
  node scripts/debug/so-judge.mts calibrate --use lore --record --min 0.85 --model jev-1.13.0     # --model is built in this plan
  node scripts/debug/so-lore-probe.mts arm && node scripts/debug/st-actions.mts send "Belle, what does Dalan make of the fog?" && node scripts/debug/so-lore-probe.mts dump --label lore-off
  # enable judge.uses.loreSelect, then the same send:
  node scripts/debug/so-lore-probe.mts arm && node scripts/debug/st-actions.mts send "Belle, what does Dalan make of the fog?" && node scripts/debug/so-lore-probe.mts dump --label lore-score
  node scripts/debug/so-ui.mts stagecraft                # create cards, review only
  ```
- **Extend:** `so-judge calls --use lore` prints per-entry level + score; `so-judge calibrate
  --model`; `so-lore-probe diff <a> <b>`; `so-scenario` `stagecraft: {action: "curate",
  expectKinds: ["create"]}` and `expect.stagecraft.createdAtMost`.

### Plan 11 — acceptance

**Start with §0.** The matrix cannot begin until a pod answers a real completion; on 2026-09-22 the
automated half ran (see `11-acceptance.md` §The run RESUMED) and the rest died when the pod hit its
8-hour cap, with the restart refused by the session's safety classifier.

- **Story:** the full matrix on the journey stories; the adventurer for the player session
  (judge on per the recommended configuration, curator and warden in `review` — this is the
  v2.2 judge-on player session, run once on the final tree); the academy for the author
  session; sun-ruins without the overlay for the unfamiliar player; `generated-fork`,
  `two-ways-across` and two newly authored stories for the branch proof.
- **Baseline and differences:** two matrices, judge off and judge on. J11 **toggles the judge
  inside its checks by design**, so the header is captured **per check** for J11 and the record
  states each check's configuration; the other journeys hold one configuration per run and the
  header proves it.
- **P0 vs final:** two separate comparisons, never one. (a) **Matched replays**: P0's transcript
  is re-sent turn by turn (`so-scenario` from the recorded player messages) at REF on the final
  tree; the diff of qualities, transitions, rejections and boundaries per turn is the
  behavioural change log. (b) The **natural-play** session above, scored on the rubric, with P0's
  flags alongside as context, not as a metric.
- **Concurrent load:** two **isolated browser sessions** (two `st-session` CDP endpoints on
  different ports, each with its own `SO_DEBUG_DIR`) driving two groups; two processes on one
  page are competing automation, not load.
- **See:** everything each plan's recipe listed, on one frozen candidate, twice; J0's expected
  outcomes per check; the recommended configuration **rewritten** from the final calibrations
  and the human sessions, not copied from v2.2.
- **How:** the plan's own deliverables; every run wrapped in `so-run-header capture` and
  archived with the journal export, the judge call ring and the per-check configuration record.

## Scripts this playbook adds or extends (built in the plan that first needs them)

| Script / verb | Plan | Purpose |
|---|---|---|
| `so-run-header.mts capture\|diff --allow` (with `v2Stories`, `wizardSessions`, lorebook-selection inventories) | 01 §A0 | Pin every variable of a live run; declared differences only |
| `so-journal.mts follow --out` | 01 §A0 | Live tail of the machine's view while a human plays, persisted |
| `st-payload arm --persist`, `last --member` | 01 §A0, 05 | Every request captured; per-member payloads |
| `so-journey --group` override, three tallies, `--require-human-record`, J0 expected outcomes | 01 | Journey gates that cannot pass vacuously |
| `so-scenario` closed schema, throwing verbs, `expect.rejected/accepted`, `expect.discarded`, `expect.judgeCalls`, `expect.rollbackOutcome`, `expect.effectsLedger`, `expect.memory[].validity`, `expect.payloadContains/Absent`, `expect.transitionsFrom`, `expect.expansion`, `hold_response/release_response`, `switch_chat`, `seed_memory`, `block_route/unblock_route` | 01–07 | One shared step engine (never a parallel runner); `reload` already exists |
| `so-state diff <before.json>`, `--expect-absent`; `current` gains `scene.freshness`, `token`, `effects.ledger`, `provenance` (`--full`) | 02–06 | Nothing-else-changed and absence assertions |
| `so-judge calls --chat --use`, `calibrate --model` | 03, 10 | Attribution, on-path budget, drift runs |
| `st-actions wi-status --hash` | 04 | Before/after equality |
| `so-ui next-turn --member`, `studio-keys`, `memory-queue`, `studio-save --title --remove-quality`, `wizard-seed` | 02, 05, 09 | UI verbs the gates need |
| `so-lore-probe diff` | 10 | Forced set vs judge-off control |
| `so-library import <file>`; campaign installer `--base-url --profile --create-group` | 08 | Fresh-host install without `st-eval` |
| `SO_DEBUG_DIR` + per-session CDP port (`ST_DEBUG_CDP_PORT`) | 11 | Isolated concurrent runs. **`SO_DEBUG_DIR` did not exist until 2026-09-22** — the port was configurable, the artifact directory was not, so two sessions shared `session.json`, the config snapshot and the asset baseline. Built in `lib/connection.mts` (`debugDirFor`) and guarded by `lib/connection.test.mts` |
| `so-responsive.mts --surface all` | 09 | The review's "24 views, no overflow" row, built 2026-09-22 and **runnable with no backend**: 24 viewports against the drawer, the settings panel and the Studio; reports our panels' horizontal overflow and any `[data-so]` control outside the viewport; exits 1 on a finding; restores the original viewport |
| `test/scenarios/live-switch-mid-read.json`, `live-authority-real-model.json`, `wizard-ownership.json`, `live-rollback-reload.json`, `live-effects-owned-restore.json`, `live-generated-fork-a/b.json`, `effects-preset.story.json`, `generated-fork.story.json`, `placeholder-enums.story.json`, J12, J0.4 | 01–07 | The new live regressions and fixtures |
