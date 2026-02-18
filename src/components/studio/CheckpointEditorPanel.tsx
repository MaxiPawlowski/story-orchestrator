import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ARBITER_ROLE_KEY } from "@utils/story-schema";
import {
  CheckpointDraft,
  StoryDraft,
  cleanupOnActivate,
  ensureOnActivate,
} from "@utils/checkpoint-studio";
import type { TransitionDraft } from "@utils/checkpoint-studio";
import { useSlashCommands } from "./checkpointEditor/useSlashCommands";
import type { PresetDraftState } from "./checkpointEditor/types";
import { stringifyPresetValue } from "./checkpointEditor/presetUtils";
import BasicsTab from "./checkpointEditor/tabs/BasicsTab";
import WorldInfoTab from "./checkpointEditor/tabs/WorldInfoTab";
import AutomationsTab from "./checkpointEditor/tabs/AutomationsTab";
import AuthorNotesTab from "./checkpointEditor/tabs/AuthorNotesTab";
import PresetOverridesTab from "./checkpointEditor/tabs/PresetOverridesTab";
import TalkControlTab from "./checkpointEditor/tabs/TalkControlTab";
import TransitionsTab from "./checkpointEditor/tabs/TransitionsTab";

type Props = {
  draft: StoryDraft;
  selectedCheckpoint: CheckpointDraft | undefined;
  outgoingTransitions: TransitionDraft[];
  onCheckpointIdChange: (id: string, value: string) => void;
  updateCheckpoint: (id: string, updater: (cp: CheckpointDraft) => CheckpointDraft) => void;
  onAddTransition: (fromId: string) => void;
  onRemoveTransition: (transitionId: string) => void;
  updateTransition: (transitionId: string, patch: Partial<TransitionDraft>) => void;
  onRemoveCheckpoint: (id: string) => void;
  setDraft: React.Dispatch<React.SetStateAction<StoryDraft>>;
};

type TabKey =
  | "basics"
  | "worldinfo"
  | "automations"
  | "notes"
  | "presets"
  | "transitions"
  | "talkControl";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "basics", label: "Basics" },
  { key: "worldinfo", label: "World Info" },
  { key: "automations", label: "Automations" },
  { key: "notes", label: "Author Notes" },
  { key: "presets", label: "Preset Overrides" },
  { key: "transitions", label: "Transitions" },
  { key: "talkControl", label: "Talk Control" },
];

