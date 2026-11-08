#!/usr/bin/env bash
# Runs on Windows (Git Bash): keeps 127.0.0.1:18890 -> box gateway 127.0.0.1:18888 open, reconnecting after drops.
#   bash scripts/remote/ctl-tunnel.sh <host> <ssh port> [key, default ~/.ssh/id_ed25519_vast]
# Env: LOCAL_PORT=18890 REMOTE_PORT=18888 KNOWN_HOSTS=~/.ssh/known_hosts (the host key must already be accepted: first ssh by hand)
# SillyTavern connection profiles then use http://127.0.0.1:18890. Runbook: docs/plans/v3.0/vast-runbook.md
set -u
HOST="${1:?usage: ctl-tunnel.sh <host> <ssh port> [key]}"
SSH_PORT="${2:?usage: ctl-tunnel.sh <host> <ssh port> [key]}"
KEY="${3:-$HOME/.ssh/id_ed25519_vast}"
LOCAL_PORT="${LOCAL_PORT:-18890}"
REMOTE_PORT="${REMOTE_PORT:-18888}"
KNOWN_HOSTS="${KNOWN_HOSTS:-$HOME/.ssh/known_hosts}"
case "$LOCAL_PORT" in 8000|8188|18888|18889) echo "LOCAL_PORT $LOCAL_PORT belongs to a local service (scripts/debug/lib/laneRange.mts RESERVED_PORTS)"; exit 2;; esac
while true; do
  echo "[ctl-tunnel $(date -u +%H:%M:%SZ)] 127.0.0.1:$LOCAL_PORT -> $HOST:$REMOTE_PORT"
  ssh -N -T -L "127.0.0.1:$LOCAL_PORT:127.0.0.1:$REMOTE_PORT" -i "$KEY" -p "$SSH_PORT" \
    -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$KNOWN_HOSTS" \
    -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 "root@$HOST"
  echo "[ctl-tunnel $(date -u +%H:%M:%SZ)] ssh exited $?; reconnecting in 3 s (Ctrl+C stops)"
  sleep 3
done
