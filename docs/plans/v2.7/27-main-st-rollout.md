# Current plugin and Adolion rollout

2026-10-06. User authorized the recommended current-build rollout: all nine stories, regular expression sprites
where animation is unfinished. Campaign-wide animation and future v2.8 features are not rollout gates.

Precedents: `scripts/release/stage.mjs`, `scripts/plugin-install.mjs`, campaign `scripts/install_st.py`,
`scripts/debug/adolion-fresh.mts`, `scripts/debug/lib/settingsSave.mts`.

## Sequence

1. Audit deployment and campaign; back up changed main-install data outside ST, excluding secrets.
2. Full plugin gates, campaign offline validation and installer ownership regression.
3. Isolated campaign lane: inventory, story binding, real reply/read/boundary, reopen.
4. Install owned cards/books/sprites/backgrounds, bind groups, update library without replacing existing chats.
5. Production stage; verify main install and archive the spoiler-free rollout record.

## Gate record

**COMPLETE for the authorized current-build rollout, 2026-10-06.** Full image-track acceptance remains open in
plans 24/26; this installation uses the existing regular packs. No commit/push, pod use, model download or move.

Commands and results:

- `npm run gates`: all green. Jest 6402 passed / one skip; debug 1036 passed; release 94 passed / two skips;
  plugin 104 passed / three skips; defect replay 32/32; Storybook 520/520. Log archived beside the rollout evidence.
- Campaign `SO_PLUGIN=C:/dev/story-orchestrator sh scripts/check_all.sh --fast`: green; then
  `SKIP_BUILD=1 SO_PLUGIN=C:/dev/story-orchestrator sh scripts/check_all.sh`: ALL GREEN, harness 94/94.
- `python -m unittest discover -s tests -p test_install_ownership.py`: 5/5. Card updates now require the installed
  project's ledger; sprite uploads reject LFS pointers before any request and report HTTP failures with a nonzero exit.
- `npm run stage -- --flavor dev && npm run serve:dev`; `node scripts/debug/adolion-fresh.mts seed 6 --no-preset-overlay`:
  clean pinned campaign `40dd2d0`, 147 cards, 16 books, 9 groups/stories ready, 201 sprite folders / 2889 PNGs.
- `node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-adolion-rollout.mts smoke` twice consecutively:
  real local replies, dedicated real reads, committed boundaries, five regular actors and reopen state preserved.
- Main backup: `C:/dev/backups/story-orchestrator/main-rollout-2026-10-06`; settings, cards/sprites, lorebooks,
  groups, chats, backgrounds, installer ledger and extension slot; secrets excluded.
- Main campaign `python scripts/install_st.py && python scripts/install_st.py --update-cards`: owned assets updated.
  Initial `--sprites` printed LFS refusals but wrongly returned success; fixed with the preflight regression above.
  Successful repeat: `ADOLION_SPRITES_ROOT=C:/dev/so-lanes/6/adolion-fresh/sprites-40dd2d0f0a4c/campaign/sprites python scripts/install_st.py --sprites`.
  Existing 2889 files already matched; no regular sprite file needed replacement. No campaign backgrounds are rendered;
  stock backgrounds remain. Updated installation docs remove the obsolete global-lorebook-selection step.
- Main `st-eval.mts --file C:/dev/adolion-campaign/build/st-groups.js` plus `so-adolion-rollout.mts import`:
  nine bindings and exact library records verified. Import performed from welcome screen; existing chat pins preserved.
- Main `so-adolion-rollout.mts smoke` and `image`: real reply/read/reopen; DeepSeek-directed local illustration
  decoded at 1216×832, followed by a real local reply and boundary 4. No missing routed image models; managed broker ready.
- `npm run debug:typecheck`: clean after both new rollout scripts. `node scripts/debug/st-lanes.mts stop 6`:
  isolated server stopped. `npm run build && npm run test:release && npm run stage`: prod restored, release 94/94
  passing with two declared skips; served main SHA256 `173b478706ec32012130bba974202e56e3bbacd315cc2cf1e5e05bf941f71f69`.
- `node scripts/debug/so-production-rollout.mts`: final prod check green, no page/HTTP errors, no debug handles;
  real 923-character reply, two extraction audits, boundary 2; fresh bound Adventurer v32 chat left with zero player
  messages. First probe sent before asynchronous binding/briefing settled and timed out; the harness now waits for
  the actual bound state before generating. One intermediate run observed an uncategorized HTTP 409; the final run
  captured response paths and observed none.
- Disk audit: all 2889 sprite hashes match; all nine persisted library bodies equal the build; 16 required books present;
  all 155 pre-existing chat message bodies preserved; Belle original pack unchanged. The first audit included three
  historical/report JSONs as books; corrected the inventory predicate, not the installed assets.
- `npm run plugins:install -- --with gpu,media,harness --check`: all four unchanged/matching; current ST process started
  through `node scripts/local/cli.mjs start-st` without Git pull. Existing local configuration preserved.

Evidence: `test/measurements/v2.7/main-rollout/` (spoiler-free summaries, full command logs, disk audit and prod capture).
