# Vast.ai 3090 runbook (2026-10-31; first run on instance 58587220: smoke green)

One rented RTX 3090 serves Artemis 31B v1.1 (Q4_K_M + MTP drafter) to lanes through an ssh tunnel, like the RunPod
pods did. Nothing here touches ST `:8000`, lane 0 or the local 3090. The owner rents and destroys the instance in the
Vast UI; scripts never call the Vast API.

Two ways to serve: the plain llama-server below (lanes, sections 1-5), or the **controller path** (section 0: the
owner's local setup, patched llama-server behind the controller gateway with the RAM member cache, for playing from
the owner's own SillyTavern).

## 0. Controller path (owner playtest, RTX 5090, 128K)

Same as the owner's PC (`C:\dev\tools\story-orchestrator-local\config.json`): patched b11888 (`so-cache-b11888.patch`)
+ MTP drafter, `scripts/local/controller.mjs` gateway, `memberCache` `store: "ram"`, `serverKeys: true`, `erase`/`park`
off, `chatFirst`, one slot. Text only: the box config sets `images: false`, so the controller never starts, queries or
reclaims ComfyUI (image leases pass through unbrokered; images keep running on the owner's 3090 through the local
controller). No tray, judge or landmarks on the box; Windows process handling (taskkill, orphan reaper queries) is
inert on Linux, and the tmux wrapper kills a leftover llama-server when the controller exits. Everything binds
127.0.0.1; the owner's ST reaches the gateway through an ssh tunnel on **local port 18890** (reserved in
`scripts/debug/lib/laneRange.mts`; 18888/18889 stay the local controller's).

Box config (`scripts/remote/controllerConfig.mjs`, written to `/root/so-ctl-state/config.json`): profile `play` =
`--ctx-size 131072 --n-gpu-layers all --fit off --threads <nproc> --load-mode none`, `maxContext` 131072, member cache
32768 MiB (`--cache-ram`), reserves GPU 1024 / RAM 4096 MiB, gateway 18888, llama-server 18889. Knobs on the
`controller` phase: `CTL_CTX`, `MAX_CONTEXT`, `SLOTS` (2 = `slots {count 2}` over a shared pool, e.g. `CTL_CTX=147456`;
not tested with the member cache), `CACHE_MIB`, `EST_GPU_MIB`, `THREADS`, `GATEWAY_PORT`, `BACKEND_PORT`,
`CTL_CONFIG_PATCH` (JSON merged into the config).

VRAM estimate for 131072 x 1 slot (from `research/context-census-2026-10-31.md`: only the 10 global layers grow,
42.5 KiB/token at q8_0): the 3090's 32K load is ~21.4 GiB with the drafter, +4.0 GiB of global KV for 128K = **~25.5
GiB of 31.8**; 147456 x 2 slots adds ~0.7 GiB global KV and ~0.6 GiB SWA = ~27 GiB. Unmeasured: check on the box.

Commands (Git Bash, repo root; a CUDA 12.8+ or 13.x **devel** image, >= 60 GB disk):

```bash
HOST=<ip>; PORT=<ssh port>; KEY=$HOME/.ssh/id_ed25519_vast; KH=$HOME/.ssh/known_hosts
ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -p $PORT root@$HOST 'nvidia-smi -L; nproc; free -g; df -h /'
VSSH="ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -p $PORT root@$HOST"
B="SO_PATCH=1 CUDA_ARCH=120"                     # same two on build AND controller: they pick the build dir b11888-so-sm120
$VSSH "$B bash -s -- deps" < scripts/remote/vast-bootstrap.sh      # warns if the GPU's compute cap != CUDA_ARCH
scp -i $KEY -P $PORT scripts/local/llama-patches/so-cache-b11888.patch root@$HOST:/root/so-cache-b11888.patch
D=/c/dev/models/hf/hub/models--TheDrummer--Artemis-31B-v1.1-GGUF/snapshots/65d0086759d0d45f728b610f48651d4a98d89ed4/MTP
$VSSH 'mkdir -p /root/so-llama/models'
scp -i $KEY -P $PORT $D/mtp-Artemis-31B-v1m-Q8_0.gguf root@$HOST:/root/so-llama/models/mtp-Artemis-31B-v1m-Q8_0.gguf.upload
$VSSH 'mv /root/so-llama/models/mtp-Artemis-31B-v1m-Q8_0.gguf.upload /root/so-llama/models/mtp-Artemis-31B-v1m-Q8_0.gguf'
$VSSH 'bash -s -- models' < scripts/remote/vast-bootstrap.sh &      # 18.7 GB from Hugging Face, parallel with the build
$VSSH "$B bash -s -- build" < scripts/remote/vast-bootstrap.sh; wait
git archive HEAD scripts/local scripts/remote server-plugin/story-orchestrator-gpu/broker \
  | $VSSH 'rm -rf /root/so-ctl && mkdir -p /root/so-ctl && tar -x -C /root/so-ctl'   # or skip: the phase clones SO_REF from GitHub
$VSSH "$B bash -s -- controller" < scripts/remote/vast-bootstrap.sh # node 22 if missing, config, tmux so-ctl, load, PONG
bash scripts/remote/ctl-tunnel.sh $HOST $PORT $KEY                  # own terminal; reconnects; 127.0.0.1:18890 -> box 18888
curl -s http://127.0.0.1:18890/status | head -c 400                 # phase text, memberCache store ram
node scripts/remote/memberCacheSmoke.mjs http://127.0.0.1:18890     # two members alternating: expects >= 2 cache hits
```

The `controller` phase refuses while the plain llama-server (tmux `llama`) runs; run `stop` first. Phases
`controller-status`, `controller-stop` (POST `/control/stop`, then kills a leftover llama-server), `controller-health`
(re-run the load + probe). Logs: `/tmp/so-controller.log` (controller) and `/root/so-ctl-state/native-*.log`
(llama-server). Never pipe a binary through PowerShell; `git archive | ssh` runs in Git Bash.

Point SillyTavern at it: in each Artemis connection profile the owner plays with (today `127.0.0.1:18888`, the local
controller), change the server URL to `http://127.0.0.1:18890` (or duplicate the profile as "Artemis Vast"), re-select
the profile, and set the preset's context to 131072 or tick "Derive context size from backend" (the gateway's `/props`
reports the served 131072). Back to local = the old URL. Image generation is unchanged (local ComfyUI).

