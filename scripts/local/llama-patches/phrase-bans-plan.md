# Phrase bans with backtracking: patch plan (v3.0 43 spike `phraseBans`)

Not built. Request side is ready (`src/runtime/spikes/phraseBans.ts`); this is the server half, to be built as a ninth commit
on `so-r4` (b11888) in a GPU window. Do not rebuild or restart the owner's controller outside that window.

## Request contract
- Body key `banned_strings: string[]` (KoboldCpp / exllamav2 name), at most 200 phrases of at most 64 chars, matched
  case-insensitively on word boundaries over the detokenized text. Absent or empty = stock behaviour, zero cost.
- `GET /props` adds `so_phrase_bans: { enabled: true, max: 200 }`; the page sends the key only when it sees that
  (`readPhraseBanCapability`), only on loud story-chat llama.cpp requests (`phraseBanBody`).

## Server change (tools/server, common/sampling)
1. `server-task.h/.cpp`: parse `banned_strings` into `slot_params.banned_strings` (lowercased, trimmed); reject over-limit
   lists with 400. `server-schema.cpp`: document the key. `server-context.cpp` `/props`: emit the capability.
2. Per slot: a hold-back buffer of generated text not yet streamed. A token's text is streamed only once no banned phrase
   can still start inside the held suffix (longest phrase length bounds the hold). Streaming clients see a short lag,
   never a retracted token.
3. On a match ending at position p: find the token index `t0` where the match starts (keep a per-token text offset
   table for the held window), roll the slot back to `t0` (`llama_memory_seq_rm` from `n_past` of `t0`; with MTP the
   draft state is reset the same way `cache_rewind` does), truncate the held text, and resample at `t0` with the first
   token of the match added to a per-position logit-bias ban (`-inf`) that lives until the position is passed.
4. Bound the work: at most 8 backtracks per phrase per request and 32 per request; past that the match is accepted and
   counted (`timings.phrase_bans_gave_up`). Report `timings.phrase_bans_backtracks` and the tokens regenerated.
5. Interaction with patched features: a backtrack inside a `checkpoint_at` region must not leave a checkpoint past the
   new end (drop checkpoints with pos >= `t0`); keyed RAM cache entries are written only from the final sequence.
   Speculative decoding: run the ban check on accepted tokens only, after verification.
6. No change for `/v1/chat/completions` thinking channels: bans apply to the visible content only (reasoning is not
   matched), so thought text is never resampled.

## Verification (GPU row SP-PB in `docs/plans/v3.0/gpu-queue-2026-10-30.md`)
- Unit: a server test that bans a phrase the greedy model always emits at temperature 0 and checks it is absent and the
  stream is a prefix of the final text.
- Floors (predeclared, `PHRASE_BAN_FLOORS`): banned-phrase rate per 1,000 words down by at least half vs control; decode
  tokens/s at least 95% of the stock build on the same prompts; blind rating neutral or better.
- Offline baseline (2026-10-31, archived sessions, default list): 0.619 hits per 1,000 words, 102 of 1,277 replies.
