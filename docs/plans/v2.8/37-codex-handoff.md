# 37 — Codex handoff: finish the sprite/pose work, then the stopped branches

Written 2026-10-10 for the owner to work through in **interactive Codex sessions**, over the following days. Each task
below is self-contained:
- read its "Context" list;
- do its "Objective";
- prove it with "Verify";
- record it as "Done means".

Work the tasks **in order**: part A (sprites, poses, live head) first, then part B (the branches stopped on 2026-10-10).

## For the owner: starting a task

1. Open a terminal in `C:\dev\story-orchestrator` and start Codex:
   ```bash
   codex -m gpt-6.1-sol -c model_reasoning_effort=high
   ```
   Codex reads `AGENTS.md` on its own; that file holds the shared rules (privacy, models, your machine, merge policy).
   Codex needs write access outside the repo (worktrees in `C:\dev\so-*`, lanes in `C:\dev\so-lanes`) and to
   localhost, so approve those, or start it with `--sandbox danger-full-access` if you are happy to.
2. Give it one task per session, for example:
   > Read docs/plans/v2.8/37-codex-handoff.md ("Rules for every task" and task A1) and do task A1.
3. **Tasks that need the 3090** (A3, the second half of A4, A5, A6): add a line saying until when it is free, e.g.
   *"The 3090 is free until 23:00. I'm not playing."* Without that line, Codex stops before any GPU step.
4. **Tasks that need something from you** (an approval, a key, a choice) make Codex stop and ask you in the chat. The
   tasks name these points as **Ask the owner**.

## Rules for every task (Codex: read these first)

1. **Read first, every session:** `AGENTS.md`, `.claude/CLAUDE.md`, every file in `.claude/rules/` and
   `docs/plans/v2.8/32-queue.md`. They are binding.
   - The `.claude/skills/*/SKILL.md` files are reference manuals: read the one a task names.
   - Files are CRLF. Write multi-line scripts to a file, never a shell heredoc (gotchas: CRLF).
2. **Where you work:** each task names a worktree under `C:\dev\so-<name>` and a branch.
   - Create a missing one with `git -C C:/dev/story-orchestrator worktree add -b <branch> C:/dev/so-<name> master`, copy
     `.st-root` from the main checkout, and junction `node_modules`
     (`cmd //c mklink //J "C:\dev\so-<name>\node_modules" "C:\dev\story-orchestrator\node_modules"`).
   - **Never delete a junctioned `node_modules`**: that deletes the main checkout's.
   - Start every task by running `git merge master` in its worktree.
3. **Merging to master** (`C:\dev\story-orchestrator`, branch `master`) only at the end of a task, and only when:
   - `git -C C:/dev/story-orchestrator status --short` is empty before you start;
   - `git merge --no-ff <branch>` resolves. Regenerate the generated files (`npm run docs:guide`,
     `npm run docs:settings`); never hand-merge them;
   - the **full** `npm run gates -- --jobs 4` in the main checkout prints `gates: all green`, Storybook included. Kill any
     leftover server on :6006 first. If a step is red, fix it on the branch, not on master. If you cannot, run
     `git merge --abort` and tell the owner.

   Then:
   - `git push origin master`, `npm run stage`, `npm run plugins:install`;
   - if plugins changed (`restartNeeded: true`), **ask the owner** before restarting ST. The restart is: kill the process
     on port 8000, then `node scripts/local/cli.mjs start-st`;
   - tell the owner to reload the ST page.

   Never force-push, `git reset --hard`, `git clean` or `git stash drop`.
4. **The owner's install is real.** ST at `http://127.0.0.1:8000`, `C:\dev\SillyTavern-MainBranch\data\default-user` and
   lane 0 belong to the owner.
   - Never run journeys, scenarios or seeds against them.
   - Live checks run on a lane (`node scripts/debug/st-lanes.mts`, lanes 30+), as the debug skill describes.
   - Staging only at the end of rule 3.
