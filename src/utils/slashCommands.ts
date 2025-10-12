import { storySessionStore } from "@store/storySessionStore";
import { getOrchestrator, pauseAutomation, resumeAutomation, isAutomationPaused } from "@controllers/orchestratorManager";
import { getContext } from "@services/SillyTavernAPI";
import { deriveCheckpointStatuses, CheckpointStatus } from "@utils/story-state";

export function registerStoryExtensionCommands() {
  const ctx = getContext?.();
  if (!ctx) return;
  registerCheckpointCommand(ctx);
  registerStoryCommand(ctx);
}

function registerCheckpointCommand(ctx: any) {
  const { SlashCommandParser, SlashCommand, SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE } = ctx;
  if (!SlashCommandParser || !SlashCommand) return;
  if ((SlashCommandParser as any)._storyCheckpointRegistered) return;
  (SlashCommandParser as any)._storyCheckpointRegistered = true;

  const help = `<div>Activate or inspect story checkpoints.</div>
<pre><code class="language-stscript">/checkpoint 2
/checkpoint id=finale
/checkpoint next
/checkpoint list</code></pre>`;

  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: 'checkpoint',
      aliases: ['cp', 'storycp'],
      helpString: help,
      unnamedArgumentList: [
        SlashCommandArgument.fromProps({ description: 'Index (1-based) or id', typeList: ARGUMENT_TYPE.STRING, isRequired: false }),
      ],
      namedArgumentList: [
        SlashCommandNamedArgument.fromProps({ name: 'id', description: 'Checkpoint id or index', typeList: ARGUMENT_TYPE.STRING }),
      ],
      callback: (named: Record<string, unknown>, unnamed: string) => handleCheckpointCommand(named, unnamed),
    })
  );
}

function handleCheckpointCommand(named: Record<string, unknown>, unnamed: string): string {
  const store = storySessionStore.getState();
  const { story } = store;
  if (!story) return '[checkpoint] No story loaded';

  const tokenRaw = named.id ?? named.cp ?? named.checkpoint ?? unnamed;
  const token = tokenRaw == null ? '' : String(tokenRaw).trim();
  const lower = token.toLowerCase();

  if (!token) {
    return formatCheckpointList();
  }

  if (lower === 'list' || lower === 'status' || lower === 'ls') {
    return formatCheckpointList();
  }

  if (lower === 'next' || lower === '+1' || lower === 'forward') {
    const orch = getOrchestrator();
    if (!orch) return '[checkpoint] Orchestrator not ready';
    const changed = orch.activateRelative(1);
    if (!changed) return '[checkpoint] Already at the final checkpoint';
    return formatActivationMessage();
  }

  if (lower === 'prev' || lower === 'previous' || lower === '-1' || lower === 'back') {
    const orch = getOrchestrator();
    if (!orch) return '[checkpoint] Orchestrator not ready';
    const changed = orch.activateRelative(-1);
    if (!changed) return '[checkpoint] Already at the first checkpoint';
    return formatActivationMessage();
  }

  const orch = getOrchestrator();
  if (!orch) return '[checkpoint] Orchestrator not ready';

  const asNum = Number.parseInt(token, 10);
  let idx = Number.isFinite(asNum) && asNum >= 1 ? asNum - 1 : -1;
  if (idx < 0) idx = story.checkpoints.findIndex(c => String(c.id) === token);
  if (idx < 0 || idx >= story.checkpoints.length) return `[checkpoint] Not found: ${token}`;

  try { orch.activateIndex(idx); } catch (e) { return `[checkpoint] Failed: ${(e as any)?.message || e}`; }
  return formatActivationMessage();
}

