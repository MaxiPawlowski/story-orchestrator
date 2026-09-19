import { useState } from "react";
import { BUILT_JUDGE_USES, JUDGE_USE_COPY, JUDGE_USE_DEPENDENCIES, type JudgeSelfTestReport, type JudgeSettings, type JudgeUseKey, type JudgeUses } from "@judge/index";
import type { JudgeStatus } from "@services/STAPI";
import HelpTooltip from "@components/studio/HelpTooltip";

export interface JudgeSettingsPatch {
  enabled?: boolean;
  uses?: Partial<JudgeUses>;
}

export interface JudgeSettingsGroupProps {
  settings: JudgeSettings;
  status: JudgeStatus | null | "checking" | "unchecked";
  selfTest: { running: boolean; report: JudgeSelfTestReport | null };
  builtUses?: readonly JudgeUseKey[];
  onChange(patch: JudgeSettingsPatch): void;
  onSaveKey(value: string): Promise<boolean>;
  onRefresh(): void;
  onRunSelfTest(): void;
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const statusText = (status: JudgeSettingsGroupProps["status"]): string => {
  if (status === "unchecked") return "Off. Turn it on, or press Recheck, to look for the server plugin.";
  if (status === "checking") return "Checking the judge plugin…";
  if (status === null) return "Server plugin not found. Install it with npm run plugin:install, set enableServerPlugins: true in SillyTavern's config.yaml, then restart SillyTavern.";
  if (!status.configured) return "Plugin found, but no TypeSafe key is set. Paste it below.";
  return `Ready · key from ${status.keySource === "st-secrets" ? "SillyTavern secrets" : status.keySource ?? "the server"} · ${status.model ?? "model unknown"}`;
};

export function JudgeSettingsGroup({ settings, status, selfTest, builtUses = BUILT_JUDGE_USES, onChange, onSaveKey, onRefresh, onRunSelfTest }: JudgeSettingsGroupProps) {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState<"idle" | "saved" | "failed">("idle");
  const ready = typeof status === "object" && status !== null && status.configured;

  const saveKey = async () => {
    const ok = await onSaveKey(key);
    setKey("");
    setSaved(ok ? "saved" : "failed");
    onRefresh();
  };

  return (
    <div id="so-judge" className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <div className="font-medium text-sm">Judgment model <span className="opacity-60 font-normal">— install-wide, optional</span></div>
      <div id="so-judge-status" className="text-xs opacity-80">{statusText(status)}</div>
      <label className="flex flex-col gap-1 text-sm">
        <span>TypeSafe API key <HelpTooltip title="Stored in SillyTavern's own secrets on the server. It is never shown again, never saved in extension settings, and never sent to the page." /></span>
        <div className="flex gap-2">
          <input id="so-judge-key" className="text_pole flex-1" type="password" autoComplete="off" value={key} placeholder={ready ? "Saved — paste a new key to replace it" : "Paste your key"} onChange={(event) => { setKey(event.target.value); setSaved("idle"); }} />
          <button id="so-judge-key-save" className="menu_button" disabled={!key.trim()} onClick={() => void saveKey()}>Save</button>
        </div>
        {saved === "saved" && <span className="text-xs opacity-70">Saved to SillyTavern secrets.</span>}
        {saved === "failed" && <span className="text-xs text-yellow-300">SillyTavern refused the key. Check the server console.</span>}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input id="so-judge-enabled" type="checkbox" checked={settings.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} />
        <span>Use the judgment model <HelpTooltip title="A second, fast model for yes/no and pick-one decisions. Every use below is off until you turn it on, and each says what it sends. It never receives character cards, persona text, other chats or the key." /></span>
      </label>
      <div className="text-xs opacity-70">When a use is on, the text it lists is sent to TypeSafe. Nothing is sent while this is off.</div>
      <div className="flex flex-col gap-1 pl-4">
        {builtUses.map((use) => {
          const copy = JUDGE_USE_COPY[use];
          const dependency = JUDGE_USE_DEPENDENCIES[use];
          const blocked = dependency && !settings.uses[dependency] ? `Needs "${JUDGE_USE_COPY[dependency].label}" first.` : null;
          return (
            <label key={use} className="flex items-center gap-2 text-sm">
              <input id={`so-judge-use-${kebab(use)}`} type="checkbox" checked={settings.uses[use]} disabled={!settings.enabled || Boolean(blocked)} onChange={(event) => onChange({ uses: { [use]: event.target.checked } })} />
              <span>{copy.label} <HelpTooltip title={`${copy.description} Sends: ${copy.sends}.`} />{blocked && <span className="text-xs opacity-60"> {blocked}</span>}</span>
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <button id="so-judge-self-test" className="menu_button" disabled={!ready || selfTest.running} onClick={onRunSelfTest}>{selfTest.running ? "Testing…" : "Test judgment model"}</button>
        <button id="so-judge-refresh" className="menu_button" onClick={onRefresh}>Recheck</button>
      </div>
      {selfTest.report && (
        <div id="so-judge-self-test-result" className="text-xs">
          Speaker direction: {selfTest.report.right}/{selfTest.report.total} right
          {selfTest.report.p50LatencyMs !== null ? ` · p50 ${selfTest.report.p50LatencyMs} ms` : ""}
          {selfTest.report.model ? ` · ${selfTest.report.model}` : ""}
          {selfTest.report.rows.some((row) => row.fallback) ? ` · ${selfTest.report.rows.filter((row) => row.fallback).length} did not answer` : ""}
        </div>
      )}
    </div>
  );
}

export default JudgeSettingsGroup;
