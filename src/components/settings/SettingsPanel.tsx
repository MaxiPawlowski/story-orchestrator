import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ChatPanel } from "@runtime/chatPanels";
import { wardenJudged } from "@runtime/surfaceShown";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { capabilityReport, hostFacts, judgeStatus, stImageSource, writeJudgeSecret, type CapabilityReport, type HostFacts } from "@services/STAPI";
import type { JudgeSelfTestReport } from "@judge/selfTest";
import { getGlobalSettings, setGlobalSettings, setJudgeSettings } from "@runtime/settingsStore";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { gettingStartedSteps, imagesStepDone, installFindings, viewerRepairStep, type OneClickFix } from "@runtime/repair";
import { guideUrl } from "@features/guideLinks";
import type { FeatureWhere } from "@features/registry";
import { requestGuide } from "@guide/request";
import { requestTour } from "@guide/tour/request";
import { GUIDE_COPY, HELP_COPY } from "@features/helpCopy";
import { workspaceNavigation, type WorkspacePage } from "@runtime/workspaceNavigation";
import { FEATURE_CONTROLS } from "@runtime/featureControls";
import type { StoryFeatureId } from "@engine/featurePolicy";
import type { ContinueRow } from "@runtime/playsIndex";
import type { MakeGroupOutcome } from "@runtime/makeGroup";
import { wiGating } from "@runtime/worldInfoScanHost";
import { keepGlobalStoryLore, releaseGlobalStoryLore } from "@runtime/storyLoreHost";
import { chapterSettings } from "@runtime/chapters";
import { Section } from "@components/ui/Section";
import { SettingRow } from "@components/ui/SettingRow";
import { Button } from "@components/ui/Button";
import type { WorkspaceNavigate } from "@components/workspace/WorkspaceShell";
import type { CapabilitiesGroupProps } from "./CapabilitiesGroup";
import EntryPoints from "./EntryPoints";
import type { JudgeSettingsGroupProps, JudgeSettingsPatch } from "./JudgeSettingsGroup";
import { CheckRow } from "./Field";
import StoryLoreGlobal from "./StoryLoreGlobal";
import WorldInfoGatingGroup from "./WorldInfoGatingGroup";
import { log } from "@utils/log";

const ImagesPage = lazyRetry(() => import("./ImagesPage"));
const DisplayPage = lazyRetry(() => import("./DisplayPage"));
const JudgeSettingsGroup = lazyRetry(() => import("./JudgeSettingsGroup"));
const MemoryModelGroup = lazyRetry(() => import("./MemoryModelGroup").then((module) => ({ default: module.MemoryModelGroup })));
const ChapterBudgetField = lazyRetry(() => import("./ChapterRecordControls").then((module) => ({ default: module.ChapterBudgetField })));
const CapabilitiesGroup = lazyRetry(() => import("./CapabilitiesGroup"));
const GettingStarted = lazyRetry(() => import("./GettingStarted"));
const StoryImport = lazyRetry(() => import("./StoryGroup").then((module) => ({ default: module.StoryImport })));

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
  setAuthorView?: (on: boolean) => void;
  showFeature: (where: FeatureWhere) => void;
  makeGroup?: (storyId: string) => Promise<MakeGroupOutcome>;
  fixGroupWithWizard?: (storyId: string, missing: string[]) => void;
  openPlay?: (row: ContinueRow) => void;
  openPanel?: (panel: "help" | "guide" | ChatPanel) => void;
  openGuide?: (doc: string) => void;
}

export type SettingsPageId = Exclude<WorkspacePage, "play" | "features" | "review" | "author">;

export interface SettingsPanelProps {
  page: SettingsPageId;
  sub?: string;
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  host: SettingsHost;
  navigate: WorkspaceNavigate;
}

type PageProps = Omit<SettingsPanelProps, "page">;

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
    manager.notify();
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

  useEffect(() => { if (getGlobalSettings().judge.enabled) recheck(); }, [recheck]);
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
  useEffect(() => { probe(false); }, [probe]);
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

