# llama.cpp patches

`so-cache-b11888.patch`: ten commits on llama.cpp tag b11888 (branch `so-r6`, binary `so6`; the first eight are `so-r4` / `so5`):
- per-request `cache_key` for the host-RAM prompt cache (keyed entries isolated both ways, unkeyed never evicts keyed, dedup per key, keyed tasks skip foreign slots), `cache_ckpt_max` (cached copy keeps only the cut checkpoint), no zero-fill of cached state buffers, state write length validated (plan 09);
- `checkpoint_at` request positions, `cache_rewind` and the duplicate-checkpoint drop (plan 09 R/R2);
- `POST /sleep` at the next idle point with the prompt cache kept across the reload (plan 09 K), `GET /cache` and `POST /cache/limit` (plan 10);
- plan 26: `POST /sleep {"level":"context"}` frees the target and draft contexts and keeps the weights (wake recreates the contexts without fit or warmup, about 0.2 s server side; `"context-draft"` also frees the draft weights), `GET /cache` reports `sleep_level`; per-request `speculative.n_max` caps the model drafter only; `load timing:` log lines (visible at `--verbosity 4`) and loader env knobs `LLAMA_LOAD_STAGING_MIB`, `LLAMA_LOAD_STAGING_N`, `LLAMA_LOAD_OVERLAPPED` (measured, not adopted: plan 26 C2/C2b);
- plan 28: `--cache-spill-dir`, `--cache-spill-max-mib`, `POST /cache/spill {"keep_mib": N}` write keyed prompt cache entries to files in `<dir>/<pid>/` and load one back when its key returns (hashed names, temp + rename, integrity hash, fingerprint of model/context/KV/format, a bad file is a cold miss, every file deleted on load and exit; `GET /cache` → `spill`); `LLAMA_STATE_TIMING=1` (restore and per-region `tensor_set` timing) and `LLAMA_DECODE_PROFILE=1` (decode-step profile, adds `llama_decode_profile_take`), both read at `--verbosity 4`.

Rebuild (no admin; CUDA 12.8 in a conda env at `C:\dev\tools\cuda128-env`, MSVC 14.44 Build Tools, sm_86):

```
git clone --branch b11888 https://github.com/ggml-org/llama.cpp C:\dev\tools\src\llama.cpp-b11888-so
cd C:\dev\tools\src\llama.cpp-b11888-so && git am <repo>\scripts\local\llama-patches\so-cache-b11888.patch
build-llama.bat C:\dev\tools\src\llama.cpp-b11888-so C:\dev\tools\build\b11888-so
```

Copy the built `bin\` (llama-server.exe and its DLLs) plus the cudart/cuBLAS DLLs into `C:\dev\tools\llama-b11888-so6-cu128\` (the controller's `binary`; hardlink the CUDA DLLs from an older binary dir to save 0.8 GB). Rebase the patch on each llama.cpp release you adopt; the controller works on stock b11888+ with `memberCache.serverKeys: false`; without `/cache` it reports the cache occupancy as not reported and cannot trim the cache for an image. Design and measurements: `docs/plans/v3.0/09-controller-round-3.md`, `10-max-memory-profile.md`, `26-*.md`, `28-cache-spill-and-restore.md`. Build at low priority while anyone plays (`start /low`, or PowerShell `PriorityClass Idle`; plan 28 used `-j 2`).
