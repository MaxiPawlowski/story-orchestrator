#!/usr/bin/env bash
# Runs ON the rented box (Vast.ai RTX 3090, Ubuntu 22.04/24.04 + CUDA 12.x/13.x devel image, root):
#   ssh -i ~/.ssh/id_ed25519_vast -p <port> root@<host> 'bash -s' < scripts/remote/vast-bootstrap.sh
#   ssh ... 'bash -s -- serve' < scripts/remote/vast-bootstrap.sh      (one phase: deps|build|models|serve|health|stop|status)
# Idempotent: every phase skips work already done. Runbook: docs/plans/v3.0/vast-runbook.md
# Env knobs (pass as: ssh ... 'CTX=65536 bash -s -- serve' < file):
#   SO_PATCH=1     build with scripts/local/llama-patches/so-cache-b11888.patch (scp it to /root/so-cache-b11888.patch first);
#                  default 0 = stock b11888 (MTP drafter is upstream; the patch only adds the controller's member-cache endpoints)
#   NGL=all FIT=off (all layers on the GPU or the load fails: --fit on measured the MTP draft as 0 and put layers on the CPU, 1.8 tok/s)
#   THREADS=$(nproc) (llama.cpp counts the host cores, 64, not the container quota)
#   CTX=49152 (3090: 98304 and 65536 x 4 slots + MTP run out of VRAM) PARALLEL=4 NMAX=2 FIT_TARGET=2436 PORT=18080 EXTRA_ARGS="" (8080 is the Vast template jupyter)
set -euo pipefail

PHASE="${1:-all}"
ROOT="${SO_ROOT:-/root/so-llama}"
TAG="b11888"
SO_PATCH="${SO_PATCH:-0}"
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
  for tool in git cmake ninja tmux curl sha256sum nvidia-smi; do command -v "$tool" >/dev/null 2>&1 || need="$need $tool"; done
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
  command -v nvcc >/dev/null 2>&1 || [ -x /usr/local/cuda/bin/nvcc ] || die "no nvcc: the instance needs a CUDA *devel* image"
  nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader
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
  say "configure (CUDA $(nvcc --version | grep -o 'release [0-9.]*'), sm_86, CCCL ${CCCL:-bundled})"
  configure() {
    cmake -S "$SRC" -B "$BUILD" -G Ninja -DCMAKE_BUILD_TYPE=Release \
      -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86 -DGGML_NATIVE=ON \
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

case "$PHASE" in
  all) phase_deps; phase_build; phase_models; phase_serve ;;
  deps) phase_deps ;;
  build) phase_build ;;
  models) phase_models ;;
  serve) phase_serve ;;
  health) phase_health ;;
  stop) phase_stop ;;
  status) phase_status ;;
  cmd) server_cmd; echo ;;
  *) die "unknown phase '$PHASE' (all|deps|build|models|serve|health|stop|status|cmd)" ;;
esac
