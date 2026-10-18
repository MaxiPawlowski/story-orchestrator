# 78 — UI audit follow-up and progress

Owner-approved 2026-10-18; resumed from Claude Code's quota-stopped `v2.8-ui-audit-followup` worktree.
Builds on the workspace launchers (75), widget navigation fixes (76) and new-chat opening/background fix (77).

## Approved scope

- Author inline inspection opens Author and selects the message; story setup opens Connections.
- Dialog actions answer inline: flag, library deletion and memory exclusion with Undo.
- In-chat launchers close the workspace or Studio before jumping or switching chats.
- Remove duplicate overview controls and unreachable legacy settings; illustrations accessible from Play.
- Correct feature Show-me targets, duplicate repair id and obsolete drawer wording.
- Phone panels stop above the input and show the most recently opened panel only.
- Story bar opens an in-chat card: scene, journal, suggestions, memory peek and More.
- Help/Ask and the guide remain floating beside the chat.
- Shared transient busy jobs: cast setup counts, illustration/character placeholders, guarded action buttons,
  elapsed feedback on model calls after ten seconds. Jobs are chat-scoped and never persisted.
- Batch cast flags into one host group save and read-back, keeping one write-ahead ledger row per member.
  Rollback still uses the existing compare-and-set restore plan and batched restore.

## Campaign adoption

Runtime/UI improvements apply automatically to existing stories. No authored campaign change or pin bump needed.

## Gate record

- 2026-10-18: `npm run docs:guide && npm run docs:settings` passed.
- `npm run gates:quick` passed after the ownership/error-copy inventory updates and HUD fixture correction.
- Test-copy browser checks at 1400×900 and 390×844 passed: story card, Escape focus, More → Play,
  memory Exclude/Undo, setup → Connections, inline inspector → Author, Studio replay jump closes Studio,
  floating desktop panels and one-at-a-time phone panels above the input.
- Cast measurement on a copied group: 125 members, 119 flags changed. Before: 119 group saves, 66,621 ms.
  After: 1 group save, 4,583 ms. Original group flags restored after each measurement.
- Real `openai/gpt-6.1-sol` Ask through the test server's OpenCode bridge answered; busy job visible during
  the call, elapsed chip observed at 10–13 seconds, no jobs remaining afterwards.
- Full-gate attempts caught stale census rows and a HUD Storybook fixture that placed the outside-click
  target inside the HUD root. Corrected both. An initial PosesList contrast failure did not reproduce in
  the second complete Storybook run or a focused axe check; no acceptance exclusion added.
- `SO_LANES_ROOT=C:/dev/so-live-lanes node scripts/debug/st-lanes.mts batch --lanes 52 --repeat 2 --strict
  --group "Group: Arin, DM Narrator" test/scenarios/v27-d-06-presence.json`: GREEN 2/2, zero incomplete
  evidence rows (90 s, 59 s). Includes Help position across reload. The offline backend health probes
  returned 500 and absent media/GPU plugin probes 404; recorded by page capture, no scenario failure.
- Additional Help position/reload pair on lane 31 passed. Panel settings restored afterwards.
- `npm run gates -- --jobs=3`: all 11 steps green in 299.5 s, including 844 Jest suites (9,782 tests),
  156 Storybook suites (942 tests), debug/plugin/release checks, all type checks, lint and 32/32 defect replay.
- Evidence archived privately as `ui-audit-followup-2026-10-18` (106 files, 10,789,063 bytes), then
  `npm run sessions:archive` passed from the main checkout.
- Final-tree confirmation follows the busy-spinner styling and this gate record; merge/install pending.
