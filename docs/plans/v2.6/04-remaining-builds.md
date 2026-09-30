# Plan 04 — Remaining builds

**Status: DRAFT 2026-09-30, awaiting user approval.** Each item keeps its source plan's conditions, and nothing is
built before its measurement where the source plan requires one.

## Items

| # | Item | Source | State | Blocked on | Effort |
|---|---|---|---|---|---|
| H | **Harness routing: build H1–H4 + Phase A** | v2.5 plan 13 | Phase 0 only (opencode PASS P0-2/P0-3/H-N1; P0-7 FAIL on hosts; P0-4/P0-5 unresolved; Claude/Codex NOT RUN) | user: `claude`/`codex` login refresh; B1–B5 (Q8/Q9/Q1–Q3) | L |
| L7 | Lore contradiction: runtime + R4–R6 | v2.5 plan 08 | Phase A only | v2.6 02 D7 data | L |
| J3 | House rules: judge-on arm ×2; J6a player intent (B8 order) | v2.5 plan 06 | on arm failed 4/4 (timeouts); J6a not started | `f972e24d` proven (v2.6 01); B7, B8, B9 | M |
| C1r | NPC reply residual: a non-streaming reply or late headers land in the switched-to chat | v2.5 plan 02 | **built 2026-09-30**: fixture showed both landing (2/4 red), `watchHostChatMove` stop added (§C1r) | live re-run owed to plan 10 | M |
| C3/C4 | `requirements.ready` suppresses every effect (C3); `/cp activate` applies only the target's effects, and SP5's C4 pass rule vs shared genre text (C4) | v2.5 plan 14 | **design written** (§Design calls), not built | user review | M |
| C12/C13 | onEnter replies bury the gating reply (caps SP1/SP2); guidance secrets reach every drafted member | lab findings | **design written** (§Design calls), not built | user review | M |
| A4/A5 | CC `promptManager` buckets; the "which route answered" routed half | v2.5 plan 07 | A4 never run; A5 waits on H4 | H | M |
| A1 | Per-message inspector: the author-view click-through from a timeline chip (overview W18) | v2.5 plan 07 | **done by plan 08** (evidence §A1) | — | — |
| S | **Sprite / VN stage**: plan doc, gates, a settings home, capability probe | uncommitted work | **built 2026-09-30** (§S): U1 activation, `sprites` probe, panel view + stories | live owed to plan 10 | M |
| B17 | `loreExclusive` author-only; wizard keeps `exclusive` | v2.5 plan 08 | **fixed 2026-09-30** (§B17) | — | S |
| G | Group→story binding UI | plan 17 | **built 2026-09-30** (§G) | live owed to plan 10 | S |
| T4 | React 19 types, eslint 9, `npm audit` | v2.5 plan 03 | blocked on shared `node_modules` | A6 | M |
| SP7.b | Chance gates into prod, first of the `.b` builds (overview W17) | v2.6 03 | — | SP7 D4/D4b | S |
| SP*.b | Every other spike whose Adolion worth review says include | v2.6 03 | — | v2.6 03 | per spike |
| TL | Inline timeline | v2.6 08 | own plan | — | — |

## Order

1. S, B17 and G: small, and needed before v2.6 09 exercises them.
2. J3 and C1r, once v2.6 01 has proven their prerequisite fixes.
3. H in parallel as soon as the logins are refreshed. Phase A is long lane time, so batch it with v2.6 01's batch B.
4. L7 after v2.6 02's data; A1 after 08's composer.
5. The `.b` builds as v2.6 03 emits them.

## Gate

Each item gets its source plan's code gate, plus ×1 live here. Its ×2 is in plan 10.

## Resolved 2026-09-30 (review)

| Question | Answer | Why |
|---|---|---|
| Who designs C3/C4/C12/C13? | **The build agent writes a design section in this plan**: options, evidence and a recommendation. The user reviews it in the file-by-file pass. Nothing is built before that review. | The user owns the design calls, but a blank question costs them more than reviewing a concrete proposal. |
| One surface or two for "what happened at this message"? | **Two surfaces over one data source** (overview W18). The timeline is the in-chat view; A1 is its author-view click-through. | User. |

