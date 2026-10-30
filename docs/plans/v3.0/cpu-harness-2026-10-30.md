# CPU harness items 2026-10-30 (branch `v3.0-harness-cpu`)

Rows C-H1..C-H5 of `gpu-queue-2026-10-30.md` §3. CPU only: no GPU, no model call, no lane run, never lane 0 or :8000,
nothing staged. Recorded here, not in the queue doc, to avoid a conflict with the peer session editing it.

## C-H1 D-EB3 "Promise was collected" (diagnosis)

- Done on v3.0-harness-cpu `dfe97c6d`: diagnosis, a bare-Chromium probe, a reproduction switch. The `evaluateInST` job
  workaround stays in place.
- Evidence already recorded (00-overview §End batch 2): the CDP answer is `{"code":-32000,"message":"Promise was
  collected"}` 150-400 ms after `Runtime.callFunctionOn` (`awaitPromise`). Playwright 1.58 rewrites it to "Execution context
  was destroyed". It happened on `extract` (J6.11, J6.12) and `delete` (J6.3), each right after a group chat save. There was no
  navigation, the in-page work finished, and an in-page probe holding the `runExtractionNow`/`emit` promises saw them settle.
- Mechanism: V8's inspector holds the `awaitPromise` handler weakly, through the then/catch callbacks on the promise that
  `utilityScript.evaluate` returns (Playwright `_promiseAwareJsonValueNoThrow` wraps it in an async IIFE). The answer
  fires only if a GC finds that chain unreachable.
- Ruled out on CPU:
  - ST request compression (`compressRequest` gzips in a worker, so a promise could resolve only through an unreferenced
    Worker): `requestCompression.enabled: false` in ST's `config.yaml`, which the lanes share.
  - ST save waits: `waitUntilCondition` and `withTimeout` hold their resolvers through timers, which are GC roots.
  - A held chain: harness `extract` awaits `runExtractionNow` directly, so a promise the probe held keeps the whole
    harness chain reachable. JS-level reachability does not explain the failures in the probe-on batch `12-41-49-596Z`.
- Bare-Chromium probe (`scripts/spike/d-eb3/promise-collected-probe.mjs`, Chromium 145.0.7632.6, the lane browser's build;
  port 9477, no ST). Result in `scripts/spike/d-eb3/result-2026-10-30.txt`. Every arm ran under forced GC
  (`HeapProfiler.collectGarbage`) plus about 8 MB `JSON.stringify` allocation storms; the `+reconnect` arm also ran a
  second Playwright CDP client that connects and disconnects throughout.
  - Control, a truly unreachable promise: 6/6 give the exact harness error ("Execution context was destroyed, most likely
    because of a navigation"), so the probe can see the failure.
  - Held timer, plain timer and unreferenced-Worker leaf: 0 failures in 160 runs (20 per arm and reconnect variant).
- Best-supported trigger: a GC during the group chat save drops the inspector's weak `awaitPromise` handler, although the
  JS chain stays reachable (the probe-held promises settled). Candidates are an inspector-side or Blink-side drop, not our
  code or ST's save path. Not pinned: it needs the real page, its heap and its group save.
- Reproduction switch: `SO_EVAL_JOBS=off` makes `evaluateInST` use the plain awaited `page.evaluate` again (test in
  `evaluate.test.mts`). Recipe, owed and not GPU: on a no-model lane with a long group chat (J6 none checks), `SO_EVAL_JOBS=off
  DEBUG=pw:protocol node scripts/debug/st-lanes.mts batch --lanes <30-34> --repeat 3 --strict --fresh-page --model none J6`.
  Then grep the protocol log for `Promise was collected`, and diff `Runtime.getHeapUsage` around the failing call.

## C-H2 D-EB6 `so-run-header` guard

- Done on v3.0-harness-cpu `c9a9deca`. `capture`, `diff` and `show` refuse, exiting 2 before connecting, when the target ST
  URL is `:8000` (the owner's SillyTavern) or the CDP endpoint (`ST_DEBUG_CDP_PORT` or the debug dir's `session.json`) is
  `:9222` (the shared browser). After connecting they check again against the page URL and the attached session.
  `--owner-st` is the explicit ask. On a lane (`st-lanes run <n> --`) nothing changes: every in-repo caller
  (`integrationRuns`, `sessionStop`, `so-session`) already runs it in a lane.
- `scripts/debug/lib/ownerStGuard.mts` with tests (`ownerStGuard.test.mts`), including a spawned unlaned
  `capture`/`show`/`diff` that exits 2 with no browser.

## C-H3 J13 arm in the batch list

- Done on v3.0-harness-cpu `96eca1aa`. A batch list journey row may carry `args`, limited to `--judge-uses` and
  `--warden-mode` as flag/value pairs; `--warden-mode` needs `--judge-uses`. The census refuses args on scenario or script
  rows, a lone flag and a foreign flag. The batch item becomes `"<target> <args>"`. `st-lanes` passes the args to
  `so-journey run` and refuses a malformed arm before any row starts.
- `controller-regression.json` base `j13-judged`: `--judge-uses houseRules --warden-mode auto` (the on arm, A2-2). The off
  control arm (`--judge-uses off`) is needed only for `so-judge reply-effect`, so it is not added.
- A2-2 command (GPU, owed, model lane on L): `node scripts/debug/st-lanes.mts batch --lanes 45 --strict --list
  controller-regression:base --model judged`. It runs GS1, J5, and J13 on its arm. For J13 alone:
  `... batch --lanes 45 --strict "J13 --judge-uses houseRules --warden-mode auto"`.

## C-H4 replay prep

- Done on v3.0-harness-cpu `0e5f430f`: `scripts/debug/so-prefix-drift.mts summary [--out f]` and the base list row
  `prefix-drift-a0`.
  - It reads `storyOrchestratorPrefixDrift` on the same page right after a GS1 row (no reload between).
  - It exits 1 when a reply key's pair diverged above the per-turn boundary (a finding, never a retune), or when there is no
    reply pair (nothing measured). Side keys are reported but never gate.
  - The read is valid on a replay lane too: the prompts are still built. Tests: `so-prefix-drift.test.mts`.
- Found while writing the commands: `batch --record` refuses a lane that is not pointed at the replay backend. So the
  model lane is switched to replay mode for the recording run (`replay <n> on` forwards to the controller, upstream
  `http://127.0.0.1:18888`) and switched back afterwards. The queue's REG-2 line `batch --lanes 45 --record ...` misses
  this step.
- Store naming:
  - Name: `<set>-<config>-<bundle12>`. `<set>` is `gs1`, `base` or `cache`. `<config>` is the adopted controller config
    label (`L`, `L-a2`, `L-a2-27`, ...). `<bundle12>` is the first 12 hex of the staged `bundle.sha256`.
  - Example: `gs1-L-a2-9aec23d35ee4`.
  - Stores live in `<so-lanes>/replay/<name>` (`replayStorePath`).
  - Why: a store's identity is model + llama.cpp build + ctx only. Two adopted configs on one binary (light sleep, cache
    keys) would otherwise share a store, and a restaged bundle would show up only as refusals.
