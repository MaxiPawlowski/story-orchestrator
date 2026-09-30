# Plan 08 — The inline timeline: what the machine did, under the message it did it at

**Status: BUILT 2026-09-30 (code, jest, Storybook, build); live gates (J3/J6/J8, mobile, floors) deferred to plan 10 phase F. See Gate record.**

The user's request (2026-09-30): the player should see more of what runs in the background while
they play. That means background passes, recorded data and activated World Info, shown in the chat
between the messages where each thing happened. The level of detail is set in the settings panel,
and there are levels for authors as well as players.

Citations were checked against master `544975fb` plus the working tree of 2026-09-30.

## Why this is mostly a rendering problem

Almost everything the request names is already recorded and already tied to a message:

- **`buildSessionJournal()`** (`src/runtime/journal.ts:147`) merges the following into one
  `JournalEvent {at, boundary, messageId, kind, summary, detail}` stream:
  - the boundary log, transitions, extraction audits and deltas, pending writes;
  - reconciliation, payload captures, talk decisions and judge calls;
  - persisted records (status, flag, story, stagecraft, lore).
- **The memory stores** carry `messageId`/`provenance.messageId` (`memory/types.ts:125`),
  `derived` records (`memory/derived.ts:18`), arcs (`openedMessageId`), and epistemic and ledger
  rows.
- **The effect ledger** rows (`runtime/types.ts:188`) carry `messageId`. They cover cast, World
  Info, Author's Note, background, preset and extension effects.
- **Other records that already name their message:**
  - curator and warden proposals (`stagecraft/types.ts:156`);
  - talk decisions (`runtime/types.ts:71`);
  - judge calls (`judge/types.ts:94`);
  - the scene read (`judge/scene.ts:171`).

Today all of this reaches the player only as a summary: the drawer Overview, the HUD and one
`/comment` line per transition (`effectsApplier.ts:196`). It reaches the author only in drawer
tabs, and the rows in those tabs link to messages through `MessageCitation` (drawer → chat, never
chat → drawer).

### Gaps (data that cannot be anchored or does not survive a reload)

| Gap | Where | Consequence for the inline view |
|---|---|---|
| G1 | The lore evidence ring (`worldInfoEvidence.ts:52`, cap 20) and lore-select picks (`loreSelect.ts:23`) are in memory only. Only the `lore-force-lost` / `lore-constant-missed` flags persist. | "Which World Info fired at this message" disappears on reload. This is exactly what the user asked for. |
| G2 | Reconciliation and payload journal events carry `messageId: -1` (`journal.ts:129,138,164`). | These events cannot be placed under a message. |
| G3 | Arc resolution has only `resolvedAt` (a boundary), no message (`memory/types.ts:43`). | "Thread resolved" can only be placed by translating the boundary to a message. |
| G4 | Tension keeps no per-message history (`extras.tension` holds levels plus the EMA). The steering hint is never persisted. | Pacing can only be shown for the live turn. |
| G5 | Payload captures (ring of 5), the next-turn preview and prompt buckets are in memory only. | Acceptable: these are author/raw level only and are allowed to disappear. |

## Design

### D1 Render into the DOM; never post chat messages

Chips render under `#chat .mes[mesid=N]` (after `.mes_block`). No chat message is written. This
follows the one existing precedent for per-message injection (`stHost/imageSurface.ts:62`).

- **The chat file stays clean.** Nothing enters the prompt, extraction never reads these chips
  (`windowHygiene.ts:117`), and they cannot commit a boundary.
- **Rollback is free.** The view is derived from stores that already roll back, so a swipe, edit
  or delete takes the chips with it.
- **Cost of this choice:** ST rebuilds `.mes` elements, so the view has to re-attach on
  `CHARACTER_MESSAGE_RENDERED`, `USER_MESSAGE_RENDERED`, `MESSAGE_UPDATED`, `MESSAGE_DELETED`,
  `MORE_MESSAGES_LOADED` and `CHAT_CHANGED`. The new host module is `stHost/inlineMount.ts`. It is
  the only file that touches `.mes`, and it answers `WriteResult`.

