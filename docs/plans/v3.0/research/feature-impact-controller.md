# Controller performance changes: impact on every feature

Audit 2026-10-26. Offline only: no GPU, no lanes, no code edits. Sources: plans v3.0 06/07/08, `so-ctl3` branch
`v3.0-09-controller-round-3` (plan 09 + broker diff), `src/` on master `0940f561`, llama.cpp source
`C:\dev\tools\src\llama.cpp-b11888` (stock tag). The patch `so-cache-patch` (`252ca4d`, `8f17b1a`) was read through its
commit summaries. There is no b11388 source on disk, so every claim about b11388 is inferred. Labels: **S** source,
**M** measured in a plan record, **I** inferred.

Changes in scope:
- **MTP**: draft-mtp, n-max 2, greedy; about 0.9 GiB more VRAM.
- **409 fix**: an idle owned ComfyUI is stopped when a text reload is short of VRAM.
- **Median timing**: restore decisions use median prompt timing.
- **Cache**: patched b11888 plus the RAM member cache (`cache_key`, `cache_ckpt_max`, 4 GiB).
- **Planned**: a "max" memory profile with a tray headroom mode; idle/next-speaker prefill; concurrent side passes;
  request-supplied checkpoints.

## Facts that decide most rows

1. **Route reality.** Only these local roles hit the shared llama-server: `read`, `synthesis`, `curator`, `lore`,
   `inner` and `director` (talk). They use the memory-model profile (`passProfiles.ts:122-145`).
   - Everything is `stream:false`, carries no grammar, seed, slot or logprobs, and gets no sampler or effort overlay
     (`modelReply.ts:153-179`, `samplerOverlay.ts:28-29`).
   - `authoring` (wizard, Ask, briefing, expansion, living director) goes to opencode Sol first, then DeepSeek. It falls
     back to the local model only when neither answers (`passProfiles.ts:79-100,142`).
   - `polish` is off unless set (`passRole.ts:18-21`).
   - Judge uses default to TypeSafe (remote). `llama-logprob` exists only when `SO_JUDGE_LLAMA_URL` is set in the
     server env (`judge/index.mjs:12,682`).
   - The only loud, streamed callers are ST's chat replies: normal, swipe, regenerate, continue and impersonate.
2. **Greedy MTP preserves output.** With `--spec-draft-sampling greedy` (the adopted mode), the drafter leaves no `q`
   (`common/speculative.cpp:370-373`), so the verifier uses sample-and-match (`server-context.cpp:4848-4861`). Every
   kept token is the target sampler's own pick, from the full chain and the request's RNG.
   - Same seed means the same text, except for batch-size numerics.
   - Grammar, DRY, XTC, min_p, penalties and the reasoning-budget sampler all run inside the target chain
     (`common/sampling.cpp:643-722`). Grammar-invalid drafts are rejected.
   - The rejection path applies only to probabilistic drafting (`use_spec_rejection` = temp > 0 **and** a `q`,
     `:564,4848`). Probabilistic drafting was not adopted (plan 09 batch 2).
   - `post_sampling_probs` is silently dropped under speculation (`server-context.cpp:4949`).
   - There is no per-request switch to turn speculation off (`server-schema.cpp:209-239` is `#if 0`).
3. **How the member cache classifies a request.**
   - Only streamed `/completion` requests of at least 16,000 characters with two `<|turn>system\n` markers are planned
     as chat (`memberCache.mjs:77-83`).
   - The key is `sha1(prompt[0:2000])` (`memberCache.mjs:22`), not the member's identity.
   - Reuse is limited to the token-identical prefix (llama-server `cache_n`). A restored state can never put tokens a
     member's own prompt does not contain into its context, so **no held-secret path exists through the cache** (S/I).
     A key collision costs hits; it does not leak.
4. **What the 409 fix checks before it kills.** It sees only the broker's lease and queue state plus ComfyUI
   `GET /queue` (`comfyReclaim.mjs:1-17`, `arbiter.mjs:136-144`). Callers that bypass the broker are invisible to it.
5. **Slot cleanup and idle prefill block the queue.** Slot erase, parking and idle prefill run through `arbiter.text`
   (FIFO, one text request at a time, `scheduler.mjs:79-117`). An in-flight prefill step is not aborted when work
   arrives (`gateway.mjs:41-53`).

## Matrix

Key: **+** better, **0** neutral, **!** risk. Columns: MTP / 409 / timing / cache / planned.

