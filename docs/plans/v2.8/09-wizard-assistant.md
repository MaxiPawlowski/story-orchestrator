# Plan 09 — The wizard as an in-app assistant

**Status (2026-10-03): v2.8 plan 09 (was v2.7 plan 27). Decided (all five recommendations, answers below); not built;
live Q&A set not written or run.** Overview: `00-overview.md`.
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
