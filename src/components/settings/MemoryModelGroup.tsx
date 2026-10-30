import { useEffect, useRef, useState } from "react";
import { harnessListed, listConnectionProfiles, profileExists, refreshHarnessStatus, type HarnessMeter, type HarnessStatus } from "@services/STAPI";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import type { SelfTestReport, SelfTestTier } from "@runtime/selfTest";
import { createModelCall } from "@runtime/modelCall";
import { roleHealth } from "@runtime/roleHealth";
import { resolvedProfileId, resolveRoute, roleHarness } from "@runtime/passProfiles";
import { HARNESS_LABELS, harnessVendor, routeMeters, withRoleEffort, withRoleFallback, withRoleHarness } from "@runtime/roleRouteEdits";
import { HARNESS_IDS, harnessKey, loginHint, parseHarnessKey } from "@utils/harness";
import { PASS_ROLES } from "@extraction/passRole";
import type { ReasoningEffort } from "@utils/reasoningEffort";
import type { PassRole } from "@extraction/passRole";
import { CheckRow, HelpText } from "./Field";
import { SettingRow } from "@components/ui/SettingRow";
import { Select } from "@components/ui/Field";
import { Button } from "@components/ui/Button";
import { Section } from "@components/ui/Section";
import { settingCopy } from "@features/settingsCopy";
import { DEFAULT_REPLY_EFFORT } from "@utils/reasoningEffort";
import { RoleProfilesGroup, type HarnessOption, type RoleHarnessRoute } from "./RoleProfilesGroup";
import { FallbackProfileField } from "./FallbackProfileField";
import { ProfileOptions } from "./ProfileOptions";
import { REPLY_EFFORT_LABELS } from "./ReplyThinkingField";
import { loreEligibility } from "@runtime/loreRoute";
import { log } from "@utils/log";

const METER_WINDOWS: Record<string, string> = { five_hour: "5h", seven_day: "7d" };

export const meterHint = (meter: HarnessMeter | undefined): string => {
  const used = Object.entries(meter?.windows ?? {}).filter(([, window]) => typeof window.utilization === "number")
    .map(([name, window]) => `${METER_WINDOWS[name] ?? name} ${Math.round((window.utilization as number) * 100)}%`);
  if (meter?.status === "rejected") return " (usage limit reached)";
  return used.length ? ` (used: ${used.join(", ")})` : "";
};

export const harnessOptions = (status: HarnessStatus | null): HarnessOption[] => HARNESS_IDS.flatMap((harness) => {
  const row = status?.harnesses[harness];
  if (!row?.installed || !row.offered) return [];
  return row.models.map((model) => ({
    key: harnessKey(harness, model.id),
    label: `${HARNESS_LABELS[harness]} · ${model.id}${row.agentBridge && model.agent === false ? " (no wizard tools)" : ""}`
      + (row.fresh ? meterHint(row.meter) : ` (${loginHint(row, "log in first")})`),
    vendor: harnessVendor(harness, model.id),
  }));
});

export const SELF_TEST_FAILED_TEXT = "The test could not finish. Check the memory model profile, then try again.";

export const SELF_TEST_SUGGESTION_TEXT = "This model could not track what each character knows. Switching that off keeps its other work reliable.";

export const SELF_TEST_TIER_LABELS: Record<SelfTestTier, string> = {
  deltas: "Moving the story on",
  memory: "Remembering what happened",
  arcs: "Following open threads",
  epistemic: "Tracking what each character knows",
  ledger: "Tracking values like health or money",
};

