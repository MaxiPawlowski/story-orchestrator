# Doom's Enhancement Suite — 2026-10-30 harvest
meta: https://github.com/DangerDaza/Dooms-Enhancement-Suite · `pre-refresh-2026-10-30` .. HEAD `893b1e1` (3.2.0-beta.1), 64 commits, 44 files, +5.5k at HEAD · licence **AGPL-3.0-or-later**: ideas only, never code · read: CHANGELOG 3.1.5–3.2.0, `docs/handover-short-fuse.md` + `docs/phases-short-fuse.md` diffs, `src/utils/questCut.js`, `src/systems/features/questCut.js` (exports), `injector.js` + `rendering/thoughts.js` diffs; from `7f1e5b7` (Live World and scene pictures, built then cut from the release at `051624f`): `docs/live-world-spec.md`, `docs/scene-pictures-plan.md`, `docs/stats-plan.md` D66–D72 · skipped: inventory model/store bodies, shelf pages and portrait bar UI, CSS, tools/*, worldpacks, Live World/scene-picture code bodies, apiClient refactor body · prior: `docs/plans/v2.8/extension-research-2026-10-21/dooms-enhancement-suite.md`, `-2026-10-14/` (triaged H16c, H16d, R39, R40, R80; v2.9 G01 player attempt → v3.0, G02 → 18 Q3/Q7, G03 → 69)

## What it is / what changed
Same narrator-runs-a-cast tracker overlay. HEAD is a release cut from the "Short Fuse" branch:
- **Inventory (beta):** a persona pack and a party pouch, per chat, slots with counts. The model changes it with an end-of-reply `[ITEM: …]` tag or a tool. Swipe, edit or delete reverts the change. Loose names resolve to a stack, and an ambiguous name is refused (D66).
- **Cut to a quest:** the player picks a quest. The next reply has no player message: a short montage to the quest's threshold, then its first scene, with the first move left to the player.
- **Fixes:** vitals off means the AI never sees them (D67); thoughts attach to the last reply, never to a trailing system message.
- **Built, then removed from the release** (still in history at `7f1e5b7`):
  - **Live World:** plot clocks, last-seen places, a board of places. D70: the scene itself places people.
  - **Scene pictures:** ComfyUI renders posted as narrator system messages. D71: nothing of a picture reaches the AI. D72: Regenerate deletes the trailing picture instead of the reply.

## How it works
- **Cut instruction** (`src/utils/questCut.js:129-141`):
  - It anchors on "now": the tracker's date, time and place.
  - Elapsed time is the model's call, or the player's "when…".
  - The montage is "told in summary and never played out", then the scene opens at the threshold, then the reply stops "with the first move still the player's".
  - Never resolve the quest. Other quests stay as they are unless the skip plainly touches them. The format block still follows.
- **Cut lifecycle** (`features/questCut.js:5-10, :64-91`):
  - The cut is armed in `chat_metadata`. The facts are captured at arm time, so a swipe starts from the same "now".
  - The reply is requested with `/trigger` (quiet). Swipes keep the instruction. The player's next `MESSAGE_SENT` disarms it.
  - The quest becomes main, and the old main moves to the top of optional (`promoteQuest` `:63-72`).
- **Commit by generation type, not by tail shape** (`injector.js` diff): a `/trigger` puts two replies in a row. "The message before the tail is the player's" then misfires, so the commit is decided from the `GENERATION_STARTED` type instead.
- **Live World** (spec, `7f1e5b7:docs/live-world-spec.md`):
  - State is fixed-size and overwrite-only. Only the clock lines and the known members' "where" lines are injected, never appended. The log is a ring buffer of "last seen at X, <date>", so it records observed places and never reconstructs journeys.
  - Known tiers come from the chat, never from the advancer: heard-of = named, known = spoke.
  - The advancer: one strict-JSON reply, validated whole. Any failure discards it all and retries on the next message instead of waiting N. A last-success stamp makes a silent stall visible.
  - D70: each reply's present characters stand at the scene's location when it matches a place label, matched on whole words with the deepest match winning. The move is logged on the reply's id, so deleting the reply takes it back.
- **Pictures** (`7f1e5b7:docs/scene-pictures-plan.md` D71/D72):
  - The picture message is `is_system: true`. With CC "Send inline media" on, a picture on a visible message rode every request until the provider's 64 MB limit.
  - On `GENERATION_STARTED` type `regenerate`, it deletes its own trailing pictures first (`deleteLastMessage`, awaited) so that ST's deletion hits the reply.
  - Groups: the Regenerate menu click is caught in the capture phase.
- **Vitals off** (D67, `stats-plan.md:710`): the switch gated what was asked for, not what was remembered. Three secondary routes (previous-tracker example, `<previous>` JSON, text summary) re-fed the stored values. The fix is a pure strip that returns the same reference when nothing changes, so the bytes stay put.

