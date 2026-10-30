# v3.0 36 — Author view: who knows which secret, and read failures per model

**Status: PLANNED 2026-10-30** (harvest 2026-10-30, index `30-harvest-index.md`; revised after `30-review-sol.md`).
Nothing built. Size: M. Author view only; lands in 29's author surfaces (decision 10).

## Problem (author; protects the player)

- The author cannot see, per secret, who knows it, who is kept from it, and whether a kept-out member is on stage right
  now. The filter works per member block, but watching it live means reading raw epistemic rows.
- When the read model changes (07 engine work, a profile swap), nobody notices that its reads started failing to parse or
  stopped writing sidecar lines it used to write, until a scorer runs offline.

## Evidence

- Harvest: `extension-research-2026-10-30/tavernos-hud.md` P1 (secret rows x cast columns, on-stage alert; theirs is a
  player surface, ours never), P4 (per-model field-miss window; their auto-reminder rejected).
- Ours: tags `src/memory/epistemic.ts:16`; `heldSecrets` resolves knowers / kept-from (`src/memory/heldSecrets.ts:27-45`);
  presence `presentRosterIds` (`src/runtime/whereabouts.ts`). Audits keep 20 reads (`src/runtime/coordinators/extractionCoordinator.ts:286`);
  `SharedReadAudit` has no complete route/model attribution nor structured requested-sidecar flags (`src/extraction/types.ts:123`).
  Empty output is legitimate (knowledge, arcs, promises may have nothing; `SCENE_NONE` is a valid scene answer,
  `src/memory/contract.ts:85`). Author Model calls panel `src/components/drawer/ModelCallsPanel.tsx`.

## Recommendation

- **S1 Secret grid.** Pure read-model `secretGrid(epistemic, heldSecrets, roster, present, enabled)`: rows = held
  secrets, columns = cast; cells knows (source message), suspects, believes-false, unaware, hiding-from, disclosed (rumor
  `leaks_to`). Row flag "kept-out member on stage" when a member it is kept from is present and enabled. Rendered on Author
  → Memory with an inspector link. Computed on the snapshot only in Author view.
- **S2 On-stage info row.** An `info` check `secret-kept-out-on-stage` (author audience, feature `memory`), never
  `blocks`/`degrades`: enforcement already happens per member block. Detail links the grid row and the reply right after a
  flagged turn. Firing fixture per `checksRegistry.test.ts`.
- **S3 Read failures per model (redesigned).** First add the telemetry: `SharedReadAudit` records route + served model and
  which sidecar sections the prompt requested. Then count, per route x model over the retained audits, three separate
  things: transport/parser failures, requested sections that came back structurally malformed, and requested sections
  that came back empty. Empty is shown as a rate, labelled "may be legitimate", never as a failure. Shown on the Model
  calls panel and in `so-run-header` (`extraction.readHealth`). **No automatic prompt reminder.**
- **Parked: learned-at story time on knowledge rows** (scene-archivist P3): needs the same retained historical-time design
  as 35's parked "last seen"; boundary logs keep 200 entries.

## Invariants touched

- Held secrets: author-only; `so-ui.mts assert-player-clean` stays at 0 findings; player surfaces identical with and
  without a held secret.
- One check registry: S2 is a registry entry with consequence + copy + fixture; no toast.
- One snapshot: grid rides the snapshot behind `authorView`.
- No prompt change (S3 forbids one): no rating. S3's audit fields are metadata, never prompt or reply text
  (`ModelCallRecord` rule).

## Floors (predeclared, informational)

- D: grid matches `heldSecrets` + per-member block filter on 30 fixture states (0 mismatches); on-stage flag 20/20 on
  planted cases, 0 on 20 negatives; player-clean 0 findings.
- S3: on recorded audits with planted parse failures and malformed sections, counts exact (0 misclassified as empty);
  route/model attribution present on 100 % of new audits.

## Tests and gates

- jest: `secretGrid` pure cases (disclosure, retirement, rollback-dropped row), check fixture, audit attribution, S3
  classification over planted audits.
- Storybook: grid with a planted kept-out member on stage.
- `npm run gates`; live gate no-model lane with seeded epistemic rows (`so-ui assert-player-clean`, author screenshot).

## GPU / rating

- None.

## Unresolved questions

- Raise audit retention from 20 for S3 (cost: chat blob size, v2.8 69 K14 budget)? Default keep 20, report the window.
