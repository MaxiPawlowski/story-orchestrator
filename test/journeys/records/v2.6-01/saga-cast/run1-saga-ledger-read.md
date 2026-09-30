# Saga cast, run 1 (defect build), lane 3, 2026-09-30 20:27-20:35 UTC

Bundle: the slot as staged at 14:10 UTC (dev `7f24a1b6a7eb`, pre-fix). Read from the Saga chat's
`chat_metadata.story_orchestrator.stories["adolion-saga"].extras` on the lane's disk, after the seed
had reopened the group for the runtime read (20:33:58) and before it was re-seeded.

- `effects.ledger`: 200 rows (= `EFFECT_LEDGER_LIMIT`): 183 `cast` applied, 15 `cast` failed
  ("its write-ahead record could not be saved"), 2 `background` applied.
- `effects.cast` mirror: 119 members disabled (the whole start-checkpoint disable list).
- Duplicate applied rows for the same member (Leila at 20:31:29.710 and .857, Keder, Malach): the
  activate apply and a concurrent hydrate apply both walked the list.
- Group `disabled_members` after the seed left the chat: 17, exactly the first 17 names of the
  start checkpoint's disable list (Domas through Eriana, indices 0-16); plan 02 saw 19 (indices
  0-18, up to Leila) on lane 1 and 17 on lane 2. Every other group left behind read 0.

Cause: `appendRow` kept the newest 200 rows regardless of status, so the oldest APPLIED cast rows
(the head of the disable list) were evicted, and `restoreFor("leave")` could put back only the
members it still had rows for. The count varies with how many duplicate and refused rows the run
produced, which is why lanes 1 and 2 disagreed.

Also seen: the seed never switched extraction off, so each import made real extraction reads
through the lane's copied profile (27 completions in `server.log`). Fixed in the seed.
