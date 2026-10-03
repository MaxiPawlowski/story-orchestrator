import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { capabilityReport, hostFacts, judgeStatus, writeJudgeSecret, type CapabilityReport, type HostFacts } from "@services/STAPI";
import type { JudgeSelfTestReport } from "@judge/selfTest";
import { getGlobalSettings, setGlobalSettings, setJudgeSettings } from "@runtime/settingsStore";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { gettingStartedSteps, installFindings, type OneClickFix } from "@runtime/repair";
import type { FeatureWhere } from "@features/registry";
import type { ContinueRow } from "@runtime/playsIndex";
import { HelpButton } from "../help/HelpButton";
import { GettingStarted } from "./GettingStarted";
import CapabilitiesGroup, { type CapabilitiesGroupProps } from "./CapabilitiesGroup";
import EntryPoints from "./EntryPoints";
import MakeGroupCard from "./MakeGroupCard";
import type { MakeGroupOutcome } from "@runtime/makeGroup";
import type { JudgeSettingsGroupProps, JudgeSettingsPatch } from "./JudgeSettingsGroup";
import { StoryGroup } from "./StoryGroup";
import { authoringSettings, DisplayGroup, LorebooksGroup, PacingGroup, StagecraftGroup, TalkGroup } from "./PlayGroups";
import { CheckRow } from "./Field";
import { log } from "@utils/log";

const ImageGroup = lazyRetry(() => import("../../image/ImageGroup"));
const SpriteGroup = lazyRetry(() => import("../../sprites/SpriteGroup"));
const GroupStoryBinding = lazyRetry(() => import("./GroupStoryBinding"));
const JudgeSettingsGroup = lazyRetry(() => import("./JudgeSettingsGroup"));
const HelpHost = lazyRetry(() => import("../help/HelpHost"));
const WhatsNewHost = lazyRetry(() => import("../help/WhatsNewHost"));
const MemoryModelGroup = lazyRetry(() => import("./MemoryModelGroup").then((module) => ({ default: module.MemoryModelGroup })));

export interface SettingsHost {
  extensionVersion: string;
  memoryModelLimit: (profileId: string | null) => CapabilitiesGroupProps["memoryModel"];
  recheckMemoryModel: () => void;
  openWizard: () => void;
  openStudio: () => void;
  openWizardForRequirements: () => void;
  revealSetting: (id: string) => void;
  repairCast?: (action: OneClickFix) => void;
  openGroup?: () => void;
  openDrawer: () => void;
  openAuthorView?: () => void;
  showFeature: (where: FeatureWhere) => void;
  makeGroup?: (storyId: string) => Promise<MakeGroupOutcome>;
  fixGroupWithWizard?: (storyId: string, missing: string[]) => void;
  openPlay?: (row: ContinueRow) => void;
  helpOpen?: boolean;
  toggleHelp?: () => void;
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
    let report: JudgeSelfTestReport | null = null;
    try {
      const { runJudgeDirectorSelfTest } = await import("@judge/selfTest");
      report = await runJudgeDirectorSelfTest((request) => runtime.probe(request));
    } catch (error) {
      log.warn("judge self-test failed", error);
    } finally {
      setSelfTest({ running: false, report });
    }
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(() => getGlobalSettings().help.checklistDismissed);
  const image = getGlobalSettings().image;
  const extraction = snapshot.extraction.settings;
  const steps = gettingStartedSteps({
    memoryModel: extraction.enabled && Boolean(extraction.profileId),
    judgeReady: judge.judge.enabled && typeof judge.status === "object" && judge.status !== null && judge.status.configured,
    imagesReady: image.enabled && Boolean(image.comfyUrl) && Boolean(image.directorProfileId),
  });
  const toggleHelp = (event: MouseEvent<HTMLButtonElement>) => {
    const content = event.currentTarget.closest(".inline-drawer")?.querySelector<HTMLElement>(".inline-drawer-content");
    const panelOpen = Boolean(content && content.offsetParent !== null);
    if (panelOpen || host.toggleHelp) event.stopPropagation();
    if (host.toggleHelp) host.toggleHelp();
    else setHelpOpen(panelOpen ? !helpOpen : true);
  };

