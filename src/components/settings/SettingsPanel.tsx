import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { askHost } from "@runtime/askEntry";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { capabilityReport, hostFacts, judgeStatus, writeJudgeSecret, type CapabilityReport, type HostFacts } from "@services/STAPI";
import type { JudgeSelfTestReport } from "@judge/selfTest";
import { getGlobalSettings, setGlobalSettings, setJudgeSettings } from "@runtime/settingsStore";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { gettingStartedSteps, installFindings, type OneClickFix } from "@runtime/repair";
import { guideUrl } from "@features/guideLinks";
import type { FeatureArea, FeatureWhere } from "@features/registry";
import { requestGuide } from "@guide/request";
import type { ContinueRow } from "@runtime/playsIndex";
import { HelpButton } from "../help/HelpButton";
import type { CapabilitiesGroupProps } from "./CapabilitiesGroup";
import EntryPoints from "./EntryPoints";
import MakeGroupCard from "./MakeGroupCard";
import type { MakeGroupOutcome } from "@runtime/makeGroup";
import type { JudgeSettingsGroupProps, JudgeSettingsPatch } from "./JudgeSettingsGroup";
import { authoringSettings } from "./settingsVisibility";
import { SettingsArea } from "./SettingsArea";
import { CheckRow } from "./Field";
import { log } from "@utils/log";

const ImageGroup = lazyRetry(() => import("../../image/ImageGroup"));
const SpriteGroup = lazyRetry(() => import("../../sprites/SpriteGroup"));
const GroupStoryBinding = lazyRetry(() => import("./GroupStoryBinding"));
const JudgeSettingsGroup = lazyRetry(() => import("./JudgeSettingsGroup"));
const HelpHost = lazyRetry(() => import("../help/HelpHost"));
const MemoryModelGroup = lazyRetry(() => import("./MemoryModelGroup").then((module) => ({ default: module.MemoryModelGroup })));
const ChapterGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.ChapterGroup })));
const DisplayGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.DisplayGroup })));
const InnerVoiceGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.InnerVoiceGroup })));
const LorebooksGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.LorebooksGroup })));
const PacingGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.PacingGroup })));
const StagecraftGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.StagecraftGroup })));
const TalkGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.TalkGroup })));
const CharacterStateGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.CharacterStateGroup })));
const TransitionNoteRow = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.TransitionNoteRow })));
const WardenGroup = lazyRetry(() => import("./PlayGroups").then((module) => ({ default: module.WardenGroup })));
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
  openGuide?: (doc: string) => void;
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

