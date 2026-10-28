# Plan 13 — Prefix-stability gate (track A0)

**Status 2026-10-28 (current): MERGED to master with `v3.0-wave1-integration`, full `npm run gates` green, first capture
twice done (offline, end-batch captures), in-page recorder fires (no-model lane). See §Gate record: merge 2026-10-28.**
Earlier status (2026-10-26, history): built on branch `v3.0-a0-prefix-gate`, `gates:quick` green, not merged. Replan track A0 (`00-overview.md`
§Replan 2026-10-26), web idea 5 (`research/context-chunking-web.md`), boundary b from `research/fable-context-slicing.md`
§2–4. No prompt layout change, no model call, no GPU, no lane used.

## What it checks

Every cache gain (plan 08/09 member cache, prefill-to-cut, idle prefill) assumes a member's next prompt shares its
previous prompt up to the per-turn boundary b. A macro, timestamp, lore reorder or rewritten block above b silently turns
each warm switch into a full re-prefill.

- Pair = two consecutive prompts with the same key (drafted member, or resting; side passes keyed by role).
- Divergence = first differing character, raw text (no normalisation: a `{{time}}` in the head is the defect).
- b of the previous prompt = the second system turn (`<|turn>system\n`, the gateway's `historyCut` rule; ChatML / Gemma 3 /
  Llama 3 system markers too; for a rendered chat-completion prompt the first `### system` after history), else the earliest
  in-chat (`position` 1) `story_*` block found in the prompt, else the start of the newest non-empty message. None of these =
  `no-boundary`, which fails closed.
- Verdict: `identical` | `ok` (divergence ≥ b, so a checkpoint at the previous b survives) | `above-boundary` (with `lost` =
  chars re-prefilled above b) | `no-boundary`.

## What was built

- `src/runtime/prefixStability.ts`: pure core (`firstDivergence`, `perTurnBoundary`, `checkPair`, `checkSequence`), no
  imports, shared by jest, the debug tooling (imported by path like `termPresent.ts`) and the runtime recorder.
- Gate (D): `node scripts/debug/so-payload-golden.mts prefix <capture-dir | payloads.jsonl> [--declared f] [--out f]
  [--side-fails]` (`scripts/debug/lib/prefixGate.mts`). On a payload-golden capture dir it pairs captures per case by member;
  on a `st-payload.mts arm --persist` JSONL it pairs per chat (streamed request with a drafted member = reply key,
  non-streamed = `side:` + hash of the first 160 chars of the first turn). Reply pairs gate; side pairs are reported unless `--side-fails`.
  Exit 1 on a failing pair or a stale declaration. JSONL reports carry no prompt text (campaign-safe); capture-dir reports
  carry a 60-char excerpt at each failing divergence.
- Declared restarts `test/measurements/v2.7/payload/prefix-declared.json`: pairs where the key restarts on purpose and
  is not compared (group-lore-placement `*-authored -> *-late`: `worldInfo.lateLore` flipped; group-relationships
  `off-* -> on-market-*`: a second story imported). A declaration matching no consecutive pair is stale.
- Runtime diagnostic (no player surface, no setting): `GENERATE_AFTER_DATA` (non-dry, inside an open generation) records
  reply prompts keyed `reply:<chat>:<drafted member|resting>[:quiet|:impersonate]` (`prefixDriftHost.ts`, wired in
  `wiring/generation.ts`); every routed model call reports `side:<chat>:<role>` through a new optional
  `ModelCallDeps.prompted` (`modelCallCore.ts`, set in `modelCall.ts`; planted debug answers report nothing). The recorder
  (`prefixDrift.ts`, lazy chunk via `prefixDriftPort.ts`) keeps the last prompt per key (32 keys, LRU) and a ring of 200
  records `{at, key, kind, chars, divergence, boundary, source, verdict, lost}`, no prompt text. A reply key that breaks
  logs one `console.warn` (`[Story Orchestrator] prefix drift: …`, so page capture evidence carries it), later breaks of
  that key log at debug level. Read it in page: `globalThis.storyOrchestratorPrefixDrift.summary()` / `.records()` /
  `.clear()` (removed on stop, listed in `RUNTIME_GLOBALS`).

## How it is tested

- `src/runtime/prefixStability.test.ts` (15): synthetic Gemma 4 prompts with the recorded anatomy (one system head,
  history turns, depth-4/2/1 system blocks, generation tail): stable layout passes and diverges at the previous depth-4
  block; planted controls fail: clock churn in the head, lore reorder in the head, an older message rewritten; block-only
  change passes; no-block layout cuts at the newest message; block hints without markers; chat-completion rendering;
  a single-turn prompt has no boundary; no-boundary fails closed; `checkSequence` pairs per key.
- `src/runtime/prefixDrift.test.ts` (6): recorder verdicts, warn-once per reply key, side passes never warn, key LRU,
  summary, lazy port and handle, `prompted` fires before the transport and not for planted answers.
