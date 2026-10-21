# Extension pattern harvest 2026-10-21 — reviewer brief

Same rules, output shape and constraints as `docs/plans/v2.8/extension-research-2026-10-14/_brief.md`: read it first and follow it.
Differences for this round:

- Output goes to `docs/plans/v2.8/extension-research-2026-10-21/<slug>.md`.
- Updated repos: the old head is branch `pre-refresh-2026-10-21`. Prior reviews: `docs/plans/v2.8/extension-research-2026-10-14/<slug>.md`
  and/or `docs/plans/v2.4/extension-research/<slug>.md`.
- Already triaged: `docs/plans/v2.8/61-harvest-triage-2026-10-14.md` lists every idea from both earlier harvests with a verdict
  (NEW/FOLD/BUNDLE/SKIP). Do not re-propose an idea it covers unless the new code changes the verdict; say which row.
- Plans 60–78 exist since the last round (`ls docs/plans/v2.8`); check them before calling something absent.

## Lens for this round: player-experience additions

The owner asked what would be a **nice addition to the player experience**. Weight ideas by what the player feels at the table
(prose quality, character distinctness, sense of a living world, readable state, fewer chores), not internal hygiene.

One idea is already on the owner's mind: **per-character reply polish** in the spirit of Recast (post-processing passes that
rewrite a reply: voice validator, prose rhythm, repetition hammer, grounding), but configured **per roster member** (each
character's own voice notes, lexicon, rhythm, what to avoid). If your repo does anything relevant to post-processing, voice,
per-character style, dialogue distinctness or prose quality, cover it in a section `## For per-character polish` (mechanism,
safety against adding facts or player actions, cost, how it handles swipes/edits/streaming, what per-character config it keeps).