### D2 One pure composer, the `narrative.ts` pattern

`src/runtime/inlineTimeline.ts` (pure) turns the snapshot, the journal events, the memory writes,
the effect ledger and the lore records into `Map<messageId, InlineItem[]>`.

- **`InlineItem`:** `{category, level, persona, state: "live"|"pending"|"applied"|"refused", text, detail?, action?}`.
- **Two text fields, one rule:**
  - `text` is player copy: checkpoint names, never ids, boundaries or quality keys. This is the
    `pipeline.text` / `pipeline.detail` rule from v2.1 plan 04.
  - `detail` is author-grade.
- **Read path:** the composer rides the snapshot (`snapshotBuilder`) as `inline`. The mount only
  reads it, following the "one snapshot, one subscription" invariant.

### D3 Anchoring rules

Each event goes under the message it is about, not the message during which the machine happened
to run.

| Event | Anchor |
|---|---|
| Transition, boundary, effects of the new checkpoint | the reply that committed the boundary (`context.lastMessageId`) |
| Delta noted | the message its evidence quotes (`acceptedDeltas[].messageId`, else `window.to`). Shown as `pending`, it flips to `applied` at the boundary that drained it, and that boundary's reply gets a back-reference chip |
| Memory fact / scene summary / short-term | `provenance.messageId`, or `range.to` for summaries |
| Arc opened / resolved | `openedMessageId` / G3 fix |
| World Info fired, lore picks | the reply the generation produced (the slot's `lastMessageId` once rendered) |
| Speaker pick, warden note, judge call | `messageId` of the record |
| Live pipeline ("reading…") | the newest message only, ephemeral |

### D4 Levels and categories

- **One level setting**, with a preset per level, and a per-category override.
- **Levels:**

  | # | Name | Who can pick it |
  |---|---|---|
  | 0 | Off | player |
  | 1 | Story | player (default) |
  | 2 | Behind the scenes | player |
  | 3 | Author | needs Author view |
  | 4 | Raw | needs Author view |
- **Author view gates the top two levels.** Level ≥3 renders only while the chat's
  `extras.ui.authorView` is on, and otherwise falls back to level 2. "Author view adds, never
  conditionally reveals" therefore holds unchanged.

| Category | L1 Story | L2 Behind the scenes | L3 Author | L4 Raw |
|---|---|---|---|---|
| Progress | "◈ *The Ruins*: objective" | "The story is waiting on something you haven't done yet" (agency recovery, no gate text) | gate fired, blackboard before→after, path, refusal recovery | evaluated values |
| Memory | "Remembered: …" (facts tier, non-secret) | scene summarized, older memories folded, memory lorebook updated (counts) | deltas `q=v` + evidence quote, rejected lines + reason, supersede/dedup/fold, held conflicts, verify drops. Inline pin/exclude/lock | read prompt + raw reply |
| Threads | thread opened / resolved (arc text) | — | arc bookkeeping, bridge increments | — |
| World / Lore | — | "Lore consulted: 4 entries" | entries fired (book · comment), gated set changes, force lost / constant missed, lore-select picks + p, mirror hits. Curator proposals with accept/reject inline | curator prompt/reply |
| Cast & direction | "Mira joined", background changed | "Kael speaks next" | director source/confidence/chain step, per-member private block present, warden note injected / lapsed | director reply |
| Pacing | tension word ("rising") | — | EMA, expected, steering hint text | — |
| Model calls | — | "Reading the last 3 messages…" → "2 things noted, apply next turn" | per call: role, route (harness), latency, tokens, cost, fallback, cached | prompt buckets, payload capture |
| Health | "Stepped back to *X*" | save retrying, stalled, catching up | effect ledger rows (refused, externally changed), expansion state, save evidence | — |

**Spoiler rule:** every L1/L2 item is a new row in the spoiler checklist (`docs/plans/v2.1/test-plan.md`
§Spoiler checklist). L1/L2 never show any of the following:

- `hiddenFrom` or `[hiding]` content;
- `session_details` rows marked secret;
- gate text or quality keys;
- World Info entry names (see Q3).

### D5 Presentation

- **Collapsed by default.** A single line of category chips with counts sits under the message
  (`◈ · ✎2 · 📖4`). Clicking a chip expands it in place. Expansion state is kept per viewer in
  memory, not persisted.
- **Window option:** "only the last N messages" (default 20) bounds DOM cost on long chats. Older
  messages keep their chips once the player scrolls or loads more.
- **Mobile:** chips wrap and detail opens full width. Test at `ST_DEBUG_VIEWPORT=390x844`.
- **Theming:** ST's `smallSysMes` visual language (muted, small), so the chips read as ST, not as a
  foreign panel.
- **Actions (L3):** accept/reject a curator op, pin/exclude/lock a fact, resolve a held conflict,
  "open in drawer". Each calls the existing manager action (`memoryActions`,
  `setCuratorOpDecision`, …). No new write path.

## Suggested answers to the open questions

| # | Question | Suggested answer | Why |
|---|---|---|---|
| Q1 | Should the `/comment` transition note move into the inline view? | **Yes, eventually. Keep it in phase 1.** The inline L1 progress chip replaces it, and `announceTransitions` becomes "also post a chat note". It defaults on until the inline view has passed its live gate, then flips off. | The note is a real chat row: saved, visible to other extensions and swipe-sensitive. The inline chip does the same job without a chat write. Keeping both during the change avoids a regression window. |
| Q2 | Should lore activations be persisted? | **Yes: a compact capped ring** `extras.lore.fired` of `{messageId, entries:[{book, uid, comment, via:"constant"\|"key"\|"forced"\|"mirror"}]}` (cap 100 messages, no entry text). It rolls back by `messageId`. | It is the headline ask. Entry names are small, and a reload that loses them makes the feature look broken. Rule 9 applies: bump `BLOB_VERSION` 5→6 with reset, not a migration (Q6). |
| Q3 | Should players see World Info entry names at L2? | **No: counts only by default**, plus an optional per-story authored opt-in `display.lore_names_public: true`. Checkpoint-gated entries never show a name below L3, whatever that flag says. | Entry comments are authored for authors ("CP4 - Betrayal reveal") and often spoil. The author is the one who knows whether their names are safe. |
| Q4 | How do we keep the CSS scoped? | **One root per message with generated ids** (`#so-inline-<mesid>`), plus a scope selector `[id^="so-inline-"]` added inside the `:is()` list with an explicit `#chat` prefix (`#chat [id^="so-inline-"]`). That keeps the +1-ID specificity. Add the entry to `mountRootFor` in `.storybook/preview.ts`. | This keeps the "every rule carries exactly +1 ID" invariant (`styles.css:17`) without one React root per chip. Mount through a single React root plus `createPortal` into each message host. |
| Q5 | One level for everyone, or separate player and author levels? | **One install-wide level plus the per-chat Author view gate.** The effective level is `min(level, authorView ? 4 : 2)`. | Three lifetimes, three homes: the level is install-wide display (next to `announceTransitions`), and the persona is already per chat. Two independent levels would duplicate the persona switch. |
| Q6 | Is persisting G1/G3/G4 a blob bump? | **Yes, bump to 6** under rule 9: new `extras.lore`, `ArcEntry.resolvedMessageId` and a `tension.history` ring (cap 50, `{messageId, level, smoothed}`). | The pre-release rule is "a persisted-shape change is a version bump plus a reset, never a migration". |
| Q7 | Should the live "reading…" chip replace the HUD pipeline chip? | **No.** The HUD stays as the always-visible status. The inline live chip appears only at L2+. | The HUD works at L0/L1 too, and players who turn inline off still need the stall signal. |

## Tasks

1. **Data gaps** (pure + coordinators; blob 6):
   - `extras.lore.fired`, written from `worldInfoEvidenceHost` on settle, and rolled back in
     `runtime/rollback.ts` by `messageId`;
   - `ArcEntry.resolvedMessageId`;
   - the `tension.history` ring;
   - reconciliation events carry the stalled boundary's `lastMessageId`;
   - payload captures carry the generation's message.
2. **`runtime/inlineTimeline.ts`** (pure): the composer, anchoring (D3), the level and category
   filter (D4), and player/author copy. Add `inline` to the snapshot.
3. **Settings:**
   - `display.inline {level: 0-4, categories: Partial<Record<Category, boolean>>, window: number}`
     in `settingsModel.ts`, defaulting to `{level: 1, window: 20}`;
   - DisplayGroup controls in `PlayGroups.tsx`, `#so-inline-level` and
     `[data-so="inline-category"]`;
   - the story schema gains `display.lore_names_public?` (Q3).
4. **`stHost/inlineMount.ts`:** the event re-attach set (D1), one React root plus portals, and
   message hosts `#so-inline-<mesid>`.
5. **`components/inline/`:** `InlineStrip.tsx` and `InlineDetail.tsx`, each with a `.stories.tsx`
   (interaction + a11y). Wire L3 actions to the existing manager actions.
6. **CSS scope and Storybook root** (Q4).
7. **Transition note:** `announceTransitions` becomes "also post a chat note" (Q1 phase 1). Flip
   its default only after task 9 is green.
8. **Spoiler checklist rows and `so-ui.mts`:**
   - `assert-player-clean` sweeps `[id^="so-inline-"]` at L1 and L2;
   - new verbs `so-ui.mts inline [mesid]` (read the items) and `inline-level <n>`;
   - add them to the scenario vocabulary (`lib/scenarioSchema.mts`).
9. **Live gate** (see below).

## Gates

- **Pure (tasks 1–2):** `npm run typecheck && npm run typecheck:test && npm run lint && npm test`.
  - `inlineTimeline.test.ts`: anchoring per event kind, pending→applied, level/persona filter.
  - The spoiler property: no L1/L2 item text contains a checkpoint id, a quality key, `hiddenFrom`
    content or a gated entry name. It is fed from the sun-ruins and adventurer fixtures.
  - `rollback ≡ replay` extended to `extras.lore.fired` and `tension.history`.
- **UI:** `test-storybook:ci` over the new stories. The `architecture.test.ts` guards must pass:
  inline components read the snapshot only, and `stHost/inlineMount.ts` is the only `.mes` toucher.
- **Build:** `npm run build && npm run test:release`.
- **Live (real LLM, dev build, then `st-session.mts reload`):**
  - **J3 (player session on sun-ruins) at L1 and L2:**
    - a transition shows its chip under the reply that fired it;
    - a remembered fact shows under the message it quotes;
    - `assert-player-clean` passes with the chips expanded;
    - World Info fired shows as a count;
    - after `st-session reload` the chips (including lore counts) are unchanged.
  - **J6 (mutation storm):** after edit, delete and swipe, the chips of every removed or rewound
    message are gone, and none reappear after `MORE_MESSAGES_LOADED`.
  - **J8 (stagecraft) at L3:**
    - accepting a curator op from the inline chip applies it at the next boundary, exactly as the
      drawer path does;
    - L4 shows the curator prompt;
    - with Author view off, the same chat renders L2 at most.
  - **Mobile:** J3 at `ST_DEBUG_VIEWPORT=390x844`, plus `hit-test` on a chip.
  - Each journey is run twice, and the run header is diffed around the batch.

**Predeclared floor (the view must not slow play):**

- the median added time from `CHARACTER_MESSAGE_RENDERED` to chips attached is ≤ 50 ms at
  window 20;
- the added DOM nodes per message at L1 are ≤ 30.

This is measured on the J3 record. If the floor is missed, the view does not ship at L1 by default
and the default stays 0.

## Resolved 2026-09-30 (review)

| Question | Answer | Why |
|---|---|---|
| Should the player's L2 "speaks next" appear before the reply? | **Under the reply only.** | Before the reply, it announces a director decision ahead of the scene, which is a spoiler. Player copy never shows the machine's plan (v2.1 plan 04). |
| Emoji glyphs or Font Awesome? | **Font Awesome.** | ST's own icon set, already used by our drawer (`fa-route`). Emoji rendering depends on the OS font and breaks the theme. |
| Blob bump | **Shared with 07: one bump to 6** (overview rule 18). | — |

## Resolved 2026-09-30 (review)

| Question | Answer | Why |
|---|---|---|
| Should the player's L2 "speaks next" appear before the reply? | **Under the reply only.** | Before the reply it spoils a director decision. Player copy never shows the machine's plan (v2.1 plan 04). |
| Emoji glyphs or Font Awesome? | **Font Awesome.** | ST's icon set, already used by our drawer (`fa-route`). |
| Blob bump | **Shared with 07: one bump to 6** (overview rule 18). | — |
| The `/comment` note after the timeline ships | **Kept as an opt-in**; the default is decided by the sessions (overview W11). | User. |
| Inspector vs timeline | **The timeline is the in-chat view; the v2.5 A1 inspector is its author-view click-through into one message's full detail** (overview W18). Add a task: a chip opens the inspector panel for its `messageId`. | User. |

## Unresolved questions

None.

## Gate record

**2026-09-30, branch `worktree-agent-ad63351bbf00ad182` (fast-forwarded to master `a272ce8c`, then merged master `0aec773c` after plan 12 landed and `076bc120` after plan 05 landed). Code, jest, Storybook and the build only. No real-LLM run (overview rule 13: J3/J6/J8 live legs belong to plan 10 phase F), no lane, no scenario run, nothing touched ComfyUI.**

### What was built, per task

| Task | As built | Gate |
|---|---|---|
| 1 Data gaps, blob 6 | `BLOB_VERSION` 5 → **6** (`runtime/persistence.ts`); a v5 blob is unreadable-until-Restart like every other version (no migration, rule 9). New `extras.lore.fired` (`runtime/loreFired.ts`: `{messageId, entries:[{book, uid, comment, via: constant\|key\|forced\|mirror, gated?}]}`, cap 100, no entry text) written from `worldInfoEvidenceHost` when a rendered loud generation settles (`LoreEvidence.lastSettled()` + `loreFiredRecord`, chat-checked) through `manager.recordLoreFired`; `extras.tension.history` (`{messageId, level, smoothed}`, cap 50) appended by `PacingCoordinator.applyCommitted` and rebuilt by `replayCommitted` (rows below the log floor kept); `ArcEntry.resolvedMessageId` (G3), and `rollbackArcs` reopens an arc resolved at/after the cut message; `ReconciliationEvent.messageId` (G2, the stalled boundary's `lastMessageId`) and `PayloadCapture.messageId` (the reply index: `chat.length`, or `length-1` for swipe/continue), both used by the journal instead of `-1`. `runtime/rollback.ts` quarantine drops lore and tension-history rows `>= messageId` on every path | `loreFired.test.ts` (rollback ≡ replay for both rings, 4 seeds × 61 cuts, plus an inclusive-cut control; caps/sanitize; record tagging; arc G3 reopen), `rollback.review.test.ts` (quarantine drops both), `blobUnreadable.review.test.ts` (v7 foreign, v5 "the format before v6", v6 shape rows) |
| 2 Composer | `runtime/inlineTimeline.ts` (pure): D3 anchoring for every event kind, pending → applied with a back-reference under the draining boundary's reply, D4 levels (`itemShown`: `level <= view.level`, `until` for summaries a detailed row replaces), categories, window; player copy uses `player_name` only ("The story moved on" without one), counts, tension words. Rides the snapshot as `inline` (all levels, filtered at render) plus `lore` | `inlineTimeline.test.ts` (10): anchoring, pending→applied, level/persona/category/window filter, speaker pick only under an existing reply, **spoiler property** on sun-ruins and the Adolion adventurer (no checkpoint id or name, quality key or gated entry name in any L1/L2 text; mutant `Now at ${to}` fails both), inspector grouping, settings sanitize |
| 3 Settings | install-wide `display.inline {level 0-4 (default 1), categories, window (default 20, max 200)}` in `settingsModel.ts` (+ `effectiveInlineLevel` = `min(level, authorView ? 4 : 2)`); Display group `InlineControls` (`#so-inline-level`, `[data-so="inline-category"]`, `#so-inline-window`, `[data-so="inline-level-capped"]`); story schema `display.lore_names_public?` (validated, `story-display-changed` compatible diff) | `inlineTimeline.test.ts` sanitize case; `runtimeManager.test.ts` ui defaults; typecheck |
| 4 `stHost/inlineMount.ts` | the only writer into ST's message DOM: `#so-inline-<mesid>.so-inline-host` as the last child of `.mes_block` (deviation: the plan said "after `.mes_block`", but `.mes` is a flex row, so a sibling would sit beside the message), removes unwanted or misplaced (renumbered) hosts, re-sync on `CHARACTER_MESSAGE_RENDERED`, `USER_MESSAGE_RENDERED`, `MESSAGE_UPDATED`, `MESSAGE_DELETED`, `MESSAGE_SWIPED`, `MORE_MESSAGES_LOADED`, `CHAT_CHANGED` (one microtask per burst), `WriteResult`, attach-time samples for the floor | `inlineMount.test.ts` (jsdom, 4), `typedResults.test.ts`, `architecture.test.ts` (message-DOM touchers pinned to `stHost/{image,imageSurface,inlineMount}.ts` + `sprites/stage.ts`; only `inlineMount` names `.mes_block`; control regex case) |
| 5 Components | `components/inline/InlineLayer.tsx` (one React root `#so-inline-root`, a portal per host), `InlineStrip.tsx` (Font Awesome category chips with counts, collapsed by default, expansion per viewer in memory, inspector button at L3+), `InlineDetail.tsx` (state icon, player text, author detail and actions at L3+). L3 actions call existing manager paths only: `setMemoryPinned`, `memoryActions.setMemoryLocked`, `excludeMemoryEntry`, `setCuratorOpDecision`, `memoryActions.resolveMemoryConflict` | Storybook `Inline/InlineStrip` (4), `Inline/InlineDetail` (2); `architecture.test.ts` (components/inline: no manager getters, no host imports) |
| Inspector (W18) | `runtime/messageInspector.ts` (pure: one message's items by category, level-replaced summaries dropped) + `components/drawer/MessageInspector.tsx` (`#so-inspector`, `[data-so="inspector-section"]`, `MessageCitation`), opened by the chip's inspect button: module-level target in `index.tsx`, drawer opened, rendered above the tabs in author view only | Storybook `Drawer/MessageInspector` (2), `inlineTimeline.test.ts` inspector case |
| 6 CSS | not added to the Tailwind `:is()` root list: every utility rule is nested under that list, so one more selector there cost ~29 KB of main entry. The inline UI uses its own `so-inline-*` classes in `components/inline/inline.css` (loaded with the lazy chunk; scoped `:is(#chat .so-inline-host, #so-inspector)`), ST `menu_button` for actions; `.storybook/preview.ts` wraps `Inline/*` titles in `#chat > #so-inline-0.so-inline-host` | Storybook render + a11y |
| 7 Transition note | kept, relabelled "Also post a chat note when the checkpoint changes" (`#so-announce-transitions`), default unchanged (on) until the sessions decide (W11) | — |
| 8 Harness | `so-ui.mts inline [mesid]` (every chip opened in turn: rows, states, levels, element count per strip, effective level, attach-time median), `inline-level <n>`; scenario `ui` actions `inline` / `inline-level`; `assert-player-clean` sweeps the inline strips (text needles + raw-error markers, and `INLINE_PLAYER_FORBIDDEN_SELECTORS`: inspect, actions, detail, level 3/4 rows or strips); spoiler checklist rows added (`docs/plans/v2.1/test-plan.md`) | `so-ui.test.mts` (new case with a leak control), `scenarioSchema` |
| 9 Live gate | **NOT run** (rule 13). J3 L1/L2, J6 mutation storm, J8 at L3, mobile 390x844 + hit-test, and the floors are owed to plan 10 phase F; `so-ui.mts inline` reports what the floors need | — |

### Main entry budget (F1, 1 250 000 B, not raised)

`dist/manifest.json` `bundle.bytes` = **1 242 543** (sha256 `63ee2a07c333…`), master `076bc120` builds 1 247 877 (so this plan nets -5 334 B). To fit, the composer is loaded with `import()` at startup (`snapshotBuilder.loadInlineComposer`; until it lands the snapshot carries an empty view at the right level), and these went behind `React.lazy`: `InlineLayer`, `MessageInspector`, `InlineControls`, the Studio draft store (`index.tsx` loads `studio/draft` on open), the author-only `ConflictQueue` and the memory author panels (`MemoryPanels` default `AuthorMemoryPanels`; two DrawerTabs stories now `findBy` the lazy text; `so-ui memory-queue` already polls).

### Blob 6 is shared with plan 07 (overview rule 18)

v6 = the v5 record shape (`isCurrentRecord` unchanged: `engineState`, `engineHistory`, `pinnedStory`, `extras`) plus, in `extras`: `lore.fired[]`, `tension.history[]`, `memory.arcs[].resolvedMessageId?`, `extraction.reconciliationEvents[].messageId?`. Plan 07 adds its fields (`memory.chapters`, `memory.dossiers`, `memory.chronicle`, `ArcEntry.originChapter/resolvedBy`, derived kinds `chapter_seal`/`era_merge`) **inside v6 without another bump**, on two conditions: each new field is optional on read (its sanitizer turns absent into the empty value), and nothing is added to `isCurrentRecord`. No v6 blob exists in any released build, so "absent" can only mean "written by a v6 build from before 07 landed" and reads as empty.

### Commands (final run, after the master merge)

| Command | Result |
|---|---|
| `npm run typecheck && npm run typecheck:test && npm run lint` | exit 0 |
| `npm test` | 350 suites, 4677 tests passed |
| `npm run test:debug` | 426 passed |
| `npm run build` | compiled, 0 warnings; main entry 1 242 543 B |
| `npm run build:dev && npm run test:release` | 77 passed, 2 skipped (R3 no package tree, R4 not release mode), 0 failed |
| `npx storybook build -o .sb-static-08 --quiet`, `npx http-server .sb-static-08 -p 6108 -s -c-1`, `node node_modules/@storybook/test-runner/dist/test-storybook.js --url http://127.0.0.1:6108 --index-json` | 40 suites, 283 tests passed (the path form finds 0 tests from a worktree under `.claude/`, so `--index-json`) |

### Deviations and notes

- `startupWiring.review.test.ts` "unbinds the parent's mirror…" timed out at 5 s twice in full runs (cold `import("./index")` of the whole runtime graph under load; 3/3 green alone): its timeout is now 30 s.
- A stale `lazy.py` from another session in the shared scratchpad was run by name collision and edited `components/settings/MemoryModelGroup.tsx`; reverted before commit. Scratch scripts are now prefixed.
- `scripts/debug/so-legacy-books.mts` keeps `CURRENT_BLOB_VERSION = 5`: it is the finished v2.5 step-9 mover, not a reader of live chats.
- Budget rule 3 (fail once): the spoiler property (mutant transition text), the rollback property (inclusive-cut control), the architecture guards (control strings), `inlineMount` renumbering (a kept misplaced host fails the case) and the so-ui sweep (leak control) each carry their failing case.
