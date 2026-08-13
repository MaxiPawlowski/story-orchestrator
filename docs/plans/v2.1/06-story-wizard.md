# Plan 06 — Story wizard & provisioning

## Objective

Turn the staged authoring copilot into a **setup wizard** that takes an author from a premise to a *playable, provisioned* story: it interviews before it proposes, and it can create the ST-side assets the story requires — character cards, the story lorebook + entries, the group — through reviewed proposals. Today a story's `requirements` must pre-exist by hand (sun-ruins needs 4 hand-made cards + a hand-built "Xentar Checkpoints" lorebook); after this plan the wizard closes that gap and "Fix with wizard" replaces the requirements panel's diagnose-only dots. Addresses D3.

## Context

- Spec addendum §Story wizard. Patterns adopted (00-overview §External-base learnings): ST-Copilot (MIT) — `ask_user` interview mechanic, proposal cards with inline edit-before-apply, history stripped of proposal blocks after decision, `createCharacterAPI` proving `/api/characters/create` (FormData + `getCharacters()` reload).
- Current copilot: staged proposer (`copilot/prompts.ts` stages qualities→checkpoints→transitions→effects; `StudioCopilot.tsx` chat + `ProposalReview` per-op accept; ops applied through `studio/mutations.ts`). It cannot ask, and it cannot touch ST assets.
- ST facts to verify + vendor (rule: confirm in host source before use): `/api/characters/create` (proven by ST-Copilot), `/api/groups/create` (`public/scripts/group-chats.js:2119`), WI creation already vendored (`WorldInfoHostModule.createNewWorldInfo/createWorldInfoEntry`, 00-overview v2 ledger).
- Consumed: plan-02 identity (save lands under a real id), plan-05 Studio completeness + `applyStoryUpdate` (wizard output = same mutation/op contract), plan-01 journey format (defines J9).

## Scope

