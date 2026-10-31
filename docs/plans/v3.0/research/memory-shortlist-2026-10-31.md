# Memory research shortlist (2026-10-31)

Six angle reports, same brief: `memory-agent-architectures.md`, `memory-knowledge-graphs.md`, `memory-rp-community.md`,
`memory-game-narrative.md`, `memory-cognition-evals.md`, `memory-context-compression.md`. Numbers in them are estimates
or third-party self-reports unless marked measured. Proposal ids below = `<report>:P<n>`.

## Consensus
- Keep the architecture: versioned ledger, code-side secret filter, rollback ≡ replay, no graph DB, no self-editing play
  model, no repeated memory rewrites (all six agree; field converging on per-member witnessing).
- Weakest points: recall keyed on exact names/last message; facts cap drops oldest regardless of use; read writes
  nearly blind; no end-to-end memory measurement.
- Verified in code 2026-10-31: `supersede.ts` `parseSupersessionVerdicts` has no non-test caller; `stores.ts` `capTier`
  keeps the newest N unpinned rows (facts 50) and drops the rest.

## Waves (recommended)

Wave 1, CPU only, no read-contract change (deterministic tiers + offline harnesses):
1. Compaction counts real tokens; assert ST trims nothing between cuts (compression:P3), S.
2. Collapse guard on the rolling short-term summary + entities on the summary row (compression:P1), S.
3. Retention by strength: use stamp on rows a reply used, boundary-clock decay, evict weakest into archive recall
   instead of dropping (cognition:P4), S-M.
4. Mention ledger: hold back a memory a member just said, per member, unless the player raises it (game:P1), S-M.
5. Retrieval query: last 3-4 messages recency-weighted + drafted member + scene cast, normalised score terms
   (agents:P2, rp:P3, compression:P2 query half), S-M; measured on E0 goldens.
6. Idle-time supersession verdicts wiring the unused parser (agents:P3), S.
7. Long-horizon availability probes on dry-run prompts, no model (cognition:P1 availability half), M.

Wave 2, read-contract changes (need live-suite x2 on GPU before adoption):
- Neighbour-aware read, `same=`/`update=` tags (agents:P1), M.
- Write-time retrieval keys (compression:P2 keys half), M.
- Relation rows with multiple values (graphs:P3), M.
- Social act tags on feeling lines (game:P3), M.

Wave 3, character-facing features (blind rating):
- "You and the player" memories per member (game:P2), M.
- "What changed" projection + private "since you last spoke" line (graphs:P1), S.
- Per-member perspective recap at chapter seal (rp:P1), M.

Measurement (beside wave 1, finishes on GPU): utilization half of the probes, reply contradiction rate (cognition:P2),
behavioural leak rate (cognition:P3), echo/vagueness floors for compaction ratings (rp:P2).

Parked: CPU cross-encoder reranker (needs a model download OK), placement probe (GPU), one-hop recall (graphs:P4,
after wave 1 query work), non-character name fold (graphs:P5, small, can join wave 1).
