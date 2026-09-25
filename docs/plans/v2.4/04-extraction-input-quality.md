# Plan 04 — Extraction input quality

**Status: BUILT in a worktree 2026-09-24 (machine gates green, 47/47 mutants killed); every live gate owed, so NOT green. Regex parity not built. See §Gate record.** (Doc written 2026-09-23, reconciled with overview X9, X13, X14, X15.)

Depends on **01 and 03** (X15):
- **01** writes the T20 rows this plan turns green, the guidance block the attempts clause rides
  (X7, X13), and `docs/plans/v2.4/host-facts.md` (X9).
- **03**'s per-read controller (T4) and token chunker (T9) sit on the same window path
  (`getChatWindow` feeds every pass).

Nothing below is built. Line numbers are from the working tree on 2026-09-23, not from `fcc33cc`.
Another session is editing `src/` right now, including v2.3 V25 in `scheduler.ts`, which is
uncommitted.

## Goal

The memory model should read the scene the player saw, and nothing else. A quote should count as
evidence only when it comes from text that can prove the claim. In short:
- **T7:** one cleaner feeds the prompt, the evidence check and the stored evidence.
- **T15, D6:** `evidence_from` is available per quality, and it is opt-in.
- **Seed C:** the live suite's per-tier floors are declared and recorded, not guessed.

## Scope / out of scope

In scope:
- T7 window hygiene, with prompt-only regex parity as a stretch item (build rule in §Design).
- T15 speaker-aware evidence on the LLM path and the judge typed path.
- The opt-in `agency.player_attempts_only` steering clause.
- The seed C floor decision.

Out of scope, each with its reason:
- **FACT/MEMORY evidence is never window-checked.** Only deltas are screened
  (`sharedRead.ts:34-52`), and facts are stamped `messageId: audit.window.to`
  (`extractionCoordinator.ts:177-178`). This is a **v2.5 seed**, filed in plan 09's register and
  `v2.5-seeds.md` (X26). Turning it on would move two things together:
  - plan 05's quarantine attribution (which message a fact is quarantined against);
  - the facts tier, which this plan gives a non-regression floor.

  It needs its own predeclared floor before it can be judged.
- **The live suite gets no play-path screen** (X15). Adding one would redefine
  `plotDeltaAccuracy`, the headline number every earlier run is compared on. T7 and T15 are proven
  by jest and by the live scenarios instead.
- These research theme-4 items are v2.5 candidates, not built here: current values in the prompt,
  signed `+5`, min/max step, OOC exclusion (plan 07 owns `sceneOoc`), negative memory,
  full-restatement, `[intends]`, witness sets.
- Nothing player-facing is added (rule 7).

## Verified current state

Re-read on the working tree, 2026-09-23. "Drift" means a difference from SUMMARY's `fcc33cc` citation.

| Claim | Now | Drift |
|---|---|---|
| Window passes raw `mes` | `extraction/chatWindow.ts:6-14`. It drops only `is_system` (:8) and in-flight messages (:9). Speaker is `name`, else `User`/`Assistant` (:12), so **`is_user` is lost whenever a name is set**. `ChatMessageWindowEntry` has no speaker-kind field (`types.ts:26-31`) | none |
| Every pass reads that window | `sharedRead.ts:82-85` (default 8 messages), `scheduler.ts:133,155`, `reconcile.ts:78`, `extractionCoordinator.ts:126,213,245,290,319,343,405,428`, `boundaryWork.ts:52` (cue scan), `runtime/index.ts:118` (talk director), `rollback.ts:84`. `getLastMessageText` shares `readMessage` (`chatWindow.ts:25-32`) | — |
| Cadence window size | **V25, uncommitted:** a read now starts at the previous read's end, falls back to 8 messages and is capped at 24 (`scheduler.ts:55-68`, `CADENCE_WINDOW_MAX`). Windows up to 3× larger carry proportionally more foreign content | new since `fcc33cc` |
| Other raw readers | `runtime/scoreContext.ts:9-16` `lastSpokenText` reads raw `mes` and does not skip in-flight messages; it feeds the memory scorer's `turnEntities` (:26). `stagecraftCoordinator.ts:58-63` `readReply` reads raw `mes` for the warden (:387, :407) | SUMMARY `:61-62` → `:58-63` |
| Evidence check | `evidence.ts:38-51` `evidenceInWindow(evidence, messages: string[]): boolean`, a whole-word span per V14 (`:29-36`), with elided fragments in one message, in order. It returns a **bool**, so the caller never learns which message matched | SUMMARY `:46-60` → `:38-51` (V14 rewrite) |
| Screen | `sharedRead.ts:34-52` screens scope and evidence, deltas only. Stored evidence: the model's quote in `audit.acceptedDeltas` (persisted verbatim, `runtime/extras.ts:246`), reconciliation evidence strings (`extractionCoordinator.ts:86`), `MemoryEntry.evidence` (facts :177, scene text :300, short-term :332) | — |
| Prompt | `contract.ts:26-28` renders `[i] speaker: text`, and `:37-42` has no speaker rule. `hashContract` hashes quality keys and window bounds, not text (`:54-71`) | SUMMARY `:37-41` → `:37-42` |
| Reasoning strip | `parse.ts:51` `stripReasoningBlocks` runs on model output only (`client.ts:12,14`). Message text is never stripped | none |
| Judge typed path | `judge/extraction.ts:152-168` `readTypedDeltas` already resolves a `messageId` per delta (:162-165) and marks the quality `answered` **before** it checks the value (:159). `runtime/typedRead.ts:11,17` drops the id and has no speaker kind | — |
| `read_as` | `schema.ts:37-38,63` is the **judge opt-in hint** ("how a quality opts in to the judged typed read"), and it is extractor-only (`validate.ts:84`). It is **not** an attempt/outcome classifier | SUMMARY T15 treats `read_as: choice/stated` as "player intent". **Wrong premise**: `evidence_from` has to carry the distinction itself |
| Agency | `AgencyPolicy` is **per checkpoint** (`schema.ts:136-141`, `Checkpoint.agency` :155). `DEFAULT_AGENCY` is at `agency.ts:6-10`, clauses at :31-35, and they cover model→player only | D6 said "per story". Corrected by X13: per checkpoint |
| storyDiff | `engine/storyDiff.ts:9-37` has no row for rubric, `read_as`, `criteria`, agency or guidance edits. Such an edit diffs **identical** and hot-swaps silently (`storyUpdate.ts:114-120`) | — |
| Live suite | `runtime/liveSuite.ts:42-78` → `fixtureRun.ts:34-54` builds the window from fixture JSON (**never `getChatWindow`**), parses, and scores. It applies **no** scope, evidence or speaker screen. The 22 transcripts contain no markup and no `is_user` (grep), so T7 and T15 are identity on them | Contradicts overview "re-runs after T7, because cleaning changes evidence" |
| Seed C numbers | `test/journeys/records/v2.3-plan05-live/so-live-suite-report.json`: deltas 22/22, facts 16/22 (all 6 misses are "got 0 FACT lines"), rejected 14/21. Six of the seven rejected misses are fixtures expecting a **specific** reason (`extractor2/3/4/11/12/15`), and every one read "got: none". The seventh is a real rejection (`extractor20`, invalid scene break line) | — |
| Why those six fail | Their `rejected` expectation describes the **hand-written golden**, which contains the malformed line on purpose (e.g. `test/goldens/extractor3.response.txt` line 3, `evidence=""`). Jest asserts it against that golden (`extraction.test.ts:247`). Live, it asks the real model to make the same mistake | — |
| Budgets | manager 677/700, `extractionCoordinator` 450/620, `memoryCoordinator` **614/620**, `stagecraftCoordinator` 475/620 (`wc -l`) | — |
| Dirty tree (other session) | `stHost/capabilities.ts`, `context.ts`, `worldInfo.ts`, `extraction/scheduler.ts`, `stagecraftCoordinator.ts` and others are modified and uncommitted | re-read before building |

