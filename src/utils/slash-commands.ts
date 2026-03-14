import { storySessionStore } from "@store/storySessionStore";
import { getOrchestrator } from "@controllers/orchestratorManager";
import { getContext } from "@services/STAPI";
import { deriveCheckpointStatuses, CheckpointStatus } from "@utils/story-state";

const STORY_COMMAND_TAG_ATTR = 'data-story-orchestrator="1"';

type SlashCommandRegistrar = SillyTavernContext & {
  SlashCommandParser?: SillyTavernSlashCommandParser & {
    addCommandObject?: (command: unknown) => void;
    _storyCheckpointRegistered?: boolean;
  };
  SlashCommand?: {
    fromProps: (props: Record<string, unknown>) => unknown;
  };
  SlashCommandArgument?: {
    fromProps: (props: Record<string, unknown>) => unknown;
  };
  SlashCommandNamedArgument?: {
    fromProps: (props: Record<string, unknown>) => unknown;
  };
  ARGUMENT_TYPE?: {
    STRING: unknown;
  };
};

const STATUS_ICONS: Record<CheckpointStatus, string> = {
  [CheckpointStatus.Pending]: "○",
  [CheckpointStatus.Current]: "●",
  [CheckpointStatus.Complete]: "✔",
  [CheckpointStatus.Failed]: "✖",
};

export function registerStoryExtensionCommands() {
  registerCheckpointCommand(getContext() as SlashCommandRegistrar);
}

function registerCheckpointCommand(ctx: SlashCommandRegistrar) {
  const { SlashCommandParser, SlashCommand, SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE } = ctx;
  if (!SlashCommandParser?.addCommandObject || !SlashCommand || !SlashCommandArgument || !SlashCommandNamedArgument || !ARGUMENT_TYPE) return;
  if (SlashCommandParser._storyCheckpointRegistered) return;
  SlashCommandParser._storyCheckpointRegistered = true;

  const help = `<div ${STORY_COMMAND_TAG_ATTR}>Inspect or activate story checkpoints.</div>
<pre><code class="language-stscript">/checkpoint list
/checkpoint prev
/checkpoint eval
/checkpoint id=finale</code></pre>`;

  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: "checkpoint",
      aliases: ["cp"],
      helpString: help,
      unnamedArgumentList: [
        SlashCommandArgument.fromProps({
          description: "Index (1-based) or id",
          typeList: ARGUMENT_TYPE.STRING,
          isRequired: false,
        }),
      ],
      namedArgumentList: [
        SlashCommandNamedArgument.fromProps({
          name: "id",
          description: "Checkpoint id or index",
          typeList: ARGUMENT_TYPE.STRING,
        }),
      ],
      callback: (named: Record<string, unknown>, unnamed: string) => handleCheckpointCommand(named, unnamed),
    }),
  );
}

function handleCheckpointCommand(named: Record<string, unknown>, unnamed: string): string {
  const store = storySessionStore.getState();
  const { story } = store;
  if (!story) return "[checkpoint] No story loaded";

  const token = String(named.id ?? unnamed ?? "").trim();
  const lower = token.toLowerCase();
  const orch = getOrchestrator();

  if (!token || lower === "list") return formatCheckpointList();
  if (!orch) return "[checkpoint] Orchestrator not ready";

  if (lower === "prev") {
    return orch.activateRelative(-1)
      ? formatActivationMessage()
      : "[checkpoint] Already at the first checkpoint";
  }

  if (lower === "eval") {
    return orch.evaluateNow()
      ? "[checkpoint] Manual evaluation queued."
      : "[checkpoint] No regex transitions available at this checkpoint.";
  }

  const numericIndex = Number.parseInt(token, 10);
  const targetIndex = Number.isFinite(numericIndex) && numericIndex >= 1
    ? numericIndex - 1
    : story.checkpoints.findIndex((checkpoint) => String(checkpoint.id) === token);
  if (targetIndex < 0 || targetIndex >= story.checkpoints.length) return `[checkpoint] Not found: ${token}`;

  try {
    orch.activateIndex(targetIndex);
    return formatActivationMessage();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return `[checkpoint] Failed: ${reason}`;
  }
}

function formatCheckpointList(): string {
  const { story, runtime } = storySessionStore.getState();
  if (!story) return "[checkpoint] No story loaded";
  if (!story.checkpoints.length) return "[checkpoint] Story has no checkpoints";

  const statuses = deriveCheckpointStatuses(story, runtime);
  const activeCheckpoint = story.checkpoints[runtime.checkpointIndex];
  const lines = [
    `[checkpoint] Active ${runtime.checkpointIndex + 1}/${story.checkpoints.length}: ${activeCheckpoint?.name ?? "Unknown"} (id=${activeCheckpoint?.id ?? "n/a"})`,
  ];

  story.checkpoints.forEach((checkpoint, index) => {
    const pointer = index === runtime.checkpointIndex ? ">" : " ";
    const marker = STATUS_ICONS[statuses[index] ?? CheckpointStatus.Pending] ?? "?";
    lines.push(`${pointer} ${index + 1}. ${marker} ${checkpoint.name ?? "(Unnamed)"} (id=${checkpoint.id})`);
  });

  return lines.join("\n");
}

function formatActivationMessage(): string {
  const { story, runtime } = storySessionStore.getState();
  if (!story) return "[checkpoint] No story loaded";
  const checkpoint = story.checkpoints[runtime.checkpointIndex];
  return `[checkpoint] Activated ${runtime.checkpointIndex + 1}/${story.checkpoints.length}: ${checkpoint?.name ?? "Unknown"} (id=${checkpoint?.id ?? "n/a"})`;
}