## What runs where

- **Box**: `scripts/remote/vast-bootstrap.sh` (phases `deps|build|models|serve|health|stop|status|cmd`, default all,
  idempotent; Ubuntu 22.04/24.04, CUDA 12.x/13.x devel). Stock llama.cpp **b11888** (MTP `draft-mtp` is upstream;
  `SO_PATCH=1` applies `scripts/local/llama-patches/so-cache-b11888.patch`, needed only by the local controller's member
  cache: lanes talk to llama-server directly and send no `cache_key`). Server bound to `127.0.0.1:18080` only (the Vast
  template's jupyter holds 8080), in tmux `llama`, log appended to `/tmp/llama-server.log` (the path `so-pod` pulls;
  the RunPod `LLM_DEBUG_LOG=1` equivalent).
- **Server line as run** (`bash scripts/remote/vast-bootstrap.sh cmd`): pod flags (v2.6 15 F8: 4 slots,
  unified q8_0 KV, flash-attn, jinja, metrics, no slots endpoint) plus the controller's MTP args:

  ```
  llama-server --model Artemis-31B-v1m-Q4_K_M.gguf --model-draft mtp-Artemis-31B-v1m-Q8_0.gguf --spec-type draft-mtp
    --spec-draft-n-max 2 --alias TheDrummer/Artemis-31B-v1.1-GGUF --host 127.0.0.1 --port 18080 --ctx-size 49152
    --parallel 4 --kv-unified --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --n-gpu-layers all --fit off
    --threads 6 --threads-batch 6 --jinja --metrics --no-slots --no-webui --no-mmproj --offline --log-timestamps --log-prefix
  ```

  Measured on the 3090 (24 GB): 4 slots at 98304 and at 65536 run out of VRAM (the MTP context is the last
  allocation); **49152 x 4 loads with ~950 MiB free**, PONG at 70 tok/s, smoke decode p50 46 / p95 78 tok/s. Lanes ask
  at most 32768 (`max_context`), so 49152 shared by 4 slots is enough. `--fit on` must stay off: it fails to measure
  the MTP draft ("Gemma4Assistant requires ctx_other"), leaves layers on the CPU and decodes at 0.8-1.8 tok/s. Threads
  default to `nproc` (llama.cpp counts the host's 64 cores, not the container's 6).
  Knobs: `CTX` (default 49152, the 3090 value), `PARALLEL`, `NMAX`, `NGL`, `FIT`, `THREADS`, `PORT`,
  `EXTRA_ARGS` (anything with `--host`/`0.0.0.0` is refused).
