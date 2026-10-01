import { useEffect, useRef, useState } from "react";
import { harnessListed, listConnectionProfiles, profileExists, refreshHarnessStatus, type HarnessStatus } from "@services/STAPI";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import type { SelfTestReport } from "@runtime/selfTest";
import { createModelCall } from "@runtime/modelCall";
import { roleHealth } from "@runtime/roleHealth";
import { resolvedProfileId, resolveRoute, roleHarness } from "@runtime/passProfiles";
import { HARNESS_LABELS, harnessVendor, routeMeters, withRoleEffort, withRoleFallback, withRoleHarness } from "@runtime/roleRouteEdits";
import { HARNESS_IDS, harnessKey, parseHarnessKey } from "@utils/harness";
import { PASS_ROLES } from "@extraction/passRole";
import type { ReasoningEffort } from "@utils/reasoningEffort";
import type { PassRole } from "@extraction/passRole";
import { GroupHeader } from "./GroupHeader";
import { CheckRow, FieldLabel } from "./Field";
import { RoleProfilesGroup, type HarnessOption, type RoleHarnessRoute } from "./RoleProfilesGroup";
import { log } from "@utils/log";

type Settings = RuntimeSnapshot["extraction"]["settings"];

export const harnessOptions = (status: HarnessStatus | null): HarnessOption[] => HARNESS_IDS.flatMap((harness) => {
  const row = status?.harnesses[harness];
  if (!row?.installed || !row.offered) return [];
  return row.models.map((model) => ({
    key: harnessKey(harness, model.id),
    label: `${HARNESS_LABELS[harness]} · ${model.id}${row.fresh ? "" : " (log in first)"}`,
    vendor: harnessVendor(harness, model.id),
  }));
});

const AdvancedExtraction = ({ settings, manager }: { settings: Settings; manager: RuntimeManager }) => (
  <details className="text-sm">
    <summary className="cursor-pointer opacity-80">Advanced</summary>
    <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor="so-extraction-cadence" label="Cadence"
          help="Run an extraction read every N chat messages. Lower = story reacts faster but calls the memory model more often." />
        <input id="so-extraction-cadence" type="number" min={1} value={settings.cadence}
          onChange={(event) => manager.setExtractionSettings({ cadence: Math.max(1, Number(event.target.value) || 1) })} />
      </div>
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor="so-extraction-reconcile" label="Reconcile ×" help="When the story stalls, widen the re-read window by this multiplier to double-check missed facts." />
        <input
          id="so-extraction-reconcile"
          type="number"
          min={1}
          step={0.1}
          value={settings.reconciliationMultiplier}
          onChange={(event) => manager.setExtractionSettings({ reconciliationMultiplier: Math.max(1, Number(event.target.value) || 1) })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor="so-extraction-lag" label="Lag"
          help="Skip the newest N messages when reading, in case you often re-roll replies. 0 = react to the latest message immediately." />
        <input id="so-extraction-lag" type="number" min={0} value={settings.stabilityLag}
          onChange={(event) => manager.setExtractionSettings({ stabilityLag: Math.max(0, Number(event.target.value) || 0) })} />
      </div>
    </div>
  </details>
);

export const SELF_TEST_FAILED_TEXT = "The test could not finish. Check the memory model profile, then try again.";

const SelfTestResult = ({ report, onApply, authorView }: { report: SelfTestReport; onApply: () => void; authorView: boolean }) => (
  <div id="so-self-test-result" className="text-xs flex flex-col gap-1">
    {report.error && <div data-so="self-test-error" className="so-warning-text">{SELF_TEST_FAILED_TEXT}</div>}
    {report.error && authorView && <div data-so="self-test-error-detail" className="opacity-70">{report.error}</div>}
    {report.results.map((result) => (
      <div key={result.tier} className="flex items-start gap-2">
        <span className={result.status === "pass" ? "so-success-text" : "so-error-text"}>{result.status === "pass" ? "PASS" : "FAIL"}</span>
        <span className="opacity-80">{result.tier} — {result.detail}{result.got.length ? ` · got: ${result.got.slice(0, 2).join("; ")}` : ""}</span>
      </div>
    ))}
    {report.suggestion && (
      <div className="flex items-center gap-2">
        <span className="opacity-80">{report.suggestion.reason}</span>
        <button id="so-self-test-apply" className="menu_button" onClick={onApply}>Turn epistemic/ledger off</button>
      </div>
    )}
  </div>
);

export const MemoryModelGroup = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
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
      roleHealth.record(await runRoleSelfTest(role, { profileId: route.ok ? resolvedProfileId(route) : null }));
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
    <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <GroupHeader title="Memory model" scope="install" id="so-memory-model-header" />
      <CheckRow id="so-extraction-enabled" checked={settings.enabled} onChange={(on) => manager.setExtractionSettings({ enabled: on })}
        label="Let the story advance on its own (shared read extraction)" />
      <div className="flex flex-col gap-1 text-sm">
        <FieldLabel htmlFor="so-extraction-profile" label="Memory model profile" help={"This Connection Manager profile reads the chat after replies to track story progress. " +
          "The choice affects every chat; it does not replace the main chat model."} />
        <select id="so-extraction-profile" value={settings.profileId ?? ""} onChange={(event) => manager.setExtractionSettings({ profileId: event.target.value || null })}>
          <option value="">No profile selected</option>
          {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.model ? ` (${profile.model})` : ""}</option>)}
        </select>
      </div>
      <AdvancedExtraction settings={settings} manager={manager} />
      {settings.enabled && !settings.profileId && (
        <div id="so-not-configured" className="text-xs so-warning-text">Not configured: pick a memory model profile above and every chat, including this one, starts advancing on its own.</div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button id="so-self-test" type="button" className="menu_button" disabled={!settings.profileId} onClick={() => void runSelfTest()}>
          {selfTestRunning ? "Cancel test" : "Test memory model"}
        </button>
        <span className="min-w-0 text-xs opacity-70">Runs fixed scenes through the real pipeline and reports what this model can actually do.</span>
      </div>
      {selfTest && <SelfTestResult report={selfTest} onApply={applySelfTestSuggestion} authorView={snapshot.ui.authorView} />}
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
        authorView={snapshot.ui.authorView}
      />
    </div>
  );
};
