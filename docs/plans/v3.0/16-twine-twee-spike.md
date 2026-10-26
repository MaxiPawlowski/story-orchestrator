# v3.0 16 — Twine / Twee 3 interop (SPIKE)

**Status: SPIKE-LATER (Astra triage 2026-10-26, verified): not built; reopen only for a concrete Twine workflow the owner wants; first slice = author-only graph export.**

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

## Triage 2026-10-26 (Astra, `research/astra-twine-triage.md`; checked in code)

- Verdict SPIKE-LATER: authoring convenience, does not advance the replan priorities (performance, quality, images).
- Verified: `newTransition` creates `gate: {all: []}`, which evaluates true, so an import mapping links to transitions would
  turn player choices into automatic progression; Studio already exports the graph as Mermaid (`StudioGraph` `toMermaid`);
  `studio/io.ts` JSON export is unredacted.
- Fit: Twee 3 specifies passages, tags and metadata only; variables, conditions and effects belong to story formats
  (Harlowe, SugarCube), a maintenance trap. A lossless structural round trip (ids, start, static adjacency, labels) is
  possible; behaviour is not.
- Wizard drafting Twee: dropped (adds translation and repair, omits the hard semantics).
- Smallest later slice: local author-only graph exporter (one passage per checkpoint, static links, start, deterministic
  positions, omission notice; no prose, macros, importer or wizard change). Floors: exact node/start/adjacency on synthetic
  fixtures incl. cycles and self-links; byte-stable output; 0 planted sensitive strings exported; 0 script execution; a pinned
  Twine import check; no converter in the main bundle. Est. 2-4 days, GPU 0.
- Privacy: a shareable export allowlists fields and drops hidden content, private guidance, lore and held secrets; even an
  anonymized graph is author-only (topology can spoil the campaign for the owner's fresh play).
