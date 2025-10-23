import React from "react";
import type { SlashCommandMeta, AutomationDraftLine } from "../types";

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
  const slashCommandLookup = React.useMemo(() => {
    const map = new Map<string, SlashCommandMeta>();
    slashCommands.forEach((cmd) => {
      map.set(cmd.name.toLowerCase(), cmd);
      cmd.aliases.forEach((alias) => {
        map.set(alias.toLowerCase(), cmd);
      });
    });
    return map;
  }, [slashCommands]);

  const automationValidation = React.useMemo<AutomationDraftLine[]>(() => {
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

  const filteredCommands = React.useMemo(() => {
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
        <div className="font-medium">Automations</div>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
          onClick={onReloadCommands}
        >
          Reload Commands
        </button>
      </div>
      <label className="flex flex-col gap-1 text-xs text-slate-300">
        <span>Search Commands</span>
        <input
          className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
          value={commandSearch}
          onChange={(e) => onCommandSearchChange(e.target.value)}
          placeholder="Type to filter /command names..."
        />
      </label>
      {slashCommandError ? (
        <div className="text-xs text-red-300">{slashCommandError}</div>
      ) : (
        <>
          <div className="text-xs text-slate-400">
            Commands run when this checkpoint activates. Leading slash required; duplicates are ignored.
          </div>
          <div className="max-h-48 overflow-y-auto rounded border border-slate-700 bg-slate-900/40 divide-y divide-slate-800">
            {filteredCommands.length ? filteredCommands.map((cmd) => (
              <div key={cmd.name} className="p-2 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-200">
                    <span className="font-medium">/{cmd.name}</span>
                    {cmd.aliases.length ? (
                      <span className="ml-2 text-slate-400">
                        ({cmd.aliases.join(", ")})
                      </span>
                    ) : null}
                    {cmd.description ? (
                      <div className="text-[11px] text-slate-400 mt-0.5">{cmd.description}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-600"
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
                        className="inline-flex items-center justify-center rounded border border-slate-800 bg-slate-800/70 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-600"
                        onClick={() => onInsertAutomationLine(sample)}
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )) : (
              <div className="p-2 text-xs text-slate-500">No commands match the current search.</div>
            )}
          </div>
        </>
      )}
      <textarea
        className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
        rows={6}
        value={automationDraft}
        onChange={(e) => onAutomationDraftChange(e.target.value)}
        placeholder={`/member-disable <member_id> \n/member-enable <member_id>\n/bg tavern day\n...`}
      />
      {automationValidation.length ? (
        <div className="space-y-1">
          {automationValidation.map((entry, idx) => (
            entry.status === "blank" ? null : (
              <div
                key={`${entry.line}-${idx}`}
                className={`text-xs ${entry.status === "ok" ? "text-emerald-300" : "text-red-300"}`}
              >
                {entry.status === "ok" ? "OK" : "Issue"}: {entry.trimmed}
                {entry.message ? `  E${entry.message}` : null}
              </div>
            )
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default AutomationsTab;