## S — Sprite / VN stage

**What it is (committed at step 0, `83b8c2bf`).** A visual-novel stage that shows the chat's cast as sprites and changes
their expression as a reply streams. Code: `src/sprites/` (pure: `segment.ts`, `classify.ts`, `profile.ts`,
`direction.ts`, `settings.ts`; host-facing: `stage.ts`, `VnStage.tsx`, `start.tsx`, `SpriteGroup.tsx`), the host seam
`stHost/sprites.ts`, the `global.d.ts` dev handle `storyOrchestratorSprites`, and the judge use `expressions`.

- A member is on stage when its card carries `data.extensions.so_sprites` (labels, fallbacks, default, `local_map`) and
  its sprite folder lists at least the default label (`/api/sprites/get`, `src/endpoints/sprites.js:118`).
- Expressions per passage: the judge (`judge.uses.expressions`), else the sprite model (`sprites.profileId`, else the
  image director's profile), else ST's local classifier (`/api/extra/classify`). Reads are stored on the message
  (`extra.so_expr`), so a reload, swipe or delete replays them instead of classifying again.
- A checkpoint may direct the stage with `effects.stage` (`framing`, `spotlight`, per-member `face` / `set` / `hidden`),
  read by `readStageDirection`. That is how a story "configures sprites": Adolion's nine stories direct a stage at
  their checkpoints.
- It shows only with ST's VN mode (`body.waifuMode`) unless `stage: "always"`, and never while ST's own Character
  Expressions extension is mounted (`#expression-wrapper`). `sprites/stage.ts` is on the architecture guard's pinned
  list of message-DOM touchers (it reads a clicked `.mes_text` to replay that passage's face).

**Settings home.** Install-wide, `extensionSettings["story-orchestrator"].settings.sprites` (`settingsModel.ts`), edited
in the settings panel under **General setup → Sprite stage** (`#so-sprite-settings`, lazy chunk). v2.6 splits the
panel into `SpriteSettingsView` (presentational, Storybook) and `SpriteGroup` (the host wrapper).

**W11 U1, as built.** The switch is off by default, and a story that directs a stage turns sprites on for its chats
unless the user switched them off.
- `SpriteSettings` gained `explicit`. `enabled` counts only when `explicit` is true: `{enabled: true}` without
  `explicit` (the old default, still stored on installs from before) reads as unset.
- `spriteActivation(settings, storyDirectsStage(story))` → `user-on | user-off | story | off`; `spritesActive` is
  true for `user-on` and `story`. The stage's visibility and its classification both read it.
- The checkbox shows the effective state for this chat. Ticking or unticking is a user choice (`explicit: true`);
  **Let each story decide** (`#so-sprite-story-decides`) clears it. `#so-sprite-activation[data-activation]` says why.
- `adolion-fresh` switches sprites off in a lane with `{enabled: false, explicit: true}`, because an unmarked
  `enabled: false` is now "unset", which an Adolion story would turn on.

**Capability probe.** `sprites` in `stHost/capabilities.ts`: `GET /api/sprites/get?name=so-capability-probe` (the route
answers an unknown folder with `[]`); 404/405 = `absent` (cached), another non-2xx = `error` (retried). The stage reads
it at every reload: `absent` puts nobody on stage, and the panel disables the switch and names the missing route
(`#so-sprite-capability`). The release manifest lists it with the other capabilities.

| Task | Gate |
|---|---|
| U1 default + story activation | `sprites.test.ts` "W11 U1" ×2 (mutant: default `enabled: true` fails; `spriteActivation` ignoring `explicit` fails) |
| Probe | `capabilities.test.ts` "v2.6 plan 04 S" (404 absent, 500 error then present on refresh) |
| Panel | Storybook `Settings/SpriteSettingsView`: `OffByDefault`, `StoryTurnsItOn`, `UserSwitchedOffWinsOverTheStory`, `RouteAbsent` |
| Lane safety | `adolionFresh.test.mts` (the strip writes `explicit: true`) |
| Live | owed to plan 10's final suite: Adolion chat in VN mode shows the cast with the install switch untouched; unticking hides it in every chat |

## B17 — `loreExclusive` author-only; the wizard keeps `exclusive`

- The switch was already author-only (`AUTHOR_JUDGE_USES`), but its readiness concern still named it in the player's
  panel, and it is on by default since v2.6 and unmeasured (`unproven`). `JudgeSettingsGroup` now drops author-only
  rows from readiness (concerns and the measured summary) outside Author view. Storybook
  `ExclusiveLoreIsAuthorOnly` + `AuthorSeesExclusiveLoreReadiness`.
- A wizard `setLoreSelect` op cannot state `exclusive` or `min_p` (`copilot/parseOps.ts`), so applying it dropped the
  author's flag. `applyOp` now keeps the draft's `exclusive` and `min_p` when the op leaves them out
  (`keepAuthorLoreFlags`, `copilot/proposal.ts`). Jest `proposal.test.ts` "B17" (mutant: the old call fails it). The
  agentic wizard's `setLoreSelect` tool goes through the same `applyOp`.

## G — Group → story binding UI

`extensionSettings["story-orchestrator"].groupStories` (v2.5 plan 17) had no editor. The settings panel's **This chat**
section now shows, in a group chat only, **New chats in <group> start with** (`#so-group-story-select`, lazy chunk
`GroupStoryBinding`): the library's stories plus "No story". A binding to a story no longer in the library is named, not
hidden. Pure helpers in `runtime/groupStoryBinding.ts` (`readGroupStories`, `bindGroupStory`, `heldGroupBinding`); the
write (`runtime/groupStoryBindingHost.ts`) goes through the settings-write evidence (`createSettingsWriteEvidence`),
so the panel says `Saved.` only when the server holds the binding, and says why otherwise.

| Task | Gate |
|---|---|
| bind / rebind / clear, one group only; server read-back | `groupStoryBinding.test.ts` "v2.6 plan 04 G" ×2 |
| panel | Storybook `Settings/GroupStoryBindingView`: `BindAStory`, `ClearABinding`, `StaleBindingIsNamed`, `UnconfirmedSaveSaysWhy` |
| live | owed to plan 10: bind a group, `/newchat`, the story is selected; clear it, the next new chat has none |

## A1 — Per-message inspector: done by plan 08

W18 made A1 the timeline's author-view click-through, and plan 08 built it: `runtime/messageInspector.ts`,
`components/drawer/MessageInspector.tsx` (`#so-inspector`), opened by the chip's inspect button (author only; player
mode renders no button, Storybook `Inline/InlineStrip` `PlayerStoryLevel`). v2.5 A1's contract was "the panel lists the
audit, the delta and the talk decision for that message; player mode: no button". The inspector reads the full
`byMessage` view (all levels), so the L4 raw audit is included. `inlineTimeline.test.ts` inspector case now asserts the
gate (`progress:gate`) and talk decision (`cast:talk`) at the reply, the accepted delta at its evidence message
(`memory:delta`) and the audit at its window end (`memory:raw`, `calls:read`); mutant "inspector drops L4 items"
fails it. The v2.5 message-action button (`.extraMesButtons`) is not needed and not built: the inline chip is the
per-message entry W18 chose. **A1: done.** A5 ("which route answered") stays with H4.

## C1r — NPC reply landing in the switched-to chat

**Fixture first.** `src/runtime/npcLateLanding.review.test.ts` drives the real `EffectsApplier` against a replica of
ST's non-streaming path (`Generate` → `onSuccess` → `saveReply` appends into the live `chat`, `script.js:5461-5531`)
and of a streaming reply whose headers arrive late (`onStartStreaming` pushes its `...` placeholder, `:3621-3640`), with
the switch shaped like `openGroupChat` (clear, repoint `chat_id`, load, and only then `CHAT_CHANGED`,
`group-chats.js:2203-2210`, `script.js:7658-7700`). ST aborts nothing on a switch (the only aborts are the stop button
and `stopGeneration`, `script.js:5607-5614`).

**Result on the unchanged applier: 2 of 4 red.** The non-streaming reply was appended to chat B and saved there; the
late-headers reply left its `...` placeholder in chat B (the plan-02 stream guard refused its writes, but the
placeholder is `saveReply`, not `onProgressStreaming`). Both controls (no switch) landed and saved once. So the stop
was built.

**The stop.** `watchHostChatMove(chatId, onMoved)` (`stHost/generation.ts`, pure core `watchChatMove` in
`stHost/streamGuard.ts`): while an llm NPC reply is pending, a `#chat` childList `MutationObserver` plus a 50 ms poll
compare `getCurrentChatId()` with the reply's chat. The first mismatch runs the same stop the lapse runs, once
(`EffectsApplier.speak`: guard `halt()`; else `stopGeneration` only when exactly one outermost generation opened since
the trigger). The chat id moves right after `clearChat`, before the next chat's fetch lands, so the request is aborted
before `saveReply` or `onStartStreaming` can write. All 4 green after; `streamGuard.test.ts` covers the watcher
(fires once, unsubscribes, a stop before the move never fires). Fault matrix `effects|aborted` stays **partial** (a
replica; the lane re-run is owed to plan 10) with the two new citations; census row `EffectsApplier.speak` updated.

Residual, stated: a response that lands in the ≤ 50 ms between the repoint and the next poll or mutation, when no
`#chat` mutation happens in between. `clearChat` removes `#chat`'s children before the repoint, so the observer fires
first and reads the old id; the poll is the backstop.

No lane was run for C1r.

## Design calls: C3, C4, C12, C13 (not built; for the user's review)

### C3 — `requirements.ready` suppresses every checkpoint effect

**Evidence.** `EffectsApplier.applyCheckpoint` returns at its first line when `!extras.requirements.ready`
(`effectsApplier.ts:236`). A solo chat with an Adolion story, or a group missing one required member or book, therefore
gets no background, no Author's Note, no preset overlay, no cast staging, no scripted opening and no World Info path
replay. The story still runs (gates, memory, guidance). SP5's lab: "solo chats get no effects when members are
missing" (v2.6 03, `lab/scenario/`).

| Option | What changes | Cost |
|---|---|---|
| (a) Keep | Nothing | a solo or partial chat looks unstaged; the Repair entry already names the missing thing |
| (b) Apply what does not depend on the missing thing | background, AN, preset, scenario always; `cast_changes` only for members present; World Info only for books present; `npc_replies` only for members present | each effect needs a "depends on" rule; a story authored for a full cast plays half-staged, which may read worse than unstaged |
| (c) An authored opt-in | `requirements.partial: "stage" \| "hold"` per story, default `hold` (today) | one more authored field; nothing changes for existing stories |

**Recommendation: (b), restricted to the presentation effects** (background, Author's Note, preset overlay,
`effects.stage`), keeping `cast_changes`, `npc_replies` and World Info held until requirements are ready. Those three
are the ones that write shared state (group members, lorebook files) or speak, and the reason the guard exists. The
presentation effects are per-chat or per-request and already ledgered, so a missing member cannot make them wrong.
Gate: jest on `applyCheckpoint` with `ready: false` (presentation applied, the held three untouched), plus a no-LLM
scenario on a solo chat.

### C4 — `/cp activate` applies only the target's effects; SP5's C4 pass rule

**Evidence.** `activateCheckpoint` (`runtimeManager.ts:267-272`) moves the engine and calls `applyActive("activate")`.
World Info is already path-replayed (`worldInfoPlan(story, path)`), but the path after a jump is start → target, so the
start scene's gated entries that a played path would have switched off stay on (lab: Night Courts'
`CP night-the-slums - Scene` stays on at Bathorya). Every other effect is a delta: a target that sets no Author's
Note, background or scenario keeps the jump source's. In the saga, a jump from the start to 132 of 157 checkpoints
leaves guild-hall's Wendhope scenario framing a later act (`lab/scenario/README.md` F5). Separately (F2, the "pass
rule"), SP5's fixture asserts every card scenario appears exactly once, which assumes distinct card texts; Adolion's
146 cards carry 50 distinct genre texts, so the Academy's 5 scenarios are 2 texts. That is a fixture defect, not a
product one.