| Feature | Local LLM route | GPU / ComfyUI | MTP / 409 / timing / cache / planned | Collision evidence | Test that proves it |
|---|---|---|---|---|---|
| Chat replies (normal) | ST loud, streamed, chat slot | text | + / + (no silent turn after image) / ! / + warm switch 3.8 s / ! prefill blocking | 409 silent turn was the bug (plan 09 §Results); prefill not abortable `gateway.mjs:41-53` | GS1, GS6, j3, `so-turn-types-check` |
| Swipe / regenerate / continue | same, same member | text | + / 0 / 0 / + (prefix hit) / 0 | continue = prefix plus partial reply; restore is token-checked | v24-02-* (branch/checkpoint continue, swipe-delete-below), v28-69-k8-swipe-append, j6 mutation storm |
| Impersonate | streamed, user head | text | 0 / 0 / 0 / ! extra key, may evict a member / 0 | a new key per persona head, 4 GiB holds about 3 states (plan 09 batch 1) | new: cache hit counter around `/impersonate` |
| Stopped reply (A02) | aborted stream | text | 0 / 0 / 0 / ! partial state parked / ! | abort forwarded `gateway.mjs:91-92`; afterReply/park after a partial stream `:124` | v29-a02-stopped-reply, v24-01-stopped |
| Thinking budget (`TEXTGEN_BUDGET_KEYS`) | loud, llama.cpp only | text | 0 (budget sampler in target chain, S) / 0 / 0 / ! binary swap b11388→b11888 / 0 | keys `replyEffort.ts:14-16`; parsed `server-common.cpp:1516`, `server-schema.cpp:364` | live-v28-24-reply-effort, j13-reply-effect |
| Sampler overlay (checkpoint preset) | loud only | text | 0 (greedy preserves; acceptance drops at high temp/XTC) / 0 / ! decode speed varies by preset, skews tps median / 0 / 0 | `samplerKeys.ts:51-64`, `effectsApplier.ts:291` | effects-preset, payload goldens (keys unchanged) |
| emptyReply / thoughtLeak repair | swipe re-request | text | 0 / 0 / 0 / + (swipe re-hits) / 0 | `emptyReply.ts:104-130`, `thoughtLeak.ts:6-14` | v28-a13-thought-carry; full-length check "thinking closes" (plan 09) |
| Talk control director | `director` → memory model, non-stream, **before the reply** | text | + / 0 / 0 / 0 (side, erased or unkeyed) / ! waits behind a prefill step or concurrent passes | interceptor `talkControl.ts:213-240`; FIFO `scheduler.mjs:79-117` | j5-group-direction; new: send latency with idle prefill on |
| Inner voice | `inner`, non-stream, the chat waits for it | text | + / 0 / 0 / ! state copy on its TTFT (side p95 +10 %, M) / ! concurrent decode slows it | `innerCoordinator.ts:132` awaits pending; plan 09 side p95 110.5 % | inner-beat timing from payload capture (lane 42 style), GS1 |
| Shared read (facts, promises, witness) | `read`, scheduler light lane | text | + / 0 / 0 / ! copy cost / ! concurrency reorders completion only | `scheduler.ts:498-518`; results land at the boundary through the apply queue | so-live-suite (T8 tier set), live-rollback-derived |
| Synthesis: scene / arc / canon / seal / epilogue | `synthesis` | text | + / 0 / 0 / 0 / 0 | `chapterSeal.ts:179`, `canonSynthesis.ts:20` | live-v28-45-seal, GS3 long road |
| Curator, lore create, meanwhile, agenda | `curator`/`lore`, heavy lane | text | + / 0 / 0 / 0 / ! | `stagecraftCoordinator.ts:195`, `loreCreator.ts:119` | live-curator-write, v28-35-curator-create, j8 |
| Continuity warden, lore select, consolidation | judge (TypeSafe) | none | 0 / 0 / 0 / 0 / 0 | `wardenCheck.ts:19-22`, `loreSelect.ts:143` | v28-40-judge-consumers |
| Judge `llama-logprob` (env-gated) | `/completion`, `n_predict:1`, `n_probs:20`, temp 0 | text | 0 (n_predict 1 → no draft room, `server-context.cpp:587-591`) / 0 / 0 / ! logits drift on a new binary vs calibration row / 0 | `llamaLogprob.ts:120-127`; calibration keyed provider×model×use | v28-40-local-judge-uncalibrated, j11; rerun calibration goldens when routed |
| Judge `systemone-local` (8095) | own Decider, CPU by default | GPU only if `SO_JUDGE_LOCAL_GPU_LAYERS` | 0 / 0 / 0 / 0 / ! unbrokered VRAM under shrunk reserves | `judgeServer.py:158-168` | new: reserve check with GPU layers set |
| Suggestions ("What could I do?") | `read`/suggestions, on click | text | + / 0 / 0 / 0 / ! queue wait while prefill runs | `suggestionsHost.ts:142` | v29-06-anchored-suggestions, v28-61b-suggest-edit |
| Wizard, Ask, briefing, expansion, living director | authoring → opencode / DeepSeek (remote) | none | 0 unless fallen back to the memory model (then side) | `passProfiles.ts:79-100,142` | j14-agent-wizard, v28-40-living-divergence-prefetch (route assert only) |
| Polish | off by default | – | 0 | `polish/shadow.ts:97` | – |
| Context limits / context-over-server | reads `/props` n_ctx (60 s cache) | – | 0 / 0 / 0 / 0 / ! parallel slots: broker reports max profile ctx, not per slot | `servedContext.ts:17-46`, `gateway.mjs:67-73`, `backend.mjs:225-239` | v28-40-context-over-server; new: parallel-2 overflow → 400 vs eviction |
| model-role-outage check | breaker transport health | – | 0 / + (fewer 409s) / 0 / 0 / ! long prefill waits look like timeouts | `roleHealth.ts:47`, `reply.ts:52` timeout from tokens | checksRegistry fixtures; lane run with idle prefill and a 4-member group |
| Story illustrations | prose-to-prompt via `image.directorProfileId` (non-stream, no grammar) | ComfyUI, broker lease | ! (text swapped out more often) / ! cold start after reclaim / ! / ! RAM cache not evictable / ! max mode | lease `image/runtime.ts:286`; stream needs 2400 MiB free (plan 06 F4), MTP leaves 1.5-2.0 GiB | p41 image journey (`so-p41-journey.mts`), v27-32-images-clean-host, `so-image-runtime.mts` |
| Cast scene, reference views | – | ComfyUI, lease | ! / ! cold start / ! / ! / ! | `castSceneHost.ts:99-112`, `referenceViewsHost.ts:33-57` | `so-image-cast.mts`, `so-cast-presentation.mts` |
| Sprite builder (batch lease) | – | ComfyUI, lease renewed every 30 s, batch retains 2 s | ! / **!** reclaim between batches → cold start (≤120 s) / ! / ! / ! | `batchLease.ts`; reclaim needs no lease (`comfyReclaim.mjs`) | `so-sprite-builder.mts`, `scripts/local/sagaBatchPriority.mjs`, `retainBatchLi.mjs` |
| Sprite expressions, pose pick | `sprites.profileId` or director profile, **GBNF grammar**, non-stream | – (pose import: DWPose on ComfyUI) | 0 (grammar enforced in the target chain) / 0 / 0 / 0 / 0 | `expressionCalls.ts:40-47`, `stHost/sprites.ts:160-164`, `poses/pick.ts:30` | new: GBNF parity test under MTP (bench passes `grammar`, `bench-controller.mjs:190`) |
| Live head | none (WebGL in the browser; vision rig = Sol) | **browser VRAM**, unbrokered | ! / ! / 0 / 0 / **!** max mode | the 409 repro used a 1.1 GiB holder "like the lane browser" (plan 09) | new: reserve check with the live head open |
| Landmark service (8096) | – | CPU, RAM | 0 / 0 / 0 / ! host RAM / ! | `landmarks.mjs:11` | `landmarkConfig.test.mjs` plus a RAM-min probe |
| Image Director (st-image-director) | user-picked profile; **GBNF** on llamacpp | ComfyUI through ST `/api/sd/comfy/generate`, **no lease** | 0 / **!** can be killed mid-render / 0 / 0 / ! | `director.ts:107-111`, `stHost/comfy.ts:19-24`; reclaim cannot see it | new: render through ST during a text reload |
| ST `/sd` button | – | ComfyUI, no lease | 0 / **!** same as Image Director | – | same new check |
| Rollback (TurnBridge) | re-reads at priority 0 | text | 0 / 0 / 0 / 0 / 0 (engine order is client-side) | `turnBridge.ts:295-330`, `wiring/scheduler.ts:81` | live-v15c-rollback-restore, plan03a-*, j6 |

