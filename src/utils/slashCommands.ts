import { storySessionStore } from "@store/storySessionStore";
import { getOrchestrator } from "@controllers/orchestratorManager";
import { getContext } from "@services/SillyTavernAPI";
import { deriveCheckpointStatuses, CheckpointStatus } from "@utils/story-state";

const STORY_COMMAND_TAG_ATTR = 'data-story-orchestrator="1"';

export function registerStoryExtensionCommands() {
  const ctx = getContext?.();
  if (!ctx) return;
  registerCheckpointCommand(ctx);
}

function registerCheckpointCommand(ctx: any) {
  const { SlashCommandParser, SlashCommand, SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE } = ctx;
  if (!SlashCommandParser || !SlashCommand) return;
  if ((SlashCommandParser as any)._storyCheckpointRegistered) return;
  (SlashCommandParser as any)._storyCheckpointRegistered = true;

  const help = `<div ${STORY_COMMAND_TAG_ATTR}>Inspect or activate story checkpoints.</div>
<pre><code class="language-stscript">/checkpoint list
/checkpoint prev
/checkpoint eval
/checkpoint id=finale</code></pre>`;

  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: 'checkpoint',
      aliases: ['cp'],
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

  const tokenValue = named?.id ?? unnamed;
  const token = tokenValue == null ? "" : String(tokenValue).trim();
  const lower = token.toLowerCase();

  if (!token || lower === "list") {
    return formatCheckpointList();
  }

  if (lower === "prev") {
    const orch = getOrchestrator();
    if (!orch) return "[checkpoint] Orchestrator not ready";
    const changed = orch.activateRelative(-1);
    if (!changed) return "[checkpoint] Already at the first checkpoint";
    return formatActivationMessage();
  }

  if (lower === "eval") {
    const orch = getOrchestrator();
    if (!orch) return "[checkpoint] Orchestrator not ready";
    const ok = orch.evaluateNow();
    return ok
      ? "[checkpoint] Manual evaluation queued."
      : "[checkpoint] No regex transitions available at this checkpoint.";
  }

  const orch = getOrchestrator();
  if (!orch) return "[checkpoint] Orchestrator not ready";

  const asNum = Number.parseInt(token, 10);
  let idx = Number.isFinite(asNum) && asNum >= 1 ? asNum - 1 : -1;
  if (idx < 0) idx = story.checkpoints.findIndex((c) => String(c.id) === token);
  if (idx < 0 || idx >= story.checkpoints.length) return `[checkpoint] Not found: ${token}`;

  try {
    orch.activateIndex(idx);
  } catch (err) {
    const reason = (err as { message?: unknown })?.message ?? err;
    return `[checkpoint] Failed: ${String(reason)}`;
  }

  return formatActivationMessage();
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
