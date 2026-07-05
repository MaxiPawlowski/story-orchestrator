import { getContext } from "@services/STAPI";
import type { RuntimeManager } from "./runtimeManager";
import { renderBlackboardMemo } from "./blackboardMemo";

type SlashArgs = Record<string, unknown>;
type SlashCommandFactory = { fromProps: (props: Record<string, unknown>) => unknown };
type SlashCommandParserHost = { addCommandObject: (command: unknown) => void; commands?: Record<string, unknown> };
type SlashArgumentFactory = { fromProps: (props: Record<string, unknown>) => unknown };
type SlashArgumentTypes = { STRING: unknown };

const isObjectLike = (value: unknown) => value !== null && (typeof value === "object" || typeof value === "function");
const hasSlashCommandFactory = (value: unknown): value is SlashCommandFactory => isObjectLike(value) && typeof (value as SlashCommandFactory).fromProps === "function";
const hasSlashCommandParser = (value: unknown): value is SlashCommandParserHost => isObjectLike(value) && typeof (value as SlashCommandParserHost).addCommandObject === "function";
const hasSlashArgumentFactory = (value: unknown): value is SlashArgumentFactory => isObjectLike(value) && typeof (value as SlashArgumentFactory).fromProps === "function";
const hasSlashArgumentTypes = (value: unknown): value is SlashArgumentTypes => value !== null && typeof value === "object" && "STRING" in value;

const show = (message: string) => {
  window.toastr?.info?.(message, "Story Orchestrator");
  return message;
};

export function registerSlashCommands(manager: RuntimeManager): boolean {
  const context = getContext();
  const parser = context.SlashCommandParser;
  const slashCommand = context.SlashCommand;
  const slashArgument = context.SlashCommandArgument;
  if (!hasSlashCommandParser(parser) || !hasSlashCommandFactory(slashCommand)) return false;
  const unnamedArgumentList = hasSlashArgumentFactory(slashArgument) && hasSlashArgumentTypes(context.ARGUMENT_TYPE) ? [slashArgument.fromProps({
    description: "Story Orchestrator command",
    typeList: [context.ARGUMENT_TYPE.STRING],
    isRequired: false,
    acceptsMultiple: true,
  })] : [];

  parser.addCommandObject(slashCommand.fromProps({
    name: "cp",
    aliases: ["checkpoint"],
    rawQuotes: true,
    unnamedArgumentList,
    callback: async (_args: SlashArgs, value: string | string[]) => {
      const raw = Array.isArray(value) ? value.join(" ") : String(value ?? "");
      const parts = raw.trim().split(/\s+/).filter(Boolean);
      const command = parts[0] ?? "list";
      if (command === "list") {
        const snapshot = manager.getSnapshot();
        return show(snapshot.checkpoints.map((checkpoint) => `${checkpoint.active ? "●" : checkpoint.visited ? "✔" : "○"} ${checkpoint.id} ${checkpoint.name}`).join("\n") || "No story loaded");
      }
      if (command === "state") {
        return show(renderBlackboardMemo(manager.getSnapshot()));
      }
      if (command === "activate") {
        const id = parts[1];
        if (!id) return show("Usage: /cp activate <id>");
        await manager.activateCheckpoint(id);
        return show(manager.getSnapshot().status);
      }
      if (command === "set") {
        const key = parts[1];
        const raw = parts.slice(2).join(" ");
        if (!key || !raw) return show("Usage: /cp set <quality> <value>");
        await manager.setQuality(key, raw);
        return show(manager.getSnapshot().status);
      }
      if (command === "extract") {
        const response = parts.slice(1).join(" ");
        await manager.runExtractionNow(response || undefined);
        return show(manager.getSnapshot().status);
      }
      if (command === "expand") {
        const response = parts.slice(1).join(" ");
        await manager.runExpansionNow(response || undefined);
        return show(manager.getSnapshot().status);
      }
      return show("Commands: /cp list, /cp state, /cp activate <id>, /cp set <quality> <value>, /cp extract [response], /cp expand [response]");
    },
    helpString: "Story Orchestrator v2 commands: list, state, activate <id>, set <quality> <value>, extract [response], expand [response]",
  }));
  return Boolean(parser.commands?.cp);
}
