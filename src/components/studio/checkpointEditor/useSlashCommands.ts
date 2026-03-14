import { useCallback, useEffect, useMemo, useState } from "react";
import { listSlashCommands } from "@services/STAPI";
import { SlashCommandMeta } from "./types";

const STORY_COMMAND_TAG_ATTR = 'data-story-orchestrator="1"';

const parseHelp = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    return { description: undefined, samples: [] as string[], isStoryOrchestrator: false };
  }
  const isStoryOrchestrator = value.includes(STORY_COMMAND_TAG_ATTR);
  const descMatch = value.match(/<div[^>]*>([\s\S]*?)<\/div>/i);
  const description = descMatch ? descMatch[1].replace(/\s+/g, " ").trim() : undefined;
  const codeMatch = value.match(/<code[^>]*>([\s\S]*?)<\/code>/i);
  const samples = codeMatch
    ? codeMatch[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    : [];
  return { description, samples, isStoryOrchestrator };
};

export const useSlashCommands = () => {
  const [commands, setCommands] = useState<SlashCommandMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    try {
      setCommands(listSlashCommands().map(({ name, aliases, helpString }): SlashCommandMeta => {
        const help = parseHelp(helpString);
        return {
          name,
          aliases,
          description: help.description,
          samples: help.samples,
          isStoryOrchestrator: help.isStoryOrchestrator,
        };
      }));
      setError(null);
    } catch (err) {
      console.warn("[Story - CheckpointEditor] Failed to read slash commands", err);
      setCommands([]);
      setError("Unable to read slash commands from host.");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const projectCommands = useMemo(
    () => commands.filter((cmd) => cmd.isStoryOrchestrator),
    [commands],
  );

  return { commands, projectCommands, error, refresh };
};

export type UseSlashCommandsReturn = ReturnType<typeof useSlashCommands>;
