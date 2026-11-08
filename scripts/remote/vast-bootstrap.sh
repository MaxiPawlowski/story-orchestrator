#!/usr/bin/env bash
# Runs ON the rented box (Vast.ai RTX 3090, Ubuntu 22.04/24.04 + CUDA 12.x/13.x devel image, root):
#   ssh -i ~/.ssh/id_ed25519_vast -p <port> root@<host> 'bash -s' < scripts/remote/vast-bootstrap.sh
#   ssh ... 'bash -s -- serve' < scripts/remote/vast-bootstrap.sh      (one phase: deps|build|models|serve|health|stop|status)
#   controller path (patched build + member-cache gateway): phases controller|controller-health|controller-stop|controller-status
# Idempotent: every phase skips work already done. Runbook: docs/plans/v3.0/vast-runbook.md
# Env knobs (pass as: ssh ... 'CTX=65536 bash -s -- serve' < file):
#   CUDA_ARCH=86   CMAKE_CUDA_ARCHITECTURES (86 = 3090, 120 = 5090, needs CUDA >= 12.8); "cpu" builds without CUDA (WSL function test only)
#   SO_PATCH=1     build with scripts/local/llama-patches/so-cache-b11888.patch (scp it to /root/so-cache-b11888.patch first);
#                  default 0 = stock b11888 (MTP drafter is upstream; the patch only adds the controller's member-cache endpoints)
#   NGL=all FIT=off (all layers on the GPU or the load fails: --fit on measured the MTP draft as 0 and put layers on the CPU, 1.8 tok/s)
#   THREADS=$(nproc) (llama.cpp counts the host cores, 64, not the container quota)
#   controller phase: CTL_DIR=/root/so-ctl (repo subset: upload with git archive, else cloned at SO_REF from SO_REPO), CTL_STATE=/root/so-ctl-state,
#     GATEWAY_PORT=18888 BACKEND_PORT=18889 CTL_CTX=131072 MAX_CONTEXT SLOTS=1 CACHE_MIB=32768 EST_GPU_MIB=27000 NODE_VERSION=22.22.1 (scripts/remote/controllerConfig.mjs)
#   CTX=49152 (3090: 98304 and 65536 x 4 slots + MTP run out of VRAM) PARALLEL=4 NMAX=2 FIT_TARGET=2436 PORT=18080 EXTRA_ARGS="" (8080 is the Vast template jupyter)
set -euo pipefail

PHASE="${1:-all}"
ROOT="${SO_ROOT:-/root/so-llama}"
TAG="b11888"
SO_PATCH="${SO_PATCH:-0}"
CUDA_ARCH="${CUDA_ARCH:-86}"
PATCH_FILE="${PATCH_FILE:-/root/so-cache-b11888.patch}"
CCCL="${CCCL-v3.4.3}"
CTX="${CTX:-49152}"
PARALLEL="${PARALLEL:-4}"
NMAX="${NMAX:-2}"
FIT_TARGET="${FIT_TARGET:-2436}"
NGL="${NGL:-all}"
FIT="${FIT:-off}"
THREADS="${THREADS:-$(nproc)}"
PORT="${PORT:-18080}"
EXTRA_ARGS="${EXTRA_ARGS:-}"
LOG="${LOG:-/tmp/llama-server.log}"
SESSION="llama"
CTL_DIR="${CTL_DIR:-/root/so-ctl}"
CTL_STATE="${CTL_STATE:-/root/so-ctl-state}"
CTL_SESSION="so-ctl"
CTL_LOG="${CTL_LOG:-/tmp/so-controller.log}"
CTL_CTX="${CTL_CTX:-131072}"
GATEWAY_PORT="${GATEWAY_PORT:-18888}"
BACKEND_PORT="${BACKEND_PORT:-18889}"
SO_REPO="${SO_REPO:-https://github.com/MaxiPawlowski/story-orchestrator}"
SO_REF="${SO_REF:-master}"
NODE_VERSION="${NODE_VERSION:-22.22.1}"