const parseAutomationInput = (value: string): string[] => {
  const lines = value.split(/\r?\n/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
};

const CheckpointEditorPanel: React.FC<Props> = ({
  draft,
  selectedCheckpoint,
  outgoingTransitions,
  onCheckpointIdChange,
  updateCheckpoint,
  onAddTransition,
  onRemoveTransition,
  updateTransition,
  onRemoveCheckpoint,
  setDraft,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>("basics");
  const [presetDrafts, setPresetDrafts] = useState<PresetDraftState>({});
  const [automationDraft, setAutomationDraft] = useState("");
  const [commandSearch, setCommandSearch] = useState("");
  const [referenceSearch, setReferenceSearch] = useState("");
  const {
    commands: slashCommands,
    projectCommands,
    error: slashCommandError,
    refresh: refreshSlashCommands,
  } = useSlashCommands();

  useEffect(() => {
    if (!selectedCheckpoint) {
      setAutomationDraft("");
      return;
    }
    const joined = (selectedCheckpoint.on_activate?.automations ?? []).join("\n");
    setAutomationDraft(joined);
  }, [selectedCheckpoint?.id]);

  const overridesSignature = useMemo(() => {
    if (!selectedCheckpoint) return "";
    try {
      return JSON.stringify({
        preset_overrides: selectedCheckpoint.on_activate?.preset_overrides ?? {},
        arbiter_preset: selectedCheckpoint.on_activate?.arbiter_preset ?? null,
      });
    } catch {
      return `${selectedCheckpoint.id ?? ""}-preset-overrides`;
    }
  }, [selectedCheckpoint?.id, selectedCheckpoint?.on_activate?.preset_overrides, selectedCheckpoint?.on_activate?.arbiter_preset]);

  useEffect(() => {
    if (!selectedCheckpoint) {
      setPresetDrafts({});
      return;
    }
    const overrides = selectedCheckpoint.on_activate?.preset_overrides ?? {};
    const arbiterPreset = selectedCheckpoint.on_activate?.arbiter_preset ?? null;
    const next: PresetDraftState = {};
    Object.entries(overrides).forEach(([roleKey, entries]) => {
      next[roleKey] = {};
      Object.entries(entries ?? {}).forEach(([settingKey, value]) => {
        next[roleKey][settingKey] = stringifyPresetValue(value);
      });
    });
    if (arbiterPreset) {
      next[ARBITER_ROLE_KEY] = {};
      Object.entries(arbiterPreset).forEach(([settingKey, value]) => {
        next[ARBITER_ROLE_KEY][settingKey] = stringifyPresetValue(value);
      });
    }
    setPresetDrafts(next);
  }, [selectedCheckpoint?.id, overridesSignature]);

  const updateAutomationsForCheckpoint = useCallback((rawText: string) => {
    if (!selectedCheckpoint) return;
    const parsed = parseAutomationInput(rawText);
    updateCheckpoint(selectedCheckpoint.id, (cp) => {
      const next = ensureOnActivate(cp.on_activate);
      next.automations = parsed;
      return { ...cp, on_activate: cleanupOnActivate(next) };
    });
  }, [selectedCheckpoint, updateCheckpoint]);

  const handleAutomationDraftChange = useCallback((value: string) => {
    setAutomationDraft(value);
    updateAutomationsForCheckpoint(value);
  }, [updateAutomationsForCheckpoint]);

  const handleInsertAutomationLine = useCallback((command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;
    setAutomationDraft((prev) => {
      const lines = prev.split(/\r?\n/);
      if (lines.some((line) => line.trim() === trimmed)) return prev;
      const base = prev.replace(/\s+$/u, "");
      const nextText = base ? `${base}\n${trimmed}` : trimmed;
      updateAutomationsForCheckpoint(nextText);
      return nextText;
    });
  }, [updateAutomationsForCheckpoint]);

  return (
    <div className="st-panel shadow-sm">
      <div className="st-panel-header flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="font-semibold shrink-0">Checkpoint Editor</div>
          {selectedCheckpoint ? (
            <div className="max-w-[420px] truncate text-xs opacity-70">{selectedCheckpoint.name || selectedCheckpoint.id}</div>
          ) : null}
        </div>
        {selectedCheckpoint ? (
          <button
            type="button"
            className="st-button danger"
            onClick={() => onRemoveCheckpoint(selectedCheckpoint.id)}
          >
            Remove
          </button>
        ) : null}
      </div>

      <div className="st-panel-header st-bg-tint sticky top-0 z-[1] px-3 pt-2">
        <div className="inline-flex rounded-sm shadow-sm">
          {TABS.map((tab, index) => {
            const isFirst = index === 0;
            const isLast = index === TABS.length - 1;
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "st-tab px-1.5 py-2 text-xs transition-colors focus:z-10",
                  isFirst ? "rounded-l-sm" : "-ml-px",
                  isLast ? "rounded-r-sm" : "",
                  isActive ? "st-tab-active" : ""
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>


      <div className="flex flex-col gap-4 p-3">
        {!selectedCheckpoint ? (
          <div className="text-xs st-muted">Select a checkpoint to edit.</div>
        ) : (
          <>
            {activeTab === "basics" && (
              <BasicsTab
                draft={draft}
                checkpoint={selectedCheckpoint}
                referenceQuery={referenceSearch}
                onReferenceQueryChange={setReferenceSearch}
                projectSlashCommands={projectCommands}
                onCheckpointIdChange={onCheckpointIdChange}
                updateCheckpoint={updateCheckpoint}
              />
            )}

            {activeTab === "worldinfo" && (
              <WorldInfoTab
                draft={draft}
                checkpoint={selectedCheckpoint}
                updateCheckpoint={updateCheckpoint}
              />
            )}

            {activeTab === "automations" && (
              <AutomationsTab
                automationDraft={automationDraft}
                commandSearch={commandSearch}
                onCommandSearchChange={setCommandSearch}
                slashCommands={slashCommands}
                slashCommandError={slashCommandError}
                onReloadCommands={refreshSlashCommands}
                onAutomationDraftChange={handleAutomationDraftChange}
                onInsertAutomationLine={handleInsertAutomationLine}
              />
            )}

            {activeTab === "notes" && (
              <AuthorNotesTab
                draft={draft}
                checkpoint={selectedCheckpoint}
                updateCheckpoint={updateCheckpoint}
              />
            )}

            {activeTab === "presets" && (
              <PresetOverridesTab
                draft={draft}
                checkpoint={selectedCheckpoint}
                presetDrafts={presetDrafts}
                setPresetDrafts={setPresetDrafts}
                updateCheckpoint={updateCheckpoint}
              />
            )}

            {activeTab === "talkControl" && (
              <TalkControlTab
                draft={draft}
                checkpoint={selectedCheckpoint}
                setDraft={setDraft}
              />
            )}

            {activeTab === "transitions" && (
              <TransitionsTab
                draft={draft}
                checkpoint={selectedCheckpoint}
                outgoingTransitions={outgoingTransitions}
                onAddTransition={onAddTransition}
                onRemoveTransition={onRemoveTransition}
                updateTransition={updateTransition}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CheckpointEditorPanel;
