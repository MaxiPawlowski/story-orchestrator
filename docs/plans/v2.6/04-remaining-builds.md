# Plan 04 — Remaining builds

**Status: IN BUILD 2026-09-30.** Built and on master: H (H1–H4 + the opencode agent bridge), S, B17, G, A1, C1r,
C3/C4/C12/C13. Waiting on a measurement or a spike verdict: L7, J3, A4/A5, SP7.b and the other `.b` builds; T4 is
blocked on the shared `node_modules`. Each item keeps its source plan's conditions, and nothing is built before its
measurement where the source plan requires one.

## Items

| # | Item | Source | State | Blocked on | Effort |
|---|---|---|---|---|---|
| H | **Harness routing: build H1–H4 + Phase A** | v2.5 plan 13 | **built 2026-09-30** (H1–H4 + the agent tool bridge, §Gate record H and §Gate record agent bridge); **opencode only, no CLI logins** (W 2026-09-30): the Claude Code and Codex arms are dropped, not pending | Phase A (real models) runs in plan 15 Part B | L |
| L7 | Lore contradiction: runtime + R4–R6 | v2.5 plan 08 | Phase A only | v2.6 02 D7 data | L |
| J3 | House rules: judge-on arm ×2; J6a player intent (B8 order) | v2.5 plan 06 | on arm failed 4/4 (timeouts); J6a not started | `f972e24d` proven (v2.6 01); B7, B8, B9 | M |
| C1r | NPC reply residual: a non-streaming reply or late headers land in the switched-to chat | v2.5 plan 02 | **built 2026-09-30**: fixture showed both landing (2/4 red), `watchHostChatMove` stop added (§C1r) | live re-run owed to plan 10 | M |
| C3/C4 | `requirements.ready` suppresses every effect (C3); `/cp activate` applies only the target's effects, and SP5's C4 pass rule vs shared genre text (C4) | v2.5 plan 14 | **built** 2026-09-30 (user approved (b)/(c)); §Gate record C3/C4/C12/C13 | jest; SP5 C4 rule fixed in the fixture | M |
| C12/C13 | onEnter replies bury the gating reply (caps SP1/SP2); guidance secrets reach every drafted member | lab findings | **built** 2026-09-30 (user approved (c)/(b)); §Gate record C3/C4/C12/C13 | jest + Storybook | M |
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
3. H in parallel (built; opencode only, no logins, W 2026-09-30). Phase A is long lane time and runs in plan 15 Part B.
4. L7 after v2.6 02's data; A1 after 08's composer.
5. The `.b` builds as v2.6 03 emits them.

## Gate

Each item gets its source plan's code gate. **No per-plan ×1 live run** (overview rule 13): the live rows run in the
plan 14 tiers (plan 15 Part B), and ×2 at the T7 freeze.

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

## Design calls: C3, C4, C12, C13 (approved 2026-09-30, built; see the last gate record)

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

**Answered by the user 2026-09-30: every recommendation approved** — C3 (b) presentation effects only; C4 (c) release then apply; C12 (c) onEnter reply joins its transition's rollback; C13 (b) per-member guidance, (a) as the authoring rule meanwhile. Build next, with the gates named in each section.

- C3: approve (b) restricted to presentation effects?
- C4: approve (c) release-then-apply for jumps?
- C12: approve (c) onEnter reply joins its transition's rollback?
- C13: approve (b) per-member guidance, with (a) as the authoring rule until then?

## Unresolved questions

- C3, C4, C12, C13: approved and built (gate record C3/C4/C12/C13). Open: whether `effects.scenario` (SP5, an extension) should join C3's presentation set; it stays held while requirements are unmet.

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
| C3/C4/C12/C13 | design written here; built later the same day after the user's approval | §Design calls, §Gate record C3/C4/C12/C13 |

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

## Gate record — H (2026-09-30, harness routing H1–H4 + agent bridge stub)

Branch `worktree-agent-ac6fe5ee6515e1256`, merged with master `fb31e640`. Not merged to master.

### Built