| Option | What changes | Cost |
|---|---|---|
| (a) Keep; document `/cp activate` as a debug jump | nothing | tests that jump must jump through the act's writer (as the lab fixture does) |
| (b) Path-replay every effect on a jump | the applier folds the last value of each effect kind along the authored shortest path to the target (AN, background, scenario, preset, cast) | needs a canonical path to a checkpoint the chat never played; branches make it ambiguous |
| (c) Release, then apply | a jump first releases the jump source's staging (ledger restore of AN/background/scenario, WI release of the whole gated set), then applies the target alone | the target plays unstaged where it relies on inherited staging, but never with another scene's |

**Recommendation: (c)** for `/cp activate`, because it uses machinery that exists (the
effect ledger's compare-and-set restore, `worldInfoPlan`'s release) and never invents a path. Fix SP5's pass rule to
count per distinct text (the lab's `c4-group.json` already expects that). Gate: jest (jump from a staged checkpoint to
one with no AN/background: both restored to pre-story values; gated WI of the source off), and the lab fixture's F5
case.

### C12 — onEnter replies bury the gating reply

**Evidence.** 175 of 269 saga transitions (65 %) enter a checkpoint whose onEnter reply posts right after the
boundary; 74 of them are model-generated (`lab/swipes/README.md` §Findings). The reply that satisfied the gate is then
no longer the newest message, so ST will not swipe it and an edit reads as an older-reply rollback. Only 17 of 63
branch points keep the gating reply newest. This caps SP1 (swipe-back cache) and SP2 (re-commit on edit) on
Adolion-like stories.