5. **The GPU (the RTX 3090) only when the owner said in this session that it is free, and until when.**
   - Otherwise write the GPU step up as owed and stop before it.
   - With the go-ahead, use the local controller: `node scripts/local/cli.mjs start`, then its `unload` /
     `start-comfy` / `free-images` routes (`scripts/local/README.md`).
   - Never kill a process you did not start.
   - Leave the GPU idle at the end: `node scripts/local/cli.mjs stop`.
   - No RunPod.
6. **Downloads only through the product's model-downloads feature (plan 30)**, and only the files a task names.
   - The Hugging Face key is the owner's. **Ask the owner** to type it into the ST UI: Story Orchestrator settings → Models
     → Hugging Face key, which writes ST secret `api_key_huggingface`. Wait until they confirm.
   - Never ask for the key in the chat, print it or write it to a file.
   - Check free space on C: first (`df -h /c`), and stop if it is under 30 GB.
7. **Model calls:**
   - Opencode `openai/gpt-6.1-sol` is the default for authoring and vision.
   - DeepSeek is pay-per-token: use it only if Sol cannot do the step, after asking the owner, and report the tokens used.
   - TypeSafe judge calls: at most 300 per task, counted and reported.
8. **Adolion is private, and the owner has not read it.**
   - No campaign content goes in this public repo.
   - What you tell the owner (chat, commit messages here, reports) names no character, place, quest or plot: counts only.
   - Campaign work happens in `C:\dev\adolion-campaign` on a branch, and its `scripts/check_all.sh` must be green before
     merging there.
   - A pin bump goes in `scripts/debug/adolion-fresh.pin.json`; commit `d203f58c` shows every file a bump touches.
9. **House rules** (`.claude/rules/working-style.md`):
   - no code comments; TypeScript strict;
   - a `.stories.tsx` for every UI part;
   - a RunGuard and a census row for every async writer;
   - main bundle at most 1,300,000 B (about 1,293,000 now): put new code in lazy chunks and never raise the budget.
10. **Finish every task:**
    - append a `## Gate record` to the task's plan: date, exact commands, result lines, deviations, what is owed;
    - update its row in `32-queue.md`;
    - commit with a message ending in `Co-Authored-By: Codex (gpt-6.1-sol) <noreply@openai.com>`;
    - give the owner a short summary in the chat (at most 15 lines): what is done, what is owed, and what needs them next.
11. **Running Storybook tests from a worktree.** `npm run test-storybook:ci` cannot find stories there, because the
    `node_modules` junction resolves to the main checkout. Instead:
    - build with `npm run storybook:build`;
    - serve with `npm run serve-sb` (port 6006);
    - run the test runner by path with `--index-json` against `http://127.0.0.1:6006`. `scripts/release/gates.mjs` shows how.

---

# Part A — sprites, poses and the live head, fully working

Current state (2026-10-10, master `f81261c2`, pushed and installed): the pose library (plan 33, B1–B3) and the live
head (plan 36) are on master and green, including the full Storybook suite. Nothing in part A has run yet on a real
GPU, on real art, or against a real browser frame clock.

## A0 — Make master green, push and install: **done 2026-10-10**

The LiveHead demo buttons' contrast was fixed in `2168544f`, merged as `a4b5e94d`. Master `f81261c2` was pushed, staged and
installed.

## A1 — Live head: browser checks LI1, LI3, LI4, LI6 (no GPU, no model)

- **Worktree:** `C:\dev\so-live-head` (branch `v2.8-live-head`; `git merge master` first).
- **Context:**
  - `docs/plans/v2.8/36-live-head.md` (§Runtime and UI, §Predeclared gates rows LI1–LI6, Gate record);
  - `src/sprites/liveHead/`, `src/sprites/liveHeadStage.ts`, `src/sprites/VnStage.tsx`, `src/sprites/settings.ts`
    (`sprites.liveHead`);
  - the synthetic rig used by the Storybook story;
  - the debug skill;
  - `scripts/debug/st-lanes.mts`.