HF_REPO="TheDrummer/Artemis-31B-v1.1-GGUF"
HF_REV="65d0086759d0d45f728b610f48651d4a98d89ed4"
MAIN_FILE="Artemis-31B-v1m-Q4_K_M.gguf"
MAIN_SHA="f763178ae1f4505070326fb773105cb8e56413a3bcda0de6f5c3eb81128977f1"
MAIN_BYTES=18687063072
MTP_FILE="MTP/mtp-Artemis-31B-v1m-Q8_0.gguf"
MTP_SHA="5ae8b0117bed601e8924c6305bd5b0585de361d51f0e77091bcb4252cf1f27de"
MTP_BYTES=514687104
ALIAS="TheDrummer/Artemis-31B-v1.1-GGUF"

if [ "$SO_PATCH" = "1" ]; then VARIANT="so"; else VARIANT="stock"; fi
case "$CUDA_ARCH" in 86) ;; cpu) VARIANT="$VARIANT-cpu" ;; *) VARIANT="$VARIANT-sm$CUDA_ARCH" ;; esac
SRC="$ROOT/src/llama.cpp-$TAG-$VARIANT"
BUILD="$ROOT/build/$TAG-$VARIANT"
BIN="$BUILD/bin/llama-server"
MODELS="$ROOT/models"
MAIN="$MODELS/$(basename "$MAIN_FILE")"
MTP="$MODELS/$(basename "$MTP_FILE")"