In: interview protocol, provisioning ops + host seams, wizard flow/entry points, proposal-card polish, wizard-session persistence, J9.
Non-goals: in-play steering (driver/stagecraft own that); native tool-calling APIs (backend-agnostic message protocol — the memory LLM is generic textgen); **editing existing user characters or non-story lorebooks** (create-only; ST-Copilot's edit flows deliberately not adopted); chat-message editing (ST-Copilot chat-manager — out entirely, conflicts with TurnBridge rollback semantics).

## Deliverables

- **Interview protocol**: `ProposalResult` gains a `questions` variant `{status:"questions", questions:[{id, text, why?, options?[]}]}` — per stage the copilot may interview (≤3 questions) before proposing; StudioCopilot renders question cards with option chips + free text; answers append to history; "you decide" always available and the wizard must proceed under stated defaults. Prompt: ask only when the premise underdetermines the stage — the current failure mode is inventing specifics instead.
- **Provisioning ops** (new op kinds, schema-validated, act on ST not the draft): `createCharacterCard {name, description, personality, scenario, first_mes, mes_example, tags?}`, `createStoryLorebook {name}` (also prefills the draft's `stagecraft.lorebooks` allowlist for plan 07's curator), `upsertLorebookEntry {lorebook, comment, keys[], content, constant?}`, `createGroup {name, members[]}`. Review UX: every provisioning op renders as an editable proposal card (all fields editable before apply — ST-Copilot pattern); apply is per-op explicit, excluded from bulk Accept-all; results reflect live in the requirements panel.
- **Host seams**: `stHost/charactersCreate.ts` (POST + header quirk: drop Content-Type for FormData + reload via `getCharacters()`), `stHost/groupsCreate.ts`; WI through the existing `worldInfo.ts`. Verified fact rows appended to this plan's notes with host file:line.
- **Wizard flow**: entry points — settings "New story (wizard)" + Studio empty state + requirements panel "Fix with wizard" when unmet. Sequence: premise → interview → existing stages → **provisioning stage** ("these roster members / lorebooks don't exist — create?") → save (plan-02 identity) → requirements green → "Start playing" (select in current chat or create the group chat).
- **Session persistence**: wizard conversation + pending stage persisted per draft so an interrupted setup resumes (ST-Copilot sessions pattern, lite).
- **Token hygiene**: raw proposal JSON never re-enters history — summaries only (verify current behavior holds for the questions variant).
- Tooling: scenario verbs for interview + provisioning (debugResponse for unit determinism only); **J9 wizard journey** — fresh state (story members/lorebook absent) → premise → real-LLM wizard run → provisioned playable story → first transition fires; journey **cleans up every created asset** (characters, group, lorebook, chat).

Exports: provisioning-op contract + host seams (plan 07's WI curator reuses the lorebook write path + proposal-card review pattern), `questions` protocol (driver may adopt it in v2.2).

## Implementation notes

- **Code home (rule 3)**: wizard orchestration lives in plan-03's `copilotCoordinator` + a new pure `src/wizard/` (interview state machine, provisioning-op validation); `runtimeManager.ts` gains nothing but delegation. Provisioning host calls go through the new `stHost/` modules only.
- Create-only invariant is a hard rule enforced in op validation, not prompt-trusted: ops naming an existing character/lorebook fail validation with a clear message (except `upsertLorebookEntry` against the story's own lorebook).
- **Asset-leak safety**: J9 tags every created asset with a recognizable test marker and the journey ends with a leak assertion (zero test-marked characters / groups / lorebooks remain). A leaked asset is a gate failure — this journey writes to the user's real ST install, so cleanup is load-bearing, not hygiene.
- Rule 8: `test-plan.md` gains the J9 section + wizard rubric in this plan.
- Group reuse: if a group already contains exactly the roster members, offer select-instead-of-create (delegated below).
- gemma-scale models: keep per-stage JSON small; the interview reduces malformed-op risk on thin premises; provisioning cards tolerate partial JSON via the existing proposal repair/validation path.
- Persona tags: everything here is `author`.
- Requirements panel: "Fix with wizard" jumps straight to the provisioning stage pre-filled from the unmet list.
- J9 hygiene mirrors the debug-scripts cast gotcha: created assets tracked and deleted; never touch pre-existing user assets.

## Validation gate

Harness: baseline (incl. structural guards + v2 corpus) + op-validation suites (create-only enforcement, question-variant parse) + Storybook (question cards, provisioning cards, requirements "Fix with wizard"). Live journey gates (fresh-start, real LLM): **J9 green** — real interview, real proposals, real character/group/lorebook creation, leak assertion clean; J2 regression floor. **Human-eval**: one wizard session run by the user (premise → playable story) scored on the wizard rubric — proposal quality and interview usefulness are inherently subjective and automation cannot green this plan alone. Gate record: verified host-fact rows.

## Delegated decisions

- Wizard-session storage home (extension settings vs draft store).
- Group reuse-vs-create policy.
- Whether the wizard drafts an opening scene / first message for the group.

## Unresolved questions

- Should provisioning also cover persona requirements (create/select a persona), or is diagnose-only fine there? (Leaning diagnose-only — personas are personal.)

## Gate record — 2026-08-12 (ACCEPTED, human eval outstanding)

### Verified host facts (appended to `../v2/00-implementation-overview.md` §Verified ST host facts)

| Need | API | Source |
|---|---|---|
| Create a character card | `POST /api/characters/create`, **JSON** body with `getRequestHeaders()`; returns the avatar filename as text | `public/scripts/slash-commands.js:5237`, `welcome-screen.js:869`; server `src/endpoints/characters.js:1024` (`if (!request.file)` at :1037 writes the default avatar) |
| Create a group | `POST /api/groups/create`, JSON body (`members` = avatar filenames); returns the group object incl. `id` | `public/scripts/group-chats.js:2119`; server `src/endpoints/groups.js:156` (`response.send(groupMetadata)` at :187) |
| Reload host caches after creating either | `getContext().getCharacters()` — calls `getGroups()` internally, so one call refreshes characters **and** groups | `st-context.js:230`; `public/script.js:1293` (`await getGroups()` at :1326) |
| Request headers / chat-name stamp | `getContext().getRequestHeaders()`, `getContext().humanizedDateTime()` | `st-context.js:129`, `:237`; `RossAscends-mods.js:169` |
| **Does a lorebook exist?** | `getContext().getWorldInfoNames()` — **not** `loadWorldInfo`, which answers an unknown name with a dummy `{entries:{}}` and caches it | `st-context.js:284`; server `src/endpoints/worldinfo.js:18` (`dummyObject`) + `:29` |
| Make a created lorebook satisfy `requirements.lorebooks` | `createNewWorldInfo` writes the file and refreshes the picker but writes **no** `globalSelect`; activation is a separate `/world silent=true state=on <name>` | `world-info.js:4448`, `:5799`, `:85` |
| Delete a provisioned asset (journey cleanup) | `POST /api/characters/delete {avatar_url, delete_chats}`, `/api/groups/delete {id}`, `/api/worldinfo/delete {name}` | `src/endpoints/characters.js:1414`, `groups.js:203`, `worldinfo.js:81` |

### What landed

- **Interview protocol.** `ProposalResult` gained `status: "questions"` + `questions[]`; a stage answering
  with `{summary, questions:[{id, text, why?, options?[]}]}` and no `ops` is a *valid* outcome, so
  `runAuthoringStage` never spends a repair pass on it. Capped at 3 (`capQuestions`). The UI is
  `WizardQuestions.tsx` — option chips plus free text per question, and **"You decide"**, which sends
  every answer blank; `renderAnswers` folds the answers back as one compact author turn, so the raw
  question block never re-enters history (the same token-hygiene rule the proposal JSON follows).
- **Provisioning ops** (`createCharacterCard`, `createStoryLorebook`, `upsertLorebookEntry`,
  `createGroup`) join the `ProposalOp` union so the parser, the review card and the audit path stay
  single-sourced — but `applyOp` deliberately ignores them and `diffProposal` moves them into a
  separate `provisioning` bucket, so **bulk accept can never reach them**. Each renders as an
  editable `ProvisioningCard` (every field editable before it runs) applied by its own "Create it".
- **Create-only is a code rule, not a prompt.** `src/wizard/provisioning.ts` (pure) is the single
  decision point, called by the card *and* by `copilotCoordinator.applyProvisioning`;
  `planProvisioning` folds the environment forward so a group may name a card the previous step
  created. `lorebookNames` is **every** book, not just the globally selected ones — an inactive book
  the user wrote is still theirs. An existing character, a foreign lorebook, a duplicate group name
  and an unknown cast member are all rejected with a message the author can act on.
- **Requirements go green from evidence.** `provisioningFollowUpOps` turns a created asset into an
  ordinary `setRequirements`/`addRosterMember` mutation — there is no second write path into the
  story, and the panel turns green because the story now requires what exists.
- **Host seams**: `stHost/provisioning.ts` (character + group), `worldInfo.ts` gained
  `createLorebook`/`activateGlobalLorebook`/`lorebookExists`/`listAllLorebooks` and a `constant` flag
  on `upsertWIEntry`. Three context members vendored in `hostTypes.ts` with ledger rows above.
- **Wizard flow + entry points**: settings **"New story (wizard)"** (`#so-new-story-wizard`, fresh
  draft), the Studio's empty-graph **"Start with the wizard"** (`#so-start-wizard`), and the author
  view's **"Fix with wizard"** (`#so-fix-with-wizard`) which opens the provisioning stage pre-filled
  from the unmet list (`provisioningSeed`, personas explicitly excluded). The Copilot tab is now
  labelled **Wizard** (tab id unchanged, so capability probes still work) and carries the stage strip
  incl. `provisioning`, per-stage hints and a "created so far" line (`#so-wizard-created`).
- **Session persistence**: `runtime/wizardSessions.ts` keeps the conversation, the pending stage and
  the created-asset ledger in `extensionSettings["story-orchestrator"].wizardSessions` (cap 8, keyed
  by draft id/title), so an interrupted setup resumes **across a page reload** — the failure the
  deliverable is actually about.
- **Manager budget**: `runtimeManager.ts` **680 → 676** lines (rule 3, net −4) while gaining six
  wizard delegates: the memory half of a rollback moved into `memoryCoordinator.rollbackFromMessage`,
  `onArcsResolved` collapsed into its injected dep, `setEpistemicLedgerCapable` onto one line.
- **Tooling**: `so-ui.mts wizard | open-wizard | new-story-wizard | wizard-run | wizard-answer |
  wizard-apply [index|all]` (also `ui` actions), `copilot: {action: "provision"|"environment"}` and
  `copilot: {action: "stage", expect: "questions"}`, and the new **`so-assets.mts`**
  (`list|remove|assert-clean --marker`) plus the `assets` step key and `cleanup.removeCreatedAssets`.

### Harness

- `npm run typecheck` ✓ · `npm run lint` ✓ · `npm run debug:typecheck` ✓ · `npm run build` ✓
  (pre-existing bundle-size warnings only)
- `npm test` ✓ **57 suites / 1548 tests** (56/1519 before; new `src/wizard/provisioning.test.ts` with
  16 tests, plus create-only/interview/provisioning cases added to `copilot/parse.test.ts`,
  `copilot/proposal.test.ts` and `copilot/authoring.test.ts`)
- `npm run test-storybook:ci` ✓ **25 suites / 98 tests** (23/84 before; new `WizardQuestions.stories.tsx`
  and `ProvisioningCard.stories.tsx`, plus provisioning/interview stories on `ProposalReview`,
  `StudioCopilot`, `StudioModal` and `DrawerTabs`)

### Live — real LLM (gemma4-mtp profile, headed, no `debugResponse`), fresh-start

| Journey / scenario | Result | Notes |
|---|---|---|
| **J9 wizard** | **5 pass / 0 fail**, 2 human skipped | was `not-runnable` |
| J2 author-loop | 9 pass | regression floor held |
| J3 player-session | 8 pass | incl. `assert-player-clean` over the new author-only elements |
| `live-plan12-copilot` | ok (12 steps) | the copilot contract change did not break the v2 corpus |
| `plan12-copilot` | ok (13 steps) | — |

J9 proves, on the real model and against the real install: the wizard asked 3 in-protocol questions
before proposing and **"You decide" produced a valid proposal** (J9.1); create-only held against an
existing character, a non-story lorebook, a duplicate group name and an unknown cast member, with
nothing created (J9.2); a provisioning-only proposal left **"Accept all" disabled**, applying one card
applied exactly one, and applying the rest really created **a character card, a group and a lorebook**
in SillyTavern (J9.3 — cleanup report: `SO-J9 Ferryman`, `SO-J9 Crossing`, `SO-J9 Lore`); "Fix with
wizard" opened the provisioning stage seeded with the missing lorebook (J9.4); and the provisioned
story went requirements-green and fired a real transition from a real reply (J9.5). Cleanup removed
all three assets with `clean: true` — zero leaks.

### Findings fixed during the live gate

1. **`loadWorldInfo` can never answer "does this lorebook exist?"** The server returns a dummy
   `{entries:{}}` for an unknown name (`src/endpoints/worldinfo.js:18`) and the client caches it, so
   `createLorebook` saw every book as existing and reported *"Could not create the lorebook"* for
   every single one — provisioning a lorebook was completely broken. Existence now comes from
   `world_names` (`listAllLorebooks`/`lorebookExists`), and the create-only guard was widened to all
   books rather than only the globally selected ones.
2. **The wizard debug verbs raced React's busy state.** Waiting only for "Working…" to *clear* can
   return before React has even committed it, so a step could assert against a model call still in
   flight. The verbs now wait for the busy state to appear first (tolerating an instant resolve), and
   `wizard-apply` throws on a step that came back with an error instead of leaving the caller to read
   a button label.
3. **Journey cleanup wiped the ledger it depends on.** The config-snapshot restore ran *before*
   `removeCreatedAssets`, clearing `wizardSessions` — the record that catches an asset the model
   renamed off the journey's marker. Asset removal now runs first.
4. **J9 was coupled across checks** (a draft seeded in J9.3 and read in J9.4/J9.5), so it only passed
   in one order and failed under `--only`. Each check now self-seeds from a fixture file
   (`j9-wizard.story.json`, `j9-fixme.story.json`) and J9.5 is order-independent.

### Deviations

- **Character creation uses a JSON POST**, not FormData: the plan's "drop Content-Type for FormData"
  note reflects ST-Copilot's older path, while ST's own `/create` slash command posts JSON and the
  server writes the default avatar when no file is present. Simpler and closer to the host.
- **`createStoryLorebook` prefills `requirements.lorebooks`**, not a `stagecraft.lorebooks` allowlist:
  `stagecraft` does not exist until plan 07. Plan 07's curator reads the same typed field.
- **Delegated: wizard-session home** → extension settings, not the draft store: the point is to
  survive a reload, which an in-memory zustand store cannot.
- **Delegated: group reuse-vs-create** → validation rejects an existing group name and tells the
  author to select it instead. Auto-selecting means switching the chat, which is outside what a
  proposal card should do behind one click.
- **Delegated: opening scene** → yes, but as the card's editable `first_mes`, not a separate stage.
- **Unresolved question (personas)** → resolved as leaning: diagnose-only. The provisioning seed says
  so in as many words, and the prompt forbids persona ops.
- **J9 ships 5 auto + 2 human** (catalog said 4 + 1): the extra auto check is "the provisioned story
  is actually playable" (the plan's "first transition fires"), and the extra human check asks whether
  the author trusted what was about to be created — the specific trust question this feature raises.
- **New script `so-assets.mts`** (not named in the plan): the leak assertion needs a marker-scoped
  view of characters/groups/lorebooks, and putting it in `so-library.mts` would have mixed the story
  library with ST assets.
- **Corrected a stale docs claim** while updating `docs/architecture-v2.md`: it still described
  `talkControlInterceptor` as "a retained no-op stub… it performs no interception", which plan 14
  made false. Docs-truth (rule 5) applies to the file being edited, not only to the new seam.

### Not done

- **Human eval (D2)**: J9.6 and J9.7 plus the standing "what would make you stop using this?" are the
  user's to score — the plan says outright that automation cannot green this plan alone, because
  proposal quality and interview usefulness are subjective. The automated half is green and the
  checklist is emitted in `.debug/journey-J9.md`.