## Host facts

These rows go into **`docs/plans/v2.4/host-facts.md`** (X9; plan 01 creates the file), labelled
`04-H1`…`04-H10` in table order. Rule 2 cites them from there, and this table is only the
hand-off. All are from SillyTavern 1.19.0 at `C:/dev/SillyTavern-MainBranch/public`
(`package.json:118`).

Before step 4 of the order of work, check `04-H1`, `04-H2`, `04-H5` and `04-H6` against 1.18.0
`51ad27fb` with `git show`, the way plan 03 does. The declared minimum is 1.18.0.

| Fact | Source |
|---|---|
| The prompt chat is `chat.filter(x => !x.is_system \|\| tool_invocations)`. Each message gets `getRegexedString(mes, is_user ? USER_INPUT : AI_OUTPUT, {isPrompt:true, depth: coreChat.length - index - (isContinue?2:1)})`, then `extra.append_title` titles are appended | `script.js:4496-4519` |
| `isPrompt:true` runs **only `promptOnly` scripts**. "All cases" scripts already rewrote the stored `mes`. Depth bounds come from `minDepth`/`maxDepth`. With the regex extension disabled, the text comes back raw | `extensions/regex/engine.js:334-376` (:342, :346-355, :361-371), placements :281-292 |
| `getRegexedString` is **not** on `getContext()` (no hit in `st-context.js`), so the seam is a dynamic import of `regex/engine.js` | grep |
| `system_message_types` = help/welcome/empty/generic/narrator/comment/slash_commands/formatting/hotkeys/macros/welcome_prompt/assistant_note/assistant_message. ST's own system posts are `is_system:true` | `system-messages.js:18-42` |
| `/sys` posts `extra.type:'narrator'` with `is_system:false` unless the text is bias-only, so it is **story narration**. `/comment` posts `is_system:true`, `extra.type:'comment'` | `slash-commands.js:6019-6041`, `:6116-6123` |
| An `/sd` post is `{name: groupId ? systemUserName : name2, is_user:false, is_system: !visible, mes: template(prompt), extra:{media:[{source:'generated', title: prompt, generation_type}], media_display, media_index:0, inline_image:false}}`. **`'extension'` exists only as the event argument**, never on the message. Visibility comes from `sd.{interactive,wand,command,tool}_visible` | `stable-diffusion/index.js:4966-5000`, `:5009-5021` |
| Any ordinary reply can gain `source:'generated'` media through the per-message button. The first such image sets `inline_image:true`. So "has generated media" does **not** identify an `/sd` post | `stable-diffusion/index.js:5149-5232`, `constants.js:75-80` |
| Stepped Thinking 3.2.0 (installed) posts separated thoughts as `{is_user:false, is_system:false, is_thoughts:true, owner_extension:'st-stepped-thinking', extra:{type: asSystem ? 'narrator' : undefined, api:'script', model:'stepped thinking'}}`. The default `mes` is `<details type="executing">…</details>`. `owner_extension` is not an ST core field | `third-party/st-stepped-thinking/thinking/mode.js:595-615`, `settings/settings.js:147-149`, `index.js:27` |
| CYOA pushes `{name:'CYOA Suggestions', is_user:true, is_system:false, extra:{api:'manual', model:'cyoa'}}` with an HTML button body. It is not installed here; source is in the research clone | `C:/dev/st-extensions-research/cyoa-extension/source/index.js:154-169` |
| Hidden (`/hide`) messages are `is_system:true` and emit no event (D5, plan 02). They are already out of our windows | `chats.js:147-169` |

## Design

### T7 — one cleaner, one text

**What.** A new pure module, `src/extraction/windowHygiene.ts`, with no host import.
`cleanWindowMessage(raw, index) → {keep:false, reason} | {keep:true, text, isUser, speaker}` holds
all the decisions. `readMessage` (`chatWindow.ts:6-14`) becomes a thin call to it, and
`ChatMessageWindowEntry` gains `isUser: boolean`.

Message-level rules, in D9 order (shape rules first):
1. **Kept as today:** `is_system` and in-flight messages.
2. **`extra.type` rule:** drop when the value is an ST system type other than `narrator`. `/sys`
   narration stays.
3. **`/sd` post rule:** drop when all of these hold: `!is_user`, `extra.inline_image === false`,
   `extra.media[0].source === 'generated'`, and a numeric `generation_type`. That shape is built
   only by `sendMessage`. The per-message image button sets `inline_image:true` on a reply's first
   image.
4. **Empty after cleaning:** drop the message. This covers Stepped Thinking's default template and
   status-only posts.