| Part | Where | What |
|---|---|---|
| Server plugin | `server-plugin/story-orchestrator-harness/` (`index.mjs`, own `package.json` type module) | Spawns `claude -p`, `codex exec`, `opencode run` per call. Fixed argv with `shell:false`; `.cmd`/`.ps1`/`.bat` shims refused. The prompt goes on stdin. The system text goes by file (Claude `--system-prompt-file`, opencode `OPENCODE_CONFIG_CONTENT` `{file:…}`); Codex gets it prepended on stdin. Tools are off per CLI (Claude `--tools "" --strict-mcp-config --setting-sources ""`; Codex `--ignore-user-config --ignore-rules -s read-only --ephemeral` plus a `--disable` per tool feature; opencode `--pure` with a tools-off `so-text` agent). Each call gets an owned home (mkdtemp; only the login file is copied; the real login is hash-checked; the home is deleted after the call). Env allowlist plus named pass-through. Deadline with a tree kill. Output bound; body bound before parse (`text/plain`). `X-SO-Plugin` header plus same-origin guard. Admin-only by default. Model allowlist per harness. Concurrency 2 and queue 8 per harness; single-flight per user, harness and role. Errors are classified as `auth`, `quota` (+`retryAt`), `timeout`, `config`, `malformed`, `refused`, `transport`, `lapsed` or `busy`. The log line carries only `{harness, model, ms, usage, kind}`. Routes: `GET /status`, `POST /complete`, `/cancel`, `/warm` (admin, B2) and `/agent` (501 stub). Nothing is offered unless the server `config.json` sets `offer: true`. |
| H1 route type | `extraction/modelRoute.ts`, `runtime/passProfiles.ts`, `utils/harness.ts` | `ModelRoute` gains a harness kind. `routeKey` is the profile id or `harness:<name>:<model>`. `routes[role].route` holds the harness route; `resolveRoute` refuses a model the plugin does not list. |
| H3 transport | `extraction/reply.ts`, `extraction/harnessReply.ts` (lazy), `services/stHost/harness.ts` (lazy) + `harnessCache.ts` | The deadline is `callTimeoutMs × timeoutScale` + 15 s spawn. The output bound is maxTokens × 6. The debug short-circuit runs before routing. A 429 (busy) is retried until the deadline. |
| Breaker/scheduler | `extraction/breaker.ts`, `extraction/scheduler.ts`, `runtime/wiring/scheduler.ts` | The breaker keys on the route. A quota hold lasts until `retryAt`. A harness breaker is probed by `/status` and spends no quota. The dangling check skips harness keys. The heavy lane is gated by the synthesis route (`heavyRouteKey`). |
| H1/H4 no silent fallback | `runtime/modelCallCore.ts`, `runtime/harnessFallback.ts` (lazy) | `onFailure` falls back to a profile only on auth, quota, transport or timeout, and only when the author set one; it is recorded as `fallback` with `fallbackFrom`. config, refused, malformed and lapsed never fall back. With no fallback set, the role pauses. |
| H4 record | `runtime/modelCallLog.ts`, `extras.modelCalls` (cap 300), `journal.ts` `model-call`, `modelCalls.ts` routed rows | Every non-narrative call is recorded with its route, result, ms, usage and spawnMs. Role health gains `not-logged-in` and `quota`, which feed Repair. The `harness` capability probe is lazy. |
| UI | `RoleProfilesGroup.tsx`, `MemoryModelGroup.tsx` (already lazy), `runtime/roleRouteEdits.ts` | Per-role select, split into "Connection profiles" and "Cloud harness (on the SillyTavern server)". The default stays "Same as memory model". Egress copy per role (`[data-so="role-egress"]`), an "On failure" select (`#so-role-fallback-<role>`) and a meter (`[data-so="role-meter"]`). Status is fetched only when a role is routed to a harness or the details are opened. New story: `HarnessRoute`. |
| Calibration arm | `scripts/debug/so-role-calibration.mts --profile harness:<name>:<model>` | Sets `extraction.routes[role]` and restores profiles and routes afterwards. |
| Census | `test/findings/faultMatrix.json` (package `harnessTransport`, 10 cells), `errorCopy.json` (2 probe rows) | The ownership row added for `modelCallCore#createModelCallVia.call` went stale after the fallback moved lazy (the census no longer sees a write-after-await there) and was removed. The telemetry-in-the-wrong-chat note is kept below as an open item. |

### B1–B5 as applied

- **B1:** a login that expires within 90 minutes is refused. The message tells the user to run the CLI once in a terminal; the plugin never refreshes it inside a copy. A real login file that changes during a call holds every later call.
- **B2:** opencode runs from a pre-warmed owned cache with `OPENCODE_DISABLE_MODELS_FETCH=1`. The warm-up is the admin `/warm` route. An unwarmed opencode is refused before spawn.
- **B3:** personal use only; there is no hosted surface.
- **B4:** admin-only unless `allowNonAdmin` is set in the server config.
- **B5:** subscription logins only. API-key variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) are not on the env allowlist.

