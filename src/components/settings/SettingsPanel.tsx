import { useCallback, useEffect, useState } from "react";
import type { ChatPanel } from "../../presenceUi";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { capabilityReport, hostFacts, judgeStatus, stImageSource, writeJudgeSecret, type CapabilityReport, type HostFacts } from "@services/STAPI";
import type { JudgeSelfTestReport } from "@judge/selfTest";
import { getGlobalSettings, setGlobalSettings, setJudgeSettings } from "@runtime/settingsStore";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { gettingStartedSteps, imagesStepDone, installFindings, type OneClickFix } from "@runtime/repair";
import { guideUrl } from "@features/guideLinks";
import type { FeatureArea, FeatureWhere } from "@features/registry";
import { requestGuide } from "@guide/request";
import { requestTour } from "@guide/tour/request";
import { GUIDE_COPY, HELP_COPY } from "@features/helpCopy";
import { workspaceNavigation } from "@runtime/workspaceNavigation";
import type { ContinueRow } from "@runtime/playsIndex";
import type { CapabilitiesGroupProps } from "./CapabilitiesGroup";
import EntryPoints from "./EntryPoints";
import MakeGroupCard from "./MakeGroupCard";
import type { MakeGroupOutcome } from "@runtime/makeGroup";
import type { JudgeSettingsGroupProps, JudgeSettingsPatch } from "./JudgeSettingsGroup";
import { SettingsArea } from "./SettingsArea";
import { CheckRow } from "./Field";
import { log } from "@utils/log";

const ImageGroup = lazyRetry(() => import("../../image/ImageGroup"));
const SpriteGroup = lazyRetry(() => import("../../sprites/SpriteGroup"));
const GroupStoryBinding = lazyRetry(() => import("./GroupStoryBinding"));
const JudgeSettingsGroup = lazyRetry(() => import("./JudgeSettingsGroup"));
const MemoryModelGroup = lazyRetry(() => import("./MemoryModelGroup").then((module) => ({ default: module.MemoryModelGroup })));
const ChapterBudgetGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.ChapterBudgetGroup })));
const DisplayGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.DisplayGroup })));
const InnerVoiceGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.InnerVoiceGroup })));
const LorebooksGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.LorebooksGroup })));
const TalkGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.TalkGroup })));
const CharacterStateGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.CharacterStateGroup })));
const TransitionNoteRow = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.TransitionNoteRow })));
const CapabilitiesGroup = lazyRetry(() => import("./CapabilitiesGroup"));
const GettingStarted = lazyRetry(() => import("./GettingStarted"));
const StoryGroup = lazyRetry(() => import("./StoryGroup").then((module) => ({ default: module.StoryGroup })));

export interface SettingsHost {
  memoryModelLimit: (profileId: string | null) => CapabilitiesGroupProps["memoryModel"];
  recheckMemoryModel: () => void;
  openWizard: () => void;
  openStudio: () => void;
  openWizardForRequirements: () => void;
  revealSetting: (id: string) => void;
  repairCast?: (action: OneClickFix) => Promise<string | null> | void;
  openGroup?: () => void;
  openStory: () => void;
  openAuthorView?: () => void;
  showFeature: (where: FeatureWhere) => void;
  makeGroup?: (storyId: string) => Promise<MakeGroupOutcome>;
  fixGroupWithWizard?: (storyId: string, missing: string[]) => void;
  openPlay?: (row: ContinueRow) => void;
  openPanel?: (panel: "help" | "guide" | ChatPanel) => void;
  openGuide?: (doc: string) => void;
}