## Top risks, ranked

1. **The 409 fix can kill renders it cannot see.** Image Director and ST's `/sd` post to ComfyUI with no broker lease.
   The reclaim checks `/queue`, but a `POST /prompt` in flight before it reaches the queue, or a render through ST, can
   still be killed.
   - A killed SO job whose ComfyUI comes back on the same URL reports "queued" until the **15-minute** `ComfyJobs`
     deadline (`jobs.mjs:86-90`). The prompt is in neither `/history` nor `/queue`, and nothing retries.
   - Fix candidates: refuse to reclaim while any `/prompt` was posted in the last N seconds, or make the media plugin
     treat "absent from both" as failed.
2. **Images and text thrash, and MTP plus reclaim make it worse.** Streaming beside text needs 2,400 MiB free; MTP
   leaves 1.5-2.0 GiB (M), so every image now swaps text out.
   - The post-image reload then stops the idle ComfyUI.
   - The next image cold-starts: up to 120 s, plus checkpoint reload from disk with ComfyUI's RAM cache lost.
   - `startComfy()` is called again before the next text load (`scheduler.mjs:69,111,451,476`), so the reclaim can
     repeat every cycle.
   - This hits auto illustrations per turn, sprite builder batches (the lease is dropped after 2 s idle) and cast
     scenes hardest.
   - The median timing makes it worse: member-cache-prefilled chats report a tiny `prompt_ms`, the median drops, and
     `textLatencyDecision` restores full text more eagerly (I).
