# Plan 08 — Per-member state cache in the gateway (Artemis 31B, one 3090)

**Status: BUILT, OFF by default, 2026-10-26 (see Decision).** Follows plan 07 (`07-inference-engine-eval.md` §Recommendation): llama.cpp b11888 plus a
gateway member-state cache, on the recorded layout (per-member heads, per-turn blocks at depths 1-4; the stable head is
rejected, plan 06 §Depth revert).

## Design

- Module `server-plugin/story-orchestrator-gpu/broker/memberCache.mjs`, used by the gateway (`gateway.mjs`) and by the
  bench (`bench-controller.mjs` arm `memcache`), so the bench measures the shipped code. Config `memberCache`, off unless
  `enabled: true`.
- Member key: sha1 of the first `headChars` (2000) prompt characters (the member's head; heads diverge at character 172
  on the recorded corpus). Only streamed `/completion` requests (SillyTavern's chat replies) of at least `minPromptChars`
  (16000) are planned.
- Cut: the first in-history system block (`cutMarker` `<|turn>system\n`, second occurrence: the depth-4 Author's Note /
  Story Orchestrator blocks), kept only when at least `minCutChars` (8000) precede it and `minTailChars` (1200) follow.
- Before the chat request (inside the text lane, after the context count): when another member holds the slot and this
  member has a saved state, `POST /slots/<slot>?action=restore`; then a prefill of the prompt up to the cut
  (`n_predict: 0`) so llama-server checkpoints at the stable boundary; then the request as sent.
- After the reply, still inside the same text-lane turn (so nothing else touches the slot or the GPU): only when no text
  request and no image is waiting, rewind the slot to the cut (the same prefix, `n_predict: 0`; restores from the cut
  checkpoint) and `action=save`. A request already waiting skips the save; one that arrives during the save waits for it
  (llama-server cannot cancel a slot save; measured below). Restore and save failures drop the entry and run cold; they
  never fail the request. A member still in the slot (same member again, swipe) is not restored.
- Where states live: see §Store decision (measured). Budget `budgetMiB` (6144) over the state files, least recently
  used evicted first; a save is refused when RAM available minus one state would fall under `reserves.ramMiB` +
  `ramHeadroomMiB` (0); image admission first drops states (scheduler hook `onImageRam`) while RAM available is under
  the image's need + reserve. The state folder is wiped at start (states from another process are not trusted).
- llama-server flags with the cache on: `--slot-save-path <memberCache.dir>`, `--ctx-checkpoints <ctxCheckpoints>` (3
  unless the config sets `ctxCheckpoints`: the cut checkpoint must survive the request's own two). `cacheRamMiB` 0 is
  recommended (a 1.2 GiB state does not fit the default 512 MiB prompt cache anyway).
- `/status` → `memberCache`: entries, sizeMiB, hits, misses, resident, restoreFailures, saves, skippedBusy, skippedRam,
  evictions, evictedForImages, restore/prefill/rewind/save ms p50, save max.
- Side passes: not cached. Same corpus, best shared prefix with any earlier prompt of the same role: inner beat 116-786
  characters of 2.9-4.9K (8 prompts), read 394-459 characters of 9.0-9.9K for 6 of 8 (two late reads 7.7K and 8.9K, a
  near repeat). A per-role cache would restore a state to reuse ~100-200 tokens: not built.

## Predeclared floors (written before the cache bench; recorded rotating corpus `corpus.json`, b11888, MTP 2)

Against the no-cache arm of the same session (`mtp2`, same build):

1. Warm member switch (chat turns whose member state was restored or still resident): TTFT p50 ≤ 4.5 s (07 target
   3.5-4.5 s) and ≤ 60 % of the no-cache chat TTFT p50.
2. Cold chat turns: TTFT p50 ≤ 110 % of no-cache.
3. Side TTFT p50 ≤ 105 % of no-cache; decode chat within ±3 %.
4. GPU free after load and minimum: no lower than no-cache by more than 128 MiB.
5. RAM available minimum during the run ≥ 10,240 MiB (reserve 2,048 + ComfyUI staging 8,192), as plan 06.
6. Save p50 ≤ 1.5 s and max ≤ 5 s on the quiet machine; restore p50 ≤ 1.0 s.
7. Output: 3-5 chat prompts at full length (1,024 tokens, thinking on) with the cache: coherent, every reply closes its
   thinking (restoring changes the batch split, so byte-identical text is not required).

Swap to b11888 only if its `base` and `mtp2` arms are within ±5 % TTFT and ±3 % decode of b11388 (plan 07 floor).

## Results 2026-10-26 (GPU 01:54-02:46Z, about 52 min)

Machine: no gates, no other benches; lanes 30/31 (another agent's no-model suite) ran throughout, CPU 8-11 %. Owner's
controller stopped for every GPU block (bench owns llama-server on 18890; b11888 from a scratch config copy).

### Build parity (recorded rotating corpus, `text --arms base,mtp2`)

| Arm | Build | Chat TTFT p50 | Side TTFT p50 | Decode chat | MTP accept | GPU free after load / min |
|---|---|---|---|---|---|---|
| base | b11388 | 8.42 s | 2.08 s | 31.1 | | 2,613 / 2,325 |
| base | b11888 | 8.53 s (+1.4 %) | 2.06 s | 31.2 (+0.3 %) | | 2,536 / 2,077 |
| mtp2 | b11388 | 8.58 s | 2.17 s | 42.90 | 0.59 | 1,754 / 1,632 |
| mtp2 | b11888 | 8.61 s (+0.3 %) | 2.15 s | 42.89 (0.0 %) | 0.61 | 1,623 / 1,345 |

**Parity floor passes** (±5 % TTFT, ±3 % decode); 07's `base` decode dip was contention. b11888 leaves 130-290 MiB less
VRAM free. Runs `text-2026-10-26T01-54-00-497Z` (b11388), `text-2026-10-26T02-02-07-919Z` (b11888).

### Member cache (b11888, MTP 2, recorded corpus: 8 chat 7.9-9.6K tokens, 3 members rotating, 16 side passes)

| Arm | Warm chat TTFT p50 (range) | Cold p50 | Side p50 | Decode | Tokens processed | Restore | Rewind | Save | State file |
|---|---|---|---|---|---|---|---|---|---|
| no cache (`mtp2`) | | 8.61 s (all chat) | 2.15 s | 42.9 | 94,984 | | | | |
| rewind, C: | **4.50 s** (3.9-4.8) | 8.25 s | 2.13 s | 43.6 | 59,709 | 1.0-1.7 s | 1.0-2.9 s | 1.1-4.2 s (p50 1.9) | 1.55 GiB cold, 2.0 GiB warm |
| rewind, D: (SATA SSD) | 4.06 s (3.9-4.3) | 8.65 s | 2.13 s | 44.0 | 59,709 | 1.0-1.5 s | 1.9-2.8 s | 3.3-5.5 s | same |
| no rewind, C:, budget 8192 | 5.66 s (4.9-6.1) | 7.96 s | 2.13 s | 43.7 | 64,203 | 1.4-1.9 s | | 1.5-2.0 s, one 11.5 s | 2.0-2.1 GiB |
| no rewind, C:, budget 6144 | 1 hit (3 × 2.04 GiB overflowed the budget) | | | | | | | two at 32-33 s | |

- Rewinding to the cut halves the prefill on the next turn (0.8-1.0K vs 1.4-2.3K tokens): without it the restored state
  keeps only the newest 3 checkpoints of the previous reply, so the cut checkpoint is lost. It does not shrink warm
  files (both ~2.0 GiB: KV of ~8-9K tokens, the SWA ring and the checkpoints).
- RAM available minimum 12.9-13.5 GB (floor 10 GB), GPU free no lower than no cache.
- Output: 8 chat prompts at 1,024 tokens (corpus-chat8, 5 warm restores): every reply closes its thinking and opens in
  character; decode 41.2 tok/s, acceptance 0.48 (`text-2026-10-26T02-27-46-750Z`, rows keep the text).

Floors: 1 pass (4.50 s, 52 % of no cache; D: 4.06 s), 2 pass, 3 pass, 4 pass, 5 pass, **6 fail** (save p50 1.9 s, max
4.2 s with rewind but 11.5-52.9 s stalls elsewhere on C:; restore p50 ~1.4 s), 7 pass.

### Store decision (measured)

- No RAM disk exists on this host (drives: C: NVMe 92 % full, D:/E: SATA SSD, F:/G:/H: HDD, I: a FAT32 USB stick named
  GPUUNLOCK); a RAM disk would need a driver install, which is out. llama-server writes and reads slot states only as
  files under `--slot-save-path`.
- Extra slots instead of files: one slot per member costs ~0.45 GiB of VRAM each (plan 06) with 1.3-1.6 GiB free under
  MTP: does not fit, and does not scale past two or three members.
- Files on C: (NVMe) save 2-3 × faster than on D: (SATA, 3.3-5.5 s); restores are the same (Windows file cache). So
  states live on C: under `<stateDir>/member-states`, measured and documented. Cost: ~2 GiB written per saved reply
  (disk wear) and unbounded save stalls when C: is busy (11.5, 32.5, 33.2, 52.9 s seen; 07 saw 11-63 s).
- An in-gateway RAM buffer would still have to write the file back before every restore, adding a copy in front of the
  request: not built.

### Live check (lane 42, toy four-member group, 7 player turns, real generation through the controller, thinking on)

Controller from this branch with b11888, MTP 2, `cacheRamMiB` 0, `memberCache` on (budget 8192), scratch `stateDir`.
Scenario `C:\dev\so-lanes\bench-controller\08\live-member-cache.scenario.json`, 17/17 steps ok, sandbox cleanup clean.

- The toy chat stays at 0.4-3.4K-token prompts, so only 2 of the chat replies reached `minPromptChars`. Both saves were
  **skipped as busy**: a request (the next member or a side pass) was already queued when the rewind finished, so the
  rewind (1.2 s) delayed it and nothing was saved. In a group turn the next request follows a reply within about a
  second; the idle gap the design needs does not exist between member replies, only while the player types.
- Seeding states through the gateway with 6 s gaps (4 corpus chat prompts): 3 saves, one hit; the third save stalled
  **52.9 s** on C:, and the next request waited behind it (TTFT 52.3 s).
- Image through the controller with 3 states held (5.1 GiB of files): `swap-text` (MTP leaves ~1.4 GiB, under the
  stream minimum, as before), render 22.3 s, reply after 128 tokens at 51 tok/s, RAM available 12.5 GB before and 13.6 GB
  at admission (need 9.1 + reserve 2.0), no eviction needed, GPU reserve never crossed.

### Decision

- The cache ships **off by default** (`memberCache.enabled`), with `rewind` on when enabled. It meets the TTFT floor on
  the bench but not the save floor, and live it either saves nothing (no idle gap in group turns) or blocks the next
  request behind a disk-bound save. Not enabled on the owner's controller.
- b11888 passed parity, but without the cache it buys nothing and leaves less VRAM free: the owner's controller stays on
  b11388 + MTP 2. b11888 stays at `C:\dev\tools\llama-b11888-cuda12.4`.
- What would make it pay: saving off the request path (a llama.cpp change that saves asynchronously or into host RAM
  keyed by member), or saving only while the player types (after the last member of a group turn).

## Gate record 2026-10-26

- GPU 01:54-02:46Z (~52 min): parity 4 arms (b11388 first; the first b11888 attempt failed at spawn on a bad path in the
  scratch config, no GPU), memcache arms C: rewind / no rewind, D: rewind, final no-rewind budget 8192, full-length 8
  prompts, live lane 42 (~6 min), seeding 1.5 min, image 1 min, controller loads.
- Runs: `text-2026-10-26T01-54-00-497Z`, `02-02-07-919Z`, `02-09-42-107Z`, `02-18-21-535Z`, `02-23-02-412Z`,
  `02-27-46-750Z` under `C:\dev\so-lanes\bench-controller\`; logs, live config, scenario, live log, `image-live.json` in
  `bench-controller\08\`. State files deleted after the runs.
- Owner's controller config untouched; owner's controller restarted on master with its config (`cli.mjs start`).
- `npm run gates` from `C:\dev\so-memcache`: run 1 RED at `test` (jest transform cache `EPERM` in the shared temp folder,
  environment; every other step green, `test:release` not run); run 2 on `91df3cc6`'s tree: **all green in 295.6 s** (11
  steps, Storybook included, no `--resume`). `npm run test:plugin` 375 tests, 370 pass, 0 fail (5 skipped).
  `npm run gates:quick` green. No GPU work ran during the gates.