function registerStoryCommand(ctx: any) {
  const { SlashCommandParser, SlashCommand, SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE } = ctx;
  if (!SlashCommandParser || !SlashCommand) return;
  if ((SlashCommandParser as any)._storyRuntimeRegistered) return;
  (SlashCommandParser as any)._storyRuntimeRegistered = true;

  const help = `<div>Inspect or manipulate Story Driver runtime.</div>
<pre><code class="language-stscript">/story status
/story reset
/story eval
/story persist
/story pause
/story resume
/story toggle</code></pre>`;

  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: 'story',
      aliases: ['storyctl', 'storydriver'],
      helpString: help,
      unnamedArgumentList: [
        SlashCommandArgument.fromProps({ description: 'Action (status, reset, eval, persist, pause, resume, toggle)', typeList: ARGUMENT_TYPE.STRING, isRequired: false }),
        SlashCommandArgument.fromProps({ description: 'Optional value', typeList: ARGUMENT_TYPE.STRING, isRequired: false }),
      ],
      namedArgumentList: [
        SlashCommandNamedArgument.fromProps({ name: 'action', description: 'Action to perform', typeList: ARGUMENT_TYPE.STRING }),
        SlashCommandNamedArgument.fromProps({ name: 'value', description: 'Optional value', typeList: ARGUMENT_TYPE.STRING }),
      ],
      callback: (named: Record<string, unknown>, unnamed: string) => handleStoryCommand(named, unnamed),
    })
  );
}

const STATUS_ICONS: Record<CheckpointStatus, string> = {
  [CheckpointStatus.Pending]: '○',
  [CheckpointStatus.Current]: '●',
  [CheckpointStatus.Complete]: '✔',
  [CheckpointStatus.Failed]: '✖',
};

function formatCheckpointList(): string {
  const snapshot = storySessionStore.getState();
  const { story, runtime } = snapshot;
  if (!story) return '[checkpoint] No story loaded';
  const checkpoints = story.checkpoints ?? [];
  if (!checkpoints.length) return '[checkpoint] Story has no checkpoints';
  const statuses = deriveCheckpointStatuses(story, runtime);
  const headerCp = checkpoints[runtime.checkpointIndex];
  const lines: string[] = [
    `[checkpoint] Active ${runtime.checkpointIndex + 1}/${checkpoints.length}: ${headerCp?.name ?? 'Unknown'} (id=${headerCp?.id ?? 'n/a'})`,
  ];

  checkpoints.forEach((cp, index) => {
    const pointer = index === runtime.checkpointIndex ? '→' : ' ';
    const status = statuses[index] ?? CheckpointStatus.Pending;
    const marker = STATUS_ICONS[status] ?? '?';
    lines.push(`${pointer} ${index + 1}. ${marker} ${cp.name ?? '(Unnamed)'} (id=${cp.id})`);
  });

  return lines.join('\n');
}

function formatActivationMessage(): string {
  const snapshot = storySessionStore.getState();
  const { story, runtime } = snapshot;
  if (!story) return '[checkpoint] No story loaded';
  const checkpoints = story.checkpoints ?? [];
  const cp = checkpoints[runtime.checkpointIndex];
  return `[checkpoint] Activated ${runtime.checkpointIndex + 1}/${checkpoints.length}: ${cp?.name ?? 'Unknown'} (id=${cp?.id ?? 'n/a'})`;
}

function handleStoryCommand(named: Record<string, unknown>, unnamed: string): string {
  const tokens = tokenizeCommand(named, unnamed);
  const action = tokens.shift()?.toLowerCase() ?? 'status';

  switch (action) {
    case 'status':
    case 'info':
      return buildStoryStatus();
    case 'reset':
    case 'restart':
      return handleStoryReset();
    case 'eval':
    case 'evaluate':
    case 'check':
      return handleStoryEval();
    case 'persist':
    case 'save':
      return handleStoryPersist();
    case 'pause':
      return handleStoryPause();
    case 'resume':
      return handleStoryResume();
    case 'toggle':
      return handleStoryToggle();
    default:
      return `[story] Unknown action "${action}". Try: status, reset, eval, persist, pause, resume, toggle.`;
  }
}

function tokenizeCommand(named: Record<string, unknown>, unnamed: string): string[] {
  const pieces: string[] = [];
  const primary = named.action ?? named.cmd ?? named.do ?? null;
  if (primary != null) {
    pieces.push(String(primary));
    if (named.value != null) pieces.push(String(named.value));
  }
  if (unnamed && typeof unnamed === 'string') {
    const extras = unnamed.trim().split(/\s+/).filter(Boolean);
    pieces.push(...extras);
  }
  return pieces;
}