- **Objective:** run LI1, LI3, LI4 and LI6, each ×2, exactly as plan 36 states them, on a **no-model lane** (lane 30;
  `st-lanes.mts no-model 30`), with a 3-member synthetic test story that uses the synthetic rig. Write the story and
  its rig as a test fixture under `test/scenarios/live-head/`, not campaign art.
  - **LI1:** frame intervals over 60 s of steady drawing, recorded with `requestAnimationFrame` timestamps in the page. Name
    the machine, DPR and GL renderer.
  - **LI3:** with the static sprite already shown, inject each failure: rejected fetch, corrupt JSON, corrupt image, hash
    mismatch, WebGL removed, context lost, and a member/look/chat switch mid-decode. Capture whether the static sprite is
    visible within one animation frame.
  - **LI4:** OS reduced motion (CDP `Emulation.setEmulatedMedia prefers-reduced-motion`), ST's reduced-motion setting, and
    story motion off. Sample parameters for 10 s during idle and during a streamed reply; use a scripted `/sendas`
    stream or a fake streaming backend, never a real model.
  - **LI6:** viewports 390, 768 and 1440 (`ST_DEBUG_VIEWPORT`), a hidden tab, and teardown.
  - Write each as a scenario or debug script that can run again, not as one-off evaluations.
- **Verify:** every floor in the LI rows holds on both runs. Any miss is fixed (component or driver) and both runs repeated;
  a miss you cannot fix is recorded with numbers, not retuned (invariant "a floor that is unreachable is still not
  retuned").
- **Done means:**
  - plan 36's Gate record holds the numbers for both runs;
  - the scripts are committed;
  - merged per rule 3.

## A2 — Live head: real rigs (LI5), vision model, no GPU

- **Worktree:** `C:\dev\so-live-head`.
- **Context:**
  - plan 36 §Rig authoring pipeline and the LI5 row;
  - the CPU rig tool `scripts/` entries plan 36 names (grep `liveHead` in `scripts/`);
  - the upstream pipeline in `C:\dev\st-extensions-research\mesh-avatar-studio` (`AGENTS.md`, `docs/`, MIT, keep the
    notices);
  - the harness plugin (`server-plugin/story-orchestrator-harness/`) for calling opencode Sol;
  - memory note `model-cost-preference`.
- **Objective:**
  1. Build rigs for **3 synthetic looks first**, generated shapes or CC0 art you make, and check LI5's floors:
     - calibration passes the upstream score;
     - eye contours within 2 px;
     - closed eyes show no iris or white;
     - no mouth stretching onto the chin;
     - no tears at ±30°;
     - at most 3 review rounds.
  2. Then **ask the owner** which campaign members to rig, if any. Rig only those campaign members' current base art from the owner's ST
     (`data/default-user/characters/`; read-only) into the rig cache. Rig files go to the install's rig store
     (`sprites.liveHeadRigs` / the store plan 36 names), never into this repo.
  3. NumPy/OpenCV were missing for CPU layer inpainting. Install them into the repo's Python environment (`.venv`, or the
     one `scripts/local/install-backend.mjs` uses) with pip; this is a normal library install, not a model download.
- **Verify:**
  - LI5 floors on the 3 synthetic looks;
  - for campaign members, the same floors, scored by Sol with grids/overlays;
  - a screenshot per rig stored in the private so-sessions repo (`evidence/live-head/`, see memory note
    `so-sessions-private`), never in this repo.
- **Done means:**
  - the Gate record lists per-look cost (calls, minutes, tokens) and pass/fail per floor;
  - reports are counts only.

## A3 — Poses: DWPose download and S0 spike on the 3090

- **Precondition:** the owner said in this session that the 3090 is free, and until when (rule 5). Step 2 needs the Hugging
  Face key: **ask the owner** to save it in the ST UI and wait (rule 6). Without either, stop after step 1 and tell the
  owner what is waiting.
- **Worktree:** `C:\dev\so-poses` (branch `v2.8-poses`, `git merge master` first).
- **Context:**
  - `docs/plans/v2.8/33-pose-library-and-avatars.md` (§3–§6, the S0 row in §6, §7 decisions, Gate record);
  - `docs/plans/v2.8/30-model-downloads-civitai-hf.md`;
  - `docs/plans/v2.8/28-gpu-broker-in-st-plugin.md`;
  - `docs/plans/v2.8/29-st-image-workflows-in-stories.md`;
  - `assets/workflows/poses/` (SO-Pose-P2 and P3);
  - `assets/poses/` (the 40 skeletons);
  - `server-plugin/story-orchestrator-media/` (`validatePoseFiles`, `downloads.mjs`, `jobs.mjs`);
  - `scripts/local/README.md`;
  - the st-image-generation skill.