say() { printf '[vast-bootstrap %s] %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }
die() { say "FAIL: $*"; exit 1; }

phase_deps() {
  [ "$(id -u)" = "0" ] || die "run as root (Vast images log in as root)"
  touch /root/.no_auto_tmux
  local need=""
  local tools="git cmake ninja tmux curl sha256sum"
  [ "$CUDA_ARCH" = "cpu" ] || tools="$tools nvidia-smi"
  for tool in $tools; do command -v "$tool" >/dev/null 2>&1 || need="$need $tool"; done
  if [ -n "$need" ] || ! dpkg -s libssl-dev >/dev/null 2>&1; then
    say "apt: installing build deps (missing:${need:- none})"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq --no-install-recommends git cmake ninja-build build-essential tmux curl ca-certificates libssl-dev python3-pip >/dev/null
  fi
  local cmv; cmv="$(cmake --version | head -1 | awk '{print $3}')"
  if [ "$(printf '%s\n3.28\n' "$cmv" | sort -V | head -1)" != "3.28" ]; then
    say "cmake $cmv is older than 3.28: pip install"
    python3 -m pip install -q 'cmake>=3.28,<4' 2>/dev/null || python3 -m pip install -q --break-system-packages 'cmake>=3.28,<4'
    hash -r
  fi
  if [ "$CUDA_ARCH" = "cpu" ]; then df -h "$ROOT" 2>/dev/null || df -h /root; return; fi
  command -v nvcc >/dev/null 2>&1 || [ -x /usr/local/cuda/bin/nvcc ] || die "no nvcc: the instance needs a CUDA *devel* image"
  nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader
  local cap; cap="$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader | head -1 | tr -d ' .')"
  [ "$cap" = "$CUDA_ARCH" ] || say "WARNING: GPU compute capability $cap but CUDA_ARCH=$CUDA_ARCH (3090 = 86, 5090 = 120): pass CUDA_ARCH=$cap to build"
  df -h "$ROOT" 2>/dev/null || df -h /root
}

phase_build() {
  if [ -x "$BIN" ]; then say "build: $BIN exists, skipping"; "$BIN" --version 2>&1 | head -2 || true; return; fi
  export PATH="/usr/local/cuda/bin:$PATH"
  mkdir -p "$ROOT/src" "$ROOT/build"
  if [ ! -d "$SRC/.git" ]; then
    say "clone llama.cpp $TAG"
    git clone --quiet --depth 1 --branch "$TAG" https://github.com/ggml-org/llama.cpp "$SRC"
  fi
  if [ "$SO_PATCH" = "1" ] && ! git -C "$SRC" log --oneline -12 | grep -q "prompt cache key"; then
    [ -f "$PATCH_FILE" ] || die "SO_PATCH=1 but $PATCH_FILE is missing: scp scripts/local/llama-patches/so-cache-b11888.patch there first"
    say "apply $(basename "$PATCH_FILE")"
    git -C "$SRC" -c user.name=so -c user.email=so@localhost am --quiet "$PATCH_FILE" || { git -C "$SRC" am --abort || true; die "patch did not apply on $TAG"; }
  fi
  local cuda_flags
  if [ "$CUDA_ARCH" = "cpu" ]; then
    CCCL=""; cuda_flags="-DGGML_CUDA=OFF"
    say "configure (CPU only, no CUDA)"
  else
    local release; release="$(nvcc --version | grep -o 'release [0-9.]*' | awk '{print $2}')"
    if [ "$CUDA_ARCH" -ge 100 ] && [ "$(printf '%s\n12.8\n' "$release" | sort -V | head -1)" != "12.8" ]; then
      die "CUDA_ARCH=$CUDA_ARCH needs CUDA >= 12.8; this image has $release: pick a CUDA 12.8+/13.x devel image"
    fi
    cuda_flags="-DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=$CUDA_ARCH"
    say "configure (CUDA $release, sm_$CUDA_ARCH, CCCL ${CCCL:-bundled})"
  fi
  configure() {
    cmake -S "$SRC" -B "$BUILD" -G Ninja -DCMAKE_BUILD_TYPE=Release \
      $cuda_flags -DGGML_NATIVE=ON \
      ${CCCL:+-DGGML_CUDA_CCCL_VERSION=$CCCL} \
      -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_CURL=OFF >"$ROOT/cmake-configure.log" 2>&1
  }
  if ! configure; then
    [ -n "$CCCL" ] || { tail -40 "$ROOT/cmake-configure.log"; die "cmake configure failed (log $ROOT/cmake-configure.log)"; }
    say "configure with CCCL $CCCL failed: retrying with the toolkit's bundled CCCL"
    rm -rf "$BUILD"; CCCL=""
    configure || { tail -40 "$ROOT/cmake-configure.log"; die "cmake configure failed (log $ROOT/cmake-configure.log)"; }
  fi
  say "build llama-server with $(nproc) jobs"
  cmake --build "$BUILD" --config Release -j "$(nproc)" --target llama-server >"$ROOT/cmake-build.log" 2>&1 \
    || { tail -40 "$ROOT/cmake-build.log"; die "build failed (log $ROOT/cmake-build.log)"; }
  "$BIN" --version 2>&1 | head -2
}

fetch() {
  local file="$1" dest="$2" sha="$3" bytes="$4"
  if [ -f "$dest" ] && [ -f "$dest.ok" ]; then say "model: $(basename "$dest") verified earlier, skipping"; return; fi
  if [ -f "$dest" ]; then
    say "model: $(basename "$dest") staged (scp), sha256"
    [ "$(sha256sum "$dest" | cut -c1-64)" = "$sha" ] || die "$dest: sha256 mismatch (re-upload it)"
    touch "$dest.ok"; return
  fi
  local url="https://huggingface.co/$HF_REPO/resolve/$HF_REV/$file"
  local code; code="$(curl -sI -L -o /dev/null -w '%{http_code}' "$url" || true)"
  case "$code" in
    200|302) ;;
    404) die "$file is not on Hugging Face ($HF_REPO@$HF_REV): upload the local copy instead: scp <local $file> root@<box>:$dest.upload && ssh root@<box> mv $dest.upload $dest, then re-run models" ;;
    401|403) die "Hugging Face answered $code for $file: the repo needs a token. Stop here; the owner decides (no token is set by this script)" ;;
    *) die "Hugging Face answered $code for $url" ;;
  esac
  local free; free="$(df -B1 --output=avail "$MODELS" | tail -1)"
  local have=0; [ -f "$dest.part" ] && have="$(stat -c %s "$dest.part")"
  [ "$free" -gt $((bytes - have + 1073741824)) ] || die "not enough disk for $(basename "$dest"): need $((bytes - have)) B + 1 GiB, free $free B"
  say "download $file ($((bytes / 1048576)) MiB, resuming from $have B)"
  curl -fL --retry 8 --retry-delay 5 --retry-all-errors -C - -o "$dest.part" "$url" || die "download of $file failed (re-run to resume)"
  [ "$(stat -c %s "$dest.part")" = "$bytes" ] || die "$file: size $(stat -c %s "$dest.part") != $bytes (re-run to resume)"
  say "sha256 $(basename "$dest")"
  [ "$(sha256sum "$dest.part" | cut -c1-64)" = "$sha" ] || { rm -f "$dest.part"; die "$file: sha256 mismatch (deleted, re-run)"; }
  mv "$dest.part" "$dest"
  touch "$dest.ok"
}

