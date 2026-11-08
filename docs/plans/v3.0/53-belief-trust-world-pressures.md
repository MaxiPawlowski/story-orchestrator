# v3.0 53 — Belief, trust and faction pressures (research stub)

Status 2026-11-08: RESEARCH STUB, not scheduled. Astra ideas 4 and 5. 49 already took authored pressures. What is
left here needs read-contract changes and floors that the witness record failed to reach (v2.8 42 W4 FAIL, v3.0 12).

## Why

Owner 2026-11-08 asked which other parts "could need improvements like these". Astra: one event can be believed
differently by different characters without becoming world truth. And a faction should want things, not only like or
dislike the player.

## What exists

- Epistemic tags `knows|unaware|suspects|believes|hiding|intends` (`memory/types.ts:111`), capped per subject,
  common-knowledge drop (gotchas §Epistemic hygiene).
- Provenance = which pipeline wrote a row (`memory/provenance.ts:6-34`), not an in-fiction informant.
- Audience contract: `told` and `believed` relations with explicit unknowns (`memory/audience.ts`,
  `memory/audienceRules.ts`). Witness record built but unconsumed.
- Rumors: hearsay rows reach the receiver's private block, `leaks_to` disclosures (`memory/rumors/`).
- Faction standing + moves (`engine/factionSchema.ts`). No objective, means or opposition.

## Candidate directions (not designed)

- B1 Informant on a belief: `EpistemicEntry.from?: <member>` set only from a resolved `told` span (audience contract).
  Unknown otherwise; never guessed. Needs the read to name the teller, which is a read-contract change, so live suite x2
  (43 phase 3 rule).
- B2 Trust per member pair as a life relationship axis (`trust`), already expressible today. Test whether authors need
  more than an axis before building anything.
- B3 Supporting or contradicting evidence: link belief rows to memory rows via `inputs`. Show it author-only first.
- F1 Faction objective: `factions[].wants` (author copy) + `means[]` (authored moves the faction can make, each a 49
  pressure threshold effect). Builds entirely on 49; a faction "losing its supplier" is a pressure crossing.
- F2 Consequences visible through prices and access: gates on `rep_*` already do this. Guide material, not code.

## Floors to decide before any build

- B1: informant precision ≥ 0.9 on a labelled told-span fixture, given W4's 0.088-0.660 history. Expect a FAIL;
  measure offline first.
- F1: none until 49 ships and one story uses pressures.

## Unresolved questions

- Is any of this wanted before the owner's playtest shows characters believing the wrong things?
- F1 here or in 49 (one more field on a pressure owner)?