- **Windows**: `so-pod.mts` (tunnel `127.0.0.1:18080+k` -> box `127.0.0.1:18080`, samples, log pull, release) and one
  lane retargeted with `st-lanes.mts pod <n> <k> --from-local`. Pick a k > 0 with no `<so-lanes>/pods/<k>` dir (0-5
  hold released RunPod evidence; the first run used **k=6, port 18086**). The lane-load rule counts lanes per pod and
  a lane without `pod.json` counts as pod 0, so k=0 would share a cap with the local lanes.

## Sizes and times (first run)

- Main GGUF 18,687,063,072 B from Hugging Face (`TheDrummer/Artemis-31B-v1.1-GGUF@65d0086…`, public, no token):
  3 min 18 s on the Vast box, sha256 `f763178a…` checked. Resumable (re-run `models`).
- The **MTP drafter is not on Hugging Face** (made locally; the repo has no `MTP/`): `models` stops with the scp
  command. Upload the local 514,687,104 B copy (23 s from this machine), sha256 `5ae8b011…` checked on the box.
- Build (CUDA 13.2, sm_86, CCCL v3.4.3 fetched, 6 cores): under 7 min, run in parallel with the download.
- Disk used ~21 GB of the 80 GB overlay; RAM is not a constraint (host page cache). Rent >= 50 GB disk.
- Bootstrap to green smoke: about 35 min including the VRAM retries; now about 15 min.

## 1. Bootstrap (Git Bash, repo root)

```bash
HOST=<ip>; PORT=<ssh port>          # Vast "Connect", direct; first run: 151.237.25.16 22314
KEY=$HOME/.ssh/id_ed25519_vast; KH=$HOME/.ssh/known_hosts
ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -p $PORT root@$HOST 'nvidia-smi -L; df -h /'
VSSH="ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -p $PORT root@$HOST"
D=/c/dev/models/hf/hub/models--TheDrummer--Artemis-31B-v1.1-GGUF/snapshots/65d0086759d0d45f728b610f48651d4a98d89ed4/MTP
$VSSH 'bash -s -- deps' < scripts/remote/vast-bootstrap.sh
$VSSH 'mkdir -p /root/so-llama/models'
scp -i $KEY -P $PORT $D/mtp-Artemis-31B-v1m-Q8_0.gguf root@$HOST:/root/so-llama/models/mtp-Artemis-31B-v1m-Q8_0.gguf.upload
$VSSH 'mv /root/so-llama/models/mtp-Artemis-31B-v1m-Q8_0.gguf.upload /root/so-llama/models/mtp-Artemis-31B-v1m-Q8_0.gguf'
$VSSH 'bash -s -- models' < scripts/remote/vast-bootstrap.sh &   # parallel with the build
$VSSH 'bash -s -- build' < scripts/remote/vast-bootstrap.sh; wait
$VSSH 'bash -s -- serve' < scripts/remote/vast-bootstrap.sh   # tmux, then health: /health, /props, PONG + tok/s
```

The health probe's tok/s must read tens, not single digits (single digits = layers on the CPU or wrong threads).
Patched build instead: scp the patch to `/root/so-cache-b11888.patch`, then `SO_PATCH=1` on `build` and `serve`
(separate build dir `b11888-so`).

## 2. Tunnel and capture (background, keep running)

```bash
K=6
node scripts/debug/so-pod.mts target $K --host $HOST --ssh-port $PORT --key "$KEY" --known-hosts "$KH" --remote-port 18080 --pod-id vast-<instance id>
SO_DETACHED_RUN=1 node scripts/debug/so-pod.mts up $K > /c/dev/so-lanes/pods/$K/up.log 2>&1 &
curl -s http://127.0.0.1:$((18080+K))/health        # {"status":"ok"}
```