phase_models() {
  mkdir -p "$MODELS"
  fetch "$MAIN_FILE" "$MAIN" "$MAIN_SHA" "$MAIN_BYTES"
  fetch "$MTP_FILE" "$MTP" "$MTP_SHA" "$MTP_BYTES"
}

fit_args() { if [ "$FIT" = "on" ]; then printf -- "--fit on --fit-ctx %s --fit-target %s" "$CTX" "$FIT_TARGET"; else printf -- "--fit off"; fi; }

server_cmd() {
  printf '%s' "$BIN --model $MAIN --model-draft $MTP --spec-type draft-mtp --spec-draft-n-max $NMAX --alias $ALIAS --host 127.0.0.1 --port $PORT --ctx-size $CTX --parallel $PARALLEL --kv-unified --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --n-gpu-layers $NGL $(fit_args) --threads $THREADS --threads-batch $THREADS --jinja --metrics --no-slots --no-webui --no-mmproj --offline --log-timestamps --log-prefix $EXTRA_ARGS"
}

phase_serve() {
  [ -x "$BIN" ] || die "no $BIN: run the build phase"
  [ -f "$MAIN.ok" ] && [ -f "$MTP.ok" ] || die "models not verified: run the models phase"
  case "$EXTRA_ARGS" in *0.0.0.0*|*--host*) die "EXTRA_ARGS may not change --host: the server binds 127.0.0.1 only (reach it through the ssh tunnel)";; esac
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    say "serve: tmux session '$SESSION' already running (stop phase first to change flags; so-pod pull before any restart)"
    return
  fi
  local cmd; cmd="$(server_cmd)"
  printf '#!/usr/bin/env bash\nset -o pipefail\necho "=== start $(date -u +%%FT%%TZ) ===" >> %s\nexec %s >> %s 2>&1\n' "$LOG" "$cmd" "$LOG" > "$ROOT/run-server.sh"
  chmod +x "$ROOT/run-server.sh"
  say "serve: $cmd"
  tmux new-session -d -s "$SESSION" "$ROOT/run-server.sh"
  phase_health
}

