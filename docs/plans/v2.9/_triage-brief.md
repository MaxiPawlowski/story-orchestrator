# v2.9 triage brief (for gpt-6.1-sol, read-only)

You are triaging work for Story Orchestrator (SO) v2.9, a SillyTavern extension. Working tree: this checkout (branch
`v2.9-triage-plans`, docs only). You may read anything in the repo; do not edit files (read-only sandbox). Your final answer is a
markdown document that will be saved as `docs/plans/v2.9/01-triage-sol.md`.

## Read first
- `AGENTS.md`, `.claude/CLAUDE.md`, `.claude/rules/architecture.md` (invariants), `.claude/rules/working-style.md`.
- Owner rules: private plugin, one user; every built feature on by default; thinking and inner voice stay on (raise anything that
  would switch them off); English only; repo is PUBLIC (no Adolion campaign content: never open `C:/dev/adolion-campaign`).
- Current work and what is already planned: `docs/plans/v2.8/00-overview.md` (plan index 01–78), `docs/plans/v2.8/32-queue.md`,
  `docs/plans/v2.8/61-harvest-triage-2026-10-14.md` (every earlier harvest idea with a verdict), `docs/plans/v3.0/00-overview.md`
  (deferred; renamed from v2.9 today).
- Feature inventory: `src/features/registry.ts` and `src/features/*Features.ts` (about 120 features with status), and the player
  guide `docs/authoring/story-guide.md` as needed.

## Inputs to triage
1. `docs/plans/v2.8/extension-research-2026-10-21/SUMMARY.md` and its per-repo reports (same dir), especially
   `per-character-polish.md` (the owner's lead idea: Recast-style reply polish configured per roster member) and `niches.md`
   (ideas from outside the ST ecosystem: storylets, Façade, Versu, Felt/Winnow story sifting, Disco Elysium, CK3, Wildermyth,
   Citizen Sleeper, NovelAI, ...).
2. **Your own audit of current features**: weak points, half-built or below-floor features, player-experience gaps, confusing
   surfaces, features that exist but the player never feels. Use the registry `status` field, gate records and plan docs; check
   `src/` before claiming anything. This is as important as input 1: the owner asked for "improvements or weak points of our
   current features, or new ones completely".

## What to produce
1. **Verdict per idea** (list, not a `| ID |` table: plan docs with `| ID |` tables collide with `test:release`): id, one-line
   idea, source, verdict `PLAN` (gets a v2.9 plan) | `FOLD <plan>` (into an existing v2.8/v2.9 plan) | `SKIP` (why) | `V3.0`
   (defer), our current state with `file:line`, value to the PLAYER 1-5, effort S/M/L, invariant risks.
2. **Feature audit findings**: each with evidence (`file:line` or plan/gate record), severity for the player, and a verdict
   as above.
3. **Proposed v2.9 plan set**: 8–15 plans, each with number (01 is this triage, start at 02), slug, pitch, scope in/out,
   dependencies on v2.8 plans, measurement and its floor (informational, never retuned), owner decisions it needs. Group
   by theme; give a build order. Per-character polish must be one of them; decide whether its cheap prevention layer
   (voice line in the private block) is a separate earlier plan.
4. **Challenge the harvest**: where the reviewers or the summary are wrong, over-valued or already built, say so with evidence.
5. **Unresolved questions** for the owner.

Be concrete and terse; grammar optional; cite evidence. Prefer fewer, sharper plans over many thin ones.
