import React from "react";
import type { TalkControlDraft } from "@utils/checkpoint-studio";

type NumberKey = "cooldownTurns" | "maxPerTurn" | "maxCharsPerAuto";
type FlagKey = "sendAsQuiet" | "forceSpeaker";

type Props = {
  talkControl: TalkControlDraft | undefined;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onNumberChange: (key: NumberKey, raw: string) => void;
  onFlagChange: (key: FlagKey, value: string) => void;
  onClearDefaults: () => void;
};

const TalkControlDefaultsSection: React.FC<Props> = ({
  talkControl,
  enabled,
  onToggle,
  onNumberChange,
  onFlagChange,
  onClearDefaults,
}) => (
  <div className="rounded-lg border border-slate-800 bg-[var(--SmartThemeBlurTintColor)] shadow-sm">
    <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 font-semibold">Talk Control</div>
    <div className="flex flex-col gap-3 p-3">
      <label className="inline-flex items-center gap-2 text-xs text-slate-300">
        <input
          type="checkbox"
          className="rounded border-slate-600 bg-slate-900 text-slate-200 focus:ring-slate-600"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>Enable talk-control automation for this story</span>
      </label>
      <div className="text-[11px] text-slate-400">
        Story-level defaults are optional. Leave fields blank to let checkpoint members define their own behaviour.
      </div>
      {talkControl ? (
        <div className="space-y-3 rounded border border-slate-800 bg-slate-900/40 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium text-slate-200">Story Default Overrides</div>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-red-300 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
              onClick={onClearDefaults}
              disabled={!talkControl.defaults || !Object.keys(talkControl.defaults).length}
            >
              Clear Defaults
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              <span>Cooldown Turns (fallback)</span>
              <input
                type="number"
                min={0}
                className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                value={talkControl.defaults?.cooldownTurns ?? ""}
                onChange={(e) => onNumberChange("cooldownTurns", e.target.value)}
                placeholder="Unset"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              <span>Max Plays per Turn</span>
              <input
                type="number"
                min={1}
                className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                value={talkControl.defaults?.maxPerTurn ?? ""}
                onChange={(e) => onNumberChange("maxPerTurn", e.target.value)}
                placeholder="Unset"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              <span>Max Characters / Auto Reply</span>
              <input
                type="number"
                min={1}
                className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                value={talkControl.defaults?.maxCharsPerAuto ?? ""}
                onChange={(e) => onNumberChange("maxCharsPerAuto", e.target.value)}
                placeholder="Unset"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              <span>Send as Quiet</span>
              <select
                className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                value={talkControl.defaults?.sendAsQuiet === undefined ? "" : talkControl.defaults.sendAsQuiet ? "true" : "false"}
                onChange={(e) => onFlagChange("sendAsQuiet", e.target.value)}
              >
                <option value="">Unset (per member)</option>
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              <span>Force Speaker</span>
              <select
                className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                value={talkControl.defaults?.forceSpeaker === undefined ? "" : talkControl.defaults.forceSpeaker ? "true" : "false"}
                onChange={(e) => onFlagChange("forceSpeaker", e.target.value)}
              >
                <option value="">Unset (per member)</option>
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}
    </div>
  </div>
);

export default TalkControlDefaultsSection;

