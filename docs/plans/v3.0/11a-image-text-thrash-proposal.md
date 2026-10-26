# Plan 11a — Image <-> text thrash: controller policy proposal

**Status: PROPOSAL 2026-10-26 (plan 11 B1 prep). Nothing built. The controller agent owns
`server-plugin/story-orchestrator-gpu/broker/`; this file only proposes. Floors TO DECIDE.**

## The problem in numbers (recorded, not new)

| Fact | Value | Source |
|---|---|---|
| Text full load (Artemis Q4_K_M + MTP 2, 32K) leaves free VRAM | 1.5-2.0 GiB (2.3 without ComfyUI; ~2.9 before MTP) | v3.0 09 §Chat reply refused, README §Speculative |
| Stream beside text needs free | `streamImages.minFreeGpuMiB` 2400 + `reserves.gpuMiB` (1024 owner / 1536 max) | README §Memory, owner 2026-10-22 |
| So with MTP | every image swaps text out (audit risk 2); even without MTP, 2.9 < 3424 | derived |
| Text reload after an image | 21-22 s; 09 live: scene 20.2 s, next reply 26.2 s including the reload | README §Performance modes, 09 live check 2 |
| Image -> reply, stream vs swap | 23-30 s warm stream vs 53-144 s swap | README §Streaming (v2.7 22b) |
| Warm vs cold render | 19-21 s warm vs 31-41 s cold (weights not cached) | README §Image cache |
| ComfyUI cold start | up to 120 s (`comfyStartTimeoutMs`) plus checkpoint load | arbiter.mjs, audit risk 2 |
| Shed text (layers on CPU) | 3.3-3.9 tok/s | README §Idle restore |
| Idle owned ComfyUI + another GPU user | can push free VRAM under the 1024 reserve -> reclaim stops ComfyUI (09 fix) | 09 §Chat reply refused |

What exists: `keepTextResident` reloads text 5 s after the last lease; `imageIdleGraceMs` 60 s keeps the image cache between
image jobs; a real text request skips that grace; `reclaimImageGraceMs` 180 s blocks a ComfyUI stop right after an image or
while a queue read lists a job (`6bef555f`); `imageCacheMode` warm/evict; `/free` used by `imageCache.mjs` on evict.

The thrash is not one image: it is a burst (sprite builder batch, on-demand looks after a reply, per-turn illustration on an
`everyN` cadence) interleaved with replies, where each image swaps text out and each reply waits for a reload, and a reclaim
in between can turn the next image into a cold start.

## Proposals (ordered by expected value per risk)

**P1. Free before stop.** When a text load misses the reserve and the owned ComfyUI is idle, first `POST /free
{unload_models: true, free_memory: true}` plus the `story_orchestrator_local` host-cache release, re-read NVML, and stop the
process only if the reserve still misses. Keeps the process (and its imported nodes) so the next image pays a weight load
(seconds, weights in the Windows file cache / `--cache-ram`) instead of a cold start (up to 120 s). Needs one measurement first:
ComfyUI idle CUDA context MiB after `/free` (row T1). If that context alone is what breaks the reserve, P1 buys nothing and
the 09 stop stays.

**P2. Burst-aware hold.** The controller already knows queued image leases; add "expected images": the page tells the broker
when a burst is open (sprite batch with N frames left, on-demand look queue, illustration scheduled for this turn) with a
bound (count and deadline). While a burst is open and no text request waits, keep ComfyUI resident and do not reload text
between images; when a text request arrives it wins as today (reply first), and the burst resumes after. Close the burst on
its last job, on the deadline, or on a page that stops answering. Saves one 21 s reload per image inside a burst.

**P3. Reload text in idle, measure the hidden share.** After a single image, `keepTextResident` already reloads after 5 s.
Whether that reload lands on the player's clock depends on reading time. Proposal: log per reply whether it waited for a
reload (`reload-wait ms`), so the floor can be stated as "share of replies that wait on a reload" instead of guessing. No
behaviour change; observability for P2 and the floors.

**P4. Chat first when both are due.** If a reply and an image are both pending at a boundary, run the reply first, then the
image (the 09 C2 chat-first work); the image then swaps text out while the player reads, and the reload after it has the
reading time to hide in. Belongs to 09 C2; listed so B1 does not duplicate it.

**P5. One memory budget with A2.** Max-memory (plan 10) budgets text + MTP + member cache (`--cache-ram` 4-6 GiB host RAM) +
ComfyUI staging (8 GiB estimate with `--fast-disk`) + image weights in RAM together on the 32 GiB host. Image admission must
drop member states before refusing (`makeRoom` returns 0 in RAM mode today, audit risk 5), and P1/P2 must count the member
cache as reclaimable but costly (a dropped state = a cold member prefill, 8.6 s vs 3.8 s warm).

**P6. Make streaming possible again (only if B1 says images are short).** Streaming needs ~2.2-2.4 GiB free beyond the reserve.
Candidates, each a text-side change owned by track A: IQ4_XS text (A4, smaller weights), a burst-only text profile without
the MTP drafter (+0.85 GiB, costs MTP speed during the burst), or a smaller reserve in max mode (spill guard `fe738667` is the
back-off). Not proposed now: every option changes the text path and needs its own rating.

Not proposed: shedding text layers to the CPU during images (3.3-3.9 tok/s replies are worse than a 21 s reload for any reply
over ~80 tokens, README §Idle restore).

## Decision rule the policy would implement (P1 + P2)

For an image lease while text is loaded: swap cost = unload (~1 s) + render (warm if the same model files were the last image,
else cold) + P(reply arrives before the idle reload finishes) x reload (21 s). Hold cost (burst open) = 0 reload now, one
reload at burst end. Stop-ComfyUI cost = next image cold start (up to 120 s) x P(another image within the burst window). Use
the controller's learned timings (`residencyObjective: total-wait`) for render and reload; P(reply) from P3's log.

## Measurements needed (controller-side; GPU, after 09/10 settle)

| Row | What | Est. GPU min |
|---|---|---|
| T1 | ComfyUI idle VRAM: just started, after an SDXL render, after `/free` (both flags), after host-cache release | 5 |
| T2 | 4-image burst (sprite frames) with 2 replies interleaved, today vs P2: reloads, cold starts, image->reply wall, reply TTFT | 15 |
| T3 | Per-turn illustration `everyN` over 10 turns, today vs P1: cold starts, reload-wait per reply | 20 |
| T4 | Regression rows from plan 11 scope 4 (p41 journey, sprite batch, ST `/sd` during a reload, killed job fails within 60 s) | per 11 |

B1's `image-matrix` `mixed` cells measure only the model switch inside one ComfyUI (no text); they give the warm/cold render
inputs for the rule above.

## Floors

TO DECIDE (owner), before T2/T3: cold starts per N images in a burst; image -> next reply wall; share of replies waiting on a
reload; 0 refused replies (409) and `fitCorrectionMiB` 0 throughout (existing 09 floors).

## Unresolved questions

- May the page announce bursts to the broker (a new lease field), or must the broker infer them from its queue only?
- Is a burst-only no-MTP text profile acceptable (it keeps thinking and inner voice; costs decode speed during bursts)?
