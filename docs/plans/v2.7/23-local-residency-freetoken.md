# FreeToken pattern harvest

Clone: `C:/dev/st-extensions-research/FreeToken` @ `d3512b43affe981465e03ee28cbd88f49c39b9aa` (2026-10-01). Reviewed for
the local residency controller (`scripts/local/*`), per `22-local-residency.md` §Pattern harvest.

## What it is

An edge Mixture-of-Experts serving engine (DeepSeek-V4-Flash, Qwen3.6/3.8, GLM-5.x, gpt-oss, Gemma-4). Headline features:
elastic memory management, LRU expert cache, the FTW fast-load format, and bandwidth-adaptive CPU–GPU co-execution
(`README.md`, `docs/models.md`).

## Our target

Artemis-31B is **dense** Gemma-4 served by llama.cpp b11388 (native GGUF), sharing one RTX 3090 with ComfyUI. Every
MoE-specific mechanism is out of scope by construction: FreeToken's own `auto` MoE strategy resolves dense models to
`fused` (<code>docs/models.md</code> §MoE strategies).

## Verdicts

| # | Pattern | FreeToken mechanism | Verdict for us |
|---|---|---|---|
| 1 | Elastic runtime VRAM re-allocation | `POST /v1/cache/rebuild` (`python/freetoken/server/api_server.py:572`), `engine.rebuild_runtime_cache` — idle-only in-place resize of the MoE slot cache, KV page pool and GDN/SWA pools (`python/freetoken/engine/engine.py:874-882`); `ft ctl cache --moe/--kv/--mamba/--swa` (`docs/cli.md:147`) | **Not portable as a mechanism** (llama.cpp fixes weights + KV at load). Validates the goal: the kill-and-reload swap we do is exactly the cost FreeToken avoids. Our emulation is *never unload* — a resident reduced profile. Drives the replan. |
| 2 | MoE offload/cpu/hybrid + LRU expert cache | experts in host RAM, LRU GPU slots, PCIe streaming (`docs/models.md`; `--moe-strategy`, `--moe-cache-*` at `docs/cli.md:83-90`) | **N/A** — dense model. Revisit only if the text model becomes MoE. |
| 3 | Calibrate once → recorded profile → policy | `ft bench bw` writes a profile that `--moe-strategy auto` reads (`docs/cli.md:188-197`) | **Portable practice, already present.** `benchmark.mjs`/`render-benchmark.mjs` → `footprints.json` → `admission()` is the same shape. Harden via retention verification. |
| 4 | Budget from measured free memory | `--memory-ratio`, `--moe-cache-auto`, `--kv-reserve-tokens` (`docs/cli.md:71,86-87`) | **Already aligned** — `admission()` + reserves + `--fit-target`. |
| 5 | FTW fast-load format / HF loader | pre-converted weight format | **Not portable** — GGUF; llama.cpp owns mmap/cache. |
| 6 | Semantic anchor checkpoints | context edits (tool calls, thinking) avoid KV recompute (`README.md`) | **Watchlist** — a swipe/edit wipes ST's context; llama.cpp keeps a prompt cache but ST invalidates on edit. Not this plan. |
| 7 | Radix/prefix KV reuse | `--cache-type radix` | **Already have** — llama.cpp prompt cache; ST sets `cache_prompt`. |

## Outcome

No code ported. What the harvest yields for the replanned residency design:

- **Two confirmations:** budget/sizing comes from measured free memory (`admission()`), and calibration is done once and
  recorded for the policy to read (`footprints`). The replan makes the second load-bearing (retention verification + a
  resident reduced profile).
- **One goal validation:** "no engine restart / no weight reload" is exactly what "lower the swap time" asks for. Since
  llama.cpp cannot resize pools, the only emulation is to keep the text process resident (`--fit-target` shed) rather than
  ever doing a full unload.
- **One watchlist item:** semantic KV anchors, deferred.
- **One explicit non-transfer:** MoE expert caching — dense model, never applicable.

## Completion decision — 2026-10-04

User chose **total image-to-completed-reply wait**, not shortest switch. A permanently reduced dense profile is therefore
not the unconditional winner: live reduced text is about 3 tok/s and full text about 33 tok/s. The controller now
compares measured load/prefill/decode costs and restores full residency for a costly reply; short reads preserve the
reduced process. Comfy weights may stay warm in its RAM cache, with pressure eviction.

Pinned host budgets and prevalidation-before-teardown are general practices worth harvesting even for dense models;
the MoE-specific expert LRU remains non-transferable. This is not FreeToken-style in-place layer migration or a
guaranteed full-model hot store. Native mmap was measured and refused twice on the current 32 GiB host because it
violated the 4 GiB physical-RAM reserve. Evidence and open acceptance rows: `22-local-residency.md` completion record.
