import React, { useMemo } from "react";
import type { SlashCommandMeta, AutomationDraftLine } from "../types";
import HelpTooltip from "../../HelpTooltip";

type Props = {
  automationDraft: string;
  commandSearch: string;
  onCommandSearchChange: (value: string) => void;
  slashCommands: SlashCommandMeta[];
  slashCommandError: string | null;
  onReloadCommands: () => void;
  onAutomationDraftChange: (value: string) => void;
  onInsertAutomationLine: (command: string) => void;
};

const AutomationsTab: React.FC<Props> = ({
  automationDraft,
  commandSearch,
  onCommandSearchChange,
  slashCommands,
  slashCommandError,
  onReloadCommands,
  onAutomationDraftChange,
  onInsertAutomationLine,
}) => {
  const slashCommandLookup = useMemo(() => {
    const map = new Map<string, SlashCommandMeta>();
    slashCommands.forEach((cmd) => {
      map.set(cmd.name.toLowerCase(), cmd);
      cmd.aliases.forEach((alias) => {
        map.set(alias.toLowerCase(), cmd);
      });
    });
    return map;
  }, [slashCommands]);

  const automationValidation = useMemo<AutomationDraftLine[]>(() => {
    const lines = automationDraft.split(/\r?\n/);
    const seen = new Map<string, number>();
    return lines.map((rawLine, index) => {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        return { line: rawLine, trimmed, status: "blank" as const, message: "" };
      }

      let status: AutomationDraftLine["status"] = "ok";
      let message: string | undefined;

      if (!trimmed.startsWith("/")) {
        status = "error";
        message = "Slash commands must start with '/'.";
      } else {
        const match = trimmed.slice(1).match(/^([^\s]+)/);
        const commandName = match ? match[1].toLowerCase() : "";
        if (!commandName) {
          status = "error";
          message = "Missing command name.";
        } else {
          const commandMeta = slashCommandLookup.get(commandName);
          if (!commandMeta) {
            status = "error";
            message = `Unknown command '${commandName}'.`;
          } else if (commandMeta.description) {
            message = `Recognized /${commandMeta.name}`;
          }
        }
      }

      const duplicateOf = seen.get(trimmed);
      if (status === "ok" && duplicateOf !== undefined) {
        status = "error";
        message = `Duplicate of line ${duplicateOf + 1}.`;
      } else if (status === "ok") {
        seen.set(trimmed, index);
      }

      return { line: rawLine, trimmed, status, message };
    });
  }, [automationDraft, slashCommandLookup]);

  const filteredCommands = useMemo(() => {
    const query = commandSearch.trim().toLowerCase();
    if (!query) {
      return slashCommands.slice(0, 12);
    }
    return slashCommands
      .filter((cmd) => {
        if (cmd.name.toLowerCase().includes(query)) return true;
        if (cmd.aliases.some((alias) => alias.toLowerCase().includes(query))) return true;
        if (cmd.description && cmd.description.toLowerCase().includes(query)) return true;
        return false;
      })
      .slice(0, 12);
  }, [slashCommands, commandSearch]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 font-medium st-strong">
          Automations
          <HelpTooltip title="Queue slash commands that fire immediately when the checkpoint activates." />
        </div>
        <button
          type="button"
          className="st-button secondary px-2"
          onClick={onReloadCommands}
        >
          Reload Commands
        </button>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="inline-flex items-center gap-1">
          Search Commands
          <HelpTooltip title="Look up slash commands and insert them with one click." />
        </span>
        <input
          className="text_pole st-input w-full"
          value={commandSearch}
          onChange={(e) => onCommandSearchChange(e.target.value)}
          placeholder="Type to filter /command names..."
        />
      </label>
      {slashCommandError ? (
        <div className="text-xs st-text-error">{slashCommandError}</div>
      ) : (
        <>
          <div className="text-xs st-muted">
            Commands run when this checkpoint activates. Leading slash required; duplicates are ignored.
          </div>
          <div className="max-h-48 overflow-y-auto rounded border st-border st-bg-tint divide-y st-divider">
            {filteredCommands.length ? filteredCommands.map((cmd) => (
              <div key={cmd.name} className="p-2 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs st-strong">
                    <span className="font-medium">/{cmd.name}</span>
                    {cmd.aliases.length ? (
                      <span className="ml-2 st-muted">
                        ({cmd.aliases.join(", ")})
                      </span>
                    ) : null}
                    {cmd.description ? (
                      <div className="text-[11px] st-muted mt-0.5">{cmd.description}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="st-button secondary px-2 py-1 text-[11px]"
                      onClick={() => onInsertAutomationLine(`/${cmd.name}`)}
                    >
                      Insert /{cmd.name}
                    </button>
                  </div>
                </div>
                {cmd.samples?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {cmd.samples.slice(0, 4).map((sample) => (
                      <button
                        key={`${cmd.name}-${sample}`}
                        type="button"
                        className="st-button secondary px-2 py-1 text-[11px]"
                        onClick={() => onInsertAutomationLine(sample)}
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )) : (
              <div className="p-2 text-xs st-muted-weak">No commands match the current search.</div>
            )}
          </div>
        </>
      )}
      <div className="flex items-center gap-1 text-xs">
        <span>Automation Script</span>
        <HelpTooltip title="One command per line. Executed in order after presets, author notes, and world info apply." />
      </div>
      <textarea
        className="text_pole textarea_compact st-input w-full resize-y"
        rows={6}
        value={automationDraft}
        onChange={(e) => onAutomationDraftChange(e.target.value)}
        placeholder={`/member-disable {{story_role_companion}} \n/member-enable {{story_role_companion}}\n/bg tavern day\n...`}
      />
      {automationValidation.length ? (
        <div className="space-y-1">
          {automationValidation.map((entry, idx) => (
            entry.status === "blank" ? null : (
              <div
                key={`${entry.line}-${idx}`}
                className={`text-xs ${entry.status === "ok" ? "st-strong" : "st-text-error"}`}
              >
                {entry.status === "ok" ? "OK" : "Issue"}: {entry.trimmed}
                {entry.message ? ` - ${entry.message}` : null}
              </div>
            )
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default AutomationsTab;
