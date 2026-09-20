# Plan 08 — v2.2 acceptance

## Objective

Accept v2.2 as a whole: every journey green with the judge **off** (nothing regressed for an
install without it, which is every install by default) and **on** (every usage earning its
place). Cost and latency are reported from
the judge call ring, not estimated. The human-eval sessions score what automation can't. This plan also
publishes a **recommended configuration**. It never flips a default: every judge usage stays
opt-in (overview rule 4, user decision 2026-09-19).

## Context

- The template is v2.1 plan 08: `--strict`, fresh-start, real model, each journey run twice,
  archived under `test/journeys/records/<gate>/`.
- Carried in: the v2.1 human-eval sessions and rubrics (J8.4 then, J9.6/J9.7) if still
  outstanding. They share sessions with this plan's human checks.
- Consumed: plans 01–07 and every Gate record.

## Scope

In:
- The full journey matrix in both judge states.
- Calibration re-run.
- The cost/latency report.
- The human-eval protocol.
- The recommended configuration (no default changes).
- Findings register.
- Docs/status refresh.
- v2.3 seeds.

Non-goals: new code beyond acceptance-found fixes. Any fix bigger than trivial gets its own mini
gate record here or is bounced to v2.3 (the v2.1 rule).

## Deliverables

### Matrix

- J0–J11, `--strict`, twice each, in two configurations:
  - **judge off**: `judge.enabled=false`, plugin installed. This is the regression proof, and it
    must match v2.1's archived matrix check for check.
  - **judge on**: every usage opted in, curator accept modes on `review`, variants = 2. Run it
    once with `pick: code` and J11.25 once more with `pick: llm`.
- J7 runs once per configuration. It is expensive, and a v2.1-style two-run requirement does not
  apply to it.
- Archive both matrices, logs and journal exports under `test/journeys/records/v2.2-acceptance/`.

### Calibration

- `so-judge calibrate --use <every use> --record` on the model the settings pin.
- A table per use: floor, measured value, and the change against its plan's Gate record.
- A usage below its floor is marked **not recommended** in the configuration table, with the
  reason.

### Cost and latency report

`docs/plans/v2.2/acceptance-report.md`, built from the judge-on runs' `extras.judge.calls` rings.
Each record carries use, model, latency, `stateChars`, question count and fallback. The rings are
exported per journey run with `so-journal.mts export`, because a chat's ring caps at 300 and the
journey chats are deleted in cleanup.

- calls per boundary by use;
- p50/p90/max latency by use;
- on-path latency (director, lore-select) against its 1.5 s budget;
- the fallback rate by reason;
- `$` per 1000 boundaries at the published rate;
- GPU time saved: LLM calls avoided, counted as critic calls + skipped reconcile reads + P0 scene
  reads the regex would have triggered on false hits + residual-scope token reduction. The
  supersession bridge stays in v2.2, so it is not a saving.

The spike's $0.08 per 1000 boundaries is the baseline to compare against.

### Human eval

Two sessions, each exported with `so-journal.mts export`:

- **Player session**: sun-ruins, judge on. Rubric rows:
  - Did the right characters speak? (J5.7 anchors)
  - Did the story notice when you changed scenes?
  - Did lore you asked about show up?
  - Was anything contradicted?
- **Author session**: an Adolion story, judge on.
  - Review warden notes, scene-setter proposals and the "Not stored" list.
  - Author one quality hint through the preview.
  - Rubric: were the judge's calls explainable from the author view?

Every flag is triaged: fixed / v2.3 / by-design, with a reason.

### Recommended configuration

`docs/plans/v2.2/recommended-config.md` is a table with one row per usage flag: recommended /
not recommended / only for certain stories, plus the evidence and what the usage sends off the
machine. A usage is recommended only if:
- its calibration is at floor;
- its journeys ran green twice with it on and off;
- the human sessions raised no unresolved flag against it.

