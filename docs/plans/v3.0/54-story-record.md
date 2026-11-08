# v3.0 54 — Story record: what happened, why, who knows, what is open

Status 2026-11-08: PLANNED (docs only). Astra's "shared foundation". Built with or right after 48; read by 51 and 52.

## Why

Owner 2026-11-08 wants quests whose consequences show up later in the story. Later systems (director, pacing, recap,
author tools) each need the same answer: what happened, why, who was affected, who knows, what is still unresolved.
Today each one rebuilds part of it.

## What exists (the sources; no new one is added)

- Boundary log: `BoundaryLogEntry` with `before`/`after`/`evaluated` blackboards and context (`engine/engine.ts`,
  `stateLog`).
- Consequence refs per boundary, with `playerSpan` for "Because you…" (`runtime/consequences.ts`, `extras.recap`,
  `evidencedCause`).
- Effect ledger: write-ahead rows per host effect (`runtime/effectLedger.ts`).
- Session journal: derived from the rings at read time; only status transitions and flags persist (`extras.journal`).
- Who knows: held secrets and `secretAudience` (`memory/heldSecrets.ts`, `runtime/whoKnows.ts`), the audience contract
  (`memory/audience.ts`), rumors' landed hearsay (`extras.rumors`), promises (`extras.promises`).
- Open items: quest statuses (`engine/quests.ts`), pending echoes, open commitments and promises, open arcs
  (`memory/arcs.ts`).

## Design

- `runtime/storyRecord.ts`: a pure projection in a lazy chunk. `buildStoryRecord(sources, range)` returns rows; nothing
  is persisted.
  - Each row: `{ boundary, messageId, event, causes[], effects[], audience, opens[], closes[] }`.
  - `event`: a typed ref (transition, resolution, consequence, faction move, pressure threshold, agenda end, check,
    milestone, echo landing, rumor landing).
  - `causes`: `decidingCause` (`runtime/consequences.ts:83`): a single deciding leaf with an applied queue write, plus
    the `playerSpan` when the commit guard recorded one. Anything else is "unknown". Merely changed leaves are never
    presented as a cause.
  - `effects`: effect-ledger row ids.
  - `audience` per roster member: `witnessed | told | not-told | unknown`. It comes from the audience contract where a
    relation exists; otherwise `unknown`. Never inferred from being on stage (disclosure is not knowledge).
- No cache. Memory, audience, held secrets and in-place ledger status change within a boundary, so a key of
  boundary + length goes stale. The record is built on demand, author-only or once per director plan; the p95 floor
  below keeps that cheap. A cache comes later only if the floor misses, keyed by every source's revision.
- Views:
  - author: the Author console "record" section tab, the 51 candidates, and author-only Ask;
  - player: none new. The player keeps the journal and recap, through `playerProjection.ts`.
- Held secrets: rows are built per audience. The author view shows everything. Any machine consumer (51 director)
  takes the resting view (`restingFilter`). No shared tier reads the record.

## Schema keys

None. No code key, no detector. Rollback ≡ replay holds because every source already rolls back. A property test proves
the record after rollback equals the record of a replay.

## Switch and floors

- Feature row `story-record` (author area), on by default. Off: 51 falls back to its sources 4 and 5.
- D floors (hard):
  - record(rollback) == record(replay) over 200 seeds;
  - 0 secret text in the resting view (planted held secret);
  - build time p95 ≤ 5 ms over a 300-boundary log (performance rule; measured first, then the floor kept).

## Tests and live gate

- Pure: `storyRecord.test.ts`, a property test, a secret planted control.
- Runtime: author console Storybook story; `so-ui.mts assert-player-clean`.
- `npm run gates`. Live: the no-model scenario reads the record after a scripted resolution + rollback.

## Adolion adoption

No authored fields. Nothing to change.

## Order, size, resources

Size S-M. CPU only. Alongside 48 (it needs the resolution refs); before 51.

## Unresolved questions

- Should the record also be the director's only input for "what happened" (replacing its own thread list), or sit
  beside it?