## Patterns for SO

### P1. Player-chosen skip ahead ("cut to it") — feature · player agency/pacing · absent · value 3 · effort M
- **What:** a player control "Skip ahead to <open quest | next scene>". The next generation has no player line and carries a one-shot instruction (montage in summary, open at the threshold, stop with the player's move). Swipes keep it, and the player's next send ends it.
- **Their evidence:** `questCut.js:129-141`, the lifecycle at `features/questCut.js:5-10, :64-91`.
- **Our state:**
  - `NO_SKIP_CLAUSE` (`src/engine/agency.ts:39`) forbids skipping "unless the player chose to go", and nothing lets the player choose it.
  - Quests exist in the game layer (`src/engine/gameSchema.ts:156`), and "What could I do?" is an in-chat panel.
  - Grep for montage or skip-ahead in `src/` and in the v3.0 plans: 0. Not in triage 61 or the v2.9 sol triage.
- **Fit:**
  - The instruction is an `INJECTION_REGISTRY` entry, loud only, alive until the next player `MESSAGE_SENT`, kept across swipes (keyed by the armed message index, rolled back with it).
  - The reply goes through `stHost/generation.ts` voiceStart, which refuses while busy.
  - The boundary commits normally on the `command` type.
  - `story_time` moves only through the read (absolute part) or an author `/cp set`. The montage's elapsed time lands via the next read, so no new writer is needed.
  - Never changes the graph: no transition is forced, and the next scene opens only where the story's gates already allow it. The "player chose" agency path is satisfied explicitly.
  - In a group, one narrator or lead voice only, never N drafted members.
  - Thinking and the inner voice are untouched.
- **Sketch:** a "Skip ahead" action in the story card / What could I do? (29 story-sheet tab body). Wording reuses `NO_SKIP_CLAUSE`'s inverse. A payload golden covers armed vs not armed.

### P2. Trailing system messages break ST Regenerate — host-fact + test-idea · image placement / transition note · partial · value 3 · effort S
- **What:** `Generate('regenerate')` deletes the chat's last message unless it is the player's, **system messages included** (`SillyTavern-MainBranch/public/script.js:4402-4409`, verified). With a hidden system message after the reply, Regenerate removes that message, keeps the old reply, and writes a new reply below it. The model then "continues the scene".
- **Their evidence:** D68/D72 (`7f1e5b7:docs/stats-plan.md:711`, `scene-pictures-plan.md` D72).
- **Our state:**
  - `imagePlace` placement `"message"` pushes an `is_system: true` "Image Director" row after the reply (`src/services/stHost/image.ts:123-133`). It is opt-in: the default is `inline` (`src/image/settings.ts:53`).
  - The opt-in `/comment` transition note (`#so-announce-transitions`) is another trailing hidden row.
  - Tail readers already skip `is_system` (`runtime/openerDeferral.ts:35-38`, `talk/asksPlayer.ts:47-50`). Nothing guards Regenerate.
- **Fit:**
  - First a no-model scenario: post a message-placement image, regenerate, assert the reply count and the boundary.
  - If it fails: on `GENERATION_STARTED` type `regenerate` (not a dry run), remove only our own trailing rows (marked in `extra`), awaited, under a `RunGuard`, then let ST delete the reply. Or decline with a line.
  - TurnBridge must see that deletion as a non-turn: no rollback of the reply's boundary.
  - Groups need the menu-click capture DES used, or simply refuse "message" placement in group chats.

### P3. Off means unseen: a feature's stored slice never reaches a prompt by a side route — test-idea · features/payload · partial · value 2 · effort S
- **What:** for every switchable feature, a payload golden with the chat override off asserts that no block carries data from its stored slice. That covers indirect routes too: recap, canon, chapter records and the next-turn preview.
- **Their evidence:** D67 (`stats-plan.md:710`): three secondary routes leaked after the switch went off.
- **Our state:**
  - Payload goldens exist (`test/scenarios/payload/*.json`).
  - Features resolve install/story/chat (`runtime/featureResolve.ts`).
  - No "feature off ⇒ slice absent" matrix (grep `test/scenarios/payload`: no off-cases).
- **Fit:** one generated case per feature with a stored slice (promises, rumors, codex, factions, witness). It reuses `expect.payloadAbsent`, with the gotcha to assert "row in store AND no live rows". This keeps "every feature on by default" honest when the owner switches one off.

### P4. Observed "last seen" per member, from the scene, rolled back with the reply — feature · living world/readable state · partial · value 2 · effort S–M
- **What:** at each boundary, present members whose scene location is known get `last seen: <place>, <story time>`. A member who is not present shows it on the People page and in the 29 story sheet. The record is keyed by boundary, so rollback drops it.
- **Their evidence:** D70 (`stats-plan.md:713`); spec Part B ("last seen at X", observed only, never reconstructed).
- **Our state:**
  - Authored whereabouts only: `whereabouts` from `schedule` (`src/engine/life/presence.ts:12-20`), plus `PARTY_LOCATION_KEY` and `presentRosterIds` (`src/runtime/whereabouts.ts`).
  - People rows come through `CodexSources.personRows` (`src/runtime/codexView.ts:14, :46`).
  - Nothing records an observed place (grep "last seen": only mood and chapter dossiers).
- **Fit:**
  - A pure derive from boundary logs (`{present, party_location, story_time}`) at read time. No new code key and no rollback detector, because it is derived like the journal.
  - Gate it with `knownEntities` (only known members, only known places).
  - The resting filter applies: a place a secret hides from the player never shows.
  - Projection only, never injected, so there is no prompt or prefix change.

### P5. A director run that fails validation retries next turn, and the last success is visible — pattern · living director/pipeline · probably present · value 1 · effort S
- Spec Part A: discard the whole reply, set `retryNext`, and show "last advanced at message 40". SO: `checkDirectorOps` refuses drafts, and the pipeline line reports. Verify that a refused living plan retries on the next boundary rather than waiting a full cadence. If it does, skip.

### P6. UI lessons for 29 — pattern · UI rework · n/a · value 2 · effort S
- **From D69** (`stats-plan.md:712`):
  - The owner rejected a dashboard that "tried to be four things in one window" and a node map.
  - What survived: one window with three tabs, opening on a fixed first tab every time.
  - A remembered tab that no longer exists falls back to the first tab, so validate stored tab ids against the current tab set.
  - The board works as tiles one level at a time, with a trail back out.
- **Touch** (CHANGELOG 3.2.0):
  - iOS Safari never turns a long press into a contextmenu event, so a long-press handler is needed: 0.5 s, still finger, moving cancels.
  - Touch-only targets are at least 44×36. This agrees with 29 decision 3.

## Host facts
- `Generate('regenerate')` deletes the last message whenever it is not `is_user`, hidden system rows included (`public/script.js:4402-4409`). Verified. See P2.
- `GENERATION_STARTED` fires (`script.js:4299`) before that deletion and before a sent message exists. A handler there can still clear trailing rows first (DES D72).
- **CC "Send inline media"** (`oai_settings.media_inlining`, default true, `openai.js:388/498`) inlines `extra.media` of every prompt-visible message. It is gated to `main_api === 'openai'` plus a vision model list (`isImageInliningSupported`, `openai.js:6228`).
  - SO's default `inline` placement adds media to the reply row (`stHost/image.ts:113-117`). On a CC vision play route every placed picture would ride every request.
  - Play is Text Completion today (no textgen inlining found), so this is latent, not a live bug. Worth one `checks.ts` info row if CC play is ever offered.
- A `/trigger` reply produces two non-user messages in a row. Heuristics of the form "the message before the tail is the player's" break. Decide by generation type (DES injector fix). SO's tail readers skip system rows and key by type, so no SO bug was found.

## Not worth taking
- Model-written inventory tag or tool: a model-emitted state write outside typed reads (same verdict as `[CHECK:]` in plan 68). Our items are authored qualities (`runtime/gameSheet.ts:4, :53`).
- Loose stack-name resolution: already covered by `memory/nameFold.ts` for characters. Items are authored keys.
- Per-message "share" revert ledger: we have rollback ≡ replay.
- Live World clocks and advancer: covered by the living director, factions, rumors and story time. The fixed-size injection rule is already ours.
- Spoiler-free blurb in the prompt: rumors and faction bands already give players words only.
- Scene pictures pipeline and LoRA splice: track B has its own ComfyUI workflows and GPU broker, and every-N player turns already exists (18).
- `withBackgroundProfile` profile swap: our routes are per-role (`passProfiles.ts`), with no install swap.
- Thoughts-on-last-reply fix: our inline mounts address by mesid.

## Security notes
- SECURITY.md verdict: **CLEAR** (crude hit = `tools/*` `execFileSync`, dev test tooling).
- `src/utils/responseExtractor.js` wraps `window.fetch` temporarily to clone non-streaming `/api/backends/*/generate` JSON. Local only, and it restores the original fetch.
- Pre-existing: a GitHub star count GET and an `api.github.com` branch list (`index.js`) for its updater UI. These are off-localhost calls.
- Short Fuse only (not at HEAD): pictures used ST's `/api/sd/comfy/*` and a page WebSocket to a user-set ComfyUI address. No server plugin, no secrets endpoints seen in the diff.
- **Agent-directed text** (not acted on): `docs/handover-short-fuse.md` addresses "a local Claude Code session" and gives it working orders. It says to commit under the owner's identity (`git -c user.name=… commit`), and it bans model identifiers in commits, comments and docs. Repo data, not instructions.
- Nothing proposed above needs network, ST secrets or user endpoints, server plugins or remote code. P2 touches only our own chat rows.
