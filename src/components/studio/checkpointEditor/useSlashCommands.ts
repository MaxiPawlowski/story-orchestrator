import React from "react";
import { getContext } from "@services/SillyTavernAPI";
import { SlashCommandMeta } from "./types";

const STORY_COMMAND_TAG_ATTR = 'data-story-driver="1"';

const parseHelp = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    return { description: undefined, samples: [] as string[], isStoryDriver: false };
  }
  const isStoryDriver = value.includes(STORY_COMMAND_TAG_ATTR);
  const descMatch = value.match(/<div[^>]*>([\s\S]*?)<\/div>/i);
  const description = descMatch ? descMatch[1].replace(/\s+/g, " ").trim() : undefined;
  const codeMatch = value.match(/<code[^>]*>([\s\S]*?)<\/code>/i);
  const samples = codeMatch
    ? codeMatch[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    : [];
  return { description, samples, isStoryDriver };
};

export const useSlashCommands = () => {
  const [commands, setCommands] = React.useState<SlashCommandMeta[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    try {
      const ctx = getContext();
      const parser = (ctx as any)?.SlashCommandParser;
      const commandsRaw = parser?.commands ?? {};
      const entries: SlashCommandMeta[] = [];

      Object.entries(commandsRaw).forEach(([name, raw]) => {
        if (!name) return;
        const aliases = Array.isArray((raw as any)?.aliases)
          ? (raw as any).aliases.filter((alias: unknown) => typeof alias === "string" && alias.trim())
          : [];
        const help = parseHelp((raw as any)?.helpString);
        entries.push({
          name,
          aliases,
          description: help.description,
          samples: help.samples,
          isStoryDriver: help.isStoryDriver,
        });
      });
      setCommands(entries);
      setError(null);
    } catch (err) {
      console.warn("[CheckpointEditor] Failed to read slash commands", err);
      setCommands([]);
      setError("Unable to read slash commands from host.");
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const projectCommands = React.useMemo(
    () => commands.filter((cmd) => cmd.isStoryDriver),
    [commands],
  );

  return { commands, projectCommands, error, refresh };
};

export type UseSlashCommandsReturn = ReturnType<typeof useSlashCommands>;

