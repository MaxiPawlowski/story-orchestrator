# llama.cpp patches

`so-cache-b11888.patch`: six commits on llama.cpp tag b11888 (`tools/server` only), branch `so-cache-patch` of
`C:\dev\tools\src\llama.cpp-b11888-so`:
- per-request `cache_key` for the host-RAM prompt cache (keyed entries isolated both ways, unkeyed never evicts keyed, dedup per key, keyed tasks skip foreign slots), `cache_ckpt_max` (cached copy keeps only the cut checkpoint), no zero-fill of cached state buffers, state write length validated;
- `checkpoint_at` request positions and `cache_rewind` (plan v3.0 09 R), and the duplicate cut checkpoint dropped after a rewind (R2);
- `POST /sleep` (plan v3.0 09 K): sleep at the next idle point, slot states saved to the prompt cache first, the cache survives the reload;
- `GET /cache` (prompt cache occupancy: entries, keyed entries, MiB, limit; never wakes a sleeping server) and `POST /cache/limit {"mib": N}` (sets the cache limit and evicts oldest, unkeyed first, down to it; applied at once while sleeping, else at the next idle point) (plan v3.0 10).

Rebuild (no admin; CUDA 12.8 in a conda env at `C:\dev\tools\cuda128-env`, MSVC 14.44 Build Tools, sm_86):

```
git clone --branch b11888 https://github.com/ggml-org/llama.cpp C:\dev\tools\src\llama.cpp-b11888-so
cd C:\dev\tools\src\llama.cpp-b11888-so && git am <repo>\scripts\local\llama-patches\so-cache-b11888.patch
build-llama.bat C:\dev\tools\src\llama.cpp-b11888-so C:\dev\tools\build\b11888-so4
```

Copy `llama-server.exe` plus the cudart/cuBLAS DLLs into `C:\dev\tools\llama-b11888-so4-cu128\` (the controller's `binary`). Rebase the patch on each llama.cpp release you adopt; the controller works on stock b11888+ with `memberCache.serverKeys: false`, and without `/cache` it reports the occupancy as not reported and cannot trim the cache for an image. Design and measurements: `docs/plans/v3.0/09-controller-round-3.md`, `10-max-memory-profile.md`.
