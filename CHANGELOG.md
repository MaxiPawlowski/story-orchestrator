# Changelog

Versions are the extension's own `package.json` version, which is also what `manifest.json` and the
settings panel report. A version is "accepted" only when an acceptance run says so; the per-plan Gate
records under `docs/plans/` are the as-built truth, and this file is the summary a reader starts from.

## 2.7.0 (candidate, not accepted)

Nothing after 2.4.0 has been released. v2.5 (plans in `docs/plans/v2.5/`) closed unreleased on 2026-09-30 and was
folded into v2.6, which re-measured everything on the Adolion campaign and was played end to end by Claude on test
lanes (not accepted: the user's review and human sessions are outstanding). v2.7 (urgent fixes, quick wins) is in build (`docs/plans/v2.7/`); v2.8 and v2.9 are planned.
`package.json` is 2.7.0 since v2.7 39 B0 (the version the Phase C candidate is frozen at); 2.7.0 is released only
when `docs/release/2.7.0/attestation.json` says ACCEPTED.

### Playing
- **Notes under messages**: small icons under each message show what the story did there (scene change, memory,
  threads, lore, cast, tension, problems), at five levels; the player levels never spoil. The `/comment` transition
  note is now opt-in.
- **Chapters**: a story can end chapters as it goes, with a **Previously** card, **Your story** in the drawer,
  `/story chapters | chapter <n> | chronicle export`, and `{{story_chapter}}`, `{{story_so_far}}`,
  `{{story_previously}}`. Folding and archive recall stay off until measured.
- **Story openings**: a story can open a new chat with authored first lines; a group can be bound to a story.
- **No chat, no story**: importing with no chat open only saves to the library; nothing else changes.
- **Chance**: authored dice rolls, NPC reply chances and the speaker pick are seeded, so a swipe or a reopened chat
  replays the same result.
- **Branches**: a branch from a story chat offers **Continue from here** instead of taking the parent's run.
- **Who you are in this story**: a story's `player` profile (role, summary, assumptions, name rule) shows on its start
  page, where you keep, choose or create a persona; the chat locks it for the whole story, the opening waits for it,
  the characters are told your role in one line, and a mid-story switch offers **Switch back** (v2.7 34).

### Memory and characters
- **Private knowledge stays private** in shared summaries too: memory tiers are redacted per drafted member,
  sentence by sentence, and summaries never run ahead of the reads in group chats.
- **Contradictions**: a new claim against an established fact is held for review instead of stored live.
- **Fallback memory profile** while the memory model is down; it switches back on its own.
- **Models per task**: story reads, summaries, the wizard, speaker direction, the curator and inner voice can each
  use their own profile, or a Claude Code / Codex / opencode login through the new harness server plugin.
- **Inner voice** and per-character motives (inner voice off by default).
- **Reply thinking**: a per-install thinking budget for the main reply on llama.cpp (Medium, 400 tokens, by default);
  a thought cut short that leaked into the reply is moved back.

### World and stagecraft
- **A story's lorebooks reach only the chats that play it**; the wizard no longer selects them globally, and Repair
  offers to deselect an old global selection.
- **Per-chat lore gating** (scan mode) alongside the file mode; exclusive lore selection for stories that ask for it.
- **Illustrations** through the user's ComfyUI with an image director, review of candidates, per-chat preferences, and
  a sprite stage. An optional GPU broker plugin coordinates text and images on one specific single-GPU setup.
- The World Info curator is **on by default** in review mode; declines are remembered.

### Judge
- **Every use on by default** except House rules (below its floor). New uses: Lore check (warden), Exclusive lore
  selection, Sprite expressions; House rules and Lore check now see the scene and the fired lore.
- Pluggable providers (TypeSafe by default, a local llama-server option); a use is sent only where it is calibrated
  for that provider and model. TypeSafe's documented size and rate limits are enforced, never truncated.

### Authoring
- **Agentic wizard**: a story agent that plans, then works one reviewed change at a time through typed tools, can run
  through opencode on the server, and never creates an asset without your confirmation.
- **The author's guide** (`docs/authoring/story-guide.md`), shown per Studio tab as "How to write this" and read by
  the wizard; Studio diagnostics name their consequence first.
- A commit guard keeps a misread from advancing the story on one doubtful line.

### Release and docs
- Release zip from an allowlist (`npm run package`), `npm run stage` into SillyTavern, third-party notices, and the
  repository moved outside SillyTavern. Legacy story-state formats removed (never released).
- User docs reorganised under `docs/guide/` (player, author, setup) and `docs/dev/`.

## 2.4.0

Correct under the host as it really is (plans in `docs/plans/v2.4/`): SillyTavern and other extensions
change chats in ways 2.3 did not model, so 2.4 closes that gap first. It adds no new autonomous agent.

### Chats that change under the story
- Hiding a message never rewinds the story; its facts stay and it leaves future reads. Editing, deleting
  or swiping a message the story already used rolls back exactly what that message fed.
- A branch opened from a story chat shows a **Continue from here** notice instead of silently taking the
  parent's run.
- A save asked for one chat can no longer land an empty copy in the chat you switched to; a save that
  landed elsewhere is reported as not saved.
- A chat whose story data this version cannot read is left untouched and offers a confirmed Restart.

### Memory model calls
- A backend outage pauses reads and resumes them on its own; the story no longer switches extraction off
  install-wide. A misconfigured or deleted memory profile shows up as a Repair step.
- Reads are cancelled on rollback, summaries of long scenes are chunked, and a stop control ends a long
  memorize backlog.
- Extension-owned and foreign messages are cleaned out of what the memory model reads.

### World Info, steering and stagecraft
- What World Info actually activated is observed each generation, and a forced pick that did not land
  is flagged in author view.
- A checkpoint preset is a per-request sampler setting on Text and Chat Completion; your saved preset
  is never overwritten.
- Checkpoints without their own author's note can carry the story objective (`objective_block`).
- The lorebook curator refuses rewrites it was not shown and ambiguous titles.

### Judge (optional, every use off by default)
- Each call records its cost, and the settings panel says when a use was never measured on your model.
- Authored `house_rules` and an agency check ride the continuity warden's note, in author view only.

### Author view
- The next-turn preview shows tokens and share of context; each memory row shows why it was or was not
  injected.
- Optional per-role memory-model profiles (read, synthesis, authoring, director, curator).

### Acceptance status (2.4.0)
**Not accepted.** Plan 09 ran on the frozen candidate and recorded `PARTIAL`; the post-freeze fixes were
live-checked separately. `docs/plans/v2.4/09-acceptance.md` and `docs/release/2.4.0/attestation.json`
are the record.

## 2.3.0

The repo-review hardening release (plans in `docs/plans/v2.3/`). Machine gates green; the live gate is
green only where the per-plan Gate records say so.

### Durable writes and host integration
- Every `stHost` write answers `{ok, reason}`, enforced by a build-failing guard, and recorded in an
  **owned-effect ledger**: a `pending` row is persisted before the host call, reconciled on hydrate by
  reading the host back, and restored on leave compare-and-set — a value another chat changed is
  reported instead of clobbered. Cast changes are mirrored per chat, so the group is never the source
  of truth for what a chat is playing.
- **Save evidence**: `saveMetadata` swallows its own errors, so a save is now observed (the request and
  its status) *and* read back from the server's own copy. "changes not saved, retrying" is the player's
  line when the two disagree.
- **Capability probes** (`macros`, `slashCommands`, `backgrounds`, `vectors`, `judge`) report
  present/absent/error, cached per page load, and a missing capability *blocks* its feature rather than
  surfacing as a story defect. The settings panel shows the whole picture with a copy-for-a-bug-report
  button, including the ST version and the macro engine in use.
- Preset effects are refused with a reason on any non-text-generation backend instead of reporting
  success, and the settings-load seam no longer stamps defaults over an author's settings.

### Provenance and pins
- One provenance envelope on memory entries, epistemic rows, ledger versions, scene reads, curator
  proposals and the canon's inputs. **Pin = retention, lock = truth**, and a quarantined
  (`source-removed` / `conflicted`) row is excluded from every injection, canon and warden fact list.
- A **reconciliation queue** (author view) covers facts, ledger, blackboard and scene conflicts with
  source-window re-read, dismiss, and an atomic **Lock as canon**.

### Generated branching and agency
- **R9**: every outcome of a generated beat is its own outgoing transition, and the anchor threshold is
  the minimum over routes — so a player who takes the route the merge used to discard no longer stalls.
  Code checks and staleness revalidation enumerate every route.
- An authored **agency policy** (`protect_player_choice`, `never_narrate_player_action`,
  `objective_kind`) whose *defaults are the policy*: steering, generation prompts, the critic and the
  player recap stop phrasing escalation as the player's compliance. A player who refuses the prepared
  route gets one honest line and the author gets a recovery, never narration of compliance they did not
  perform.

### Rollback
- Rollback is now a cross-store invariant: every derived artifact records what it was built from and
  what it took away, and `rollback ≡ replay` holds as a property test. A mutation past the retained
  history horizon reports an explicit outcome rather than silently doing nothing.

### Release
- `npm run build` writes `dist/manifest.json` (bundle sha256, source sha256, host version and the hashes
  of every host file the extension imports), checked by `npm run test:release`.
- `dist/` is **untracked** — it is generated, `.gitignore` already said so, and the bundle is attached
  to a release with its manifest.
- `scripts/release/clean-host.sh` / `.ps1` answer the clean-host question by measurement: clone
  SillyTavern at a pinned revision, install and run the gates there, and record the host.
- The Storybook runner is invoked by path, so it works on Windows shells and in CI.
- The **acceptance attestation** `docs/release/2.3.0/attestation.json` is the second release file: the
  bundle that was served and verified, the host commit, browser, model, judge model and which journeys
  ran green on it. It is checked by `npm run test:release`, which fails when the attested build is not
  named, when a journey or a cited record is missing, or when drift from the attested build is not
  declared. **2.3.0 ships `PARTIAL`** — see below.

### Acceptance status (2.3.0)
**The automated half is green; the acceptance gate is NOT.** On the real model, headed, with no mocks:
the journey matrix ran twice each (J0 4/4 graded against its expected outcomes, J1 8/8, J2 10/10, J3
8/8, J4 5/5, J5 7/7, J6 8/8, J8 6/6, J9 5/5 with no asset leak, J10 9/9, J11 26/26) with clean cleanup
and no retries, J7 walked the whole eight-anchor spine on two of four runs, and extraction scored
**22/22 plot deltas** on 22 fixtures. Every judge usage is calibrated live at or above its floor except
`backgrounds` (0.8636, below 0.85, and nothing calls it). **Outstanding:** every human rubric, the
judge-on matrix, the cost/latency, privacy and load reports, the independent stories, the P0 replay and
the `player_summary` decision — the LLM pod reached its 8-hour cap mid-run and could not be restarted.
`docs/plans/v2.3/11-acceptance.md` is the record; `docs/plans/v2.3/v2.4-seeds.md` lists everything
bounced, with its reason; `docs/plans/v2.3/recommended-config.md` is written from this round's numbers.

## 2.2.0

Automated acceptance green (J1–J10 63/63 with a real model), human-eval sessions outstanding — see
`docs/plans/v2.2/08-acceptance.md`. Adds the judge (TypeSafe Jev behind a server plugin) as a **read
model that never blocks and never writes**: every usage is its own install-wide opt-in, all off by
default. Plus a lore selector, a continuity warden, judged extraction/expansion variants, and the
journey harness the later releases are measured with.

## 2.1.0

Author/player hard split and stagecraft agents, per `docs/plans/v2.1/`: format-2 stories gained `id` +
`version` with a **pinned copy per chat**, install-wide settings with per-chat overrides only, the
drawer's player surface as the default view, the author loop (Studio save → hot-swap or ask), the setup
wizard with create-only provisioning, and the World Info curator (propose-only, author-accepted, applied
at a boundary). Journeys (J1–J10) and the session journal are the measurement layer.

## 2.0.0

The v2 build: stories as deterministic checkpoint graphs over the blackboard, one transition per
rendered-reply boundary, off-path extraction, memory tiers with arcs and canon, the epistemic map and
state ledger, pacing, and the Checkpoint Studio. Accepted 2026-07-06 — see the plan-13 Gate record in
`docs/plans/v2/`, the project acceptance record.