phase_health() {
  local deadline=$(( $(date +%s) + ${HEALTH_TIMEOUT_S:-900} )) body=""
  say "health: waiting for 127.0.0.1:$PORT/health (log $LOG)"
  while [ "$(date +%s)" -lt "$deadline" ]; do
    body="$(curl -s --max-time 3 "http://127.0.0.1:$PORT/health" || true)"
    case "$body" in *'"ok"'*) break;; esac
    tmux has-session -t "$SESSION" 2>/dev/null || { tail -30 "$LOG"; die "llama-server exited during load"; }
    sleep 5
  done
  case "$body" in *'"ok"'*) ;; *) tail -30 "$LOG"; die "no healthy server after ${HEALTH_TIMEOUT_S:-900} s";; esac
  say "health: $body"
  curl -s "http://127.0.0.1:$PORT/props" | python3 -c 'import json,sys; p=json.load(sys.stdin); g=p.get("default_generation_settings",{}); print("props: total_slots=%s n_ctx=%s model=%s" % (p.get("total_slots"), g.get("n_ctx", p.get("n_ctx")), p.get("model_alias", p.get("model_path"))))' || true
  nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader
  local reply
  reply="$(curl -s --max-time 120 "http://127.0.0.1:$PORT/completion" -H 'Content-Type: application/json' \
    -d '{"prompt":"<|turn>user\nReply with exactly: PONG<turn|>\n<|turn>model\n","n_predict":24,"temperature":0}' \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); t=d.get("timings",{}); print(repr(d.get("content","")), "draft_n=%s accepted=%s tok/s=%s" % (t.get("draft_n"), t.get("draft_n_accepted"), t.get("predicted_per_second")))' || true)"
  say "completion probe: $reply"
}

phase_stop() {
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux send-keys -t "$SESSION" C-c
    for _ in $(seq 1 30); do tmux has-session -t "$SESSION" 2>/dev/null || break; sleep 1; done
    tmux kill-session -t "$SESSION" 2>/dev/null || true
    say "stop: llama-server stopped (log kept at $LOG)"
  else
    say "stop: nothing running"
  fi
}

phase_status() {
  tmux has-session -t "$SESSION" 2>/dev/null && say "tmux '$SESSION' running" || say "tmux '$SESSION' not running"
  curl -s --max-time 3 "http://127.0.0.1:$PORT/health" || true; echo
  [ -f "$LOG" ] && ls -l "$LOG"
  nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader
  df -h "$ROOT"
}

node_bin() {
  if [ -n "${NODE_BIN:-}" ]; then printf '%s' "$NODE_BIN"; return; fi
  local have; have="$(command -v node || true)"
  if [ -n "$have" ] && [ "$("$have" -p 'process.versions.node.split(".")[0]')" -ge 22 ]; then printf '%s' "$have"; return; fi
  local dir="/opt/node-v$NODE_VERSION-linux-x64"
  if [ ! -x "$dir/bin/node" ]; then
    command -v xz >/dev/null 2>&1 || { export DEBIAN_FRONTEND=noninteractive; apt-get install -y -qq --no-install-recommends xz-utils >/dev/null; }
    say "node: installing v$NODE_VERSION to $dir" >&2
    curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" | tar -xJ -C /opt || die "node download failed"
  fi
  printf '%s' "$dir/bin/node"
}

controller_code() {
  if [ -f "$CTL_DIR/scripts/local/controller.mjs" ] && [ -f "$CTL_DIR/scripts/remote/controllerConfig.mjs" ]; then
    say "controller: code at $CTL_DIR ($(cat "$CTL_DIR/.so-ref" 2>/dev/null || echo uploaded))"; return
  fi
  say "controller: sparse clone $SO_REPO@$SO_REF into $CTL_DIR"
  rm -rf "$CTL_DIR"
  git clone --quiet --filter=blob:none --no-checkout "$SO_REPO" "$CTL_DIR"
  git -C "$CTL_DIR" sparse-checkout set --no-cone /scripts/local/ /scripts/remote/ /server-plugin/story-orchestrator-gpu/broker/
  git -C "$CTL_DIR" checkout --quiet "$SO_REF"
  git -C "$CTL_DIR" rev-parse HEAD > "$CTL_DIR/.so-ref"
}

ctl_get() { curl -s --max-time "${2:-10}" "http://127.0.0.1:$GATEWAY_PORT$1"; }