- **Objective:**
  1. **Check what ComfyUI has:** the Qwen Image 2.1 edit model, and the comfyui_controlnet_aux node pack that provides
     `DWPreprocessor`. If the node pack is missing, install it into the owner's local ComfyUI custom nodes with git
     (code, not a model download), and record its commit.
  2. **Download DWPose** (`yolox_l.onnx`, `dw-ll_ucoco_384.onnx`) through plan 30's download path, kind `poseModels`. Check the
     sha256 against the catalogue entry.
  3. **Run S0 exactly as §6 states it:**
     - 3 synthetic test members, made for the spike with no campaign art;
     - 8 library poses;
     - arms P2 and P3, at 1024, 2 seeds;
     - 2 expressions per body;
     - Artemis unloaded through the broker while it renders.
     Quote the total render count and estimated time before starting, and stop if it exceeds the owner's window.
  4. **Score identity** ("same character?") with the second-model rater §6 names, and **pose accuracy** with DWPose
     keypoints against the target skeleton.
- **Verify:** S0's predeclared floors (identity ≥ 90 % and the others in §6), on both seeds. Record the seconds per body and
  per head edit and the peak VRAM, which plan 33 §8 asks for.
- **Done means:**
  - the Gate record has the S0 table;
  - the decision is written: P2 passes, or P3, or P4 needed. **Never download P4** without the owner;
  - the GPU is left idle (rule 5);
  - private renders go to so-sessions, not the repo.

## A4 — Poses: CL pick accuracy and the Acceptance row

- **Worktree:** `C:\dev\so-poses`.
- **Context:**
  - plan 33 §6 (B3, Acceptance), Gate record "CL" paragraph;
  - `test/fixtures/poses/replies.json` (40 labelled synthetic replies);
  - `src/sprites/poses/pick.ts`;
  - the judge plugin and the classifier chain.
- **Objective:**
  1. **CL, no GPU:** score the 40 replies through the real pick chain (judge, then LLM, then none) on a lane with the
     owner's normal judge and authoring profiles. Report accuracy (floor ≥ 80 %, informational) and the judge calls.
  2. **Acceptance, needs A3 passed and the owner's go-ahead on the 3090 (rule 5):** the synthetic 3-member story, 3 looks × 4 directed poses ×
     3 labels, played on a lane ×2. Assert:
     - no reply waits on a render (send→reply latency within +10 % of a no-sprites arm);
     - S0 floors on the live renders;
     - cleanup leaves the sha256 inventory unchanged.
- **Verify:** both rows recorded, ×2 for Acceptance.
- **Done means:** merged per rule 3; queue A22 says what is accepted.

## A5 — GPU broker and story image workflows, real check (plans 28 and 29 LI)

- **Precondition:** the owner's go-ahead on the 3090 (rule 5).
- **Worktree:** new `C:\dev\so-media-li`, branch `v2.8-media-li`.
- **Context:** plan 28 §LI + LT and its Gate record ("Not run"); plan 29 §LI and its Gate record; `server-plugin/story-orchestrator-gpu/`;
  `scripts/local/`.
- **Objective:**
  - **Plan 28:** text → image → text on this machine with the in-process broker, ×2 consecutive.
  - **Plan 29:** a test story mapping two purposes to two marked `SO-` workflows, each rendering on its own workflow.
  Both run on a lane, with assets marked `SO-` and cleaned up after.
- **Verify:** both plans' predeclared LI floors; the owner's ST settings are unchanged (run-header diff,
  `node scripts/debug/so-run-header.mts`).
- **Done means:** both Gate records filled; merged per rule 3.

## A6 — Campaign sprite fixes (backlog F13 / X6; v2.7 38 D13b, D13c)

