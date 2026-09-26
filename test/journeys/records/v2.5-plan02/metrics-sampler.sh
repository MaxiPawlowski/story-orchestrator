#!/usr/bin/env bash
# usage: metrics-sampler.sh <out.tsv> <seconds>
OUT="$1"; SECS="${2:-900}"
echo -e "utc\tprocessing\tdeferred\tprompt_tokens_total\tprompt_seconds_total\tn_busy_slots_per_decode" > "$OUT"
end=$(( $(date +%s) + SECS ))
while [ $(date +%s) -lt $end ]; do
  m=$(curl -s -m 3 http://127.0.0.1:18080/metrics)
  g() { echo "$m" | grep "^llamacpp:$1 " | awk '{print $2}'; }
  echo -e "$(date -u +%T)\t$(g requests_processing)\t$(g requests_deferred)\t$(g prompt_tokens_total)\t$(g prompt_seconds_total)\t$(g n_busy_slots_per_decode)" >> "$OUT"
  sleep 5
done