  return (
    <div id="story-orchestrator-settings">
      <div className="inline-drawer">
        <div className="inline-drawer-toggle inline-drawer-header flex items-center justify-between">
          <b>Story Orchestrator</b>
          <HelpButton id="so-help-toggle" open={host.toggleHelp ? host.helpOpen === true : helpOpen} onToggle={toggleHelp} />
        </div>
        <div className="inline-drawer-content px-3 py-2 !flex flex-col gap-3">
          {helpOpen && !host.toggleHelp && <Lazy fallback={null}><HelpHost authorView={snapshot.ui.authorView} onShowMe={host.showFeature} onClose={() => setHelpOpen(false)} /></Lazy>}
          <Lazy fallback={null}><WhatsNewHost configured={Boolean(extraction.profileId)} authorView={snapshot.ui.authorView} onShowMe={host.showFeature} /></Lazy>
          <EntryPoints
            snapshot={snapshot}
            busy={busy}
            importOpen={importOpen}
            onToggleImport={() => setImportOpen((open) => !open)}
            onNewStory={host.openWizard}
            onOpenStudio={host.openStudio}
            onOpenDrawer={host.openDrawer}
            onOpenAuthorView={host.openAuthorView}
            onRevealSetting={host.revealSetting}
            onFixWithWizard={host.openWizardForRequirements}
            onRepairCast={host.repairCast}
            onOpenGroup={host.openGroup}
            onOpenPlay={host.openPlay}
            gettingStarted={<GettingStarted steps={steps} dismissed={checklistDismissed} onReveal={host.revealSetting} installChecks={installFindings(snapshot)}
              onHide={() => setChecklistDismissed(setGlobalSettings({ help: { checklistDismissed: true } }).help.checklistDismissed)} />}
          />
          <details id="so-current-chat" className="so-settings-section" open>
            <summary>This chat <span className="opacity-70">— select and continue a story</span></summary>
            <div className="flex flex-col gap-3 pt-2">
              <StoryGroup snapshot={snapshot} manager={manager} busy={busy} setBusy={setBusy} importOpen={importOpen} />
              {snapshot.noGroup && host.makeGroup && (
                <MakeGroupCard view={snapshot.noGroup} wizardOn={snapshot.copilot.enabled} onMakeGroup={host.makeGroup}
                  onFixWithWizard={(storyId, missing) => host.fixGroupWithWizard?.(storyId, missing)} />
              )}
              <Lazy fallback={null}><GroupStoryBinding snapshot={snapshot} busy={busy} /></Lazy>
              <button type="button" className="menu_button self-start" onClick={host.openDrawer}>Open story and chat preferences</button>
            </div>
          </details>
          <details id="so-general-setup" className="so-settings-section">
            <summary>General setup <span className="opacity-70">— shared by every chat</span></summary>
            <div className="flex flex-col gap-3 pt-2">
              <p className="text-xs opacity-80">Connection Manager owns the actual model profiles. Choose which profiles this extension uses here; changes affect every chat.</p>
              <Lazy fallback={null}><MemoryModelGroup snapshot={snapshot} manager={manager} /></Lazy>
              <DisplayGroup snapshot={snapshot} manager={manager} />
              <Lazy fallback={<div className="text-xs">Loading image setup…</div>}><ImageGroup manager={manager} /></Lazy>
              <Lazy fallback={null}><SpriteGroup manager={manager} /></Lazy>
            </div>
          </details>
          <details id="so-author-services" className="so-settings-section">
            <summary>Author services <span className="opacity-70">— optional, shared by every chat</span></summary>
            <div className="flex flex-col gap-3 pt-2">
              {authoringSettings(snapshot) && (
                <CheckRow id="so-copilot-enabled" setting="copilot.enabled" checked={snapshot.copilot.enabled} onChange={(on) => manager.setCopilotSettings({ enabled: on })} />
              )}
              <LorebooksGroup snapshot={snapshot} manager={manager} />
              <StagecraftGroup snapshot={snapshot} manager={manager} />
              <Lazy fallback={null}><JudgeSettingsGroup settings={judge.judge} status={judge.status} selfTest={judge.selfTest} authorView={snapshot.ui.authorView} meter={snapshot.judgeMeter}
                wardenEnabled={wardenOn} onChange={judge.change} onSaveKey={writeJudgeSecret} onRefresh={judge.recheck} onRunSelfTest={() => void judge.test()} /></Lazy>
              <TalkGroup snapshot={snapshot} manager={manager} />
              <PacingGroup snapshot={snapshot} manager={manager} />
            </div>
          </details>
          <details id="so-diagnostics" className="so-settings-section">
            <summary>Diagnostics <span className="opacity-70">— ST capabilities and version</span></summary>
            <CapabilitiesGroup reports={hostProbe.capabilities} facts={hostProbe.facts} extensionVersion={host.extensionVersion}
              memoryModel={host.memoryModelLimit(snapshot.extraction.settings.profileId)} onRefresh={() => { host.recheckMemoryModel(); hostProbe.probe(true); }} />
            {snapshot.ui.authorView && <div data-so="engine-status" className="text-xs opacity-80">{snapshot.status}</div>}
          </details>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