interface SettingsPanelProps {
  workspaceSection: "library" | "connections" | "interface" | "help";
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

const SETUP_PATH_DOC = "setup/setup-path.md";
const QUICK_START_DOC = "quick-start.md";

const openGuideFromWorkspace = (doc?: string) => {
  workspaceNavigation.close();
  if (requestGuide(doc)) return;
  const url = guideUrl(doc ?? "README.md");
  if (url) window.open(url, "_blank", "noopener");
};

const useOpenAreas = () => {
  const [open, setOpen] = useState<readonly string[]>(() => getGlobalSettings().help.openSections);
  const toggle = (area: FeatureArea, next: boolean) => {
    const sections = next ? [...new Set([...open, area])] : open.filter((id) => id !== area);
    setOpen(setGlobalSettings({ help: { openSections: sections } }).help.openSections);
  };
  return { open, toggle };
};

const SettingsPanel = ({ snapshot, manager, host, workspaceSection }: SettingsPanelProps) => {
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const judge = useJudgeControls(manager);
  const hostProbe = useHostProbe();
  const areas = useOpenAreas();
  const openGuide = host.openGuide ?? openGuideFromWorkspace;
  const area = (id: FeatureArea) => ({ area: id, open: areas.open.includes(id), onToggle: areas.toggle, onGuide: openGuide });
  const show = (id: FeatureArea) => (workspaceSection === "library" && id === "play")
    || (workspaceSection === "connections" && ["memory", "world", "images", "judge", "setup"].includes(id))
    || (workspaceSection === "help" && ["setup", "authoring"].includes(id));

  const { recheck } = judge;
  const { probe } = hostProbe;
  useEffect(() => {
    if (getGlobalSettings().judge.enabled) recheck();
    probe(false);
  }, [recheck, probe]);

  const wardenOn = snapshot.stagecraft.settings.wardenEnabled && snapshot.stagecraft.settings.wardenAcceptMode !== "off";
  const [checklistDismissed, setChecklistDismissed] = useState(() => getGlobalSettings().help.checklistDismissed);
  const image = getGlobalSettings().image;
  const extraction = snapshot.extraction.settings;
  const steps = gettingStartedSteps({
    memoryModel: extraction.enabled && Boolean(extraction.profileId),
    judgeReady: judge.judge.enabled && typeof judge.status === "object" && judge.status !== null && judge.status.configured,
    imagesReady: imagesStepDone(image, stImageSource()),
  });
  return (
    <div id="so-workspace-settings" data-section={workspaceSection}>
      <div>
        <div className="px-3 py-2 flex flex-col gap-3">
          {workspaceSection === "library" && <EntryPoints
            snapshot={snapshot}
            busy={busy}
            importOpen={importOpen}
            onToggleImport={() => setImportOpen((open) => !open)}
            onNewStory={host.openWizard}
            onOpenStudio={host.openStudio}
            onOpenStory={host.openStory}
            onOpenAuthorView={host.openAuthorView}
            onRevealSetting={host.revealSetting}
            onFixWithWizard={host.openWizardForRequirements}
            onRepairCast={host.repairCast}
            onOpenGroup={host.openGroup}
            onOpenPlay={host.openPlay}
            onTrophies={manager.carry.shelf}
            onStartLiving={snapshot.stagecraft.settings.livingEnabled === false ? undefined : async (fields) => manager.importStory(JSON.stringify(await manager.livingStory(fields)))}
            gettingStarted={<Lazy fallback={null}><GettingStarted steps={steps} dismissed={checklistDismissed} onReveal={host.revealSetting} installChecks={installFindings(snapshot)}
              onHide={() => setChecklistDismissed(setGlobalSettings({ help: { checklistDismissed: true } }).help.checklistDismissed)} /></Lazy>}
          />}
          {workspaceSection === "help" && <div className="flex flex-wrap items-center gap-2">
            <button type="button" id="so-help-quick-start" data-so="help-quick-start" className="menu_button whitespace-nowrap"
              onClick={() => openGuideFromWorkspace(QUICK_START_DOC)}>{HELP_COPY.quickStart}</button>
            <button type="button" id="so-help-tour" data-so="help-tour" className="menu_button whitespace-nowrap" onClick={() => requestTour()}>{HELP_COPY.tour}</button>
            <button type="button" id="so-help-tour-setup" data-so="help-tour-setup" className="menu_button whitespace-nowrap"
              onClick={() => openGuideFromWorkspace(SETUP_PATH_DOC)}>{HELP_COPY.setupPath}</button>
            {host.openPanel && <button type="button" id="so-help-open-panel" data-so="help-open-panel" className="menu_button whitespace-nowrap"
              onClick={() => host.openPanel?.("help")}>{HELP_COPY.openPanel}</button>}
            {host.openPanel && <button type="button" id="so-help-open-guide" data-so="help-open-guide" className="menu_button whitespace-nowrap"
              onClick={() => host.openPanel?.("guide")}>{GUIDE_COPY.open}</button>}
          </div>}
          {workspaceSection === "interface" && <Lazy fallback={null}><DisplayGroup snapshot={snapshot} manager={manager} /></Lazy>}
          {show("play") && <SettingsArea {...area("play")} advanced={<Lazy fallback={null}><TransitionNoteRow snapshot={snapshot} manager={manager} /></Lazy>}>
            <Lazy fallback={null}><StoryGroup snapshot={snapshot} manager={manager} busy={busy} setBusy={setBusy} importOpen={importOpen} /></Lazy>
            {snapshot.noGroup && host.makeGroup && (
              <MakeGroupCard view={snapshot.noGroup} wizardOn={snapshot.copilot.enabled} onMakeGroup={host.makeGroup}
                onFixWithWizard={(storyId, missing) => host.fixGroupWithWizard?.(storyId, missing)} />
            )}
            <Lazy fallback={null}><GroupStoryBinding snapshot={snapshot} busy={busy} /></Lazy>
            <button type="button" className="menu_button self-start" onClick={host.openStory}>Open story and chat preferences</button>
          </SettingsArea>}
          {show("memory") && <SettingsArea {...area("memory")}>
            <p className="text-xs opacity-80">Connection Manager owns the actual model profiles. Choose which profiles this extension uses here; changes affect every chat.</p>
            <Lazy fallback={null}><MemoryModelGroup snapshot={snapshot} manager={manager} connectionsOnly={workspaceSection === "connections"} /></Lazy>
            {workspaceSection === "connections" && <Lazy fallback={null}><ChapterBudgetGroup snapshot={snapshot} manager={manager} /></Lazy>}
          </SettingsArea>}
          {show("characters") && <SettingsArea {...area("characters")}>
            <Lazy fallback={null}><TalkGroup snapshot={snapshot} manager={manager} /></Lazy>
            <Lazy fallback={null}><InnerVoiceGroup snapshot={snapshot} manager={manager} /></Lazy>
            <Lazy fallback={null}><CharacterStateGroup snapshot={snapshot} manager={manager} /></Lazy>
          </SettingsArea>}
          {show("world") && <SettingsArea {...area("world")}>
            <Lazy fallback={null}><LorebooksGroup snapshot={snapshot} manager={manager} /></Lazy>
          </SettingsArea>}
          {show("images") && <SettingsArea {...area("images")}>
            <Lazy fallback={<div className="text-xs">Loading image setup…</div>}><ImageGroup manager={manager} /></Lazy>
            <Lazy fallback={null}><SpriteGroup manager={manager} /></Lazy>
          </SettingsArea>}
          {show("judge") && <SettingsArea {...area("judge")}>
            <Lazy fallback={null}><JudgeSettingsGroup settings={judge.judge} status={judge.status} selfTest={judge.selfTest} authorView={snapshot.ui.authorView} meter={snapshot.judgeMeter}
              wardenEnabled={wardenOn} onChange={judge.change} onSaveKey={writeJudgeSecret} onRefresh={judge.recheck} onRunSelfTest={() => void judge.test()} /></Lazy>
          </SettingsArea>}
          {show("authoring") && (
            <SettingsArea {...area("authoring")}>
              <CheckRow id="so-copilot-enabled" setting="copilot.enabled" checked={snapshot.copilot.enabled} onChange={(on) => manager.setCopilotSettings({ enabled: on })} />
            </SettingsArea>
          )}
          {show("setup") && <SettingsArea {...area("setup")}>
            <CheckRow id="so-copilot-ask" setting="copilot.ask" checked={snapshot.copilot.ask} onChange={(on) => manager.setCopilotSettings({ ask: on })} />
            <Lazy fallback={null}><CapabilitiesGroup reports={hostProbe.capabilities} facts={hostProbe.facts}
              memoryModel={host.memoryModelLimit(snapshot.extraction.settings.profileId)} onRefresh={() => { host.recheckMemoryModel(); hostProbe.probe(true); }} /></Lazy>
            {snapshot.ui.authorView && <div data-so="engine-status" className="text-xs opacity-80">{snapshot.status}</div>}
          </SettingsArea>}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
