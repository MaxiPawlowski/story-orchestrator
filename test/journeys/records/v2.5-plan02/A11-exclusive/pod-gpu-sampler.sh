#!/usr/bin/env bash
# pod-side: GPU utilisation every 2 s (evidence whether llama keeps computing after a client abort)
out="$1"
ssh -o BatchMode=yes -o ServerAliveInterval=30 -i ~/.ssh/id_ed25519_runpod -p 42549 root@213.173.109.238 'nvidia-smi --query-gpu=timestamp,utilization.gpu,power.draw --format=csv,noheader -lms 2000' >> "$out"
