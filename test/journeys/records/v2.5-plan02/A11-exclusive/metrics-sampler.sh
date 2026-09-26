#!/usr/bin/env bash
out="$1"
printf 'utc\tprocessing\tdeferred\tprompt_tokens_total\tprompt_tokens_cached_total\tprompt_seconds_total\ttokens_predicted_total\tn_decode_total\tn_busy_slots_per_decode\n' > "$out"
while true; do
  m=$(curl -s -m 10 http://127.0.0.1:18080/metrics)
  g(){ printf '%s' "$m" | awk -v k="llamacpp:$1" '$1==k{print $2}'; }
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -u +%H:%M:%S)" "$(g requests_processing)" "$(g requests_deferred)" "$(g prompt_tokens_total)" "$(g prompt_tokens_cached_total)" "$(g prompt_seconds_total)" "$(g tokens_predicted_total)" "$(g n_decode_total)" "$(g n_busy_slots_per_decode)" >> "$out"
  sleep 15
done
