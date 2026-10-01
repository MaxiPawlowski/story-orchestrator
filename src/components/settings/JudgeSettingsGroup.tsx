import { useState } from "react";
import {
  AUTHOR_JUDGE_USES, BUILT_JUDGE_USES, JUDGE_PROVIDER_IDS, JUDGE_PROVIDERS, JUDGE_USE_COPY, JUDGE_USE_DEPENDENCIES, judgeReadiness, judgeReadinessConcerns,
  judgeUseActive, providerLeavesMachine, type JudgeMeterView, type JudgeProviderId, type JudgeProviderRoutes, type JudgeReadinessKey, type JudgeReadinessRow,
  type JudgeSettings, type JudgeUseKey, type JudgeUses,
} from "@judge/index";
import type { JudgeSelfTestReport } from "@judge/selfTest";
import type { JudgeStatus } from "@services/STAPI";
import type { WriteResult } from "@utils/writeResult";
import HelpTooltip from "@components/studio/HelpTooltip";
import { log } from "@utils/log";

export interface JudgeSettingsPatch {
  enabled?: boolean;
  uses?: Partial<JudgeUses>;
  expansion?: Partial<JudgeSettings["expansion"]>;
  provider?: Partial<JudgeProviderRoutes>;
  noticesSeen?: JudgeProviderId[];
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
  if (row.uncalibratedOn) return `routed to ${JUDGE_PROVIDERS[row.uncalibratedOn].label}, not calibrated there`;
  if (row.splitFrom?.length) return `shares a call with ${row.splitFrom.map(labelOf).join(", ")} on another provider: none of them runs`;
  if (row.modelMismatch) return `on, but not measured on ${row.modelMismatch.answered ?? row.modelMismatch.configured} (measured on ${row.modelMismatch.measuredOn})`;
  if (row.fixtureStale) return `on, but its rate was measured on an older fixture revision (${row.fixtureStale.measured ?? "unrecorded"}, now ${row.fixtureStale.current}): needs re-measure`;
  return "on, but nothing has measured it";
};

const meterText = (meter: JudgeMeterView): string =>
  `This chat: ${meter.calls} ${meter.calls === 1 ? "call" : "calls"} (${meter.cachedCalls} from cache) · ${meter.inputTokens.toLocaleString("en-US")} input / ` +
    `${meter.outputTokens.toLocaleString("en-US")} output tokens${meter.cost > 0 ? ` · cost ${meter.cost}` : ""}`;

const providersInUse = (settings: JudgeSettings, wardenEnabled: boolean): JudgeProviderId[] => {
  if (!settings.enabled) return [];
  const keys: JudgeReadinessKey[] = [...BUILT_JUDGE_USES.filter((use) => judgeUseActive(settings, use)), ...(wardenEnabled ? ["warden" as const] : [])];
  return JUDGE_PROVIDER_IDS.filter((id) => keys.some((key) => settings.provider[key] === id));
};

const ProviderSelect = ({ id, label, value, disabled, onPick }: { id: string; label: string; value: JudgeProviderId; disabled: boolean; onPick(value: JudgeProviderId): void }) => (
  <select id={id} aria-label={`${label}: provider`} className="text_pole w-auto text-xs" value={value} disabled={disabled} onChange={(event) => onPick(event.target.value as JudgeProviderId)}>
    {JUDGE_PROVIDER_IDS.map((provider) => <option key={provider} value={provider}>{JUDGE_PROVIDERS[provider].label}</option>)}
  </select>
);

const statusText =(status: JudgeSettingsGroupProps["status"]): string => {
  if (status === "unchecked") return "Off. Turn it on, or press Recheck, to look for the server plugin.";
  if (status === "checking") return "Checking the judge plugin…";
  if (status === null) return "Server plugin not found. Install it with npm run plugin:install, set enableServerPlugins: true in SillyTavern's config.yaml, then restart SillyTavern.";
  if (!status.configured) return "Plugin found, but no TypeSafe key is set. Paste it below.";
  return `Ready · key from ${status.keySource === "st-secrets" ? "SillyTavern secrets" : status.keySource ?? "the server"} · ${status.model ?? "model unknown"}`;
};

interface JudgeUseRowsProps {
  settings: JudgeSettings;
  builtUses: readonly JudgeUseKey[];
  authorView: boolean;
  wardenEnabled: boolean;
  onChange(patch: JudgeSettingsPatch): void;
}

const JudgeUseRows = ({ settings, builtUses, authorView, wardenEnabled, onChange }: JudgeUseRowsProps) => (
  <div className="flex flex-col gap-1 pl-4">
    {builtUses.filter((use) => authorView || !AUTHOR_JUDGE_USES.includes(use)).map((use) => {
      const copy = JUDGE_USE_COPY[use];
      const dependency = JUDGE_USE_DEPENDENCIES[use];
      const blocked = dependency && !settings.uses[dependency] ? `Needs "${JUDGE_USE_COPY[dependency].label}" first.` : null;
      return (
        <div key={use} className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              id={`so-judge-use-${kebab(use)}`}
              type="checkbox"
              checked={settings.uses[use]}
              disabled={!settings.enabled || Boolean(blocked)}
              onChange={(event) => onChange({ uses: { [use]: event.target.checked } })}
            />
            <span>{copy.label}</span>
          </label>
          <HelpTooltip title={`${copy.description} Sends: ${copy.sends}.`} />
          {blocked && <span className="text-xs opacity-70">{blocked}</span>}
          <ProviderSelect
            id={`so-judge-provider-${kebab(use)}`}
            label={copy.label}
            value={settings.provider[use]}
            disabled={!settings.enabled}
            onPick={(provider) => onChange({ provider: { [use]: provider } })}
          />
        </div>
      );
    })}
    {wardenEnabled && (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Continuity warden</span>
        <ProviderSelect
          id="so-judge-provider-warden"
          label="Continuity warden"
          value={settings.provider.warden}
          disabled={!settings.enabled}
          onPick={(provider) => onChange({ provider: { warden: provider } })}
        />
      </div>
    )}
  </div>
);

