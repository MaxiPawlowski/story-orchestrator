import React from "react";
import type { CheckpointDraft, StoryDraft } from "@utils/checkpoint-studio";
import type { SlashCommandMeta, MacroDisplayEntry } from "../types";
import { STORY_MACRO_BASE_ENTRIES } from "../types";
import HelpTooltip from "../../HelpTooltip";

type Props = {
  draft: StoryDraft;
  checkpoint: CheckpointDraft;
  referenceQuery: string;
  onReferenceQueryChange: (value: string) => void;
  slashCommands: SlashCommandMeta[];
  projectSlashCommands: SlashCommandMeta[];
  onCheckpointIdChange: (checkpointId: string, nextId: string) => void;
  updateCheckpoint: (id: string, updater: (cp: CheckpointDraft) => CheckpointDraft) => void;
};

const BasicsTab: React.FC<Props> = ({
  draft,
  checkpoint,
  referenceQuery,
  onReferenceQueryChange,
  slashCommands,
  projectSlashCommands,
  onCheckpointIdChange,
  updateCheckpoint,
}) => {
  const macroEntries = React.useMemo(() => {
    const entries = new Map<string, MacroDisplayEntry>();
    STORY_MACRO_BASE_ENTRIES.forEach((entry) => {
      entries.set(entry.key, { ...entry });
    });

    const roles = draft.roles && typeof draft.roles === "object" ? draft.roles : undefined;
    if (roles) {
      Object.entries(roles).forEach(([roleKey, roleLabelRaw]) => {
        if (!roleKey) return;
        const lower = roleKey.toLowerCase();
        if (!lower) return;
        const roleLabel = typeof roleLabelRaw === "string" && roleLabelRaw.trim() ? roleLabelRaw.trim() : roleKey;
        entries.set(`story_role_${lower}`, {
          key: `story_role_${lower}`,
          description: `Story role name for ${roleLabel}`,
          category: "Role",
          detail: `Role id: ${roleKey}`,
        });
      });
    }

    const dmLabelRaw = roles && Object.prototype.hasOwnProperty.call(roles, "dm") ? (roles as Record<string, unknown>)["dm"] : undefined;
    const dmLabel = typeof dmLabelRaw === "string" && dmLabelRaw.trim() ? dmLabelRaw.trim() : "DM";
    entries.set("story_role_dm", {
      key: "story_role_dm",
      description: `Story DM role name (${dmLabel})`,
      category: "Role",
    });

    const companionLabelRaw = roles && Object.prototype.hasOwnProperty.call(roles, "companion") ? (roles as Record<string, unknown>)["companion"] : undefined;
    const companionLabel = typeof companionLabelRaw === "string" && companionLabelRaw.trim() ? companionLabelRaw.trim() : "Companion";
    entries.set("story_role_companion", {
      key: "story_role_companion",
      description: `Story companion role name (${companionLabel})`,
      category: "Role",
    });

    return Array.from(entries.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [draft.roles]);

  const normalizedReferenceQuery = referenceQuery.trim().toLowerCase();

  const filteredReferenceCommands = React.useMemo(() => {
    if (!normalizedReferenceQuery) return projectSlashCommands;
    return projectSlashCommands.filter((cmd) => {
      const lowerName = cmd.name.toLowerCase();
      if (lowerName.includes(normalizedReferenceQuery)) return true;
      if (cmd.aliases.some((alias) => alias.toLowerCase().includes(normalizedReferenceQuery))) return true;
      if (cmd.description && cmd.description.toLowerCase().includes(normalizedReferenceQuery)) return true;
      if (cmd.samples.some((sample) => sample.toLowerCase().includes(normalizedReferenceQuery))) return true;
      return false;
    });
  }, [projectSlashCommands, normalizedReferenceQuery]);

  const filteredMacroEntries = React.useMemo(() => {
    if (!normalizedReferenceQuery) return macroEntries;
    return macroEntries.filter((entry) => {
      if (entry.key.toLowerCase().includes(normalizedReferenceQuery)) return true;
      if (entry.description.toLowerCase().includes(normalizedReferenceQuery)) return true;
      if (entry.detail && entry.detail.toLowerCase().includes(normalizedReferenceQuery)) return true;
      return false;
    });
  }, [macroEntries, normalizedReferenceQuery]);

  return (
    <>
      <label className="flex flex-col gap-1 text-xs text-slate-300">
        <span className="inline-flex items-center gap-1">
          Checkpoint Id
          <HelpTooltip title="Stable identifier referenced by transitions and persistence snapshots." />
        </span>
        <input
          className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
          value={checkpoint.id}
          onChange={(e) => onCheckpointIdChange(checkpoint.id, e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-300">
        <span className="inline-flex items-center gap-1">
          Name
          <HelpTooltip title="Friendly label shown in the Studio UI." />
        </span>
        <input
          className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
          value={checkpoint.name}
          onChange={(e) => updateCheckpoint(checkpoint.id, (cp) => ({ ...cp, name: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-300">
        <span className="inline-flex items-center gap-1">
          Objective
          <HelpTooltip title="Explain the scene goal so the Player knows what to expect." />
        </span>
        <textarea
          className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
          rows={3}
          value={checkpoint.objective}
          onChange={(e) => updateCheckpoint(checkpoint.id, (cp) => ({ ...cp, objective: e.target.value }))}
        />
      </label>
      <div className="space-y-3">
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1">
            Search Commands &amp; Macros
            <HelpTooltip title="Filter Story Orchestrator slash commands and macro references without leaving the editor." />
          </span>
          <input
            className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
            value={referenceQuery}
            onChange={(e) => onReferenceQueryChange(e.target.value)}
            placeholder="Type to filter /commands and {{macros}}..."
          />
        </label>
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="font-medium">Story Orchestrator Slash Commands {' '}
              <HelpTooltip title="Read-only reference for commands registered by this extension." />
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/40 divide-y divide-slate-800">
              {filteredReferenceCommands.length ? filteredReferenceCommands.map((cmd) => (
                <div key={cmd.name} className="space-y-1 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-100">/{cmd.name}</div>
                    {cmd.aliases.length ? (
                      <div className="text-[11px] text-slate-400">Aliases: {cmd.aliases.join(", ")}</div>
                    ) : null}
                  </div>
                  {cmd.description ? (
                    <div className="text-xs text-slate-300">{cmd.description}</div>
                  ) : null}
                  {cmd.samples?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {cmd.samples.slice(0, 3).map((sample) => (
                        <span key={`${cmd.name}-${sample}`} className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200">
                          {sample}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )) : (
                <div className="p-2 text-xs text-slate-500">
                  {projectSlashCommands.length
                    ? "No commands match the current search."
                    : "No Story Orchestrator commands detected."}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="font-medium">
              Story Orchestrator Macros {' '}
              <HelpTooltip title="Macros resolve at runtime; role entries update with the active story cast." />
            </div>

            <div className="rounded border border-slate-700 bg-slate-900/40 divide-y divide-slate-800">
              {filteredMacroEntries.length ? filteredMacroEntries.map((entry) => (
                <div key={entry.key} className="space-y-1 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-xs text-slate-200">{`{{${entry.key}}}`}</div>
                    <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                      {entry.category}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300">{entry.description}</div>
                  {entry.detail ? (
                    <div className="text-[11px] text-slate-500">{entry.detail}</div>
                  ) : null}
                </div>
              )) : (
                <div className="p-2 text-xs text-slate-500">
                  {macroEntries.length
                    ? "No macros match the current search."
                    : "No Story Orchestrator macros available."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default BasicsTab;