An explicit `--known-hosts` drops the RunPod `runpod-llm` host-key alias (`--known-hosts none` drops checking too).

## 3. Lane (a fresh lane number; the first run used 49)

```bash
N=49
node scripts/debug/adolion-fresh.mts seed $N --stop    # images + sprites off; keeps "Group: Arin, DM Narrator"
node scripts/debug/st-lanes.mts pod $N $K --from-local --pod-id vast-<instance id>
node scripts/debug/st-lanes.mts start $N --headed
MSYS_NO_PATHCONV=1 node scripts/debug/st-lanes.mts run $N -- scripts/debug/st-actions.mts slash "/profile Artemis RunPod RP"
```

`--from-local` is needed because today's install points every Artemis profile (and the textgen server URLs) at the
local controller `127.0.0.1:18888`; plain `pod` moves only `18079-18089` URLs (the RunPod-era seeds). The first run
moved 6 profiles and 6 echo URLs (12 URLs now at 18086). `<lane>/pod.json` records the pod and the lane firewall then
allows the tunnel port and not 18888. The lane is a copy: re-seed it to return it to the local controller.

## 4. Smoke test

```bash
node scripts/debug/st-lanes.mts run $N -- scripts/debug/st-eval.mts "const id=ctx.extensionSettings.connectionManager.profiles.find(p=>p.name==='Artemis RunPod RP').id; return await ctx.ConnectionManagerRequestService.sendRequest(id,[{role:'user',content:'Reply with exactly: PONG'}],16,{extractData:true,includePreset:true,includeInstruct:true,stream:false},{})"
node scripts/debug/st-lanes.mts batch --lanes $N test/scenarios/live-plan02-runtime.json
node scripts/debug/so-pod.mts summary $K
```

First run: PONG content `PONG` (after the empty thought channel); `live-plan02-runtime.json` (no-campaign story, real
main-model generation, `Group: Arin, DM Narrator`) GREEN in 235 s, row evidence complete with `pod.json` +
`tunnel.json`; `summary`: 17 requests on all 4 slots, prompt p95 2,495 tokens, no truncation or context shift, GPU peak
23,674 MiB / 100 %. The capture skipped samples for about a minute right after `up` started and then caught up (row
gap note on the PONG run only).

## 5. Evidence and teardown

```bash
node scripts/debug/so-pod.mts pull $K          # before any llama-server restart, too
$VSSH 'bash -s -- stop' < scripts/remote/vast-bootstrap.sh
node scripts/debug/so-pod.mts release $K       # must exit 0 (stops 'up', teardown check)
node scripts/debug/st-lanes.mts stop $N
node scripts/debug/so-evidence.mts archive --label vast-<date>; npm run sessions:archive
```

Then the owner **destroys** the instance in the Vast UI (a stopped Vast instance still bills its disk).

## Queue rows (gpu-queue-2026-10-30.md)

- **Remote** (lane rows on the text model, at most 2 model lanes per pod): REG-3 J6 x2, 19 hook check, HF-REGEN,
  HF-FOLD (Terra on opencode, play on the box), ARMS-31S1/31S2/34S1 sessions + 32 skip rating (Sol rating is remote
  anyway), REG-5 live suite x2 with H33-LS, A1 read reorder, D4, D1 + H33-F, D2, H33-RP, MW1-B1..B4, M42-F*/G* sessions.
  Timing numbers from the box are not comparable with local runs; compare arms only within the box.
- **Local** (controller, patched endpoints or images): G2 (A2-1, A2-2 J13, 28 G0-G7, 27-W1, 27-W4), 27-W3, 27-R/28-R,
  REG-1 controller base set, A1 idle prefill, REG-2 F1 record + REG-6 A0 (recorded identity and prefix cache are the
  controller's), HF-RECALL (before/after latency on one machine), CTX-BENCH 40K/48K, G4 images (REG-4, B1, 05.7, 20).

## Open

- 4 slots share 49152 tokens: two maximal 32K requests cannot run at once (real prompts were under 2.5K in the smoke).
  `PARALLEL=2 CTX=98304` is the untried alternative if a row needs long context.
- Patched build only if a remote row needs `cache_key`/`checkpoint_at`; none of the remote rows above do. The owner
  playtest (section 0) does.

## Record: controller path tested in WSL (2026-11-08, before renting)

WSL Ubuntu 22.04 on the owner's PC, CPU only (the 3090 was the owner's and stayed untouched; a fake `nvidia-smi` on
PATH stood in for GPU telemetry), ports 18892/18893 so nothing met the local controller's 18888/18889.

