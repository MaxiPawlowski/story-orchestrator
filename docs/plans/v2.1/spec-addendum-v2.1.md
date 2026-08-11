# Spec addendum v2.1

Amends `../v2/story-orchestrator-spec-v2.md`. Where this file speaks, it wins; everywhere else spec v2 stands. Deviations from *this* addendum follow the same rule as v2: stop and surface.

## Personas (new — supersedes the implicit model)

One human, two hats, hard-separated surfaces:

- **Player.** Plays the chat. Sees only what a good GM would show at the table: where the story is (narratively), what threads are open, that the machine is working (or stuck and self-correcting). **Never** sees future checkpoints, gate expressions, unmet-gate values, the epistemic map, ledger internals, scheduler/payload debugging, or any control that steers the story (Advance/Nudge/Probe/Suggest/set). Player controls are limited to: memory curation of established facts (pin/edit/exclude — table talk, not steering), display toggles, and Restart.
- **Author.** Everything. Studio, author view in the drawer, driver, `/cp`, debug surfaces.

The audit/steering role originally imagined for the player is **reassigned to the system**: deterministic effects first, background stagecraft agents second (§Stagecraft). "Author view" remains a per-chat toggle, but the default surface must be publishable to a player who did not write the story.

## Story identity (amends §Data model)

- Format-2 gains `id?: string` (stable slug) and `version?: number` (int, default 1). Missing `id` normalizes to `legacy-<contentHash>`.
- The library keys records by `id`; the content hash remains for integrity/dedup and drift detection, never for identity.
- **Version pinning (user decision 2026-08-11)**: per-chat runtime keys by `id` and pins a full copy of the story content at selection (`{pinnedStory, playedVersion, contentHashAtLoad}`). A chat plays its pinned copy, self-contained — library edits, and even library deletion, never affect a running chat.
- **No automatic propagation**: a library edit reaches an existing chat only through the author's explicit action *in that chat* — the plan-05 Studio hot-swap (which re-pins), or an explicit "update to latest" affordance. New chats always pin the latest library version.
- Selecting the already-selected story **hydrates** — it never resets. Switching stories prompts. Reset is only the explicit **Restart story** action. A version change applied to a chat with live progress goes through the invalidation flow (plan 05), preserving state whose qualities/checkpoints survived.

## Configuration homes (amends §SillyTavern integration, per-chat storage)

Three lifetimes, three homes:

| Lifetime | Home | Contents |
|---|---|---|
| User/global | extension settings | memory-LLM profile, extraction enabled+cadence+lag+reconcile×, pacing α+hint, display toggles, copilot enabled, memory settings incl. capability profile |
| Chat | `chat_metadata` | story progress (engine state), memory tiers, arcs/canon/epistemic/ledger, tension, audits/decisions rings, per-chat overrides: `authorView`, `talk.enabled`, `shapeOverride` |
| Story | story JSON / library record | everything authored |

Extraction defaults **enabled**; without a profile it idles with a visible "not configured" state pointing at the one place to fix it. A new chat with a configured install plays immediately. The global settings offer a **model self-test**: a fixed fixture scenario run through the real per-tier extraction pipeline with per-tier pass/fail, driving the capability flags from evidence instead of guesswork.

## Story wizard (new — extends §Story Copilot)

The authoring copilot grows into a setup wizard covering the whole distance from premise to playable:

- **Interview**: per stage the copilot may ask the author up to a few clarifying questions before proposing (in-protocol `questions` results, backend-agnostic); "you decide" always proceeds under stated defaults.
- **Provisioning**: the wizard may propose creating the ST assets a story requires — character cards, the story lorebook and its entries, the group. Invariants: **create-only** (never edits existing user characters or non-story lorebooks; enforced in op validation, not prompt-trusted); every provisioning action is an editable proposal card applied per-op by explicit review, excluded from bulk accept; results surface live in the requirements panel ("Fix with wizard").
- The wizard emits the same typed mutation ops as the human editor — no second write path.

## Stall surfacing (amends §Extractor hardening)

Reconciliation is player-visible: while a stall re-read is pending/running, the player surface shows a calm working state ("re-checking recent scenes"); resolution clears it. Author view keeps the full event detail. A dead pipeline (no profile, scheduler error, paused) is visually distinct from a slow one.

## Stagecraft (new — extends §Cast model / §Off-path scheduler)

The system, not the player, adjusts presentation around the deterministic spine:

- **Deterministic stagecraft**: new checkpoint effects for presentation — `background` (ST background switch) now; candidates later (ambience, music) only if a verified host seam exists.
- **Agentic stagecraft**: background curators on the memory LLM, off-path, one per concern (World Info curation from canon/arcs; scene-setting; cast/npc-reply tuning; a **continuity warden** — contradiction check of the latest reply against established facts, emitting a one-turn corrective note that auto-clears after the next generation). Invariants: proposals only — applied as boundary effects or bounded one-turn injections; **never** write the blackboard or memory tiers; every action audited in the session journal; author-reviewable ring; feature-flagged per curator via the capability profile. v2.1 ships the design + one thin slice (WI curator); the rest is design intent.

## Evaluation (amends §Evaluation framework — adds layer 5)

5. **Journeys.** End-to-end user paths (install→play, author→edit→continue, long session, return, group, mutations, finale) run against the real system, fresh-start, via `so-journey`. Split per check into **automated** (scenario assertions) and **human-evaluated** (rubric scores over a session-journal export). The session journal correlates the existing persisted rings (boundary log, extraction audits, payload captures, talk decisions, reconciliation events, transitions) onto one exportable timeline; the player can flag a moment in-UI, and flags land in the journal. No new step-level recording.