| Option | What changes | Cost |
|---|---|---|
| (a) Keep; bound SP1/SP2's worth by it | nothing | the spikes' "worth building" rate is measured on 35 % of transitions |
| (b) Fold the onEnter beat into the next generation | an onEnter `llm` reply becomes a one-turn injection ("open the scene with …") for the next reply instead of a message of its own | the scene opener no longer appears at once; a story that relies on the Narrator speaking first changes feel |
| (c) Rollback treats an onEnter reply as part of its boundary | a swipe/edit of the gating reply, or a delete of the onEnter reply, rolls back the transition and removes the reply the transition posted (`npcReplyRewind.ts` already records each fire's message id) | ST's own swipe UI still refuses a non-last message; only delete-then-swipe and edit reach it |

**Recommendation: (c)**, because the author's opener stays and the only product change is making the reply the
transition posted part of that transition's rollback, using the fire record C6 already keeps. (b) changes how stories
play and should be a per-story authored choice if ever. Gate: jest (edit of the gating reply rolls back the transition
and deletes the onEnter reply; a player message after it does not), then SP1/SP2's lab cases re-counted.

### C13 — guidance secrets reach every drafted member

**Evidence.** A checkpoint's `guidance` (Adolion's "Who knows what:" lines) is one shared extension prompt at depth 4
(`pacingCoordinator.updateSteering`, `INJECTION_REGISTRY.checkpointGuidance`), sent to whichever member is drafted. The
epistemic block, by contrast, is staged per drafted member (`onMemberDrafted`). The witness lab's 9 secrets all live in
guidance, so SP9's filter cannot hide them (`lab/witness/README.md`). Separately, `cast_changes` mutes decide who
speaks, not who hears: `the-duel` mutes Haley and Forre while its guidance puts them in the royal box.