3. **Shrinking reserves (max profile) ignores unbrokered GPU users.** Neither the browser's WebGL (live head, ST and
   lane browsers), a GPU-layered systemone judge nor Image Director is counted.
   - Plan 09 showed that 1.1 GiB of foreign VRAM was enough to fall under a 1,024 MiB reserve.
   - A smaller reserve turns that into either a `--fit` CPU spill or a 409 silent turn.
   - The fit spill does not trigger the reclaim, because the reserve is satisfied. It persists until restart
     (plan 09 §Results).
4. **Idle/next-speaker prefill blocks critical-path requests.** It runs inside `arbiter.text` and yields only between
   members. The talk director and the inner beat sit on the reply's critical path and wait out a whole step.
   - The talk director runs in the generation interceptor before the reply (`talkControl.ts:213-240`).
   - The chat awaits the inner beat (`innerCoordinator.ts:132`).
   - Prefill also counts toward image fairness (`servedText`), so it changes when images get their turn.
   - It needs an AbortController tied to queue arrival.
5. **The RAM cache competes with ComfyUI RAM staging.** `makeRoom` returns 0 in RAM mode, so an image cannot evict the
   cache. If host RAM runs short, the lease fails "Host RAM is short" and the client retries for up to 15 minutes
   (`leaseWait.ts`).
   - Measured RAM min is 16.5 GB, without ComfyUI. The 10,240 MiB floor assumes 8 GiB of staging.
   - The max profile's bigger cache, plus a resident ComfyUI and the landmark/judge services, can break that floor.
6. **Key collisions and capacity.** The key is only the first 2,000 characters. The cache holds about 3 member states
   at 4 GiB (states of 1.3 GiB with `cache_ckpt_max`).
   - Groups of 4 or more members thrash, and impersonate adds keys.
   - Any member-filtered head that matches for 2,000 characters merges keys.
   - This costs performance only (fact 3). There is no privacy risk.
   - A streamed, long, marker-shaped non-chat caller would be cached as a member (I; none found in `src/`).
7. **Binary swap b11388 → b11888 (plus patch).** These features depend on server semantics:
   - reasoning-budget keys
   - `generation_prompt`
   - checkpoint placement (`checkpoint_offsets` depends on `-ub`)
   - logprob values

   Decode was +4-6 % in batch 2: a change, not a regression, but the quality rating must gate it. The patch skips
   zero-filling the state buffer, so the state write-length validation (`8f17b1a`) is the only guard against reading
   uninitialised bytes on a short write.
8. **Concurrent side passes / `--parallel 2`.**
   - The broker reports the largest profile's `n_ctx`, not the per-slot value (`gateway.mjs:67-73`).
   - On overflow, `holdSlot` erases the other slot (`backend.mjs:225-239`), which may be the chat slot holding the
     warm member state.
   - Plan 06 measured −0.49 GiB VRAM and +0.2 s TTFT for parallel 2.
   - Engine order is safe: results apply at boundaries and RunOwnership is checked client-side. Only latency and
     inner-beat freshness change.
