# Branch triage 2026-10-29

Read-only triage of `git branch --no-merged master` (26 branches) on master `a66a3596`. Nothing deleted or merged.
Method: `git log master..<b>`, `git diff --stat master...<b>`, `git cherry master <b>` (patch-id), subject search on master,
plan-doc grep.

Remote: `origin` holds only `master`. Every other branch is local-only (unpushed); master = origin/master (0 ahead).

## Excluded (active work, not triaged)

- `v3.0-27-fork-wrapup` (`C:\dev\so-wrapup`): 12 ahead, unpushed; plan 27.
- `v3.0-28-cache-spill` (`C:\dev\so-spill`): 9 ahead, unpushed, uncommitted plan 28 doc in worktree.
- `v3.0-a2-maxmem` (`C:\dev\so-a2`): 8 ahead, unpushed; plan 10.
- `v3.0-c4a-requeue` (`C:\dev\so-c4a`): 3 ahead, unpushed; plan 26 C4a (Part B lag miss, not merged).
- `v3.0-12-witness-redesign` (`C:\dev\so-witness`): currently merged into master (no unmerged commits).
- `v3.0-harness-eb` (`C:\dev\so-harness-eb`): currently at master (no unmerged commits).

## Merged-equivalent (work on master another way)

- `v2.8-local-judge`: 1 commit, patch-id equal on master (`86005cb6`).
- `v2.8-build-harness-auth`: 1 commit, same change landed as `016a39a3` (plugin 2.0.0, `opencodeTransport.mjs` on master).
- `v3.0-07-engine-eval`: 3 commits; 2 patch-id equal, the third (spike results, gate record) landed as `c2920ce0`.
- `v3.0-llama-r4`: plan 26 test branch; records landed through `v3.0-llama-r4-merge` (`570ea308`); its C4a code commits are the
  excluded `v3.0-c4a-requeue`.
- `v3.0-oneq-blind`: 3 record commits (plan 19 offline one-question experiment); summary landed in plan 19 §Gate record,
  keep-last question post-pass (via `v3.0-oneq-keeplast`). Raw round records only on the branch.
- `keep/checkwhen-merge`: a single merge commit whose parents are both on master; no unique patches.
- `rescue/v26-authoring-guide-wip-0807`: stash snapshot (2026-10-02); guide files (`guideTopics.ts`, `GuideDisclosure.tsx`,
  `guideTabs.ts`, story guide) all on master via `v26-authoring-guide`.
- `rescue/v26-reasoning-effort-wip-0807`: stash snapshot (2026-10-02); removal of the reasoning-effect spike and
  `utils/reasoningEffort.ts` already on master.
- `worktree-agent-a298943ce01b12755`, `worktree-agent-a92852224560f7e09`, `worktree-agent-abd325fe404b433b6`: 1 commit each,
  patch-id equal on master (v2.4 plans 01/02).
- `worktree-agent-a9b3cec5b9a5daebd` (`4ecafef1`), `worktree-agent-ab8c010db7c98368d` (`cfad851e`),
  `worktree-agent-acbf756e7c8accf55` (`bc6c2f33`), `worktree-agent-acdcbe182489c4310` (`2ebb4a6e`): 1 commit each, same
  subject landed on master with a different patch (v2.4 plans 01/02 rebuilt on master).

## Still pending (unmerged records)

- `gpu-night-2026-10-23`: 2 docs-only commits, not on master: v2.8 70 lean-night gate record 2026-10-24 (superseded by the
  2026-10-25 gate record on G `d6d6aed5`) and v2.9 06 LT freeze record 2026-10-23 (corpus hashes before first inference).
  Blocker: none; owner decides whether the freeze record lands (it is the predeclaration evidence for 06 LT).

## Abandoned

- `feature/dynamic-story-generation` (2026-02-17, 2 commits, 13 files): pre-v2 live-loop generator on the deleted
  `StoryContext`/session-store code; superseded by `src/generation/` expansion and the living director.
- `v26-t2-probe-overlay` (1 commit): alternative pin-probe fix (accept stop-string-emptied reply); master took
  `adc8eeaa` (raw retry, `fallback: no-instruct`) instead.
- `v2.9-03-polish-s3`, `v2.9-03-s3-merge` (3 and 5 commits, 45 files): v2.9 03 S3 automatic reply polish. Parked: v3.0
  owner decision 10 "polish stays off; drop S3 for now" (`00-overview.md`), P0 thought-carry gate never cleared. Keep ref
  if S3 returns.
- `v3.0-campaign-talk-s2` (4 commits): plan 19 campaign talk stage 2 adoption, campaign pin bumps and live gate; blind
  pacing redo F1/F2 fail, not adopted; pin since moved on (`adolion-fresh.pin.json` now `c5723c53`). The live-gate and redo
  records exist only on this branch (plan 19 cites `837ee7c1` as not merged).
- `v3.0-facts-candidate-a` (1 commit): plan 25 candidate A, measured and NOT adopted (plan 25 §Status 2026-10-28); Q2
  stays open there.

## Unknown

- none

## Owner decisions

- Land the v2.9 06 LT freeze record from `gpu-night-2026-10-23`?
- Land the plan 19 campaign talk-s2 live-gate / redo records from `v3.0-campaign-talk-s2`, or leave them branch-only?
- 471 local branches are fully merged into master (incl. 218 `worktree-agent-*` and 10 `worktree-wf_*`); pruning
  them is safe but was not asked.

## Worktree cleanup 2026-10-29

- Removed 44 clean worktrees (all on branches merged into master except `v3.0-campaign-talk-s2`, `v3.0-07-engine-eval`,
  `v3.0-oneq-blind`, whose refs stay): junctioned `node_modules` removed with `rmdir` first, then plain
  `git worktree remove` (no `--force` needed), then `git worktree prune`. All branch refs kept.
- Removed 8 stale non-registered folders holding only a `node_modules` junction or nothing: `so-bootflake`, `so-img-fix`,
  `so-pf-44`, `so-pf-47`, `so-pf-48`, `so-play-polish-base`, `so-s3-sbcheck`, `so-prefreeze-scratch`.
- C: free 120 GB -> 148 GB.
- Kept: `so-adopt-ref` (detached, merge in progress: 4 unmerged paths, 120 staged), `so-build-now` (`opencode.json`
  modified, +17 lines), `so-talkfix` (11 modified `docs/guide/` files), plus the excluded active worktrees.
- Not worktrees, left alone: lane roots, `so-sessions*`, `so-poc-showcase` (1.7 GB, tray item), `so-s0` (empty dirs),
  `so-s0-p41` (1.7 GB), `so-s0-p41-pod` (1.6 GB), `so-showcase-art` (63 MB), `so-lanes$n` (stray lane-root name, only
  `debug/`), and the loose `so-*.log/.md/.sh/.csv` files in `C:\dev`.