export const FeatureLinkRow = ({ feature, snapshot, navigate, field = "enabled" }: {
  feature: StoryFeatureId; snapshot: RuntimeSnapshot; navigate: WorkspaceNavigate; field?: string;
}) => {
  const config = FEATURE_CONTROLS[feature];
  const on = snapshot.features?.[feature]?.enabled;
  const state = on === undefined ? "" : on ? "On. " : "Off. ";
  return <SettingRow data-so="feature-link-row" label={config.name} description={`${state}${config.description} Set in Features.`}
    control={<Button id={`so-feature-link-${feature}`} variant="ghost" size="sm" icon="fa-arrow-right"
      onClick={() => navigate({ context: "orchestrator", page: "features", feature }, `so-feature-${feature}-${field}`)}>Change</Button>} />;
};

const PageHead = ({ title, description }: { title: string; description: string }) => (
  <header className="so-page-head"><h2>{title}</h2><p className="so-section-desc">{description}</p></header>
);

const LibraryPage = ({ snapshot, manager, host }: PageProps) => {
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(() => getGlobalSettings().help.checklistDismissed);
  const extraction = snapshot.extraction.settings;
  const [judgeConfigured, setJudgeConfigured] = useState(false);
  useEffect(() => {
    if (!getGlobalSettings().judge.enabled) return;
    void judgeStatus().then((status) => setJudgeConfigured(typeof status === "object" && status !== null && status.configured));
  }, []);
  const steps = gettingStartedSteps({
    memoryModel: extraction.enabled && Boolean(extraction.profileId),
    judgeReady: getGlobalSettings().judge.enabled && judgeConfigured,
    imagesReady: imagesStepDone(getGlobalSettings().image, stImageSource()),
  });
  const repairCheck = viewerRepairStep(snapshot)?.check;
  const installChecks = installFindings(snapshot).filter((check) => check.check !== repairCheck);
  return <EntryPoints
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
    importer={<Lazy fallback={null}><StoryImport snapshot={snapshot} manager={manager} busy={busy} setBusy={setBusy} /></Lazy>}
    gettingStarted={<Lazy fallback={null}><GettingStarted steps={steps} dismissed={checklistDismissed} onReveal={host.revealSetting} installChecks={installChecks}
      onHide={() => setChecklistDismissed(setGlobalSettings({ help: { checklistDismissed: true } }).help.checklistDismissed)} /></Lazy>}
  />;
};

const ModelsPage = ({ snapshot, manager, navigate }: PageProps) => (
  <div className="so-settings-page">
    <PageHead title="Models" description="Which Connection Manager profiles do the extension's work. Connection Manager owns the profiles; changes here affect every chat." />
    <Lazy fallback={null}><MemoryModelGroup snapshot={snapshot} manager={manager}
      onOpenReplyThinking={() => navigate({ context: "orchestrator", page: "features", feature: "thinking" }, "so-feature-thinking-effort")} /></Lazy>
  </div>
);

const JudgePage = ({ snapshot, manager }: PageProps) => {
  const judge = useJudgeControls(manager);
  return <div className="so-settings-page">
    <PageHead title="Judge" description="An optional service that checks the extension's work. This page is the one place to switch its checks on or off." />
    <Lazy fallback={null}><JudgeSettingsGroup settings={judge.judge} status={judge.status} selfTest={judge.selfTest} authorView={snapshot.ui.authorView} meter={snapshot.judgeMeter}
      wardenEnabled={wardenJudged(snapshot.stagecraft.settings)} onChange={judge.change} onSaveKey={writeJudgeSecret} onRefresh={judge.recheck}
      onRunSelfTest={() => void judge.test()} /></Lazy>
  </div>;
};

const WorldPage = ({ snapshot, manager, navigate }: PageProps) => {
  const [releasing, setReleasing] = useState(false);
  return <div className="so-settings-page">
    <PageHead title="World & lore" description="How story lorebooks reach the chats that play them. Affects every chat." />
    <Section id="so-lorebooks-header" title="Story lorebooks" level={3}>
      <StoryLoreGlobal books={snapshot.globalStoryLore ?? []} busy={releasing}
        onRelease={() => { setReleasing(true); void releaseGlobalStoryLore().finally(() => { setReleasing(false); manager.notify(); }); }}
        onKeep={() => { keepGlobalStoryLore(); manager.notify(); }} />
      <WorldInfoGatingGroup status={snapshot.wiGating ?? null} authorView={snapshot.ui.authorView}
        onChoose={(mode) => void (mode === "scan" ? wiGating()?.requestScan() : wiGating()?.requestFile())} onRenormalize={() => void wiGating()?.renormalize()} />
    </Section>
    <Section title="Lore features" level={3}>
      <FeatureLinkRow feature="memoryLore" snapshot={snapshot} navigate={navigate} />
      <FeatureLinkRow feature="lateLore" snapshot={snapshot} navigate={navigate} />
      <FeatureLinkRow feature="curator" snapshot={snapshot} navigate={navigate} />
    </Section>
  </div>;
};