5. **Named markers,** each with a fixture built from its source. Unknown shapes are ordinary
   messages:
   - `is_thoughts === true && owner_extension === 'st-stepped-thinking'` catches customised
     templates that escape rule 4.
   - `is_user && extra.model === 'cyoa'` is needed because stripping tags would otherwise leave the
     button labels as player lines, i.e. hypothetical actions read as done.

Text-level rules, applied to a kept message:
- Strip leading reasoning blocks with the existing `stripReasoningBlocks` (one definition of the
  forms).
- Drop `<details>…</details>`, **open or closed**, plus `<script>`, `<style>`, `<template>` and any
  element whose inline style says `display:none`.
  - **Decided:** open and closed are treated alike. The known producers of `<details>` are machine
    output: Stepped Thinking thoughts, status panels, reasoning spoilers. `open` is a viewer display
    preference (Stepped Thinking's `is_thoughts_spoiler_open`, `settings.js:134`), not a sign that
    the block is narrative.
  - The residual risk is story text an author put inside `<details>`. It is pinned by a fixture and
    visible through `windowForm`.
- Drop fenced blocks whose info string is non-empty (```` ```sim ````, ```` ```json ````). Unwrap
  untagged fences and keep their text.
  - **Decided:** trackers tag their fences (silly-sim-tracker uses ```` ```sim ````), while an
    untagged fence is how a card writes a letter or a sign. Unwrapping keeps that text.
- Remove the remaining tags but keep their text, decode `&amp;` `&lt;` `&gt;` `&quot;` `&#39;`
  `&nbsp;`, and collapse whitespace.
- Do not touch Markdown emphasis (`*`): it is narration.

**Where it applies.** Everywhere the window is read, so no second reader can drift:
- `getChatWindow` and `getLastMessageText`.
- `lastSpokenText` becomes `getLastMessageText()` (this also skips in-flight messages).
- `stagecraftCoordinator.readReply` calls `cleanWindowMessage`. `@extraction` is already imported
  there, and the isolation guard forbids only `@memory|@generation|@pacing`
  (`architecture.test.ts:82-87`).
- `fixtureRun.buildFixtureRun`, so jest and the live suite take the play prompt path. It stays
  identity on the 22 fixtures, which jest asserts.

The cue scan and the talk director inherit the cleaner through `getChatWindow`. A cue inside a
tracker block no longer forces a read, which is intended.

**The audit states the form.** `SharedReadAudit.windowForm = {hygiene: HYGIENE_VERSION, promptRegex:
boolean}`. `hashContract` includes it. Additive to a persisted-verbatim record: no blob bump
(rule 3).

**Prompt-only regex parity: a stretch item with its own exit.** It is built only after the cleaner
lands, and only if a planted-tracker live run shows a residue the cleaner leaves.
- `src/services/stHost/regex.ts` loads `regex/engine.js` once through `importSTModule` and exposes a
  sync `promptView(text, isUser, depth)`. `getChatWindow` is synchronous; the engine call is too.
- Before the module loads, the function returns the text unchanged, and `windowForm.promptRegex`
  says so.
- Depth counts the non-system messages after the entry, which is ST's formula (`script.js:4503`).
- It runs **before** the cleaner.
- It gets a new `CapabilityId` `"regex"` (`capabilities.ts:17`) and an install-wide
  `extraction.promptRegex` setting, **default off** (inv 13). The run header records it.
- If it is not built, record it as **not built** in the Gate record.

**Invariants** (`_baseline.md` §2):
- **4:** Prompt, check and stored evidence read one `window.messages[].text`: `renderTranscript` and
  `screenDeltas` both take it from the same object (`contract.ts:26`, `sharedRead.ts:35`). A jest
  mutant that cleans only the rendering must fail.
- **2:** The regex seam is a new `stHost` module and is capability-probed.
- **5:** The cleaner is pure and synchronous. It runs inside the director window on the reply path,
  so it gets a cost bound test: 24 messages of 8 KB each, well under 5 ms.
- **11:** Nothing is stored. The window is derived per read, and derived-record ranges are
  unchanged.
- **16:** No writes.
- **18:** Nothing is added to the manager, and `memoryCoordinator` (614/620) is not touched.

### T15 — speaker-aware evidence (D6: opt-in)

**Schema (rule 6).** `Quality.evidence_from?: "any" | "world"`, optional.
- `validate.ts` rejects it on a non-`extractor` quality, the way `read_as` is rejected (:84).
- Absent means `any`, which is today's behaviour.
- `world` means evidence from an `is_user` message cannot prove the value.
- Absent and explicit `"any"` behave the same. Only the diagnostic tells them apart (an explicit
  value means "the author decided").

**Check.** `evidence.ts` gains `evidenceSources(evidence, messages: {messageId, text,
isUser}[]) → messageId[]`: every message holding the whole span, under V14's unchanged rules.
- `evidenceInWindow` stays a wrapper, and `evidenceCorpus.test.ts` keeps its 136-quote replay.
- `screenDeltas`: a `world` quality needs at least one **non-player** source. Otherwise the delta is
  rejected with the new reason `evidence only in the player's line`.
- An accepted delta records `ParsedDelta.messageId`: the first non-player source for `world`,
  otherwise the first source. It is stored in the audit, which is additive.

**Prompt, kept consistent with the check (inv 4).** Only when a residual-scope quality is `world`:
- the transcript marks player lines `[i] Name (player): …`;
- that quality's line ends `Evidence must quote a line the player did not write.`;
- the flag goes into `hashContract`.

With no `world` quality the prompt is **byte-identical** to today, asserted over the 22 fixtures. No
golden changes, so none is re-recorded.

**Judge typed path** (`judge/extraction.ts`), so gates cannot diverge by path:
- `TypedWindowMessage` gains `isUser`.
- In `readTypedDeltas`, a `world` quality counts as `answered` only when its decoder names a
  non-player message. Otherwise it stays in the residual and the LLM read applies the same rule.
- `typedRead.ts:17` carries `messageId` into `ParsedDelta`.
- No question wording changes and no new `judge.uses.*` key is added, so no new Phase A (rule 4,
  inv 7). The calibration rows carry no `world` quality and replay unchanged.

**storyDiff (X14).** New row `quality-evidence-changed`, **compatible**: the rule applies from the next
read, and held values stay because a past write is never re-judged. It has a jest fixture, like
every row.

**Diagnostic.** `quality-outcome-player-evidence`, severity `info`. It fires when an extractor
`bool`/`enum` quality is a leaf of a gate on a transition **into an anchor** and `evidence_from` is
absent.
- `DIAGNOSTIC_CONSEQUENCES`: "A player's line alone can move the story here: writing that they did
  it counts as done."
- Explicit `any` silences it. It never blocks. Taking a key is legitimately the player's act, as in
  `extractor.transcript.json` index 4.

**Studio.** `QualityEditor.tsx` gets an "Evidence may come from: any line / only lines the player
did not write" select beside `QualityReadEditor` (:204). It is disabled for non-extractor qualities,
has a story, and an a11y play.

### Opt-in "player writes attempts" clause

**Schema (rule 6, X13).** `AgencyPolicy.player_attempts_only?: boolean`, and
`DEFAULT_AGENCY.player_attempts_only = false`, so absent means today's behaviour, per D6 and C4.
- It is **per checkpoint**, because `AgencyPolicy` already is (`schema.ts:155`, merged by
  `agencyFor`, `agency.ts:14`).
- An author who wants it story-wide sets it on each checkpoint. The Studio's `AgencyEditor` is where
  that happens.

**Clause.** When the field is true, `agencyClauses` (`agency.ts:31-35`) adds: "The player's message
states an attempt; decide its outcome from the world — it may fail." It then reaches the generation
prompts, the critic and the steering hint through the existing consumers.

**Always-on carrier (X13).** The steering hint appears only while drifting
(`pacingCoordinator.ts:99`), so the clause rides **plan 01's guidance block**.
- **Composition.** Plan 01's writer, `PacingCoordinator.updateSteering()`, composes the block as the
  guidance text, then the clause line when `agencyFor(active).player_attempts_only` is true. With no
  guidance and the clause on, the block holds only the clause.
- **Refresh (inv 16).** The block refreshes through plan 01's call sites.
- **Depth, role, withholding.** Plan 01 (X7) sets the depth and role, and drops the block on
  impersonate and foreign quiet generations. Plan 04 changes none of that.
- **Preview.** The next-turn preview shows the block, because it is in the registry.
- **Budget.** At most +3 lines in `pacingCoordinator` (103/620).

**Over-steer (decided).** The block is not one-turn, so rule 5 does not gate it. Plan 01 owns the
over-steer probe (X8) and "records, not gates" it for this block. The clause variant of the live
scenario records that probe's columns, and the Gate record states them.

**Diff and Studio (X14).**
- New storyDiff row `checkpoint-agency-changed`, compatible. It covers **every** `agency` field,
  because the v2.3 fields hot-swapped silently as "identical" too.
- No diagnostic: an opt-in that is off by default costs nothing.
- The Studio adds a checkbox in `AgencyEditor.tsx`, plus a story.

**Player surface.** None. This is model- and author-facing (inv 9), and `assert-player-clean` is
unchanged.

### Seed C — floor decision (recorded before any plan-04 run; accepted as X15)

- **`rejected`: re-read the fixtures.** Six of the seven misses expect the real model to reproduce a
  malformed line that the hand-written golden contains on purpose. That is a parser property jest
  already asserts (`extraction.test.ts:247`), not live behaviour.
  - Those six `rejected` arrays get `"scope": "golden"`.
  - `scripts/debug/lib/liveSuiteScore.mts` `scoreRejected` skips golden-scoped expectations. Jest
    still reads them.
  - The live tier then scores the 15 "nothing should be rejected" claims.
  - The **floor stays 0.9, not retuned**. The denominator changes for a stated semantic reason.
    Replayed on the v2.3 record this is 14/15 = 0.933, stated as a re-read of old data, not a new
    measurement.
- **`facts`: set from the measurement.** The expectation is legitimate: a transcript about a torch
  should yield a fact. The misses are the model emitting no FACT lines, the same cause as v2.3's
  J3.7.
  - Floor **0.68** = 15/22: the v2.3 measurement (16/22) minus one fixture for single-sample
    variance.
  - This is a **non-regression floor, not a quality target**. 0.85 stays the target, and only a
    prompt change with its own measurement can raise the floor.
- **`deltas`:** `--min 0.9`, unchanged.

## Order of work

1. **Preconditions.**
   - Plans 01 and 03 have landed. That includes plan 01's guidance block and `host-facts.md`.
   - Add rows `04-H1`…`04-H10` to `host-facts.md`, with the 1.18.0 check.
   - Read V25's final state in `scheduler.ts`.
   - Re-verify every row of §Verified on the tree being built.
   - Confirm plan 01's T20 rows for T7 exist (visible `/sd` post, Stepped Thinking post, CYOA post,
     HTML-tracker reply) and are red. If absent, write them first, red (rule 2).
2. **Seed C harness.** Add the golden scope to the 6 fixtures, change `scoreRejected`, add its node
   test.
3. **Live suite run A** on the post-03 tree, before any plan-04 source change. This is the baseline
   at the declared floors.
4. **T7.** `windowHygiene.ts` plus jest; `readMessage`/`isUser`; `lastSpokenText`; `readReply`;
   `fixtureRun`; `windowForm`; evidence corpus replay through the cleaner; the T20 rows go green.
5. **T15.** `evidenceSources`; screen, prompt and hash; judge path; schema, validate, storyDiff,
   diagnostic, Studio.
6. **Attempts clause.** Schema, `agencyClauses`, guidance block, storyDiff row, AgencyEditor.
7. **Stretch:** regex parity, only under §Design's build rule.
8. **Gates** (below), live suite run B, Gate record.

## Tests and gates

**Jest.**
- **Cleaner, one case per rule,** plus a hostile corpus: nested `<details open>`, a `display:none`
  div, ```` ```sim ```` JSON, an unclosed tag, entity soup, an author card with narrative `<i>`.
- **Host shapes, built from the source files in §Host facts:** `/sd` visible post vs the
  per-message image button; `/sys` narrator kept; `/comment` dropped; ST-3.2.0 thought post; CYOA
  post.
- **Identity on the 22 fixture transcripts,** so their prompts are unchanged.
- **Mutant pair:** cleaning only the rendering, or only the check, must fail the "same text" case.
- **Evidence:** `evidenceSources` in single, multi and player-plus-narrator variants. The evidence
  corpus replay through the cleaner must show 136 quotes, 0 newly rejected, each named if not.
- **Screen and judge:** `world` accepts a narrator source and rejects a player-only source. The
  byte-identical-prompt control covers every no-`world` story. On the judge side, a `world` quality
  with a player message is not `answered`.
- **Schema:** `validate` rejects `evidence_from` on a code quality. There is a storyDiff fixture per
  new row. The `DIAGNOSTIC_CONSEQUENCES` guard runs as it does today.
- **Mutation file:** `test/findings/mutations/V04-extraction-input.txt`. Each check must be deleted
  once and fail its own case. This covers the speaker branch, `/sd` rule, marker rule, `windowForm`
  hash and judge `answered` reorder.

**Goldens.** No golden is re-recorded. The 22 prompts are byte-identical, asserted. Any re-record
needs a written reason in the Gate record.

**Machine gates** (tier: runtime + ST-facing + release):
- `npm run typecheck && npm run typecheck:test && npm run lint && npm test && npm run build && npm run test:release && npm run test:debug && npm run test-storybook:ci`.
- `test:release` is required because the capability list in `dist/manifest.json` changes if the
  regex seam lands.
- Run `st-session.mts reload` after every build.

**Live (real model, headed, no `debugResponse`)** — the backend is brought up per playbook §0:
- `so-run-header capture` before the batch and `diff` after it.
- **Live suite run A and run B:**
  `so-live-suite run --min 0.9 --min-tier facts=0.68,rejected=0.9 --expect-count 22`. The floor
  decision is the one recorded above. Run B must also meet it.
  - The 22 do not exercise T7 or T15 (no markup, no `is_user`), so this is a **non-regression
    check** with the play prompt path unchanged.
  - Evidence for T7 and T15 comes from the scenarios below.
- **`live-v04-window-hygiene.json` ×2:** a group sandbox chat with, in order:
  - a visible `/sd` post (sd `command_visible` on, restored after);
  - a `/sendas` reply carrying a `display:none` tracker block that names a gate value;
  - a real turn.

  Assert that the audit prompt excludes both, that `windowForm` is recorded, and that no delta cites
  the tracker text.
- **`live-v04-player-evidence.json` ×2 plus a control ×2:**
  - A story with an anchor-gating `world` quality.
  - The player sends "I grab the Sun Idol".
  - Real extraction runs. Expect the audit to reject the delta for `evidence only in the player's
    line`, or the model not to propose it. Record which happened, since a single sample is
    nondeterministic.
  - A narrator confirmation follows, and the delta lands with `messageId` on the narrator line.
  - Control: the same story with `evidence_from` absent. It must reproduce today's behaviour.
  - The attempts clause is on in the variant. A captured request (`st-payload`) must show it in the
    guidance block. Plan 01's over-steer probe columns are recorded, not gated (X8).
- **J3 ×2 `--strict`,** consecutive and first-attempt reported.
- **Records** go under `test/journeys/records/v2.4-plan04/`: suite reports A and B, scenario logs,
  the J3 matrices, and the run-header start and diff.

## Risks

- **Dropping `<details>` or a tagged fence removes real content.** Some cards write letters or
  lore in them. The fixtures pin the rule, and `windowForm` makes it auditable. An open question is
  below.
- **`world` lowers recall.** The model will still cite the player line, which is why the prompt
  says so. The live scenario measures it, one sample per run.
- **The diagnostic can be wrong.** Its heuristic cannot tell attempt from outcome, so its severity
  is `info`, explicit `any` silences it, and it never blocks.
- **Regex parity can blind the reader.** A user `promptOnly` script with `maxDepth` hides older
  messages, and a 24-message window reaches past it. That is why the setting defaults off and the
  audit records the form.
- **The warden now reads cleaned text,** and its edit check (`:407`) cannot see a markup-only edit.
  The verdict cannot change on text it does not read. Warden calibration replays its own fixture
  text, so no recalibration is owed.
- **Concurrent sessions.** V25 and the other session's uncommitted `stHost`/`scheduler` edits can
  move every line here. Step 1 re-verifies them.
- **Token counts shift under plan 03's chunker.** Plan 03's T9 chunker packs windows by the token
  count of `getChatWindow` text. After T7 that text is shorter, so windows hold more messages.
  - The chunker is bound by tokens, so this is intended.
  - Plan 03's chunker tests run on raw fixtures and stay valid.
  - Plan 04's live runs record window spans in the audit, so the shift is visible.
- **Budget.** `memoryCoordinator` is at 614/620. If any change drifts into it, stop and extract.

## Unresolved questions

None of plan 04's own questions remain; the five from the first draft are decided above.

| Question | Decision | Where |
|---|---|---|
| Attempts-clause scope | Per checkpoint (X13) | §Design, attempts clause |
| `<details open>` / untagged fences | Drop all `<details>`; unwrap untagged fences | §Design, T7 |
| Over-steer probe for the clause | Recorded through plan 01's probe, not gated (X8) | §Design, attempts clause |
| Play-path screen in the live suite | No (X15) | §Scope |
| FACT/MEMORY evidence | v2.5 seed | §Scope |

The user still owns one item, and it is not plan 04's to decide: **D6's revisit after a player
session.** The defaults to revisit are `evidence_from` absent = `any`, and the attempts clause off.

## Gate record

_Placeholder — to be written when the plan's gates run: date, exact commands and exit codes, the
suite A/B reports and floor outcome, scenario and journey runs ×2, run-header diff, mutations,
deviations, and whether regex parity was built._

### Build (worktree, 2026-09-24/25)

Built on master `4151bc8` in an agent worktree (branch `worktree-agent-aa52c2ae9a6cab5e4`). Machine gates and Storybook
only: **no backend and no browser, so no live gate ran and none is claimed green.** Master moved to `c7f3248` (plan 07
part 1) during the build; the only file both touch is `host-facts.md` (both append a section).

**Preconditions (step 1).**
- Rule 1 re-verification on `4151bc8`. The §Verified table holds except these line drifts:
  - `readReply` is `stagecraftCoordinator.ts:63`, not `:58`.
  - `screenDeltas` is `sharedRead.ts:45`, moved by plan 03's tail-fit.
  - `answered.push` is `judge/extraction.ts:160`.
  - V25 landed as `CADENCE_WINDOW_MAX = 24` at `scheduler.ts:81`.
  - The manager is 661 raw lines (737/740 effective per plan 03), not 677/700.
- Host facts `04-H1`…`04-H10` were re-read on 1.19.0 by absolute path and written to `host-facts.md` §Plan 04.
  - H7 is sharper than the plan's row: the button sets `inline_image = !(media.length && !inline_image)`
    (`stable-diffusion/index.js:5227`), so an `/sd` post keeps `false`.
  - **The 1.18.0 check was not done.** The worktree is refused `git` against the ST checkout, the same limit plan 02 hit.
    H1/H2/H5/H6 on `51ad27fb` are owed.
- **Plan 01 wrote no T20 rows for T7**, so this plan wrote them: `test/scenarios/v24-04-window-hygiene.json`.
  - It needs no backend. It posts a visible `/sd` post, a Stepped Thinking 3.2.0 thought, a CYOA post and an HTML-tracker
    reply in the host's own shapes, runs one mocked read, and asserts on the audited prompt and `windowForm`.
  - It is red on master by construction. It has not been run: there is no browser.

**Seed C (step 2).**
- The six golden-only `rejected` expectations (`extractor2/3/4/11/12/15`) carry `"scope": "golden"` per entry.
- `scoreRejected` scores only live-scoped entries. A wholly golden expectation is `scored:false`.
- Jest still reads the reasons.
- The node test replays the v2.3 record and gets **14/15 = 0.933 at the unchanged 0.9 floor**. This is a re-read of old
  data, not a new measurement.
- `DEFAULT_TIER_FLOORS.facts` stays 0.85, the target. The run-A/B command passes `facts=0.68` explicitly.

**Live suite run A (step 3): NOT RUN** (no backend).
- The 22 prompts are byte-identical after this plan, which jest asserts, so run A on the merged tree measures the same
  prompt path.

**T7 as built.**
- `src/extraction/windowHygiene.ts` is pure and synchronous. `cleanWindowMessage(raw) → {keep:false, reason} |
  {keep:true, text, isUser, speaker}` applies these rules in order:
  1. hidden and in-flight messages;
  2. ST system types other than `narrator`;
  3. the `/sd` shape: `!is_user`, `inline_image === false`, `media[0].source === 'generated'`, numeric `generation_type`;
  4. empty after cleaning;
  5. the Stepped Thinking marker, then the CYOA marker.
- `cleanMessageText` does the following, in order:
  - strips leading reasoning with `stripReasoningBlocks`;
  - removes HTML comments;
  - drops `<details>` (open or closed), `script`, `style`, `template` and inline `display:none` elements, nested content
    included, in one pass;
  - drops tagged fences and unwraps untagged ones;
  - removes the remaining tags (block tags become a newline);
  - decodes entities once;
  - collapses whitespace.
- `HYGIENE_VERSION = 1`, and `CLEANED_FORM = {hygiene: 1, promptRegex: false}`.
- Readers:
  - `getChatWindow` / `getLastMessageText` go through the cleaner. `getChatWindow` now cleans only `[from, to]`, not the
    whole chat.
  - `ChatMessageWindowEntry.isUser` is new, and `SharedReadWindow.form` is optional.
  - `lastSpokenText` was removed; `buildScoreContext` calls `getLastMessageText()`, so it also skips in-flight messages.
  - `stagecraftCoordinator.readReply` uses the cleaner (+1 import line).
  - `buildFixtureRun` cleans each transcript entry.
  - The cue scan, talk director, reconcile and every pass inherit the cleaner through `getChatWindow`.
- Audit and hash:
  - `SharedReadAudit.windowForm` is additive, with no blob bump.
  - `hashContract` includes `windowForm` when the window states one, so live contract hashes change once.
  - `fitReadWindow` carries the form through a tail-fit.
- The evidence corpus replay through the cleaner covers **136 quotes, 0 newly rejected**, and all 22 fixture transcripts
  are identity.
- Cost bound: 24 × 8 KB messages clean in about 2.0 ms here. The test asserts the minimum of 20 runs is under 5 ms.

**T15 as built (D6 opt-in).**
- `Quality.evidence_from?: "any" | "world"` (`EVIDENCE_FROM`).
  - `validate` rejects an unknown value and any value on a non-extractor quality.
  - An explicit `any` is kept, so the diagnostic can tell it apart from absent.
- `evidenceSources(evidence, {messageId, text, isUser}[]) → messageId[]` uses V14's unchanged span rule.
  `evidenceInWindow` is now its wrapper.
- `screenDeltas` takes the residual `ScopedQuality[]`.
  - A `world` quality with no non-player source is rejected as `evidence only in the player's line`
    (`PLAYER_ONLY_EVIDENCE`).
  - Every accepted delta records `ParsedDelta.messageId`: the first non-player source for `world`, otherwise the first
    source.
- Prompt: only when a residual quality is `world`, player lines read `[i] Name (player): …` and that quality's line ends
  with `Evidence must quote a line the player did not write.`
  - `hashContract` gains `playerLines: true`.
  - With no `world` quality the prompt is byte-identical, asserted over all 22 fixtures.
- Judge typed path:
  - `TypedWindowMessage.isUser` is new.
  - `readTypedDeltas` resolves the message before `answered`, so a `world` quality is answered only when its decoder names
    a non-player message.
  - `typedRead` carries `isUser` in and `messageId` out.
- `storyDiff` gains `quality-evidence-changed`, which is compatible and keeps held values.
- The diagnostic `quality-outcome-player-evidence` is `info`.
  - It fires once per extractor bool/enum quality that is a leaf (any operator, `not` included) of a gate into an anchor,
    when `evidence_from` is absent.
  - It has a consequence line.
- Studio: an "Evidence may come from" select in `QualityEditor` offers "Any line (default)" / "Any line (decided)" /
  "Only lines the player did not write". It is disabled for code qualities, and switching to code clears the value.
  Story `EvidenceFromWorld`.

**Attempts clause as built (X13).**
- `AgencyPolicy.player_attempts_only?`, with `DEFAULT_AGENCY.player_attempts_only = false`. `validate` reads it.
- `PLAYER_ATTEMPTS_CLAUSE` joins `agencyClauses`. `composeGuidanceBlock` appends it after the guidance, or carries it
  alone.
- `pacingCoordinator` changed by **0 lines**: its writer already passes the policy.
- `storyDiff` gains `checkpoint-agency-changed`, which is compatible and covers every agency field.
- `AgencyEditor` gains a checkbox, with story `OptsIntoPlayerAttempts`.

**Regex parity (step 7): NOT BUILT.** Its build rule needs a planted-tracker live run that shows residue, and none ran.

**Red first.**
- Against a stub carrying today's `readMessage` behaviour: `windowHygiene.test` failed 13 of 42 (the controls and the
  22-fixture identity cases passed), and `windowHygieneWiring.review` failed 5 of 6.
