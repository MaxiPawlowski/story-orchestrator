# Plan 04 — Lore relevance ("a high amount of lore items")

## Objective

ST's World Info activates on keywords. A big lorebook therefore either floods the prompt (broad
keys, constant entries) or misses the entry that matters because nobody typed its keyword. Jev's
cost does not change between 1 and 64 questions or between 2 and 96 messages of state. That lets
the runtime ask *every* candidate entry "does this matter for what happens next?" on every
generation and force-activate the top few. That is **lore-select**.

The same judgment also narrows two things that currently scale badly with lore size:
- the WI curator's prompt (every allowlisted entry, at 400 chars);
- memory injection under budget pressure (static weights today).

## Context

- Spike: README §World Info on/off. Jev scored 88% with AUROC 1.00 on 17 entries. The question is
  in `experiments/stagecraft.mts:27`: "Should this lore entry be active for the scene in `scene`
  and `transcript`? Entry …".
- Host facts, verified 2026-09-19 in ST source (append to the v2 host-facts table):

| Fact | Source |
|---|---|
| `WORLDINFO_FORCE_ACTIVATE` takes an array of entries. Each needs `world` + `uid`, and is stored in `WorldInfoBuffer.externalActivations` under `` `${world}.${uid}` `` | `world-info.js:1020–1029` |
| The scan adds **the external object itself** to the activated set (`activatedNow.add(buffer.getExternallyActivated(entry))`). So the forced object must have the shape the scan produces: `decorators`, parsed `content` and `hash`, as built by `getSortedEntries` | `world-info.js:4886–4889`, `:4627–4637` |
| `getSortedEntries()` is exported and returns a `structuredClone` of the processed entries of every **active** source: global selection, character, chat and persona lore, each stamped with `world` | `world-info.js:4590`, `:4535` |
| External activation is checked only for entries the scan iterates. Disabled entries are skipped **before** it (`if (entry.disable == true) continue`). So an entry the checkpoint gating has switched off can never be forced back on, and a book that is not active is never reached | `world-info.js:4801`, `:4886` |
| Forced entries still pass through the rest of the scan: probability, inclusion groups, token budget | `world-info.js` scan loop |
| `externalActivations` is a **static** map, reset only at the end of a `checkWorldInfo`, dry runs included. A force therefore waits for whichever scan runs next, whoever's it is | `world-info.js:203`, `:1025`, `:5275` |
| ST's emitter awaits each listener in turn, and `Generate()` awaits its emits | `public/lib/eventemitter.js:146` |
| `GENERATION_STARTED` fires **before** the player's new message joins `chat`. The message is added later in the same `Generate()` by `sendMessageAsUser`, which awaits `MESSAGE_SENT` before returning. Only then does the scan run | `script.js:4299`, `:4453`, `:5874+` (`MESSAGE_SENT`), `:4635` |
| A group send's top-level `Generate` fires `GENERATION_STARTED`, then returns into `generateGroupWrapper`. The wrapper emits `GROUP_WRAPPER_STARTED` and runs one `Generate('normal')` per member, each with its own `GENERATION_STARTED` and scan. The **first member's** `Generate` reads the input box and adds the user message (`sendMessageAsUser` → `MESSAGE_SENT`) after its `GENERATION_STARTED`; the box is empty for later members. The wrapper adds the message itself only when no member is active. `is_group_generating` is not exported | `script.js:4350–4353`; `group-chats.js:110`, `:985`, `:1037–1040`, `:1049`, `:1063` |
| Whether a generation will add a player message is decided by `script.js:4448`: input text (or a pending attachment) and not `automatic_trigger`, not `quiet`, not `dryRun`. There is also the OpenAI `send_if_empty` branch at `:4455` | `script.js:4398–4458` |
| Generation interceptors (talk control's veto) run before the scan. A vetoed member's generation ends without scanning, so anything forced for it waits for the next scan | `script.js:4564` vs `:4635` |
| `GENERATION_STARTED` args: `(type, {…, quiet_prompt, force_chid, …}, dryRun)` | `script.js:4299` |

- Reuse:
  - `stHost/worldInfo.ts` (lorebook names → file ids).
  - `runtime/index.ts`'s `GENERATION_STARTED` handler.
  - `stagecraftCoordinator.readScope` (curator entries).
  - `memory/inject.ts` + `memory/score.ts` + `memory/budget.ts` `selectWithinBudget`.
  - The J8 `GENERATE_AFTER_DATA` payload assertion.
- Consumed: plans 01 and 03 (the scene read's window and state shape). Regression floor: J3, J5
  (group passes fire `GENERATION_STARTED` per member), J8 (curator unchanged when judge lore is
  off).
- **Pending peer work.** Check before building. Uncommitted on 2026-09-19:
  - a curator change for the Adolion session touches `src/stagecraft/scope.ts`,
    `stagecraftCoordinator.ts` and a new `src/engine/worldInfoEffects.ts`;
  - the `GENERATION_STARTED` handler in `runtime/index.ts` changed too.
  Rebase on whatever lands.

## Scope

In:
- Lore-select: authored scope, per-generation judge, force-activation seam.
- Curator pre-filter (after its spike).
- Memory re-rank (after its spike, built only if it wins).
- Fixtures, J11 lore checks.

Non-goals:
- Creating, editing, enabling or disabling entries. Lore-select only *forces* for one generation;
  it never writes a lorebook.
- Books outside the authored scope.
- Changing ST's WI budget or settings.

## Deliverables

### Format 2: `lore_select?`

`lore_select?: { lorebooks: string[]; top_k?: number; min_p?: number }`, added to schema, validate,
the Studio **Story** tab, `storyDiff` (compatible) and copilot ops. The wizard prefills it with the
story lorebook it creates, as it already does for `stagecraft.lorebooks`.

- `top_k` defaults to 4 (max 12). `min_p` defaults to the calibrated `LORE_MIN_P`.
- Scope is authored explicitly, the same rule as stagecraft: entry text leaves the machine, so
  nothing is inferred from `requirements`.
- Diagnostic `lore-select-inactive` (warning): a listed book that is not in
  `requirements.lorebooks`. Only active books are ever scanned, so it would silently do nothing.

### Host seam: `stHost/worldInfoActivate.ts`

- `getScannableEntries()` wraps `worldInfoModule.getSortedEntries()`. Vendor its type with the
  line.
- `forceActivateEntries(entries)` emits `eventTypes.WORLDINFO_FORCE_ACTIVATE` through
  `getContext().eventSource`. `stHost/events.ts` gains a typed `emitHostEvent` beside the existing
  subscribe helpers; `presets.ts` is precedent for emitting.

### Pure core: `src/judge/lore.ts`

- `loreCandidates(entries, scope)` keeps entries whose `world` resolves to a scoped book, that are
  not `disable`d and not `constant`. Constants are already always in the prompt.
- `buildLoreQuestions(candidates, {scene, transcript})` asks one noul per candidate, using the
  spike's question verbatim. Content is truncated at 600 chars, and chunks go ≤ 64 per call.
- `pickLore(answers, {topK, minP})` sorts by p, keeps p ≥ `minP`, and caps at `topK`.
- `policy.ts` gains `LORE_MIN_P` (calibrated; 0.6 proposed) and `LORE_TIMEOUT_MS = 1500`.

### Runtime: `runtime/loreSelect.ts`

A helper with injected deps, precedent `memoryMirror.ts`. It owns no extras slice; its calls go to
plan 01's ring.

**The seam rule.** Pick and force at the **last awaited event before a scan whose chat already
holds the message that triggered it**. Never force earlier: the map is static, so an early force
lands in whatever scan runs next.

| Situation | Event that picks + forces | Why |
|---|---|---|
| This generation is about to add a player message: solo send, a group's top-level call, or a group's first member | `MESSAGE_SENT` (skip its `GENERATION_STARTED`) | At `GENERATION_STARTED` the message is not in `chat` yet; at `MESSAGE_SENT` it is, and the scan follows |
| Anything else loud: later group members, `swipe`, `regenerate`, `continue`, `impersonate`, empty sends, automatic triggers | `GENERATION_STARTED` | No message will be added, so `chat` is already final |
| `dryRun`, `quiet_prompt`, `type === "quiet"`, no scope, flag off | never | — |

"About to add a player message" is `stHost/generation.ts` `willAddUserMessage(type, params,
dryRun)`. It mirrors ST's own condition (`script.js:4448`, plus the `send_if_empty` branch at
`:4455`), reading `#send_textarea` and the pending-attachment state exactly as `Generate()` is about
to. The condition is vendored with its line, like every other host fact.

Edge case: a member vetoed by talk control ends before its scan, so its picks carry into the next
member's scan. They were computed from nearly the same window, so this is harmless, and the ring
records it.

**Mechanics:**
- Cache key `chatId:lastMessageId:scopeHash`. A repeat at the same `lastMessageId` (e.g. a group's
  top-level call with an empty box, then the first member) is a cache hit that re-emits the same
  picks. That is idempotent, because the map is keyed by entry. A later member has a new
  `lastMessageId` and asks again.
- On timeout or error it forces nothing, and ST's keyword scan runs as always. The ring record
  carries `fallback`.
- Wiring: `runtime/index.ts` subscribes `MESSAGE_SENT` and extends the existing
  `GENERATION_STARTED` handler (re-read it at plan start: other sessions changed it on
  2026-09-19). Both **await** the helper before anything that reads the prompt.
- Call ring: one record per pick (`use: "lore"`, the chosen entries with p, the event that
  triggered it). The author view Payload tab shows "Lore forced this turn" (author).

**Phase 0, before any consumer code.** Build `scripts/debug/so-lore-probe.mts`. It logs, for each
of: solo send, solo empty send, solo swipe, continue, a 2-member group pass, and a
talk-control-vetoed member:
- the event order (`GENERATION_STARTED`, `GROUP_WRAPPER_STARTED`, `MESSAGE_SENT`,
  `WORLDINFO_ENTRIES_LOADED`, `WORLD_INFO_ACTIVATED`);
- `chat.length` at each event;
- `willAddUserMessage`'s answer.

The table above is the hypothesis this probe must confirm. Any row it contradicts changes the
rule before code is written.

### Curator pre-filter (Phase A spike first)

- The spike measured *relevance to the scene*, not "has the story overtaken this entry". Add
  `experiments/curatorFilter.mts` + data: ≥ 20 entries against canon/threads, labelled
  `stale-or-newly-relevant` / `fine`. Floor: recall ≥ 0.9 at the chosen cut, because a missed
  stale entry silently loses the curator's only job.
- **Measured 2026-09-19** (`run.mts --only curator-filter`; data
  `scripts/spike/typesafe/data/curator-filter.json`: 24 entries over four stories, 13 needing
  attention, the noir set in Spanish).
  - AUROC 0.99.
  - Cut 0.2: recall **13/13**, keeping 15/24, so the curator's prompt shrinks by ~40%.
  - Cut 0.3–0.4: recall 12/13 (92%), keeping 13/24. The only miss is the Spanish "Teniente Brandt"
    entry at 0.29.
  - **Passes**, with `CURATOR_FILTER_P = 0.2`. Real lorebooks are bigger and mostly fine, so the
    Gate record re-reads recall and reduction on the Adolion book.
- Question: ``Look at `entries[i]`. Has the story so far (`canon`, `open_threads`, `checkpoint`)
  made something in it out of date, or, if it is switched off, made it newly needed?`` It is asked
  over one shared state per pass: `{checkpoint, canon, open_threads, entries: [{title,
  switched_on, content}]}`.
- Only if it passes: `stagecraftCoordinator.readScope`, when `judge.uses.curatorFilter` is on and
  the scope
  holds > 12 entries, keeps only the entries over the cut (plus every currently-disabled entry, so
  the curator can still enable). It then builds the prompt from those. The prompt shape is
  unchanged.
- Checkpoint-gated entries are excluded before the question is asked. The peer change in progress
  adds `isCheckpointGated` (`stagecraft/scope.ts`), and the curator may not write those entries, so
  judging them would be wasted.
- Architecture guard: the pre-filter is injected as a function, so stagecraft still imports no
  `@memory` / `@generation` / `@pacing`.

### Memory re-rank (Phase A spike first, build only if it wins)

- Spike `experiments/memoryRerank.mts`: 10 windows × 20–40 memory lines. Hand-label which lines
  the next reply needs. Compare recall@budget of the static `scoreEntry` ranking against static +
  judge relevance (weight 2).
- Build only if recall@budget improves by ≥ 10 points.
- **Measured 2026-09-19** (`run.mts --only memory-rerank`; data
  `scripts/spike/typesafe/data/memory-rerank.json`: 10 turns, 3 in Spanish, over four memory pools
  of 18–20 notes, 23 needed notes, budget top-5). Recall@budget:

| Ranking | Needed notes in the top 5 |
|---|---|
| Static `scoreEntry` | 15/23 |
| Static + 2× judge | 17/23 |
| Judge alone | 16/23 |

- The gain is **9 points**, under the pre-registered 10. **Not built** in v2.2:
  `judge.uses.memoryRerank` stays hidden.
- The blend weight was fixed before the run and is not re-tuned after it, which would fit the test
  set. It is a v2.3 seed with a larger labelled set.
- If built: the judge relevance is precomputed at the boundary, off-path, for the facts and
  session tiers, and only when a tier is over its token budget. It enters `ScoreContext` as
  `judgeRelevance: Record<entryId, p>` with a new weight. `updateInjection` runs when it lands. The
  reply path never waits.

### Settings

Three independent opt-ins (overview rule 4), all off by default: `judge.uses.loreSelect`
(`#so-judge-use-lore-select`), `judge.uses.curatorFilter` (`#so-judge-use-curator-filter`, only if
its Phase A passes) and `judge.uses.memoryRerank` (`#so-judge-use-memory-rerank`, only if its
Phase A wins).

### Fixtures

`test/fixtures/judge/lore.json`:
- the 17 spike entries;
- a large-book set: ≥ 60 entries from the Adolion campaign lorebook (test copy, SO-marked);
- 10 windows with hand-labelled "entries the next reply needs".

Floor: recall@top_k ≥ 0.8, and precision of forced entries ≥ 0.7.

### J11 lore checks

| Check | What |
|---|---|
| J11.16 | A marked test lorebook (`SO-J11`) with 40 entries whose keys never appear in play, one of them the answer to the player's question. Run in a **solo** chat and in a **2-member group**: the player asks → that entry's content is in `GENERATE_AFTER_DATA`'s prompt, and the `lore` record names it with trigger `MESSAGE_SENT`. In the group, the second member's prompt carries its own pick |
| J11.17 | An entry the active checkpoint disabled is never forced, even when the judge rates it p ≥ 0.9 |
| J11.18 | A dry run (prompt itemization) and a quiet generation make no judge call |
| J11.19 | Judge lore off → the prompt is identical to ST's keyword scan (same activated set), and `judgeCalls = 0` |
| Cleanup | Removes the marked book (`so-assets remove --marker SO-J11`) |

### Calibration record (off-page, 2026-09-19)

Production code (`src/judge/lore.ts`, `curatorFilter.ts`) → the real plugin handler → the live API,
`jev-1.13.0`: `scripts/spike/typesafe/calibrate-node.mts lore|curator-filter [--fixture …] --record`.
Fixtures come from `promote.mts lore|lore-holdout|curator-filter`.

**Lore-select.** The large-book set is the Adolion World book (369 entries; the 64 entries uid 1–64
are the pool, uid 0 is its constant primer). There are 10 hand-written windows, 3 in Spanish,
whose text avoids every needed entry's keywords, which is the case lore-select exists for. The 4
spike WI scenes are added (on = needed). The held-out set is 6 windows over uid 65–128, plus the two
generic world entries the first run over-rated: 66 entries, so two calls per window.

| Wording | Tuning recall / precision | Held-out recall / precision | Floor 0.8 / 0.7 |
|---|---|---|---|
| Spike ("Should this lore entry be active…") | 30/39 (77%) / 30/44 (68%) | 14/18 (78%) / 14/19 (74%) | **fail** |
| Revised ("Does the next reply need the specific facts…", criteria exclude general world background) | 34/39 (87%) / 34/38 (89%) | **16/18 (89%) / 16/16 (100%)** | pass |

Why the spike wording failed: the world overview entry (`Place - Adolion`) rated 0.65–0.84 in 13
of 16 windows and took a top-4 slot every time. That was 8 of the 14 tuning precision misses and
all 5 held-out ones. The held-out set was written after the first run and before the revision was
scored, and it was scored once per wording. A few remaining tuning "false positives" arguably
contradict my own labels (Inquisition for the cursed-doll manor, the Guild for the guild bar). The
labels were not changed after reading answers.

Latency: one 64-question call takes ~0.9–1.1 s off-page, under `LORE_TIMEOUT_MS` (1.5 s), but above
the 800 ms p90 at which the implementation notes move lore-select to a boundary precompute. **User
decision (2026-09-19): ~1 s on the reply path is acceptable**, so the boundary-precompute fallback is
not built. The live gate still records p50/p90 through the page; the 1.5 s timeout remains the bound.

**Curator pre-filter** (Phase A data promoted, production code): recall **13/13** at
`CURATOR_FILTER_P` 0.2, and 9 of the 11 fine switched-on entries dropped from the curator's prompt.
It passes.

### As built (code, 2026-09-19; live gate pending)

- `src/judge/lore.ts` + `loreCalibration.ts` (pure), `src/runtime/loreSelect.ts` (`LoreSelector`,
  injected deps, no extras slice), `stHost/worldInfoActivate.ts` (`getScannableEntries`,
  `forceActivateEntries`) and `stHost/generation.ts` `willAddUserMessage`. The vendored members are
  in the v2 host-facts ledger with their lines.
- **Wiring was written against the source-read table, before the Phase 0 probe ran.** The probe
  needs the live page (`scripts/debug/so-lore-probe.mts arm|dump|disarm` is built), and every row
  of the table was re-read in ST source first:
  - `GENERATION_STARTED` at `script.js:4299` comes before the box read at `:4401`;
  - `sendMessageAsUser` → `MESSAGE_SENT` comes at `:4453`;
  - the scan is at `:4635`.
  The probe is the first live-gate step. A row it contradicts changes `runtime/index.ts` before
  `loreSelect` is ever switched on. Only the two event handlers depend on the table.
- `MESSAGE_SENT` only picks when the same generation's `GENERATION_STARTED` saw a player message
  coming. A `/comment` or `/sendas` `MESSAGE_SENT` therefore never spends a call, and never leaves
  a force in the static map for an unrelated scan.
- The record's use is `lore`, and its `p` holds `trigger` plus each chunk's picks by entry title. The
  author Payload tab shows the latest one ("Lore forced this turn"); the snapshot reads it from the
  ring, so the manager did not grow.
- A cache key hit at the same `chatId:lastMessageId:scope` re-forces the cached picks without
  asking again. A judge failure caches no picks, so ST's keyword scan runs alone for that message.
- The wizard's created story lorebook also becomes `lore_select.lorebooks`, next to
  `stagecraft.lorebooks`. Nothing runs until the install opts in.
- J11.16 runs in the J11 group chat, whose first member takes the `MESSAGE_SENT` path that a solo
  send takes. A separate solo-chat run is not scripted, so the gate record should say whether a
  solo chat was checked by hand.
- **Curator pre-filter: wired 2026-09-19**, after the peer's curator change landed (f6b53ba).
  - `runtime/curatorFilter.ts` (`createCuratorFilter`) closes over the judge.
  - The stagecraft coordinator receives it as an optional dep, `filterEntries`, typed inline, so it
    still imports nothing from `@judge`, `@memory`, `@generation` or `@pacing`.
  - `runCuratorPass` narrows right after `readScope`, which has already dropped checkpoint-gated
    entries. The prompt, `parseCuratorResponse` and `planCuratorProposal` all see only the kept
    entries, so the curator cannot propose an entry it was not shown. The write edge still resolves
    ops against the full scope.
  - Nothing narrows with the usage off, a scope of ≤ 12 entries, the judge down, or a filter that
    throws. Switched-off and unanswered entries always stay.
  - `lastPass.focus {shown, total}` is recorded only when something was narrowed. The author-view
    curator panel reads "focused on N of M entries".
  - `curatorFilter` joins `BUILT_JUDGE_USES`, player-visible like the other curator settings
    (`#so-judge-use-curator-filter`).
  - Manager: one dep line, 645 → 646, the baseline.
  - Tests: `runtime/curatorFilter.test.ts` (3) plus 2 coordinator cases (prompt narrowed, hidden
    entry dropped; a failing filter shows everything).
  - J11.26 runs a real curator pass over the 40-entry `SO-J11 Lore` book, with the filter off and
    then on.

## Implementation notes

- Force, don't write. The only host effect is the per-generation event, so rollback has nothing to
  revert, and a crash leaves no trace in any lorebook.
- The +≈300 ms is on the reply path: that is the price of freshness, since the player's newest
  message is the best signal, and `MESSAGE_SENT` is the first moment it exists. The 1.5 s timeout
  bounds it. If J11 shows p90 > 800 ms, the delegated fallback is to precompute at the boundary
  against the previous window.
- ST's WI budget still applies. Forced entries compete with keyword hits, so `top_k` stays small.
  Authors who need a forced entry to survive probability checks set probability 100 on it (state
  this in the Studio field help).
- `getSortedEntries()` loads every active book (cached by ST). Call it once per cache key, never
  per candidate.

## Leaves the machine

| Question | Data sent |
|---|---|
| Lore-select | Last 8 messages; active checkpoint name + objective; each scoped entry's title (`comment`) + content (≤ 600 chars) |
| Curator pre-filter | Canon (≤ 1200 chars), open threads, entry titles + content |
| Memory re-rank | Last 8 messages + memory lines of the over-budget tier |

## Validation gate

Harness:
- `npm run typecheck && npm run lint && npm test && npm run build`.
- Pure suites for `loreCandidates` (disabled/constant/out-of-scope exclusion) and `pickLore`.
- Storybook for the `lore_select` Studio field and the Payload tab row.

Live (fresh-start, headed, real):
- The Phase 0 probe table, archived in the Gate record.
- J11.16–J11.19, run twice.
- `so-judge calibrate --use lore`.
- J3, J5 and J8 with judge lore off and on.
- Per the latency note: record p50/p90 of the `GENERATION_STARTED` handler from the journal in the
  Gate record.

## Persona tags

| Element | Tag |
|---|---|
| `lore_select` Studio field, diagnostic | `author` |
| Payload tab "Lore forced this turn" | `author` |
| The three lore checkboxes | `both` |

## Delegated decisions

- The `top_k` default: 4 proposed; tune from J11 prompt-size data.
- Chunk size when candidates exceed 64.

## Unresolved questions

- Should lore-select also cover the **character** lorebook embedded in a card, when the card is on
  the roster? That is card-adjacent text leaving the machine. Proposed: no, only authored
  `lore_select.lorebooks`.
