# AGENTS.md

Entry point for any coding agent (Codex, Claude Code, others). The project's rules live under `.claude/`
and apply to every agent, not only Claude. Read them before working:

1. `.claude/CLAUDE.md` — what the extension is, sources of truth, status table, validation gates.
2. `.claude/rules/architecture.md` — layout and invariants (a failing `architecture.test.ts` is a failing build).
3. `.claude/rules/working-style.md` — terse commits/docs, no code comments, gate record per plan.
4. `.claude/rules/gotchas.md` and `.claude/rules/debug-scripts.md` — read before any live/browser work.
5. `.claude/skills/debug/SKILL.md` — the live harness (`scripts/debug/*.mts`); `.claude/skills/st-*` for ST know-how.

Current work: v2.5 (`docs/plans/v2.5/00-overview.md`, user decisions in `decisions-sheet.md`). v2.5 is
playtest-ready on master, NOT accepted: plan 10's ×2 matrix, the mutant window, plan 13 Phase A and the
spike `.b` builds are deferred. Adolion adaptation plan: `C:\dev\adolion-campaign\ADAPT-v2.5.md`.

## Standing rules

- Commit on master is fine; **never push**. Stage explicit paths, never `git add -A`. Never commit
  `.claude/settings.local.json` or `docs/story-orchestrator-explained.html`.
- Never claim a gate green without the command output. Predeclared floors and the bundle budget
  (1,250,000 B) are never retuned. Judge uses (`judge.uses.*`) stay off by default; only the user flips them.
- Never print, copy or move secrets (ST `secrets.json`, API keys, CLI login files).
- Nothing is deleted from the user's ST data; moves go to `C:\dev\backups\story-orchestrator\`.
- ST stays pinned at `7c3994196`: do not run the launcher's `git pull`.
- `src/**` is CRLF; keep line endings when editing.

## Runbook: playtest on the RunPod pod

Topology: ST (`C:\dev\SillyTavern-MainBranch`, http://127.0.0.1:8000) → Connection Manager profiles at
`http://127.0.0.1:18080` → SSH local-forward → pod `llama-server` on `127.0.0.1:8080` (Artemis 31B).
Details: `C:\dev\comfy-pod\README.md`.

**1. Pod.** Current pod `uox0xlk94xipdu` (`llm-pod-4500-i`, RTX PRO 4500, EU-RO-1, $0.72/hr, network volume
`x9gi6f1rig`). Start/stop it in the RunPod console. `runpodctl` is installed but its API key is stale
(401); only the user can refresh it (`runpodctl doctor`) — never ask for or handle the key.
- The SSH port changes on every start (IP usually stable): console → Connect → Direct TCP ports.
- If start fails with "not enough free GPUs", the host is full: create a new pod on the same volume in
  EU-RO-1 (same GPU type and env as the old one), then terminate the old one. The model loads in ~3–10 min.
- The pod self-stops after `IDLE_MINUTES` (30) idle. Silence in chat → check the pod first.

**2. Tunnel.** Either `C:\dev\comfy-pod\local\start-local.ps1` (after putting the port in `local/.env`), or:
```
ssh -i ~/.ssh/id_ed25519_runpod -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -N -L 18080:127.0.0.1:8080 -p <PORT> root@<IP>
```
Check: `curl -s http://127.0.0.1:18080/health` → `{"status":"ok"}`.

**3. ST.** Start with `node server.js` from `C:\dev\SillyTavern-MainBranch` (or the user's launcher, minus
its git pull). The judge plugin (`plugins/story-orchestrator-judge`) must log "Initializing plugin".
After changing the extension: `npm run build && npm run stage` and `node scripts/debug/st-session.mts reload`.
If `#send_but` stays hidden after the tunnel comes back, re-select the profile: `/profile Artemis RunPod RP`.

**4. One build.** There is one build (`npm run build`, owner decision 2026-10-07): playtests and the debug
harness run the same bundle, debug handles included.

**5. Assisting the playtest.** Start a FRESH chat per story (chats from before v2.5 plan 11 open read-only and
only Restart replaces them). The player flags moments with ⚑ in the drawer. Without the CDP browser from
`st-session.mts start` the debug scripts cannot read the page (`so-journal`/`so-state`), so read the chat file instead: `C:\dev\SillyTavern-MainBranch\data\default-user\chats\`
(solo) or `group chats\` — line 1's `chat_metadata.story_orchestrator` holds the engine state, the rings and
the journal (`extras.journal`, flags included). Read-only: never edit a chat file ST has open. Triage each
flag against the gotchas before calling it a product defect. Record findings in `docs/plans/v2.5/` as a
playtest record.

**6. Stop.** Stop the pod when the user is done ($0.72/hr). Only stop or delete pods you created or the
user named.

## Gates

`npm run typecheck && npm run typecheck:test && npm run lint && npm test && npm run test:debug`, then
`npm run build && npm run test:release` for build/release changes. Live gates use the `debug` skill; see
`.claude/CLAUDE.md` §Validation.
