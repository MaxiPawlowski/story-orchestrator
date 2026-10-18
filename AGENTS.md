# AGENTS.md

Entry point for any coding agent (Codex, Claude Code, others). Claude Code loads it through `.claude/CLAUDE.md`
(`@../AGENTS.md`), so the rules below are shared; Claude-specific detail stays in `.claude/`.

Read before working:
1. `.claude/CLAUDE.md`: what the extension is, sources of truth, status table, validation gates, UI entry points.
2. `.claude/rules/architecture.md`: layout and invariants. A failing `architecture.test.ts` is a failing build.
3. `.claude/rules/working-style.md`: terse commits and docs, no code comments, a gate record per plan.
4. `.claude/rules/gotchas.md` and `.claude/rules/debug-scripts.md`: before any live or browser work.
5. `.claude/skills/debug/SKILL.md`: the live harness (`scripts/debug/*.mts`). `.claude/skills/st-*`: SillyTavern know-how.

Current work: **v2.8**. The ordered list of open fixes, features and measurements is `docs/plans/v2.8/32-queue.md`;
step-by-step tasks for a codex run are in `docs/plans/v2.8/37-codex-handoff.md`. v2.7 is wrapped (symbolic).

## Owner and product

- **A private plugin with one user, the owner.** Versions are symbolic and nothing is released. There is no
  backward compatibility and no migrations, and there is one build (no prod/dev split). Stories carry no version.
- **Every built feature is on by default**, judge uses included, below its floor or unmeasured too. Only the owner
  switches one off. A floor is informational: record the miss, never retune it after the run.
- **The owner wants thinking and the inner voice on.** Raise any fix that would switch them off before making it.
- **English only**: no test material, sessions or floors in other languages.
- **Docs and the campaign move with the code.** A finished feature updates the user guide (`docs/authoring/story-guide.md`,
  then `npm run docs:guide`, `npm run docs:settings`). Decide whether the Adolion campaign should use it; if it should,
  change the campaign repo, bump `scripts/debug/adolion-fresh.pin.json` and reinstall (commit `d203f58c` shows a bump).

## Privacy and the two repos

- **This repo is PUBLIC.** No Adolion campaign content goes in it.
- Session and pod evidence go to the private `so-sessions` repo: `npm run sessions:archive`, and
  `node scripts/debug/so-evidence.mts archive --label <x>` for lanes and pods.
- **The campaign** lives in `C:\dev\adolion-campaign` (private; `scripts/check_all.sh`, `scripts/install_st.py`).
- **The owner has never read the campaign and plays it fresh.** Reports, commit messages here, and anything shown to
  the owner name no character, place, quest or plot; use counts only. Route campaign content review to another model,
  not the owner.
- Never print, copy or move secrets: ST `secrets.json`, API keys, CLI login files, `~/.typesafe/api-key/.env`. The owner
  types keys into the ST UI.

## Models and cost

- **Play replies:** Artemis 31B v1.1 (Gemma 4), Text Completion, thinking on; preset `Artemis v1.1 RP`.
  - Locally it runs on the 3090 through the local controller, at 32,768 context at most.
  - On a pod it runs on the RTX PRO 4500.
- **Authoring, the wizard, Ask, rating:** opencode `openai/gpt-6.1-sol`, the owner's subscription and the default. Never use
  a `-fast` variant, Terra or Astra. DeepSeek is pay-per-token past its quota and is the fallback only. Never use Artemis
  for the wizard.
- **Judge:** TypeSafe (Jev) through `plugins/story-orchestrator-judge`, key in ST secrets. The local judge (decider-4b) is
  calibrated for memory-pairs only and is not routed by default.
- **RunPod:**
  - The owner pays and tops up. Create a pod only when the task says so.
  - Secure Cloud, EU-RO-1, RTX PRO 4500, $0.72/h, network volume `x9gi6f1rig`, SSH tunnels only.
  - Stop or delete only pods you created; terminate them and verify.

## The owner's machine

- **ST** is `C:\dev\SillyTavern-MainBranch`, served at http://127.0.0.1:8000.
  - Its data, lane 0 and the 3090 belong to the owner.
  - Never stage into ST, run scenarios against it, or use the GPU while the owner plays.
  - Live checks run on lanes (`node scripts/debug/st-lanes.mts`, lanes 30+), which are copies.
  - Do not update ST (no `git pull`, no launcher pull).
- **The repo** is `C:\dev\story-orchestrator`, outside ST. ST's extension slot holds a staged copy:
  `npm run build && npm run stage`, then `npm run plugins:install` (restart ST when it reports `restartNeeded`).
  - Restart: kill the process on port 8000, then `node scripts/local/cli.mjs start-st`.
- **Local model and ComfyUI** go through the controller: `node scripts/local/cli.mjs start|stop|unload|start-comfy`
  (`scripts/local/README.md`). Its config is `C:\dev\tools\story-orchestrator-local\config.json`.
  - Dynamically loaded models live on the fast disk, `C:\dev\models`.
  - Downloads need the owner's OK and the space check.
- **Every server** has an entry in the tray (`C:\dev\tray\items\story-orchestrator.json`; read `C:\dev\tray\README.md` first).
- **Disk:** C: has run out before. Check `df -h /c` before large work, and never delete a junctioned `node_modules` in a
  worktree.
- **Nothing is deleted from the owner's ST data**; a move goes to `C:\dev\backups\story-orchestrator\`.

## Working rules

- **Parallel work** happens in a worktree per task: `git worktree add -b <branch> ../so-<name> master`, then `npm run worktree:setup`
  (junctions `node_modules`, copies `.st-root` and the gitignored campaign story index the harness tests read).
- **Merge to master** only with the full `npm run gates` green, Storybook included (`-- --no-storybook` only when the
  record says so). Then push, stage and install. Never force-push.
- **Commits:**
  - stage explicit paths;
  - never commit `.claude/settings.local.json` or `docs/story-orchestrator-explained.html`;
  - `src/**` is CRLF: keep line endings, and for multi-line edits write a script file, never a shell heredoc.
- **Never claim a gate green without its command output.** A real-model, browser-level check is the default gate for
  model-consuming paths; mocks alone never sign one off.
- **Main bundle budget:** 1,300,000 B (`webpack.config.js`). Put new code in lazy chunks; never raise the budget silently.
- **Plan 39 records** (and any `| ID |` table in plan docs) collide with `test:release`'s phase C row parity check.
  Write run records as lists.

## Gates

- Per change: `npm run gates:quick`. Run it until green before the first full run; a full run is minutes, the quick one
  is seconds.
- Per plan, merge or release: `npm run gates` (`npm run gates -- --help`), once.
- After a flaky or environment failure (no code change): `npm run gates -- --resume` reruns only the steps not green on
  this exact working tree. Any edit changes the tree hash, so every step runs again. A merge or plan close cites a run
  without `--resume`.
- Live gates use the `debug` skill; see `.claude/CLAUDE.md` §Validation.