| Option | What changes | Cost |
|---|---|---|
| (a) Keep; authoring rule | secrets go in authored epistemic rows (per member), never in `guidance` | the Adolion build moves its "Who knows what" lines; nothing in the product changes |
| (b) Per-member guidance | `guidance` accepts `{ all, members: { <roster id>: text } }`; the member part is staged per draft like the epistemic block | a schema addition and a second staged slot; the narrator still sees the shared part |
| (c) Seed the epistemic store from guidance | parse "Who knows what:" into epistemic rows at checkpoint entry | parses prose; fragile, and the lab chose leak phrases absent from the build for exactly that reason |

**Recommendation: (b)**, with (a) as the interim authoring rule. The per-draft staging exists (`memoryInjector`), and
(b) keeps the authored text where authors write it. Gate: jest (drafting A sends A's part and the shared part, never
B's), plus the witness lab's secrets run with the guidance split (SP9 F1–F5).

### Questions for the user (C3, C4, C12, C13)

- C3: approve (b) restricted to presentation effects?
- C4: approve (c) release-then-apply for jumps?
- C12: approve (c) onEnter reply joins its transition's rollback?
- C13: approve (b) per-member guidance, with (a) as the authoring rule until then?

## Unresolved questions

- C3, C4, C12, C13: the four design calls above (§Design calls) await the user's review.

## Gate record — 2026-09-30 (code items S, B17, G, A1, C1r; design C3/C4/C12/C13)

Worktree branch `worktree-agent-ac0f760cd08d6e7ce`, master merged twice (last at `25b32284`, plan 07). No lane, no main
ST, no real-LLM run (rule 13); nothing under `C:\dev\so-lanes` touched, ComfyUI not reached.

| Item | State | Evidence |
|---|---|---|
| S | built | §S; `sprites.test.ts` W11 U1 ×2 (2 mutants killed: default `enabled: true`; activation ignoring `explicit`), `capabilities.test.ts` probe case, Storybook `Settings/SpriteSettingsView` ×4, `adolionFresh.test.mts` |
| B17 | fixed | `proposal.test.ts` B17 (mutant: old `setLoreSelect(draft, op.loreSelect)` fails), Storybook `ExclusiveLoreIsAuthorOnly`, `AuthorSeesExclusiveLoreReadiness` |
| G | built | `groupStoryBinding.test.ts` ×2 new, Storybook `Settings/GroupStoryBindingView` ×4, `errorCopy.json` row for the panel's reason line |
| A1 | done (plan 08) | `inlineTimeline.test.ts` inspector case extended (gate, talk, delta, audit); mutant "inspector drops L4 items" fails it |
| C1r | fixture red 2/4 on the unchanged applier, then built | `npcLateLanding.review.test.ts` 4/4, `streamGuard.test.ts` watcher ×2; fault matrix `effects\|aborted` partial + 2 citations; census `EffectsApplier.speak` note |
| C3/C4/C12/C13 | design written, not built | §Design calls |

Commands (worktree, after the second master merge):

- `npm run typecheck` 0 · `npm run typecheck:test` 0 · `npm run lint` 0
- `npm test -- --silent` 0: 356 suites passed, 1 skipped; 4766 tests passed, 1 skipped
- `npm run build:dev` 0 · `npm run build` 0 (prod, bundle `7fad8abafda2`)
- `npm run test:debug` 0: 454 pass, 0 fail
- `npm run test:release` 0: 77 pass, 2 skip, 0 fail
- `npm run test:replay` 0: 25 of 25 killed (run with a private `TEMP`: the shared `%TEMP%\so-defect-replay` was locked by a
  parallel agent's run, EBUSY on the first attempt)
- `npx storybook build -o .sb-static-04 --quiet` 0; `npx http-server .sb-static-04 -p 6104 -s -c-1`;
  `npx test-storybook --url http://127.0.0.1:6104 --index-json` 0: 46 suites, 308 tests passed (server stopped, dir deleted)

**Main entry:** `dist/index.js` 1,193,811 B vs master `25b32284` built the same way 1,192,501 B: **+1,310 B**. The panels
(`SpriteSettingsView`, `GroupStoryBinding`) are lazy chunks; `sprites/activation.ts` and
`runtime/groupStoryBindingEdit.ts` were split out so the main entry keeps only `settings.ts` and `boundStoryForEmptyChat`
(before the split: +3,345 B on the previous master). What remains in main: the C1r watcher, the `sprites` probe, B17's
two small changes and the lazy import.

**Deviations:**
- `JudgeSettingsGroup.stories.tsx` `ReadinessNamesWhatIsNotWorking` now sets `authorView: true`. It asserted the
  "Prepare ahead" (author-only `expansionLookahead`) concern in player view, the same leak B17 closes; its own comment
  says the concern shows "where the author turned it on", which is author view.
- `scripts/debug/lib/adolionFresh.mts` writes `explicit: true` with `sprites.enabled: false`, because an unmarked
  `enabled: false` now means "unset", which an Adolion story would turn on.
- Live checks for S, G and C1r are owed to plan 10's final suite (rule 13); none ran here.