function buildStoryStatus(): string {
  const snapshot = storySessionStore.getState();
  const { story, runtime, turn, requirements, orchestratorReady, hydrated, groupChatSelected, chatId } = snapshot;
  const orch = getOrchestrator();

  const lines: string[] = ['[story] Runtime status:'];
  lines.push(`- Story: ${story ? `${story.title} (${story.checkpoints.length} checkpoints)` : 'none loaded'}`);
  if (story) {
    const cp = story.checkpoints[runtime.checkpointIndex];
    lines.push(`  • Active: ${runtime.checkpointIndex + 1}/${story.checkpoints.length} (${cp?.name ?? 'Unknown'}, id=${cp?.id ?? 'n/a'})`);
    lines.push(`  • Turns (total/interval): ${turn}/${runtime.turnsSinceEval}`);
    lines.push(`  • Checkpoint turns: ${runtime.checkpointTurnCount}`);
  }

  lines.push(`- Orchestrator: ${orchestratorReady ? 'ready' : 'initializing'}${isAutomationPaused() ? ' (paused)' : ''}`);
  if (orch) {
    lines.push(`  • Interval turns: ${orch.getIntervalTurns()}`);
    lines.push(`  • Persistence: ${orch.canPersist() ? 'enabled' : 'disabled'}${hydrated || orch.isHydrated() ? ' (hydrated)' : ''}`);
  }

  lines.push(`- Chat context: ${groupChatSelected ? 'group chat ready' : 'group chat not selected'}${chatId ? ` (chatId=${chatId})` : ''}`);

  const reqLines: string[] = [];
  reqLines.push(`requirementsReady=${requirements.requirementsReady ? 'yes' : 'no'}`);
  reqLines.push(`persona=${requirements.personaDefined ? 'ok' : 'missing'}`);
  reqLines.push(`worldInfo=${requirements.worldLoreEntriesPresent ? 'ok' : `missing(${requirements.worldLoreEntriesMissing.join(', ') || 'entries'})`}`);
  reqLines.push(`globalLore=${requirements.globalLoreBookPresent ? 'ok' : `missing(${requirements.globalLoreBookMissing.join(', ') || 'entries'})`}`);
  reqLines.push(`groupMembers=${requirements.missingGroupMembers.length ? `missing(${requirements.missingGroupMembers.join(', ')})` : 'ok'}`);
  lines.push(`- Requirements: ${reqLines.join(' | ')}`);

  return lines.join('\n');
}

function handleStoryReset(): string {
  const orch = getOrchestrator();
  if (!orch) return '[story] Orchestrator not ready';
  const ok = orch.resetStory();
  if (!ok) return '[story] Unable to reset story (no checkpoints?)';
  return formatActivationMessage().replace('[checkpoint]', '[story]');
}

function handleStoryEval(): string {
  const orch = getOrchestrator();
  if (!orch) return '[story] Orchestrator not ready';
  const ok = orch.evaluateNow();
  return ok ? '[story] Manual evaluation queued.' : '[story] No regex transitions available at this checkpoint.';
}

function handleStoryPersist(): string {
  const orch = getOrchestrator();
  if (!orch) return '[story] Orchestrator not ready';
  const ok = orch.requestPersist();
  return ok ? '[story] Runtime snapshot persisted.' : '[story] Persistence not available (missing group chat or chat id).';
}

function handleStoryPause(): string {
  if (isAutomationPaused()) return '[story] Automation already paused.';
  pauseAutomation();
  return '[story] Automation paused. The arbiter will ignore new turns until resumed.';
}

function handleStoryResume(): string {
  if (!isAutomationPaused()) return '[story] Automation already active.';
  resumeAutomation();
  return '[story] Automation resumed.';
}

function handleStoryToggle(): string {
  if (isAutomationPaused()) {
    resumeAutomation();
    return '[story] Automation resumed.';
  }
  pauseAutomation();
  return '[story] Automation paused.';
}