phase_controller() {
  [ -x "$BIN" ] || die "no $BIN: run the build phase (SO_PATCH=1 CUDA_ARCH=$CUDA_ARCH)"
  local model="${CTL_MODEL:-$MAIN}" draft="${CTL_MTP:-$MTP}"
  [ "$draft" = "none" ] && draft=""
  if [ -z "${CTL_MODEL:-}" ]; then [ -f "$MAIN.ok" ] && [ -f "$MTP.ok" ] || die "models not verified: run the models phase"; fi
  [ -f "$model" ] || die "no model file $model"
  tmux has-session -t "$SESSION" 2>/dev/null && die "the plain llama-server (tmux '$SESSION') is running: run the stop phase first; the controller starts its own"
  if tmux has-session -t "$CTL_SESSION" 2>/dev/null; then
    say "controller: tmux '$CTL_SESSION' already running (controller-stop first to change the config)"
    phase_controller_health; return
  fi
  local node; node="$(node_bin)"
  controller_code
  mkdir -p "$CTL_STATE"
  local serverkeys=1; [ "$SO_PATCH" = "1" ] || serverkeys=0
  BIN="$BIN" MODEL="$model" MTP_MODEL="$draft" STATE_DIR="$CTL_STATE" CTX="$CTL_CTX" THREADS="$THREADS" NGL="$NGL" NMAX="$NMAX" \
    GATEWAY_PORT="$GATEWAY_PORT" BACKEND_PORT="$BACKEND_PORT" SERVER_KEYS="$serverkeys" ALIAS="${CTL_ALIAS:-$ALIAS}" \
    "$node" "$CTL_DIR/scripts/remote/controllerConfig.mjs" "$CTL_STATE/config.json"
  [ -z "${CTL_CONFIG_PATCH:-}" ] || "$node" -e 'const fs=require("fs");const f=process.argv[1];const c=JSON.parse(fs.readFileSync(f,"utf8"));const p=JSON.parse(process.argv[2]);for(const[k,v]of Object.entries(p))c[k]=v&&typeof v==="object"&&!Array.isArray(v)&&c[k]&&typeof c[k]==="object"?{...c[k],...v}:v;fs.writeFileSync(f,JSON.stringify(c,null,2));' "$CTL_STATE/config.json" "$CTL_CONFIG_PATCH"
  if pgrep -f "^$BIN " >/dev/null; then say "controller: stopping a stray $BIN left by an earlier run"; pkill -f "^$BIN " || true; sleep 2; fi
  printf '#!/usr/bin/env bash\ncd %s\necho "=== start $(date -u +%%FT%%TZ) ===" >> %s\n%s scripts/local/controller.mjs %s >> %s 2>&1\ncode=$?\npkill -f "^%s " || true\necho "=== exit $code $(date -u +%%FT%%TZ) ===" >> %s\n' \
    "$CTL_DIR" "$CTL_LOG" "$node" "$CTL_STATE/config.json" "$CTL_LOG" "$BIN" "$CTL_LOG" > "$CTL_STATE/run-controller.sh"
  chmod +x "$CTL_STATE/run-controller.sh"
  say "controller: starting in tmux '$CTL_SESSION' (gateway 127.0.0.1:$GATEWAY_PORT, llama-server 127.0.0.1:$BACKEND_PORT, log $CTL_LOG)"
  tmux new-session -d -s "$CTL_SESSION" "$CTL_STATE/run-controller.sh"
  phase_controller_health
}