### Agent tool bridge (plan 11 harness route): design + typed stub

The v2.5 design does not cover an MCP bridge. What was built is the stub: plugin `POST /agent` answers 501 with `AGENT_BRIDGE_REFUSAL`, and it has a test that it never spawns. The client side, in `copilot/agent/route.ts`, has the `AgentToolBridge` interface (open / nextCall / answer / close), `HarnessTransport.bridge?` and the existing `harnessRoute` refusal, which now names the endpoint.

Options:

1. **MCP inside the CLI.** Rejected. It needs `--strict-mcp-config` off and an MCP server the CLI can reach, which breaks the H-N1b isolation (tools off, no user config). The tools also run in the page's zustand draft store, which the server cannot reach.
2. **Long-poll bridge (the stub's shape).** The plugin runs the CLI with one tool, a local MCP stdio shim owned by the plugin. It parks each tool call in a session. The page polls `nextCall`, executes the tool against the draft through `mutations.ts`, and posts `answer`. Isolation holds because the only tool is the plugin's own shim. Costs: a stdio MCP shim per CLI, a session store with deadlines, and a CSRF'd poll loop.
3. **Text route only (today).** Route "Wizard and road ahead" to a harness under Models per task, and the agent runs through its JSON text protocol (plan 11 local route). There are no native tool calls, and nothing new is exposed.

**Recommendation:** stay on 3 through v2.6. Build 2 only if Phase A shows the harness text route misses the plan 11 floors while native tool use would meet them. User decision.

**Decided by the user 2026-09-30:** build option 2 (long-poll bridge) now. Harness scope for v2.6 is **opencode only**: Claude Code and Codex are skipped (no login refresh, no Phase A legs on them; their plugin support stays, unoffered). The bridge and Phase A target opencode.

### CLI login states (2026-09-30)

Read-only checks: `loginFreshness` and `--version`. No login, no config change, no model call.

| CLI | Version | State |
|---|---|---|
| Claude Code | 2.1.282 | stale: access token expired. Not refreshed: opencode only, no logins (W 2026-09-30) |
| Codex | 0.157.1 | fresh (`codex login status`: logged in using ChatGPT) |
| opencode | 1.18.33 | fresh |

`HARNESS_LIVE=1` PONG: **not run.** It spends subscription quota, and real-model runs belong to Phase A.

### Gates (after merging master `fb31e640`)

```
npm run typecheck        pass
npm run typecheck:test   pass
npm run lint             pass
npm test                 359 suites passed, 1 skipped; 4798 tests passed, 1 skipped
npm run build            pass (prod)
npm run build:dev        pass
npm run test:debug       454/454
npm run test:release     77 pass, 2 skipped, 0 fail
npm run test:replay      defect replay: 25 of 25 killed
npm run test:plugin      44 pass, 2 skipped (JUDGE_LIVE, HARNESS_LIVE), 0 fail
npx storybook build -o .sb-static-04h --quiet; serve :6114; npx test-storybook --url http://127.0.0.1:6114 --index-json
                         46 suites, 309/309 (first run: RoleProfilesGroup needed explicit fn() spies for the new props; fixed)
```

**Bundle:** `dist/manifest.json` `bundle.bytes` = **1,200,486**. The main checkout's last prod manifest (built 21:05Z, pre-`fb31e640`) read 1,192,515, so this is about +8.0 KB. The pre-plan-07 measurement in this worktree was 1,249,242 against a baseline of 1,242,580 (+6.7 KB). The budget was not raised. The harness transport, fallback, route edits and status probe are lazy chunks.

**Mutants** (`h04_mutants.py`: apply, run the named suite, restore). All 6 killed:

| Mutant | Killed by |
|---|---|
| `onFailure` kind filter deleted | harnessRouting: config / refused / malformed / lapsed "never falls back" |
| breaker keyed on the read route, not the failed route | scheduler.harness: "a background failure on a harness trips that harness, never the read route that did not fail" (added; it survived before) |
| admin check dropped | plugin: "rules 8-10: header, origin, admin and body bounds…" |
| prompt passed in argv | plugin: "a routed call runs in an owned home…" (assertion added: the prompt is absent from argv and env) |
| env allowlist dropped | plugin: "rule 5…", "a routed call runs in an owned home…" |
| deadline kill dropped | plugin: "rule 6 / P0-3…", "rule 7…" and 2 more |

Live gate: none. Harness routes are an opt-in, real-LLM path, and v2.6 rule 13 batches those. Phase A recipe: `test/measurements/v2.6-04h/phase-a-matrix.json`.

### Deviations

- `extraction.profiles` stays for profile routes, and the harness route lives in `routes[role].route`; `profiles` was not replaced. Profile route keys stay the raw profile id, with no `profile:` prefix.
- `options.maxInputTokens` was dropped. The per-model context comes from the plugin's `config.json` via `/status` (`harnessContextLimit` − 4096), for bundle bytes.
- Not built: the H9 role split (so there is no H10 critic arm; Phase A row 4 is n/a), audit↔callId linking, `options.transport: server` (H8), and `harness.preflightTokens`.
- Priority-2 scene passes stay in the read lane, gated by the read route.
- Repair shows harness login and quota through the model-role area with the CLI's own detail, not a separate "harness-login" area.
- The "one real route test through ST's middleware" (PR-05) is not run. The guards are covered by handler-level tests with fake requests.

### Open items

- ~~User: refresh the Claude login~~ Dropped: opencode only, no CLI logins (W 2026-09-30). No `claude:*` or `codex:*` arm runs.
- Phase A (lane time, real models, final suite): the recipe above. The P0-7 5/5 re-run on the warmed opencode cache is still owed (B2). Codex owned-home isolation is not run (PHASE0).
- A call that lands after a chat switch is recorded in the ring of the chat now open. This is telemetry only; the answer stays owned by its caller's `RunOwnership`.
- Agent bridge option 2: built 2026-09-30, see "Gate record — agent bridge" below.

## Gate record — C3/C4/C12/C13 (2026-09-30, the approved design calls)

Worktree branch `worktree-agent-a6c6bb3c16a6c4bb7`, master merged at `c4a2683f` (fast-forward) and again after plans 01/06/04 H landed
(`721b0933`; conflicts in `managerDelegates.ts`, `memoryInjector.ts`, `runtimeManager.ts` and `diagnostics.test.ts`, resolved keeping both
sides: 06's per-member staging and inner beat, C13's guidance draft). No lane, no main ST, no real-LLM run, no ComfyUI.

| Item | As built | Gate |
|---|---|---|
| C3 | `EffectsApplier.applyCheckpoint` no longer returns on `!requirements.ready`: the Author's Note, the preset overlay and the background still apply (ledgered as before). World Info, `cast_changes` (and the hydrate cast mirror), every `npc_replies` (the new-chat opening included) and effect extensions (SP5 scenario) stay held, and `lastAppliedCheckpointId` stays unset, so the owed full apply still runs when requirements turn ready (`requirementsRefresh.review.test.ts` unchanged and green). `effects.stage` needed no change: `SpriteStage.direction()` reads the active checkpoint directly and never consulted `ready`. | `effectsStaging.review.test.ts` C3 ×2 (not-ready + ready control) |
| C4 | `/cp activate` (`RuntimeManager.activateCheckpoint`) calls `EffectsApplier.releaseStaging` while the engine still stands at the source: compare-and-set restore of every applied `an`, `background` and `extension` (scenario) ledger row, then (requirements ready) a World Info release of the story's whole gated set. The target is then applied with `stagedPath(checkpointPath, stateLog)`: the path from the last manual activation on (read from the boundary log's `after.visitedPath`), so World Info and SP5's path replay see the target alone; with no jump in the log it is the full path. Load/hydrate/rollback use the same staged path, so a reopened chat after a jump replays the same state. Cast is not released (not in the approved set). SP5's C4 pass rule in `test/scenarios/live-v25-09-sp5-scenario.json` now counts per distinct card text (`texts`, expected hits = members sharing it); evals syntax-checked, not run. | `effectsStaging.review.test.ts` C4 ×4 (staged path from a real `StoryEngine`; jump restores AN + background to pre-story values and switches the source's gated entry off; control without release inherits; externally changed note left alone, not-ready leaves WI untouched), `jumpRelease.review.test.ts` (manager order: release at the source, apply target with path `far`) |
| C12 | `fireNpcReplies` returns how many replies spoke. A transition's onEnter replies (`applyCheckpoint(..., gate)`, gate = the boundary's `lastMessageId`, passed only when `commitBoundary` fired a transition) are recorded as `extras.onEnterPosts` `{checkpointId, gate, first: gate+1, last}` (the transition note, if posted, is inside the span). `TurnBridge.onMutation` asks `RuntimeManager.rollbackOnEnter(kind, from)` first: an edit/swipe of the gate while the post is the chat's tail, or a delete inside the post while nothing follows it, rolls back from the gate (the transition) and then `/cut`s what remains of the post (`removeOnEnterPost`: run checked, refused unless the chat's last message is still the post's last). A rollback drops every post whose last id is at or past the point, so the cut's own MESSAGE_DELETED is an ordinary no-op rollback. Optional persisted field, sanitized on hydrate (`sanitizeOnEnterPosts`, cap 20); blob stays v6, `isCurrentRecord` untouched. | `onEnterRollback.review.test.ts` ×9, including the negative cases (player message after the opener: edit of the gate, edit of the player line, delete of the player line, delete of the opener with a player line after it — all `null`), plus `turnBridge.test.ts` "hands a mutation the onEnter rollback claims…" |
| C13 | Format-2 `guidance` is `string | { all?, members: { <roster id or name>: text } }`, read by `readGuidance` (shape errors: non-text member, unknown key) and normalized after the roster by `resolveGuidanceMembers` (names → roster ids, empties dropped, member-less objects collapse to the string). `PacingCoordinator` composes the shared block plus `Direction for <name> only: …` for the drafted member (`draftGuidance` from `onMemberDrafted`, resolved by `MemoryInjector.draftedRosterId`, independent of the epistemic capability); at rest in a group only the shared part; `withholdGuidance` (quiet/impersonate) holds the member part until `releaseStaleGuidanceHold`/`releaseDraftGuidance`, mirroring the epistemic withhold. A solo chat whose roster has exactly one member hears that member's part (the same rule plan 06 uses for its solo beat). Studio: `GuidanceEditor` (lazy Studio chunk) edits the shared part and one private text per roster member and names unknown ids; diagnostic `guidance-member-unknown` (warning) with its consequence line. Authoring rule written into the spec's Checkpoint block (`docs/plans/v2/story-orchestrator-spec-v2.md`): secrets never in shared guidance, only in epistemic rows or `guidance.members`. | `coordinators/memberGuidance.review.test.ts` ×7 (drafting Haley sends Haley's part + shared, never Forre's; narrator/unknown/rest shared only; solo; withheld), `diagnostics.test.ts` seeded story fires the new code once, Storybook `Studio/GuidanceEditor` ×3 |