The settings panel links to this page. No code default changes: `judge.enabled` and every usage
stay `false` (plan 01's sanitizer test keeps it that way).

### Docs truth (v2.1 rule 5)

- `.claude/rules/architecture.md` + `docs/architecture-v2.md`: `src/judge/`, `stHost/judge.ts`,
  `stHost/worldInfoActivate.ts`, `runtime/judge.ts`, `runtime/loreSelect.ts`,
  `runtime/consolidationMatches.ts`, `sceneCoordinator`, the new registry keys, and the server
  plugin.
- `.claude/rules/gotchas.md`: judge handles, flags, fixtures, and the plugin/secret setup.
- The debug skill and `scripts/debug/README.md`: `so-judge`.
- `CLAUDE.md` status line for v2.2.
- `test-plan.md`: J11 in full, the J8 growth, the spoiler checklist additions.
- The v2 host-facts table: every seam verified in plans 01–07.

### Findings register

The same table shape as v2.1's `00-overview.md`: id, finding, fixed in, evidence.

### v2.3 seeds

- Direct scene-break confirmation by the judge.
- Canon/summary verify.
- Epistemic via judge.
- Cast tuning curator.
- Recap narrator (if the human eval asks).
- Canon regeneration drafts.
- Two-hop look-ahead.
- Per-quality floors.
- **Lore-select should rank with a Score, not a Noul** (raised 2026-09-20, data in
  `acceptance-report.md` F4). `buildLoreRequests` asks one Noul per entry, then `pickLore` filters
  at `LORE_MIN_P` 0.6 and **sorts by that probability** for the top-4. A Noul is calibrated as the
  probability a condition holds, not as relevance magnitude, so it is the wrong key to order by.
  The recorded calibration shows why: 72 of 77 probabilities sit inside 0.60-0.90, none reach 0.90,
  and they pile onto repeated values (ten at 0.76, ten at 0.82, eight at 0.85). The floor therefore
  barely discriminates, top-K does nearly all the work, and ties fall through to `entry.uid` -
  insertion order, which means nothing. The comment at `lore.ts:31` records the same problem being
  patched once already by rewording the binary criteria after a world-overview entry "took a top-k
  slot each time".
  Shape of the change: comparable per-item Scores over described relevance levels (TypeSafe's
  graded-ranking guidance and its rerank cookbook), keeping a presence/eligibility Noul only if it
  still earns its place. Deliberately **not** done in v2.2: it invalidates the lore calibration and
  J11.16-J11.19, and lore is one of only two on-path uses, so it needs its own gate.
- **A narrow `create` op for the WI curator, to give play-established entities a keyword trigger**
  (raised 2026-09-20 by the Adolion campaign session, from real use). `WiCuratorOp` is
  `enable | disable | rewrite | patch` and the prompt forbids inventing entries — by design, and the
  design holds: seeding a book with the facts a campaign's arcs actually change, and making the
  curator keep them true, is bounded and reviewable, and it cannot accrete an entry per session with
  nobody pruning.
  The gap it leaves is narrower and is a **retrieval-shape** problem, not a memory-content one. When
  play introduces a named recurring entity — a guide the party adopts who matters again eleven
  sessions later — the memory tiers do carry him, but they inject by recency and relevance. What an
  author wants is that the next time anyone types his name, a **keyed** World Info entry fires, the
  way it does for an authored NPC. No memory tier offers a keyword trigger. Today the only options
  are pre-seeding an entry for someone who does not exist yet, or adding it by hand.
  If built, the shape is deliberately constrained (the requesting session would leave it off without
  the third and fourth): restricted to the story's `stagecraft.lorebooks` allowlist like every other
  op; **review mode only, never auto**; only for an entity the memory tiers **already hold a fact
  about**, so the model is promoting what play established rather than inventing; and a per-story
  cap, which is what stops the accretion the current no-create rule is protecting against.
  Not urgent. It is a new capability, so it needs its own calibration and its own J8 checks.
- **Diagnostic: a latching enum that lists a placeholder value.** `{type: "enum", values:
  ["undecided", …], latching: true}` is always a trap — the extractor answers the placeholder on
  the first read, it latches, and the gate that wanted a real value can never open. Found live
  2026-09-20 in the Adolion campaign, where it silently froze both hubs at their lobby; five
  qualities across two stories had it, and `parseStoryV2`, `runDiagnostics` and the
  extraction-scope check all passed the story clean. Statically detectable: warn when a
  `latching` enum's `values` contains a placeholder-shaped member (`undecided`, `none`,
  `pending`, `unset`, `tbd`) and say that the unset state should be the absence of a value.
- **A per-chat checkpoint effect writes install-wide group state, with nothing scoping or reverting
  it.** `cast_changes` / `setGroupMembersDisabled` write the *group's* `disabled_members`, which is
  shared by every chat in that group and outlives the chat that set it. Two symptoms that look
  unrelated are the same defect: a stale flag leaking into fresh chats, and cleanup having to
  re-enable members *after* `/delchat` because doing it inside the sandbox chat reports success and
  is then undone when ST reloads the group.
  Minimal reproduction (Adolion campaign, 2026-09-20 — no second story and no second session
  needed): one story with two checkpoints disagreeing about one member. `road-to-wendhope` disables
  Tobias, `guild-hall` enables him, and the group-level flag flips purely on whichever checkpoint a
  chat last hydrated. A second chat in that group then opens with a cast the author never chose.
  `/member-enable` does not help diagnose it either: it acts on whatever group is currently open, so
  it reports ok while doing nothing to the group you meant.
  Shape of a fix: either scope the disable to the chat (mirror it in `chat_metadata` and re-apply on
  hydrate, leaving the group flag alone), or make it revertible the way the curator's writes are —
  record the pre-write state and restore it when the chat that set it is left or rolled back.
