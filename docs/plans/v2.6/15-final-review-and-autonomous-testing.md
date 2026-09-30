# Plan 15 — Final development review, then autonomous testing

**Status: DIRECTIVE from the user, 2026-09-30 19:26 local (AST). Resume at about 22:31 local.**

The user is away until their quota returns. Their instructions, verbatim in substance:

1. **Finish all development planned so far.** This covers:
   - the running agents: agent bridge, `so-session` plus the charter cards, UI leftovers (07/06), W25 Spanish cleanup;
   - the campaign readiness pass;
   - every open no-model item in plans 01–13;
   - the measurements that decide builds (03 SP7 first, D1).
2. **Before v2.6 development is marked done, run a joint review with the codex MCP "Astra"** (use `codex exec` if the MCP is broken). It covers the whole v2.6 plan set as implemented, its predecessors (v2.5, v2.4, v2.3 where they are still relevant) and the code on master.
   - The goal is to find incongruences, weak points, things to improve, and anything that must be closed before the test suite starts.
   - Suggestions beyond the review are welcome.
   - The output is a **final development step** (plan 15 part A below), built and gated before testing.
3. **Plan 14 is then executed by Claude, not the user.**
   - The user grants **€20 of RunPod credit and explicit permission to spend it**.
   - Claude runs every charter, parallelizing across lanes, and records every piece of data and every log.
   - The user and Claude review it all together on 2026-10-01.

## Part A: final review, then the final development step

1. **Two independent reviews of the same scope:**
   - one by Claude, with parallel reviewer agents by area;
   - one by Astra, through the codex MCP or `codex exec`, with the same inputs: the plan docs, gate records, `architecture.md` invariants and the master diff since v2.5.

   Each review lists these findings, with file:line evidence:
   - incongruences between plans, gate records and code;
   - claims a gate record makes that the code does not back;
   - weak points (untested paths, `todo` census or fault-matrix rows, disabled-by-default features nobody will exercise, bundle headroom);
   - open items left by each plan;
   - improvements.
**Amended by the user 2026-09-30:** everything the review identifies is **fixed right away**; there is no `fix-in-testing` or `defer` bucket for review findings. Ask the user only where a finding genuinely needs their decision (product direction, scope, spend); record the question in `15-review.md` and keep fixing the rest meanwhile.

2. **Merge the two lists** into `15-review.md`. Record who found each item and whether both agreed, then triage each one: `close-before-testing`, `fix-in-testing`, or `defer to v2.7`.
3. **Build every `close-before-testing` item** as the final development step, with a gate per task and the overall gates (rule 16).
4. **Only then mark v2.6 development done** (update the CLAUDE.md status row).

## Part B: autonomous plan 14

- **The player is Claude**, driving the charters through the harness with a real model on the pod.
  - Follow each card: its setup, drive beats and provocations.
  - Press ⚑ (`flagMoment`) exactly where a human would per the card's "flag when" and "must not happen".
  - Score the rubric with evidence. A score is a claim that the reviewing human will check, so state what was seen.
- **Everything is recorded** under `test/sessions/<tier>/<charter>-<n>/`:
  - run header before and after;
  - journal follow;
  - persisted payload captures;
  - the exported journal;
  - the chat transcript;
  - screenshots at key beats;
  - rubric and `digest` findings.
- **A tier summary** goes in `test/sessions/<tier>/SUMMARY.md`, and a master index in `docs/plans/v2.6/14-findings.md`.
- **Order and the fix-as-we-go rule:**
  - Tiers run in order.
  - Blockers found in a tier are fixed before the next tier. A fix gets its gate and a targeted re-run.
  - Other findings are recorded for the joint review, not fixed silently.
- **Parallelism:**
  - One lane per charter, lanes 1–4.
  - The model backend is shared, and llama-server `LLM_PARALLEL` sets how many requests it serves at once.
- **Budget: €20 on RunPod.**
  - State the pod's hourly price before creating it.
  - Record spend in `test/sessions/BUDGET.md`.
  - Stop the pod when idle and when done.
  - Stop before €20 and leave about €1 of margin.
  - Delete or stop only resources created in this work.
- **Hard constraints:**
  - Never touch the local ComfyUI at 127.0.0.1:8188, which belongs to another session. Charters that need image generation run with images off, and this is noted as a known limit.
  - Never log in to CLIs; opencode only (W decision 2026-09-30).
  - English only (W25).
  - Adolion lanes start from `adolion-fresh`. Chained charters continue their own lane.
- **Hand-off for 2026-10-01:** a single `docs/plans/v2.6/14-review-pack.md` with the tiers, findings by severity, open questions for the user and links to the evidence.