Each new test failed once: 13 hand mutants (C3 cast/WI/presentation, C4 staged path/restore/WI release, C12 tail rule/record/bridge/rewind,
C13 withheld/member-only/draft wiring) all killed; the rewind mutant survived the first test set and got the `runRollback` case.

Census/fault matrix: ownership rows added for `EffectsApplier.fireOnEnter` (checked), `RuntimeManager.rollbackOnEnter` (checked),
`RuntimeManager.fireSceneBreakReplies` (delegate → fireNpcReplies), `TurnBridge.onMutation` (partial: the spike seam after the new await).
Fault matrix `effects|delayedSuccess`, `effects|duplicateCompletion`, `effects|worldSwitched` gained `alsoEvidence` citations.

Commands (worktree, after the second master merge):

- `npm run typecheck` 0 · `npm run typecheck:test` 0 · `npm run lint` 0
- `npm test -- --silent` 0: 368 suites passed, 1 skipped; 4886 tests passed, 1 skipped
- `npm run build:dev` 0 · `npm run build` 0 (prod, bundle `770dd37a6efb`)
- `npm run test:debug` 0: 457 pass, 0 fail
- `npm run test:release` 0: 77 pass, 2 skip, 0 fail
- `npm run test:replay` 0 (private `TEMP`): 30 of 30 killed
- `npx storybook build -o .sb-static-04c --quiet` 0; `npx http-server .sb-static-04c -p 6108 -s -c-1`;
  `npx test-storybook --url http://127.0.0.1:6108 --index-json` 0: 48 suites, 316 tests passed (server stopped, dir deleted)