- `diagnostics.test` failed 2 cases before the code. The clause cases failed 2 (`agency.test`, `guidance.test`).
- The T15 screen, prompt and judge cases, the `storyDiff` rows, the typed-read, tail-fit and warden cases were written with
  or after their code. Their red is evidenced by the mutants below, not by a first run.

**Mutations** (`test/findings/mutations/v24-04-extraction-input.txt`): **47/47 killed** (40 jest, 4 node:test,
3 Storybook), 0 survived.
- The plan-table rows are the speaker branch (P1), the `/sd` rule (H3), the marker rules (H4/H5), the `windowForm` hash
  (H12) and the judge `answered` reorder (P7).
- The "clean only the rendering / only the check" pair is H1/H2. Both are killed by the same-text case.
- Two sweeps found gaps, both fixed before the final sweep:
  - The cost bound flaked under a loaded parallel run. The cleaner was made one-pass, and the bound takes the minimum of
    20 runs.
  - H1 was not killed by the same-text case: a tracker glued to a word escaped the raw check by word boundary. The
    fixture is now spaced.

**Guards.**
- Census and fault matrix are unchanged: 70/10/20/0 of 100. No new write-after-await site.
- The architecture guard is green.
- Budgets:
  - manager 0 lines;
  - `memoryCoordinator` +0 (`isUser` added on the existing line);
  - `stagecraftCoordinator` +1;
  - `extractionCoordinator` and `pacingCoordinator` 0.