const openGuideDoc = (doc: string) => {
  if (requestGuide(doc)) return;
  const url = guideUrl(doc);
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

const SettingsPanel = ({ snapshot, manager, host }: SettingsPanelProps) => {
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const judge = useJudgeControls(manager);
  const hostProbe = useHostProbe();
  const areas = useOpenAreas();
  const openGuide = host.openGuide ?? openGuideDoc;
  const area = (id: FeatureArea) => ({ area: id, open: areas.open.includes(id), onToggle: areas.toggle, onGuide: openGuide });

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
          {helpOpen && !host.toggleHelp && <Lazy fallback={null}><HelpHost authorView={snapshot.ui.authorView} onShowMe={host.showFeature} onClose={() => setHelpOpen(false)}
            ask={async (question) => (await askHost()).askInChat(manager, question)} /></Lazy>}
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
            gettingStarted={<Lazy fallback={null}><GettingStarted steps={steps} dismissed={checklistDismissed} onReveal={host.revealSetting} installChecks={installFindings(snapshot)}
              onHide={() => setChecklistDismissed(setGlobalSettings({ help: { checklistDismissed: true } }).help.checklistDismissed)} /></Lazy>}
          />
          <SettingsArea {...area("play")} advanced={<Lazy fallback={null}><TransitionNoteRow snapshot={snapshot} manager={manager} /></Lazy>}>
            <Lazy fallback={null}><StoryGroup snapshot={snapshot} manager={manager} busy={busy} setBusy={setBusy} importOpen={importOpen} /></Lazy>
            {snapshot.noGroup && host.makeGroup && (
              <MakeGroupCard view={snapshot.noGroup} wizardOn={snapshot.copilot.enabled} onMakeGroup={host.makeGroup}
                onFixWithWizard={(storyId, missing) => host.fixGroupWithWizard?.(storyId, missing)} />
            )}
            <Lazy fallback={null}><GroupStoryBinding snapshot={snapshot} busy={busy} /></Lazy>
            <button type="button" className="menu_button self-start" onClick={host.openDrawer}>Open story and chat preferences</button>
            <Lazy fallback={null}><DisplayGroup snapshot={snapshot} manager={manager} /></Lazy>
            <Lazy fallback={null}><PacingGroup snapshot={snapshot} manager={manager} /></Lazy>
          </SettingsArea>
          <SettingsArea {...area("memory")}>
            <p className="text-xs opacity-80">Connection Manager owns the actual model profiles. Choose which profiles this extension uses here; changes affect every chat.</p>
            <Lazy fallback={null}><MemoryModelGroup snapshot={snapshot} manager={manager} /></Lazy>
            <Lazy fallback={null}><ChapterGroup snapshot={snapshot} manager={manager} /></Lazy>
            <Lazy fallback={null}><WardenGroup snapshot={snapshot} manager={manager} /></Lazy>
          </SettingsArea>
          <SettingsArea {...area("characters")}>
            <Lazy fallback={null}><TalkGroup snapshot={snapshot} manager={manager} /></Lazy>
            <Lazy fallback={null}><InnerVoiceGroup snapshot={snapshot} manager={manager} /></Lazy>
            <Lazy fallback={null}><CharacterStateGroup snapshot={snapshot} manager={manager} /></Lazy>
          </SettingsArea>
          <SettingsArea {...area("world")}>
            <Lazy fallback={null}><LorebooksGroup snapshot={snapshot} manager={manager} /></Lazy>
            <Lazy fallback={null}><StagecraftGroup snapshot={snapshot} manager={manager} /></Lazy>
          </SettingsArea>
          <SettingsArea {...area("images")}>
            <Lazy fallback={<div className="text-xs">Loading image setup…</div>}><ImageGroup manager={manager} /></Lazy>
            <Lazy fallback={null}><SpriteGroup manager={manager} /></Lazy>
          </SettingsArea>
          <SettingsArea {...area("judge")}>
            <Lazy fallback={null}><JudgeSettingsGroup settings={judge.judge} status={judge.status} selfTest={judge.selfTest} authorView={snapshot.ui.authorView} meter={snapshot.judgeMeter}
              wardenEnabled={wardenOn} onChange={judge.change} onSaveKey={writeJudgeSecret} onRefresh={judge.recheck} onRunSelfTest={() => void judge.test()} /></Lazy>
          </SettingsArea>
          {authoringSettings(snapshot) && (
            <SettingsArea {...area("authoring")}>
              <CheckRow id="so-copilot-enabled" setting="copilot.enabled" checked={snapshot.copilot.enabled} onChange={(on) => manager.setCopilotSettings({ enabled: on })} />
            </SettingsArea>
          )}
          <SettingsArea {...area("setup")}>
            <CheckRow id="so-copilot-ask" setting="copilot.ask" checked={snapshot.copilot.ask} onChange={(on) => manager.setCopilotSettings({ ask: on })} />
            <Lazy fallback={null}><CapabilitiesGroup reports={hostProbe.capabilities} facts={hostProbe.facts}
              memoryModel={host.memoryModelLimit(snapshot.extraction.settings.profileId)} onRefresh={() => { host.recheckMemoryModel(); hostProbe.probe(true); }} /></Lazy>
            {snapshot.ui.authorView && <div data-so="engine-status" className="text-xs opacity-80">{snapshot.status}</div>}
          </SettingsArea>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