- **The away-recap popup fires in a brand-new chat and describes the previous chat's state.**
  Reproduced twice in two different groups (Adolion campaign, 2026-09-20): open a group whose last
  chat is old and carries story state, `/newchat`, then send. The popup appears over the empty chat
  announcing "away 18h" and a checkpoint name from the *previous* chat's story version, while the
  open chat has zero messages and sits at a different checkpoint on a newer version.
  `loadPersistedRuntime` reads `chat_metadata.story_orchestrator`, which is per-chat, so a new chat
  should have none — the symptom therefore points at the blob being read before ST has swapped
  `chat_metadata`, i.e. the same CHAT_CHANGED ordering family as the greetings bug fixed in v2.1
  (`group-chats.js:300` vs `318`), not at the recap logic itself. If so, the wrong state is not
  confined to the popup: the drawer would show the previous chat's checkpoint too, briefly.
  Two things to fix, and they are separable: **(a)** refuse to hydrate a persisted blob that was not
  written for the currently open chat — stamp it with its chat id and check it, which kills the whole
  family rather than this symptom; **(b)** a new chat has no away-gap to report at all, so the recap
  should not be reachable there whatever the hydrate does.
  Also a test hazard, which is why it surfaced here: the popup renders as a `<dialog>` that
  intercepts pointer events, so a scripted send retries against it and times out. Any journey whose
  setup is "open group, newchat, send" is exposed, and the failure looks like a send timeout rather
  than a popup. The runner now refuses to click through it by name (2026-09-20) instead of
  dismissing it as routine.
- **The shipped example pins samplers tuned for a model nobody runs any more, and the output
  degenerates.** Observed live during the J7 judge-off run, 2026-09-20: cast replies came back with
  hyphens spliced through ordinary words — `his-eyes`, `he-spe-aks`, `eyes-a-look`,
  `barely-above a-whisper`.
  Cause is authored content, not engine code. `quest-for-the-sun-ruins.json` cp1 carries
  `effects.preset {name: "Story: Sun Ruins", settings: {temp: 1.0, top_p: 1.0}}`, and that saved
  preset has `rep_pen 1` (off), `top_k 0`, `top_p 1`, `temp 1` — so the only truncation left is
  `min_p 0.05`, a very wide tail — together with DRY at `multiplier 0.8`, `allowed_length 2`,
  `penalty_last_n 4096`. Deep into a play-through, ordinary English pairs like "his eyes" have
  accumulated DRY penalty across the whole window, and with nothing truncating the tail the model
  routes around them through punctuation. The preset exists exactly, so this is not the `/preset`
  fuzzy-match trap — the settings really are these.
  It was tuned when acceptance ran on gemma4-mtp and is applied on top of whatever the install has
  selected, so on this install playing the example *overrides* the tuned `Artemis v1.1 RP` profile
  with something worse. Any future model change re-opens it.
  Recommended fix: drop the preset overlay from the shipped example and let it inherit the install's
  connection profile. A first-contact example exists to make a good impression, and hard-coding
  samplers is what broke it; if the story must carry an overlay, it should set only what is
  genuinely story-specific, never a whole sampler stack.
  Scope note: this does **not** invalidate J7 or the automated matrix, whose checks are structural
  (anchors reached, convergence honoured, gates fired) and pass on garbled prose. It does hit the
  human-eval player rubric, which asks whether the story reads well — score that on a story without
  the overlay, or after this is fixed.
- Anything bounced from this gate.

## Validation gate

The two matrices green (`--strict`, twice), calibration at floor for every recommended usage, the
recommended configuration and the cost report written, and both human sessions scored and triaged. The status line updated. If the plugin
can't run on the machine, the gate is not green.

## Persona tags

No new UI. Any acceptance fix that touches UI tags itself per v2.1 rule 4.

## Unresolved questions

- Should the judge-on matrix also run on a second judge model version (`jev-latest` if it has moved
  by then)? Proposed: yes, calibration only, not the journeys.
