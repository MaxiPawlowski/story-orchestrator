# Story Orchestrator

SillyTavern is an AI chat frontend for running roleplay and storytelling sessions with LLMs. This extension adds structured, automated storytelling on top of SillyTavern's free-form chat.

The plugin lets authors define stories as directed graphs of checkpoints (story beats), then automates progression through them based on what's happening in the chat. Stories are defined in JSON and run inside an active SillyTavern chat session with characters.

## Goals

- Turn unstructured SillyTavern chats into authored, non-linear stories
- Automatically detect when story beats are reached and advance the narrative
- Apply AI-side effects per checkpoint: author notes, preset tweaks, world info toggles
- Let NPCs speak autonomously at story moments via Talk Control
- Give authors a visual graph editor (Studio) to design stories without editing raw YAML

## Core Concepts

**Checkpoints** — Named story beats with a description/objective. Each checkpoint can configure what happens when it activates: author notes injected into the prompt, AI preset overrides, world info entries toggled, and NPC replies triggered.

**Transitions** — Directed edges between checkpoints. A transition fires when a trigger condition is met: a regex match against recent chat messages, a fixed number of turns elapsed, or a manual user action.

**Arbiter** — An AI judge that runs on a schedule (every N turns) or on trigger, reads the chat transcript, and decides whether the story should advance to the next checkpoint. Evaluation can also be forced manually via slash command.

**Talk Control** — Allows NPCs to automatically inject replies at story moments. Responds to four events: checkpoint activation, after an NPC speaks, before/after arbiter evaluation. Each rule can target specific group chat members and limit how many times it fires per checkpoint.

**Story Macros** — Template variables (`{{story_title}}`, `{{story_current_checkpoint}}`, `{{chat_excerpt}}`, etc.) available in author notes and arbiter prompts. Auto-update as the story progresses.

**Requirements** — Stories can require specific personas, group chat members, world info entries, and lorebooks to be active. If requirements aren't met, checkpoint effects are deferred until they are.

## How It Works (User Flow)

1. Author writes a story in JSON (or builds it in Studio) and loads it via the extension settings panel
2. A chat session is started in SillyTavern with the appropriate characters
3. The extension activates and begins watching the chat for trigger conditions
4. When a transition fires (regex match, turn count, or arbiter decision), the next checkpoint activates
5. Checkpoint effects apply immediately: prompt injections, preset changes, world info toggles, NPC replies
6. User can navigate manually via slash commands or the drawer UI

## UI Entry Points

- **Extension Settings Panel** — Story selection, arbiter configuration, Studio launcher
- **Drawer (Checkpoint Progress)** — Shows active checkpoint, requirements status, progress badges
- **Checkpoint Studio** — Visual graph editor with tabbed checkpoint editor, Cytoscape/dagre graph view, diagnostics panel
