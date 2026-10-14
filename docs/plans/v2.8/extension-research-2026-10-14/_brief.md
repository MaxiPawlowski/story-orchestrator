# Extension pattern harvest 2026-10-14 — reviewer brief

Refresh of the 2026-09-20 corpus (`C:/dev/st-extensions-research`, outside this repo). Prior reviews (v2.4 input, SO v2.3 baseline):
`docs/plans/v2.4/extension-research/<slug>.md` + `SUMMARY.md`. SO has moved a lot since (now v2.8): read the current code, not
`_baseline.md`, before claiming "we don't have X".

## Your job

One repo. Harvest patterns Story Orchestrator could adopt. Read-only everywhere except your one output file.

- Clone: `C:/dev/st-extensions-research/<folder>/source` (+ `post.md` = condensed or verbatim forum post).
- **Updated repo**: the old head is branch `pre-refresh-2026-10-14`. Start from `git -C <source> log --oneline pre-refresh-2026-10-14..HEAD`
  and `git -C <source> diff pre-refresh-2026-10-14 HEAD`. Focus on what is new, then anything the prior review missed.
- **New repo**: full source review.
- **Second look** (unchanged repo): read the prior review first; hunt only for what it missed or what is newly relevant to v2.8 work.

## Know SO first (skim, don't read everything)

- `AGENTS.md`, `.claude/CLAUDE.md`, `.claude/rules/architecture.md` (invariants: engine purity, STAPI/stHost only host surface,
  stagecraft proposes never writes, RunOwnership, one check registry, secrets never through shared tiers, chance is seeded, …).
- `.claude/rules/gotchas.md` for host traps already known.
- `docs/plans/v2.8/32-queue.md` (open work) and the plan index in `docs/plans/v2.8/00-overview.md`; plans 42–59 are planned features.
- Grep `src/` to confirm our current state before every claim. Cite `file:line` on both sides.

## Output: `docs/plans/v2.8/extension-research-2026-10-14/<slug>.md`

```
# <name> — 2026-10-14 harvest
meta: repo url · commit range or head · licence · what you read / skipped · prior review link (if any)
## What it is / what changed            (≤10 lines)
## How it works                          (mechanisms worth knowing, file:line)
## Patterns for SO
### P1. <title>  — kind (pattern|feature|host-fact|anti-pattern|test-idea) · area · our state (absent|partial|present|planned: plan NN) · value 1-5 · effort S/M/L
What / their evidence (file:line) / our state (file:line) / fit + invariant conflicts / sketch
...
## Host facts (ST behaviour learned from this code, verify against C:/dev/SillyTavern-MainBranch where cheap)
## Not worth taking (one line each, why)
```

Rules:
- Terse; grammar optional. No code comments to write. No hype: if nothing is useful, say so in 5 lines and stop.
- Licence: AGPL/GPL/no-licence = ideas only, never code. Note the licence.
- An idea already built or already planned (plan 42–59, queue rows) = say so with the reference; only add what differs.
- Flag any idea that would switch thinking or the inner voice off, or break an invariant, as such.
- This repo is PUBLIC: no Adolion campaign content (don't open `C:/dev/adolion-campaign`).
- Never run the repo's code, `npm install`, or anything from inside the clone. Never touch SillyTavern, lanes, the GPU or the network
  beyond what you need to read (no network needed).
- Final message back to the coordinator: ≤150 words, top 3 patterns with value/effort, plus any host fact that looks like a bug in SO.