- `scripts/debug/lib/prefixGate.test.mts` (8): case grouping, planted head clock fails with excerpt, declared restart and
  stale declaration, no-boundary, JSONL grouping/keys/no text, side pairs reported vs gated, declaration shape, and the
  shipped declarations name real consecutive same-key captures in their fixtures.
- Commands run 2026-10-26 on the branch: `npm run gates:quick` green (typecheck, typecheck:test, lint, jest related,
  replay --cached 32/32 killed); `node --test scripts/debug/lib/prefixGate.test.mts scripts/debug/lib/payloadGolden.test.mts`
  22/22; `npx jest --testPathPatterns "guard|architecture|shippedSurface|stopRuntime|surface"` 281/281 (the codeHealth S8
  ratchet caught a copied withholding set, fixed to `withholds`). Not run: full `npm run gates`, `npm run build` (bundle
  budget: only `prefixDriftPort`/`prefixDriftHost` ride the main entry; the recorder and core are a lazy chunk).

## Recorded corpora (run 2026-10-26, CPU only, no lane)

`so-payload-golden.mts prefix` over the two harness recordings Fable used (`C:\dev\so-lanes\42\debug\v29gpu2\payloads.jsonl`,
`45\debug\s6h\payloads.jsonl`), reports written outside the repo, counts only. Exit 0 on both.

- Reply pairs: 265 (150 + 113 ok at the cut marker, 1 + 1 identical), 0 above the boundary: the same 265 pairs and the
  same verdict as Fable §3-4 (a checkpoint at b survives 265/265).
- Side pairs: 154 reported `no-boundary` (+36 identical), single-turn prompts; first divergence p50 526 / 652 chars into
  the prompt; the story read key alone p50 379 chars (about token 99, Fable §6), i.e. the value lines A1 reorders.
- Side keys hash the first 160 chars (`SO_PREFIX_SIDE_KEY_CHARS`): keyed by the whole first turn every read was its own key
  (the values sit in it) and nothing paired.

## Still needs a live run (no GPU)

Both rows below are done as of 2026-10-28 (§Gate record: merge 2026-10-28); kept as the recipe.

- First capture, twice: done (offline, end-batch captures). First capture on a no-model lane: `so-payload-golden.mts capture --label a0 --out <dir>`, then
  `so-payload-golden.mts prefix <dir> --declared test/measurements/v2.7/payload/prefix-declared.json`, twice. Expected
  same-member pairs: group-opening `opening-* -> turn-*`, commitments `open -> kept -> broken`, delivery `sheet -> repeat`,
  relationships `on-market -> on-docks`. A stale restart or a failing pair is a finding, not a retune: record it.
- Runtime recorder in a real browser session: one played group turn, then `storyOrchestratorPrefixDrift.summary()` shows
  reply keys per member with `ok` and side keys per role. Real generation only proves the hook fires; no GPU measurement.

## Gate record: merge 2026-10-28

Integration branch `v3.0-wave1-integration` (13, 14, 16, 17, plan 11 prep, F1/F3, 12 W2) merged with master `d2006d17`.

- `npm run gates` (no `--resume`) on the merged tree `cf249aa8`: all green in 300.9 s (build, typecheck, typecheck:test,
  lint, debug:typecheck, test 10,799 passed / 1 skipped, test:debug 1632/1632, test:replay, test:plugin, test:release,
  test-storybook:ci 167/167 suites). Main bundle 1,263,247 B (budget 1,300,000); `runtimeManager.ts` 621 lines,
  architecture guards green.
- Prefix gate over the end-batch payload captures (`C:\dev\so-lanes\32\debug\payload-endbatch\eb-1`, `eb-2`, coordinator,
  offline): exit 0 both, 21 pairs, 0 failing, 4 declared restarts, 0 stale.
- In-page recorder, no-model lane 35, branch `dist/` served by a route holder (not staged): a group trigger with ST's online
  status set in page (a no-model lane returns from `Generate` before `GENERATE_AFTER_DATA` otherwise) gave
  `summary()` = one reply key per chat and member, 1 pair, verdict `ok`, boundary from the cut marker, lost 0. Plumbing only;
  real-generation divergence on a model lane: owed (no GPU used).

## Deviations

- A prompt with a single non-empty turn has no newest-message boundary (it would sit at 0 and pass everything), so side
  passes are `no-boundary`: they record divergence and length only and never warn or gate. The runtime recorder sees the
  side prompt string our code builds (before ST wraps it); the JSONL gate sees the wrapped prompt.
- Payload-golden member captures render the first enabled member's card (README), so they gate head churn of what the
  extension stages, not of each card.
- A churning head changes `memberKey` (sha1 of the first 2,000 chars) in the gateway, but the extension-side keys here are
  member names, so the churn is a failing pair, not a silent new key. JSONL side keys hash the first 160 chars: a churning
  side-pass instruction shows as a new key (`keys … seen once` in the report).

## Unresolved questions

- Should the gateway also log first divergence per `memberKey` (web idea 5 literally says controller)? Left out: 08/09
  branches own `memberCache.mjs`/`gateway.mjs`.
- Gate the story read (`--side-fails`) once A1 reorders it?