const SelfTestResult = ({ report, onApply, authorView }: { report: SelfTestReport; onApply: () => void; authorView: boolean }) => (
  <div id="so-self-test-result" className="text-xs flex flex-col gap-1">
    {report.error && <div data-so="self-test-error" className="so-warning-text">{SELF_TEST_FAILED_TEXT}</div>}
    {report.error && authorView && <div data-so="self-test-error-detail" className="opacity-70">{report.error}</div>}
    {report.results.map((result) => (
      <div key={result.tier} className="flex items-start gap-2">
        <span className={result.status === "pass" ? "so-success-text" : "so-error-text"}>{result.status === "pass" ? "Works" : "Does not work"}</span>
        <span className="opacity-80">{SELF_TEST_TIER_LABELS[result.tier]}{authorView ? ` — ${result.detail}${result.got.length ? ` · got: ${result.got.slice(0, 2).join("; ")}` : ""}` : ""}</span>
      </div>
    ))}
    {report.suggestion && (
      <div className="flex items-center gap-2">
        <span className="opacity-80">{authorView ? report.suggestion.reason : SELF_TEST_SUGGESTION_TEXT}</span>
        <button id="so-self-test-apply" className="menu_button" onClick={onApply}>Stop tracking what characters know</button>
      </div>
    )}
  </div>
);

