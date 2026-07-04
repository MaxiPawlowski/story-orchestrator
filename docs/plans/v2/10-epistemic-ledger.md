# Plan 10 — Epistemic Map + State Ledger

## Objective

Per-character knowledge tracking (knows / suspects / believes-falsely / unaware / hiding-from) with **private injection** — each responding character sees only their own knowledge — plus the right-now state ledger whose gate-relevant fields are blackboard qualities.

## Context

- Spec: §Memory subsystem (epistemic map, state ledger, bridges), §Cast model (private perspective), §ST integration (`GROUP_MEMBER_DRAFTED`).
- Consumes from 07: per-character stores, injector, P2 scene passes. From 08: budgets/scoring. From 01/03: blackboard, apply queue.
- **Base**: Smart-Memory perspectives/secrets + state ledger features (locate the modules in the pinned checkout — likely within `longterm.js`/`profiles.js`/dedicated files; record actual locations).
- ST facts: `GROUP_MEMBER_DRAFTED` (`'group_member_drafted'`, `events.js:59`) fires with the drafted character before their generation; `setExtensionPrompt` for the private block.

## Scope

**In**: epistemic tier + extraction, private per-speaker injection, state ledger tier, ledger↔blackboard field sharing, dramatic-irony fixtures, capability-profile downgrade path.
**Non-goals**: Studio surfacing (11), non-group (solo) chats need only the single-speaker degenerate case.

## Deliverables

- `src/memory/epistemic.ts` — per-character entries `{subject, tag: knows|suspects|believes|unaware|hiding, content, hiddenFrom?}`; extracted in the P2 per-character pass (scene breaks) + shared-read tags for high-signal moments; port Smart-Memory's extraction wording.
- Private injection: on `GROUP_MEMBER_DRAFTED` (new subscription in `stHost/events.ts` if missing), swap the epistemic + private-facts extension prompt to the drafted character's block before generation; clear/restore after. Non-group chats: active character's block statically.
- `src/memory/ledger.ts` — per-entity right-now state `{entity, field, value, turn}`; extracted P2 + shared-read tags. **Blackboard sharing**: quality schema gains optional `ledger_binding {entity, field}` (schema + validate extension); bound fields are written *only* via the blackboard (apply queue, extractor source) and mirrored read-only into the ledger view — single writer, no divergence. Unbound ledger fields are grounding-only.
- Capability profile: epistemic extraction quality-gated — settings toggle + heuristic warning (per spec: downgrade only when the model can't do it, never for cost). When off, private injection falls back to shared facts only.
- Fixtures: dramatic-irony suite — A hides X from B; goldens for per-character passes; assertions: A's block contains `hiding`, B's block contains nothing about X, B's `believes` false entry preserved until reveal; reveal scene flips B to `knows` and supersedes the false belief (08 supersession reused).

## Implementation notes

- The draft-time swap must be synchronous within the event handler (before ST builds the prompt) — verify handler timing against `group-chats.js` generation flow in ST source; if async, pre-stage all members' blocks keyed by member id, swap on the draft event, invalidate on scene break or epistemic update.
- Injection keys must be per-purpose, not per-character (one `epistemic` slot whose content swaps), to avoid slot leaks.
- Ledger↔blackboard rule is strict single-writer; validator rejects `ledger_binding` on `source: code` qualities.

## Validation gate

1. Baseline green; dramatic-irony fixtures pass on goldens (both extraction and injection-content assertions).
2. Live, 2-member group with a planted secret: capture both members' prompts across consecutive replies (`st-context.mjs` extension prompts per draft, or prompt-log inspection) → each saw only their own block; behavior stays perspective-accurate in the actual replies (manual read, note in Gate record).
3. Ledger: bound quality (e.g. `location`) changes via extraction → ledger view mirrors it; unbound field extracted → ledger only, blackboard untouched.
4. Toggle capability profile off → epistemic passes stop, no errors, shared injection continues.

## Delegated decisions

Exact P2 per-character pass batching (one call per character vs one combined call — measure quality, record); reveal-detection wording; ledger entity naming normalization.
