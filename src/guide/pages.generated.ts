import type { GuidePage } from "./types";

export const GUIDE_PAGES: GuidePage[] = [
 {
  "id": "README",
  "doc": "README.md",
  "audience": "player",
  "title": "Story Orchestrator guide",
  "headings": [
   {
    "level": 1,
    "text": "Story Orchestrator guide",
    "slug": "story-orchestrator-guide"
   },
   {
    "level": 2,
    "text": "Install",
    "slug": "install"
   },
   {
    "level": 3,
    "text": "Tested on",
    "slug": "tested-on"
   },
   {
    "level": 2,
    "text": "First story in five minutes",
    "slug": "first-story-in-five-minutes"
   }
  ],
  "body": "# Story Orchestrator guide\n\nStory Orchestrator is a SillyTavern extension that plays authored stories over a chat: scenes that open in order,\ncharacters who enter and leave, lore that switches on when it matters, and a memory of what happened. You play by\nchatting, as always.\n\n**Stories play in group chats.** Each character keeps their own voice and what they know, so a story needs a group\nwith its cast, even a one-character story (that character plus a narrator). In a one-on-one chat the story stays off\nand offers to make the group for you.\n\n| You want to | Read |\n|---|---|\n| Install it and play something in five minutes | this page |\n| Understand what you see while playing | [Player guide](player/README.md) |\n| Fix \"the story does not move\" | [Troubleshooting](player/troubleshooting.md) |\n| Set up the memory model, the judge, images or the harness | [Setup](setup/README.md) |\n| Write your own story | [Author's guide](author/README.md) |\n| Work on the code | [Developer docs](../dev/contributing.md) |\n\nThis guide also ships inside the extension: **Help → Open the guide**, any **Read more** in Help, or `/story guide`.\nAuthor pages show there only in Author view.\n\n## Install\n\n**From a release zip (recommended).** A release is one file, `story-orchestrator-<version>.zip` (attached to a GitHub\nrelease, or built with `npm run package`). Unzip it so that its `story-orchestrator/` folder lands at\n\n```\n<SillyTavern>/public/scripts/extensions/third-party/story-orchestrator\n```\n\nThe zip already holds the built extension (`dist/`), the example story and the optional server plugins. Reload\nSillyTavern; the panel appears under **Extensions → Story Orchestrator**.\n\n**From source.** Clone the repository anywhere outside SillyTavern, then:\n\n```bash\necho <SillyTavern root> > .st-root     # or set ST_ROOT; the build records hashes of SillyTavern's files\nnpm ci\nnpm run build\nnpm run stage\n```\n\n`dist/` is not in the repository, so the build is not optional. `stage` copies exactly the files a release would\nship into the extension folder (and refuses a folder that holds a source checkout).\n\nServer plugins are optional and installed separately: [Server plugins](setup/README.md#server-plugins).\n\n### Tested on\n\nThe extension is exercised against one host at a time; this is the one it was last exercised on.\n\n| | |\n|---|---|\n| SillyTavern (live play) | 1.19.0, commit `7c399419636c4df3d6d035fcddf9ccbb8248b432` (`host.commit` in `dist/manifest.json`) |\n| SillyTavern (clean install) | 1.19.0, commit `06bde939fb1e9c4c8d8641d810f0a916b5bce127` (`release`, cloned clean): machine gates only, no live play |\n| Declared older host | 1.18.0 (`minimum_client_version`), commit `51ad27fb86d39a3daca3adaa970375c9670c12df`: typecheck, lint, test, build and release tests green; not played through |\n| Host files | the SillyTavern modules the extension imports, hashed in `dist/manifest.json` → `host.files` |\n| Browser | Chromium, desktop and a 390×844 phone viewport |\n| Main model | TheDrummer Artemis 31B v1.1 Q4_K_M on llama.cpp, Connection Manager profile |\n| Memory model | the same profile; an **instruct template is required** (an untemplated prompt degenerates into token loops) |\n\n**Not tested on other SillyTavern versions.** The extension imports SillyTavern modules by path (`/script.js`,\n`/scripts/world-info.js`, …) and hashes them at build time, so a version whose files differ is one nobody has run it\nagainst. **Setup → Host capabilities** reports each feature it probes (`macros`, `slashCommands`,\n`backgrounds`, `vectors`, `judge`) as present, absent or error, and **Copy for a bug report** pastes the whole picture.\n\n## First story in five minutes\n\n1. **Choose a memory model.** In SillyTavern, make a Connection Manager profile for a model (with the right instruct\n   template). In **Extensions → Story Orchestrator → Memory**, pick it as the **Memory model profile** and\n   press **Test memory model**. ([More](setup/memory-model.md))\n2. **Get a story.**\n   - The bundled example: **Start → Import a story** and load\n     `examples/sun-ruins/quest-for-the-sun-ruins.json`. It needs four character cards, a group and a lorebook, all in\n     the same folder ([how](author/examples.md)).\n   - Or your own: turn on the wizard under **Authoring**, then **Start → New story (wizard)**. Describe a\n     premise; it proposes the story and offers to create the cards, lorebook and group, one at a time.\n3. **Open the story's group chat** and choose the story under **Continue** if it is not already playing.\n4. **Play.** Click the story bar above the chat box to open the drawer: where you are, what happened, what is open.\n   If something is missing, **Repair** names it.\n\n---\n\nStory Orchestrator is AGPL-3.0. Source: <https://github.com/MaxiPawlowski/story-orchestrator>.\n"
 },
 {
  "id": "author/README",
  "doc": "author/README.md",
  "audience": "author",
  "title": "Writing a story for Story Orchestrator",
  "headings": [
   {
    "level": 1,
    "text": "Writing a story for Story Orchestrator",
    "slug": "writing-a-story-for-story-orchestrator"
   },
   {
    "level": 2,
    "text": "Start here",
    "slug": "start-here"
   },
   {
    "level": 2,
    "text": "Tools",
    "slug": "tools"
   },
   {
    "level": 2,
    "text": "The fields, one page per topic (41)",
    "slug": "the-fields-one-page-per-topic-41"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md. Edit the source, then run npm run docs:guide. -->\n\n# Writing a story for Story Orchestrator\n\nThis guide is for the person who writes the story: the premise, the turning points, the cast and what has to be true to move on. It covers every field a format-2 story can carry, what each one does while someone plays, what a good one looks like, what a bad one looks like, and what goes wrong when it is missing or mistaken.\n\nYou do not need to read it top to bottom. The Studio shows the matching section under \"How to write this\" on each editor, and the wizard's agent reads the same sections through its `readGuide` tool. Each section below is one guide topic; the marker under its heading is the topic's name.\n\nWhere the guide says \"the reading model\" it means the memory model that reads the chat after each turn and fills in the story's qualities. Where it says \"the judge\" it means the small judgment model, which picks from lists. Where it says \"the narrator\" it means the model that writes the replies the player reads.\n\nSources of truth: the schema is `src/engine/schema.ts`, the parser is `src/engine/validate.ts` and `src/engine/validate/*.ts`, the agency defaults are `src/engine/agency.ts`, and the Studio checks are `src/studio/diagnostics.ts` (`DIAGNOSTIC_CONSEQUENCES`), `src/studio/authoringDiagnostics.ts` and `src/studio/chapterDiagnostics.ts`. If this guide and the code disagree, the code is right and this guide is a bug.\n\n## Start here\n\n- [How a story plays](how-a-story-plays.md): the two rules most advice comes from.\n- [Build a story step by step](step-by-step.md): the wizard's four steps, done by hand or with the wizard.\n- [Good practices and traps](good-practices.md): what live play taught, one line each.\n\n## Tools\n\n- [Checkpoint Studio](studio.md): the visual editor: tabs, diagnostics, saving to the library.\n- [The setup wizard](wizard.md): from a premise to a playable story, and what it creates on your install.\n- [Macros and slash commands](macros-and-commands.md): story values in your cards and prompts, and the author commands.\n- [Examples](examples.md): a complete story to read, import and play.\n\n## The fields, one page per topic (41)\n\n- [Title, description and id](topics/story-basics.md) (`story-basics`)\n- [Briefing](topics/briefing.md) (`briefing`)\n- [Who the player is](topics/player.md) (`player`)\n- [Dramatic shape](topics/arc-template.md) (`arc-template`)\n- [Requirements](topics/requirements.md) (`requirements`)\n- [Cast](topics/roster.md) (`roster`)\n- [Drives and motives](topics/drives-motives.md) (`drives-motives`)\n- [Qualities](topics/qualities.md) (`qualities`)\n- [Rubrics](topics/quality-rubric.md) (`quality-rubric`)\n- [Latching and monotonic](topics/latching.md) (`latching`)\n- [How a quality is read](topics/quality-reads.md) (`quality-reads`)\n- [Chance rolls](topics/chance-roll.md) (`chance-roll`)\n- [Checkpoints](topics/checkpoints.md) (`checkpoints`)\n- [Objectives and player agency](topics/objective-agency.md) (`objective-agency`)\n- [Open stretches](topics/open-stretches.md) (`open-stretches`)\n- [Tension targets](topics/tension.md) (`tension`)\n- [Narrator guidance](topics/guidance.md) (`guidance`)\n- [Author's note](topics/author-note.md) (`author-note`)\n- [Beat lore](topics/world-info.md) (`world-info`)\n- [Preset](topics/preset.md) (`preset`)\n- [Background](topics/background.md) (`background`)\n- [Scenario](topics/scenario.md) (`scenario`)\n- [Cast changes](topics/cast-changes.md) (`cast-changes`)\n- [The opening scene](topics/opening-scene.md) (`opening-scene`)\n- [NPC replies](topics/npc-replies.md) (`npc-replies`)\n- [Experimental effects](topics/experimental-effects.md) (`experimental-effects`)\n- [Gates](topics/gates.md) (`gates`)\n- [Transitions](topics/transitions.md) (`transitions`)\n- [Convergence](topics/convergence.md) (`convergence`)\n- [Thread bridges](topics/arc-bridges.md) (`arc-bridges`)\n- [Speaker direction](topics/talk-control.md) (`talk-control`)\n- [Curator scope](topics/stagecraft.md) (`stagecraft`)\n- [Lore select](topics/lore-select.md) (`lore-select`)\n- [Scene places and times](topics/scene-read.md) (`scene-read`)\n- [House rules](topics/house-rules.md) (`house-rules`)\n- [Chapters](topics/chapters.md) (`chapters`)\n- [Illustrations and display](topics/presentation.md) (`presentation`)\n- [Quests and milestones](topics/quests.md) (`quests`)\n- [Checks](topics/checks.md) (`checks`)\n- [Stats and story panels](topics/widgets.md) (`widgets`)\n- [Character life](topics/character-life.md) (`character-life`)\n"
 },
 {
  "id": "author/examples",
  "doc": "author/examples.md",
  "audience": "author",
  "title": "Examples",
  "headings": [
   {
    "level": 1,
    "text": "Examples",
    "slug": "examples"
   },
   {
    "level": 2,
    "text": "Quest for the Sun Ruins",
    "slug": "quest-for-the-sun-ruins"
   }
  ],
  "body": "# Examples\n\n## Quest for the Sun Ruins\n\n`examples/sun-ruins/` is a complete, playable story that ships with the extension. It uses most of the format:\nlatching and enum qualities, typed gates with cues, a branch (bring Luke or not) that rejoins, a riddle sub-branch,\ncheckpoint effects (author's note, lore, cast changes, scripted lines, a preset), convergence toward the finale and\nthread bridges.\n\nFiles:\n\n- `quest-for-the-sun-ruins.json`: the story. Import this.\n- `Xentar Checkpoints.json`: the lorebook its scenes switch on.\n- `Arin.png`, `DM Narrator.png`, `Luke.png`, `Ponticius.png`: the four character cards.\n\nTo play it:\n\n1. Choose a memory model ([Memory model](../setup/memory-model.md)).\n2. **Start → Import a story** and paste or load `quest-for-the-sun-ruins.json`.\n3. Import the four cards, make a group chat with all four, and import the lorebook. Or turn on Author view and press\n   **Fix with wizard**: it proposes each missing card, the lorebook and the group, and creates only what you accept.\n4. Open the group chat and play. The drawer's requirement dots turn green once everything is present.\n\nRead the JSON next to [the fields](README.md) to see each topic used in a real\nstory. `examples/README.md` has more detail.\n\n---\n\n[Author's guide](README.md)\n"
 },
 {
  "id": "author/good-practices",
  "doc": "author/good-practices.md",
  "audience": "author",
  "title": "Good practices and traps",
  "headings": [
   {
    "level": 1,
    "text": "Good practices and traps",
    "slug": "good-practices-and-traps"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (Part 2). Edit the source, then run npm run docs:guide. -->\n\n# Good practices and traps\n\nEach item names where it was learned: a test session, the bundled campaign, or a diagnostic.\n\n**Qualities and gates**\n\n1. **Latching enums never list \"undecided\".** The first read latches the placeholder and the arc never starts. Leave the unset state as no value and write the rubric to stay silent until it happens. (Memory note `story-authoring-traps.md`; campaign `INTEGRATION.md`; diagnostic `latching-enum-placeholder`.)\n2. **Gate only on what the extraction pass can observe.** Thoughts, off-screen events and things the narrator never writes leave the gate shut and the story stalled. (T4-2-1 `reached_walls`; T2 `acad_path`, Findings.)\n3. **Make the rubric and the exit's `extraction_hint` say the same thing**, in the fiction's own words, never a name the player has not heard yet. (Findings, T2-1/3/5 follow-ups.)\n4. **Party moves are `evidence_from: \"party\"`, outcomes that open an anchor are `world`.** Under `world` a party move is never proved by the player's line; under `any` an outcome is proved by the player writing that it happened. (Findings, T2-1 and T3-1; diagnostic `quality-outcome-player-evidence`.)\n5. **Calibrate `commit_evidence` with real accept and hold lines**, and avoid bare words. (Findings, T0 and T1; campaign `STORY-TUTORIAL.md`.)\n6. **Chance rolls only on code-sourced bool or int qualities**, and a roll decides the world, never the player's act. (Parser `readRoll`; campaign `ACT-GUIDE.md`; Findings SP7.b.)\n7. **Name each clue as its own value** rather than gating on a loose counter. (Findings, T2-2.)\n8. **Give a `location` enum player labels and list the places under scene read.** (Findings, T0; diagnostic `scene-read-location-empty`.)\n\n**Cast and speakers**\n\n9. **Requirements name characters by card name, never roster id.** (T5-2-1; diagnostic `requirement-member-roster-id`.)\n10. **First messages for the opening scene only; `cast_changes` mutes later arrivals at the start beat** and enables each where they enter. (T5 summary; rule text in `src/copilot/prompts.ts`.)\n11. **A talk lead goes in `speakers`, and so does every enabled character the player may address.** (Findings, T1; diagnostic `talk-lead-outside-speakers`.)\n12. **Use `{{groupNotMuted}}` on a narrator card, not `{{group}}`.** `{{group}}` includes muted members and the narrator treated them as present. (Findings, T1; campaign `INTEGRATION.md`.)\n13. **Give every character the narrator must recognise a lore or scene line.** A muted character with no lore was recast as a \"royal advisor\". (Findings, T2-2.)\n14. **Card names are first names.** \"X the Y\" makes every \"the\" a mention of that member. (Campaign `PLAN.md`.)\n\n**Steering text**\n\n15. **Drives and motives are the character's private aim, in one line, never a plan for the player and never for the player's persona.** (Plan `06-inner-voice.md`; T3 summary; diagnostics `motive-for-player`, `motive-member-unknown`.)\n16. **Guidance is pressure and intent, never the ending, and a secret goes in the member's own entry.** (Findings, T0; spec §Data model guidance rule.)\n17. **Call the player `{{user}}`, never \"the player\".** (Findings, T1.)\n18. **One house rule, one demand.** (Diagnostic `house-rule-compound`; campaign `ACT-GUIDE.md`.)\n19. **Set or clear the author's note on purpose.** A beat without one keeps the last; a beat with one loses its objective line. (Diagnostic `checkpoint-inherits-author-note`; `engine/agency.ts`.)\n20. **Choose `objective_kind` per beat, and give refusals an `alternate` that rejoins.** (`engine/agency.ts`; campaign `ADAPT-v2.5.md`, `ACT-GUIDE.md`.)\n\n**Scripted lines and openers**\n\n21. **Scripted lines have no time or place check.** Word them to fit wherever they fire, or use an `llm` reply with an instruction. (Findings, T3 and T4.)\n22. **Exactly one `new_chat_only` opener per story**, and none when an entering reply already introduces the character. (Campaign `STORY-TUTORIAL.md`; Findings, T3-4/T3-6.)\n\n**Lore**\n\n23. **The World Info curator has no create op.** Seed its book with every entry play should keep current. (Memory note `story-authoring-traps.md`; `src/stagecraft/types.ts` `WiCuratorOp`.)\n24. **Checkpoint-gated lore and curator scope never overlap.** Gated entries are rebuilt from the path each beat, so the curator is refused there. (`stagecraft/scope.ts`; campaign `INTEGRATION.md`.)\n25. **A gated secret is never a constant entry with no character filter.** (Findings, T3-1.)\n26. **Every book the story relies on is under `requirements.lorebooks`**: beat lore, lore select and the curator book. (Diagnostic `lore-select-inactive`; campaign `INTEGRATION.md`.)\n27. **Check lore keys against the whole cast.** \"Evergreen\" fired on Dalan Evergreen. (Campaign `STORY-TUTORIAL.md`.)\n\n**Player copy**\n\n28. **`player_name`, `player_text` and chapter `player_title` show to the player**: name the place, not the outcome, and keep them true on every path in. (Findings, T2 and T3-4/T3-6; campaign `ACT-GUIDE.md`.)\n\n---\n\n[Author's guide](README.md) · next: [Build a story step by step](step-by-step.md)\n"
 },
 {
  "id": "author/how-a-story-plays",
  "doc": "author/how-a-story-plays.md",
  "audience": "author",
  "title": "How a story plays",
  "headings": [
   {
    "level": 1,
    "text": "How a story plays",
    "slug": "how-a-story-plays"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (How a story plays). Edit the source, then run npm run docs:guide. -->\n\n# How a story plays\n\nA story is a graph of beats (checkpoints) joined by exits (transitions). Each exit has a condition (a gate) over the story's tracked facts (qualities). Exactly one beat is active at a time.\n\nAfter each reply the reading model reads the recent chat and proposes changes to the qualities, each backed by a quoted line. The changes are applied at the next turn boundary, after a reply has finished. Then the exits of the active beat are checked; when one opens, the story moves to the next beat and that beat's effects run (lore switches on, the cast changes, a background appears, a character speaks). One exit fires per turn.\n\nTwo things follow, and most of the advice below comes from them:\n\n- **The story only knows what the chat shows.** A gate on a thought, a mood or something that happened off screen never opens, because nobody can quote it.\n- **The chat can be rewound.** Swipes, edits and deletions roll the story back. Effects are rebuilt from the path the chat took, so they must depend on the path, never on the clock.\n\nA player line that is wholly out of character (wrapped in `((…))`, or starting `OOC:` / `(OOC`) stays in the chat the narrator sees, but the reading model is never shown it: it sets no quality, fact or memory, and it is no player turn for open-stretch pace, agendas or a refused route (`src/engine/ooc.ts`). A continuity note waiting for review does not lapse on it, and the story panel's log does not list it. Tell players to correct the story with an edit, not an OOC line.\n\n---\n\n[Author's guide](README.md) · next: [Title, description and id](topics/story-basics.md)\n"
 },
 {
  "id": "author/macros-and-commands",
  "doc": "author/macros-and-commands.md",
  "audience": "author",
  "title": "Macros and slash commands",
  "headings": [
   {
    "level": 1,
    "text": "Macros and slash commands",
    "slug": "macros-and-slash-commands"
   },
   {
    "level": 2,
    "text": "Macros",
    "slug": "macros"
   },
   {
    "level": 2,
    "text": "Slash commands",
    "slug": "slash-commands"
   }
  ],
  "body": "# Macros and slash commands\n\n## Macros\n\nUse these in cards, the author's note, presets or lore entries. They read the story this chat plays and update as it\nmoves. With no story, each answers a placeholder such as `(none)` or `(unknown)`.\n\n| Macro | Expands to |\n|---|---|\n| `{{story_title}}` / `{{story_description}}` | Story title / description |\n| `{{story_current_checkpoint}}` | Active checkpoint name and objective |\n| `{{story_past_checkpoints}}` | Visited anchor names |\n| `{{story_possible_transitions}}` | Outgoing transitions with their gate text (spoils; author use) |\n| `{{story_tension}}` | Current tension level |\n| `{{story_player_name}}` | Player persona name |\n| `{{story_role_<id>}}` | Card name of the cast member with roster id `<id>` |\n| `{{story_quality_<key>}}` | The current value of quality `<key>`. With SillyTavern's new macro engine, `{{story_quality::<key>}}` works too |\n| `{{story_scene_location}}` / `{{story_scene_time}}` / `{{story_scene_present}}` | Where, when and who is present, from the judge's scene tracker (`(unknown)` without it, or while the memory holds a conflict about it) |\n| `{{story_blackboard}}` | Compact memo of every tracked quality |\n| `{{story_canon}}` | The derived canon summary |\n| `{{story_memory_<tier>}}` | One memory tier: `facts`, `session_details`, `short_term`, `scene_history` |\n| `{{story_epistemic}}` / `{{story_ledger}}` | The active speaker's private knowledge / the state ledger |\n| `{{story_chapter}}` / `{{story_chapter_number}}` | Current chapter title / number (stories with chapters) |\n| `{{story_so_far}}` | Chronicle + this chapter + open threads |\n| `{{story_previously}}` | The last ended chapter's summary |\n\nThe extension already injects memory, private knowledge, pacing and scene facts into the prompt on its own; the\nmacros are for placing that text somewhere specific.\n\n## Slash commands\n\n| Command | Who | What |\n|---|---|---|\n| `/story recap \\| threads \\| chapters \\| chapter <n> \\| chronicle export \\| flag [note]` | everyone | The player view; see [Starting, continuing and restarting](../player/playing.md#the-story-command). |\n| `/so-mem list \\| pin <n> on\\|off \\| exclude <n>` | everyone | Memory management from the chat box. |\n| `/so-mem backlog` | Author view | Memorize the chat history. |\n| `/cp list \\| state \\| activate <id> \\| set <quality> <value> \\| converge` | Author view | Inspect and steer the story. Spoils it. |\n| `/cp memorize` | Author view | Read the chat history into memory. |\n| `/cp chapters \\| seal \\| unseal <recordId>` | Author view | Chapter records: list them, end the current chapter now, undo the newest seal. |\n| `/cp extract [response] \\| expand [response]` | Author view | Debug: run a read or an expansion now. |\n| `/so-image scene\\|portrait\\|background\\|free [text]` (alias `/direct`) | everyone | Illustrate now, when images are set up. |\n\nIn player mode `/cp` answers with one line pointing to `/story recap` and does nothing else.\n\n---\n\n[Author's guide](README.md)\n"
 },
 {
  "id": "author/step-by-step",
  "doc": "author/step-by-step.md",
  "audience": "author",
  "title": "Build a story step by step",
  "headings": [
   {
    "level": 1,
    "text": "Build a story step by step",
    "slug": "build-a-story-step-by-step"
   },
   {
    "level": 3,
    "text": "1. Premise",
    "slug": "1-premise"
   },
   {
    "level": 3,
    "text": "2. Turning points",
    "slug": "2-turning-points"
   },
   {
    "level": 3,
    "text": "3. Characters",
    "slug": "3-characters"
   },
   {
    "level": 3,
    "text": "4. Setup",
    "slug": "4-setup"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (Part 3). Edit the source, then run npm run docs:guide. -->\n\n# Build a story step by step\n\nThis mirrors the wizard's four steps (`src/studio/components/StudioCopilot.tsx` `WIZARD_STEPS`). Each step can be done by hand in the Studio or by the wizard; the wizard writes through the same edits you would.\n\n### 1. Premise\n\nWhat the story is about and what it measures as it goes.\n\n1. Write the title, the description and a `player_intro` without the twist.\n2. List the handful of facts that decide where the story goes: a choice, an outcome, a relationship, a place. Make each a quality, with a rubric that asks a question the chat will visibly answer.\n3. Prefer bool and enum. Mark decisions `latching`, counters `monotonic`, and never give a latching enum a placeholder value.\n4. Decide who may prove each outcome (`evidence_from`), and add `read_as` and `criteria` to the ones that are plainly visible.\n\n### 2. Turning points\n\nThe beats, and what has to be true to move between them.\n\n1. Write the anchors: the beats that must happen. One is the start. Give each an objective in world terms, a tension target and player-facing names.\n2. Choose the objective kind of each beat, and give the beats where the player may refuse an `alternate`.\n3. Connect the beats with transitions. Each gate reads declared qualities only, uses values they list and asks for something the chat will show. Add an `extraction_hint` saying what to watch for.\n4. Check that every beat leads on (or is the end of a `final` chapter) and that the start reaches every anchor. The Diagnostics tab and the wizard's `simulateReachability` and `simulateWalk` show it.\n\n### 3. Characters\n\nWho is in it, what they want, and where their threads point.\n\n1. Add the cast: card names, a one-line role each, aliases the player will use, one omniscient narrator if the story has one.\n2. Give each a drive, and a motive at the beats where it changes.\n3. Mute later arrivals at the start beat and enable each where they enter. Set the speakers, the lead and the director instruction for group beats.\n4. Add the lore that should open with a beat, the backgrounds, any scripted or generated lines, the dramatic shape and thread bridges.\n5. Fill in requirements (card names, every book), the curator's book, lore select, scene places and house rules.\n\n### 4. Setup\n\nCreate the cards, lore and group the story needs to run.\n\n1. Create a card for each cast member who does not exist yet. First messages only for the opening scene's cast.\n2. Create the story's own lorebook and seed its entries, including every entry the curator should keep current and every entry a beat switches.\n3. Create the group from the cards, open a new chat, select the story and check that it reads as ready.\n4. Play the first beats yourself before handing the story to anyone: the reading model has to move the story on its own.\n\n---\n\n[Author's guide](README.md)\n"
 },
 {
  "id": "author/studio",
  "doc": "author/studio.md",
  "audience": "author",
  "title": "Checkpoint Studio",
  "headings": [
   {
    "level": 1,
    "text": "Checkpoint Studio",
    "slug": "checkpoint-studio"
   },
   {
    "level": 2,
    "text": "Tabs",
    "slug": "tabs"
   },
   {
    "level": 2,
    "text": "What players see",
    "slug": "what-players-see"
   },
   {
    "level": 2,
    "text": "Diagnostics",
    "slug": "diagnostics"
   },
   {
    "level": 2,
    "text": "Saving",
    "slug": "saving"
   }
  ],
  "body": "# Checkpoint Studio\n\nThe Studio is the visual editor for a story. Open it from the settings panel (**Author → Open Studio**) or, in a\nchat that plays a story, from the drawer's **Edit story** (Author view). From the drawer it edits the copy this chat\nplays.\n\n## Tabs\n\n| Tab | What you edit |\n|---|---|\n| Graph | The story as a map of scenes and exits. Click a node to edit it. |\n| Story | Title, description and id, the player introduction, dramatic shape, requirements, thread bridges, the curator's lorebook scope, illustrations. |\n| Qualities | The facts the story tracks, with their rubrics and how they are read. |\n| Checkpoints | The scenes: objective, tension target, guidance, and what happens on arrival (lore, author's note, background, cast changes, scripted lines). |\n| Transitions | The exits between scenes and the condition (gate) that opens each one. |\n| Roster | The cast: card names, roles, aliases, drives. |\n| Diagnostics | Every problem the Studio finds, with what the story loses because of it. |\n| Wizard | The setup wizard (when it is turned on under Authoring). See [The setup wizard](wizard.md). |\n\nEach editor has a **How to write this** section with the matching topic from this guide.\n\n## What players see\n\nThe Studio's **Player introduction**, **Public scene name** and **Public situation** are the text shown in the\nplayer's recap and drawer. The checkpoint name and objective are author-facing. For stories written before these\nfields existed, the library description serves as the introduction, and without a public scene name the player sees\n\"Current scene\".\n\n## Diagnostics\n\nEvery check says first what goes wrong in play (\"The story never reads as ready: …\"), then the technical detail.\nFix the errors before you play; warnings are worth reading. The guide topic named in each check explains it.\n\n## Saving\n\n**Save** writes the story to your library (`Saved \"X\" to the library.`). The toolbar says `unsaved draft` while\nthere are changes. Stories carry no version number: a chat tells that the library holds a different copy by its\ncontent.\n\nSaving does not switch other chats to the edited story; each chat keeps the copy it plays, and Author view shows\n**Update to the latest** in that chat's drawer. When you save from the chat that plays the story:\n\n- a compatible edit is applied there at once (`Applied to this chat: …`);\n- an edit that invalidates progress asks whether this chat should **Keep playing** (only the parts that no longer\n  exist are dropped), **Restart story**, or **Cancel**. The edit is in the library either way.\n\nExport and import live in the Studio toolbar, so a story can be shared as a JSON file.\n\n---\n\n[Author's guide](README.md)\n"
 },
 {
  "id": "author/topics/arc-bridges",
  "doc": "author/topics/arc-bridges.md",
  "audience": "author",
  "title": "Thread bridges",
  "headings": [
   {
    "level": 1,
    "text": "Thread bridges",
    "slug": "thread-bridges"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: arc-bridges). Edit the source, then run npm run docs:guide. -->\n\n# Thread bridges\n\nGuide topic `arc-bridges` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `arc_bridges[]`: `{ arcMatch, anchor, amount }` (`schema.ts` `ArcBridge`, `validate/storyOptions.ts` `readArcBridge`).\n\n- **What it does.** When the memory confirms a story thread has resolved and its words match `arcMatch`, progress toward `anchor` rises by `amount` at the next boundary. A side plot can then move the main one.\n- **Good.** `{ \"arcMatch\": \"wendhope\", \"anchor\": \"after-the-fog\", \"amount\": 1 }`.\n- **Bad.** An `arcMatch` so generic (\"the\") that any thread matches it.\n- **If wrong.** An `anchor` that is not an anchor beat is a load error.\n\n---\n\n[Author's guide](../README.md) · previous: [Convergence](convergence.md) · next: [Speaker direction](talk-control.md)\n"
 },
 {
  "id": "author/topics/arc-template",
  "doc": "author/topics/arc-template.md",
  "audience": "author",
  "title": "Dramatic shape",
  "headings": [
   {
    "level": 1,
    "text": "Dramatic shape",
    "slug": "dramatic-shape"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: arc-template). Edit the source, then run npm run docs:guide. -->\n\n# Dramatic shape\n\nGuide topic `arc-template` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `arc_template` (`schema.ts` `ArcTemplate`, `validate/storyOptions.ts` `readArcTemplate`).\n\n- **What it does.** The expected tension over the story's progress. Each turn the measured tension is compared with the curve and the narrator is told one line: escalate, hold or ease off. It takes `rising`, `fall_recovery`, `three_act`, or a custom `{ \"points\": [{ \"at\": 0, \"tension\": 0.1 }, …] }` with both numbers from 0 to 1.\n- **Good.** `rising` for a heist that builds to the vault. A custom curve that dips after the battle and climbs to the finale (the Adolion adventurer story uses one).\n- **Bad.** A custom curve with one point, or a curve that sits at 1 for the whole story.\n- **If wrong.** A point outside 0 to 1 is a load error. Without a shape, pacing steers only by each beat's tension target.\n\n---\n\n[Author's guide](../README.md) · previous: [Who the player is](player.md) · next: [Requirements](requirements.md)\n"
 },
 {
  "id": "author/topics/author-note",
  "doc": "author/topics/author-note.md",
  "audience": "author",
  "title": "Author's note",
  "headings": [
   {
    "level": 1,
    "text": "Author's note",
    "slug": "authors-note"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: author-note). Edit the source, then run npm run docs:guide. -->\n\n# Author's note\n\nGuide topic `author-note` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `effects.author_note`: text, `null`, or `{ text, role, position, depth, interval }`, with `inject_blackboard: true` to append the story's state memo (`runtime/effectsApplier.ts` `authorNoteText`, `applyAuthorNote`).\n\n- **What it does.** Written into SillyTavern's Author's Note when the beat starts, so it steers every reply in the beat. `role` is `system`, `user` or `assistant`; `position` is `before`, `after` or `chat`; `depth` and `interval` are SillyTavern's own. `null` clears the note.\n- **Good.** Sun-ruins: `{ \"text\": \"[Keep the pacing relaxed. Describe the guild tavern's noise …]\", \"position\": \"chat\", \"depth\": 4, \"interval\": 3, \"role\": \"system\" }`. The current campaign sets `\"author_note\": null` on the start beat only, to clear a stale note, and steers through objectives and guidance instead.\n- **Bad.** A note on one beat and none on the next, when the old note no longer fits.\n- **If wrong.** A beat without its own note keeps the previous beat's (`checkpoint-inherits-author-note`: \"The model keeps being told an earlier checkpoint's note here.\"). While a beat has its own note the objective line is not injected (`engine/agency.ts` `objectiveLineApplies`), which is why the campaign's act guide says not to add checkpoint notes.\n\n---\n\n[Author's guide](../README.md) · previous: [Narrator guidance](guidance.md) · next: [Beat lore](world-info.md)\n"
 },
 {
  "id": "author/topics/background",
  "doc": "author/topics/background.md",
  "audience": "author",
  "title": "Background",
  "headings": [
   {
    "level": 1,
    "text": "Background",
    "slug": "background"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: background). Edit the source, then run npm run docs:guide. -->\n\n# Background\n\nGuide topic `background` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `effects.background`: a file name, or `{ name }` (`schema.ts` `BackgroundEffect`, `validate/checkpoints.ts` `readBackground`).\n\n- **What it does.** Switches SillyTavern's background when the beat starts, and again when the chat is reopened.\n- **Good.** `\"background\": \"tavern day.jpg\"`, a file the install has (the wizard's `lookupBackgrounds` lists them).\n- **Bad.** A background whose picture shows the twist; a name invented for the scene (`pawnshop_interior`) that no file carries.\n- **If wrong.** A name the install lacks does not switch anything (diagnostic `background-missing`: \"The scene does not change: the install has no background by that name.\"; checked against the install's list, with or without the file extension, when the Studio knows it).\n\n---\n\n[Author's guide](../README.md) · previous: [Preset](preset.md) · next: [Scenario](scenario.md)\n"
 },
 {
  "id": "author/topics/briefing",
  "doc": "author/topics/briefing.md",
  "audience": "author",
  "title": "Briefing",
  "headings": [
   {
    "level": 1,
    "text": "Briefing",
    "slug": "briefing"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: briefing). Edit the source, then run npm run docs:guide. -->\n\n# Briefing\n\nGuide topic `briefing` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `briefing` (`title`, `image`, `sections[]` of `{heading, text}`, `tone`, `start_label`) and `chapters[].briefing` (`schema.ts` `StoryBriefing`, `validate/briefing.ts`, `engine/briefing.ts`).\n\n- **What it does.** The \"Before you start\" modal shows it once, the first time the story starts in a group chat (a new chat in a bound group, choosing the story, or Restart). Sections stack under the title, `tone` sits under the title as a content line, `image` is a SillyTavern background file shown above them, and `start_label` names the button (\"Begin\" by default). It is plain text: paragraphs split on blank lines, no macros (`{{user}}` is refused), no HTML. The model never reads it, and the opening scene posts whether or not the player has closed it. Each chat remembers that it was shown; Restart shows it again, a story update does not. A player re-opens it from \"Story briefing\" in the drawer or with `/story intro`, and can switch it off under Display. At most 6 sections of 1,200 characters each. A chapter's `briefing` has the same shape and belongs to that chapter's opening. With no `briefing`, the modal shows `player_intro` as one section; the author's `description` is never shown. Whether a story is a saga is its authored `kind` (see Title, description and id), never its chapter count.\n- **Good.** The world, who the player is, who travels with them, and how to play, in what the player may know at the start: `{\"heading\": \"Who you are\", \"text\": \"A courier with a debt and a sealed letter.\"}`.\n- **Bad.** A section that names a later checkpoint, an outcome, or a character who is not in the scene yet; \"Who is with you\" listing a member the start mutes.\n- **If wrong.** The player reads the spoiler before the first line (diagnostic `briefing-spoiler-risk`: \"The player reads this before it happens, so it may give away a scene, an outcome or a character still ahead.\"; raised when the text names a later checkpoint or its id, a story value the start has not set, or a character the start switches off). A picture the install lacks shows nothing (`background-missing`).\n\n---\n\n[Author's guide](../README.md) · previous: [Title, description and id](story-basics.md) · next: [Who the player is](player.md)\n"
 },
 {
  "id": "author/topics/cast-changes",
  "doc": "author/topics/cast-changes.md",
  "audience": "author",
  "title": "Cast changes",
  "headings": [
   {
    "level": 1,
    "text": "Cast changes",
    "slug": "cast-changes"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: cast-changes). Edit the source, then run npm run docs:guide. -->\n\n# Cast changes\n\nGuide topic `cast-changes` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `effects.cast_changes`: `{ \"enable\": [card names], \"disable\": [card names] }` (`runtime/effectsApplier.ts` `applyCastChanges`).\n\n- **What it does.** Mutes and unmutes group members when the beat starts. Only enabled members respond. It changes the group itself, which outlives the chat, and it is restored when the chat leaves the story.\n- **Good.** The start beat disables everyone who enters later; each later beat enables the characters who enter there: sun-ruins `cp1` disables `Ponticius` and `Luke`, `cp2` enables `Ponticius`.\n- **Bad.** Disabling a companion the player has just recruited, because the beat's list was written before play.\n- **If wrong.** The authored list always wins over what happened at the table: Talis was taken along and then dropped by the next beat's disable (`14-findings.md`, T1). If play can recruit someone, gate the cast change on a quality play sets. Put every enabled character the player may address into the beat's speakers. A name with no card on the install switches nothing (diagnostic `cast-member-no-card`: \"This character never joins the scene: there is no card by that name, so it cannot be switched on and the story never reads as ready.\"; it also covers `requirements.members`). A cast change may name a cast member by card name or by roster id (the id resolves to the member's name); an entry that is neither changes nobody (diagnostic `cast-change-unknown-member`: \"This cast change switches nobody on or off: the name matches no cast member, so whoever it meant stays as they are.\"). Everyone a checkpoint switches off needs a checkpoint that switches them on again, or they stay muted through their own scenes (diagnostic `cast-member-never-enabled`: \"This character stays muted for the rest of the story: a checkpoint switches them off and no checkpoint switches them back on.\"; seen live in a test session). The wizard's agent cannot finish while a cast member has no card or the cast it created has no group (`T5-2-2`: \"done\" with 2 of 5 cards and Diagnostics reading \"No issues\").\n\n---\n\n[Author's guide](../README.md) · previous: [Scenario](scenario.md) · next: [The opening scene](opening-scene.md)\n"
 },
 {
  "id": "author/topics/chance-roll",
  "doc": "author/topics/chance-roll.md",
  "audience": "author",
  "title": "Chance rolls",
  "headings": [
   {
    "level": 1,
    "text": "Chance rolls",
    "slug": "chance-rolls"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: chance-roll). Edit the source, then run npm run docs:guide. -->\n\n# Chance rolls\n\nGuide topic `chance-roll` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `qualities[].roll` (`schema.ts` `QualityRoll`, `validate/qualities.ts` `readRoll`, `engine/chance.ts`).\n\n- **What it does.** `{ sides, target }` rolls a seeded die each time a beat is entered: a bool is true when the face is at or under `target`, an int takes the face. The draw depends on the chat, the story, the beat's entry and the key, so a swipe, a rollback and a reopened chat all read the same result.\n- **Good.** `{ \"key\": \"wall_breached\", \"type\": \"bool\", \"source\": \"code\", \"roll\": { \"sides\": 6, \"target\": 2 }, \"rubric\": \"Seeded chance: does a stretch of Wendhope's wall give way tonight?\" }`, gated together with something the player drives, with each branch rejoining the story.\n- **Bad.** A roll on an extractor quality or a string (a load error: \"only code qualities are rolled\"); a roll that overturns an outcome the player earned.\n- **If wrong.** A roll that decides the player's act instead of the world takes the story away from the player. The campaign rule is that a roll decides the world, never the player, and can be blocked with a `not` leaf (`docs/ACT-GUIDE.md`; review items in `14-findings.md`, SP7.b).\n\n---\n\n[Author's guide](../README.md) · previous: [How a quality is read](quality-reads.md) · next: [Checkpoints](checkpoints.md)\n"
 },
 {
  "id": "author/topics/chapters",
  "doc": "author/topics/chapters.md",
  "audience": "author",
  "title": "Chapters",
  "headings": [
   {
    "level": 1,
    "text": "Chapters",
    "slug": "chapters"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: chapters). Edit the source, then run npm run docs:guide. -->\n\n# Chapters\n\nGuide topic `chapters` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `chapters[]` (`id`, `title`, `player_title`, `kind`, `final`, `seal` with `open_threads`, `keep_tail`, `fold_messages`, `record_style`), `checkpoints[].chapter`, `memory.story_so_far` (`schema.ts` `Chapter`, `validate/chapters.ts`).\n\n- **What it does.** Optional acts. Once one chapter is declared, every beat names one. When play leaves a chapter it is sealed into a written record, so later prompts carry the record instead of the whole transcript. `kind: \"interlude\"` never seals on its own; it seals with the next chapter. `final: true` marks the last chapter; the story ends when it reaches a beat with no exits there. `seal.open_threads` is `carry`, `close` or `decide`; `keep_tail` is how many messages stay verbatim after a fold; `record_style` is `prose` or `chronicle`. `memory.story_so_far` (`block`, `macro`, `off`) is how the record reaches the prompt. Sealing is on by default, though its measurement floors have not run yet.\n- **Good.** `[{ \"id\": \"wendhope\", \"title\": \"Act I: Wendhope\", \"player_title\": \"The Silent Village\" }, { \"id\": \"driftmere\", \"title\": \"Act II: Driftmere\", \"player_title\": \"The Mining Town\", \"final\": true }]`.\n- **Bad.** A `player_title` that names only the act's first place (\"The Adventurer's Guild\" titled an act about Driftmere; `14-findings.md`); a transition back into an earlier chapter.\n- **If wrong.** A beat without a chapter, or naming an unknown one, stops the story loading (`chapter-missing`, `chapter-unknown`). An unreachable chapter is never written up (`chapter-unreachable`); a non-final chapter with no way out is never closed (`chapter-no-exit`); going back reopens a closed record (`chapter-reentry`); a beat with no way on outside a final chapter means the last chapter is never written up (`story-dead-end`).\n\n---\n\n[Author's guide](../README.md) · previous: [House rules](house-rules.md) · next: [Illustrations and display](presentation.md)\n"
 },
 {
  "id": "author/topics/character-life",
  "doc": "author/topics/character-life.md",
  "audience": "author",
  "title": "Character life",
  "headings": [
   {
    "level": 1,
    "text": "Character life",
    "slug": "character-life"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: character-life). Edit the source, then run npm run docs:guide. -->\n\n# Character life\n\nGuide topic `character-life` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `roster[].relationships` (`toward`, `axes`, `range`, `step`, `start`, `label`), `roster[].mood` (`baseline`, `values`, `lasts`), `roster[].agenda` (`id`, `goal`, `steps[]` with `text`, `when`, `effect`, `public`, `repeat`; `pace`, `every`), `roster[].schedule` (`when`, `at`) and `clock` (`times`, `start_day`) (`engine/lifeSchema.ts`, `validate/life.ts`, `engine/life/`).\n\n- **What it does.** Each relationship axis becomes an ordinary int quality `rel_<holder>_<toward>_<axis>` (`toward` is a roster id or `\"player\"`; `range` defaults to -5 to 5, `start` to 0). It is read while the holder is present and the other side is present or is the player, at most `REL_AXES_PER_READ` (8) of them a read, the speaking character's first. The read never sees the current value and never writes a level: it says whether the window moves the feeling up or down (the extraction read writes `\"up\"` or `\"down\"`, the judge picks down, unchanged or up), and the story moves it `step` (default 1) from where it stands, never past the range, whichever model read it. Gates can use it (\"trust >= 3 opens the confession\"), and a swipe takes it back like any quality. Until the first read the value is `start`: it is on the blackboard from the first turn, so a gate on it sees `start` before anything was read (`start: 2` with a gate `trust >= 2` opens on the first turn), the extractor stays its only writer, and a swipe back past the first read lands on `start` again. `mood` (`values` default calm, tense, angry, afraid, elated) becomes `mood_<id>`, read again after the scene changes (the party `location` or `time_of_day` moved) and falling back to `baseline` after `lasts` (`{boundaries: n}`, or `{until: \"scene_break\"}`, the default). An `agenda` moves in code at a turn, never by a model: the next step lands when its `when` holds and the pace allows (`per_n_boundaries` every `every` turns, default 3, or once per chapter), and a turn whose player line is out of character (wrapped in `((…))`, or starting `OOC:` / `(OOC`) neither moves it nor counts toward the pace. A landed step's `effect` switches `world_info` (replayed with the path, so a swipe switches it back) and posts `npc_replies` (trigger `onEnter`); an agenda never changes the cast. Only the last step may `repeat`. A `schedule` entry whose `when` holds puts the member at `at`; when that is not the party's `location` (or there is no `location`), the member is dropped from the speaker candidates for that turn, and nothing is written to the group. When the player's latest in-character line speaks to an away member (by name, or by an alias only that member has), that reply's prompt gains one shared line saying the member is not here, so the narrator says so instead of answering for them; a turn that addresses nobody away leaves the prompt as it was. `clock` adds `time_of_day` (an enum of `times`, read one step forward a turn) and `story_day` (counted in code: each time the time of day wraps round, plus one). The drafted member's private block gains its own feelings (\"Your trust toward Arin: 3 on a scale from -5 to 5.\"), its mood, its last three landed agenda steps and the `public` steps of the others, filtered like every private block so a held secret never reaches a member kept from it. None of it ever reaches a player surface; Author view lists it under Character life.\n- **Good.** `{ \"id\": \"arin\", \"relationships\": [{ \"toward\": \"player\", \"axes\": [\"trust\"], \"range\": [-3, 3] }], \"mood\": { \"baseline\": \"calm\" }, \"agenda\": [{ \"id\": \"debt\", \"goal\": \"Repay the smuggler before the festival\", \"pace\": \"per_n_boundaries\", \"every\": 4, \"steps\": [{ \"text\": \"sold her mother's ring\" }, { \"text\": \"met the smuggler at the docks\", \"when\": { \"q\": \"location\", \"op\": \"!=\", \"v\": \"docks\" } }] }], \"schedule\": [{ \"when\": { \"q\": \"time_of_day\", \"op\": \"==\", \"v\": \"night\" }, \"at\": \"the docks\" }] }`.\n- **Bad.** `display` on a `rel_*` quality (refused: feelings are never public); an agenda step with `cast_changes` (refused: use a checkpoint); `pace: \"per_chapter\"` in a story without `chapters` (refused, `agenda-pace-no-chapters`: it would move once and never again; use `per_n_boundaries` with `every`, or add chapters); a relationship toward the member itself or toward an id not in the roster (refused); an authored quality named like a compiled one (refused).\n- **If wrong.** Too many axes in one scene: the rest are left out of that read and Author view's setup list names them (`relationship-scope-overflow`).\n\n---\n\n[Author's guide](../README.md) · previous: [Stats and story panels](widgets.md) · next: [Good practices and traps](../good-practices.md)\n"
 },
 {
  "id": "author/topics/checkpoints",
  "doc": "author/topics/checkpoints.md",
  "audience": "author",
  "title": "Checkpoints",
  "headings": [
   {
    "level": 1,
    "text": "Checkpoints",
    "slug": "checkpoints"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: checkpoints). Edit the source, then run npm run docs:guide. -->\n\n# Checkpoints\n\nGuide topic `checkpoints` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `checkpoints[].id`, `name`, `objective`, `type` (all required), `start`, `state_snapshot`, `player_name`, `player_text`, `target_turn_length` (`schema.ts` `Checkpoint`, `validate/checkpoints.ts` `readCheckpoint`).\n\n- **What it does.** A beat. `type: \"anchor\"` beats are authored and guaranteed; `type: \"intermediate\"` beats are bridges and must lead on to an anchor. Exactly one beat has `start: true`. The `objective` is one sentence of what the beat is for; unless the beat has its own author's note, it is injected as an objective line. `state_snapshot` is what the story expects to be true while the beat is active (a generation target, not a write). `player_name` and `player_text` are what the player sees for the beat. `target_turn_length` is how many turns the beat should breathe; a stall re-read starts only after the larger of one and a half times that and six turns.\n- **Good.** `{ \"id\": \"guild-hall\", \"name\": \"The Guild Hall\", \"objective\": \"Take a posting and form a party.\", \"type\": \"anchor\", \"player_name\": \"The Wendhope Job\", \"tension_target\": \"calm\", \"target_turn_length\": 5 }`.\n- **Bad.** An objective that narrates the outcome; a `player_name` that tells the player what will happen there.\n- **If wrong.** `player_name` shows to the player, so \"Sophie's Deliveries\" foreshadowed the errand (`14-findings.md`, T3-4/T3-6). Keep player copy short (the campaign holds it to 48 and 200 characters), true on every path in, and free of macros and spoilers. An intermediate with no anchor beyond it is a load error; a generated stub with no anchor beyond it is `stub-no-anchor`.\n\n---\n\n[Author's guide](../README.md) · previous: [Chance rolls](chance-roll.md) · next: [Objectives and player agency](objective-agency.md)\n"
 },
 {
  "id": "author/topics/checks",
  "doc": "author/topics/checks.md",
  "audience": "author",
  "title": "Checks",
  "headings": [
   {
    "level": 1,
    "text": "Checks",
    "slug": "checks"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: checks). Edit the source, then run npm run docs:guide. -->\n\n# Checks\n\nGuide topic `checks` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `checkpoints[].checks[]` and `transitions[].check` (`id`, `label`, `quality`, `roll` with `sides`, `target`, `dice`; `modifiers[]` with `q`, `v`, `add`, `label`; `narrate`, `outcome` with `quality`, `bands`, `partial_margin`; `twist`) (`engine/storyChecks.ts`, `validate/checks.ts`, `runtime/storyCheckDraws.ts`).\n\n- **What it does.** A check rolls seeded dice once per visit to its checkpoint (the transition's `from`): the draw is keyed by the chat, the story, the boundary the checkpoint started at and `check:<id>:<die>`, so group replies, a swipe and a reopened chat see the same roll, and a re-entry rolls again. The total is the dice plus every `modifiers` row whose quality holds its value, read each turn: finding the rope can turn a miss into a success, asking again cannot. It writes `quality` (a code bool, true at or above `target`); `outcome` also writes a code enum of exactly `miss`, `weak` and `strong` (weak below `target + partial_margin`); `twist: {quality}` writes true when two or more dice match. A transition check is attempted when the rest of its gate holds; a checkpoint check when the checkpoint is reached. Each attempt with a new outcome is recorded, and the next reply is told the outcome (never the dice). `narrate: \"public\"` also shows the roll under the message, \"Climb: 15 + 4 vs 12, success\"; `hidden` (the default) shows only what the story tells, and the roll only in Author view.\n- **Good.** `\"check\": { \"id\": \"climb\", \"label\": \"Climb\", \"quality\": \"climb_ok\", \"roll\": { \"sides\": 20, \"target\": 12 }, \"modifiers\": [{ \"q\": \"has_rope\", \"v\": true, \"add\": 4, \"label\": \"Rope\" }], \"narrate\": \"public\" }` on `wall → rooftops`, gated on `tried_climb == true` and `climb_ok == true`.\n- **Bad.** A latching or extracted check quality (refused: the roll writes it every turn); two checks writing one quality (refused); a check on a generated beat (refused).\n- **If wrong.** A gate that waits only on the check quality fires the moment the checkpoint starts; pair it with a quality the player's attempt sets.\n\n---\n\n[Author's guide](../README.md) · previous: [Quests and milestones](quests.md) · next: [Stats and story panels](widgets.md)\n"
 },
 {
  "id": "author/topics/convergence",
  "doc": "author/topics/convergence.md",
  "audience": "author",
  "title": "Convergence",
  "headings": [
   {
    "level": 1,
    "text": "Convergence",
    "slug": "convergence"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: convergence). Edit the source, then run npm run docs:guide. -->\n\n# Convergence\n\nGuide topic `convergence` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `checkpoints[].convergence_threshold`, `transitions[].effects.progress` `{ anchor, amount }` (`engine/convergence.ts`; spec §Convergence).\n\n- **What it does.** Each anchor has a code counter, `progress_toward_<anchor>`. A transition's `progress` effect adds to it when it fires. Generated bridge beats toward an anchor must sum to its threshold, and the exit into the anchor waits for it. `convergence_threshold` sets the threshold by hand; otherwise it is the sum the chain declares. Nothing fuzzy can write the counter.\n- **Good.** A branch that pays `progress: { \"anchor\": \"after-the-fog\", \"amount\": 1 }` on each route, with the anchor's `convergence_threshold: 1`.\n- **Bad.** A threshold larger than any route can pay.\n- **If wrong.** \"Progress can never reach this threshold, so the story cannot converge here.\" (`threshold-unsatisfiable`). Jumping straight into an aftermath with `/cp activate` skips the progress it needed (`STORY-TUTORIAL.md`).\n\n---\n\n[Author's guide](../README.md) · previous: [Transitions](transitions.md) · next: [Thread bridges](arc-bridges.md)\n"
 },
 {
  "id": "author/topics/drives-motives",
  "doc": "author/topics/drives-motives.md",
  "audience": "author",
  "title": "Drives and motives",
  "headings": [
   {
    "level": 1,
    "text": "Drives and motives",
    "slug": "drives-and-motives"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: drives-motives). Edit the source, then run npm run docs:guide. -->\n\n# Drives and motives\n\nGuide topic `drives-motives` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `roster[].drive`, `checkpoints[].motives` (an object of roster id to text) (`schema.ts`, `validate/checkpoints.ts` `readMemberText`, `readMotives`).\n\n- **What it does.** A drive is what a character privately wants across the whole story. A motive is what they want at one beat. Both are injected only into that character's private block when they are drafted to speak (\"What you want: …\", \"Right now: …\"), and never shown to the player.\n- **Good.** Drive: `\"match adventurers into parties that hold together\"`. Motive at the guild hall: `\"size up these strangers and find out whether they would stand their ground\"`. One line each, in the character's own interest.\n- **Bad.** `\"Lead the player to the ruins\"` (a plan for the player), `\"Be mysterious\"` (a stage direction), or a motive keyed `player` or `{{user}}`.\n- **If wrong.** A motive for the player's persona is dropped (`motive-for-player`: \"The player's choices are theirs, so nobody is told this motive.\"); a key no cast member has reaches nobody (`motive-member-unknown`). Without motives characters drift: in T3 three characters \"had no motive of their own and repeated themselves\" (seen in a test session).\n\n---\n\n[Author's guide](../README.md) · previous: [Cast](roster.md) · next: [Qualities](qualities.md)\n"
 },
 {
  "id": "author/topics/experimental-effects",
  "doc": "author/topics/experimental-effects.md",
  "audience": "author",
  "title": "Experimental effects",
  "headings": [
   {
    "level": 1,
    "text": "Experimental effects",
    "slug": "experimental-effects"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: experimental-effects). Edit the source, then run npm run docs:guide. -->\n\n# Experimental effects\n\nGuide topic `experimental-effects` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `effects.reasoning` (`off`, `low`, `medium`, `high`; `schema.ts` `CHECKPOINT_REASONING`), checkpoint `complications` and `complication_after` (`runtime/spikes/sp6Complications.ts`).\n\n- **What it does.** `reasoning` asks for a reasoning effort on the beat's replies; `complications` are lines released into a beat that has stalled. Both are research spikes behind a switch that is on by default (`spikes.*`). The parser accepts `reasoning`; the spike reads `complications` from the authored record.\n- **Good.** A story that plays the same with both switches off; a spike only adds to it.\n- **Bad.** A story that only works when a spike is on.\n- **If wrong.** Where the switch is off nothing happens, so a story that depends on these does not play as written.\n\n---\n\n[Author's guide](../README.md) · previous: [NPC replies](npc-replies.md) · next: [Gates](gates.md)\n"
 },
 {
  "id": "author/topics/gates",
  "doc": "author/topics/gates.md",
  "audience": "author",
  "title": "Gates",
  "headings": [
   {
    "level": 1,
    "text": "Gates",
    "slug": "gates"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: gates). Edit the source, then run npm run docs:guide. -->\n\n# Gates\n\nGuide topic `gates` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `transitions[].gate`: `{ \"q\": <quality>, \"op\": \"==\" | \"!=\" | \">=\" | \"<=\" | \">\" | \"<\" | \"in\", \"v\": <value or list> }`, combined with `{ \"all\": [ … ] }`, `{ \"any\": [ … ] }`, `{ \"not\": gate }` (`schema.ts` `GateNode`, `validate/gates.ts`).\n\n- **What it does.** The condition that opens an exit. It is evaluated over the qualities after each boundary; no model is involved. An unset quality makes a leaf false, so `not` is true while unset.\n- **Good.** `{ \"all\": [{ \"q\": \"path\", \"op\": \"==\", \"v\": \"wendhope\" }, { \"q\": \"party_name\", \"op\": \"!=\", \"v\": \"\" }] }`; a mystery gated on understanding plus arrival (`evidence >= 3` and `knows_spirit`).\n- **Bad.** A gate on something the chat cannot show (a character's private thought); a loose counter (`evidence >= 1` with \"count things like…\"), which moved a chapter on a character's own speculation (`14-findings.md`, T2-2).\n- **If wrong.** An undeclared quality, an operator the type does not allow (`>=` needs a number, `in` a list), or a value an enum does not list is a gate that never opens (`undeclared-quality`, `op-type-mismatch`, `enum-value-invalid`). Gates must survive a bad read: name each clue as its own value or require two. A way out that asks only for what the way in already required, what the checkpoint's own state_snapshot already sets, or what an earlier way out on the route already required (an enum, bool, latching or monotonic value that no later step resets or asks about again; a free number counts only from the way in) is open the moment the story arrives, so the checkpoint is passed straight through on the next turn (diagnostic `gate-open-on-arrival`: \"This checkpoint is skipped after one turn: its way out is already open when the story arrives, so its scene never gets played.\"). Seen live: `map_truth == awake` on two consecutive edges ran the story to its final checkpoint by turn 7 (seen in a test session). Seen again with the gate two edges back: a value required to leave the start also opened a later checkpoint's way out, and four checkpoints lasted one reply each (seen in a test session). Gate each exit on something that happens in that checkpoint.\n\n---\n\n[Author's guide](../README.md) · previous: [Experimental effects](experimental-effects.md) · next: [Transitions](transitions.md)\n"
 },
 {
  "id": "author/topics/guidance",
  "doc": "author/topics/guidance.md",
  "audience": "author",
  "title": "Narrator guidance",
  "headings": [
   {
    "level": 1,
    "text": "Narrator guidance",
    "slug": "narrator-guidance"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: guidance). Edit the source, then run npm run docs:guide. -->\n\n# Narrator guidance\n\nGuide topic `guidance` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `checkpoints[].guidance`: text, or `{ \"all\": text, \"members\": { <roster id or name>: text } }` (`schema.ts` `MemberGuidance`, `engine/checkpointGuidance.ts`).\n\n- **What it does.** Private direction for how the beat plays. Plain text and `all` reach every generation in the beat. A member's entry is staged only while that member is drafted to speak, never at rest and never for quiet or impersonate runs.\n- **Good.** `\"Two days of road. Let {{story_role_companion_a}} and {{story_role_companion_b}} take initiative beside {{story_player_name}}.\"` Three to six sentences of pressure and intent. Secrets in the member's own entry: `\"members\": { \"bartender\": \"Rydel has noticed Tatiana's crush…\" }`.\n- **Bad.** `\"At dawn the fog withdraws and reveals the spirit.\"` (an ending, which a reply paraphrased as a spoiler; `14-findings.md`, T0); a secret in shared guidance; calling the player \"the player\" (characters then called them \"the player\" in 10 of 16 replies; `14-findings.md`, T1).\n- **If wrong.** A member key no cast member has reaches nobody (`guidance-member-unknown`). Openings and guidance that end on \"What do you do?\" teach the narrator to end every reply on a question.\n\n---\n\n[Author's guide](../README.md) · previous: [Tension targets](tension.md) · next: [Author's note](author-note.md)\n"
 },
 {
  "id": "author/topics/house-rules",
  "doc": "author/topics/house-rules.md",
  "audience": "author",
  "title": "House rules",
  "headings": [
   {
    "level": 1,
    "text": "House rules",
    "slug": "house-rules"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: house-rules). Edit the source, then run npm run docs:guide. -->\n\n# House rules\n\nGuide topic `house-rules` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `house_rules[]`: at most 8 rules, each at most 240 characters, no duplicates (`schema.ts` `HOUSE_RULES_MAX`, `validate/storyOptions.ts` `readHouseRules`).\n\n- **What it does.** Rules every reply is checked against by the continuity warden; a broken rule is named in the next reply's prompt. The check is on by default although it is below its measured floor (`judge.uses.houseRules`, `src/judge/settings.ts` `JUDGE_USES_OFF_BY_DEFAULT` is empty).\n- **Good.** `\"{{user}}'s choices belong to {{user}}: show what the world does with an attempt, then stop.\"`; `\"Magic is never used inside the city walls.\"`\n- **Bad.** `\"No magic in the city and keep replies short.\"`\n- **If wrong.** The check asks one question per rule, so a rule with two demands is judged on whichever one the model reads (`house-rule-compound`). One rule, one demand; no \"and\" or `;` compounds.\n\n---\n\n[Author's guide](../README.md) · previous: [Scene places and times](scene-read.md) · next: [Chapters](chapters.md)\n"
 },
 {
  "id": "author/topics/latching",
  "doc": "author/topics/latching.md",
  "audience": "author",
  "title": "Latching and monotonic",
  "headings": [
   {
    "level": 1,
    "text": "Latching and monotonic",
    "slug": "latching-and-monotonic"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: latching). Edit the source, then run npm run docs:guide. -->\n\n# Latching and monotonic\n\nGuide topic `latching` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `qualities[].latching`, `qualities[].monotonic`, and their interaction with `checkpoints[].state_snapshot`.\n\n- **What it does.** `latching: true` makes the first confident read final: an oath, a decision, a door opened. A latching bool latches only on `true`; a `false` can still be overturned. `monotonic: true` lets a number only rise: progress, trust earned, clues found. A missed reading then corrects itself next turn instead of reverting.\n- **Good.** `{ \"key\": \"path\", \"type\": \"enum\", \"values\": [\"wendhope\"], \"latching\": true }`: the unset state is the absence of a value.\n- **Bad.** `{ \"type\": \"enum\", \"values\": [\"undecided\", \"accepted\", \"declined\"], \"latching\": true }`.\n- **If wrong.** A latching enum that lists a placeholder (`undecided`, `none`, `pending`, `unset`, `tbd`; `schema.ts` `PLACEHOLDER_ENUM_VALUES`) latches on the first read, which is the placeholder, and never changes (`latching-enum-placeholder`). In the campaign the arc never started; five qualities in two stories had it (memory note `story-authoring-traps.md`, campaign `INTEGRATION.md`). The same list is fine without `latching`: sun-ruins `luke_decision` keeps `undecided` and does not latch. A snapshot that sets a latching value conflicts with any later gate on a different value (`snapshot-latching-conflict`).\n\n---\n\n[Author's guide](../README.md) · previous: [Rubrics](quality-rubric.md) · next: [How a quality is read](quality-reads.md)\n"
 },
 {
  "id": "author/topics/lore-select",
  "doc": "author/topics/lore-select.md",
  "audience": "author",
  "title": "Lore select",
  "headings": [
   {
    "level": 1,
    "text": "Lore select",
    "slug": "lore-select"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: lore-select). Edit the source, then run npm run docs:guide. -->\n\n# Lore select\n\nGuide topic `lore-select` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `lore_select.lorebooks`, `top_k` (1 to 12), `min_p` (0 to 1), `exclusive` (`schema.ts` `StoryLoreSelect`, `validate/storyOptions.ts` `readLoreSelect`).\n\n- **What it does.** The judge picks the entries of these books that matter for the next reply and forces them in, even without their keywords. `top_k` caps the picks; `min_p` is the confidence a pick needs. The judge is not asked about an entry SillyTavern's own keyword scan is certain to switch on for that reply, nor about an entry keyed by the drafted member's own name or alias; those are left to the scan. `exclusive: true` also switches off, for that one reply, the entries of these books it did not pick (only with per-chat gating, the default, and never for constant, gated or timed entries, or an entry left to the scan).\n- **Good.** `{ \"lorebooks\": [\"Adolion World\"], \"top_k\": 6, \"min_p\": 0.7, \"exclusive\": true }`; raise `min_p` for a big book.\n- **Bad.** A book that is not required.\n- **If wrong.** Lore select only reaches books SillyTavern scans, so a book not under requirements may never be in play (`lore-select-inactive`); `exclusive` with no book excludes nothing (`lore-select-exclusive-empty`).\n\n---\n\n[Author's guide](../README.md) · previous: [Curator scope](stagecraft.md) · next: [Scene places and times](scene-read.md)\n"
 },
 {
  "id": "author/topics/npc-replies",
  "doc": "author/topics/npc-replies.md",
  "audience": "author",
  "title": "NPC replies",
  "headings": [
   {
    "level": 1,
    "text": "NPC replies",
    "slug": "npc-replies"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: npc-replies). Edit the source, then run npm run docs:guide. -->\n\n# NPC replies\n\nGuide topic `npc-replies` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `effects.npc_replies[]`: `{ trigger, member, kind, text, instruction, maxTriggers, probability, after_member, new_chat_only, enabled }` (`schema.ts` `NpcReplyEffect`, `validate/checkpoints.ts`, `runtime/effectsApplier.ts` `fireNpcReplies`).\n\n- **What it does.** Lines a character speaks on their own. `trigger` is `onEnter` (the beat starts), `afterSpeak` (after a character reply; `after_member` narrows it to one speaker) or `sceneBreak`. `kind: \"scripted\"` posts `text` verbatim; `kind: \"llm\"` has the member generate, following `instruction`. `maxTriggers` caps repeats per beat, `probability` is a seeded chance, `enabled: false` parks a reply without deleting it. Fired counts persist, so reopening never repeats a reply.\n- **Good.** `{ \"trigger\": \"afterSpeak\", \"member\": \"Dalan\", \"after_member\": \"Felthorn\", \"kind\": \"llm\", \"probability\": 0.6, \"maxTriggers\": 2, \"instruction\": \"Dalan answers what the blade just said. He does not decide for the party.\" }`.\n- **Bad.** A scripted line with a time or place in it (\"As dusk falls…\") on a trigger that can fire anywhere.\n- **If wrong.** A dusk line fired at dawn, \"Welden turns up in the library\" fired in the study, and a tavern line fired after the party had left (seen in test sessions). Word scripted lines to fit wherever they fire, or use `llm`. A scripted greeting on top of an entering reply introduced Sophie twice; prefer an `llm` opener there (`14-findings.md`, T3-4/T3-6). Give `afterSpeak` a probability and `sceneBreak` a `maxTriggers` (`ACT-GUIDE.md`).\n\n---\n\n[Author's guide](../README.md) · previous: [The opening scene](opening-scene.md) · next: [Experimental effects](experimental-effects.md)\n"
 },
 {
  "id": "author/topics/objective-agency",
  "doc": "author/topics/objective-agency.md",
  "audience": "author",
  "title": "Objectives and player agency",
  "headings": [
   {
    "level": 1,
    "text": "Objectives and player agency",
    "slug": "objectives-and-player-agency"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: objective-agency). Edit the source, then run npm run docs:guide. -->\n\n# Objectives and player agency\n\nGuide topic `objective-agency` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `checkpoints[].agency` (`protect_player_choice`, `never_narrate_player_action`, `objective_kind`, `alternate`, `player_attempts_only`) and the story's `objective_block` (`schema.ts` `AgencyPolicy`, `engine/agency.ts`, `validate/checkpoints.ts` `readAgency`).\n\n- **What it does.** The defaults are the policy, even when `agency` is absent (`DEFAULT_AGENCY`): narration never writes the player accepting what they refused or going where they declined, never writes the player's own words and decisions, and the objective is world pressure. `objective_kind: \"world_pressure\"` lets the world press, answer and escalate without the player's compliance. `objective_kind: \"player_action\"` makes the world present the situation and the choice, then stop. `alternate` names a beat to recover to when the player refuses the prepared route. `player_attempts_only` makes the world decide whether the player's stated attempt works. `objective_block: \"off\"` stops the objective line being injected story-wide.\n- **Good.** `\"agency\": { \"objective_kind\": \"player_action\", \"player_attempts_only\": true, \"alternate\": \"the-sheridan-steward\" }` at a beat where the player must choose a side. The `alternate` is an intermediate that rejoins the story.\n- **Bad.** `alternate` naming the beat itself; `player_action` on a beat that should advance whether or not the player engages.\n- **If wrong.** An unknown `alternate` leaves a refusal nowhere to go (`agency-alternate-unknown`); one naming the beat sends the player back into it (`agency-alternate-is-self`). A story with no `alternate` anywhere is a rail (campaign `ADAPT-v2.5.md`). Guidance that scripts a schedule (\"servants lead the party…\") produced a time skip the player never chose (`14-findings.md`).\n\n---\n\n[Author's guide](../README.md) · previous: [Checkpoints](checkpoints.md) · next: [Open stretches](open-stretches.md)\n"
 },
 {
  "id": "author/topics/open-stretches",
  "doc": "author/topics/open-stretches.md",
  "audience": "author",
  "title": "Open stretches",
  "headings": [
   {
    "level": 1,
    "text": "Open stretches",
    "slug": "open-stretches"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: open-stretches). Edit the source, then run npm run docs:guide. -->\n\n# Open stretches\n\nGuide topic `open-stretches` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `checkpoints[].stretch` (`mode`, `pace`, `pull_after`, `max_turns`, `arrive_when`) and the code quality `player_turns_in_checkpoint` (`schema.ts` `CheckpointStretch`, `engine/stretch.ts`, `validate/stretch.ts`).\n\n- **What it does.** `stretch: { \"mode\": \"open\" }` on an intermediate makes it free play between two fixed points: no objective line is injected there (the story's `objective_block` still governs every other beat), it is never expanded into a beat chain, and a long quiet run is neither a stall re-read nor a refusal. The narrator is told to follow what the player starts. `pace` (`brief`, `unhurried`, `long`) sets `pull_after` to 3, 6 or 10 **player turns** (a group round of several replies to one player line is one turn); an explicit `pull_after` wins. Past it the world pulls gently toward the next place with hooks (gentle, then steady three turns later); `max_turns` only makes the pull plain, and never moves the party or narrates the move. The player leaves by their own move: `arrive_when` is the arrival gate, and it must be the gate of every one of the stretch's exits: a second exit on another gate (a turn count, a constant) is refused. Declare `player_turns_in_checkpoint` as an `int` with `source: \"code\"` to read the count in gates or macros.\n- **Good.** `{ \"id\": \"on-the-road\", \"name\": \"On the road\", \"objective\": \"\", \"type\": \"intermediate\", \"stretch\": { \"mode\": \"open\", \"pace\": \"unhurried\", \"arrive_when\": { \"q\": \"reached_walls\", \"op\": \"==\", \"v\": true } } }` with the exit `on-the-road → walls` gated on the same `reached_walls == true`.\n- **Bad.** An open stretch whose exit waits on `progress_toward_<anchor>` or carries a progress effect (refused: a filled counter ending a scene is the corridor this mode removes); `player_text` on an open stretch (refused: the player sees the scene name, never a task).\n- **If wrong.** `pressure`, `offer` and `trigger` are refused as not built yet: complications and encounter pools wait for their measurements (v2.7 35). An `arrive_when` that matches no exit is a load error, so the stretch cannot trap the player.\n\n---\n\n[Author's guide](../README.md) · previous: [Objectives and player agency](objective-agency.md) · next: [Tension targets](tension.md)\n"
 },
 {
  "id": "author/topics/opening-scene",
  "doc": "author/topics/opening-scene.md",
  "audience": "author",
  "title": "The opening scene",
  "headings": [
   {
    "level": 1,
    "text": "The opening scene",
    "slug": "the-opening-scene"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: opening-scene). Edit the source, then run npm run docs:guide. -->\n\n# The opening scene\n\nGuide topic `opening-scene` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: each card's `first_mes` (on the SillyTavern card), the start checkpoint's `cast_changes`, and a scripted `onEnter` npc reply with `new_chat_only` (`validate/checkpoints.ts` `readCheckpointEffects`; rule text `FIRST_MESSAGE_RULE`, `OPENING_CAST_RULE` in `src/copilot/prompts.ts`).\n\n- **What it does.** In a group every card with a first message greets at once when the chat opens. A scripted `onEnter` reply with `new_chat_only: true` posts only into an empty chat, so it is the story's own opener.\n- **Good.** One narrator card with an empty first message; the start beat disables the later cast; one `new_chat_only` opener: `{ \"trigger\": \"onEnter\", \"member\": \"Adolion Narrator\", \"kind\": \"scripted\", \"new_chat_only\": true, \"text\": \"You came to Aegis City to make a name with a blade…\" }`.\n- **Bad.** First messages written for each character's later beat. A greeting that addresses the player as a role (\"You are the pawnbroker\") while a card plays that role.\n- **If wrong.** Every member greeted at once in a fresh group and the thief was spoiled at message 0 (seen in a test session). `new_chat_only` is accepted only on a scripted `onEnter` reply.\n\n---\n\n[Author's guide](../README.md) · previous: [Cast changes](cast-changes.md) · next: [NPC replies](npc-replies.md)\n"
 },
 {
  "id": "author/topics/player",
  "doc": "author/topics/player.md",
  "audience": "author",
  "title": "Who the player is",
  "headings": [
   {
    "level": 1,
    "text": "Who the player is",
    "slug": "who-the-player-is"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: player). Edit the source, then run npm run docs:guide. -->\n\n# Who the player is\n\nGuide topic `player` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `player.role`, `player.summary`, `player.name` (`{mode, value}`), `player.assumes`, `player.suggested_description`, `player.inject`, and `player.card` (living cards) (`schema.ts` `StoryPlayer`, `validate/player.ts`, `engine/player.ts`, `runtime/playerSetup.ts`).\n\n- **What it does.** Says who the player plays in this story. `role` is one line (\"a hired adventurer\"); `summary` is player copy in the second person; `assumes` lists what the story takes for granted (\"can fight\", \"does not know the city's politics\"); `name.mode` is `any` (the default), `suggested` (`name.value` is offered when the player creates a persona) or `fixed` (the story only works with that name: it waits to start until a persona of that name is selected, the one case where `player` blocks anything); `suggested_description` prefills \"Create a persona for this story\". The first time the story starts in a group chat, the start page shows \"Who you are in this story\" with the role, summary and assumptions, and the player keeps their persona, chooses another, or creates one (only on their click, the name and description shown in full first; a persona is only ever added, never edited or deleted). Every choice, closing the page included, locks that persona to the chat with SillyTavern's own chat lock, and the opening scene waits for it. With `display.playerSetup` off, or a story without `player`, the current persona is locked without asking. Switching persona mid-story raises \"This story was started as X; switching mid-story breaks what characters know about you\" with a \"Switch back\" button. Unless `inject` is `false`, the reply prompt carries one line, \"In this story, {{user}} is <role>: <summary>\", and it stays on for every kept or chosen persona; it turns off only while the persona's own description already holds that exact line (a persona created from the start page starts with it). `/story who` and \"Your character in this story\" in the drawer show it again. Prefer `player` to `requirements.personas`, which only names a persona that must already exist.\n- **Good.** `{\"role\": \"a hired adventurer\", \"summary\": \"You are new to the city, with a sword, a little coin and no name anyone knows.\", \"assumes\": [\"can fight\"], \"name\": {\"mode\": \"any\"}}`.\n- **Bad.** A summary that names the villain or a later checkpoint; `name.mode: \"fixed\"` on a story that only needs a role (every player must then make that persona first); a role that is also a cast member's card (\"The Pawnbroker\" in both).\n- **If wrong.** The player reads a spoiler before the first line (diagnostic `player-spoiler-risk`: \"The player reads this at the start, so it may give away a scene, an outcome or a character still ahead.\"). A scripted opening line that says `{{user}}` shows the persona chosen at the start (diagnostic `opener-uses-player-name`, info). A persona with a cast member's name makes that character speak as the player (Repair `persona-fit-cast`); the role also feeds `roster-member-is-player`.\n\n---\n\n[Author's guide](../README.md) · previous: [Briefing](briefing.md) · next: [Dramatic shape](arc-template.md)\n"
 },
 {
  "id": "author/topics/presentation",
  "doc": "author/topics/presentation.md",
  "audience": "author",
  "title": "Illustrations and display",
  "headings": [
   {
    "level": 1,
    "text": "Illustrations and display",
    "slug": "illustrations-and-display"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: presentation). Edit the source, then run npm run docs:guide. -->\n\n# Illustrations and display\n\nGuide topic `presentation` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `illustrations` (`checkpoints`, `scenes`, `style`, `appearances`), `checkpoints[].illustrate`, `chapters[].illustrations` (`style`, `appearances`), the lore line `Public appearance:`, `display.lore_names_public`, `display.continue_list` (with `group_card`, `chapter_card`, `wand`, `roll_chips`, `suggestions`), `effects.stage` (`schema.ts` `StoryV2`, `StoryIllustrations`, `IllustrationLook`, `StoryDisplay`; `src/image/cast.ts`, `src/image/lore.ts`; `src/sprites/direction.ts` `readStageDirection`).\n\n- **What it does.** `illustrations` asks for pictures of beats and scenes in one `style`, with each cast member's look in `appearances` (keyed by cast id). A beat's picture is cued by its `player_name`, or a neutral \"establishing shot\" when it has none; the internal `name` never reaches the image prompt. `checkpoints[].illustrate: false` skips the automatic beat and scene pictures while that beat is active (a picture the player asks for still runs). `chapters[].illustrations` overrides `style` and, per cast id, `appearances` while the active beat is in that chapter, so a costume can end with its act. Lore looks come from `Appearance:` lines in the story's scanned books, and only from an entry that has fired in this chat; a `Public appearance:` line is used whenever the scene mentions the entry, fired or not, and wins over `Appearance:`. A cast member whose roster `role` starts with narrator, storyteller, game master, GM, DM or system, or whose `view` is `omniscient`, is drawn only from an authored appearance or the card's own appearance field, never from the card description. `display.lore_names_public: true` lets players see lore entry names in the inline timeline. The other `display` keys switch this story's presence items off: `continue_list` (its rows in Your stories), `group_card` (the card on its group's list icon), `chapter_card` (chapter title cards), `wand` (the wand-menu entries), `roll_chips` (Author view roll chips) and `suggestions` (the \"What could I do?\" button). Each defaults on and is edited in the Studio's Story tab under Story presence; an item shows only when both the story and the player's install-wide switch allow it, so a story can hide an item but never force one on. `effects.stage` (`{ framing: full | thigh | close, spotlight, cast: { <name>: { set, face, hidden } } }`) places sprites for a beat when the sprite stage is on.\n- **Good.** A narrator appearance of \"never drawn\"; a style line shared by every picture; `\"illustrate\": false` on short connecting beats; a disguise in `Public appearance:` with the true form kept in `Appearance:`.\n- **Bad.** A secret form in `appearances`, a `Public appearance:` line, or a background prompt that shows the twist: each leaks through the image prompt (`STORY-TUTORIAL.md`).\n- **If wrong.** Public lore names spoil a story whose entry titles name the twist; leave `lore_names_public` off unless the titles are safe. A secret look in `Appearance:` still reaches the image prompt once its entry fires, so keep a form the player has not seen out of any entry that can fire before the reveal. A `set` or `face` in `effects.stage` that the character's installed sprites lack shows nothing new (diagnostic `stage-sprite-unknown`: \"The stage cannot show this: the character has no installed sprite set or face by that name, so they keep the sprite they had.\"; checked against the packs the stage found for the open chat's cast).\n\nThe story's game panels have their own switches: `display.journal`, `display.stat_sheet` and `display.widgets` (see the next three topics).\n\n---\n\n[Author's guide](../README.md) · previous: [Chapters](chapters.md) · next: [Quests and milestones](quests.md)\n"
 },
 {
  "id": "author/topics/preset",
  "doc": "author/topics/preset.md",
  "audience": "author",
  "title": "Preset",
  "headings": [
   {
    "level": 1,
    "text": "Preset",
    "slug": "preset"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: preset). Edit the source, then run npm run docs:guide. -->\n\n# Preset\n\nGuide topic `preset` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `effects.preset`: a preset name, or `{ name, settings }` (`runtime/effectsApplier.ts` `resolvePreset`; `runtime/samplerOverlay.ts`).\n\n- **What it does.** A per-request sampler overlay for this beat's replies. A name is matched exactly against the connection's own presets (never fuzzy); `settings` carries the samplers inline. Only samplers the request already sends are overlaid, only on the player's visible replies, only while the beat is active. The selected preset is never changed.\n- **Good.** A slightly hotter sampler for a dream sequence: `{ \"name\": \"Dream\", \"settings\": { \"temperature\": 1.1 } }`.\n- **Bad.** A preset name that exists only on another API, or one that carries no sampler the connection sends.\n- **If wrong.** The effect is refused with a reason in the journal, and the beat plays with the normal samplers. Text Completion and Chat Completion connections only.\n\n---\n\n[Author's guide](../README.md) · previous: [Beat lore](world-info.md) · next: [Background](background.md)\n"
 },
 {
  "id": "author/topics/qualities",
  "doc": "author/topics/qualities.md",
  "audience": "author",
  "title": "Qualities",
  "headings": [
   {
    "level": 1,
    "text": "Qualities",
    "slug": "qualities"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: qualities). Edit the source, then run npm run docs:guide. -->\n\n# Qualities\n\nGuide topic `qualities` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `qualities[].key`, `type`, `values`, `source` (all but `values` required, plus `rubric`) (`schema.ts` `Quality`, `validate/qualities.ts` `readQuality`).\n\n- **What it does.** The typed facts the story tracks and gates on. `type` is `int`, `float`, `bool`, `enum` (with `values`) or `string`. `source: \"extractor\"` means the reading model scores it from the chat; `source: \"code\"` means only the engine sets it (rolls, counters, convergence progress). The engine adds two of its own: `tension_current` and one `progress_toward_<anchor>` per anchor.\n- **Good.** `{ \"key\": \"mission_accepted\", \"type\": \"bool\", \"source\": \"extractor\", \"latching\": true, \"rubric\": \"Did the party accept the Sun Ruins mission from the board?\" }` (`examples/sun-ruins/quest-for-the-sun-ruins.json`).\n- **Bad.** A `string` quality for something with three possible answers; a quality that no gate or snapshot reads.\n- **If wrong.** The reading model is only asked about qualities some gate or snapshot ahead of the player uses, so an unused quality is never read (`quality-never-in-scope`: \"Nothing can react to this, because the story is never asked about it.\"). Free text reads unreliably; a closed list turns a misread into \"wrong value from a known list\", which is detectable.\n\n---\n\n[Author's guide](../README.md) · previous: [Drives and motives](drives-motives.md) · next: [Rubrics](quality-rubric.md)\n"
 },
 {
  "id": "author/topics/quality-reads",
  "doc": "author/topics/quality-reads.md",
  "audience": "author",
  "title": "How a quality is read",
  "headings": [
   {
    "level": 1,
    "text": "How a quality is read",
    "slug": "how-a-quality-is-read"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: quality-reads). Edit the source, then run npm run docs:guide. -->\n\n# How a quality is read\n\nGuide topic `quality-reads` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `read_as`, `criteria`, `player_labels`, `evidence_from`, `commit_evidence`, `scope_hint`, `ledger_binding` (`schema.ts` `Quality`; `validate/qualities.ts` `readQualityRead`, `readEvidenceFrom`, `readCommitEvidence`, `readPlayerLabels`).\n\n- **`read_as` and `criteria`.** Opt a plainly visible extractor quality into the judge's every-turn read: `choice` (bool or enum), `stated` (a number or a name the text states; takes no criteria), `rating` (a scale; needs `criteria.levels` or a rubric reading \"from N (low) to M (high)\"). `criteria` say what each option means, as text or `{ what, not_for, examples }`; `not_for` is where misreads are stopped. A latching quality read this way is written only at confidence 0.9 or more (`quality-hint-latching-note`), and a choice with bare one-word options and no criteria may be read loosely (`quality-hint-no-criteria`). Good: Adolion `spirit_outcome` with `destroyed: { what: \"The heartwood was cut, burned or shattered\", not_for: \"Wounding the heartwood mid-fight, or only threatening to cut it.\" }`. Bad: an option whose `not_for` is the option itself (`quality-criteria-self-exclusion`), or `rating` with no scale (`quality-rating-no-scale`: never read).\n- **`player_labels`.** The words a player reads for each enum value. Without them a player sees raw ids like \"At aegis_guild_hall.\" (`14-findings.md`, T0 player surfaces).\n- **`evidence_from`.** Who may prove the value: `any` (default), `world` (only what the world does; the player's own line cannot prove it), `party` (the party's own moves, which the player's line may state). An outcome that opens an anchor should usually be `world` (`quality-outcome-player-evidence`: \"A player's line alone can move the story here: writing that they did it counts as done.\"). A party move under `world` stalls: \"We go down\" was rejected 16 times in T2-1 and `deep_set_out` stalled six turns at the North Gate (`14-findings.md`, T2-1/3/5 and T3-1 fix waves).\n- **`commit_evidence`.** A regular expression the quoted evidence must match before an extractor quality may be set, for values that mean a commitment. It exists because a companion's aside (\"perhaps our friend Dalan\") latched `path` too early (campaign `docs/STORY-TUTORIAL.md`). Cover the natural ways to accept: recall rose from 0.68 to 0.98 once `we ride`, `deal`, `agreed` were added, while a bare `we'?ll go` let \"We'll go to the bar first\" commit (`14-findings.md`, T0 and T1). It is matched case-insensitively and `\\b` is ASCII only.\n- **`scope_hint`.** `{ from, until }` narrows where the quality is asked about. It is an optimisation only; never narrow past a gate that needs the reading (`quality-out-of-scope`). The campaign scopes each arc's qualities from the arc's first beat so the lobby does not read every arc at once (`PLAN.md`).\n- **`ledger_binding`.** `{ entity, field }` mirrors the value into the state ledger (for example the party's rank). Only extractor qualities may bind.\n- **Out-of-character lines.** A player line wrapped in `((…))` or starting `OOC:` / `(OOC` is left out of every read, so it can never prove a value; no rubric needs to guard against it.\n\n---\n\n[Author's guide](../README.md) · previous: [Latching and monotonic](latching.md) · next: [Chance rolls](chance-roll.md)\n"
 },
 {
  "id": "author/topics/quality-rubric",
  "doc": "author/topics/quality-rubric.md",
  "audience": "author",
  "title": "Rubrics",
  "headings": [
   {
    "level": 1,
    "text": "Rubrics",
    "slug": "rubrics"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: quality-rubric). Edit the source, then run npm run docs:guide. -->\n\n# Rubrics\n\nGuide topic `quality-rubric` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `qualities[].rubric` (required).\n\n- **What it does.** The question the reading model answers from the prose, with its scale. It is the only instruction the model gets for this quality, and every gate on the quality inherits it.\n- **Good.** `\"Has the party made camp for its first night on the road north to Wendhope?\"` A latching choice that says when to stay silent: `\"Which posting has the party committed to? Answer wendhope once … Until they actually commit, say nothing about this quality at all.\"` (Adolion adventurer `path`).\n- **Bad.** `\"Mara's attitude\"`; a question about a name the player has never heard in the fiction; a rubric that disagrees with the transition's `extraction_hint`.\n- **If wrong.** The gate stalls. Seen live: `reached_walls` required being \"challenged by its archers\"; the narrator wrote empty parapets and the story stalled 14 boundaries (seen in a test session). `acad_path` asked the player to \"commit to the Witch King thread\" before the fiction had named him; four turns of digging left it unset (found in a test session). Test each rubric against the card's own sample lines: \"No. I won't duel Leevon for your politics.\" did not set `duel_refused` until a second refusal (same source).\n\n---\n\n[Author's guide](../README.md) · previous: [Qualities](qualities.md) · next: [Latching and monotonic](latching.md)\n"
 },
 {
  "id": "author/topics/quests",
  "doc": "author/topics/quests.md",
  "audience": "author",
  "title": "Quests and milestones",
  "headings": [
   {
    "level": 1,
    "text": "Quests and milestones",
    "slug": "quests-and-milestones"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: quests). Edit the source, then run npm run docs:guide. -->\n\n# Quests and milestones\n\nGuide topic `quests` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `quests[]` (`id`, `title`, `kind`, `visible_when`, `offered_when`, `done_when`, `failed_when`, `steps[]` with `text`, `done_when`, `failed_when`, `visible_when`, `progress`; `requires`, `progress`, `labels`, `giver`, `author_note`, `reward` with `set`, `effects`, `label`, `visible_when`) and `milestones[]` (`id`, `title`, `when`, `secret`) (`engine/gameSchema.ts`, `engine/quests.ts`, `validate/quests.ts`).\n\n- **What it does.** A side quest's status is computed from the blackboard every turn: hidden until `visible_when` holds; `offered` while `offered_when` holds and `visible_when` does not. `visible_when` is the acceptance: the quest turns active the moment it holds, so an offered quest needs one, and an offered quest never fails, so the player may ignore it. Active, then done when `done_when` holds or failed when `failed_when` holds; when both hold at one boundary, failed wins. The end is kept: the story latches it in `quest_<id>_closed`, so a completion gate that turns false again does not reopen the quest, while a swipe or edit of the reply that closed it does. `done_when` may be left out: it is then every step done, or `progress` reaching its target (`{quality, of}`, drawn as N/M). `requires: [questId]` adds the other quest's done gate to this one's `visible_when` (and `offered_when`); a cycle is refused. `labels` words the end for players (\"Left behind\" instead of \"Failed\"). `giver` names a roster id; `author_note` is never shown to players. While a quest is hidden its `visible_when` keys are read by extraction; while active, its `done_when`, `failed_when` and open steps (`QUEST_SCOPE_CAP` keys at most: active quests first, then offered, then hidden, and inside each every quest's first key before any quest's second, so a quest is never starved by a busier one; the rest are named in Author view's setup list). A reward lands once, when the quest is done: `set` writes code qualities (a literal or `{add: n}`), `effects` switches `world_info`, `cast_changes` and `npc_replies` (trigger `onEnter`), and a swipe or edit of the reply that earned it takes all of it back. `reward.label` shows the reward to players, behind `reward.visible_when`. The main line is the checkpoint graph: the reached beats' `player_name`s and the active beat's `player_text`. A milestone is earned when `when` holds; a `secret` one is not listed until it is earned. The Journal, the log, `/story quests`, the welcome-back recap and the inline chips \"Quest started / completed / failed\" show only visible quests and steps.\n- **Good.** `{ \"id\": \"find-the-map\", \"title\": \"The cartographer's map\", \"visible_when\": { \"q\": \"met_cartographer\", \"op\": \"==\", \"v\": true }, \"steps\": [{ \"text\": \"Find the cartographer's lodgings\", \"done_when\": { \"q\": \"found_lodgings\", \"op\": \"==\", \"v\": true } }, { \"text\": \"Bring back the map\", \"done_when\": { \"q\": \"has_map\", \"op\": \"==\", \"v\": true } }], \"reward\": { \"label\": \"A safe road east\", \"effects\": { \"world_info\": { \"enable\": [{ \"lorebook\": \"Ruins Lore\", \"comments\": [\"Map routes\"] }] } } } }`.\n- **Bad.** A reward on a quest that is done before anything happens (refused); `done_when` and `failed_when` that both hold at the start (refused); an offered quest that fails on time alone (`messages_in_checkpoint`, refused); a step title that names a later beat.\n- **Story updates.** Editing a quest keeps what this chat reached. A changed reward that this chat already received is not given again; removing a quest this chat finished or failed asks whether to keep the chat or restart; removing an active one just stops tracking it.\n- **If wrong.** A quest whose keys no transition reads is still discovered: its keys are in the read while it is hidden or active. A quest whose `visible_when` never holds never shows; Author view lists it as not found yet.\n\n---\n\n[Author's guide](../README.md) · previous: [Illustrations and display](presentation.md) · next: [Checks](checks.md)\n"
 },
 {
  "id": "author/topics/requirements",
  "doc": "author/topics/requirements.md",
  "audience": "author",
  "title": "Requirements",
  "headings": [
   {
    "level": 1,
    "text": "Requirements",
    "slug": "requirements"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: requirements). Edit the source, then run npm run docs:guide. -->\n\n# Requirements\n\nGuide topic `requirements` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `requirements.personas`, `requirements.members`, `requirements.lorebooks` (`schema.ts` `StoryRequirements`, `validate/storyOptions.ts` `readRequirements`; any other key is an error).\n\n- **What it does.** What the SillyTavern install must provide before the story's effects run: the player personas it expects, the group members it directs, and the lorebooks that must be active. Until they are met, checkpoint effects wait and the settings panel's Repair step names the first thing missing. \"Fix with wizard\" can create missing cards and the story's own lorebook (never a persona).\n- **Good.** `{ \"members\": [\"Adolion Narrator\", \"Tobias\", \"Belle\"], \"lorebooks\": [\"Adolion World\", \"Adolion Adventurer Checkpoints\"] }`: card names exactly as SillyTavern lists them, and every book the story's lore effects or lore select rely on.\n- **Bad.** `{ \"members\": [\"dm\", \"guild_rep\"] }`: roster ids instead of card names.\n- **If wrong.** The story never reads as ready and its effects stay deferred (diagnostic `requirement-member-roster-id`: \"The story never reads as ready: it waits for a character named by a cast id, while the card has another name.\"). Seen live: the wizard wrote roster ids and the story never read as ready in the group the wizard had just built (seen in a test session). A required lorebook counts as present when SillyTavern scans it for this chat (global selection, the chat's slot, the persona, or a card bound on every enabled member), not merely when it exists on disk. A required persona must already exist on the install: personas are the author's own and nothing creates one, so leave `requirements.personas` out unless the story truly needs a named persona, and say who the player is with `player` instead (see Who the player is) (diagnostic `requirement-persona-missing`: \"The story never reads as ready, so its start effects never run: it requires a persona this install does not have, and nothing creates one.\"). Seen live: the staged wizard required \"The Apprentice\", the saved story never started and Repair named only \"a different player character\" (seen in a test session).\n\n---\n\n[Author's guide](../README.md) · previous: [Dramatic shape](arc-template.md) · next: [Cast](roster.md)\n"
 },
 {
  "id": "author/topics/roster",
  "doc": "author/topics/roster.md",
  "audience": "author",
  "title": "Cast",
  "headings": [
   {
    "level": 1,
    "text": "Cast",
    "slug": "cast"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: roster). Edit the source, then run npm run docs:guide. -->\n\n# Cast\n\nGuide topic `roster` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `roster[].id` (required), `name`, `role`, `aliases`, `view` (`schema.ts` `RosterMember`, `validate/checkpoints.ts` `readRoster`). `drive` has its own section.\n\n- **What it does.** The characters this story directs. `id` is the story's handle for the character (used by motives, member guidance and macros such as `{{story_role_<id>}}`); `name` is the card name. `role` is one line of what they do in this story; speaker direction and the judge director pick by it, and the judge director runs only when every candidate has a role. `aliases` are other names the player uses (\"the captain\", a surname); an alias that two members share, or that is another member's name, is ignored. `view: \"omniscient\"` makes a narrator see the private rows and aims of the cast so it can foreshadow: always the members on stage, plus, within about 1,000 tokens and most recently named first, the ones the active checkpoint gives a motive or a speaking part and anyone named (by card name, alias or a given name only they carry) in the last 20 messages; the default `own` sees only its own.\n- **Good.** `{ \"id\": \"guild_rep\", \"name\": \"Tobias\", \"role\": \"guild receptionist at the quest counter: hands out postings and pays rewards\", \"aliases\": [\"Tobias Eldergreen\"] }`, and one narrator with `\"view\": \"omniscient\"`.\n- **Bad.** A roster without roles; the player's own persona in the roster; a card for the role the story gives the player (a greeting that says \"You are the pawnbroker\" and a roster member \"The Pawnbroker\"); two members sharing the alias \"the guard\".\n- **If wrong.** Without roles the judge director falls back and the rules pick the speaker (`ADAPT-v2.5.md` finding in the campaign repo). A role that describes the plot rather than the character steers the wrong person into the scene. A cast member who is the player speaks the player's part and then other characters' lines: the Pawnbroker card narrated the player's role and posted the Queen's Agent's line (seen in a test session). Diagnostic `roster-member-is-player` (\"Another character speaks as the player: the story casts the player's own role as someone else.\") flags a member whose name is the persona, or the role the description, player introduction or a scripted opener gives the player (\"you are the …\", \"the player is a …\"); the wizard's agent refuses such a card or member, reading its cards' first messages too.\n\n---\n\n[Author's guide](../README.md) · previous: [Requirements](requirements.md) · next: [Drives and motives](drives-motives.md)\n"
 },
 {
  "id": "author/topics/scenario",
  "doc": "author/topics/scenario.md",
  "audience": "author",
  "title": "Scenario",
  "headings": [
   {
    "level": 1,
    "text": "Scenario",
    "slug": "scenario"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: scenario). Edit the source, then run npm run docs:guide. -->\n\n# Scenario\n\nGuide topic `scenario` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `effects.scenario`: text, or `\"\"` / `null` to clear (`schema.ts` `CheckpointEffects`, `validate/checkpoints.ts`, `runtime/storyScenario.ts`).\n\n- **What it does.** Sets the chat's own scenario text (`chat_metadata.scenario`) along the played path: text sets it, `\"\"` or `null` clears it, and a beat without the key keeps what the path before it set. In a group SillyTavern then sends this one text instead of every member card's scenario. It waits with World Info until the story's requirements are met. A `/cp activate` jump plays the target's own value, so a jump target that authors none plays with the chat's scenario from before the story. A scenario the user typed into the chat is never overwritten; restarting or removing the story puts back what the chat held before.\n- **Good.** Framing only: genre, places, the arc's name (the campaign sets one per beat): `\"scenario\": \"Aegis City in autumn. The guild hall is the party's base.\"`\n- **Bad.** A `scenario` with the final foe or a secret in it: every member's prompt carries it.\n- **If wrong.** A story that sets none leaves every member card's scenario in the prompt at once; the author view names those cards (\"N character card scenario(s) frame this chat and the story sets none\").\n\n---\n\n[Author's guide](../README.md) · previous: [Background](background.md) · next: [Cast changes](cast-changes.md)\n"
 },
 {
  "id": "author/topics/scene-read",
  "doc": "author/topics/scene-read.md",
  "audience": "author",
  "title": "Scene places and times",
  "headings": [
   {
    "level": 1,
    "text": "Scene places and times",
    "slug": "scene-places-and-times"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: scene-read). Edit the source, then run npm run docs:guide. -->\n\n# Scene places and times\n\nGuide topic `scene-read` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `scene_read.locations`, `scene_read.times`, `scene_read.inject` (`schema.ts` `StorySceneRead`).\n\n- **What it does.** The vocabulary the scene tracker picks from to say where and when the scene is. The judge only selects, so it needs a list. `inject: false` keeps the scene line out of the prompt.\n- **Good.** `{ \"locations\": [\"aegis_guild_hall\", \"north_road\", \"wendhope_gate\"], \"times\": [\"dawn\", \"day\", \"dusk\", \"night\"] }`, with `player_labels` on a matching `location` enum.\n- **Bad.** A free-text `location` quality and no list.\n- **If wrong.** \"The story can never say where the scene is, so nothing can key off a place.\" (`scene-read-location-empty`).\n\n---\n\n[Author's guide](../README.md) · previous: [Lore select](lore-select.md) · next: [House rules](house-rules.md)\n"
 },
 {
  "id": "author/topics/stagecraft",
  "doc": "author/topics/stagecraft.md",
  "audience": "author",
  "title": "Curator scope",
  "headings": [
   {
    "level": 1,
    "text": "Curator scope",
    "slug": "curator-scope"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: stagecraft). Edit the source, then run npm run docs:guide. -->\n\n# Curator scope\n\nGuide topic `stagecraft` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `stagecraft.lorebooks`, `stagecraft.exclude` (`schema.ts` `StoryStagecraft`, `StagecraftExclusion`, `stagecraft/scope.ts`).\n\n- **What it does.** The only lorebooks the World Info curator may edit, for this story: it keeps the story's own lore current as play goes. Its proposals are reviewed and applied at a boundary. Nothing is inferred from requirements; an empty list means no curator writes. `stagecraft.exclude` (`[{ \"lorebook\": \"...\", \"comments\": [\"...\"] }]`) names entries inside those books that the curator is never shown and may never write (`isCuratorWritable` refuses them at the write edge too); match is by entry title (comment), ignoring case. Inside an entry's content, `{{// so:protect}}` … `{{// so:end}}` marks words the curator may never change: a rewrite that drops them, a patch that crosses them or switching the entry off is refused, when proposed and again when written (an unclosed `so:protect` protects to the end). `{{// so:auto}}` anywhere in an entry lets the curator's changes to it apply on their own when its changes are set to apply on their own; every other entry still waits for you. SillyTavern drops these `{{// …}}` markers before the prompt, so they cost nothing (`stagecraft/curatorTiers.ts`).\n- **Good.** `{ \"lorebooks\": [\"Adolion Chronicle\"] }`, a book seeded with the campaign-state entries play will change; `\"exclude\": [{ \"lorebook\": \"Story Lore\", \"comments\": [\"House style\"] }]` for a meta entry that sets the book's voice.\n- **Bad.** A curator book that ships empty; a curator book that beat lore also gates; a style or rules entry left open to curator rewrites; expecting \"apply on their own\" to write an entry with no `{{// so:auto}}`.\n- **If wrong.** The curator can enable, disable, rewrite or patch existing entries, but it cannot create one, so an empty book gets nothing forever (memory note `story-authoring-traps.md`; `INTEGRATION.md`). It is never shown and never writes an entry any beat's `world_info` names, because the path replay would undo the write; a gated curator book silently disables the feature.\n\n---\n\n[Author's guide](../README.md) · previous: [Speaker direction](talk-control.md) · next: [Lore select](lore-select.md)\n"
 },
 {
  "id": "author/topics/story-basics",
  "doc": "author/topics/story-basics.md",
  "audience": "author",
  "title": "Title, description and id",
  "headings": [
   {
    "level": 1,
    "text": "Title, description and id",
    "slug": "title-description-and-id"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: story-basics). Edit the source, then run npm run docs:guide. -->\n\n# Title, description and id\n\nGuide topic `story-basics` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `title`, `description` (both required), `id`, `player_intro`, `kind` (`schema.ts` `StoryV2`, `validate.ts` `readHeader`, `validate/storyOptions.ts` `readStoryOptions`, `engine/briefing.ts` `storyKind`).\n\n- **What it does.** `title` and `description` tell the narrator, the wizard and the author what the story is. `player_intro` is the text a player reads before the first beat. `id` is the story's identity: a lowercase slug (letters, digits, `-`, `_`, at most 64 characters) that the library and every chat key the story by. Stories carry no version number: a chat tells that the library holds a different copy by its content. `kind` is `\"saga\"` or `\"story\"` (the default when absent): a saga gets its own icon and label on the group list, recent chats and the Continue list. Only those player badges read it; the model never does. Chapters do not make a story a saga: a single act split into chapters is still a `story`.\n- **Good.** `\"title\": \"The Pawnbroker's Debt\"`, a two-sentence description of the premise and the stakes, and a `player_intro` that sets the scene without the twist. `\"kind\": \"saga\"` only on the story that plays a whole campaign.\n- **Bad.** A description that is the plot outline with the ending in it; a `player_intro` that names the culprit; `\"kind\": \"saga\"` on every act of a campaign, so the badge no longer tells the campaign from its acts.\n- **If wrong.** Each chat pins a full copy of the story it plays. Changing the `id` after chats play the story makes a different story: the old chats keep the old copy and never see your edits. A story without an `id` gets one derived from its title on first save. A `version` key (from a story written elsewhere) is ignored. A `kind` other than `\"saga\"` or `\"story\"` is refused and the story does not load (`story-kind-invalid`).\n\n---\n\n[Author's guide](../README.md) · previous: [How a story plays](../how-a-story-plays.md) · next: [Briefing](briefing.md)\n"
 },
 {
  "id": "author/topics/talk-control",
  "doc": "author/topics/talk-control.md",
  "audience": "author",
  "title": "Speaker direction",
  "headings": [
   {
    "level": 1,
    "text": "Speaker direction",
    "slug": "speaker-direction"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: talk-control). Edit the source, then run npm run docs:guide. -->\n\n# Speaker direction\n\nGuide topic `talk-control` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `checkpoints[].talk_control`: `speakers` `[{ member, weight }]`, `lead`, `no_repeat`, `allow_silence`, `director` (`true` or `{ instruction }`), `chain` (`{ mode, max, sequence, stop_on_transition, stop_on_player, hold_extraction }` or `false`) (`schema.ts` `TalkControl`, `validate/checkpoints.ts` `readTalkControl`).\n\n- **What it does.** Decides who answers in a group while the beat is active (and the chat's \"Speaker direction\" setting is on). An explicit trigger always wins; then a single name mention; then the director (an AI pick from the candidates, the objective and your `instruction`); then weighted rules (`lead` first, `weight`s, `no_repeat` skips the last speaker). `allow_silence` lets the director hand the turn back to the player. `chain` lets several voices answer one message: `director` mode asks who is next until it hands back, `scripted` mode walks `sequence`; `max` is 1 to 8 (default 3); `stop_on_transition` ends the chain when the story moves.\n- **Good.** `{ \"lead\": \"Adolion Narrator\", \"speakers\": [{ \"member\": \"Adolion Narrator\", \"weight\": 3 }, { \"member\": \"Tobias\", \"weight\": 2 }], \"director\": { \"instruction\": \"Pick Adolion Narrator whenever the player acts … Pick Tobias when …\" } }`. The director reads the instruction and the roles, not the weights, so end the instruction with the scene's real speakers. Chains: 2 at a decision, 4 with `hold_extraction` for an ensemble, `false` for a confession (`STORY-TUTORIAL.md`).\n- **Bad.** A `lead` left out of `speakers`; an enabled character missing from `speakers`, whom the narrator then voiced (Tobias in T1; `14-findings.md`).\n- **If wrong.** A lead outside the list still joins at weight 1 (`talk-lead-outside-speakers`); a name nobody has falls back to SillyTavern (`talk-member-unknown`); `allow_silence` without the director never happens (`talk-silence-without-director`); a scripted chain without a sequence speaks one voice (`talk-chain-empty`), and an unknown voice in it is skipped (`talk-chain-member-unknown`).\n\n---\n\n[Author's guide](../README.md) · previous: [Thread bridges](arc-bridges.md) · next: [Curator scope](stagecraft.md)\n"
 },
 {
  "id": "author/topics/tension",
  "doc": "author/topics/tension.md",
  "audience": "author",
  "title": "Tension targets",
  "headings": [
   {
    "level": 1,
    "text": "Tension targets",
    "slug": "tension-targets"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: tension). Edit the source, then run npm run docs:guide. -->\n\n# Tension targets\n\nGuide topic `tension` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `checkpoints[].tension_target` (`calm`, `stirring`, `tense`, `critical`, `peak`).\n\n- **What it does.** The tension the beat aims for. Tension is read as one of the five levels each turn, smoothed, and compared with the target and the dramatic shape; the narrator gets a one-line steer.\n- **Good.** `calm` at the guild hall, `stirring` when the posting is taken, `critical` in the ambush, `peak` at the finale.\n- **Bad.** Every beat at `peak`; a target at odds with the beat's objective (a quiet negotiation at `critical`).\n- **If wrong.** Pacing pushes the narrator the wrong way. The measured scale also overshoots on calm play (T1-6 recorded a calm scene climbing toward \"critical\"), so do not rely on a gate over `tension_current` for a quiet beat.\n\n---\n\n[Author's guide](../README.md) · previous: [Open stretches](open-stretches.md) · next: [Narrator guidance](guidance.md)\n"
 },
 {
  "id": "author/topics/transitions",
  "doc": "author/topics/transitions.md",
  "audience": "author",
  "title": "Transitions",
  "headings": [
   {
    "level": 1,
    "text": "Transitions",
    "slug": "transitions"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: transitions). Edit the source, then run npm run docs:guide. -->\n\n# Transitions\n\nGuide topic `transitions` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `transitions[].from`, `to`, `gate`, `priority` (required), `extraction_hint`, `extractor_trigger`, `effects.progress` (`schema.ts` `Transition`, `validate/gates.ts` `readTransition`).\n\n- **What it does.** An exit between two beats. When several exits of a beat hold at once, the highest `priority` fires, and one exit fires per turn. `extraction_hint` tells the reading model what to watch for at this exit (it augments the rubric, never the values). `extractor_trigger` is a text pattern that forces an immediate read when a message matches; it never sets anything itself.\n- **Good.** `{ \"from\": \"cp1\", \"to\": \"cp2\", \"priority\": 1, \"gate\": { \"q\": \"approached_board\", \"op\": \"==\", \"v\": true }, \"extraction_hint\": \"Watch for the player moving toward or reading the job board.\" }`. When two gates can both be true, give the more specific one the higher priority; the campaign uses 2 for the main line and 1 for fallbacks.\n- **Bad.** An `extractor_trigger` on a bare common word (`go`, `yes`), which fires on everything; a beat with no exit that is not an ending.\n- **If wrong.** A beat nothing leads to can never be reached (`anchor-unreachable`). A beat with no way on stops the story there (`story-dead-end` once chapters are declared). Every scene needs an exit the world's pressure guarantees (`STORY-TUTORIAL.md`).\n\n---\n\n[Author's guide](../README.md) · previous: [Gates](gates.md) · next: [Convergence](convergence.md)\n"
 },
 {
  "id": "author/topics/widgets",
  "doc": "author/topics/widgets.md",
  "audience": "author",
  "title": "Stats and story panels",
  "headings": [
   {
    "level": 1,
    "text": "Stats and story panels",
    "slug": "stats-and-story-panels"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: widgets). Edit the source, then run npm run docs:guide. -->\n\n# Stats and story panels\n\nGuide topic `widgets` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nFields: `qualities[].display` (`public`, `label`, `as`, `group`, `min`, `max`, `bands`, `hide_when_empty`, `trend`), `widgets[]` (`id`, `kind`, `title`, `bind`, `options`, `visible_when`, `audience`, `accent`, `icon`), `display.journal`, `display.stat_sheet`, `display.widgets` (`engine/gameSchema.ts`, `validate/display.ts`, `validate/widgets.ts`, `runtime/widgets.ts`).\n\n- **What it does.** `display: {public: true, label, as}` puts a quality on the player's Stat sheet: `item` (a bool, shown once true, grouped as Inventory), `count`, `meter` (a number with `min` and `max`), `boxes` (an int at most 12 apart) or `word` (an enum with `player_labels`, or a bounded number with `bands: [{max, label}, …, {label}]`, ascending, the last open). `hide_when_empty` (default on for items and counts) keeps an empty row out; `trend` adds an arrow against the previous turn. Nothing that is not public is ever sent to a panel. A widget is a closed panel bound by reference: `meters` (`\"quality:<key>\"`, `{qualities}` or `{group}`), `track` (`\"path\"` or `\"quests\"`), `log`, `clock` (one int whose `min` and `max` are 2 to 12 apart; it clamps, and \"full\" is an ordinary gate) and `board` (`\"quests\"` or `\"arcs\"`, read-only lanes). With no widget the Journal is a track and a log, and the Stat sheet is every public quality; an authored widget of the same kind replaces it. `audience: \"author\"` shows a widget in Author view only. `accent` and `icon` come from a fixed list; there is no markup.\n- **Good.** `{ \"key\": \"supplies\", \"type\": \"int\", \"source\": \"extractor\", \"rubric\": \"…\", \"display\": { \"public\": true, \"label\": \"Supplies\", \"as\": \"meter\", \"min\": 0, \"max\": 10, \"bands\": [{ \"max\": 2, \"label\": \"Running out\" }, { \"max\": 6, \"label\": \"Enough\" }, { \"label\": \"Well stocked\" }] } }`.\n- **Bad.** `display` on a relationship (`rel_*`) or on a key a checkpoint-gated World Info entry names (refused: it would spoil); a player widget bound to a quality that is not public (refused); a clock bound to a pressure pool (not built yet).\n- **If wrong.** An empty group or section is never drawn, and counts come only from what shows, so a panel never hints at hidden rows.\n\n---\n\n[Author's guide](../README.md) · previous: [Checks](checks.md) · next: [Character life](character-life.md)\n"
 },
 {
  "id": "author/topics/world-info",
  "doc": "author/topics/world-info.md",
  "audience": "author",
  "title": "Beat lore",
  "headings": [
   {
    "level": 1,
    "text": "Beat lore",
    "slug": "beat-lore"
   }
  ],
  "body": "<!-- Generated by scripts/docs/split-guide.mjs from docs/authoring/story-guide.md (topic: world-info). Edit the source, then run npm run docs:guide. -->\n\n# Beat lore\n\nGuide topic `world-info` (the Studio's \"How to write this\" and the wizard's `readGuide` show the same topic).\n\nField: `effects.world_info`: `{ \"enable\": [{ \"lorebook\": \"<book>\", \"comments\": [\"<entry title>\", …] }], \"disable\": [ … ] }` (`engine/worldInfoEffects.ts` `readWorldInfoEffect`).\n\n- **What it does.** Switches lorebook entries on and off along the story's path. Every entry any beat names belongs to the story (its gated set). The set rests off, and on every apply (a new beat, a reopened chat, a rollback, a story swap) it is rebuilt by replaying the chat's path from the start, so a reopened chat ends in the same state as a continuous one. With per-chat gating (the default) that rebuild happens on each scan's own copy of the entries, never in the lorebook file. Entries outside the set are never touched.\n- **Good.** `{ \"disable\": [{ \"lorebook\": \"Adolion Adventurer Checkpoints\", \"comments\": [\"CP guild-hall - Scene\"] }], \"enable\": [{ \"lorebook\": \"Adolion Adventurer Checkpoints\", \"comments\": [\"CP the-sheridan-steward - Scene\"] }] }`, with the book generated from the same source as the story so a title can never name a missing entry (`INTEGRATION.md`).\n- **Bad.** A secret in a constant entry with no character filter, which every drafted member reads: Erevan named the plant in T3-1 (`14-findings.md`, T3-1 fix wave). The effect only toggles entries; it has no per-member target, so make a secret narrator-only or keyed.\n- **If wrong.** With per-chat gating (the default) these entries stay off in their files, show as off in SillyTavern's lorebook editor and stay off with the extension disabled (`world-info-rests-off`). An entry named by a misspelt title is simply not found. Require the book under `requirements.lorebooks`.\n\n---\n\n[Author's guide](../README.md) · previous: [Author's note](author-note.md) · next: [Preset](preset.md)\n"
 },
 {
  "id": "author/wizard",
  "doc": "author/wizard.md",
  "audience": "author",
  "title": "The setup wizard",
  "headings": [
   {
    "level": 1,
    "text": "The setup wizard",
    "slug": "the-setup-wizard"
   },
   {
    "level": 2,
    "text": "The four steps",
    "slug": "the-four-steps"
   },
   {
    "level": 2,
    "text": "The story agent",
    "slug": "the-story-agent"
   },
   {
    "level": 2,
    "text": "What it creates on your install",
    "slug": "what-it-creates-on-your-install"
   }
  ],
  "body": "# The setup wizard\n\nThe wizard turns a premise into a playable story, and creates the character cards, lorebook and group it needs.\nTurn it on under **Authoring** in the settings, then use **Start → New story (wizard)** or the Studio's\n**Wizard** tab.\n\n## The four steps\n\n| Step | What it settles |\n|---|---|\n| Premise | What the story is about, and what it measures as it goes. |\n| Turning points | The beats, and what has to be true to move between them. |\n| Characters | Who is in it, what they want, and where their threads point. |\n| Setup | Create the cards, lore and group this story needs to run. |\n\nThese are the same four steps as [Build a story step by step](step-by-step.md). The wizard writes through the same\nedits you would make by hand, so everything it does shows in the Studio.\n\nWhen a choice is yours, it asks. **You decide** lets it pick and carry on.\n\n## The story agent\n\nThe agent version of the wizard plans first (\"Waiting for you to agree the plan\"), then works one change at a time.\nChoose its mode:\n\n- **Review every change**: each change waits for you to accept, edit or reject it (with a reason it reads).\n- **Write to the draft, review before saving**: changes go into the draft; you review before you save.\n\nIt reads this guide (`readGuide`) and can check reachability and walk the story before it finishes. **Note to the\nagent** steers its next step; **Continue** resumes after it finishes.\n\nThe agent runs on the model chosen for **Wizard and road ahead** under **Models per task** (by default, the memory\nmodel). That task can also be routed to opencode on the SillyTavern server, through the\n[harness plugin](../setup/harness.md); then the agent calls its tools natively, and it does not fall back to the\nlocal profile when the harness is unavailable.\n\n## What it creates on your install\n\nThe wizard only ever **creates**; it never edits or deletes a card, lorebook or group that already exists.\n\n- Each card, lorebook and group is proposed as its own card. You read it and press **Create it**. Nothing is\n  created by \"accept all\".\n- It never creates a persona; personas are yours.\n- A group it builds holds only this story's cast.\n- A story's lorebooks are switched on only in the chats that play that story, never for every chat.\n\n\"Fix with wizard\" (Repair, or the requirements panel in Author view) starts it on just the missing cards and books\nof an existing story.\n\n---\n\n[Author's guide](README.md)\n"
 },
 {
  "id": "player/README",
  "doc": "player/README.md",
  "audience": "player",
  "title": "Playing a story",
  "headings": [
   {
    "level": 1,
    "text": "Playing a story",
    "slug": "playing-a-story"
   },
   {
    "level": 2,
    "text": "Player mode and Author view",
    "slug": "player-mode-and-author-view"
   }
  ],
  "body": "# Playing a story\n\nStory Orchestrator turns a SillyTavern chat into a story with a shape: scenes that open in order, characters who\ncome and go, and a memory of what happened. You play as you always do, by writing messages. The extension follows\nalong, keeps track, and nudges the characters toward the next scene.\n\nYou do not need to learn anything to play. These pages explain what you see on screen.\n\n- [Starting, continuing and restarting](playing.md): picking a story for a chat, restarting, library updates,\n  branches, the welcome-back recap and the `/story` command.\n- [The story bar, the drawer and the notes under messages](drawer-and-hud.md): what each part of the screen\n  tells you.\n- [Memory](memory.md): what the story remembers, and how to pin, edit or remove a memory.\n- [Troubleshooting and FAQ](troubleshooting.md): when the story does not move, or something looks wrong.\n\nSetting up the extension for the first time is in [Setup](../setup/README.md). Writing your own stories is in the\n[Author's guide](../author/README.md).\n\n## Player mode and Author view\n\nThe drawer opens in **player mode**. It shows only what a player should see: where you are, what happened, what is\nstill open. Nothing in it spoils the story.\n\n**Author view** is for the person who wrote or is testing the story. It *adds* the machinery (tracked facts,\nscheduler, prompt contents, steering controls) and spoils the story, so it asks before it turns on. It is per chat.\nIf you only want to play, leave it off.\n"
 },
 {
  "id": "player/drawer-and-hud",
  "doc": "player/drawer-and-hud.md",
  "audience": "player",
  "title": "The story bar, the drawer and the notes under messages",
  "headings": [
   {
    "level": 1,
    "text": "The story bar, the drawer and the notes under messages",
    "slug": "the-story-bar-the-drawer-and-the-notes-under-messages"
   },
   {
    "level": 2,
    "text": "The story bar",
    "slug": "the-story-bar"
   },
   {
    "level": 2,
    "text": "The drawer",
    "slug": "the-drawer"
   },
   {
    "level": 2,
    "text": "Notes under messages",
    "slug": "notes-under-messages"
   }
  ],
  "body": "# The story bar, the drawer and the notes under messages\n\n## The story bar\n\nA thin bar above the chat box shows the current scene, for example `◈ The Job Board · tension rising`. Click it to\nopen the drawer. It can also show:\n\n| Chip | Meaning |\n|---|---|\n| `N updates next turn` | The story noticed something; it takes effect after the next reply. |\n| `catching up…` | The story is re-checking recent scenes. Keep playing. |\n| `catching up after your edit` | You edited the last reply: the story stepped back to before it and is re-reading the edited text (a few seconds). A reply sent before then is built from the pre-edit state. |\n| `fix setup (N)` | Something stops the story (for example no memory model is chosen). Click it to open the Repair row. |\n| `check setup (N)` | Something weakens the story but it still plays. Click it to open the Repair row. |\n| `not keeping up` | Something went wrong reading the scene. See [Troubleshooting](troubleshooting.md). |\n| `stepped back` | You swiped, edited or deleted a message and the story moved back to match. |\n| `branch — continue?` | This chat is a branch; click to pick the story up here. |\n\nThe bar can be switched off under **Display** in the settings.\n\n## The drawer\n\nThe story drawer is the route icon in SillyTavern's top bar. In player mode it has two tabs.\n\n**Overview**, top to bottom:\n\n- **Setup**, only when something needs doing: what each problem costs the story, a **Show me** button and, where\n  one exists, a one-click fix. Before the first message it starts with **Before you start**, the things that stop\n  the story. A problem that only weakens the story has **I know, keep it**, which hides it on this install until\n  you bring it back; one that stops the story cannot be hidden.\n- **Where you are**: the scene, the place, what is going on, and how tense things are (\"The scene is calm.\" up to\n  \"Everything is at breaking point.\"). \"What happens next is yours to decide.\" means the story is waiting on you.\n- **About this story**: the story's introduction.\n- **Recently**: the scene you just left and the one you are in.\n- **Open threads**: things that are not settled yet.\n- **Your story**: chapters that have ended, each with its summary. Click one to read it.\n- **The story so far** (or **This chapter**): a short summary.\n- **Noted**: things the story picked up that take effect on the next turn.\n- **Status**: what the extension is doing right now (\"Following along.\", \"Reading the last few messages…\").\n- **Illustrations — this chat**, when images are set up: pause automatic images, or draw a scene, a portrait or a\n  background by hand.\n- **Chat preferences — this chat only**: speaker direction in group chats, and the story's dramatic shape.\n- At the bottom: **Restart story**, and a Repair button when something is missing.\n\n**Memory**: what the story remembers. See [Memory](memory.md).\n\nThe ⚑ button flags a moment for the author (\"What happened here?\"). It does not change the story.\n\nThe ? button opens Help in a panel you can drag, resize and close with Escape; it remembers where you left it.\nOn a narrow screen it docks along the bottom. While a story plays, the extensions wand beside where you type\nalso offers **Story recap**, **Story briefing** (when the story has one), **Flag this moment** and **Open the story drawer**.\n\nThe lightbulb opens **What could I do?** (see [Starting, continuing and restarting](playing.md)).\n\nIn Author view, the list button next to ? opens the **Activity** panel: what the machine did behind each recent\nmessage, rolls included, each linked to its message. The Scheduler tab also names phrases the newest reply repeats\nfrom at least two of the five replies before it (\"Repeating across the last 6 replies: …\"); it is counted in code,\ncalls no model and only reports.\n\n## Notes under messages\n\nSmall icons under each message show what the story did at that point. Click an icon to read its notes.\n\n| Icon | About |\n|---|---|\n| route | The story moved to a new scene. |\n| brain | Something was remembered or summarized. |\n| branch | A thread opened or was resolved. |\n| book | Lore the story looked up. |\n| people | Someone joined, left, or was chosen to speak. |\n| heart-pulse | Tension changed. |\n| chip | What the memory model noticed. |\n| warning triangle | The story stepped back, or had trouble. |\n\nWhen the story enters a new chapter, a title card with the chapter's name appears under that message. When the\nstory rolls a check it chose to show you, the roll sits under the reply it decided, for example \"Climb: 15 + 4 vs\n12, success\"; a swipe or a reopened chat shows the same roll. In Author view at Behind the scenes or higher, every\nother dice roll and background draw also shows as a chip under its message. **Dice chips under messages** in the\nsettings turns them off.\n\nInside a note: a spinner means in progress, a clock means waiting for the next turn, a check means applied, a\ncrossed circle means refused.\n\n**Notes under messages** in the settings chooses how much you see:\n\n| Level | Shows |\n|---|---|\n| Off | Nothing. |\n| Story (default) | Scene changes, memories, threads, tension. |\n| Behind the scenes | Also lore looked up, speaker choices, summaries and problems. |\n| Author, Raw | Story internals; only with Author view on. |\n\nStory and Behind the scenes never show spoilers. You can also limit notes to the last N messages.\n\n---\n\n[Playing a story](README.md)\n"
 },
 {
  "id": "player/memory",
  "doc": "player/memory.md",
  "audience": "player",
  "title": "Memory",
  "headings": [
   {
    "level": 1,
    "text": "Memory",
    "slug": "memory"
   },
   {
    "level": 2,
    "text": "The Memory tab",
    "slug": "the-memory-tab"
   },
   {
    "level": 2,
    "text": "Memorize an existing chat",
    "slug": "memorize-an-existing-chat"
   },
   {
    "level": 2,
    "text": "Private knowledge",
    "slug": "private-knowledge"
   },
   {
    "level": 2,
    "text": "Chapters",
    "slug": "chapters"
   }
  ],
  "body": "# Memory\n\nAfter each reply, a second model (the *memory model*) reads the recent chat and writes down what matters: facts,\ndetails of the current session, a short summary of the last few turns, and a history of past scenes. Those notes go\nback into the prompt, so characters remember what happened long after it scrolled out of view.\n\nThe memory model is chosen once for the whole install (see [Memory model](../setup/memory-model.md)). Without one,\nnothing is remembered and the story does not move on its own.\n\n## The Memory tab\n\nThe drawer's **Memory** tab, \"What the story remembers\", lists every memory in four groups: **Facts**, **Session\ndetails**, **Short-term** and **Scene history**.\n\nOn each memory:\n\n- **Pin** keeps it in the prompt even when space runs short (📌). If pinned memories do not all fit, the tab says\n  how many were left out.\n- **Edit** fixes the wording. An edited memory is marked \"kept by you\".\n- **Exclude** removes it. A toast lets you undo for a few seconds.\n\n\"The message it came from changed\" means you edited or swiped the message the memory was read from; check it.\n\nFilter by **Character**, and past 50 memories use **Find** to search.\n\n## Memorize an existing chat\n\n**Memorize chat** reads the whole chat history into memory, for a chat that started before the extension was on.\nIt shows progress (`Memorizing: 3/12`) and can be stopped.\n\n## Private knowledge\n\nIn a group, each character knows only what they saw or were told. A secret one character keeps is not shown to the\nothers' replies. A memory that would give such a secret away is left out of the Memory tab, or shown without the\nsentence that does. You do not need to do anything for this.\n\n## Chapters\n\nSome stories end chapters as they go. When one ends, a **Previously** card shows its summary, and the chapter\nappears under **Your story** in the Overview. Older memories are folded into the chapter summary so the prompt stays\nsmall. A wrong summary can be flagged with ⚑.\n\n---\n\n[Playing a story](README.md)\n"
 },
 {
  "id": "player/playing",
  "doc": "player/playing.md",
  "audience": "player",
  "title": "Starting, continuing and restarting",
  "headings": [
   {
    "level": 1,
    "text": "Starting, continuing and restarting",
    "slug": "starting-continuing-and-restarting"
   },
   {
    "level": 2,
    "text": "Pick a story for a chat",
    "slug": "pick-a-story-for-a-chat"
   },
   {
    "level": 2,
    "text": "The story briefing",
    "slug": "the-story-briefing"
   },
   {
    "level": 2,
    "text": "Your character",
    "slug": "your-character"
   },
   {
    "level": 2,
    "text": "Each chat keeps its own copy",
    "slug": "each-chat-keeps-its-own-copy"
   },
   {
    "level": 2,
    "text": "Restart",
    "slug": "restart"
   },
   {
    "level": 2,
    "text": "Swipes, edits and deletions",
    "slug": "swipes-edits-and-deletions"
   },
   {
    "level": 2,
    "text": "Talking out of character",
    "slug": "talking-out-of-character"
   },
   {
    "level": 2,
    "text": "Stuck? \"What could I do?\"",
    "slug": "stuck-what-could-i-do"
   },
   {
    "level": 2,
    "text": "Branches",
    "slug": "branches"
   },
   {
    "level": 2,
    "text": "Finding your story chats",
    "slug": "finding-your-story-chats"
   },
   {
    "level": 2,
    "text": "Journal, stat sheet and story panels",
    "slug": "journal-stat-sheet-and-story-panels"
   },
   {
    "level": 2,
    "text": "Coming back after a break",
    "slug": "coming-back-after-a-break"
   },
   {
    "level": 2,
    "text": "The /story command",
    "slug": "the-story-command"
   }
  ],
  "body": "# Starting, continuing and restarting\n\n## Pick a story for a chat\n\nA story plays in one group chat at a time, a group with the story's characters. Stories play in group chats only: in\na one-on-one chat the story stays off and the panel offers **Make a group for this story**.\n\n1. Open the group chat (a story needs an open group chat; with no chat open, an imported story is only saved to the\n   library: \"Open a chat to play it.\"; in a one-on-one chat it is saved and the panel offers to make a group).\n2. Open **Extensions → Story Orchestrator**. The panel starts with four tasks:\n   - **Start**: **New story (wizard)** builds one from a premise; **Import a story** takes a story file (JSON).\n   - **Continue**: says what this chat plays (\"No story is playing in this chat yet.\" or `Playing \"<title>\".`).\n     **Choose a story** picks one from your library.\n   - **Repair**: the one thing still missing, if any, with **Show me the setting** or **Show me the group**.\n   - **Author**: Author view and the Studio, for writing stories.\n3. Write your first message. The story follows from there.\n\nIf the story needs characters, a lorebook or a persona this chat does not have, the drawer lists them under\n**This story still needs** and Repair names the first one.\n\n## The story briefing\n\nThe first time a story starts in a group chat, a **Before you start** page opens over the chat: the author's\nbriefing (the world, who you are, who is with you, how to play), and on your first story ever a short\n**How Story Orchestrator works** section about the status strip, the notes under messages and the drawer. The\nopening scene still posts behind it; close it with the button at the bottom (**Begin**, or the author's own word).\n\nEach chat shows it once, and remembers that across reloads, swipes and edits. **Restart story** shows it again. Re-open\nit any time with **Story briefing** at the bottom of the drawer's Overview, or `/story intro`. To stop it opening on\nits own, untick **Show the story briefing when a story starts** under **Display**, or tick **Don't show briefings**\non the page itself. A story without a briefing shows its introduction instead, if it has one.\n\n## Your character\n\nA story can say who you play in it: a role, a few lines about you and what the story takes for granted. Then the\nstart page also shows **Who you are in this story**, and you choose once:\n\n- **Play as** your current persona (what closing the page does too);\n- **Choose another persona** from the ones you have;\n- **Create a persona for this story**: the name and description are shown in full and you can edit them first.\n  It is only ever added; your other personas are never changed.\n\nWhatever you choose, the chat keeps that persona for the whole story (SillyTavern's own chat lock), and the opening\nscene waits for your choice. The story also tells the characters, in one line, who you are in it. If you switch\npersona in the middle of the story, the drawer says so with **Switch back**: characters know you as the person you\nstarted as. To play someone else, **Restart story** and choose again. A story that fixes your name waits until a\npersona with that name is chosen.\n\n**Your character in this story** at the bottom of the drawer's Overview, or `/story who`, shows it again. To skip the\nquestion and always keep your current persona, untick **Ask who you are when a story starts** under **Display**.\n\n## Each chat keeps its own copy\n\nA chat keeps the exact copy of the story it started with. Editing or deleting the story in the library never\nchanges a game in progress. When the library's copy differs, Author view shows **Update to the latest** in the\ndrawer. A small update is applied in place; a bigger one asks whether to **Keep playing**, **Restart story** or\n**Cancel**.\n\n## Restart\n\n**Restart story** (bottom of the drawer's Overview) starts the story over in this chat. Your messages stay; the\nstory's progress and its memory are cleared. It asks first.\n\n## Swipes, edits and deletions\n\nChange the chat however you like. When you swipe a reply, edit a message or delete one, the story steps back to\nmatch, and the drawer says so (\"The story stepped back to … to match your edit.\"). It moves forward again on the\nnext reply.\n\nIf an edit reaches back further than the chat can rewind, the story stays where it is and offers **Re-read from the\ncurrent scene** or **Restart story**.\n\n## Talking out of character\n\nTo say something outside the story, wrap the whole message in double brackets, `((brb, dinner))`, or start it with\n`OOC:` or `(OOC`. The characters still see it, but the story does not read it: it changes nothing in the story,\ncounts as no turn, is never remembered and is not listed in the story panel's log. Brackets inside an ordinary line, \"I say (quietly) hello\", are read as\nusual. To correct the story, edit the message instead.\n\n## Stuck? \"What could I do?\"\n\nThe lightbulb button in the story drawer (and **What could I do?** in the wand menu) asks the memory model for four\nthings you could try next. It sees only what you have already seen: the scenes you reached, the drawer's Overview\nand the recent messages, never the story's later scenes or anything a character keeps from you. Pick one and it is\nput in the box where you type; nothing is sent until you send it, and it never replaces something you started\ntyping. **Other ideas** asks again. It calls the model only when you open it. A story can switch the button off, and\nso can you under Display.\n\n## Branches\n\nA branch made from a chat that plays a story does not pick the story up on its own. The story bar shows\n`branch — continue?`; click it, then **Continue from here** to carry on from where the branch ends.\n\n## Finding your story chats\n\nGroups and chats that play a story carry a small icon in SillyTavern's lists: the group list, the welcome\nscreen's recent chats and a group's past chats. A saga, a story its author marks as one (a whole campaign rather than one of its acts), has its own icon.\nHover or focus the icon for a card with the story, its chapter, where you are and when you last played.\n\n**Your stories**, under Continue in the extension's settings, lists every chat that plays a story, newest\nfirst; **Open** takes you straight to it. The list fills in as you open chats, and once in the background after\nan update. A chat keeps its row while it still plays its story, even after the story leaves your library.\n\nEach of these can be switched off under Display, and a story can switch its own off; a story can never turn one\non that you switched off.\n\n## Journal, stat sheet and story panels\n\nA story with side quests gives you a **Journal**: the quests you have found, their steps and progress, what a\nquest gives you when the story shows it, the main line so far, milestones you have earned, and a short log. A quest\nyou have not found yet is not listed at all. A story that shows some of your stats gives you a **Stat sheet**, and a\nstory can add its own panels (a clock filling up, a quest board). Open them from the buttons under the drawer's\nOverview or from the wand menu; each opens in its own panel you can move and resize. **Journal**, **Stat sheet** and\n**Story panels** in the settings turn each off, and the author can switch them off for one story.\n\nA swipe or an edit of the reply that finished a quest takes the quest, and whatever it gave you, back with it.\n\n## Coming back after a break\n\nAfter eight hours or more away, opening the chat shows a **Welcome back** recap: where you are, what happened\nrecently and what is still open.\n\n## The /story command\n\nType these in the chat box. None of them spoil anything.\n\n| Command | What it does |\n|---|---|\n| `/story recap` | Where the story is right now (the same as the drawer's Overview). |\n| `/story threads` | What is still open. |\n| `/story chapters` | The chapters that have ended, if the story uses chapters. |\n| `/story chapter <n>` | One ended chapter's summary. |\n| `/story chronicle export` | Copies the whole chronicle as Markdown. |\n| `/story intro` | Opens the story briefing again. |\n| `/story who` | Who you play in this story. |\n| `/story quests` | The quests you have found and where each stands. |\n| `/story flag [note]` | Marks this moment for the author to look at. |\n| `/story guide [page]` | Opens this guide inside SillyTavern, at a page such as `player/memory`. |\n\n`/so-mem list`, `/so-mem pin <n> on|off` and `/so-mem exclude <n>` manage memories from the chat box (see\n[Memory](memory.md)). `/cp` is an author tool and works only in Author view.\n\n---\n\n[Playing a story](README.md)\n"
 },
 {
  "id": "player/troubleshooting",
  "doc": "player/troubleshooting.md",
  "audience": "player",
  "title": "Troubleshooting and FAQ",
  "headings": [
   {
    "level": 1,
    "text": "Troubleshooting and FAQ",
    "slug": "troubleshooting-and-faq"
   },
   {
    "level": 2,
    "text": "The story does not move",
    "slug": "the-story-does-not-move"
   },
   {
    "level": 2,
    "text": "The story says it still needs something",
    "slug": "the-story-says-it-still-needs-something"
   },
   {
    "level": 2,
    "text": "\"check setup\" on the HUD",
    "slug": "check-setup-on-the-hud"
   },
   {
    "level": 2,
    "text": "\"changes not saved yet\"",
    "slug": "changes-not-saved-yet"
   },
   {
    "level": 2,
    "text": "\"saved by another version of Story Orchestrator\"",
    "slug": "saved-by-another-version-of-story-orchestrator"
   },
   {
    "level": 2,
    "text": "A character knows something they should not",
    "slug": "a-character-knows-something-they-should-not"
   },
   {
    "level": 2,
    "text": "FAQ",
    "slug": "faq"
   }
  ],
  "body": "# Troubleshooting and FAQ\n\nStart with the drawer's **Status** line and the settings panel's **Repair** row. Repair always names the single most\nimportant thing to fix, and **Show me** takes you to the control. The drawer's **Setup** list shows every problem at\nonce: the ones that stop the story first, then the ones that weaken it.\n\n## The story does not move\n\n| You see | What it means | What to do |\n|---|---|---|\n| \"Nothing is following the story yet — choose a memory model in the extension settings.\" | No memory model is chosen. | Pick one: [Memory model](../setup/memory-model.md). |\n| \"Nothing is following the story — the memory model it used cannot be reached.\" | The model connection it used is gone or down. | Choose another, or start your backend. |\n| \"The story will not move on its own — turn that on in the extension settings.\" | Story reading is switched off. | **Open story settings** and switch it on. |\n| \"The memory model is not answering — the story will catch up when it does.\" | Your backend is down or busy. | Check your model is running, then **Try again**. |\n| \"Catching up — re-checking recent scenes.\" | A scene is taking longer than expected. | Keep playing. It catches up on its own. |\n| \"Catching up after your edit…\" | Editing the last reply stepped the story back to before it; it is re-reading the edited text. Until that read lands (a few seconds), a reply is built from the pre-edit state. | Wait for it to clear before you send, if the edit should count for the next reply. |\n| \"What happens next is yours to decide.\" | The story waits for you to act. | Do or say something in the scene. |\n\nA story only moves on what the chat shows. If a scene should be over but is not, write it happening in the chat\n(\"We leave the tavern and take the north road.\") rather than only thinking it.\n\n## The story says it still needs something\n\n- \"Your character is not ready in this chat.\": the story was written for a specific persona. Select it.\n- \"The cast is not ready in this chat.\": a character is missing from the group, or muted. Repair names them and\n  **Show me the group** opens the member list.\n- \"The story's background lore is not ready in this chat.\": a lorebook it needs is missing. Import it.\n\n## \"check setup\" on the HUD\n\nThe story still plays, but something in your setup weakens it. These show in player mode too, so a story you\ndownloaded can tell you; Author view adds the technical detail.\n\n| You see | What it means | What to do |\n|---|---|---|\n| \"Characters' private intentions are not being tracked, because the model is not thinking before it replies. Turn on reasoning (thinking) in your model's settings to play this as intended.\" | The last 5 replies in this chat carried no reasoning, so the inner voice has nothing to read. | Turn on reasoning for your model connection (or its preset or instruct template). It clears once a reply carries reasoning. |\n| \"Summarize shares the whole chat with every character, …\" (or Vector Storage) | Another extension puts the whole chat into every character's prompt, so a character can learn what was kept from them. | Switch that extension off while the story plays. |\n| \"Stepped Thinking posts characters' thoughts as chat messages, so the story treats a thought as something that happened. …\" | Stepped Thinking is in its old \"Separated\" mode, which posts every thought into the chat. The story reads each one as a reply: it remembers it and can move on because of it. | In Stepped Thinking's settings set **Mode** to \"Embedded\", or switch it off while the story plays. **Show me** opens its settings. |\n| \"Presence hides parts of the chat from each character, and the story's memory can read the chat while it is hidden, …\" | Presence hides what a character did not witness while that character is about to speak, and a memory read in that moment sees only that view. | Untick **Enable Presence** while the story plays; the story already keeps track of who knows what. **Show me** opens its settings. |\n| \"Prompt Inspector is on, so every reply waits for you to confirm its prompt in a popup. …\" | Prompt Inspector's inspect toggle is on (it is kept in this browser), so it stops before every reply, once per character in a group turn. | Choose **Stop Inspecting** in SillyTavern's extensions menu (the magic wand). |\n\nAuthor view also lists one note that never raises the HUD count: **Vector Storage can switch on lorebook entries by itself** shows for a story that uses exclusive lore select (`lore_select.exclusive`) while Vector Storage's **Enable for World Info** is on, because exclusive lore stays off then. Untick it under Vector Storage's World Info settings (**Show me** opens them), or dismiss the note.\n\n## \"changes not saved yet\"\n\nSillyTavern did not confirm the last save. The changes go with the next save. If it stays, check that SillyTavern's\nserver is running and reload the page.\n\n## \"saved by another version of Story Orchestrator\"\n\nThis chat's story data comes from a version this one cannot read. **Restart** replaces it with a fresh start; your\nmessages stay.\n\n## A character knows something they should not\n\nFlag the moment with ⚑ in the drawer, or `/story flag <what went wrong>`. Flags go to the session journal for the\nauthor.\n\n## FAQ\n\n**Does it work in a one-on-one chat?** No: stories play in group chats. In a one-on-one chat the story stays off, and\nthe settings panel and the drawer offer **Make a group for this story**: it asks first, makes a new group with the\nstory's cast (nothing you already have is changed), sets it to start the story and opens it. A one-character story is\na group of that character plus its narrator. If a card the story needs is missing, it says which and offers **Fix with\nwizard** instead of making a partial group.\n\n**Does it slow down replies?** The memory model reads after the reply, not before it. With the optional judge, two\nof its uses (speaker direction and lore selection) run before a reply and give up after 1.5 seconds.\n\n**Can I edit, swipe and delete as usual?** Yes. The story steps back to match.\n\n**Does a story change my other chats?** No. A story's lore, cast changes and background apply only in the chat that\nplays it, and are undone when you leave it.\n\n**Is anything sent to the internet?** Only to the models you configured. The optional judge sends short excerpts to\nits provider; see [Judge](../setup/judge.md).\n\n**Where do I report a bug?** The settings panel's **Host capabilities** block has **Copy for a bug report**.\n\n---\n\n[Playing a story](README.md)\n"
 },
 {
  "id": "setup/README",
  "doc": "setup/README.md",
  "audience": "setup",
  "title": "Setup",
  "headings": [
   {
    "level": 1,
    "text": "Setup",
    "slug": "setup"
   },
   {
    "level": 2,
    "text": "Server plugins",
    "slug": "server-plugins"
   }
  ],
  "body": "# Setup\n\nOnly one thing is required: a **memory model**. Everything else is optional and off, or harmless, without it.\n\n| Piece | Needed for | Page |\n|---|---|---|\n| Memory model (a Connection Manager profile) | The story moving on its own, memory, summaries | [Memory model](memory-model.md) |\n| Judge plugin + a TypeSafe key | Faster and more careful choices: speaker picks, lore selection, memory checks, scene tracking | [Judge](judge.md) |\n| ComfyUI | Illustrations | [Images and the GPU plugin](images.md) |\n| Harness plugin | Running tasks through Claude Code, Codex or opencode logins on the server | [Harness](harness.md) |\n\nEvery setting is in **Extensions → Story Orchestrator**, below **Start / Continue / Repair / Author**, in one section\nper area (the same areas as the README's feature table). Each section's **?** opens its page in this guide, and\nrarely changed settings sit under its **Advanced** fold. The panel remembers which sections you left open.\n\n- **Playing**: which story this chat plays, the story bar, notes under messages, the briefing, list marks, pacing.\n- **Memory**: the memory model, its fallback, reply thinking, the memory model test, models per task, chapters, the\n  continuity warden (Author view).\n- **Characters**: several voices per turn.\n- **World**: how story lorebooks switch on, and the lorebook curator (Author view, or before a story is loaded).\n- **Images**: illustrations and the sprite stage.\n- **Judge**: the key, the switch, and what it is used for.\n- **Authoring**: the wizard switch (Author view, or before a story is loaded).\n- **Setup**: **Host capabilities** says which SillyTavern features the extension found, and **Copy for a bug\n  report** copies the whole picture.\n\nEach group says its scope in its title: \"this install\" settings affect every chat, \"this chat\" only the open one.\n\n![Sketch of the settings panel: one section per area, each with its ? guide button](../assets/settings-sections.png)\n\nA reference of every setting: [Settings reference](settings-reference.md).\n\n## Server plugins\n\nFour server plugins ship in `server-plugin/`: judge, and the optional GPU, media and harness plugins. SillyTavern loads server plugins only when `config.yaml` has\n`enableServerPlugins: true`, and only after a restart.\n\n- **From the release zip**: copy each plugin folder you want from `story-orchestrator/server-plugin/<name>/` to\n  `<SillyTavern>/plugins/<name>/`, set `enableServerPlugins: true`, restart SillyTavern.\n- **From a source checkout**: `npm run plugin:install -- --st-root <SillyTavern>` installs the judge plugin, and\n  `--with gpu,media,harness` adds the others. A plugin already installed is kept in sync. Files are compared by\n  content, never by version, and a local `config.json` is never touched; `--check` lists the files that differ without\n  writing. It warns when `enableServerPlugins` is off.\n\nInstall only the plugins you need. In particular the GPU plugin is for one specific machine setup; see\n[Images and the GPU plugin](images.md).\n\n---\n\n[Guide](../README.md)\n"
 },
 {
  "id": "setup/harness",
  "doc": "setup/harness.md",
  "audience": "setup",
  "title": "Harness",
  "headings": [
   {
    "level": 1,
    "text": "Harness",
    "slug": "harness"
   },
   {
    "level": 2,
    "text": "Install",
    "slug": "install"
   },
   {
    "level": 2,
    "text": "Who may use it",
    "slug": "who-may-use-it"
   },
   {
    "level": 2,
    "text": "The wizard through opencode",
    "slug": "the-wizard-through-opencode"
   }
  ],
  "body": "# Harness\n\nThe harness plugin lets a task run through a coding-agent login on the SillyTavern server: **Claude Code**, **Codex**\nor **opencode**, using the subscription you are already logged into there. Text goes in, text comes out; every tool\nof the agent is off. It is useful for heavier tasks such as summaries or the wizard.\n\nIt is **off until you route a task to it** and offers nothing until its config file says so.\n\n## Install\n\n1. Install the plugin (see [Server plugins](README.md#server-plugins)).\n2. On the server, make sure the CLI is on the `PATH` (`claude`, `codex` or `opencode`) and logged in. The plugin uses\n   the login files (`~/.claude/.credentials.json`, `~/.codex/auth.json`, `~/.local/share/opencode/auth.json`); a login\n   must stay valid for at least 90 more minutes.\n3. Write `config.json` next to the plugin's `index.mjs` and offer each harness you want:\n\n   ```json\n   { \"harnesses\": { \"opencode\": { \"offer\": true } } }\n   ```\n\n4. Restart SillyTavern. In **Models per task**, each task now lists the offered harnesses under \"Cloud harness (on the\n   SillyTavern server)\".\n\n## Who may use it\n\nAdmin accounts only, because it spends the server owner's subscriptions. `\"allowNonAdmin\": true` in `config.json`\nopens it to every SillyTavern user.\n\n## The wizard through opencode\n\nWhen **Wizard and road ahead** is routed to opencode, the wizard's agent runs as an opencode session that calls the\nwizard's own tools. Every change still goes through the same checks as a local run, and anything that creates a card,\nlorebook or group still waits for you. If the harness is not available, the wizard says so; it does not quietly fall\nback to a local profile.\n\nDetails, every config field and the routes: `server-plugin/story-orchestrator-harness/README.md`.\n\n---\n\n[Setup](README.md)\n"
 },
 {
  "id": "setup/images",
  "doc": "setup/images.md",
  "audience": "setup",
  "title": "Illustrations",
  "headings": [
   {
    "level": 1,
    "text": "Illustrations",
    "slug": "illustrations"
   },
   {
    "level": 2,
    "text": "The default: SillyTavern's own image service",
    "slug": "the-default-sillytaverns-own-image-service"
   },
   {
    "level": 2,
    "text": "Advanced ComfyUI recipes",
    "slug": "advanced-comfyui-recipes"
   },
   {
    "level": 3,
    "text": "Picking models",
    "slug": "picking-models"
   },
   {
    "level": 2,
    "text": "GPU sharing (advanced, optional)",
    "slug": "gpu-sharing-advanced-optional"
   },
   {
    "level": 2,
    "text": "Privacy",
    "slug": "privacy"
   }
  ],
  "body": "# Illustrations\n\n## The default: SillyTavern's own image service\n\nIn **Image service**, choose **Use SillyTavern Image Generation settings**. Configure a source in ST's own Image\nGeneration extension, then use **Test render** in an open group chat. Its saved image appears as a separate message.\nNothing else needs installing for this route.\n\nThe optional **Image-prompt model** picker uses Connection Manager. Leave it empty for a template built from the\ncurrent public scene and appearance details. It never switches your reply profile.\n\nNew installs draw automatically only at story-authored moments. Every-N automation is opt-in. While no image service\nis ready (ST's Image Generation is not set up, or its ComfyUI is stopped), automatic pictures are skipped without an\nerror and Setup says why; Test render explains which step is missing.\n\n## Advanced ComfyUI recipes\n\nChoose **Advanced ComfyUI recipes** to let Story Orchestrator build the ComfyUI graph itself. Install the optional\nmedia plugin for owned render jobs and sprite edits:\n\n`npm run plugin:install -- --with media`\n\nRestart SillyTavern after installation. The plugin talks to the ComfyUI address set in ST's Image Generation settings;\na `comfyUrl` in the plugin's `config.json` overrides it, and without either it uses ComfyUI's default\n`http://127.0.0.1:8188`. The same file holds the model roots used for fingerprints. See\n`server-plugin/story-orchestrator-media/README.md`. Reuse your existing model folders; the plugin does not copy, move or\ndownload model weights. Without the plugin this route draws nothing, and Setup says so.\n\n### Picking models\n\nEach picture type (scene, character, portrait, user, background, free) has a **recipe family**, SDXL · Illustrious or\nSDXL · NoobAI, which sets the sampler, steps and quality words. Press **Discover installed image models**, then either\nchoose a model for the type or leave **Model** on automatic:\n\n- exactly one installed model is recognised as that family: it is used;\n- none or several: no picture is drawn and Setup shows a row naming the picture type, until you choose one.\n\nA file name alone does not prove a model's architecture, so choose the family that matches the model you map.\nBackgrounds use the SDXL wide shape with \"no humans, scenery\" added. FLUX is not supported.\n\nModels known to work with these recipes, if you need one (download them yourself; nothing is fetched for you):\n\n| Family | Model |\n|---|---|\n| SDXL · Illustrious | WAI-illustrious-SDXL v17 (`waiIllustriousSDXL_v170`) |\n| SDXL · NoobAI | JANKU v7.77 (`JANKUTrainedChenkinNoobai_v777`), with its lazypos/lazyneg embeddings |\n\nHires uses an installed upscaler: the only one installed, else the only one with \"anime\" in its name; otherwise\nhires is refused with a reason. Embeddings a recipe names are dropped when ComfyUI does not have them.\n\n## GPU sharing (advanced, optional)\n\nOnly local text and image models using the same graphics card need coordination. Cloud and RunPod reply models do\nnot use the local image GPU, and most installs never need this. The GPU broker is an optional plugin (`--with gpu`);\nwithout it, every image renders without coordination, as it would anyway.\n\nWith the plugin, `config.json` picks an adapter. `none` passes images through. `unsloth` coordinates an Unsloth text\nmodel and needs an explicit upstream, model and ComfyUI URL. `managed` forwards to an external controller and needs\nits `controllerUrl`; without one the plugin refuses to start and images keep rendering uncoordinated. No address of\nany particular machine is assumed. A local llama-server adapter needs its own verified unload/reload interface before\nit can be enabled. See `server-plugin/story-orchestrator-gpu/README.md`.\n\n## Privacy\n\nAn image prompt goes to the image backend you chose: ST's selected source on the default route, your ComfyUI on the\nadvanced route. A local source or ComfyUI keeps it on your machine; a cloud source sends it to that provider. An\nimage-prompt model also receives the current scene's public context, through its own Connection Manager profile.\n\n[Sprite builder](sprites.md) · [Setup](README.md)\n"
 },
 {
  "id": "setup/judge",
  "doc": "setup/judge.md",
  "audience": "setup",
  "title": "Judge",
  "headings": [
   {
    "level": 1,
    "text": "Judge",
    "slug": "judge"
   },
   {
    "level": 2,
    "text": "Install",
    "slug": "install"
   },
   {
    "level": 2,
    "text": "Privacy",
    "slug": "privacy"
   },
   {
    "level": 2,
    "text": "Uses",
    "slug": "uses"
   },
   {
    "level": 3,
    "text": "How the defaults were chosen",
    "slug": "how-the-defaults-were-chosen"
   },
   {
    "level": 2,
    "text": "Server limits",
    "slug": "server-limits"
   }
  ],
  "body": "# Judge\n\nThe judge is a small, fast model that picks from lists: who speaks next, which lore entries matter, whether a memory\nnote is real, where and when a scene is. It runs behind the optional `story-orchestrator-judge` server plugin. The\ndefault provider is TypeSafe's Jev (`jev-1.13.0`).\n\nWithout the plugin or without a key, every use quietly takes its usual path. The judge never blocks play and never\nwrites to the story itself.\n\n## Install\n\n1. Install the plugin (see [Server plugins](README.md#server-plugins)) and set `enableServerPlugins: true` in\n   SillyTavern's `config.yaml`. Restart SillyTavern.\n2. In the **Judge** section, paste your key into **TypeSafe API key** and press\n   **Save key**. It is stored in SillyTavern's own secrets on the server; it is never shown again and never sent to\n   the page.\n3. **Use the judge** is on by default. The status line says whether the plugin answers.\n\nThe plugin reads the key from, in order: the requesting user's SillyTavern secrets; then, only when SillyTavern user\naccounts are off, the `TYPESAFE_API_KEY` environment variable and `~/.typesafe/api-key/.env`.\n\n## Privacy\n\nA configured key is consent: while the judge is on, each use sends the chat excerpts it lists (below, and in each\nuse's tooltip in the panel under \"Sends:\") to the provider it is routed to. It never sends character cards, persona\ntext, other chats or the key. To stop it, untick **Use the judge**, or the single use. TypeSafe's policy:\n<https://typesafe.ai/legal/privacy-policy>.\n\nA local provider (`llama-logprob`, a llama-server you run, set with `SO_JUDGE_LLAMA_URL` on the server) keeps\neverything on your machine. A use is sent to a provider only where it has been measured for that provider and model.\n\n## Uses\n\nEvery use is on by default except **House rules**. The ones marked *author* show only in Author view.\n\n| Use | What it does | Sends |\n|---|---|---|\n| Speaker direction | Picks who speaks next in a group chat when the scene has talk control. Needs a one-line role for every character in the pool. | the last 8 messages, character names and roles, the scene name and goal |\n| Check memory before storing | Drops notes the story never showed and down-weights doubtful ones. | the read's messages, the candidate notes, story title and cast names |\n| Merge related notes | Decides whether two similar notes are a duplicate, an update, or both true. | two memory notes per question |\n| Notice scene changes | Asks for the scene read on the turn a scene changes. | the last 8 messages, the scene name and goal, cast names and roles, your persona name |\n| Scene tracker | Keeps location, time and who is present, and adds them to the prompt. | as above, plus the story's locations |\n| Heading toward | Shows which upcoming scenes play is moving toward (Author view). | the last 8 messages and the next scenes' names and goals |\n| Lore selection | Adds the lore entries that matter to the next reply, even without their keywords. | the last 8 messages, the scene name and goal, each entry of the story's lore-select books |\n| Curator focus | Shows the World Info curator only the entries the story may have overtaken. | the story so far and the story's lore entries |\n| Every-turn story reads | Reads the qualities the author marked for it on every turn, so scenes open sooner. | the last 3 messages, the story title and scene, each marked quality's description and values |\n| Stall check | Checks a stuck exit before spending a full re-read. | the messages since the scene began and the unmet conditions |\n| Expansion review (*author*) | Reviews generated scenes instead of a second model call. | up to 40 established facts, the target scene, cast names, the tension trajectory, the generated scenes |\n| Prepare ahead (*author*) | Writes generated scenes one step ahead, where play is heading. Needs Heading toward. | nothing beyond Heading toward and the expansion |\n| Agency check (*author*, warden) | Asks whether a reply wrote what only you do, say or decide; if so the next prompt leaves your part to you. | the character reply, your latest message and your persona name |\n| Answers the player (*author*, warden) | Asks whether a reply answered what you just said or did; if not, the next prompt asks for an answer. A refusal or a dodge in character counts as an answer. Not measured yet. | nothing beyond the warden's call |\n| House rules (*author*, warden) | Checks a reply against the story's house rules. Below its measured floor, on all the same. | the character reply and the house rules |\n| Lore check (*author*, warden) | Checks a reply against the story's own lore entries that fired for it. Needs the continuity warden on. | the reply and up to 8 fired story lore entries (600 characters each) |\n| Exclusive lore selection (*author*) | For a story marked exclusive, switches off for one reply the lore-select entries the judge did not pick. Needs Lore selection and per-chat lore gating. | nothing beyond Lore selection |\n| Sprite expressions | Picks who each passage of a reply is about and their expression, for the sprite stage. | each reply's passages, on-stage names, expression labels |\n\n### How the defaults were chosen\n\nEvery use was measured in English on 2026-10-01 against `jev-1.13.0`, each against a floor fixed before the run.\nEvery use met its floor except House rules: on the Adolion saga's 8 rules it caught every broken\nrule (18/18) and kept every kept one (10/10), but left untouched replies alone 165 of 172 times against a floor of\n0.966 (2026-10-02). Every use is on by default all the same, the unmeasured ones too (2026-10-09), so you see them in play; switch one off here. For house rules, prefer objective rules with one demand each; judgement rules that overlap (who\nvoices whom, mystery vs secret) raise false alarms. A paragraph-count rule is checked in code instead. On any other\nmodel, or after the measurement set changes, the panel marks a use as unproven.\n\nNotes per use:\n\n- Speaker direction runs only when every candidate has an authored `roster[].role`; otherwise the usual director\n  decides.\n- Lore selection ranks by a compressed probability, so which entries win the top slots is weaker than its hit rate\n  suggests.\n- Curator focus pays off once the curator's scope passes about 40 entries.\n- Every-turn story reads does nothing until the story marks qualities with `read_as`.\n- The warden uses are best in `review` mode, except the two about your part (Agency check and Answers the player):\n  their notes go in on their own by default (\"Notes about the player's part\" under Background helpers), because a\n  player who never opens the drawer would otherwise never get them. Lore check's live latency and over-steer are not\n  measured yet.\n\nThe warden uses run after a reply and only put a note in the *next* reply's prompt; review mode lets the author\napprove each note first.\n\nTwo uses run before a reply (Speaker direction and Lore selection). They have a 1.5 s budget; a slow judge delays the\nturn by at most that much before falling back.\n\n## Server limits\n\nThe plugin never sends a request too large for the provider (it answers \"too large\" instead) and paces calls to the\nprovider's documented rate, halving its rate after a \"too many requests\" answer and recovering over two minutes.\nEnvironment variables on the server: `TYPESAFE_API_KEY`, `TYPESAFE_BASE_URL`, `SO_JUDGE_LLAMA_URL`,\n`SO_JUDGE_LLAMA_KEY`, `SO_JUDGE_RATE_PER_MIN`, `SO_JUDGE_ACCOUNT_RATE_PER_MIN`, `SO_JUDGE_ACCOUNT_TOKENS_PER_SEC`,\n`SO_JUDGE_MAX_IN_FLIGHT`. Details: `server-plugin/story-orchestrator-judge/README.md`.\n\n---\n\n[Setup](README.md)\n"
 },
 {
  "id": "setup/memory-model",
  "doc": "setup/memory-model.md",
  "audience": "setup",
  "title": "Memory model",
  "headings": [
   {
    "level": 1,
    "text": "Memory model",
    "slug": "memory-model"
   },
   {
    "level": 2,
    "text": "Choose one",
    "slug": "choose-one"
   },
   {
    "level": 2,
    "text": "Options in the same group",
    "slug": "options-in-the-same-group"
   },
   {
    "level": 2,
    "text": "Use a cloud model for a task",
    "slug": "use-a-cloud-model-for-a-task"
   },
   {
    "level": 3,
    "text": "How much the model is sent",
    "slug": "how-much-the-model-is-sent"
   },
   {
    "level": 2,
    "text": "When changes apply",
    "slug": "when-changes-apply"
   },
   {
    "level": 2,
    "text": "What it costs",
    "slug": "what-it-costs"
   }
  ],
  "body": "# Memory model\n\nThe memory model reads the chat after each reply. It decides whether the story can move on, writes the memories,\nand keeps summaries. It is a second connection, separate from the model that writes the replies (it can be the same\nbackend).\n\n## Choose one\n\n1. In SillyTavern, make a **Connection Manager** profile for the model you want (Text Completion or Chat\n   Completion). Give it an **instruct template** that matches the model: without one, many local models answer the\n   memory model's prompts with loops of repeated tokens.\n2. In **Extensions → Story Orchestrator → Memory → Memory model — this install**, pick it under **Memory\n   model profile**.\n3. Press **Test memory model**. It asks the model a few sample questions and says what passed.\n\n\"Let the story advance on its own\" must be on (it is by default). The choice affects every chat, including new ones.\n\n## Options in the same group\n\n- **Fallback when it is down**: another profile that takes over while the memory model does not answer. It is\n  re-checked every few minutes and switches back on its own.\n- **Reply thinking**: how long the *main* chat model may think before each reply in a story chat: Off, Low (128\n  tokens), Medium (400 tokens, recommended), High (no cap). Applied only on llama.cpp backends whose setup thinks;\n  other backends get nothing and the panel says why.\n- **Models per task**: send some tasks to a different profile, for example a bigger model for summaries:\n\n  | Task | Covers |\n  |---|---|\n  | Story reads | the after-reply read that moves the story |\n  | Summaries and canon | scene summaries, chapter summaries, the story so far |\n  | Wizard and road ahead | the setup wizard and generated scenes |\n  | Speaker direction | who speaks next in a group |\n  | World Info curator | proposed lorebook updates |\n  | Inner voice | characters' private thoughts |\n\n  A task left on \"Same as memory model\" uses the profile above. A task can also go to a coding-agent login on the\n  server through the [harness plugin](harness.md).\n\n  Every profile list is grouped by provider and labelled **local** (this machine or your network) or **cloud**. A\n  task on a cloud profile says what it sends, and to whom, under its picker.\n- **Advanced**: how often the story reads (cadence), how hard it re-checks a stuck scene, and how many messages it\n  stays behind. The defaults are fine for nearly everyone.\n\n## Use a cloud model for a task\n\nAny task can run on a cloud provider SillyTavern supports, with the key kept on the SillyTavern server.\n\n1. In SillyTavern, connect to the provider under **Chat Completion** (for example DeepSeek), enter its API key, and\n   pick the model.\n2. Save it as a **Connection Manager** profile. Make one profile per provider and model. A profile remembers which\n   saved key it uses, so two accounts or two endpoints can sit side by side.\n3. Pick that profile for the task under **Models per task**. Tasks you leave alone keep the memory model.\n\nWorked example: the DeepSeek API, one Chat Completion profile, used for every task while the replies stay on a local\nmodel. Claude and ChatGPT subscriptions work only through the [harness plugin](harness.md) (opencode), never as a key.\nOpenRouter is another way to reach many models with one key; any Chat Completion source works the same way.\n\nEach task sends its own part of the story to the provider you pick for it: the line under each task says what.\nSpeaker direction and the inner voice run before a reply, so give them a fast model.\n\n### How much the model is sent\n\nThe memory model's input is sized to the profile's context:\n\n1. the **settings preset**'s context size, when the profile names a preset that has one;\n2. otherwise the model's known context, for models SillyTavern lists (OpenAI, Google, xAI);\n3. otherwise the provider's known context (DeepSeek 131,072 tokens, Claude 200,000, OpenAI, Google and xAI 128,000);\n4. otherwise 8,192 tokens. **Setup → Host capabilities** shows which one applied and why.\n\nA Text Completion profile always uses its preset's context size. For a Custom (OpenAI-compatible) endpoint or\nOpenRouter, give the profile a settings preset with the right context size.\n\n## When changes apply\n\nWhat a read finds is applied at the **next** turn boundary, after the next reply has finished; one scene change\nhappens per turn, by design. Reads normally run every reply and include the newest message (swipes are handled by\nstepping back and reading again). A transition with an `extractor_trigger` cue forces a read the moment its cue\nappears in the chat, so decisive beats land without waiting: give your decisive transitions a cue.\n\n**Tool calling.** With Chat Completion function calling on (for example an extension that gives the model tools), one\nplayer turn can render a reply, a tool call and a continuation. Each rendered reply is its own turn boundary, so one\nplayer turn can move the story's tension and extraction cadence more than once and fire one transition per step.\nSwipes, edits and deletes still roll back correctly, tool-call messages included. Not measured: how much this changes\npacing in play. If a story feels rushed with tools on, compare a turn with tools off and report it.\n\n## What it costs\n\nOne read per reply on the memory model, plus occasional summaries. Reads happen after the reply is shown, so they\nnever delay it. With a local model, a read competes with the next reply for the GPU.\n\n---\n\n[Setup](README.md)\n"
 },
 {
  "id": "setup/settings-reference",
  "doc": "setup/settings-reference.md",
  "audience": "setup",
  "title": "Settings reference",
  "headings": [
   {
    "level": 1,
    "text": "Settings reference",
    "slug": "settings-reference"
   },
   {
    "level": 2,
    "text": "Playing",
    "slug": "playing"
   },
   {
    "level": 2,
    "text": "Memory",
    "slug": "memory"
   },
   {
    "level": 2,
    "text": "Characters",
    "slug": "characters"
   },
   {
    "level": 2,
    "text": "World",
    "slug": "world"
   },
   {
    "level": 2,
    "text": "Images",
    "slug": "images"
   },
   {
    "level": 2,
    "text": "Judge",
    "slug": "judge"
   },
   {
    "level": 2,
    "text": "Authoring",
    "slug": "authoring"
   }
  ],
  "body": "<!-- Generated by npm run docs:settings from src/features/registry.ts and src/features/settingsCopy.ts. Edit those, then run it again. -->\n# Settings reference\n\nEvery setting in **Extensions → Story Orchestrator**, by section. Each row says where the control is, what it does, when to change it and what it\ncosts, and its default. Settings apply to this whole install unless the control says \"this chat\". Rarely changed settings sit under their\nsection's **Advanced** fold.\n\n## Playing\n\nWhich story this chat plays, and what you see while you play. [More](../player/playing.md)\n\n| Setting | Where | What it does | Default | Key |\n|---|---|---|---|---|\n| **Notes under messages** | Settings › Playing › Notes under messages | Small icons under the replies: where the story moved, what it remembered, which lore it used. Story shows the basics and Behind the scenes a little more; neither shows spoilers. Off hides them. | 1 | `display.inline.level` |\n| **Show this kind of note** | Settings › Playing › Notes under messages | Untick a kind of note to hide its icon under the messages. | Per entry | `display.inline.categories` |\n| **Only the last … messages** | Settings › Playing › Notes under messages | Notes show under this many of the newest messages. Lower keeps long chats light. | 20 | `display.inline.window` |\n| **Also post a chat note when the story moves on** | Settings › Playing › Also post a chat note | Posts a short note in the chat when the story reaches a new turning point. Off by default: the note sits after the reply and stops you swiping that reply. | Off | `display.announceTransitions` |\n| **Show the story briefing when a story starts** | Settings › Playing › Show the story briefing | The first time a story starts in a chat, a page shows the author's briefing: the world, who you are, who is with you and how to play. You can re-open it from the drawer. | On | `display.briefing` |\n| **Ask who you are when a story starts** | Settings › Playing › Ask who you are when a story starts | When a story says who you play, its start page asks once: keep, choose or create a persona. Off: your current one is kept. | On | `display.playerSetup` |\n| **Mark story groups in the lists** | Settings › Playing › Mark story groups in the lists | A small icon beside each group, recent chat and past chat that plays a story. A saga, a story its author marks as one, gets its own icon. | On | `display.presence.listBadges` |\n| **Your stories list** | Settings › Playing › Your stories list | Under Continue: the chats that play a story, newest first, with where each one is. One click opens the chat. | On | `display.presence.continueList` |\n| **Story card on hover** | Settings › Playing › Story card on hover | Hovering or focusing a group's story icon shows the story, its chapter and when you last played it. | On | `display.presence.groupCard` |\n| **Chapter title cards** | Settings › Playing › Chapter title cards | A full-width card under the message where a new chapter opens, instead of a small note. | On | `display.presence.chapterCard` |\n| **Story entries in the wand menu** | Settings › Playing › Story entries in the wand menu | Story recap, the story briefing (when the story has one), flag this moment and the story drawer, from the extensions wand beside where you type. | On | `display.presence.wand` |\n| **Dice chips under messages** | Settings › Playing › Dice chips under messages | A check a story makes public shows its roll under the message it decided (\"Climb: 15 + 4 vs 12, success\"). Author view also shows every other roll and background draw, here and in the Activity panel. | On | `display.presence.rollChips` |\n| **Journal** | Story drawer › Journal | A movable panel with the story's quests: the main line you have reached, side quests and their steps, and a log of what happened. It shows only what you have found. | On | `display.presence.journal` |\n| **Stat sheet** | Story drawer › Stat sheet | A movable panel with what the story keeps count of in the open: what you carry and the meters the author made public. | On | `display.presence.statSheet` |\n| **Story panels** | Story drawer › Story panels | Extra panels a story adds, such as a clock that fills or a board of quests. Only what the author made public shows. | On | `display.presence.widgets` |\n| **What could I do?** | Story drawer › What could I do? | A button in the story drawer and the wand menu that asks the memory model for a few things you could try next. A suggestion goes into the box where you type; nothing is sent until you send it. The request sees only what you have already seen in the story. | On | `display.presence.suggestions` |\n| **Show story status above the chat input** | Settings › Playing › Show story status | A one-line strip above where you type: where the story is and how tense things are. Click it to open the story drawer. | On | `display.hudEnabled` |\n| **Steer the tension** | Settings › Playing › Pacing | Adds a quiet note to the prompt that nudges the reply toward the story's intended tension: build it up, or let it cool down. | On | `pacing.hintEnabled` |\n\n## Memory\n\nThe memory model that reads the chat, and what the story remembers. [More](../setup/memory-model.md)\n\n| Setting | Where | What it does | Default | Key |\n|---|---|---|---|---|\n| **Let the story move forward on its own** | Settings › Memory › Memory model | After replies, a second model reads the chat and moves the story on when what it needs has happened. Leave it on unless you want to move the story by hand. Costs one call to the memory model every few messages. | On | `extraction.enabled` |\n| **Memory model** | Settings › Memory › Memory model | The Connection Manager profile that reads the chat after replies to track the story and remember what happened. It does not replace your chat model. Pick a fast, cheap model; every chat uses this choice. | Not set | `extraction.profileId` |\n| **Fallback when it is down** | Settings › Memory › Memory model | When the memory model stops answering, its work goes to this profile until it answers again; it is checked every few minutes and switched back on its own. Leave it empty and the work waits for the memory model. | None | `extraction.fallbackProfileId` |\n| **Reply thinking** | Settings › Memory › Reply thinking | How long your chat model may think before each reply in a story chat. Medium is a good default: as clean as no limit, and replies start sooner. Only applies to llama.cpp setups that think; other backends are left alone. | Medium | `extraction.replyEffort` |\n| **Read the chat every … messages** | Settings › Memory › Memory model | How often the memory model reads the chat. Lower reacts faster but calls the memory model more often; higher saves calls and reacts later. | 3 | `extraction.cadence` |\n| **Wait before reading the newest messages** | Settings › Memory › Memory model | Leave the newest messages out of a read, in case you often re-roll them. 0 reacts to the newest message straight away; re-rolls are undone either way. | 0 | `extraction.stabilityLag` |\n| **Model for this task** | Settings › Memory › Models per task | Send this task to a different Connection Manager profile than the memory model, for example a faster model for frequent work or a stronger one for summaries. Left on \"Same as memory model\", it uses the memory model. | Same as memory model | `extraction.profiles` |\n| **Thinking for this task** | Settings › Memory › Models per task | How long the model may think on this task. Default sends nothing extra; higher can be more careful and costs time and tokens. | Per entry | `extraction.routes.*.route.options.effort` |\n| **If the harness fails** | Settings › Memory › Models per task | What happens when the harness cannot answer: pause this task, or send it to a Connection Manager profile instead. | Per entry | `extraction.routes.*.onFailure.profileId` |\n| **Show \"Previously…\" when a chat opens after a chapter ended** | Settings › Memory › Chapters | When you come back to a chat whose story finished a chapter, a short recap of that chapter is shown first. | On | `memory.chapters.recap` |\n| **Write a record when a chapter ends** | Settings › Memory › Chapters | For stories that declare chapters: when a chapter ends, its memories are written up as one record. Costs a few memory model calls per chapter. | On | `memory.chapters.seal` |\n| **Add the story so far to every prompt** | Settings › Memory › Chapters | The chapter records ride every prompt as a fixed-size story so far, so long stories keep their past. Uses the budget below. | On | `memory.chapters.storySoFar` |\n| **Leave ended chapters' messages out of the prompt** | Settings › Memory › Chapters | Older chapters are represented by their record instead of their messages, which keeps prompts short in long stories. | On | `memory.chapters.fold` |\n| **Story so far budget** | Settings › Memory › Chapters | How many tokens the story so far may take in each prompt. Larger keeps more of the past, and leaves less room for the chat. | 700 | `memory.chapters.chronicleTokens` |\n| **Continuity warden** | Settings › Memory › Continuity warden | After each character reply, the judge checks it against the story's established facts; when it breaks one, the next reply's prompt restates that fact once. Needs the judge. Sends the reply, up to 40 facts and the tracked values. | On | `stagecraft.wardenEnabled` |\n| **Warden notes** | Settings › Memory › Continuity warden | Ask me first: you approve each note. Add them on their own: notes go into the next prompt without you seeing them. | `review` | `stagecraft.wardenAcceptMode` |\n| **Notes about the player's part** | Settings › Memory › Continuity warden | When a reply writes what only you do, say or decide, or ignores what you just said, the next reply's prompt carries a one-line reminder. Add them on their own (the default): the reminder goes in without anyone approving it. Ask me first: it waits like the other notes. Only replies are checked; your own messages are never changed. | `auto` | `stagecraft.agencyAcceptMode` |\n\n## Characters\n\nWho answers your messages in a group, and how many at once. [More](../author/topics/talk-control.md)\n\n| Setting | Where | What it does | Default | Key |\n|---|---|---|---|---|\n| **Track what each character knows** | Settings › Memory › Advanced › Track what each character knows | The memory model also notes who knows what, and what each character is hiding, so characters do not know things they never saw. Turn it off when the self-test says this model cannot do it. | On | `memory.epistemicLedgerCapable` |\n| **Read characters' reasoning for what they intend** | Settings › Characters › Inner voice | When a reply carries the character's reasoning, it is also read for what that character means to do. Needs knowledge tracking. Not measured yet. | On | `memory.harvestReasoning` |\n| **Prepare a private inner beat for the next speaker** | Settings › Characters › Inner voice | After a reply, the memory model writes a short private note of what the likely next speaker wants, handed only to that character. At most two extra calls per turn, never while you wait for a reply. Not measured yet. | On | `memory.innerBeat` |\n| **Inner beats for** | Settings › Characters › Inner voice | Prepare the beat for the likeliest speaker only, or for the two likeliest. Two costs one more call per turn. | Next speaker only | `memory.innerFanOut` |\n| **Speaker direction in group chats** | Story drawer › Overview › Chat preferences | In a group chat, the story picks the character the scene calls for instead of rotating through everyone. This switch is for this chat only. | On | `talk.enabled` |\n| **Several characters may answer one message** | Settings › Characters › Speaker direction | In a group chat, more than one character can reply to a single message; the story picks each next speaker and stops when it is your turn. Off: one voice per turn. | On | `talk.chain.enabled` |\n| **Voices per turn at most** | Settings › Characters › Speaker direction | The most characters that may answer one of your messages. Higher makes busier scenes and longer waits. | 3 | `talk.chain.max` |\n\n## World\n\nHow a story's lorebooks are switched on, and the lorebook helper. [More](../author/topics/world-info.md)\n\n| Setting | Where | What it does | Default | Key |\n|---|---|---|---|---|\n| **How story lorebook entries switch on** | Settings › World › Lorebooks | Per chat (the default): entries rest off in their lorebook files and each chat sees its own story's entries switched on. File writes: entries are switched on and off in their lorebook files as a chat moves. | `scan` | `worldInfo.gatingMode` |\n| **Memory text can trigger lore** | Settings › World › Lorebooks | Established facts, scene history and the current guidance join every lorebook scan, so an entry whose keys they mention can activate. What characters privately know never joins it. | On | `worldInfo.scanMemory` |\n| **Lorebook curator** | Settings › World › Background helpers | A background helper that reads what has happened and proposes changes to the story's own lorebook. It only touches the lorebooks the story lists, proposes rather than writes, and never changes story progress or memory. | On | `stagecraft.curatorEnabled` |\n| **Curator changes** | Settings › World › Background helpers | Ask me first: you approve each change. Apply on their own: changes to entries marked {{// so:auto}} land at the next reply, the rest still wait for you. Never apply: only show what it would do. | `review` | `stagecraft.acceptMode` |\n| **Off-stage events** | Settings › World › Background helpers | For stories whose characters have plans: when the story moves on or a scene ends, the memory model proposes one short thing a character did off stage toward that plan. Each one waits for you in Author view and, once accepted, reaches only that character at the next reply. Do not propose: no calls are made. | `review` | `stagecraft.meanwhileAcceptMode` |\n\n## Images\n\nOptional pictures and character sprites; both need your own image setup. [More](../setup/images.md)\n\n| Setting | Where | What it does | Default | Key |\n|---|---|---|---|---|\n| **Allow automatic illustrations on this install** | Settings › Images › Image service | Lets stories and the automation below draw pictures through SillyTavern’s configured image backend. An image-prompt model is optional; without one, a template uses the current scene. | On | `image.enabled` |\n| **Image backend** | Settings › Images › Image service | Use SillyTavern’s configured Image Generation service, or advanced ComfyUI recipes through the optional media plugin. | `st` | `image.backend` |\n| **When pictures are drawn** | Settings › Images › Image service | Story: at the moments each story asks for. Every N: every few replies, plus those moments. Model requests: when the model asks. Manual: only when you ask. | `story` | `image.automation.mode` |\n| **Every N replies** | Settings › Images › Image service | Draw a picture every this many replies. Lower draws more often and keeps the GPU busier. | 5 | `image.automation.everyN` |\n| **Image-prompt model** | Settings › Images › Image service | The Connection Manager profile that turns the scene and the story's visual direction into a picture prompt. Separate from the chat model. | Not set | `image.directorProfileId` |\n| **ComfyUI address** | Settings › Images › Image service | Where your ComfyUI server listens. When text and image models share a GPU, use the GPU broker for your text profiles. | Not set | `image.comfyUrl` |\n| **Avoid explicit imagery** | Settings › Images › Image service | Adds safety terms to every picture prompt and skips explicit requests. | Off | `image.safeMode` |\n| **Model** | Settings › Images › Image service | The ComfyUI model this kind of picture uses. Left on automatic, it uses the one installed model of the recipe family; with none or several, Setup asks you to choose. | Per entry | `image.purposes.*.checkpoint` |\n| **Recipe family** | Settings › Images › Image service | Choose the workflow family supported by your installed checkpoint. A file name alone does not identify its architecture. | Per entry | `image.purposes.*.family` |\n| **Quality** | Settings › Images › Image service | Base is faster; hires adds an upscale pass and takes longer. | Per entry | `image.purposes.*.quality` |\n| **Shape** | Settings › Images › Image service | The picture's proportions. Auto lets the image-prompt model choose. | Per entry | `image.purposes.*.aspect` |\n| **Framing** | Settings › Images › Image service | How close the camera is: from a close-up to a wide view. | Per entry | `image.purposes.*.shot` |\n| **Where it appears** | Settings › Images › Image service | In the message, as its own message, or as the chat background. | Per entry | `image.purposes.*.placement` |\n| **Pictures to choose from** | Settings › Images › Image service | Draw this many and keep the best. Each extra one costs another render. | Per entry | `image.purposes.*.candidates` |\n| **Let the image-prompt model pick another model** | Settings › Images › Image service | The image-prompt model may switch this picture to a different image model when it fits better. | Per entry | `image.purposes.*.directorMayOverride` |\n| **Always add** | Settings › Images › Image service | Words added to every prompt of this kind. | Per entry | `image.purposes.*.extraPositive` |\n| **Always avoid** | Settings › Images › Image service | Words added to the avoid list of every prompt of this kind. | Per entry | `image.purposes.*.extraNegative` |\n| **Fixed look** | Settings › Images › Image service | Image tags that describe this character, used when the story has not described them. | Per entry | `image.characters.*.appearanceTags` |\n| **Always include** | Settings › Images › Image service | Tags added to every picture of this character. | Per entry | `image.characters.*.alwaysTags` |\n| **Never include** | Settings › Images › Image service | Tags kept out of every picture of this character. | Per entry | `image.characters.*.neverTags` |\n| **Show character sprites that change expression as replies stream** | Settings › Images › Sprite stage | Shows the speaking characters on a small stage, and changes their expression with the reply. Needs a sprite pack for each character. | Off | `sprites.enabled` |\n| **Show the stage** | Settings › Images › Sprite stage | With Visual Novel mode: only while SillyTavern's /vn mode is on. Always: in every chat that has sprites. | `vn` | `sprites.stage` |\n| **Expression model when the judge is off** | Settings › Images › Sprite stage | Which profile picks expressions when the judge cannot. Same as the image-prompt model by default. | Not set | `sprites.profileId` |\n| **Dim whoever is not speaking** | Settings › Images › Sprite stage | Fades the characters who are not talking, so the speaker stands out. | On | `sprites.focus` |\n| **Idle breathing** | Settings › Images › Sprite stage | A slow, small movement so sprites do not look frozen. Turn it off to save a little work on slow machines. | On | `sprites.breathing` |\n| **Blink** | Settings › Images › Sprite stage | Uses eyes-closed frames when the sprite pack has them. Reduced motion switches this off. | On | `sprites.blink` |\n| **Current character state in replies** | Settings › Images › Sprite stage | Adds this story’s applied public changes to the next reply prompt. Character cards and personas stay unchanged. | On | `sprites.cardOverlay` |\n| **Generate changed looks when needed** | Settings › Images › Sprite stage | Uses the Studio builder’s saved reference setup to edit the current expression when a public look changes. Needs the media plugin and ComfyUI. The current sprite stays visible while rendering. | On | `sprites.onDemand` |\n| **Mouth movement** | Settings › Images › Sprite stage | Moves the speaking character’s mouth while replies stream. Simple, the default, switches between closed and open frames. Smooth adds half-open frames when the pack has them. Reduced motion switches this off. | `simple` | `sprites.mouth` |\n| **Render preset** | Settings › Images › Sprite stage | The size and steps the Studio sprite builder starts with. Standard renders at 1024 px with 25 steps; Fast preview at 512 px with 20 steps, quicker but softer. | `standard` | `sprites.renderPreset` |\n\n## Judge\n\nAn optional fast model for small choices; it never blocks a reply. [More](../setup/judge.md)\n\n| Setting | Where | What it does | Default | Key |\n|---|---|---|---|---|\n| **Use the judge** | Settings › Judge | A second, fast model for yes/no and pick-one decisions. Each use can be switched off on its own and says what it sends. It never receives character cards, persona text, other chats or the key. | On | `judge.enabled` |\n| **Judge uses** | Settings › Judge | Each use answers one kind of question for the story. Switch off any you do not want; the story falls back to its usual path. | Per entry | `judge.uses` |\n| **Where this use runs** | Settings › Judge | Which provider answers this use. A provider that was not measured for a use is refused, and the use takes its usual path. | Per entry | `judge.provider` |\n\n## Authoring\n\nTools for writing stories. [More](../author/README.md)\n\n| Setting | Where | What it does | Default | Key |\n|---|---|---|---|---|\n| **Enable the wizard** | Settings › Start › New story | Turns on the story wizard in the Studio and the author's suggestion tools. It uses your authoring model and costs calls only while you use it. | On | `copilot.enabled` |\n| **Outlines per gap** | Settings › Judge › Outlines for the road ahead | Write this many outlines for each gap in the story and keep the best one. Each extra outline is another run of the story model. | 1 | `judge.expansion.variants` |\n| **Best outline picked by** | Settings › Judge › Outlines for the road ahead | Who picks the best outline: the judge's score, or the story model. | `code` | `judge.expansion.pick` |\n\n---\n\n[Setup](README.md)\n"
 },
 {
  "id": "setup/sprites",
  "doc": "setup/sprites.md",
  "audience": "setup",
  "title": "Sprite packs and changed looks",
  "headings": [
   {
    "level": 1,
    "text": "Sprite packs and changed looks",
    "slug": "sprite-packs-and-changed-looks"
   },
   {
    "level": 2,
    "text": "Where the stage looks for sprites",
    "slug": "where-the-stage-looks-for-sprites"
   },
   {
    "level": 2,
    "text": "Reuse expressions you already have",
    "slug": "reuse-expressions-you-already-have"
   },
   {
    "level": 2,
    "text": "Make a base when the character has no sprites",
    "slug": "make-a-base-when-the-character-has-no-sprites"
   },
   {
    "level": 2,
    "text": "Blink and mouth",
    "slug": "blink-and-mouth"
   },
   {
    "level": 2,
    "text": "Public changes inside one story",
    "slug": "public-changes-inside-one-story"
   }
  ],
  "body": "# Sprite packs and changed looks\n\nOpen a story in Studio and choose **Sprites**. The member picker contains installed cards from that story's roster.\n\n## Where the stage looks for sprites\n\nLike SillyTavern's Character Expressions, the stage reads a character's sprites from the folder named after the\ncharacter (`characters/<name>/`), or from the folder an expression override in Character Expressions names. A\n`folder` in the card's `so_sprites` block wins over both. Base sprites are the files named after their label\n(`happy.png`); a frame file such as `happy.blink.png` never becomes the base face, and animation frames live in\n`anim-<set>` folders.\n\n**SillyTavern's Character Expressions.** It may stay on. While the stage shows for a story with sprites,\nSillyTavern's own expression picture (and its Visual Novel sprites) is hidden, and it comes back when the stage is\nnot showing; SillyTavern's settings are never changed. The Setup list says when both are on.\n\n**Phones.** Below 768 px wide the stage always shows as the strip above the chat, with or without `/vn`.\n\nWhen a story directs a stage and a character it shows has no pack, no sprites in its folder, or no sprite for a face\nor set a turning point asks for, the author's Setup list names it (*stage-pack-missing*), and Studio warns about a\nface or set that the installed packs do not have.\n\n1. Choose an existing transparent PNG or upload a reference PNG.\n2. Choose a separate output set name, using lowercase letters, digits and underscores.\n3. Adjust the red head box to cover the face. Its coordinates are pixels in the reference, not the preview.\n4. Discover ComfyUI, then select the diffusion model, text encoder and VAE for the supported edit recipe.\n5. Generate an expression preview. Check identity and the expression, then **Keep this sprite**.\n\nPixels outside the face edit stay unchanged. Pixel checks catch missing transparency, blank images and framing\ndrift; they do not prove identity. Review the actual image before saving. Use a new set for a replacement pack.\n\nSaving an expression remembers its reference setup for optional on-demand edits. It never edits the character card.\nThe generated set is available to story stage direction after a stage reload. Original/default packs remain intact.\n\n## Reuse expressions you already have\n\nYou do not need to rebuild a good expression pack. In Studio › Sprites, discover the image-edit setup, select its\nmodels, then choose **Reference pack** and **Use this expression pack**. The pack needs a neutral image and transparent,\nnon-blank expression PNGs. The check reads and fingerprints each image; it writes only the reference settings.\nOriginal images never become generated assets and cannot be removed through generated-sprite cleanup.\n\nChanged looks reuse the matching expression's pose and identity, falling back to neutral when that expression is absent.\nA changed reference image makes a new cache key; an image changed during a render is refused rather than silently saved.\n\n## Make a base when the character has no sprites\n\nDiscover the image-edit setup, then open **Build a base from character-card art**. Choose the installed background-removal\nmodel and **Build four base candidates**. Review the face, clothing, framing and transparent edges, then keep one neutral\nbase. Reload the Sprites tab and use that base to build its expressions. Candidates are previews until you choose one.\nBackground removal needs an explicitly configured, installed model in the optional media plugin; nothing is downloaded.\n\n## Blink and mouth\n\nIf the original neutral expression is not a suitable resting pose, choose **Closed-mouth neutral rest**. This\nchanges only the selected mouth region and keeps a complete transparent sprite. Preview it in a separate output\nset; review the still image before using it as an animation reference. The original/default PNG is never edited.\n\nSelect the expression's own image as the reference. Generate **Blink frame**, **Mouth open frame**, and optionally\n**Mouth half-open frame**. Use the same output set and expression label. Frames go into `anim-<set>` so ST never\nmistakes them for ordinary expression sprites.\n\nFor a mouth frame, open **Mouth replacement region**. Green shows its patch inside the red head box. Keep the old\nand new lip outlines and smile corners inside the opaque middle; feather only the surrounding skin. Coordinates\nare relative to the head box. Each reference can keep its own adjustment while the tab stays open.\n\n**Inspect the edit before compositing** shows the cropped reference and raw model edit, so a generated mouth can be\ndistinguished from a blending artifact. Adjusting only the mouth region reuses a bounded raw-edit cache in the open\nbuilder; the image model is not called again. Closing the tab clears that cache. Model, reference, prompt, seed,\nstep count and resolution changes make a new render key.\n\n**Render preset** sets the steps and edit resolution together. **Standard** (1024 px, 25 steps) is the default and\nwhat reviewed packs use. **Fast preview** (512 px, 20 steps) is quicker but softer; review the face before keeping a\nfast render. The builder remembers your choice, and you can still change **Steps** and **Edit resolution** (512, 768\nor 1024) by hand. The setup you keep is what changed looks later render with. The saved frame retains the original\ncanvas size. Preview timing includes cleanup, with rendering reported separately.\n\nThe eyes and mouth use separate transparent patches, so blinking can overlap speech. **Mouth movement** defaults to\nSimple: two frames, closed and open, switched while the reply streams. Smooth adds the half-open frame and falls\nback to Simple if it is missing; Off keeps the mouth still. No frames means a static face that still breathes and\ncross-fades. Both the browser's and ST's reduced-motion setting disable facial animation.\n\n## Public changes inside one story\n\nAn author binds short public fields to ordinary extractor qualities:\n\n```json\n\"card\": {\"fields\": {\"hair\": {\"quality\": \"current_hair\", \"visual\": true}}}\n```\n\nPut that `card` object on a roster member (or `player`). Declare `current_hair` as a non-latching extractor string or\nenum quality. A checkpoint may apply `effects.card: {\"member_id\": {\"hair\": \"red\"}}`. Later extraction or an author\nedit wins; undoing a boundary restores the earlier value and its writer. A fresh chat has no applied change.\n\nIllustrations read the applied public visual fields. Pre-rendered sprite rules may select a set using\n`when.card: {\"hair\": [\"red\"]}`. **Current character state in replies** is a separate switch, on by default, under\nCharacters › Added to the reply prompt.\nPrivate knowledge belongs in the knowledge system, never in a public card field.\nThe local Artemis comparison did not show a repeatable benefit: both tested placements agreed with every changed colour,\nbut the memory-only baseline was equally good in one of the two runs. It is on by default all the same (2026-10-09).\n\n**Generate changed looks when needed** is on by default; it does nothing until a reference pack is set up for a\ncharacter, and you can turn it off per install. It requires a saved or reused reference pack, ComfyUI and the media plugin, and it renders on your GPU without\nasking. It renders the current expression first and keeps the old sprite visible while working, then builds that\nlook's blink and mouth frames from the new image, one at a time, letting a waiting reply go first between frames.\nWhen they are done the stage animates the new look; a look built earlier is reused from its cache. A result that\narrives after the look changed again, or after you left the chat, is discarded. A rollback restores the old set;\ncached generated files stay available. A new chat starts from the card as it was.\n\n[Illustrations](images.md) · [Setup](README.md)\n"
 }
];

export const GUIDE_ASSETS: Record<string, string> = {
 "assets/settings-sections.png": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAACWCAIAAABvmpKCAAAB3ElEQVR42u3csQ1AQBSAYZOIQi0qE8iVaqMYxxBmEI3GRFqJRiSEuy/5W4181bt7lxV5KUVT5hcIaAloCWgJaAF9qK4a6RcBLaAloCWgJaAFNNACWooLdB8G6XbTuF3s/C3QAhpoAS0BLaA/AHqZ16RCEGigBTTQQAMNNNBAAw000AIaaJlDC2igBTTQAhpoRQdasrEiAS0BLaCBFtAS0BLQ0pOgQ9tJt7t+sHL+FmgBDbSAloAW0B8AndrGCoJAAy2ggQYaaKCBBhpooIEW0EDLHFpAAy2ggRbQQCs60JKNFQloCWgBDbSAloCWgJa8yyEHK0ALaAloAQ20gLaxYmMFaKCBBhpoAQ000EADDTTQQAMNNNDm0BLQAhpoAQ20gJZsrEhAS0BLQAtoCWgJaMm7HHKwArSABlpAS0ALaBsrNlaABhpooIEW0EALaKCBBhpooIEG2hxaAlpAAy2ggRbQLvjLxooEtAS0BLSABlpAS0BL3uWQgxWgBTTQAloCWkDbWLGxAjTQQAMNtIAGWkADDTTQQAMNNNBAm0MLaAloAQ20gHbBXy74S0BLQEtAC2igBbQEtAS0BLSABlpAS0BLQEtAC2igBbQEtPQmaOm/AS2gJaAloCWglXA7s20sScL+UZwAAAAASUVORK5CYII="
};