- Unit tests under Linux (node 24.14.1): `scripts/local/*.test.mjs`, `scripts/remote/*.test.mjs`, the broker tests,
  `broker.test.mjs`, `gate.test.mjs`, `managed.test.mjs`: 327 tests, 322 pass, 4 skipped, 1 fail:
  `pluginBrokerLiConfig.test.mjs` (its fixture is a Windows config with `C:/` paths, not absolute on Linux; the box
  does not use the ST plugin config).
- Build: `SO_PATCH=1 CUDA_ARCH=cpu bash vast-bootstrap.sh deps` then `build`: b11888 + all 3 patch commits applied on
  Linux (`git am`), CPU build ~2 min on 16 cores; `--load-mode`, `--cache-ram`, `--sleep-idle-seconds`, `draft-mtp`
  present.
- `controller` phase (decider-4b Q4_K_M from `/mnt/c`, `CTL_MTP=none`, `CTL_CTX=16384`, code uploaded as a
  working-tree copy): config written, tmux `so-ctl` up, gateway answered `/health` in 1 s, text loaded through
  `/control/load` (~25-50 s from `/mnt/c`), `/status` phase `text`, member cache `ram`, serverKeys on, `/props`
  total_slots 1 n_ctx 16384, PONG through the gateway `/completion` (6 tok/s on CPU). `controller-stop` stopped the
  controller and its llama-server (no leftover process).
- RAM prompt cache (unkeyed, member plan not applied): a returning prompt restored 1,295 of 1,299 tokens from RAM,
  36.1 s -> 1.7 s.
- Member cache, two members alternating (`memberCacheSmoke.mjs --chars 4000 --rounds 3`, plan thresholds lowered for
  CPU with `CTL_CONFIG_PATCH`): 6 planned, cache entries saved per key (`caching 1 of 3 checkpoint(s)`), and with
  `--verbosity 4` the server **found the member's keyed entry** on its return (`lcp 1034, f_keep 0.854, f_sim 1.000`),
  but then reprocessed the prompt: decider-4b uses recurrent/hybrid memory (`n_swa = 0`), which can only resume from a
  checkpoint before the last prompt token, and the cached copy holds only the cut checkpoint at exactly that token.
  Counted as 0 hits / 6 misses. This is the model's memory type, not Linux: Gemma 4 (SWA) restored these entries on
  the 3090 (plan 09). The hit check therefore runs on the box with Artemis.

Still to verify on the 5090 right after renting:

- The sm_120 build: CUDA >= 12.8 devel image, `CUDA_ARCH=120`, CCCL v3.4.3 (or the bundled fallback), patch on
  b11888 for Blackwell. Not buildable here (WSL has CUDA 12.4, which has no sm_120).
- VRAM at 131072 x 1 slot with the drafter (estimate ~25.5 GiB of 31.8); `withinReserve` needs >= 1024 MiB free after
  load. If it fits easily, `SLOTS=2 CTL_CTX=147456` is the option to try (member cache with slots untested).
- Load time under the backend's 240 s deadline (18.7 GB with `--load-mode none` from the box disk).
- `memberCacheSmoke.mjs http://127.0.0.1:18890` (default 20,000-char prompts): expect >= 2 hits; then
  the owner's real ST profile through the tunnel, PONG, a group turn, `/status` `memberCache.hits` rising.
- tok/s through the gateway in tens, MTP `draft_n_accepted` > 0 (the probe prints both).
- `ctl-tunnel.sh` (written, not run: no box yet).
- Sparse-clone fallback verified in WSL against the local repo (`SO_REPO=/mnt/c/dev/story-orchestrator
  SO_REF=v3.0-linux-controller`): only `scripts/local`, `scripts/remote` and the broker checked out, `.so-ref` a89825e,
  controller up, PONG. On the box it clones GitHub `master` unless `SO_REF` is set.
