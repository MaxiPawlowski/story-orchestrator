# Stat Tab — 2026-10-30 harvest

meta: https://github.com/interlamer/ST-StatTab · head `8ed1c3a` (0.1.5, 2 commits, 2026-10-28) · licence **AGPL-3.0-or-later**
(`LICENSE`, `manifest.json:14`) → ideas only, never code · read: all of `core.js`, `index.js`, README, manifest, post.md;
`tracker.js` connection + stat row + inline edit (`:1-80`, `:230-270`, `:390-410`), `tracker.html` · skipped: `tracker.css`,
schema-editor DOM in `tracker.js`, `examples/*.json` (same as `core.js:126-182`) · prior review: none (new) · SECURITY.md: CLEAR.

## What it is

User-defined stat schema (entities × typed stats: int plain/bar/percent/money-in-cents, short text) tracked by one side
call per character reply through a Connection Manager profile. Values stored on the message, per swipe. Thin dashboard in a
**separate browser tab** (second monitor) synced over `BroadcastChannel`. Optional injection of non-private, set stats into
the main prompt. Pure logic split into `core.js` (no ST imports, Node-testable), engine in `index.js`, view in `tracker.js`.

## How it works

- **Per-swipe state on the message.** `writeMessageState` writes `msg.extra.stat_tab` and `msg.swipe_info[sid].extra.stat_tab`,
  stamped with `swipe: sid` (`core.js:260-270`). `readMessageState` accepts a copy only when its stamp equals the showing
  swipe (`core.js:250-258`), because ST clones `extra` between swipes (host facts below).
- **State = newest stamped message, else chat baseline, else defaults** (`resolveState`, `core.js:276-292`). Deleting or
  swiping a message needs no rollback code: the scan simply finds an older state. `prevValues` (the one before) feeds the
  change arrows.
- **Starts unset.** `startsUnset` → `null` default (`core.js:201-203`); prompt shows `NOT SET (a placeholder…)` per stat
  (`core.js:302`) and a closing block telling the model to fill every unset stat with "the most reasonable assumption"
  (`core.js:357-362`). View shows no delta on a first fill (`tracker.js:250-256`). Injection omits unset stats (`core.js:383`).
- **Prompt** (`core.js:341-369`): stat list with current values + range/unit wording, card/persona clipped (1500/800), last
  N messages (default 6, `index.js:23`), numbered rules, schema instructions, unset notice, `<stat-update>{json}</stat-update>`.
  Parser strips `<think>`, tolerates fences, trailing commas, flat single-entity replies, matches names case-insensitively
  and by macro-resolved label, returns warnings for unknown names (`core.js:404-469`). Only changed stats are sent back
  (rule 2, `core.js:322`).
- **Stale-result guard**: chat key + message object identity + swipe id + text checked after the await (`index.js:162,183-189`).
- **Swipe-aware injection**: refreshed on `GENERATION_STARTED(type)`; for `regenerate`/`swipe` the last non-user message is
  dropped before resolving state, so a new swipe never sees numbers its predecessor produced (`index.js:279-290,418`).
- **Private stat** = `hideFromModel`: tracked and shown to the player, never injected (`core.js:381`).
- **Second window**: main tab owns everything; `snapshot()` posts the full state on a microtask-coalesced `push()`
  (`index.js:331-368`); view sends `hello`, pings every 4 s, marks offline after 9 s silence, re-hellos on the first pong
  (`tracker.js:53-76`). Survives a main-tab reload and bookmark opens. Commands accepted from the channel:
  `refresh|set-value|reset|bind|save-preset|delete-preset` (`index.js:370-386`). View builds DOM with a `h()` helper, no
  `innerHTML` for data (`tracker.js:22-36`).
- **Manual edits** write a `manual: true` state on the last message, or the chat baseline when there is none (`index.js:208-220`),
  so they roll back with the chat too.
- **Openers**: top-bar icon cloned from native drawer markup with capture-phase click (`index.js:468-486`), wand entry,
  settings button, `/stattab`.
- **"What the main model sees"** panel shows exact injected text and position (`tracker.js:230-238`).

## Patterns for SO

### P1. Public display stats get a read path ("starts unset", filled from the story) — pattern · extraction scope · partial · value 3 · effort S-M
- What: every schema stat is in every read; an unset one is explicitly marked and pushed to be filled.
- Their evidence: `core.js:298-314,348,357-362`.
- Our state: scope pulls only gates, snapshots, checks, extra gate sources, and the card/quest/relationship/discovery sources
  (`src/extraction/scope.ts:62-126`, `src/extraction/scopeSources.ts:96`). An extractor quality with only `display.public`
  (stat sheet / widget readout) is never read; Studio warns `quality-never-in-scope` (`src/studio/diagnostics.ts:238-252`),
  but nothing reads it. `display.hide_when_empty` (`src/engine/gameSchema.ts:27`) hides the symptom. Unset = absence is
  already our model (`src/engine/schema.ts:13-16`), and first fills already show no trend (`src/runtime/gameSheet.ts:21-22`).
- Fit: add a capped, rotating `display` scope source (public extractor qualities not pulled by anything else; unread first,
  then oldest read), same shape as `DISCOVERY_SOURCE` (unknown entries first). Fills player-visible state (readable state lens)
  without the author inventing a gate. Keeps the evidence contract.
- Conflict: do **not** copy "make the most reasonable assumption" (`core.js:360-361`). Our reads need quoted evidence; an
  assumed value on a gate key is a model decision nobody made (same trap as `PLACEHOLDER_ENUM_VALUES`). If wanted at all,
  only for display-only, non-latching keys, and the value should read as unknown until evidenced.
