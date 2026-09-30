# Plan 14 — Tiered testing: playable first, then feature groups, fixing as we go

**Status: DRAFT 2026-09-30.**

**Decided by the user on 2026-09-30:**
- Testing starts when **all development is finished**. That build is the base.
- The list is ordered. The first goal is **playable**; after that, features are tested **group by group**.
- Findings are **fixed during the tier that found them**, not batched until the end.

This plan changes plan 10's order:
- The user's sessions come **first** within each tier, not after the machine matrix.
- Phase F's single final batch becomes **one closing run per tier**, plus a cumulative ×2 at freeze.

## Rules

1. **Tiers run in order.**
   - A tier starts only when the previous tier's exit criteria hold.
   - Later tiers depend on earlier ones: a memory finding means nothing while turns do not commit.
2. **Human first, then evals.** Each tier runs this loop:
   - the user plays that tier's charters;
   - I digest the logs;
   - we review them together;
   - fixes land;
   - evals are written from the findings;
   - the tier closes.
3. **Every finding gets a severity and a class, in the review.**
   - Severity is **blocker**, **broken**, **annoying** or **cosmetic**.
   - Class is **product**, **quality**, **expectation** (a spec or UX gap) or **harness**.
   - Blocker and broken findings are fixed inside the tier.
   - Annoying findings are fixed inside the tier or deferred, and a deferral is decided in the review.
   - Cosmetic findings go to a list.
4. **A fix is proved like any change** (overview rules 15–16):
   - it has its own gate;
   - the overall gates pass;
   - a replay fixture comes from the recorded session where the defect is deterministic;
   - one targeted real-model run proves the fix where it is not.
   - The fix commit names the finding id.
5. **Evals come from findings.**
   - A bug becomes a replay fixture or a no-LLM scenario.
   - A quality problem becomes a small scored LLM eval, with the session transcripts as its corpus.
   - Plan 13's inventory rows are mapped onto the tiers. At each tier close, a row the sessions never touched is kept only if it guards a real past defect; otherwise it is retired. This resolves plan 13's deferred suite-gap decision tier by tier.
6. **The regression set is cumulative.**
   - Each tier closes by running its own evals and its mapped suite rows ×2.
   - A fix in tier N also re-runs the evals of any earlier tier whose code it touches.
7. **The fresh-import rule stays.** Each session runs on its own lane, freshly imported with `adolion-fresh`, in a visible browser, so the real install stays clean.
8. **Blind-rating legs move into the tier that owns the feature** (overview rule 11 is unchanged otherwise). Each leg is rated when its tier runs:
   - 07 Q-M in T2;
   - 06 C3 in T3;
   - 05 R4 in T6;
   - 03's rater legs in their tier.

## Before T0: session tooling (development, gated like any plan)

`scripts/debug/so-session.mts`:
- **`start <tier> <charter>`** does the following:
  - seeds a lane with `adolion-fresh`, with images and sprites switched off unless the charter needs them (and never on the shared ComfyUI);
  - launches the browser headed;
  - captures a run header;
  - starts `so-journal follow` and `st-payload arm --persist`;
  - writes everything to `test/sessions/<tier>/<charter>-<n>/`.
- **`stop`** does the following:
  - diffs the run header;
  - exports the journal;
  - stops the tails.
- **`digest`** turns a session into `findings.md`. It includes:
  - every ⚑ flag with its surrounding turns;
  - automatic anomalies: stalls, rejected extraction lines, an empty private block, lost forced lore or a missed constant entry, judge fallbacks, lost saves, unexpected checkpoint jumps, rollback notices, console errors.
- **Gate:** a node:test over a recorded fixture session. A planted anomaly of each kind must be found, and a clean session must yield zero.

The findings register is `docs/plans/v2.6/14-findings.md`. It has one row per finding, with these columns:
- id (`T<tier>-<n>`);
- tier;
- severity;
- class;
- evidence path;
- status;
- fix commit;
- eval.

## Tiers

The charters list what to try, not steps to follow. One charter is about one session of 45–90 minutes.

### T0 — Playable

Charters:
- Install from fresh.
- Start `adolion-adventurer` in player mode and play 20 turns.
- Reload mid-story and continue.
- Swipe once, then edit once.
- Open the drawer, the HUD and the settings panel.

Exit when:
- a one-hour session has no blocker;
- requirements are green on every story;
- boundaries commit;
- a reload restores state;
- there are no console errors from the extension.

### T1 — Story engine loop

The features:
- extraction to blackboard, then gates and transitions;
- pacing and tension;
- agency: refusing the planned route;
- speaker direction in groups;
- checkpoint effects: AN, gated WI, background, cast changes, the preset overlay;
- generated expansions and routes.

Charters:
- Play the story to its second checkpoint.
- Deliberately refuse the hook.
- Play a group scene with the narrator plus two members.

Exit when:
- transitions fire from play, not from `/cp`;
- no narration of the player's own actions;
- no stalled story.

### T2 — Memory and continuity

The features:
- memory tiers, canon and consolidation;
- epistemic knowledge and private blocks;
- the ledger and arcs;
- **chapters and saga memory (07)**;
- the away recap;
- the continuity warden;
- the mirror lorebook.

Charters:
- A long session (60+ turns).
- Leave and come back.
- Plant a secret that one character keeps from another.
- Run the Saga across one act change.

Exit when:
- established facts hold;
- no private knowledge leaks;
- the recap is correct;
- the chapter boundary reads right.
- 07 Q-M is rated.

### T3 — Player surface and presentation

The features:
- the Overview and Memory tabs;
- the **inline timeline (08)** at levels 1–2;
- **inner voice (06)**;
- the image director;
- sprites;
- the curator review ring.

Charters:
- Play with everything on and note what helps and what distracts.
- Run the player-clean sweep by eye.

Exit when:
- no spoilers appear in player mode;
- every surface is scored as works, annoying or not wanted.
- 06 C3 is rated.
- The C5/C6 surface decisions are made (plan 10 rule 7).

### T4 — Mutations and robustness

The features:
- swipe, edit, delete and regenerate at every tier's features;
- chat switches and branches;
- a reload during generation;
- deleting a chat, then the mirror-reap prompt.

Charter: abuse on purpose (the old HU-X).

Exit when:
- features agree after every mutation (the story, memory, timeline and saves);
- nothing leaks across chats.

### T5 — Author loop

The features:
- Studio editing;
- the **agentic wizard (11)**, with the user's three A11 premises;
- provisioning;
- save, then hot-swap or the invalidating choice;
- Repair and "Fix with wizard";
- Restart.

Charters:
- Create a small story with the wizard, play it, edit one checkpoint and take the update.
- Break a requirement and repair it.

Exit when:
- the loop is completed without editing JSON;
- the wizard never writes without confirmation.
- The A1 inspector decision is made.

### T6 — Model and judge configuration

The features:
- **reasoning control (05)**;
- **judge providers (12)**;
- **harness routing (04 H)**;
- exclusive lore-select;
- the judge-off column (every fallback).

Charters:
- Replay one T1/T2 charter under each recommended configuration and with the judge off.

Exit when:
- each recommended configuration plays no worse than the default;
- the judge off falls back silently.
- 05 R4 is rated.

### T7 — Freeze and cumulative run

- Freeze the candidate.
- Run the whole cumulative regression set ×2 (plan 10 phase F, which is now expected to be green on arrival).
- Write the attestation.
- The verdict follows plan 10, with "all four sessions scored" replaced by "every tier's exit criteria met".

## Unresolved

- How many hours per tier the user can give. That sets the number of charters per tier, and the ones above are the minimum.