9. **Request-supplied checkpoints.** A checkpoint placed by the request that sits off the token-identical prefix is
   dead weight in RAM. One placed inside a per-member block is only reusable for that member. Correctness is
   unaffected because reuse is token-checked.
10. **Logprobs plus speculation (future).** `post_sampling_probs` is silently dropped (`server-context.cpp:4949`). The
    judge sends `false` and `n_predict:1`, so it is not affected today. Any future logprob consumer with
    `n_predict > 1` would get partial probabilities.

**No risk found:**
- Grammar/GBNF plus greedy MTP: enforced in the target chain (S).
- Sampler overlay plus greedy MTP: same chain and RNG (S).
- Thinking budget plus MTP: the budget sampler lives in the target chain; a forced end-of-think is just a draft
  mismatch (S).
- Seeds and determinism: SO sends no seed, chance is code-seeded, and rollback ≡ replay is engine-level. Restored
  states change only batch numerics (S/I).
- RunOwnership: server-side ordering never reaches client token checks.

## Cross-feature model-lane regression list (run before adopting each change)

Run on a lane (never lane 0), through the controller under test, real generation, thinking on, images enabled only
where the row says so. Capture `/status` (gpuReclaims, member cache hits, fitCorrection) and `run-header diff` around
each batch.

**Every change (base set):**
1. GS1 first-hour journey ×2 strict: chat, inner, read, talk director, and scheduler idle.
2. j5-group-direction: talk director on the critical path.
3. `so-turn-types-check`, v24-02 continue/swipe set, v28-69-k8-swipe-append, j6 mutation storm.
4. v29-a02-stopped-reply plus v24-01-stopped.
5. live-v28-24-reply-effort plus j13 (budget overlay); effects-preset (sampler overlay).
6. so-live-suite on the T8 fixture set with `--expect-count` (read quality unchanged).
7. Payload goldens capture/diff: prompts byte-identical, so the controller cannot have altered layout.
8. Full-length output check: 25 prompts, thinking closes, Sol blind rating per plan 09.

**MTP / binary swap (add):**
- A GBNF parity test (new): sprite expression and pose pick grammars on b11888+MTP vs no-spec. Every reply parses
  and the outputs are identical at temp 0.
- v28-40-local-judge-uncalibrated, and a llama-logprob calibration replay if that provider is routed.
- v28-a13-thought-carry.

**409 fix / ComfyUI reclaim (add):**
- The p41 image journey ×2.
- `so-sprite-builder.mts` batch with text replies interleaved: count cold starts.
- `sagaBatchPriority.mjs` and `retainBatchLi.mjs`.
- New: an Image Director or ST `/sd` render launched during a text reload. Expected: not killed, or failed fast, never
  a 15-minute hang.
- New: kill ComfyUI mid-SO-job and assert the job fails within 60 s.

**Median timing (add):**
- An image↔reply cycle bench (`render-benchmark.mjs ... sprite`) with the member cache on and off. Log restore
  decisions: no new swap-text per reply.

**RAM member cache (add):**
- GS6 adoption plus a 4-member group run, to measure thrash and the hit counter.
- An impersonate round-trip.
- A RAM-min probe during a streamed image with ComfyUI resident: at least 10,240 MiB.
- live-rollback-derived and plan03a-edit-rollback, to check that restored states after a rollback still answer
  correctly.

**Max profile / headroom (add):**
- All image rows above, plus the live head open in the lane browser (WebGL VRAM).
- `SO_JUDGE_LOCAL_GPU_LAYERS` set.
- Landmark service running.
- Expected: no 409, no `--fit` CPU spill (server log), and fitCorrection stays at 0.

**Idle prefill / next-speaker prefill (add):**
- A send-latency probe (new): the player sends during a prefill step. Measure the time to the talk director call and
  to the first chat token; the floor is no more than a predeclared bound over the no-prefill time.
- v29-06-anchored-suggestions clicked during prefill.
- A chat switch mid-prefill: no stray state, and the RunOwnership census unchanged.

**Concurrent side passes / parallel 2 (add):**
- v28-40-context-over-server.
- A long-chat overflow row: a 400, never a silent chat-slot erase while a warm member state is held.
- Inner-beat freshness: the beat completes before its member's chat request in 100 % of turns (payload capture).

**Request checkpoints (add):**
- The plan 09 A1-A8 floors again, plus per-member cached state size from `/slots`.
