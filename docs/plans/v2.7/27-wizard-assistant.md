# Plan 27 — The wizard as an in-app assistant

**Status: DRAFT 2026-10-03 (topic from the user, raised in plan 24 decision 4). Not approved, not built.** Overview:
`00-overview.md`.

The user's words: the wizard should carry this plugin's documentation and SillyTavern's documentation, answer questions
and recommend things. Building characters should come with a proper tutorial.

## What exists

- **The agentic wizard** (`src/copilot/agent/*`, v2.6 plan 11) is Studio-only and authoring-only:
  - it writes through typed tools;
  - provisioning always waits for the author;
  - transports are a local profile route or the opencode harness.
- **It already reads a guide.** The `readGuide(topic)` tool reads the compact author's guide
  (`src/copilot/guideTopics.ts`, 33 topics, drift-tested against `docs/authoring/story-guide.md`), with did-you-mean.
- **Project-side ST know-how exists but does not ship:**
  - four skills: `st-character-authoring`, `st-lorebook-authoring`, `st-scripting`, `st-image-generation`;
  - `.claude/sillytavern-docs/` (incl. the community DOM selectors and memory prior-art);
  - scraped community guides in `docs/tutorials/`.
  - All of it is source-verified and none of it is in the bundle.
- **Plan 01** builds the feature registry, the player/author/setup guide pages and a Help panel. That is the natural
  knowledge base for "how does X work here".

## Proposal

### A. One knowledge base, compact and shipped

- **`src/copilot/knowledge/`**: compact topic files compiled into the lazy Studio/assistant chunk (never the main entry;
  bundle budget):
  1. the plugin, generated from plan 01's registry and `docs/guide/**`;
  2. the author's guide (existing `guideTopics.ts`);
  3. SillyTavern know-how, condensed from the four skills and `sillytavern-docs`: cards (fields, where each lands in the
     prompt, greetings, example dialogue, group behaviour, common mistakes), lorebooks (keys, activation, position and
     depth, constant vs keyword, recursion, budget), groups, Connection Manager profiles, Image Generation and
     expressions, regex and Quick Replies basics.
- **Each topic carries:** `source` (repo path or ST file:line), `since`, and an audience tag.
- **Drift tests** like `guideTopics.test.ts`: each plugin topic must match its registry entry or guide page, and each ST
  topic must cite a host file that still exists in the pinned ST.
- **Third-party community text is summarised in our own words,** never copied (licensing; the corpus is research input).

### B. Ask mode: answers, not edits

- A new mode beside `review` and `auto-draft`: **Ask.**
  - The model gets read-only tools: `readGuide`, `readKnowledge(topic)`, `searchKnowledge(query)`, the existing
    read/simulate tools over the open draft, and the plugin's live state (via the snapshot: "why is the HUD saying
    X?").
  - **It cannot write.** No mutation or provisioning tools in Ask mode, enforced by the tool set and not by the prompt.
- **Answers cite their topic**, and a "Show me" button opens the setting or the Studio field (the Repair/Help-panel
  pattern from plan 01). Recommendations ("your lorebook entry has no position", "this card's greeting speaks for the
  player") come from the same checks the Studio diagnostics already run, explained in plain words.
- **Entry points:** the Help panel's "Ask" box (plan 01), the Studio wizard tab, and `/story ask <question>`
  (player-safe topics only in player mode; author topics need Author view).
- **Player mode** answers only player-audience topics and never reads the story's unreached content. The spoiler rules
  apply; a jest property covers it, like the inline timeline's.

### C. Character-building tutorial

- A guided flow in the wizard (Studio → Wizard → "Build a character"), a sibling of the four story steps:
  1. **Who are they** (name, role in the story, one-line concept).
  2. **Look:** the appearance prompt, used by images and sprites.
  3. **Voice:** the description and personality, written as behaviour, not adjectives.
  4. **First message:** only for the opening scene's cast (rule from `src/copilot/prompts.ts`).
  5. **Example dialogue.**
  6. **Review:** the card-mistakes checklist from the `st-character-authoring` skill, run as code checks where possible
     (token budget, greeting speaks for the player, name collisions, the group mention trap).
- **Each step explains why** in two lines, linked to its knowledge topic, and offers "Draft it for me" (the agent
  proposes) or "I'll write it".
- **The result is a provisioning card**, confirmed by the author (the create-only rule is unchanged).
- The same pattern later fits a "Build a lorebook" tutorial.

### D. Model route

Plan 13's research applies: Ask mode runs on the "authoring" role profile (any Connection Manager profile, cloud
included, OpenRouter documented as the one-key option). No new provider layer.

## Gates

- **Pure:** knowledge drift tests; Ask-mode tool set has no write tools (test, like `tools.test.ts`); player-mode
  topic filter (spoiler property).
- **Agent:** the agent's safety review test extended for Ask mode.
- **UI:** Storybook for the Ask box and the tutorial steps.
- **Live:** a scripted Q&A set of about 20 questions ("how do I make a lorebook entry always on?", "why didn't the story
  advance?", "what does Author view show?"), answered from the right topic with a correct "Show me". The floor is
  predeclared, and a cloud authoring profile is used (no RunPod).
- `npm run gates`.

## Decisions for the user

1. One shipped knowledge base (plugin registry/guide + author guide + condensed ST know-how), drift-tested?
   **Recommended: yes.** yes
2. Ask mode is read-only by construction? **Recommended: yes.** yes
3. `/story ask` for players (player topics only)? **Recommended: yes.** yes
4. Character tutorial first, a lorebook tutorial later? **Recommended: yes.** yes
5. Build position: after plan 01 (it needs the registry and guide), before tier 3. **Recommended: yes.** yes 

## Links

01 docs and registry (knowledge source, Help panel "Ask"), 13 multi-provider (authoring role route), 24 living story
(the director shares the agent loop), 26 images (appearance prompts feed the look step).
