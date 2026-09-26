#!/usr/bin/env bash
# pod-side: established TCP connections to llama-server :8080, every 5 s (a request = one connection)
out="$1"
ssh -o BatchMode=yes -o ServerAliveInterval=30 -i ~/.ssh/id_ed25519_runpod -p 42549 root@213.173.109.238 'while true; do printf "%s\t%s\t%s\n" "$(date -u +%H:%M:%S)" "$(ss -tnH state established "( sport = :8080 )" | wc -l)" "$(ss -tnH state established "( sport = :8080 )" | awk "{print \$4}" | tr "\n" " ")"; sleep 5; done' >> "$out"