**Gates** (worktree root, `node_modules` junctioned to the main checkout's)

| Gate | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run typecheck:test` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run debug:typecheck` | exit 0 |
| `npm test` | 219/219 suites, 3297/3297 tests; fault matrix 70/10/20/0 of 100; findings ledger 2 open / 48 settled |
| `npm run test:debug` | 231 tests: 230 pass, 1 skipped, 0 fail |
| `npm run build` | compiled, 2 webpack size warnings; manifest `bundle 421bb9f346c4`, `ST unknown` (worktree path) |
| Storybook (`storybook:build`, `http-server .sb-static -p 6344`, `test-storybook --index-json --url http://127.0.0.1:6344`) | 32 suites, 206/206 (+2: `EvidenceFromWorld`, `OptsIntoPlayerAttempts`); server killed afterwards |

Not run: `test:release`, because it rewrites `dist/manifest.json`. The capability list is unchanged, since the regex seam
was not built.

**Live fixtures written, not run.** The evals are syntax-checked (`new Function`) and `validateFixture` + the
globals-read guard pass. Every run is `so-scenario run <file> --sandbox --group 1759606632088`, ×2.
- `test/scenarios/v24-04-window-hygiene.json` is the T20 row, no backend.
- `test/scenarios/live-v24-04-window-hygiene.json` takes a host-shaped `/sd` post, a `/sendas` reply with a
  `display:none` tracker naming `idol_taken`/`door_open`, and a real turn. For every read covering the tracker it asserts:
  - no foreign text in the prompt;
  - the visible half kept;
  - `windowForm` stated;
  - no delta citing the tracker.
- `test/scenarios/live-v24-04-player-evidence.json` uses a `world` quality gating an anchor, with the attempts clause on.
  After the player's "I grab the Sun Idol":
  - every covering read marks player lines and states the rule;
  - `idol_taken` is never accepted on the player line;
  - which of refused / accepted-on-reply / not-proposed happened is recorded;
  - every normal request on the checkpoint carries the clause (`GENERATE_AFTER_DATA`);
  - the over-steer columns are recorded with `record:true`;
  - after a narrator confirmation, `idol_taken` lands with a non-player `messageId` (`onNarrator` recorded).
- `test/scenarios/live-v24-04-player-evidence-control.json` is the control arm. It asserts no mark, no rule, no player-line
  refusal and no clause, and records whether the player line was accepted.
- Stories: `live-v24-04.story.json` and `live-v24-04-control.story.json`. Jest validates both.

**Deviations**
- The mutation file is `v24-04-extraction-input.txt`, per the build instruction, not `V04-extraction-input.txt`.
- **The stall judge follows `world` too.** The plan named only the LLM and typed paths.
  - `StallLeaf.world` is set by `planReconciliation`, and `stallDirectValue` never writes a `world` leaf directly.
  - A confident yes becomes today's LLM reconcile re-read, which screens. Otherwise gates would diverge by path, the
    plan's own reason.
- **`expect.overSteer` gained `record: true`.** It reports the same columns and never fails. The existing verb gated on
  restate, and X8 says the guidance block is recorded, not gated.
- **The example story's diagnostics test** now allows exactly the five D6 `info` suggestions, by quality key, and nothing
  else.
  - The shipped example was left untouched. Adding `evidence_from` would move its content hash and every pinned chat's
    drift reading.
  - The choice of value is D6's, to revisit after the player session.
- The seeded diagnostics story sets `route.evidence_from: "any"`, so every code still fires exactly once.
- The live window-hygiene fixture posts the `/sd` row by eval in the host's shape, rather than through a real `/sd` with
  `command_visible` on: no image backend is assumed on a lane.
- `cleanWindowMessage` takes no `index` parameter, because it did not need one.
- `transcriptPrefixCost` counts ` (player)` on every player line, even when unmarked. The budget is conservative by a few
  tokens.

**Decisions made here (small, on evidence)**
- **Whitespace:** horizontal runs collapse and lines are trimmed, but paragraph breaks survive (at most one blank line).
  Real replies keep their structure, and the 22 fixtures are identity.
- **Unclosed elements:** an unclosed dropped element (`<details>`, `display:none`, script, style, template) or tagged
  fence drops to the end of the message. An unclosed ordinary tag just loses the tag.
- **Tag boundaries:** a removed element leaves a newline, and block tags become newlines, so words never glue across a tag.
- **Diff rows:** the `storyDiff` evidence row compares the raw values, so absent → `any` is a compatible row. It records an
  explicit author decision, and behaviour is the same.
- **Studio select:** it offers three options, because an explicit `any` must be settable to silence the diagnostic.

**NOT run / NOT green**
- Live suite runs A and B (`so-live-suite run --min 0.9 --min-tier facts=0.68,rejected=0.9 --expect-count 22`).
- The four fixtures above, ×2 each.
- J3 ×2 `--strict`.
- The run-header capture and diff.
- The 1.18.0 host-fact check.
- Records are owed under `test/journeys/records/v2.4-plan04/`.


### Live gates (2026-09-25, bundle 9b2f890a5987)

Main checkout on `e4d69db`, bundle `9b2f890a5987` (`dist/manifest.json`, not rebuilt). Lanes 1 and 2 only, group
`1759606632088`, profile `Artemis RunPod RP` (Artemis 31B over the main session's tunnel), real extraction, no
`debugResponse`. Before every batch: `st-session reload`, `open-group`, `/profile`, and the served `dist/index.js`
sha256 checked against `bundle.sha256` (match every time). Records:
`test/journeys/records/v2.4-plan04/live-9b2f890a5987/`.

The session was cut off once (API spend limit) and the pod idle-stopped while it was down. Every run below completed
before the cut or after the restart; none spans it, and no run was cut mid-way. No sandbox chat, story or mirror book of
this session was left on either lane (group chat counts 60 / 55 before and after; library holds none of `live-v24-04*`).

**Lane 1 judge config.** Lane 1 held residue from an earlier session: `judge.enabled: true` with `director`,
`sceneTrigger`, `sceneTracker` on. It was switched to all-off (the real install's value) at about 02:52Z with
`writeJudgeConfig` and read back, BEFORE the pre-run header and before any run here. Every archived run on lane 1 (the
four scenarios ×2 and J3 ×2) therefore ran with the judge off and no use on; both J3 records show `judgeCalls.count: 0`.

| Gate | Result | Record |
|---|---|---|
| `v24-04-window-hygiene.json` ×2 (T20 rows, no backend) | **green ×2**: ids 2-5 posted, window 0..5, `windowForm {hygiene:1, promptRegex:false}`, `leaked: []`, the narration and the visible reply kept | `v24-04-window-hygiene-run{1,2}.log` |
| `live-v24-04-window-hygiene.json` ×2 | **green ×2** | `live-v24-04-window-hygiene-run{1,2}.log` |
| `live-v24-04-player-evidence.json` ×2 | **green ×2** | `live-v24-04-player-evidence-run{1,2}.log` |
| `live-v24-04-player-evidence-control.json` ×2 | **green ×2** | `live-v24-04-player-evidence-control-run{1,2}.log` |
| J3 `--strict` ×2, consecutive | **green ×2**: 8/8 pass, cleanup clean, first try 8 of 8 both runs | `J3-run{1,2}.log`, `J3-run{1,2}.journey.json`, `batch-J3.json` |
| Live suite run A | **ok**: deltas 22/22 = 1.0 (floor 0.9), facts 16/22 = 0.727 (floor 0.68), rejected 14/15 = 0.933 (floor 0.9), 22 of 22 ran, none incomplete | `so-live-suite-report-A.json`, `so-live-suite-A.log` |
| Live suite run B | **ok**: deltas 22/22 = 1.0, facts 16/22 = 0.727, rejected 15/15 = 1.0, 22 of 22 ran | `so-live-suite-report-B.json`, `so-live-suite-B.log` |
| Run header, lane 1 | `diff` vs `run-header-pre-lane1.json`: **0 differences** | `run-header-diff-lane1.log` |
| Run header, lane 2 (live suite) | `diff` vs `run-header-pre-lane2.json`: **0 differences** | `run-header-diff-lane2.log` |

Scenario summary: `batch-scenarios.json` (8 of 8 exit 0).

**Live window hygiene.** In both runs the one read covering the tracker reply was the cadence read over window 2..3
(`/sd` post id 2, tracker reply id 3). Neither `V2404SD` nor `V2404TRACKER` reached its prompt, the visible half
("Luke keeps his hands at his sides…") did, and it states `windowForm {hygiene:1, promptRegex:false}`. It accepted
nothing and rejected nothing, and `idol_taken` stayed `false`, although the hidden tracker claimed `true`.

**Player evidence (variant, `evidence_from: world`, attempts clause on).**

| | run 1 | run 2 |
|---|---|---|
| after "I grab the Sun Idol" | **not proposed** (player lines marked 1, rule stated 1) | **not proposed** (marked 1, ruled 1) |
| normal requests on the checkpoint carrying the clause | 3 of 3 | 1 of 1 |
| over-steer (recorded, not gated) | block 190 chars, restate span 1 of 6, no meta hit, swing n/a | block 190 chars, span 3 of 6, no meta hit |
| `idol_taken` landed on | member reply id 4 ("the weight of the idol in Max's hands"), BEFORE the scripted narrator line (id 5): `onNarrator: false` | the scripted narrator line id 3: `onNarrator: true` |

Both land on a non-player message, which is what the fixture asserts. In run 1 a group member's reply narrated the grab
succeeding, and the read took the delta from that reply. That is the world confirming the outcome, which the clause
allows. One sample per run, so it is recorded, not scored.

**Control (`evidence_from` absent, clause off), both runs.** The delta was accepted on the player's own line
(`messageId 1`, evidence "I grab the Sun Idol from the altar."). No mark, no rule, and no clause in any request (2 and 1
requests). Today's behaviour is reproduced.

**Live suite.** Both runs miss the same six facts fixtures, each reading "got 0" FACT lines (`extractor`, `2`, `3`, `4`,
`5`, `15`). That is the v2.3 cause, at the same 16/22 as the v2.3 record. Run A's one `rejected` miss is `extractor20`
("invalid scene break line"), the real rejection the Seed C note predicted; run B had none. The floors were predeclared
and were not touched. Epistemic, ledger and arcs ran at their default floors, and no fixture scores them.

**Regex parity (step 7): NOT BUILT, on evidence.** Its build rule needs a planted-tracker live run showing something
the cleaner leaves behind. In both `live-v24-04-window-hygiene` runs, the covering prompt carried no tracker or `/sd`
needle and kept the visible text, so there was nothing to build for.

**Host facts.** 04-H1, H2, H5 and H6 checked on 1.18.0 (`51ad27fb`); all hold (`host-facts.md` §Plan 04, "1.18.0 check").

**Not done here:** `test:release` (no rebuild), Storybook (no source change). D6's revisit after a player session stays
with the user.