export const MemoryModelGroup = ({ snapshot, manager, onOpenReplyThinking }: {
  snapshot: RuntimeSnapshot; manager: RuntimeManager; onOpenReplyThinking?: () => void;
}) => {
  const [selfTest, setSelfTest] = useState<SelfTestReport | null>(null);
  const [selfTestRunning, setSelfTestRunning] = useState(false);
  const selfTestCancelled = useRef(false);
  const [testingRole, setTestingRole] = useState<PassRole | null>(null);
  const profiles = listConnectionProfiles();
  const settings = snapshot.extraction.settings;
  const [harnessStatus, setHarnessStatus] = useState<HarnessStatus | null>(null);
  const [askHarness, setAskHarness] = useState(false);
  const harnessRoutes = Object.fromEntries(PASS_ROLES.flatMap((role) => {
    const harness = roleHarness(settings, role);
    const route: RoleHarnessRoute | null = harness ? { key: harnessKey(harness.harness, harness.model), fallback: settings.routes?.[role]?.onFailure?.profileId ?? null } : null;
    return route ? [[role, route]] : [];
  }));
  const wantsHarness = askHarness || Object.keys(harnessRoutes).length > 0;
  useEffect(() => {
    if (!wantsHarness) return undefined;
    let live = true;
    void refreshHarnessStatus().then((status) => { if (live) setHarnessStatus(status); });
    return () => { live = false; };
  }, [wantsHarness]);
  const setRoleHarness = (role: PassRole, key: string | null) => manager.setExtractionSettings({ routes: withRoleHarness(settings.routes, role, key ? parseHarnessKey(key) : null) });
  const setRoleFallback = (role: PassRole, profileId: string | null) => manager.setExtractionSettings({ routes: withRoleFallback(settings.routes, role, profileId) });

  const runSelfTest = async () => {
    if (selfTestRunning) {
      selfTestCancelled.current = true;
      return;
    }
    selfTestCancelled.current = false;
    setSelfTestRunning(true);
    setSelfTest(null);
    try {
      const { runModelSelfTest } = await import("@runtime/selfTest");
      setSelfTest(await runModelSelfTest({
        profileId: settings.profileId,
        model: createModelCall({ settings: () => settings, exists: profileExists, planted: false }),
        cancelled: () => selfTestCancelled.current,
      }));
    } catch (error) {
      log.warn("memory model test failed", error);
      setSelfTest({ ranAt: new Date().toISOString(), profileId: settings.profileId, results: [], error: "The test could not run. Reload SillyTavern and try again." });
    } finally {
      setSelfTestRunning(false);
    }
  };

  const assignRole = (role: PassRole, profileId: string | null) => {
    const rest = Object.fromEntries(Object.entries(settings.profiles ?? {}).filter(([key]) => key !== role));
    manager.setExtractionSettings({ profiles: profileId ? { ...rest, [role]: profileId } : rest });
  };

  const setRoleEffort = (role: PassRole, effort: ReasoningEffort) => manager.setExtractionSettings({ routes: withRoleEffort(settings.routes, role, effort) });

  const testRole = async (role: PassRole) => {
    const route = resolveRoute(settings, role, (id) => profiles.some((profile) => profile.id === id), harnessListed);
    setTestingRole(role);
    try {
      const { runRoleSelfTest } = await import("@runtime/roleSelfTest");
      roleHealth.record(await runRoleSelfTest(role, { profileId: route.ok ? resolvedProfileId(route) : null, route: route.ok ? route.route : null }));
    } catch (error) {
      log.warn("role test failed", error);
    } finally {
      setTestingRole(null);
    }
  };

  const applySelfTestSuggestion = () => {
    if (!selfTest?.suggestion) return;
    manager.setMemorySettings({ epistemicLedgerCapable: selfTest.suggestion.epistemicLedgerCapable });
  };

  return (
    <div id="so-models" className="so-setting-group">
      <SettingRow label={settingCopy("extraction.profileId").label} htmlFor="so-extraction-profile" description={<HelpText text={settingCopy("extraction.profileId").help} />}
        control={(describedBy) => <Select id="so-extraction-profile" size="lg" value={settings.profileId ?? ""} aria-describedby={describedBy}
          onChange={(event) => manager.setExtractionSettings({ profileId: event.target.value || null })}>
          <option value="">No profile selected</option>
          <ProfileOptions profiles={profiles} />
        </Select>} />
      <FallbackProfileField value={settings.fallbackProfileId ?? null} primary={settings.profileId} profiles={profiles}
        onChange={(fallbackProfileId) => manager.setExtractionSettings({ fallbackProfileId })} />
      {settings.enabled && !settings.profileId && (
        <div id="so-not-configured" className="so-warning-text">Not configured: pick a memory model profile above and every chat, including this one, starts advancing on its own.</div>
      )}
      <SettingRow label="Test memory model" description="Runs fixed scenes through the real pipeline and reports what this model can actually do."
        control={<Button id="so-self-test" size="sm" disabled={!settings.profileId} onClick={() => void runSelfTest()}>{selfTestRunning ? "Cancel test" : "Test memory model"}</Button>} />
      {selfTest && <SelfTestResult report={selfTest} onApply={applySelfTestSuggestion} authorView={snapshot.ui.authorView} />}
      {onOpenReplyThinking && <SettingRow label={settingCopy("extraction.replyEffort").label}
        description={`${REPLY_EFFORT_LABELS[settings.replyEffort ?? DEFAULT_REPLY_EFFORT]}. Set in Features › Reply thinking.`}
        control={<Button id="so-reply-effort-open" variant="ghost" size="sm" icon="fa-arrow-right" onClick={onOpenReplyThinking}>Change</Button>} />}
      <Section id="so-models-tasks" title="Models per task" level={3} description="Each task can use its own profile or harness. Left on the memory model, it follows it.">
        <RoleProfilesGroup
          routes={snapshot.roleRoutes ?? []}
          assigned={settings.profiles ?? {}}
          profiles={profiles}
          testing={testingRole}
          onAssign={assignRole}
          onTest={(role) => void testRole(role)}
          onEffort={setRoleEffort}
          harnesses={harnessOptions(harnessStatus)}
          harnessRoutes={harnessRoutes}
          meters={routeMeters(snapshot.modelCallRing ?? [])}
          onHarness={setRoleHarness}
          onFallback={setRoleFallback}
          onOpen={() => setAskHarness(true)}
          authorView
          measurements={{ lore: loreEligibility() }}
        />
      </Section>
      <Section id="so-models-knowledge" title="Knowledge tracking" level={3}>
        <CheckRow id="so-epistemic-capable" setting="memory.epistemicLedgerCapable" checked={snapshot.memory.settings.epistemicLedgerCapable}
          onChange={(on) => manager.setMemorySettings({ epistemicLedgerCapable: on })} />
      </Section>
    </div>
  );
};