- Sketch: `DISPLAY_SOURCE` in `scopeSources.ts` (`cap` ~3), `quality-never-in-scope` drops display-public keys, a
  `scopeBudget` check that it fits; fixture with a public mood stat never gated.

### P2. Separate-window story sheet over BroadcastChannel — feature · UI (plan 29 IC5) · absent · value 2 · effort M
- What: a real second browser window (second monitor) showing the live sheet, kept in sync, reconnecting after reloads.
- Their evidence: `index.js:328-387,428-437`, `tracker.js:9-76`, `tracker.html`.
- Our state: plan 29 decision 5 keeps an in-page "pop-out" (floating `PanelFrame`, `docs/plans/v3.0/29-ui-rework.md:13`,
  `ui-review/inchat.md:169-176`). No `BroadcastChannel` or second page in `src/` (only `window.open` for docs).
- Fit: one snapshot already feeds every view (`runtime/snapshotBuilder.ts`), so a view page can render a projected copy. Rules:
  broadcast the **player projection only** (any same-origin script can listen; owner plays the campaign spoiler-free); the
  page is read-only (stat-tab accepts writes from any same-origin sender, `index.js:377-381`, which we must not copy; at most
  "open X in the main tab"). Separate lazily built page, not in the main bundle; staged via the dist manifest allowlist
  (`scripts/release/stage.mjs:19-21`). Useful mostly on desktop with two screens; mobile gains nothing.
- Sketch: `stHost/broadcast.ts` (the only channel owner), `sheet.html` + lazy chunk reusing the IC5 tab bodies, heartbeat as
  theirs (hello / 4 s ping / 9 s offline). Decide after IC5 lands; owner question.

### P3. Per-swipe state stored on the message itself — pattern · rollback · planned: v3.0 01 (SP1) · value 1 · effort M
- What differs from SP1: SP1 caches in memory (`src/runtime/spikes/swipeCache.ts`, cap 32); theirs persists on
  `swipe_info[sid].extra` with a swipe stamp, so swipe-back is free after a reload too. Already the RPG Companion pattern
  (`docs/plans/v2.4/extension-research/rpg-companion-sillytavern-extension.md:15-17,77-81`).
- Verdict: no change. SP1's deciding bar is S4 (swipe-back frequency) and auto-drops at the freeze
  (`docs/plans/v3.0/00-overview.md:132`). If SP1 ever passes, the stamp-on-`extra` trick is the persistence option; a full
  engine snapshot per message is too big for `extra`, so store a boundary ref, not state.

### P4. Swipe/regenerate injection reads the state before the replaced reply — host pattern · injections · present · value 1 · effort -
- Theirs: `index.js:279-290`. Ours: `MESSAGE_SWIPED` is awaited by ST before `Generate('swipe')` (`SillyTavern-MainBranch/public/script.js:10315-10319`)
  and our swipe handler returns its promise (`src/runtime/turnBridge.ts:97`), so rollback lands before the prompt. Nothing to take.

## Host facts

- ST clones `message.extra` into `swipe_info[swipe_id].extra` on stream finalize for swipe/continue (`script.js:3705-3712`) and
  in `syncMesToSwipe` (`:6939`); `syncSwipeToMes` copies it back on navigation (`:7015`). The streaming path creates `extra`
  only when missing (`:3686-3688`), so data on `extra` can ride into a new swipe; stamp per-swipe data with the swipe id (their
  `core.js:247-258`). We keep only `extra.reasoning` there (`runtime/reasoningRevision.ts`, `thoughtLeak.ts`), keyed by
  `send_date|swipe_id`, so no SO bug.
- `MESSAGE_RECEIVED` can fire twice for one message: `finalizeIntermediaryMessage` (`script.js:3798-3800`) and `onErrorStreaming`
  (`:3826-3830`, not for swipe/impersonate/continue). They dedupe by `chat:idx:swipe` within 4 s (`index.js:403-408`). Ours:
  `turnKeys` + stopped-reply guard (`runtime/turnBridge.ts`, `stHost/streamGuard.ts:17`). Present.
- Stat names are resolved with `{{user}}`/`{{char}}` from `name1`/`name2`; in a group `name2` is the current speaker
  (README "Known limits"). Not an SO concern: we key by roster id.

## Not worth taking

- Player hand-edits of tracked values (`index.js:222-233`): breaks gates; author `/cp set` already exists.
- Injecting a stat list into the main prompt every turn (`core.js:376-400`): moves each turn (prefix cache, plan 13) and our
  display qualities reach the reply through guidance/card overlay already; `hideFromModel` = our default (qualities are not injected).
- Schema import/export files: stories already carry qualities; Studio/wizard author them.
- `uid()` via `Math.random` (`core.js:13-15`): fine for them; ours must stay seeded.
- One side call per reply with the full stat list: our shared read already batches all deltas into one off-path call.

## Security notes

- CLEAR per SECURITY.md. No `fetch`, no external host, no secrets. One dynamic import of ST's own `../../shared.js`
  (`index.js:88`). Model calls go through the user's Connection Manager profile.
- `BroadcastChannel('stat-tab-v1')` accepts state-changing commands (`set-value`, `save-preset`, `delete-preset`) from any
  same-origin context (`index.js:370-387`), i.e. any other installed extension. Low impact (stat values and schemas), but a
  reason why P2 must be read-only.
- Imported schemas feed text to the tracker model (README warns). No text addressed to AI agents found.