- **Precondition** for any re-render: the owner's go-ahead on the 3090 (rule 5).
- **Worktree:** `C:\dev\adolion-campaign` on a new branch `v2.8-sprites` (private repo; what you tell the owner stays spoiler-free).
- **Context:**
  - `docs/plans/v2.7/38-adolion-campaign.md` rows D13b and D13c;
  - campaign `scripts/render_sprites.py`, `night_sprites.cmd`, `normalize_sprite_sets.py`, `sprite_progress.py`;
  - memory note `adolion-sprites`;
  - plan 33 (the new layers: base, pose body, face, decal) and v2.7 19 (talking sprites, spike S28).
- **Objective:**
  - **D13b:** the LI re-render through the tray-started ComfyUI, proving the path-from-config change.
  - **D13c:** blink and mouth frames per expression for the animated sets, after S28 picks the frame count.
  - Then decide with plan 33 whether the campaign's sets move to `lp_` pose bodies: write the recommendation and do
    not convert without the owner.
- **Verify:** campaign `scripts/check_all.sh` green; `sprite_progress.py` counts before and after; Story Orchestrator
  sprite stage reads the new frames on a lane.
- **Done means:**
  - campaign branch merged on green;
  - pin bump plus reinstall into the owner's ST (`python scripts/install_st.py --sprites` only for the regex packs, as
    its README says);
  - backlog F13 updated.

---

# Part B — the branches stopped on 2026-10-10 (quota stop)

Every branch below is a WIP commit whose gates were **not run**. For each one:
1. `git merge master` into the branch.
2. Read the branch's own plan Gate record line, which says what is done and what is next.
3. Finish the work.
4. Run `npm run gates -- --no-storybook --jobs 2` and `npm run typecheck:test` in the worktree. Run the Storybook stories
   the change touched, as rule 11 describes.
5. Merge per rule 3.

## B1 — A3 v2.7 carry-over (`C:\dev\so-carry-over`, `v2.8-carry-over` @ `bb610004`)

- **Context:**
  - `docs/plans/v2.8/01-v27-carry-over.md`: C12 lore-select batching, C13-b curator digest, C11 model-driven items, the R4
    gate lift + Studio control, owner decisions, Gate record;
  - `src/runtime/talkControl.ts`, `src/talk/`, `src/runtime/talkChain*`, `src/services/stHost/voiceStart.ts`;
  - gotchas: "A chained voice and a player send could open two group wrappers at once";
  - tests `runtime/talkChainYield.review.test.ts`, `stHost/voiceStart.test.ts`.
- **Objective:** finish F7 (chain voice). Two talk-control tests are red because the chain-voice change is half done. Make
  them pass without weakening the yield-to-player rule. Then finish the plan's remaining deterministic items. Record each
  CL/LI measurement as owed with its protocol.
- **Verify:**
  - the two tests pass;
  - `talkChainYield` and `voiceStart` stay green;
  - full gates green.

## B2 — A5 lorebook features (`C:\dev\so-lore-features`, `v2.8-lore-features` @ `086b876b`)

- **Context:**
  - `docs/plans/v2.8/34-lorebook-features.md`;
  - the st-lorebook-authoring skill;
  - `C:\dev\SillyTavern-MainBranch\public\scripts\world-info.js` (outlets, regex keys, logic, triggers);
  - `src/runtime/loreKeyMatch.ts`, `lorePlacement.ts`, `loreExclusive.ts`;
  - `src/stagecraft/`;
  - the wizard's lorebook tools.
- **Objective:**
  - fix the red typecheck:test, test and lint from the first run;
  - finish what plan 34 lists as buildable;
  - campaign recommendations go only into your chat summary, without spoilers (rule 8).
- **Verify:** gates green; jest cases cover each ST behaviour plan 34 cites, with host file:line in the test name or plan.

## B3 — A6 open stretches (`C:\dev\so-open-stretches`, `v2.8-open-stretches` @ `ef94cc26`)

- **Context:**
  - `docs/plans/v2.8/19-open-stretches.md` (Gate record: what is built, M1/M2 protocols, two owner questions);
  - `src/studio/stretchAuthoring.test.ts`;
  - the open-stretch guide topic.
