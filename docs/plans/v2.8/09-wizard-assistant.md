# Plan 09 — The wizard as an in-app assistant

**Status (2026-10-10): built on `v2.8-wizard-assistant`, on by default (owner 2026-10-10: every built feature on,
floors informational; replaces §E's dev-only/off-by-default rollout).** A knowledge base, B Ask (author + player,
`copilot.ask`), C Build a character, §F spike run (results and build decision in §Gate record). Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D; acceptance CL (the `deepseek 4.1 flash` Chat Completion
profile).

The user's words: the wizard should carry this plugin's documentation and SillyTavern's documentation, answer questions
and recommend things. Building characters should come with a proper tutorial. (Topic raised in v2.8 22's decision 4.)

## What exists

- **The agentic wizard** (`src/copilot/agent/*`, v2.6 plan 11) is Studio-only and authoring-only:
  - it writes through typed tools;
  - provisioning always waits for the author;
  - transports are a local profile route or the opencode harness.
- **It already reads a guide.** The `readGuide(topic)` tool reads the compact author's guide
  (`src/copilot/guideTopics.ts`, 33 topics, drift-tested against `docs/authoring/story-guide.md`), with did-you-mean.
- **Its read tools see the whole draft.** `runReadTool` (`src/copilot/agent/readTools.ts:96`) answers `readStory`
  (every checkpoint's name and objective, every transition with its gate, the roster and the story blocks,
  `summarizeStory` at `:17`), `readCheckpoint` (a full checkpoint plus its outgoing gates, `:27`), `readGraph`,
  `readDiagnostics`, `readValidation`, `readQualityUsage`, `readGateOptions`, `readCoverage`, `simulateReachability`,
  `simulateWalk` and the install lookups. That is right for an author and a spoiler leak for a player (Sol F28).
- **Project-side ST know-how exists but does not ship:**
  - four skills: `st-character-authoring`, `st-lorebook-authoring`, `st-scripting`, `st-image-generation`;
  - `.claude/sillytavern-docs/` (incl. the community DOM selectors and memory prior-art);
  - scraped community guides in `docs/tutorials/`.
  - All of it is source-verified and none of it is in the bundle.
- **v2.7 01 built** the feature registry (`src/features/registry.ts`), the player/author/setup guide pages and the Help
  panel ("?", `#so-help-toggle-drawer` / `#so-help-toggle`, `src/components/help/`). That is the knowledge base for "how
  does X work here". The Help panel has no Ask entry yet; this plan adds it (D14).
- **Models per task** already has an `authoring` role (wizard stages, agentic wizard, expansion), routed to any
  Connection Manager profile or the harness (v2.7 14 role map).

## Proposal

### A. One knowledge base, compact and shipped

- **`src/copilot/knowledge/`**: compact topic files compiled into the lazy Studio/assistant chunk (never the main entry;
  bundle budget):
  1. the plugin, generated from the v2.7 01 registry and `docs/guide/**`;
  2. the author's guide (existing `guideTopics.ts`);
  3. SillyTavern know-how, condensed from the four skills and `sillytavern-docs`: cards (fields, where each lands in the
     prompt, greetings, example dialogue, group behaviour, common mistakes), lorebooks (keys, activation, position and
     depth, constant vs keyword, recursion, budget), groups, Connection Manager profiles, Image Generation and
     expressions, regex and Quick Replies basics.
- **Each topic carries:** `source` (repo path or ST file:line), `since`, and an audience tag (`player` | `author` |
  `setup`, the registry's audiences).
- **Drift tests** like `guideTopics.test.ts`: each plugin topic must match its registry entry or guide page, and each ST
  topic must cite a host file that still exists in the pinned ST.
- **Third-party community text is summarised in our own words,** never copied (licensing; the corpus is research input).

### B. Ask mode: answers, not edits

A new mode beside `review` and `auto-draft`: **Ask.** It cannot write: no mutation or provisioning tool exists in either
Ask tool set, enforced by the tool set and not by the prompt.

**Two tool sets, chosen by persona before anything reaches the model:**

| | Author Ask (Author view, or the Studio) | Player Ask (player mode) |
|---|---|---|
| Knowledge | `readGuide`, `readKnowledge(topic)`, `searchKnowledge(query)`, all audiences | `readKnowledge` / `searchKnowledge` over `player` topics only; no `readGuide` |
| Story | the existing draft read/simulate tools, unchanged | **one** tool, `readPlayed`, over the player projection (below); no `readStory`, `readCheckpoint`, `readGraph`, `readDiagnostics`, `readValidation`, `readQualityUsage`, `readGateOptions`, `readCoverage`, `simulate*` |
| Live state | the snapshot, author fields included ("why is the HUD saying X?") | `snapshot.narrative` and `snapshot.pipeline.text` only (the player copy, `runtime/narrative.ts`) |
| Install lookups | yes | no |

- **The player projection** (`src/copilot/agent/playerProjection.ts`, pure) is built from the chat's played state, not
  the draft: the title, the player-facing description, the names of checkpoints in `visitedPath`, the current
  checkpoint's player copy, established facts the Memory tab already shows, and the registry's player topics. No ids, no
  gates, no transitions, no objectives of unreached checkpoints, no quality keys, no epistemic, ledger or held-secret
  rows. It is the same composition the drawer Overview renders, so it inherits that surface's spoiler checklist.
- **Enforced at both edges:** the initial prompt for player Ask is built from the projection alone (the draft is never
  passed to the prompt builder), and `checkToolCall` refuses any tool outside the player set before it runs, with a
  neutral line ("I can only talk about what you have played so far"). A refused call is journaled, never retried.
- **Answers cite their topic**, and a "Show me" button opens the setting or the Studio field (the Repair/Help-panel
  pattern from v2.7 01). Recommendations ("your lorebook entry has no position", "this card's greeting speaks for the
  player") come from the same checks the Studio diagnostics already run, explained in plain words. Author Ask only.
- **Entry points:**
  - the Help panel's **Ask** box, added by this plan to the v2.7 01 Help panel (it is not there today);
  - the Studio wizard tab;
  - `/story ask <question>`: player Ask in player mode, author Ask only with Author view (the `/cp` pattern, T3-4).

### C. Character-building tutorial

- A guided flow in the wizard (Studio → Wizard → "Build a character"), a sibling of the four story steps:
  1. **Who are they** (name, role in the story, one-line concept).
  2. **Look:** the appearance text, used by images and sprites (v2.7 17, v2.7 18).
  3. **Voice:** the description and personality, written as behaviour, not adjectives.
  4. **First message:** only for the opening scene's cast (rule from `src/copilot/prompts.ts`).
  5. **Example dialogue.**
  6. **Review:** the card-mistakes checklist from the `st-character-authoring` skill, run as code checks where possible
     (token budget, greeting speaks for the player, name collisions, the group mention trap).
- **Each step explains why** in two lines, linked to its knowledge topic, and offers "Draft it for me" (the agent
  proposes) or "I'll write it".
- **Where each step lands:**
  - the card fields (steps 1, 3–5) become a **provisioning card**, confirmed by the author (the create-only rule is
    unchanged);
  - the **Look** step writes the story's `illustrations.appearances[<roster id>]` (`src/engine/schema.ts:342`), never
    the card. It is an ordinary story mutation proposed as a diff card through `mutations.ts` and reviewed by the author
    (in `auto-draft` it goes to the draft like any edit; it is never part of the provisioning confirm). A member not yet
    in the roster gets its `addRosterMember` op first (`provisioningFollowUpOps`). If `mutations.ts` has no
    appearance op yet, this plan adds `setAppearance(rosterId, text)` and its agent tool (`tools.test.ts` requires one)
    (D14).
- The same pattern later fits a "Build a lorebook" tutorial (decision 4).

### D. Model route

Ask mode runs on the existing `authoring` role (Models per task, v2.7 14 role map): any Connection Manager profile or
the harness. No new provider layer. Acceptance runs on the **`deepseek 4.1 flash`** Chat Completion profile (the one the
v2.6 sessions ran the read and orchestrator roles on). OpenRouter is not used here (the user has no key, v2.7 14
answer 1).

### E. Rollout (v2.8 rule 9)

Ask is a new runtime model use. It ships **dev-only** until the Q&A floor passes twice on the named profile, then as an
**off-by-default** switch (`assistant.ask`, install-wide). The tutorial's "Draft it for me" uses the existing agent
loop and is not a new use. Player Ask (`/story ask` and the Help Ask box in player mode) is the player-visible surface:
decision 3 is the user's explicit yes to it (v2.8 rule 4; confirmed by the user 2026-10-03, as recommended). Player
Ask follows the same rollout: dev-only, then off by default (rule 9).

### F. Native tool calls over CC profiles (v2.7 14 research decision 3, "sure"; home decided by the user 2026-10-03)

Owner of the spike v2.7 14 approved (Sol r3 R3-15). The agentic wizard on a CC profile today speaks the text JSON
protocol (`localRoute`, `route.ts:38-57`; `requestModelReply` reads text only, `modelReply.ts:180`); the opencode route
already has native tools through the MCP bridge (`harnessRoute`).
- **Prerequisites:** v2.7 14's role picker and per-source context table built (v2.7 02 C14); the DeepSeek API CC profile
  (`deepseek 4.1 flash`) named in the record (the user has no OpenRouter or Anthropic API key, review B6); the v2.6
  plan 11 agent-check fixture frozen at its current revision.
- **Spike (CL, ×2, before the build decision):** a probe per source (does ST forward `tools` and return `tool_calls`
  for this source?), then the v2.6 plan 11 agent checks on the same fixture through three routes: the text protocol on
  the DeepSeek CC profile (control), native tools on the DeepSeek CC profile (arm), and the opencode route (reference).
  **Floor (predeclared, never retuned):** the arm passes every v2.6 plan 11 agent check the control passes, with no more
  refused tool calls than the control and 0 provisioning calls accepted without the author's confirm.
- **Build on PASS ×2:** a `profileToolsRoute` beside `localRoute`/`harnessRoute`, passing `tools` in the override
  payload and reading `tool_calls`, every call still through `checkToolCall` and `mutations.ts`/`validateProvisioningOp`
  (the agentic-wizard invariant); ownership census row; dev-only, then off by default (rule 9). On FAIL: numbers
  recorded, text protocol stays, the route is not built.

## Gates

| Gate | Tier |
|---|---|
| Knowledge drift tests (plugin topics vs registry/guide, ST topics vs pinned host files) | D |
| Ask tool sets contain no write tool (test like `tools.test.ts`) | D |
| **Player Ask projection** (F28): property test over sun-ruins and the Adolion adventurer at every reachable checkpoint: the initial prompt and every player-tool answer contain no unreached checkpoint name, objective, id, gate, quality key, epistemic/ledger/held-secret text (the inline timeline's spoiler property, reused) | D |
| **Refusal** (F28): each author read/simulate tool, called in player Ask, is refused by `checkToolCall` before it runs; a planted control (the tool allowed) makes the projection test fail | D |
| Look writes `illustrations.appearances` through a mutation and a diff card, never a card field and never through provisioning confirm (D14) | D |
| The agent's safety review test (`safety.review.test.ts`) extended for both Ask modes | D |
| Storybook: the Help panel Ask box (player + author), the Studio Ask box, the tutorial steps; a11y plays at 390/768/1440 | D |
| `so-ui.mts assert-player-clean` with the Help Ask box open and an answer rendered | D |
| Registered in the v2.7 01 feature registry + Help (registry test) (B10) | D |
| **Live Q&A:** a scripted set of about 20 author questions ("how do I make a lorebook entry always on?", "why didn't the story advance?", "what does Author view show?") plus about 8 player questions, 3 of them asking about unreached content. Floor predeclared before the run: ≥ 17/20 author answers cite the right topic with a correct "Show me"; 8/8 player answers leak nothing unreached (a second model checks the Adolion-derived rows, never the user; v2.8 rule 11). On the `deepseek 4.1 flash` CC profile, run twice | CL |
| §F probe per source + agent checks on three routes, ×2 (spike, before the build decision) | CL |
| §F on PASS: `profileToolsRoute` unit tests (tools passed, `tool_calls` read, every call through `checkToolCall`; a provisioning call still only waits) | D |
| `npm run gates` | D |

## Decisions for the user

1. One shipped knowledge base (plugin registry/guide + author guide + condensed ST know-how), drift-tested?
   **Recommended: yes.** yes
2. Ask mode is read-only by construction? **Recommended: yes.** yes
3. `/story ask` for players (player topics only)? **Recommended: yes.** yes
4. Character tutorial first, a lorebook tutorial later? **Recommended: yes.** yes
5. Build position: after plan 01 (it needs the registry and guide), before tier 3. **Recommended: yes.** yes 

(Decision 5 in v2.8 terms: after v2.7 01, which is built; its acceptance is CL, not the old "tier 3" RunPod work.)

## Decided 2026-10-03 (user: as recommended)

- Decision 3 counts as the explicit decision v2.8 rule 4 needs for the player Ask surface. Player Ask ships dev-only,
  then off by default (rule 9, §E).
- Homes for two v2.7 14 research decisions (Sol r3 R3-15): the CC native tool-call spike (decision 3) is this plan's
  §F; the optional Critic role (decision 2, "after the wizard work") is `v2.9/05-deferred-items.md` §05.6.

## Links

v2.7 01 docs and registry (knowledge source, Help panel; this plan adds its Ask entry), v2.7 14 role map (authoring
role route), v2.8 22 living story director (shares the agent loop), v2.7 17 images and v2.7 18 sprite generation
(appearance text feeds the Look step), v2.7 20 living cards (per-chat looks build on authored appearances).

## Review 2026-10-03

- **F01:** status line rewritten per plan (decided, not built, Q&A not run).
- **F28:** player Ask gets a projected context and a restricted tool set, enforced before the prompt is built and in
  `checkToolCall`; gates cover the initial prompt and refused reads/simulations of unreached content.
- **D14:** this plan adds the Help "Ask" entry to the v2.7 01 Help panel; the Look step writes
  `illustrations.appearances` through a story mutation reviewed by the author.
- **Live gate on a DeepSeek CC profile:** named (`deepseek 4.1 flash`), tier CL; OpenRouter route dropped.
- **F15:** gate tiers stated per row.
- **B10:** registry + Help gate row added.
- **Rule 9:** Ask ships dev-only, then off by default.
- Not applied: none. Rule 4 for player Ask: decided by the user 2026-10-03 (decision 3 counts).

Round 3 (Sol): R3-15 (§F native tool-call spike; decided by the user 2026-10-03), R3-19 (Critic = research decision 2) applied.

## Gate record (2026-10-10, branch `v2.8-wizard-assistant`)

Built as written, every feature on by default (owner 2026-10-10: private plugin, floors informational; §E's dev-only and
off-by-default rollout does not apply). Merged master (`4b211597`, plan 23 widgets) mid-build.

**A, knowledge base** (`src/copilot/knowledge/`): four families over one `KnowledgeTopic` shape (`id`, `family`, `title`,
`text` capped at 1,500 chars, `audience`, `source`, `since`, `showMe`): `feature/<id>` from the feature registry,
`guide/<page>#<section>` from the shipped guide pages, `author/<id>` from the compact author's guide, and 14 `st/<id>`
topics written in our own words against ST 1.19.0, each citing the host file and an anchor. `readKnowledge` (did-you-mean)
and `searchKnowledge`; player audiences see only player topics. `knowledge.test.ts`: unique ids, caps, full registry, guide
and author coverage, every cited repo path exists, every ST anchor is present in the pinned ST (skipped without `.st-root`),
no 10-word run copied from `docs/tutorials` or `.claude/sillytavern-docs` (planted control).

**B, Ask** (`src/copilot/agent/ask.ts`, `runtime/askHost.ts`): one question, read-only tools, answer + cited topics + Show me.
Author Ask reads the knowledge, the draft (read/simulate/lookup), recipes, the live state and recommendations; player Ask is
built from `runtime/playerProjection.ts` only, with three tools (`searchKnowledge`, `readKnowledge`, `readPlayed`); any other
call is refused in `checkAskCall` before it runs, the reply's topics are filtered to the player audience, a player never gets
a Studio Show me, and a refused read is journaled once. Surfaces: the Help panel's Ask box (`#so-help-ask`, `AskBox`),
`/story ask <question>`, the Studio wizard's Ask mode (`StudioAsk`), `globalThis.storyOrchestratorAsk`. Setting `copilot.ask`
(default on, `#so-copilot-ask`). Pass `ask` on the authoring role; debug response `storyOrchestratorDebugAskResponse`.
Ownership census row `ask.ts#runAsk` local.

**C, Build a character** (`src/copilot/characterTutorial.ts`, `CharacterTutorial`, `#so-character-tutorial`): six steps
(who, look, voice, first message, examples, review), each with its why and its knowledge topics; "Draft it for me" asks the
authoring model for the step. Deterministic review (name taken/sanitised/mention trap/not ASCII, thin description,
adjective-only voice, token budget 2,000, a greeting that speaks for the player or opens no scene, example lines without
`{{char}}:`). The card is a `createCharacterCard` provisioning op (create-only, author-confirmed); the Look step is
`addRosterMember` when needed plus the agent-only op `setAppearance` (mutation `setAppearance`, a reviewed diff card, D14).

**§F, native tool calls over CC profiles**: probe PASS (DeepSeek CC returns `tool_calls` through
`ConnectionManagerRequestService`; `custom` forwards tools per ST source, not probed live; Text Completion not applicable).
Run 1 on lane 27 (DeepSeek CC, `test/measurements/v2.8/09/f-native-tools.json`, predeclared, harness-side bridge): control
(local text route) W1 0.755 PASS, W2 0 of 3 premises finished FAIL, W3 PASS; arm (native) W1 0.857 (72/84) PASS, W2 1 of 3
finished with 0 errors (FAIL: not every premise finished), W3 24/24 PASS. The safety control crashed on a real defect: a model
`updateCheckpoint` carried `talk_control.speakers` as a non-list, `parseFields` accepted any object, and Studio diagnostics
threw inside `decideStep`. Fixed: `talk_control` must be an object whose `speakers` is a list of objects, else the call is
refused with the expected shape (`t63Agent.review.test.ts`, fails on the old check). Run 2 and the safety pair stopped on the
owner's direction (below); owed as 31 M19.

**Owner decisions 2026-10-10 (wizard model, documentation and skills), built:**
- W-1 (final word, replacing an earlier opencode note): DeepSeek is the wizard's model and the primary model for its live
  tests; never Artemis. Built as a code default: an unset authoring role resolves to the install's first DeepSeek Chat
  Completion profile (`passProfiles.roleDefaultFrom` + `setRoleDefault`, wired in `runtime/wiring/generation.ts`, resolution
  `source: "default"`, health-checked and self-testable like an assigned route, shown in Models per task as
  "Default: <name>"). An assigned profile or a harness route wins; every other role keeps the memory model; an install with
  no DeepSeek profile is unchanged. Ask, the tutorial drafts, the staged wizard and the road ahead (all authoring passes)
  follow the same default.
- W-2: native tool calls where the route supports them. When the authoring route is a DeepSeek profile, `resolveAgentHarness`
  returns the profile tool bridge (`stHost/profileToolBridge.ts`, lazy: tools as functions, `tool_calls` answered as `tool`
  messages, failures named auth/quota/transport/timeout) and the agent falls back to its text route on the same profile on
  those failures; a planted copilot answer never reaches it. Every call still goes through `checkToolCall`. Ask stays on the
  text protocol (one question, few calls). Route id stays `harness` in the session record (target `harness: "profile"`).
- W-3, guide coverage: every authorable field has a `readGuide` topic that names it (`copilot/guideCoverage.test.ts`, typed
  maps over `StoryV2`, `Checkpoint`, `CheckpointEffects`, `Transition`, `RosterMember`, `Quality`; found and filled the one
  gap, living cards: new topic `living-cards` in the story guide, the compact topics, the Roster tab and a generated guide
  page). The newer topics (quests, checks, widgets, clues-and-maps, html-panels, chapters, character-life) are asserted present.
  **Stub for plan 22:** `PENDING_GUIDE_TOPICS["living-director"]` reserves the name; `readGuide("living-director")` says it is
  not in this build, and the test fails once the topic exists and the name is still pending (fill at merge).
- W-4, skills: six recipes the agent loads with `readRecipe(recipe)` (`copilot/agent/recipes.ts`, lazy Studio chunk, also an
  author Ask tool, never a player one): `quest-line`, `character-life`, `clue-wall-or-map`, `chapters`, `lore-scope`
  (lore select + curator scope), `group-ready`. Each names the tools in order (first `readGuide`), what to check after
  (`readValidation`, `readDiagnostics`, a simulation where it applies), the diagnostic codes to fix, and traps quoted from the
  guide. The agent's rules list them. `recipes.test.ts` fails on a renamed or missing tool, a topic or diagnostic that does
  not exist or is not explained by one of the recipe's topics, a trap whose cue is no longer in that topic's guide section, or
  a measured task whose required tools drift from its recipe. The character-life recipe needed tools that did not exist:
  `setCharacterLife` (one member's relationships/mood/agenda/schedule, validated with the story's own `readLife`, reviewed)
  and `setClock`, backed by new `gameMutations` exports (`characterLifeTool.test.ts`). `setWidgets`' doc now lists the
  clues/map/html kinds.
- W-5: the DeepSeek runs exercise recipes end to end: `so-wizard-agent.mts recipes` over
  `test/measurements/v2.8/09/recipes.json` (seed story + three tasks in the author's words: quest-line, character-life,
  chapters; a task passes when the agent read that recipe, every required edit tool was accepted, the run finished and the
  draft validates; scored by `wizardAgentScore.scoreRecipeTask`, node-tested). Not run yet (31 M19).

Deviations from the plan text: setting `copilot.ask` (not `assistant.ask`), on by default; the knowledge lives in
`src/copilot/knowledge/` and player Ask reuses `runtime/playerProjection.ts`; "Draft it for me" is one authoring call per step,
not the agent loop; the Studio's Show me opens a tab (no field-level focus); `AskBox` sits in `components/studio/`;
`ASK_TEXT` moved to `features/askCopy.ts` for the main bundle budget.

Commands and results (final tree):
- `npm run gates -- --no-storybook`: **all green in 217.7 s** (typecheck, typecheck:test, build, debug:typecheck, lint, test,
  test:replay 32 of 32 killed, test:plugin, test:release, test:debug). One earlier run had `harness agent.test.mjs` "an answer
  reaches only its own session" time out at 30 s under the parallel load; `npm run test:plugin` alone 120/120, and the next full
  run was green (server-plugin untouched by this branch).
- Main entry `dist/index.js` **1,248,824 B** (budget 1,250,000). After the master merge it was 1,251,212 B: the Ask copy was
  trimmed, the four lazy `askHost` imports share one (`runtime/askEntry.ts`), and `index.tsx`'s `buildReplaySource` moved to
  `studio/replaySource.ts`, which stopped the whole gate-replay engine (`studio/gateReplay.ts`) riding in the main entry
  (-1,890 B; `gateReplay.ts` re-exports it, importers unchanged).
- Storybook: `test-storybook:ci` SKIPPED in the worktree; run against a served static build with `--index-json` before the
  last changes: 690/690. Re-run on master: `Settings/AskBox`, `Settings/HelpPanel` (AskBoxForAPlayer, AskBoxForAnAuthor,
  AskPhone, AskTablet, AskWide), `Studio/StudioAsk`, `Studio/CharacterTutorial`, `Studio/StudioCopilot`
  (AskAndBuildACharacterSitBesideTheWizard, NoAskWithoutARunner), `Settings/RoleProfilesGroup` (new WizardDefaultsToDeepSeek).
- No-model live check: lane 27 on the private ST code copy `C:\dev\so-lanes\agent-st-wizard`, every role on the DeepSeek CC
  profile, extraction off; `test/scenarios/v28-09-ask-player-clean.json --sandbox` ×2 PASS (planted answer, player persona,
  the author topic filtered, `assert-player-clean` with the answer open: no findings). Plumbing only.
- Not run: live Q&A (31 M18), wizard recipes + §F run 2 + safety on DeepSeek (M19), player Ask in real play (M20).

Owner questions:
1. The wizard default picks the FIRST DeepSeek CC profile in Connection Manager order. With two (flash and pro), which one?
   (Assign it under Models per task to override; no key or setup is needed beyond the existing DeepSeek profile.)
2. Player Ask in real play uses the authoring route, so with the default each player question is a DeepSeek call. Keep, or
   route player Ask to the memory model?
3. Ask stays on the text protocol; move it to native tool calls too?
4. Main bundle headroom is 1,176 B after this branch: raise the budget, or keep moving main-entry code lazy as features land?

## Measurements 2026-10-10 (31 M18, M19, M20; branch `v2.8-wizard-measure`)

**Rig.** Master `9b4572f4` (bundle `33e63de7619b`), staged into a private ST code copy (`C:\dev\so-lanes\agent-st-wizm`; the
real ST slot, :8000, lane 0, the 3090 and the pods untouched), lanes 45 and 46 seeded from the owner's install
(`st-lanes seed`, DeepSeek key and opencode login carried over). In both lane copies: every pod and 3090 loopback URL pointed
at the closed port 18079 (`st-lanes pod <n> cloud`, plus the two :18888 profiles), extraction, judge and curator off (no
TypeSafe call at all), the authoring role's explicit assignment (the owner's install pins it to the Unsloth memory profile)
removed so it takes the code default. Lane 45: authoring = the default, the install's only DeepSeek CC profile
`deepseek 4.1 flash` (no pro profile exists, so pro was not run). Lane 46: authoring routed to `harness:opencode:openai/gpt-6.1-sol`;
opencode cache warmed once (`POST /warm`, 22 s). Arms: **A** DeepSeek flash on the product route (`--route harness` = the
profile tool bridge, native tool calls), **B** gpt-6.1-sol through the harness tool bridge (`--route harness`), **C** the text
JSON route on the same DeepSeek profile (`--route local`, control). Ask (M18) is text protocol on every route, so for M18 the
control C is arm A itself. Tokens metered in page from each `/api/backends/chat-completions/generate` and harness
`/complete` response (`usage`); the opencode bridge sessions report no usage, so arm B's tokens below cover only its
non-bridge calls. Every provisioning step was rejected by the drive; `so-assets.mts list` for `SO-W09R`, `SO-W11`, `SO-V28-09`:
nothing created. Evidence (private): `D:\so-evidence\v28-09-wizard-measure-2026-10-10\` (logs, meters, records; the lane
debug dirs rotated round 1's records of lane 45 away before they were copied, so round 1 has scores and refusal counts from
the logs only).

**Host incident.** C: hit 0 bytes free around 10:27-10:44Z. Arm B's first M18 run (10:27Z) got 26 plugin answers
`kind: config` ("the plugin could not prepare the call") and is void; its retry (`r1b`, 10:29-11:12Z) ran with opencode calls
at 28-43 s each and 9 of 20 author questions lapsed ("no answer", 11/20). Two further runs on a recovered host are the
pair counted below. No other file written in the window was damaged (lane settings parse, every record present).

**M18, live Q&A** (floors: >= 17/20 author cited + correct Show me; 8/8 player clean):

| Arm | Run 1 | Run 2 | Floor ×2 | Median / p90 per question | Calls, tokens per run |
|---|---|---|---|---|---|
| A flash | 17/20, 8/8 PASS | 16/20, 8/8 FAIL | not met | 3.0 s / 4.5-5.1 s | 86-90 calls, 77-82K in (59K cached), 4.7K out, 92-96 s |
| B sol | 18/20, 8/8 PASS | 18/20, 8/8 PASS | **met** | 24-26 s / 46-99 s | 91-93 calls, 98-100K in, 3.8-4.0K out, 766-1,062 s |

Misses: flash a02 (cited nothing), a09 (cited `feature/private-knowledge`, accepted `author/drives-motives`), a20 (cited the
memory-model guide section, accepted `feature/reply-thinking`), a14 once (wrong Show me); the answers' content was right in
a09 and a20. Sol: a09/a14 once, a02/a04 once. a02's live state on these lanes says the story is not set up (extraction off), so
both models answered from that state. Player answers 8/8 clean in every run.

**M19, wizard** (fixtures `test/measurements/11/*`, `test/measurements/v2.8/09/recipes.json`; floors unchanged):

| Check | A flash native (r1 / r2) | C flash text (r1 / r2) | B sol bridge (r1 / r2) |
|---|---|---|---|
| W1 first-try valid | 84/101 = 0.832 / 65/81 = 0.802 | 81/100 = 0.810 / 80/97 = 0.825 | 116/120 = 0.967 / 108/120 = 0.900 |
| W2 finished, valid | 1 of 3, 1 valid / 2 of 3, 1 valid | 0 of 3 / 0 of 3 | 0 of 3 / 0 of 3 |
| W3 accepted / proposed | 25/26 / 23/24 | 49/49 / 49/50 | 49/52 / 49/52 |
| Refused calls (run) | 17 / 16 | 10 / 7 | 5 / 12 |
| Recipes (3 tasks) | 0/3 / 0/3 | 1/3 (arin-life) / 0/3 | 1/3 (two-acts) / 2/3 (arin-life, two-acts) |
| Safety W5 escapes | 0/20 / 0/20 | 0/20 / 0/20 | 0/20 / 0/20 |
| Provisioning accepted | 0 | 0 | 0 |
| Wall time run / recipes / safety | 149 / 120 / 295 s; 113 / 106 / 214 s | 200 / 144 / 432 s; 211 / 145 / 406 s | ~1,690 / 1,474 / 2,482 s; 1,728 / 563 / 2,360 s |
| Calls, tokens (run) | 83 calls, 759K in (90 % cached), 10.2K out; 75, 682K, 10.0K | 115, 709K (75 %), 18.0K; 114, 704K, 18.1K | not reported by the bridge |
| Calls, tokens (safety) | 176, 1.49M in, 24.7K out; 147, 1.23M, 21.4K | 253, 1.36M, 39.6K; 244, 1.35M, 39.5K | not reported by the bridge |

Every unfinished premise or task stopped on its step budget (40 per premise, 24 per recipe task) or on a refused `done`
("no group for the cast"): the recipe seed's roster is Arin + DM Narrator, the drive rejects provisioning, and the done
check (`copilot/agent/finish.ts` `wantsGroup`) asks for a group named after the draft unless a `createGroup` was decided,
so an edit-only task can finish only after the agent proposes a group and the author rejects it. Recipe edits themselves
landed: the required tools were accepted in every task but one (A r1 two-acts never called `setChapters`).
The bridge-evidence check flagged one safety attempt in A r2 (attempt 1) and in B r2 (attempt 7): the model refused the
planted instruction with a text reply and no tool call, so no bridge call existed to answer; 0 escapes in both. That is the
check being strict about a zero-call refusal, not a transport failure.

**§F floor over the two consecutive runs here (run 2 and run 3 of §F; run 1 was lane 27)** (arm A vs control C, predeclared): A passes every check C passes (W1, W3, W5; W2
neither) and accepted no provisioning, but its refused-call count is higher on both runs (17 > 10, 16 > 7): **FAIL ×2 as
declared**. The route stays built (owner W-2, 2026-10-10); the numbers are what the floor records.

**M20, player Ask in real play** (`test/scenarios/live-v28-09-ask-player-play.json --sandbox`, group "Group: Arin, DM Narrator",
lane 45 ×2). The reply model is the same DeepSeek flash profile, selected as the main connection in the lane copy (no 3090,
no pod), three real turns (all members answered), Author view off, then three real player questions through the shipped Ask
handle on the authoring default, and `assert-player-clean` with the drawer and the Help Ask box open (it asks one more question
itself). Both runs PASS: the three answers per run name nothing unreached (`Corvin`, `Vault`, `vault-internal`, `traitor_known`,
`Unmask` absent; "I can only talk about what you have played so far"), the help question cites `feature/journal` with its Show
me, the Help-box answer is clean too (`findings: []`), answers in 1.1-2.9 s. No read was refused in either run, so "a refused read is journaled once" stayed
unexercised live (jest covers it). Rig note: the owner's install sets ST's Start Reply With to the Gemma opener
`<|channel>thought\n`; on a DeepSeek CC reply that made every reply a thought only (the empty-reply recovery fired and left
them), so the scenario clears it in memory before the first turn (the lane copy then saved the cleared value).

**Recommendation (wizard default model).** Keep **DeepSeek flash** as the default, on the native profile bridge. Against its own
text route it finished more premises (3 of 6 vs 0 of 6, 2 valid), with fewer calls (75-83 vs 114-115 per run), 45 % less
output, 25-45 % less wall time, and the same safety; it misses the §F floor on refused calls only. It answers Ask in 3 s
(sol: 24-26 s) and met the Q&A floor on one of two runs (17, 16). gpt-6.1-sol is the better author (W1 0.90-0.97, recipes 3 of 6,
Q&A 18/20 ×2) but 5-15× slower per job (a wizard run 28-29 min against 2 min) and its spend is not metered by the bridge;
offer it as the opt-in "careful" route under Models per task, not as the default. Neither model passes W2 or the recipe floor
as declared; both failures trace to the step budgets and the done check's group rule more than to the edits.

Owner questions:
1. The done check asks for a new group even when an existing group already holds the whole cast (here "Group: Arin, DM
   Narrator") and the task only edits the story. Accept an existing group holding the cast, or keep "the story's own group"?
2. Raise the measured step budgets (40 per premise, 24 per recipe task) for the next run, or keep them as declared?
3. Should a zero-call refusal count as bridge evidence in `bridgeEvidenceProblems` (harness change, no product change)?
4. Ask's three steady misses (a02, a09, a20) cite a sibling topic with the right content: widen those rows' accepted topics
   (a fixture change, after this run), or leave the floor as is?

## Owner decisions 2026-10-10 (branch `v2.8-owner-decisions`)

The recommendation above is **overruled**: the owner has an OpenAI subscription, while DeepSeek is pay per token once
its quota runs out.

- **Wizard default model.** With nothing picked for "Wizard and road ahead", the order is: (a) opencode
  `openai/gpt-6.1-sol` through the harness tool bridge, when the harness plugin offers it (installed, offered, not
  blocked, not logged out, agent bridge on, the model listed); (b) otherwise the first DeepSeek Chat Completion
  profile, as before; (c) otherwise the memory model. A profile or harness the author assigns still wins.
  `passProfiles.ts` (`AUTHORING_DEFAULT_HARNESS`, `RoleDefault` now returns ordered candidates, `defaultFallbackRoute`),
  `harnessCache.ts` (`rowOffersAgent`, `harnessOffersAgent`, read from the status cache the startup plugin check fills;
  the snapshot is re-composed once it lands), `studio/agentHost.ts` (`defaultHarnessRoute` ahead of the DeepSeek native
  bridge, `fallback: true`). A default sol call that fails on transport/timeout/auth/quota is answered by the next
  default (the DeepSeek profile, else the memory model) through `answerFallback`; an author-picked harness keeps its own
  `onFailure` rule. The settings select reads "Default: opencode · openai/gpt-6.1-sol" (`routeLabel`).
- **Ask** shares the authoring role, so it follows the same default. Player Ask too: **decided to keep it on the same
  default** (one rule, no per-token cost on a subscription); the cost is ~25 s per player answer against ~3 s on
  DeepSeek flash (M18), and an author who wants fast player answers picks the DeepSeek profile for the task. The road
  ahead (generation, critic, suggestions) also rides the authoring role, so it moves to sol too.
- **Done check** (question 1): an existing group whose members hold the whole cast (`draftCastNames`) is accepted,
  whatever its name (`finish.ts` `castGroupExists`, the environment's new `groupCasts` from `stHost/provisioning.ts`
  `listGroupCasts`). Test `copilot/agent/finishGroup.test.ts`, negative controls: a group missing one member, the cast
  split over two groups, no member list.
- **Step budgets** (question 2): 40 → 60 per premise and 24 → 36 per recipe task in `scripts/debug/so-wizard-agent.mts`.
  The product's `DEFAULT_AGENT_BUDGET.maxSteps` (`copilot/agent/loop.ts`) is a separate constant that bounds every real
  run (and each Continue slice); it was the same 40, so it moved to 60 too. The 36 per recipe task is harness only.
- **Safety harness** (question 3): in `safety` only, a bridge session that opened, carried no tool call and ended with a
  plain-text `done` is safe (nothing written; `w5Escapes` still checks the install and the replay):
  `bridgeEvidenceProblems(..., { textRefusalSafe: true })`, `textOnlyRefusal`. `run`, `recipes` and `bridge-check` keep
  the strict reading. node:test with controls (an unanswered call, no session, an `ended` stall).
- **Ask golden** (question 4): accepted topics widened in `test/measurements/v2.8/09/ask-qa.json` (its `widened` key):
  a02 + `author/transitions` (the gate the player could not pass lives on the transition), a09 +
  `feature/private-knowledge` and `author/character-life` (a private agenda reaches only its holder's block), a20 +
  `guide/setup/memory-model#options-in-the-same-group` (that section documents Reply thinking). Each is the sibling a
  model cited with a correct answer in M18. The 17/20 floor is unchanged; a02's "cited nothing" misses stay misses.

## Gate record (2026-10-10, owner decisions, branch `v2.8-owner-decisions` from master `f031637b`)

- `npm run gates -- --no-storybook --jobs=2`: **all green**, 163.3 s: jest 652 suites, 7622 passed, 1 skipped; defect replay
  32 of 32 killed; build, typecheck, typecheck:test, debug:typecheck, lint, test:debug, test:plugin, test:release ok.
  Storybook skipped (`--no-storybook`); stories to re-run: `Settings/RoleProfilesGroup` (all, new `WizardDefaultsToSol`,
  `CloudTasksOutsideAuthorView`; `HarnessRoute`, `GroupedBySource` still assert the egress line in Author view).
- `npm run typecheck:test`: green (also run separately).
- Two red runs before the green one: `t52Wizard.review.test.ts` hard-coded the 40-step budget (now reads
  `DEFAULT_AGENT_BUDGET`), `typedResults.test.ts` needed `rowOffersAgent`/`harnessOffersAgent` listed as reads; a story
  line over 200 chars.
- New jest: `runtime/authoringDefault.test.ts` (sol default, order, fallback, role view), `studio/agentHost.test.ts`
  (sol bridge, five not-offered shapes, assigned/planted), `copilot/agent/finishGroup.test.ts`; node:test in
  `scripts/debug/lib/wizardAgentDrive.test.mts`.
- No live gate (nothing staged into ST). Owed: M18 re-score with the widened golden, M19 at 60 / 36 steps, and one live
  check that a fresh install with opencode offered shows "Default: opencode · openai/gpt-6.1-sol" and runs the wizard on
  the bridge; `so-ui.mts assert-player-clean` with a cloud task assigned (F23).
