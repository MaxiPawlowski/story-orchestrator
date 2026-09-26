import { useState } from "react";
import {
  AUTHOR_JUDGE_USES, BUILT_JUDGE_USES, JUDGE_USE_COPY, JUDGE_USE_DEPENDENCIES, judgeReadiness, judgeReadinessConcerns,
  type JudgeMeterView, type JudgeReadinessKey, type JudgeReadinessRow, type JudgeSettings,
  type JudgeUseKey, type JudgeUses,
} from "@judge/index";
import type { JudgeSelfTestReport } from "@judge/selfTest";
import type { JudgeStatus } from "@services/STAPI";
import type { WriteResult } from "@utils/writeResult";
import HelpTooltip from "@components/studio/HelpTooltip";

export interface JudgeSettingsPatch {
  enabled?: boolean;
  uses?: Partial<JudgeUses>;
  expansion?: Partial<JudgeSettings["expansion"]>;
}

export interface JudgeSettingsGroupProps {
  settings: JudgeSettings;
  status: JudgeStatus | null | "checking" | "unchecked";
  selfTest: { running: boolean; report: JudgeSelfTestReport | null };
  builtUses?: readonly JudgeUseKey[];
  authorView?: boolean;
  /** This chat's judge spend and the model that last answered. */
  meter?: JudgeMeterView | null;
  wardenEnabled?: boolean;
  onChange(patch: JudgeSettingsPatch): void;
  onSaveKey(value: string): Promise<WriteResult>;
  onRefresh(): void;
  onRunSelfTest(): void;
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const labelOf = (key: JudgeReadinessKey): string => (key === "warden" ? "Continuity warden" : JUDGE_USE_COPY[key].label);

const concernText = (row: JudgeReadinessRow): string => {
  if (row.verdict === "blocked" && row.blockedBy) return `on, but "${JUDGE_USE_COPY[row.blockedBy].label}" is off, so it does nothing`;
  if (row.modelMismatch) return `on, but not measured on ${row.modelMismatch.answered ?? row.modelMismatch.configured} (measured on ${row.modelMismatch.measuredOn})`;
  return "on, but nothing has measured it";
};

const meterText = (meter: JudgeMeterView): string =>
  `This chat: ${meter.calls} ${meter.calls === 1 ? "call" : "calls"} (${meter.cachedCalls} from cache) · ${meter.inputTokens.toLocaleString("en-US")} input / ` +
    `${meter.outputTokens.toLocaleString("en-US")} output tokens${meter.cost > 0 ? ` · cost ${meter.cost}` : ""}`;

const statusText =(status: JudgeSettingsGroupProps["status"]): string => {
  if (status === "unchecked") return "Off. Turn it on, or press Recheck, to look for the server plugin.";
  if (status === "checking") return "Checking the judge plugin…";
  if (status === null) return "Server plugin not found. Install it with npm run plugin:install, set enableServerPlugins: true in SillyTavern's config.yaml, then restart SillyTavern.";
  if (!status.configured) return "Plugin found, but no TypeSafe key is set. Paste it below.";
  return `Ready · key from ${status.keySource === "st-secrets" ? "SillyTavern secrets" : status.keySource ?? "the server"} · ${status.model ?? "model unknown"}`;
};

export function JudgeSettingsGroup({
  settings,
  status,
  selfTest,
  builtUses = BUILT_JUDGE_USES,
  authorView = false,
  meter = null,
  wardenEnabled = false,
  onChange,
  onSaveKey,
  onRefresh,
  onRunSelfTest,
}: JudgeSettingsGroupProps) {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState<"idle" | "saved" | "failed">("idle");
  const ready = typeof status === "object" && status !== null && status.configured;
  const readiness = judgeReadiness(settings, JUDGE_USE_DEPENDENCIES, meter?.lastAnsweredModel ?? null, { warden: wardenEnabled });
  const concerns = judgeReadinessConcerns(readiness);
  const enabledMeasured = readiness.filter((row) => row.verdict === "measured");

  const [keyError, setKeyError] = useState<string | null>(null);

  const saveKey = async () => {
    const result = await onSaveKey(key);
    setKey("");
    setSaved(result.ok ? "saved" : "failed");
    setKeyError(result.ok ? null : result.reason);
    onRefresh();
  };

  return (
    <div id="so-judge" className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <div className="font-medium text-sm">Judgment model <span className="opacity-60 font-normal">— install-wide, optional</span></div>
      <div id="so-judge-status" className="text-xs opacity-80">{statusText(status)}</div>
      <label className="flex flex-col gap-1 text-sm">
        <span>TypeSafe API key <HelpTooltip title="Stored in SillyTavern's own secrets on the server. It is never shown again, never saved in extension settings, and never sent to the page." /></span>
        <div className="flex gap-2">
          <input
            id="so-judge-key"
            className="text_pole flex-1"
            type="password"
            autoComplete="off"
            value={key}
            placeholder={ready ? "Saved — paste a new key to replace it" : "Paste your key"}
            onChange={(event) => { setKey(event.target.value); setSaved("idle"); }}
          />
          <button id="so-judge-key-save" className="menu_button" disabled={!key.trim()} onClick={() => void saveKey()}>Save</button>
        </div>
        {saved === "saved" && <span className="text-xs opacity-70">Saved to SillyTavern secrets.</span>}
        {saved === "failed" && <span id="so-judge-key-error" className="text-xs text-yellow-300">Could not save the key: {keyError ?? "SillyTavern refused it."}</span>}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input id="so-judge-enabled" type="checkbox" checked={settings.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} />
        <span>Use the judgment model <HelpTooltip title={"A second, fast model for yes/no and pick-one decisions. Every use below is off until you turn it on, and each says " +
          "what it sends. It never receives character cards, persona text, other chats or the key."} /></span>
      </label>
      <div className="text-xs opacity-70">When a use is on, the text it lists is sent to TypeSafe. Nothing is sent while this is off.</div>
      <div className="flex flex-col gap-1 pl-4">
        {builtUses.filter((use) => authorView || !AUTHOR_JUDGE_USES.includes(use)).map((use) => {
          const copy = JUDGE_USE_COPY[use];
          const dependency = JUDGE_USE_DEPENDENCIES[use];
          const blocked = dependency && !settings.uses[dependency] ? `Needs "${JUDGE_USE_COPY[dependency].label}" first.` : null;
          return (
            <label key={use} className="flex items-center gap-2 text-sm">
              <input
                id={`so-judge-use-${kebab(use)}`}
                type="checkbox"
                checked={settings.uses[use]}
                disabled={!settings.enabled || Boolean(blocked)}
                onChange={(event) => onChange({ uses: { [use]: event.target.checked } })}
              />
              <span>{copy.label} <HelpTooltip title={`${copy.description} Sends: ${copy.sends}.`} />{blocked && <span className="text-xs opacity-60"> {blocked}</span>}</span>
            </label>
          );
        })}
      </div>
      {authorView && <div className="flex flex-wrap items-center gap-2 pl-4 text-sm">
        <span>Expansion variants <HelpTooltip title={"Write this many outlines for each gap in the story and keep the best one, as the judgment model scores them. 1 writes one, " +
          "as today. Each extra outline is another run of the story model."} /></span>
        <select
          id="so-judge-expansion-variants"
          aria-label="Expansion variants"
          className="text_pole w-16"
          value={settings.expansion.variants}
          disabled={!settings.enabled}
          onChange={(event) => onChange({ expansion: { variants: Number(event.target.value) as 1 | 2 | 3 } })}
        >
          {[1, 2, 3].map((count) => <option key={count} value={count}>{count}</option>)}
        </select>
        <span>picked by</span>
        <select
          id="so-judge-expansion-pick"
          aria-label="Variant picked by"
          className="text_pole w-36"
          value={settings.expansion.pick}
          disabled={!settings.enabled || settings.expansion.variants === 1}
          onChange={(event) => onChange({ expansion: { pick: event.target.value as "code" | "llm" } })}
        >
          <option value="code">the judge's score</option>
          <option value="llm">the story model</option>
        </select>
      </div>}
      {/* v2.3 plan 09: "enabled" is not "working". What is on and doing nothing says so here rather
          than sitting in the same list as the measured uses. */}
      {concerns.length > 0 && (
        <div id="so-judge-readiness" className="flex flex-col gap-1 pl-4 text-xs">
          {concerns.map((row) => (
            <div key={row.key} className="text-yellow-300">
              {labelOf(row.key)}: {concernText(row)}
              <span className="opacity-80"> — {row.recommendation}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button id="so-judge-self-test" className="menu_button" disabled={!ready || selfTest.running} onClick={onRunSelfTest}>{selfTest.running ? "Testing…" : "Test judgment model"}</button>
        <button id="so-judge-refresh" className="menu_button" onClick={onRefresh}>Recheck</button>
        <a
          id="so-judge-recommended-config"
          className="text-xs opacity-70 underline"
          href="scripts/extensions/third-party/story-orchestrator/docs/plans/v2.3/recommended-config.md"
          target="_blank"
          rel="noreferrer"
        >
          What each use is measured at
        </a>
      </div>
      {enabledMeasured.length > 0 && (
        <div id="so-judge-readiness-summary" className="text-xs opacity-80">
          On and
            measured: {enabledMeasured.map(
              (row) => `${labelOf(row.key)} ${row.calibration !== null ? Math.round(row.calibration * 100) + "%" : "—"}${row.latencyP50Ms !== null ? ` (p50 ${row.latencyP50Ms} ms)` : ""}`,
            ).join(" · ")} — measured on {[...new Set(enabledMeasured.map((row) => row.measuredOn))].join(", ")}
        </div>
      )}
      {authorView && meter && <div id="so-judge-meter" className="text-xs opacity-80">{meterText(meter)}</div>}
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
