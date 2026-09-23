# Changelog

Versions are the extension's own `package.json` version, which is also what `manifest.json` and the
settings panel report. A version is "accepted" only when an acceptance run says so; the per-plan Gate
records under `docs/plans/` are the as-built truth, and this file is the summary a reader starts from.

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
