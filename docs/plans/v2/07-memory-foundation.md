# Plan 07 — Memory Foundation (Smart-Memory Vendor)

## Objective

Vendor Smart-Memory into the extension and stand up the grounding layer's foundation: tier stores (facts / session details / scene history), memory extraction merged into the shared read (one call, two consumers), scene detection as the scheduling heartbeat, the cast model's per-character stores, and basic depth injection.

## Context

- Spec: §Memory subsystem (tiers table, shared read, scene detection, bridges intro), §Cast model, §ST integration (injection, storage).
- Consumes from 03: `sharedRead`/`contract`/`parse` (extend), scheduler (add P2), first-cut facts blob, audit records. From 02: TalkControl (add `sceneBreak` trigger), cast effects (`stHost/groups.ts`), persistence.
- **Base**: [Smart-Memory](https://github.com/senjinthedragon/Smart-Memory) (AGPL-3.0). Clone, pin a commit (record hash), read `docs/architecture.html` + `/tests` first. Relevant modules this plan: `longterm.js`, `session.js`, `scenes.js`, `prompts.js`, `parsers.js`, `memory-utils.js`, `profiles.js`.
- ST fact: `setExtensionPrompt` via `getContext()` (`st-context.js:40`) for depth injection.

## Scope

**In**: vendoring setup + LICENSE, tier stores + types, shared-read contract/parser extension for memory tags, scene detection (heuristics + contract question + P2 pass), per-character namespacing, roster wiring, depth injection, memory debug panel.
**Non-goals**: supersession/consolidation/scoring/budgets (08), arcs/canon upgrade (09), epistemic/ledger (10), WI writing (08).

## Deliverables

- Vendoring: `vendor/smart-memory/` (pinned checkout, reference only, excluded from build) + `LICENSE` (AGPL-3.0) at repo root + attribution note in README. Ported code goes to `src/memory/` as TS — port per module as consumed, don't bulk-convert.
- `src/memory/types.ts` — memory entry shape (port + extend): `{id, tier, text, type, importance 1-3, expiration scene|session|permanent, entities[], confidence, activationTriggers[], supersededBy?, characterId?, createdAt(turn), recallCount}`.
- `src/memory/stores.ts` — chat_metadata-backed stores: `facts` (per character + shared), `session_details`, `short_term` (Smart-Memory's rolling-summary tier — automatic summaries of recent play, complements scene history in very long scenes), `scene_history` (rolling window). Migrate 03's first-cut facts blob in. Rollback hook: on engine rollback (spec §Chat mutations), drop entries with `createdAt ≥ T` across all tiers.
- **Memorize backlog** — settings/drawer action for mid-chat adoption (Smart-Memory's "Memorize Chat"): windowed shared reads over existing history backfill the tiers, then one full-scope blackboard backfill read (03's historical-window support); progress indicator; scheduler P4 so live play is unaffected.
- Shared-read extension: contract gains Smart-Memory-style tagged extraction (port/adapt `prompts.js` sections for facts + session + scene summary), parser gains tag grammar (port `parsers.js` logic to TS with tests). Still ONE call per read: deltas + memory lines.
- `src/memory/sceneDetect.ts` — per-message code heuristics (time-skip phrasing port from `scenes.js`, `location` quality change, `---` divider, cast change); hit → P0 shared read; every read contract includes "did a scene break occur, where?"; confirmed break → P2 pass: scene summary → `scene_history`, expire `expiration: scene` entries, fire TalkControl `sceneBreak` triggers.
- Cast model: roster from story schema; per-character store namespacing (`characterId`); checkpoint `cast_changes` already applied by 02 — connect enabled-set to stores + injection (only enabled characters' tiers injected).
- `src/memory/inject.ts` — depth injection via `setExtensionPrompt` (one key per tier, configurable depth, ordered block; Smart-Memory default depths as starting values). Responding-character awareness lands in 10; here inject shared + active-speaker facts.
- Memory debug panel (drawer tab): per-tier entries, character filter, raw audit link.
- Suite-B eval fixtures extended: facts/session/scene tags asserted per 03's fuzzy scheme.

## Implementation notes

- Port discipline: Smart-Memory is battle-tested — preserve its extraction wording and parsing tolerances where possible; adapt storage (their per-chat store → our chat_metadata blobs) and remove their standalone scheduler/LLM client in favor of ours (03).
- Their multi-backend LLM client is NOT ported — Connection Profiles only (03's client).
- Scene detection must not add any standalone per-message LLM call (spec rule) — heuristics + piggyback question only.
- P2 pass ordering: scene summary runs before scene-expiration so the summary can cite expiring detail.
- Tier write ordering: memory updates carry their read's turn range; a tier write whose range is fully covered by a newer completed read for the same tier+character is dropped — mirror of 01's blackboard coverage rule, so P1 shared-read lines and P2 per-character passes cannot interleave stale.

## Validation gate

1. Baseline green; parser ports covered by unit tests (including Smart-Memory's own test cases where portable); suite-B fixtures pass on goldens.
2. Live: scripted scene (arrive → talk → `---` + location change) → `so-state.mjs`/debug panel show facts + session details extracted, scene break detected, scene summary in history, scene-scoped entries expired, `sceneBreak` NPC reply fired once.
3. Cast: checkpoint disables a member → their tier stops injecting; store retained.
4. Injection visible in prompt at configured depth (`st-context.mjs` extension prompts).
5. Memorize backlog on a pre-existing chat with history: tiers backfilled, blackboard backfill read applied, live play unaffected during the run; short-term rolling summary appears after sustained play.
6. Gate record: pinned Smart-Memory commit hash, modules ported vs pending.

## Delegated decisions

Vendor dir layout; how much of `memory-utils.js`/`profiles.js` to port now vs 08–10; tier injection depths; scene-heuristic regex set (start from Smart-Memory's).