**Main entry:** `dist/index.js` 1,212,933 B vs master (`git archive master` after the plan 01/06/04 H merge, built the same way)
1,206,775 B: **+6,158 B**, under the 1,250,000 B budget. `GuidanceEditor` is in the lazy Studio chunk (`999.index.js`), not the main entry.

**Deviations:**
- C3's no-LLM solo-chat scenario was not written or run: it needs a live ST, and this task ran with no lanes. Owed to plan 10's suite,
  with SP5's lab F5 case and SP1/SP2's re-count on C12.
- C3 holds effect extensions (SP5 `effects.scenario`) with World Info: the approved set named background, AN, preset and stage only. The
  design's original option (b) had scenario in the "always" group; flagged in Unresolved questions.
- C4 releases only AN, background and extension rows; cast stays as the source left it, per the approved (c).
- C12: ST's swipe UI still refuses a non-last message, so the gating reply is reached by edit, or by delete-then-swipe (the delete is
  what rolls back). The cut removes the transition's `/comment` note too when it sits inside the post's span.
- C13: a solo chat with more than one roster member hears only the shared part (no host field names the solo card's roster id);
  the member part rides the existing guidance extension prompt (same key and depth), so the next-turn preview shows it under
  "Checkpoint guidance" while a member is drafted.
- Test mocks gained `rollbackOnEnter` (five TurnBridge suites), `stateLog: []` (`requirementsRefresh`) and a boundary `context`
  (`runtimeManager.test.ts` commit probe); none of them changes an assertion.

## Gate record — agent bridge (2026-09-30, option 2, opencode only)

Branch `worktree-agent-a07bc1e52f57fd7c7`, master `bd61f23f` merged (fast-forward). Not merged to master. No lane, no ST,
no ComfyUI, no real CLI call: every plugin test drives a fake opencode (`fixtures/fake-opencode.mjs`) that speaks MCP to
the real shim.

### Built

| Part | Where | What |
|---|---|---|
| Session store + routes | `server-plugin/story-orchestrator-harness/agentBridge.mjs`, wired in `index.mjs` | `POST /agent/open`, `/agent/next` (long poll, ≤ 25 s, `pending` on timeout), `/agent/answer`, `/agent/close`; the 501 `/agent` stub is gone. Open validates the body and the tool schemas (≤ 64 tools, 200 KB, closed tool keys, `[A-Za-z][A-Za-z0-9_]` names, unique, object schemas, depth ≤ 8, no `$ref`), then runs `preconditions` (offer gate, installed, fresh login, quota, warmed cache). One session per user and role (a second open replaces the first); sessions per harness ≤ its `concurrency` (429 busy). Each session: an owned home (login copy, hash-checked at close), a local channel (named pipe on Windows, socket in the owned home elsewhere) with a 32-byte secret handshake and one shim connection, `opencode run --pure --format json --agent so-agent`, prompt on stdin. A tool call is parked with its own call deadline (default 120 s); ≤ 4 parked, more are refused to the shim at once; a call is answered once, by its own user, in its own session (else 404/409). Teardown (close, session deadline, call deadline, replacement, a foreign tool event, `exit()`): answers every parked call, kills the tree, closes the channel, deletes the owned home, frees the owner slot, wakes waiting polls with the reason; a 60 s tombstone keeps only the reason. Log line: `{harness, model, ms, calls, kind}`. `/status` rows gain `agentBridge` (offered && opencode). |
| MCP shim | `server-plugin/story-orchestrator-harness/mcpShim.mjs` | Newline-delimited JSON-RPC over stdio: `initialize` (echoes the client's protocol version), `ping`, `tools/list` (exactly the page's tools from the owned tools file), `tools/call` (unknown name → -32602; forwarded over the channel, answered as `{content:[{type:"text"}], isError}`); exits when the channel closes. |
| Isolation | `bridgeAgentConfig`, `bridgeArgv` | Same owned home, env allowlist (`childEnv`), `--pure`, deadline tree kill and output bound as H. `OPENCODE_CONFIG_CONTENT` carries exactly one MCP server (`so`, command `[node, mcpShim.mjs]`, the pipe/secret/tools file in its `environment`, not the CLI's) and one agent `so-agent` with `tools: {"*": false, "so_*": true}` and edit/bash/webfetch denied. A tool event on stdout for anything not `so_*` ends the session as `refused`. |
| Host seam | `src/services/stHost/harnessBridge.ts` (lazy), `harnessCache.openAgentBridge`, `STAPI` | `open` / `nextCall(sessionId, deadlineAt)` (re-polls `pending`, 404 → ended lapsed) / `answer` / `close`, plugin header + CSRF headers, `text/plain`. |
| Bridge route | `src/copilot/agent/bridge.ts` (`createBridgeRoute`, `harnessRoute`) | `harnessRoute` takes the bridge when the transport carries one and its target, else the text protocol (`call`), else refuses (`HARNESS_ROUTE_REFUSAL`, no fallback). The bridge route is `native`: the prompt drops the text tool list and asks for native calls. A parked call becomes an ordinary `{kind:"call"}` reply, so `executeReply` → `checkToolCall` → `mutations.ts` / `validateProvisioningOp` run unchanged; a plan or `done` arrives as the harness's final text. A call while the plan is due is refused. `settle` answers the shim with the step's status, observation and check, and keeps the session only while the agent is `running`; a pending edit or provisioning step (the author must decide) answers "Waiting for the author…" and closes it. |
| Runner + drive | `src/copilot/agent/turn.ts` (`createAgentRunner`), `drive.ts` (`driveAgent`, `confirmProvisioning`) | The runner resolves its route once (bridge when offered, else the local route over `manager.model`, which is the H text route when the Wizard role is routed to a harness). `driveAgent` mints a draft run, checks it after every turn before `applyOp`, before commit and before `settle`, and always closes the runner. `confirmProvisioning` creates the asset through `host.applyProvisioning` and applies the draft follow-ups only if the run still holds. |
| Studio | `src/studio/agentHost.ts`, `draft.ts`, `AgentWizard.tsx`, `StudioModal.tsx` | `draftOwnership` over the draft store's new in-memory `runEpoch` (bumped by `loadDraft`, `reset`, `endRuns`: New goal and the agent pane unmounting). `resolveAgentHarness`: the bridge only when `authoring` is routed to a harness whose status row says `agentBridge` and lists the model. The runner is memoized per Studio mount. A lapsed run shows "The agent stopped: the draft changed under it (…)". |
| Census / fault matrix / error copy | `test/findings/ownershipCensus.ts` (root `src/copilot/agent` added), `ownership-sites.json` (+4: `driveAgent`, `confirmProvisioning` checked; `advanceAgent`, `createAgentRunner>anonymous` local), `faultMatrix.ts` + `.json` (package `agentBridge`, 10 cells: 8 covered, 1 partial, 1 na), `errorCopy.json` (+5 rows) | |

Nothing persisted changed: blob v6 untouched, `runEpoch` is in-memory, the transcript rides `wizardSessions[].agent` as before.

### Tests

- Plugin (node:test, `agent.test.mjs`, 13 + 1 skipped): parked call answered through the real shim and the session gone (home, process, owner slot, log line fields); isolation (argv, env allowlist, owned XDG/HOME, exactly one MCP server, agent tools, the fake CLI sees exactly `so_readStory`/`so_addQuality`); shim unit (exact list, unknown tool refused, notifications unanswered); answer routing (own session, once, other user 404, unknown call 409); session deadline with nobody polling; call deadline; foreign tool → refused; replacement + close; bounded queue (a burst of 6: 4 delivered, 2 refused at once); open validation (10 refusals); admin / header / origin / cross-site / offer / unwarmed refusals before any spawn, status `agentBridge`; the four routes end to end; shutdown. `HARNESS_LIVE=1` case: one real opencode session through the shim (skipped by default, **not run**: it spends quota; real-model runs belong to Phase A).
- Jest: `bridge.test.ts` (12: read observed + session kept, unknown tool refused and answered ok:false, review edit waits + closes, auto-draft edit returned, provisioning waits in auto-draft + `decideStep` cannot create it, call-before-plan refused, plan as text, refused open / ended session throw, `harnessRoute` selection, runner resolves once / settles / closes, no bridge → local route), `drive.test.ts` (4), `harnessBridge.test.ts` (4), `agentHost.test.ts` (2).

**Mutants** (`.debug/bridge_mutants.py`: apply, run the named suite, restore; controls pass unmutated). All 6 killed:

| Mutant | Killed by |
|---|---|
| the shim offers a second tool (`bash`) | agent.test: isolation (exposed list), shim unit (exact list) |
| an answer routed to the wrong session (the last opened) | agent.test: "an answer reaches only its own session, once, and another user is refused" |
| no teardown on the session deadline | agent.test: "the session deadline tears everything down even when the page never polls" |
| the drive writes a lapsed turn | drive.test: "a draft replaced while the agent turn runs writes nothing and closes the bridge" |
| provisioning follow-ups ignore the lapse | drive.test: "a provisioning confirmed after the draft was replaced leaves the draft alone" |
| the bridge keeps its session while the author decides | bridge.test: review edit / provisioning cases (`closed`) |

### Gates (worktree, after merging master `bd61f23f`)

```
npm run typecheck        pass
npm run typecheck:test   pass
npm run lint             pass
npm test                 368 suites passed, 1 skipped; 4884 tests passed, 1 skipped
npm run build            pass (prod)
npm run build:dev        pass
npm run test:debug       457/457
npm run test:release     77 pass, 2 skipped, 0 fail
npm run test:replay      defect replay: 30 of 30 killed
npm run test:plugin      56 pass, 3 skipped (JUDGE_LIVE, 2 × HARNESS_LIVE), 0 fail
npx storybook build -o .sb-static-04b --quiet; npx http-server .sb-static-04b -p 6121 -s -c-1;
npx test-storybook --url http://127.0.0.1:6121 --index-json
                         47 suites, 313/313 (server stopped, dir deleted)
```

**Bundle:** `dist/manifest.json` `bundle.bytes` = **1,206,941** vs 1,206,807 for `bd61f23f` built the same way in this
worktree before the change: **+134 B** (the lazy `openAgentBridge` loader and the `agentBridge` status field). Every
other new client file sits in the lazy Studio / harness chunks. Budget 1,250,000 not raised.

**After merging master again** (C3/C4/C12/C13, UI leftovers, plan 15 docs; conflicts in this file and `loop.test.ts` imports,
both resolved keeping both sides): typecheck, typecheck:test, lint pass; `npm test` 373 suites passed, 1 skipped, 4931 tests
passed, 1 skipped; build + build:dev pass; test:debug 457/457; test:release 77 pass, 2 skipped; test:replay 30 of 30 killed;
**test:plugin: one run 55 pass / 1 fail / 3 skipped** (run right after the replay suite; the failing test name was not
captured), then 56/0/3 in 18 further runs (9 sequential, 6 + 6 in parallel under load), not reproduced. The likeliest
timing-sensitive spot is the agent tests' `until` waits for process death and teardown (5 s default), now 15 s; 56/0/3 after.
Recorded as a flake, not called green beyond that. Main entry after this merge: **1,214,667 B** (master moved; this
branch's own delta was the +134 B measured above).

Live gate: none (rule 13; harness routes are an opt-in real-LLM path). Owed to Phase A / plan 10: `HARNESS_LIVE=1
node --test server-plugin/story-orchestrator-harness/agent.test.mjs` on a warmed, offered opencode, then J14 with the
Wizard role routed to `harness:opencode:<model>`.

### Deviations

- `AgentToolBridge` changed shape from the stub: `open` takes the prompt, system, tools, deadline and output bound and answers a typed refusal; `nextCall` takes a deadline and returns `call {callId,…} | done {text} | ended {errorKind, message}`; `answer` names the call id. `harnessRoute` moved from `route.ts` to `bridge.ts` (the code-health S7 ratchet refused the route ↔ bridge import cycle).
- The shim is answered **after** the drive loop applies and commits the turn (`runner.settle`), not inside `advanceAgent`, so the harness hears what actually happened to the draft; a lapsed run closes the session without answering.
- A bridge session lives only while the agent is `running`: every author decision (a pending edit, a provisioning card, stop, budget) closes it, and the next turn opens a fresh one with the full step prompt (the decision is in RECENT STEPS). Multi-call sessions happen in `auto-draft` and across read/simulate/lookup calls.
- Gate: `offer: true` on the opencode entry (no separate bridge switch). The tool bridge is refused for `claude`/`codex` by validation (`opencode only`), per the 2026-09-30 decision.
- **Unverified opencode facts** (no real CLI run here): that `--pure` still loads an MCP server from `OPENCODE_CONFIG_CONTENT`, that local MCP `environment` reaches the server process, and that MCP tools are named `<server>_<tool>` so `so_*` enables exactly them. `HARNESS_LIVE=1` is the check; if any is wrong, the session ends `refused`/`timeout` rather than widening anything, because the agent's `tools` start from `"*": false`.
- The mutant script stays in the gitignored `.debug/`, as H's `h04_mutants.py` did.

### Open items

- `HARNESS_LIVE=1` bridge run and J14 on the bridge (Phase A / plan 10).
- W1–W6 on `--route harness` (plan 11) now have a bridge to run against.