interface JudgeProviderNoticesProps {
  settings: JudgeSettings;
  status: JudgeSettingsGroupProps["status"];
  providers: JudgeProviderId[];
  onChange(patch: JudgeSettingsPatch): void;
}

const JudgeProviderNotices = ({ settings, status, providers, onChange }: JudgeProviderNoticesProps) => (
  <>
    {providers.map((provider) => {
      const info = JUDGE_PROVIDERS[provider];
      const providerStatus = typeof status === "object" && status !== null ? status.providers?.[provider] : undefined;
      if (!providerLeavesMachine(provider, providerStatus)) {
        const where = providerStatus?.host ? ` (${providerStatus.host})` : "";
        return <div key={provider} id={`so-judge-local-${provider}`} className="text-xs opacity-70">{info.label} runs on this machine{where}: nothing it is asked leaves it.</div>;
      }
      if (settings.noticesSeen.includes(provider)) return null;
      return (
        <div key={provider} id={`so-judge-privacy-${provider}`} className="flex flex-wrap items-center gap-2 text-xs so-warning-text">
          <span>{info.notice}{providerStatus?.host && !info.remote ? ` (${providerStatus.host})` : ""}</span>
          {info.policyUrl && <a className="underline" href={info.policyUrl} target="_blank" rel="noreferrer">Privacy policy</a>}
          <button id={`so-judge-privacy-ack-${provider}`} type="button" className="menu_button" onClick={() => onChange({ noticesSeen: [...settings.noticesSeen, provider] })}>Got it</button>
        </div>
      );
    })}
  </>
);

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
  const readiness = judgeReadiness(settings, JUDGE_USE_DEPENDENCIES, meter?.lastAnsweredModel ?? null, { warden: wardenEnabled })
    .filter((row) => authorView || row.key === "warden" || !AUTHOR_JUDGE_USES.includes(row.key));
  const concerns = judgeReadinessConcerns(readiness);
  const enabledMeasured = readiness.filter((row) => row.verdict === "measured");
  const inUse = providersInUse(settings, wardenEnabled);

  const [keyError, setKeyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const saveKey = async () => {
    setSaving(true);
    try {
      const result = await onSaveKey(key);
      setSaved(result.ok ? "saved" : "failed");
      setKeyError(result.ok ? null : result.reason);
    } catch (error) {
      log.warn("judge key not saved", error);
      setSaved("failed");
      setKeyError(null);
    } finally {
      setKey("");
      setSaving(false);
      onRefresh();
    }
  };

  return (
    <div id="so-judge" className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <div className="font-medium text-sm">Judge <span className="opacity-70 font-normal">— install-wide, optional</span></div>
      <div id="so-judge-status" className="text-xs opacity-80">{statusText(status)}</div>
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex items-center gap-1">
          <label htmlFor="so-judge-key">TypeSafe API key</label>
          <HelpTooltip title="Stored in SillyTavern's own secrets on the server. It is never shown again, never saved in extension settings, and never sent to the page." />
        </div>
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
          <button id="so-judge-key-save" type="button" className="menu_button" disabled={!key.trim() || saving} onClick={() => void saveKey()}>{saving ? "Saving…" : "Save key"}</button>
        </div>
        {saved === "saved" && <span className="text-xs opacity-70">Saved to SillyTavern secrets.</span>}
        {saved === "failed" && <span id="so-judge-key-error" className="text-xs so-warning-text">Could not save the key: {keyError ?? "SillyTavern refused it."}</span>}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input id="so-judge-enabled" type="checkbox" checked={settings.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} />
          <span>Use the judge</span>
        </label>
        <HelpTooltip title={"A second, fast model for yes/no and pick-one decisions. Each use below is on by default and can be switched off on its own; each says " +
          "what it sends. It never receives character cards, persona text, other chats or the key."} />
      </div>
      <div className="text-xs opacity-70">When a use is on, the text it lists is sent to the provider it is routed to. Nothing is sent while this is off.</div>
      <JudgeUseRows settings={settings} builtUses={builtUses} authorView={authorView} wardenEnabled={wardenEnabled} onChange={onChange} />
      <JudgeProviderNotices settings={settings} status={status} providers={inUse} onChange={onChange} />
      {authorView && <div className="flex flex-wrap items-center gap-2 pl-4 text-sm">
        <span>Expansion variants</span>
        <HelpTooltip title={"Write this many outlines for each gap in the story and keep the best one, as the judge scores them. 1 writes one, " +
          "as today. Each extra outline is another run of the story model."} />
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
            <div key={row.key} className="so-warning-text">
              {labelOf(row.key)}: {concernText(row)}
              <span className="opacity-80"> — {row.recommendation}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button id="so-judge-self-test" type="button" className="menu_button" disabled={!ready || selfTest.running} onClick={onRunSelfTest}>{selfTest.running ? "Testing…" : "Test the judge"}</button>
        <button id="so-judge-refresh" type="button" className="menu_button" onClick={onRefresh}>Recheck</button>
        <a
          id="so-judge-recommended-config"
          className="text-xs underline"
          href="scripts/extensions/third-party/story-orchestrator/README.md#judge-recommended-configuration"
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
