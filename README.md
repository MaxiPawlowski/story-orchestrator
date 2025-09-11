# Extension-ReactTemplate

Turn SillyTavern into a guided, objective-driven adventure engine. This plugin adds staged checkpoints to your stories, evaluates player actions for win/fail conditions, and swaps scene context (Author’s Note, World Info, CFG) automatically. It is built around a small group chat with two AI actors: a DM (Storyteller) and a Companion.

TL;DR

- Player chats normally.
- DM narrates, enforces objectives, and advances stages.
- Companion roleplays and gives gentle hints.
- Plugin watches player messages for win/fail triggers and activates per-stage changes.

Quick Start

1. Create two characters:
   - DM (tag: `dm`) — narrator and referee.
   - Companion (tag: `companion`) — ally that roleplays and hints.
2. Start a Group Chat including: Player (you), DM, Companion.
   - Tip: Use List Order → DM first → Companion second (predictable turn order).
3. Load a story JSON in the Plugin panel (Load Story).
4. Press Start. Plugin activates Checkpoint 1 and the scene begins.
5. Play. The plugin checks your messages for win/fail, swaps context, and advances stages.

How it works (overview)

- Each checkpoint defines:
  - objective — what the player must achieve
  - win_trigger / fail_trigger — regex patterns matched against every user message
  - on_activate — actions to run when this stage begins (swap Author’s Note, toggle World Info, change CFG, fire Automation ID)
- When a win_trigger matches:
  - plugin advances to the next checkpoint
  - runs that checkpoint's on_activate
  - cues DM to narrate the transition
- When a fail_trigger matches:
  - DM narrates the consequences (configurable as soft fail or game over)

Checkpoint format (recommended)

- id: unique identifier
- title: short name
- objective: single-sentence goal for the player
- win_trigger: regex (or list) to detect success
- fail_trigger: regex (or list) to detect failure
- on_activate:
  - author_note: text to set as Author’s Note for the stage
  - world_info_keys: keys or inclusion groups to enable/disable World Info entries
  - cfg: tweaks to CFG scale (temperature/presets)
  - automation_id: optional STscript ID to fire on activation

Example (conceptual)

- Checkpoint 1: Tavern Intro
  - objective: "Learn the barkeep's name and get a drink."
  - win_trigger: /get.*drink|order.*ale/i
  - fail_trigger: /fall.*asleep/i
  - on_activate: set A/N to the opening scene, enable tavern WI, set CFG to focused

Recommended roles and behavior

- DM (Storyteller)
  - Persona: omniscient narrator + referee
  - Role: set scenes, verify objectives, confirm success/failure, advance stages
  - Style: concise, non-spoiling
  - First message: set the opening scene
- Companion
  - Persona: friendly ally with mild meta-awareness
  - Role: roleplay, hint gently (knows objectives but not solutions)
  - Style: supportive and subtle

Authoring tips

- Encode rules and instructions into World Info entries grouped by keys and inclusion groups, gated per-stage.
- Use Automation ID to trigger STscript when a stage activates (swap Author’s Note, flip flags, run scripts).
- Track player location and inject WI based on location + checkpoint to keep context relevant.
- Keep regex triggers conservative to avoid false positives; consider multiple patterns or staged confirmation.

Roadmap (ideas)

- Branching graphs (multiple valid next checkpoints)
- Per-stage sampler presets (temperature/top-p/penalties)
- Built-in Story Wizard (authoring UI)
- Save/Load mid-quest state & variables
- Analytics: hint usage, time-to-complete, dead-end detection

Notes and best practices

- Place DM first in List Order for deterministic flow.
- Use concise instructions in Author’s Note to steer model behaviour; use World Info for scene rules and mechanics.
- Test triggers with example player messages to tune win/fail regexes.

License / Attribution

- This README documents the Extension-ReactTemplate plugin structure and usage. Adapt content as needed for your stories.

<!-- end of file -->