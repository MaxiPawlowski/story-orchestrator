# Workspace setting and action placement

Scope inventory for the full-screen rework. Individual setting keys and defaults are generated in
`docs/guide/setup/settings-reference.md`; this inventory assigns their ownership and application timing.

## Setting families

- Feature switches and policies: `runtime/featureControls.ts` is the complete control-to-setting inventory.
  Install masters/defaults live in Orchestrator → Defaults; authored policies in Studio → Story features;
  playthrough overrides in Story → Features. Every row shows its source and reset. Applies to future work.
- Reply thinking: install `extraction.replyEffort`, story `reasoning`/`features.thinking`, checkpoint
  `effects.reasoning`, chat effort. Install master-off wins; chat overrides checkpoint/story effort.
  Takes effect on the next supported character generation. The connection still owns whether reasoning is available.
- Dramatic shape: authored `arc_template`; per-chat `pacing.shapeOverride` on the pacing feature page.
  Reset restores the authored shape. Refreshes the next prompt.
- Model profiles, fallbacks, harnesses, per-role effort/budgets, capability self-tests:
  Orchestrator → Connections. Install-owned; applies to the next request. ST owns the connection profiles themselves.
- Judge enabled/provider/key/uses: Orchestrator → Connections. Related uses also appear on their feature page,
  marked Install; both controls write the same setting. Applies to the next judge request.
  Measurement misses remain informational.
- Image backend, director connection, installed models, picture-type recipes, safe mode, service and GPU controls:
  Orchestrator → Connections. Install-owned. Story moments, workflows, styles and character appearances are authored
  in Studio → Presentation; automation switches/policy have the feature layers. Applies to the next picture request.
- Removed install setting `image.characters`: no alias or migration. Character appearances come from authored
  `illustrations.appearances`, story look layers and the character descriptions. Per-request/chat image model
  overrides remain separate from authored appearances.
- World Info gating/normalization, model capability switches and other technical tuning: install-owned.
  Curator allowlists, exclusions, creation caps and lore selection are authored in Studio → World.
  Switching a feature never expands its authored scope.
- Interface display/motion: Orchestrator → Interface. `runtime/deviceSettings.ts` explicitly lists the keys allowed
  to override install defaults in this browser/account. All other settings retain their install/story/chat ownership.
  Display updates immediately; animation changes affect the next stage render. Story feature decline still wins.
- Briefing visibility, drafting, player-setup service, Wizard and Ask switches: install-owned.
  Briefing content/player role are authored; briefing seen/identity lock are chat state.
- Experimental switches: install-owned, under Orchestrator advanced setup. Help progress and draft-session state
  are internal rather than authored feature controls.

## Actions and audience

- Start, continue, import, create story/group, bind a story: Orchestrator → Library.
- Read now, retry a failed read: Story feature/recovery controls; operate on this chat.
- Approve/reject proposals: Story → Review after Author view. Counts/status are player-safe; proposal content is not.
- Edit story: Studio. Save writes the library and offers this chat's compatible update or keep/restart choice.
  Other chats take library edits through Update to the latest or Restart.
- Restart, reopen briefing, player identity, stat panels, suggestions: Story → Play; chat-owned.
- Blackboard, scheduler, payload, next-turn inspection, model-call details, driver controls: Story → Author.
- Flag moment: chat journal action. Memory decisions are author tools; player memory is filtered.
- Device reset: deletes only that account/browser preference. Feature reset deletes only the selected chat override.
- Graph add/edit/connect/remove, draft undo/redo, save/import/export, diagnostics jumps: Studio draft actions.
  Mobile has checkpoint/transition drill-down and graph sheets; long-press opens checkpoint actions.

## Validation

- Configuration and authored edits use separate stores; the browser gate verifies authored isolation and source reset.
- Player-clean sweep checks the workspace before Author view; counts never expose proposal or model-response content.
- Desktop/browser Back and mobile graph/save/application are checked by `scripts/debug/so-workspace-check.mts`.
