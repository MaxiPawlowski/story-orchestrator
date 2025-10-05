import { storySessionStore } from "@store/storySessionStore";
import { getOrchestrator } from "@controllers/orchestratorManager";
import { getContext } from "@services/SillyTavernAPI";

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

  const help = `<div>Activate a story checkpoint (index is 1-based).</div>
<pre><code class="language-stscript">/checkpoint 2\n/checkpoint id=finale\n/cp intro</code></pre>`;

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
  const { story } = storySessionStore.getState();
  if (!story) return '[checkpoint] No story loaded';
  const orch = getOrchestrator();
  if (!orch) return '[checkpoint] Orchestrator not ready';

  const tokenRaw = named.id ?? named.cp ?? named.checkpoint ?? unnamed;
  const token = tokenRaw == null ? '' : String(tokenRaw).trim();
  if (!token) return '[checkpoint] Provide an index or id';

  const asNum = Number.parseInt(token, 10);
  let idx = Number.isFinite(asNum) && asNum >= 1 ? asNum - 1 : -1;
  if (idx < 0) idx = story.checkpoints.findIndex(c => String(c.id) === token);
  if (idx < 0 || idx >= story.checkpoints.length) return `[checkpoint] Not found: ${token}`;

  try { orch.activateIndex(idx); } catch (e) { return `[checkpoint] Failed: ${(e as any)?.message || e}`; }
  const cp = story.checkpoints[idx];
  return `[checkpoint] Activated ${idx + 1}/${story.checkpoints.length}: ${cp.name} (id=${cp.id})`;
}