- **Objective:** confirm the two fixed failures (`macros.test`, the line-length ratchet) and the lint result, which was
  unconfirmed because eslint ran outside a tsconfig. Run the full gates. Run the open-stretch curve scenario ×2 on a
  no-model lane, and walk the Studio panel in Storybook. The encounter pool, `trigger: "quiet"` and open anchors stay not
  built, as the plan says.
- **Verify:** gates green; the scenario passes ×2; the Storybook stories pass.

## B4 — A8 J7 judge ideas (`C:\dev\so-judge-ideas`, `v2.8-judge-ideas` @ `a7c4fbaa`)

- **Context:**
  - `docs/plans/v2.8/13-j7-judge-ideas.md`: Phase A record. Done: J7.2/7.7, N1, N2, N3, J7.3 and N5 pass ×2; J7.1 and N4
    fail. Next: J7.4/J7.5 fixtures and runs, verdicts for J7.6 and N6–N8, the session replay, the jest replay test, the
    J7.2 consumer behind its own `judge.uses` switch, readiness rows;
  - `src/judge/`;
  - the TypeSafe harness `scripts/spike/typesafe` (key in `~/.typesafe/api-key/.env`, never printed).
- **Objective:**
  - finish Phase A for the remaining ideas, within at most 300 more judge calls;
  - build the consumer for each idea that passed ×2, each behind its own `judge.uses.<id>` switch, on by default, with
    fallbacks, and with no call on the reply path past its latency budget;
  - add N5's tension comparison as owed (it needs a model run).
- **Verify:**
  - a jest replay test of the recorded answers;
  - gates green;
  - judge call count reported.

## B5 — F29 no-model payload cases (`C:\dev\so-payload-nomodel`, `v2.8-payload-nomodel` @ `80606f6f`)

- **Context:**
  - backlog row F29 in `docs/plans/v2.8/31-v27-wrap-backlog.md`;
  - `scripts/debug/so-payload-golden.mts`, `test/scenarios/payload/`;
  - the debug-scripts rule "Payload goldens";
  - `src/extraction/scopeBudget.ts` (F27).
- **Objective:**
  1. **Living prefetch:** a job parked behind an open circuit breaker must not hold `schedulerIdle`. This is a product fix,
     with a test.
  2. **Briefing drafting and inner-beat calls:** with no model they should notice the open breaker, or the payload cases
     declare the settings they need through `requires`. Decide which, then build it.
  3. **group-relationships:** its expected axis count follows the token budget.
- **Verify:** all six payload cases capture on a no-model lane (`st-lanes.mts no-model 62`, private ST copy as before):
  - the candidate captured ×2 is identical to itself;
  - against master, every difference is declared.

## B6 — Pod 2 notes and the coverage table (no worktree needed beyond a docs branch)

- **Context:** branch `v2.8-pod2` @ `adfdedce` (docs only: R7 INCOMPLETE, D-P5 filed); `C:\dev\so-coverage-draft.md`.
- **Objective:**
  - merge `v2.8-pod2` into master. Plan 39 records stay as lists, not `| ID |` tables, or test:release's phase C parity
    check fails;
  - move the coverage draft to `docs/plans/v2.8/35-test-coverage.md`, keep it free of campaign content, and update its rows
    for poses and the live head;
  - turn its top three missing scenarios into scenario files that run on a no-model lane, each ×2.
- **Verify:** full gates green; each new scenario green ×2.

## Owed measurements that need a pod or the 3090 (not for codex without the owner)

These are listed only so nobody loses them. Each needs the owner's budget or GPU time:
- R7 late lore with `--swa-full`: target same-speaker reuse p50 ≥ 0.55 and faster prefill;
- D-P5: move the depth-10 player role shallower, then R7 again;
- L1 + L5 premise-story pace ×2;
- B1-NARR run 2;
- B1-HIST;
- R3 K5;
- R4 B1-EMPTY;
- R8;
- the X2 3.5 s outlier trace.
Protocols are in backlog §Late lore placement, §Pod 2 measurements and `32-queue.md`.
