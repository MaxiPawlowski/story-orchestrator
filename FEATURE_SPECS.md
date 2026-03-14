# Story Orchestrator - Feature Specs

This file describes shipped product behavior. It stays user-facing on purpose: what the feature does, when it acts, and what guarantees it tries to preserve.

## 1. Checkpoint Graph Runtime

### Intent
Turn a freeform chat into a structured story that still supports branching and replayable flow.

### Behavior
- One checkpoint is active at a time.
- The active checkpoint defines scene context, possible exits, and activation side effects.
- Stories can branch, loop, converge, or pause without breaking runtime state.
- Checkpoint status is tracked separately from authored story structure.

### Rules
- Progression only happens through valid outgoing transitions from the active checkpoint.
- If no transition is satisfied, the story stays on the current checkpoint.
- Checkpoint activation must be idempotent enough to survive hydration and chat switching.

## 2. Transition Evaluation

### Intent
Detect story progress from chat behavior without requiring rigid command syntax.

### Behavior
- Regex transitions match player text directly.
- Timed transitions fire from `checkpointTurnCount`.
- Manual commands can activate checkpoints or queue evaluation explicitly.
- Competing or ambiguous regex matches are resolved through arbiter flow instead of blind auto-advance.

### Rules
- Evaluation runs against outgoing transitions only.
- Timed transitions take effect when their threshold is reached.
- Manual controls must still preserve runtime consistency and persistence.

## 3. Arbiter

### Intent
Use an LLM judge when literal trigger matching is not enough.

### Behavior
- The arbiter receives the current checkpoint, candidate transitions, and recent chat history.
- It is invoked automatically from trigger matches, interval checks, or manual `/checkpoint eval`.
- Responses are expected in JSON-only form and parsed from raw JSON or fenced JSON.
- Arbiter output determines whether the story advances and which transition wins.

### Rules
- Arbiter should be conservative when evidence is weak.
- The result must map cleanly onto authored transitions.
- Chat excerpts used during evaluation also refresh the `{{chat_excerpt}}` macro.

## 4. Checkpoint Effects

### Intent
Make checkpoint activation the unit of story automation.

### Behavior
- Activating a checkpoint can apply Author's Notes, preset overrides, arbiter presets, world info changes, slash-command automations, macro updates, and talk-control scope.
- Effects are tied to the active scene rather than global chat state.
- Effects can be replayed safely after hydration or context restoration when needed.

### Rules
- Activation happens immediately at runtime state level.
- Side effects may be deferred if requirements are not ready.
- Deferred effects flush automatically once blocking requirements clear.

## 5. Author's Notes Automation

### Intent
Keep scene guidance aligned with the current beat and active role.

### Behavior
- Checkpoints can define shared defaults and per-role note entries.
- Role-specific notes override broader guidance.
- Roles without a specific note can be cleared so stale scene guidance does not leak forward.

### Rules
- The active checkpoint is the source of truth for note state.
- Role-specific behavior must remain stable across repeated activations of the same checkpoint.

## 6. Preset Automation

### Intent
Let scene context change generation behavior without mutating the user's saved presets.

### Behavior
- A runtime-only preset named `Story:<storyId>` is composed and applied during story execution.
- Checkpoint-level per-role overrides are merged onto defaults.
- `$arbiter` can use a different preset profile during evaluation phases.
- ST UI controls are synchronized through the preset UI bridge when host support is available.

### Rules
- Story automation must not overwrite a user's stored baseline preset.
- Missing override keys inherit from the current base/default behavior.

## 7. World Info Automation

### Intent
Expose lore only when it belongs in the current scene.

### Behavior
- Checkpoints can activate and deactivate lore entries.
- Lore availability follows checkpoint progression.
- Requirement checks also validate that required lore assets exist before effects are applied.

### Rules
- Story-critical lore should not leak early.
- Missing lore should block automation clearly rather than fail silently.

## 8. Talk Control

### Intent
Allow authored NPC or narrator beats to land at the right time without manual prompting.

### Behavior
- Replies can be static or generated from instructions.
- Supported triggers are `onEnter`, `afterSpeak`, `beforeArbiter`, and `afterArbiter`.
- Loud host generations can be intercepted and aborted so queued talk-control replies can run first.
- Reply selection is throttled per trigger/checkpoint/turn so scenes do not spam.

### Rules
- Quiet generations are not intercepted.
- Talk control must guard against recursion and self-trigger loops.
- Character resolution has to respect group and role context.

## 9. Requirements Gating

### Intent
Avoid applying story automation in an invalid chat context.

### Behavior
- Persona, group membership, role presence, world info presence, and global lorebook readiness are tracked continuously.
- The UI shows why automation is blocked.
- Checkpoint state may advance while side effects wait for requirements to become valid.

### Rules
- Fail closed, not open.
- Deferred effects preserve intended checkpoint order and current scene state.

## 10. Persistence

### Intent
Support long-running stories across chat switching and editor iteration.

### Behavior
- Story library content is stored in extension settings.
- Active story selection is tracked per chat.
- Runtime state is persisted by `(chatId + story title)` and restored on return.
- Hydration restores runtime state without replaying invalid or duplicate effects.

### Rules
- Library content and runtime state are separate concerns.
- One chat must not leak runtime state into another.

## 11. Story Macros

### Intent
Expose current story state everywhere prompts and automations need it.

### Behavior
- Macros publish story title, description, current checkpoint, checkpoint history, possible triggers, arbiter chat excerpt, player name, and role display names.
- Macro values update after meaningful runtime changes.

### Rules
- Runtime state is the source of truth.
- Macro updates must stay aligned across presets, notes, lore, and automations.

## 12. Studio

### Intent
Make authored graph stories practical without requiring raw file editing.

### Behavior
- Studio edits metadata, defaults, checkpoints, transitions, world info, automations, and talk control in one workspace.
- Cytoscape + dagre graph rendering visualizes checkpoint topology.
- Diagnostics surface schema errors, structural problems, and authoring issues before runtime.
- Mermaid export and regex helpers support author workflow.

### Rules
- Visual structure should match the real runtime graph.
- Invalid definitions should be blocked or surfaced clearly before save/import.

## 13. Story Generator Wizard

### Intent
Reduce blank-page setup cost for new stories and new checkpoints.

### Behavior
- Wizard flows can generate initial story scaffolds and scene expansions from a premise and roadmap.
- Generated outputs are editable drafts, not locked artifacts.
- Generation progress is surfaced in the UI.

### Rules
- Generated output must feed back into the normal story schema and Studio workflow.
- Users keep final editorial control.

## 14. Host Boundary

### Intent
Isolate SillyTavern integration details from story runtime behavior.

### Behavior
- Runtime services use `STAPI` and `src/services/stHost/*` instead of importing host globals directly.
- Host modules are loaded through the extension boundary instead of spread across feature code.

### Rules
- Host-facing changes should stay localized.
- Story logic should reason in story terms, not host plumbing terms.
