# Vast.ai 3090 runbook (2026-10-31; first run on instance 58587220: smoke green)

One rented RTX 3090 serves Artemis 31B v1.1 (Q4_K_M + MTP drafter) to lanes through an ssh tunnel, like the RunPod
pods did. Nothing here touches ST `:8000`, lane 0 or the local 3090. The owner rents and destroys the instance in the
Vast UI; scripts never call the Vast API.

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
- Patched build only if a remote row needs `cache_key`/`checkpoint_at`; none of the remote rows above do.