phase_controller_health() {
  local node; node="$(node_bin)"
  local deadline=$(( $(date +%s) + 60 ))
  until ctl_get /health 3 | grep -q '"phase"'; do
    [ "$(date +%s)" -lt "$deadline" ] || { tail -30 "$CTL_LOG"; die "gateway did not answer on 127.0.0.1:$GATEWAY_PORT"; }
    tmux has-session -t "$CTL_SESSION" 2>/dev/null || { tail -30 "$CTL_LOG"; die "controller exited"; }
    sleep 1
  done
  say "controller: gateway up; loading text (POST /control/load, up to ${HEALTH_TIMEOUT_S:-900} s)"
  curl -s --max-time "${HEALTH_TIMEOUT_S:-900}" -X POST "http://127.0.0.1:$GATEWAY_PORT/control/load" -H 'content-type: application/json' -d '{}' >/dev/null || true
  ctl_get /status 15 | "$node" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);const m=d.memberCache??{};const t=d.text??{};console.log(`status: phase ${d.phase}; text ${t.profile??"unloaded"} pid ${t.pid??"-"}${t.lastError?` error ${t.lastError}`:""}; maxContext ${d.maxContext}; GPU free ${Math.round(d.telemetry?.gpus?.[0]?.freeMiB??NaN)} MiB; RAM available ${Math.round(d.telemetry?.host?.availableMiB??NaN)} MiB; member cache ${m.store} serverKeys ${m.serverKeys} ${m.occupancy??""}`)})' || true
  ctl_get /props 15 | "$node" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const p=JSON.parse(s);console.log(`props: total_slots ${p.total_slots} n_ctx ${p.default_generation_settings?.n_ctx??p.n_ctx} model ${p.model_alias??p.model_path}`)}catch{console.log("props: "+s.slice(0,200))}})' || true
  command -v nvidia-smi >/dev/null 2>&1 && [ "$CUDA_ARCH" != "cpu" ] && nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader
  local reply
  reply="$(curl -s --max-time 300 "http://127.0.0.1:$GATEWAY_PORT/completion" -H 'Content-Type: application/json' \
    -d '{"prompt":"<|turn>user\nReply with exactly: PONG<turn|>\n<|turn>model\n","n_predict":24,"temperature":0}' \
    | "$node" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const d=JSON.parse(s);const t=d.timings??{};console.log(JSON.stringify(d.content), `draft_n=${t.draft_n} accepted=${t.draft_n_accepted} tok/s=${t.predicted_per_second}`)}catch{console.log(s.slice(0,300))}})' || true)"
  say "completion probe (through the gateway): $reply"
}

phase_controller_stop() {
  if tmux has-session -t "$CTL_SESSION" 2>/dev/null; then
    curl -s --max-time 60 -X POST "http://127.0.0.1:$GATEWAY_PORT/control/stop" -H 'content-type: application/json' -d '{}' >/dev/null || true
    for _ in $(seq 1 30); do tmux has-session -t "$CTL_SESSION" 2>/dev/null || break; sleep 1; done
    tmux kill-session -t "$CTL_SESSION" 2>/dev/null || true
    say "controller-stop: stopped (log kept at $CTL_LOG)"
  else
    say "controller-stop: nothing running"
  fi
  if pgrep -f "^$BIN " >/dev/null; then pkill -f "^$BIN " || true; say "controller-stop: stopped a leftover $BIN"; fi
}

phase_controller_status() {
  tmux has-session -t "$CTL_SESSION" 2>/dev/null && say "tmux '$CTL_SESSION' running" || say "tmux '$CTL_SESSION' not running"
  ctl_get /status 15 | head -c 2000; echo
  [ -f "$CTL_LOG" ] && tail -5 "$CTL_LOG"
}

case "$PHASE" in
  all) phase_deps; phase_build; phase_models; phase_serve ;;
  controller) phase_controller ;;
  controller-health) phase_controller_health ;;
  controller-stop) phase_controller_stop ;;
  controller-status) phase_controller_status ;;
  deps) phase_deps ;;
  build) phase_build ;;
  models) phase_models ;;
  serve) phase_serve ;;
  health) phase_health ;;
  stop) phase_stop ;;
  status) phase_status ;;
  cmd) server_cmd; echo ;;
  *) die "unknown phase '$PHASE' (all|deps|build|models|serve|health|stop|status|cmd|controller|controller-health|controller-stop|controller-status)" ;;
esac
