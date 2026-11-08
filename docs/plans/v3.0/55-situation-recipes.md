# v3.0 55 — Situation recipes (quest pattern library)

Status 2026-11-08: PLANNED (docs + wizard knowledge). Called "recipes", because `patterns` is already the sequence-rule
feature (`engine/patternSchema.ts`). Written once 48's keys are fixed; 49's fields are added when 49 lands.

## Why

Owner 2026-11-08: "is there any kind of 'library of quest' or some kind of resource, maybe from another field like for
dungeon master or gaming … that we could use here?" Answer: yes, as concepts. Our own text is bundled; third-party text
only where its licence allows and with attribution (§Licences).

## What exists

- The wizard recipe `quest-line` (`copilot/agent/recipes.ts:34-52`).
- Wizard knowledge topics (`src/copilot/knowledge/topics.ts`, clipped to 1,500 chars per topic) and the guide twin
  (`src/copilot/guideTopics*.ts`).
- Fixture stories in `test/fixtures/` (public, invented).

## Design

Six original recipes, each written in our own words with invented example content (no campaign content):
competing claimants; investigation with a contested truth; rescue with a cost; negotiation; a promise under pressure;
an expiring opportunity (wording depends on owner question 48-1).

- Each recipe has:
  - stakeholder slots (role words, resolved to roster or faction at authoring time);
  - the pressure that worsens if ignored (49);
  - 2-4 resolution shapes (48) with what each costs;
  - consequence hooks: which existing feature carries the aftermath (echo, faction move, rumor, agenda end, codex
    disclosure);
  - one example of the evidence that should close each resolution, written as gate leaves on invented qualities.
- Homes:
  - Guide: a new page `docs/guide/author/` section "Situation recipes" (story-guide.md topic `situation-recipes`),
    via `npm run docs:guide`.
  - Wizard knowledge: `src/copilot/knowledge/recipes.ts`, one topic per recipe, each ≤ 1,500 chars, covered by
    `knowledge.test.ts`.
  - Wizard recipe: `quest-line` names the six as starting points and asks which fits. Guidance, not a quota.
  - Fixtures: one `test/fixtures/<recipe>.story.json` per recipe that validates. A jest test walks each resolution
    with `simulateQuest` (48).

## Licences (checked 2026-11-08 on the publishers' pages)

Game mechanics and ideas (clocks, fronts, oracle procedures, "prep situations, not plots") are not copyrightable. We
re-implement ideas in our own words. The verdicts below cover copying their text.

- Ironsworn / Delve / Starforged (Shawn Tomkin, tomkinpress.com/pages/licensing):
  - Covered: CC BY 4.0 for the Ironsworn SRD, asset and oracle table text, Delve moves and oracles, and the Starforged
    Reference Guide. Text only.
  - Excluded: art, icons and trade dress; implying an official product; full rulebook text (CC BY-NC-SA 4.0).
  - **Bundle-able** with: "This work is based on Ironsworn, created by Shawn Tomkin, licensed for our use under the
    Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/)."
- Blades in the Dark SRD (bladesinthedark.com/node/33):
  - Covered: CC BY 3.0, progress clocks included.
  - Excluded: the setting, art, logo, the name in a product title, and endorsement.
  - **Bundle-able** with the attribution block from that page, copied verbatim at bundling time. It begins "This work
    is based on Blades in the Dark (found at http://www.bladesinthedark.com/), product of One Seven Design,".
- Dungeon World (Sage LaTorra, Adam Koebel; github.com/Sagelt/Dungeon-World LICENSE):
  - Covered: CC BY 3.0, fronts included.
  - Exception: the repo also carries SRD 5.1 material (CC BY 4.0, Wizards of the Coast), so that notice goes along if
    any of it is used.
  - **Bundle-able** with: "Based on Dungeon World by Sage LaTorra and Adam Koebel (Sage Kobold Productions), licensed
    under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/)."
- The Alexandrian, "Don't Prep Plots" (thealexandrian.net): all rights reserved. **Concepts only**; link, don't quote.
- Tome of Adventure Design (Matt Finch): commercial, no open licence found. **Concepts only**.
- Recommendation: bundle none of them. Write all six recipes as original text, and list the sources as further
  reading in the guide (links plus one-line descriptions). If oracle tables are ever wanted, Ironsworn's are the
  cleanest; add a `THIRD_PARTY_NOTICES.md` with the line above first.

## Switch and floors

- No runtime switch: docs and wizard knowledge. The wizard's use of recipes rides the existing `copilot` switches.
- D floors (hard):
  - all six fixtures validate;
  - every resolution reachable by `simulateQuest`;
  - every knowledge topic ≤ 1,500 chars;
  - guide drift test green.
- CL (owner-gated): the wizard on Sol builds a three-resolution quest from each recipe prompt that validates with no
  author edit in ≥ 4/6.

## Order, size, resources

Size S-M. CPU and authoring model only. After 48's schema is fixed; updated after 49.

## Unresolved questions

- Bundle any third-party table at all, or keep links only (recommended)?
- Should recipes also be insertable from the Studio (a "start from recipe" button), or only through the wizard?
