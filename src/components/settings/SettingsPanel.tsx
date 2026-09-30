import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { capabilityReport, hostFacts, judgeStatus, writeJudgeSecret, type CapabilityReport, type HostFacts } from "@services/STAPI";
import type { JudgeSelfTestReport } from "@judge/selfTest";
import { getGlobalSettings, setJudgeSettings } from "@runtime/settingsStore";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import CapabilitiesGroup, { type CapabilitiesGroupProps } from "./CapabilitiesGroup";
import EntryPoints from "./EntryPoints";
import JudgeSettingsGroup, { type JudgeSettingsGroupProps, type JudgeSettingsPatch } from "./JudgeSettingsGroup";
import { StoryGroup } from "./StoryGroup";
import { DisplayGroup, LorebooksGroup, PacingGroup, StagecraftGroup, TalkGroup } from "./PlayGroups";

const ImageGroup = lazy(() => import("../../image/ImageGroup"));
const SpriteGroup = lazy(() => import("../../sprites/SpriteGroup"));
const GroupStoryBinding = lazy(() => import("./GroupStoryBinding"));
const MemoryModelGroup = lazy(() => import("./MemoryModelGroup").then((module) => ({ default: module.MemoryModelGroup })));

export interface SettingsHost {
  extensionVersion: string;
  memoryModelLimit: (profileId: string | null) => CapabilitiesGroupProps["memoryModel"];
  recheckMemoryModel: () => void;
  openWizard: () => void;
  openStudio: () => void;
  openWizardForRequirements: () => void;
  revealSetting: (id: string) => void;
  openDrawer: () => void;
}

interface SettingsPanelProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  host: SettingsHost;
}

const useJudgeControls = (manager: RuntimeManager) => {
  const [judge, setJudge] = useState(() => getGlobalSettings().judge);
  const [status, setStatus] = useState<JudgeSettingsGroupProps["status"]>("unchecked");
  const [selfTest, setSelfTest] = useState<{ running: boolean; report: JudgeSelfTestReport | null }>({ running: false, report: null });

  const recheck = useCallback(() => {
    setStatus("checking");
    manager.getJudge()?.invalidateStatus();
    void judgeStatus().then(setStatus);
  }, [manager]);

  const change = (patch: JudgeSettingsPatch) => {
    const next = setJudgeSettings(patch).judge;
    setJudge(next);
    if (patch.enabled) recheck();
  };

  const test = async () => {
    const runtime = manager.getJudge();
    if (!runtime) return;
    setSelfTest({ running: true, report: null });
    const { runJudgeDirectorSelfTest } = await import("@judge/selfTest");
    const report = await runJudgeDirectorSelfTest((request) => runtime.probe(request));
    setSelfTest({ running: false, report });
  };

  return { judge, status, selfTest, recheck, change, test };
};

const useHostProbe = () => {
  const [capabilities, setCapabilities] = useState<CapabilityReport[] | "checking">("checking");
  const [facts, setFacts] = useState<HostFacts | null>(null);
  const probe = useCallback((refresh: boolean) => {
    setCapabilities("checking");
    void Promise.all([capabilityReport(refresh ? { refresh: true } : {}), hostFacts()]).then(([reports, next]) => {
      setCapabilities(reports);
      setFacts(next);
    });
  }, []);
  return { capabilities, facts, probe };
};

const SettingsPanel = ({ snapshot, manager, host }: SettingsPanelProps) => {
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const judge = useJudgeControls(manager);
  const hostProbe = useHostProbe();

  const { recheck } = judge;
  const { probe } = hostProbe;
  useEffect(() => {
    if (getGlobalSettings().judge.enabled) recheck();
    probe(false);
  }, [recheck, probe]);

  const wardenOn = snapshot.stagecraft.settings.wardenEnabled && snapshot.stagecraft.settings.wardenAcceptMode !== "off";

  return (
    <div id="story-orchestrator-settings">
      <div className="inline-drawer">
        <div className="inline-drawer-toggle inline-drawer-header flex items-center justify-between">
          <b>Story Orchestrator</b>
        </div>
        <div className="inline-drawer-content px-3 py-2 !flex flex-col gap-3">
          <EntryPoints
            snapshot={snapshot}
            busy={busy}
            importOpen={importOpen}
            onToggleImport={() => setImportOpen((open) => !open)}
            onNewStory={host.openWizard}
            onOpenStudio={host.openStudio}
            onOpenDrawer={host.openDrawer}
            onRevealSetting={host.revealSetting}
            onFixWithWizard={host.openWizardForRequirements}
          />
          <details id="so-current-chat" className="so-settings-section" open>
            <summary>This chat <span className="opacity-60">— select and continue a story</span></summary>
            <div className="flex flex-col gap-3 pt-2">
              <StoryGroup snapshot={snapshot} manager={manager} busy={busy} setBusy={setBusy} importOpen={importOpen} />
              <Suspense fallback={null}><GroupStoryBinding snapshot={snapshot} busy={busy} /></Suspense>
              <button type="button" className="menu_button self-start" onClick={host.openDrawer}>Open story and chat preferences</button>
            </div>
          </details>
          <details id="so-general-setup" className="so-settings-section">
            <summary>General setup <span className="opacity-60">— shared by every chat</span></summary>
            <div className="flex flex-col gap-3 pt-2">
              <p className="text-xs opacity-80">Connection Manager owns the actual model profiles. Choose which profiles this extension uses here; changes affect every chat.</p>
              <Suspense fallback={null}><MemoryModelGroup snapshot={snapshot} manager={manager} /></Suspense>
              <DisplayGroup snapshot={snapshot} manager={manager} />
              <Suspense fallback={<div className="text-xs">Loading image setup…</div>}><ImageGroup manager={manager} /></Suspense>
              <Suspense fallback={null}><SpriteGroup manager={manager} /></Suspense>
            </div>
          </details>
          <details id="so-author-services" className="so-settings-section">
            <summary>Author services <span className="opacity-60">— optional, shared by every chat</span></summary>
            <div className="flex flex-col gap-3 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={snapshot.copilot.enabled} onChange={(event) => manager.setCopilotSettings({ enabled: event.target.checked })} />
                Enable story copilot (Studio wizard and author driver)
              </label>
              <LorebooksGroup snapshot={snapshot} manager={manager} />
              <StagecraftGroup snapshot={snapshot} manager={manager} />
              <JudgeSettingsGroup settings={judge.judge} status={judge.status} selfTest={judge.selfTest} authorView={snapshot.ui.authorView} meter={snapshot.judgeMeter}
                wardenEnabled={wardenOn} onChange={judge.change} onSaveKey={writeJudgeSecret} onRefresh={judge.recheck} onRunSelfTest={() => void judge.test()} />
              <TalkGroup snapshot={snapshot} manager={manager} />
              <PacingGroup snapshot={snapshot} manager={manager} />
            </div>
          </details>
          <details id="so-diagnostics" className="so-settings-section">
            <summary>Diagnostics <span className="opacity-60">— ST capabilities and version</span></summary>
            <CapabilitiesGroup reports={hostProbe.capabilities} facts={hostProbe.facts} extensionVersion={host.extensionVersion}
              memoryModel={host.memoryModelLimit(snapshot.extraction.settings.profileId)} onRefresh={() => { host.recheckMemoryModel(); hostProbe.probe(true); }} />
            <div className="text-xs opacity-80">{snapshot.status}</div>
          </details>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
