# v3.0 16 — Twine / Twee 3 interop (SPIKE)

**Status: SPIKE, not built (owner 2026-10-26). Triage with Astra pending; build decision after triage.**

## Idea

Twine (twinery.org) authors branching fiction as passages + links + variables, saved as Twee 3 text. Possible uses here:

1. Twee 3 import: a Twine skeleton (passages -> checkpoints, links -> transitions, SugarCube/Harlowe variables -> qualities)
   becomes a Studio draft; the wizard and Studio add what Twine lacks (roster, gates, lore, agency, effects).
2. Twee 3 export: view any story's graph in Twine's map (a second visualizer, shareable structure).
3. Wizard drafts the skeleton in Twee (compact, well-known text format), a converter validates and fills the rest.

## Mismatch

- Twine advances on player link clicks; stories here advance on typed gates over state. A link maps to a transition whose
  gate must still be authored (or a default "player chose X" gate needs a design).
- No characters, lore or model in Twine; those always come from our side.
- Twine's runtime is not used for play.

## Spike scope (if triage says yes)

- Deterministic converter both ways (pure module, lazy chunk, no host access), round-trip tests on public Twee samples
  (no campaign content), guide topic. GPU 0.

## Unresolved questions

- Which story format(s) to support (SugarCube 2 / Harlowe 3 / format-agnostic Twee only)?
- How should a link's condition map to a typed gate?
- Is export alone (visualizer) worth it without import?