- Commands, all owed (GPU for `--record`, lane seeding for 36-37). On the adopted config, with the owner's "resume":
  1. `node scripts/debug/st-lanes.mts stop 45` and `node scripts/debug/st-lanes.mts replay 45 on`.
  2. `node scripts/debug/st-lanes.mts start 45`, then
     `node scripts/debug/st-lanes.mts batch --lanes 45 --strict --record gs1-<config>-<bundle12> GS1`.
  3. A0 right after, with no reload: `node scripts/debug/st-lanes.mts run 45 -- scripts/debug/so-prefix-drift.mts summary
     --out <batch row dir>/prefix-drift.json` (REG-6).
  4. `node scripts/debug/st-lanes.mts batch --lanes 45 --strict --record base-<config>-<bundle12> --list
     controller-regression:base` (any + judged rows; J13 on its arm).
  5. Only if 28 C5 or the max profile is adopted: `... --record cache-<config>-<bundle12> --list controller-regression:cache`.
  6. `node scripts/debug/st-lanes.mts stop 45 && node scripts/debug/st-lanes.mts replay 45 off`.
  7. Replay R1, no GPU, lanes 36-37:
     - `node scripts/debug/st-lanes.mts batch --lanes 36,37 --strict --replay gs1-<config>-<bundle12> GS1`;
     - `... --replay base-<config>-<bundle12> --list controller-regression:base` (any rows only; `--replay` refuses judged);
     - `--replay cache-...` likewise;
     - for a refused request: `node scripts/debug/so-replay.mts drift <row>/replay.json`, then re-record live, never by hand.
- Lanes 36-37 seed, owed (not run now):
  - Seed them like lane 45, because GS1 is an Adolion story and replay keys on request bytes: `node
    scripts/debug/adolion-fresh.mts seed 36` and `... seed 37` at the same `adolion-fresh.pin.json` and preset overlay as 45.
  - Then `node scripts/debug/st-lanes.mts replay 36 on` and `... replay 37 on`, both with the lane stopped.
  - Same staged build as the recording.
  - Check: `adolion-fresh.mts check 36|37`, and `so-run-header capture` through `st-lanes run 36 --` on both lanes and
    on 45, with `build`, `campaign`, `sampler` and `prompt` equal.
- Owner-gated, left open (15 Unresolved): GS1 and J13 call the TypeSafe judge and the opencode authoring route, and replay
  does not replay those remote routes. Either they answer live on replay lanes (no GPU, not replayed), or the judge is
  switched off there. Not decided here.

## C-H5 p41 cast card text matches the showcase art

- Not done before this branch: `journeyCast` described copper hair and a mustard jacket, a grey-bearded keeper, and a black
  bob with glasses. The art given to the cards is wren, garrick and pim.
- Done on v3.0-harness-cpu `5725bb40`. Ash: short red hair, green eyes, a belted green tunic, brown boots. Bram: a young
  keeper with short black hair in silver plate armour and a long blue cape. Cleo: long silver hair, violet eyes, a purple
  witch hat and a long purple coat. Looks and outfits are adjusted to match.
- `SHOWCASE_AVATAR_LOOKS` + `cardTextProblems` (`pocCardArt.mts`): the p41 `card-art` step fails when a card's text no
  longer names its art's traits. Tested in `pocCardArt.test.mts`.
- Not changed: `poseCast` (Ivy, Oren, Nell) has the same text/art mismatch. The pose arms render from the art (Qwen
  edits), not from text, so it does not confound an SDXL arm. Owed: the next p41 run (GPU, image lane 33), whose SDXL arm
  A scores are not comparable with 18's.

## Gates

- Per item: `node --test` on each touched test file, `npm run debug:typecheck` clean, `npm run gates:quick` green (413.0 s,
  after C-H2/C-H3; the later items touch `scripts/` only, which gates:quick does not cover beyond typecheck).
- Full gates: see the line below.