const AuthoringPage = ({ snapshot, manager, navigate }: PageProps) => (
  <div className="so-settings-page">
    <PageHead title="Authoring" description="The wizard, questions and the author's tools. Affects every chat unless a row says otherwise." />
    <CheckRow id="so-copilot-enabled" setting="copilot.enabled" checked={snapshot.copilot.enabled} onChange={(on) => manager.setCopilotSettings({ enabled: on })} />
    <CheckRow id="so-copilot-ask" setting="copilot.ask" checked={snapshot.copilot.ask} onChange={(on) => manager.setCopilotSettings({ ask: on })} />
    <div id="so-chapter-budget-group">
      <Lazy fallback={null}><ChapterBudgetField stored={snapshot.memory.settings.chapters}
        onWrite={(next) => manager.setMemorySettings({ chapters: { ...chapterSettings(snapshot.memory.settings.chapters), ...next } })} /></Lazy>
    </div>
    <SettingRow data-so="author-view-link" label="Author view" scope="chat"
      description={`${snapshot.ui.authorView ? "On" : "Off"} in this chat. Shows what the story hides, so it is set per chat.`}
      control={<Button id="so-authoring-author-view" variant="ghost" size="sm" icon="fa-arrow-right"
        onClick={() => navigate({ context: "story", page: "features" }, "so-author-view-switch")}>Change</Button>} />
  </div>
);

const DiagnosticsPage = ({ snapshot, host }: PageProps) => {
  const hostProbe = useHostProbe();
  return <div className="so-settings-page" id="so-diagnostics">
    <PageHead title="Diagnostics" description="What this SillyTavern can do, and a copy of it for a bug report." />
    <Lazy fallback={null}><CapabilitiesGroup reports={hostProbe.capabilities} facts={hostProbe.facts}
      memoryModel={host.memoryModelLimit(snapshot.extraction.settings.profileId)} onRefresh={() => { host.recheckMemoryModel(); hostProbe.probe(true); }} /></Lazy>
    {snapshot.ui.authorView && <SettingRow label="Engine status" description={<span data-so="engine-status">{snapshot.status}</span>} />}
  </div>;
};

const HelpPage = ({ host }: PageProps) => (
  <div className="so-settings-page">
    <PageHead title="Help" description="Learn the extension, or ask a question about it." />
    <div className="so-actions">
      <Button id="so-help-quick-start" data-so="help-quick-start" icon="fa-flag-checkered" onClick={() => openGuideFromWorkspace(QUICK_START_DOC)}>{HELP_COPY.quickStart}</Button>
      <Button id="so-help-tour" data-so="help-tour" icon="fa-route" onClick={() => requestTour()}>{HELP_COPY.tour}</Button>
      <Button id="so-help-tour-setup" data-so="help-tour-setup" icon="fa-list-check" onClick={() => openGuideFromWorkspace(SETUP_PATH_DOC)}>{HELP_COPY.setupPath}</Button>
      {host.openPanel && <Button id="so-help-open-panel" data-so="help-open-panel" icon="fa-circle-question" onClick={() => host.openPanel?.("help")}>{HELP_COPY.openPanel}</Button>}
      {host.openPanel && <Button id="so-help-open-guide" data-so="help-open-guide" icon="fa-book" onClick={() => host.openPanel?.("guide")}>{GUIDE_COPY.open}</Button>}
    </div>
  </div>
);

const PAGES: Record<SettingsPageId, (props: PageProps) => ReactNode> = {
  library: LibraryPage,
  models: ModelsPage,
  judge: JudgePage,
  images: (props) => <Lazy><ImagesPage {...props} /></Lazy>,
  world: WorldPage,
  display: (props) => <Lazy><DisplayPage {...props} /></Lazy>,
  authoring: AuthoringPage,
  diagnostics: DiagnosticsPage,
  help: HelpPage,
};

const SettingsPanel = ({ page, ...props }: SettingsPanelProps) => {
  const Page = PAGES[page];
  return <div id="so-workspace-settings" data-section={page}><Page {...props} /></div>;
};

export default SettingsPanel;
