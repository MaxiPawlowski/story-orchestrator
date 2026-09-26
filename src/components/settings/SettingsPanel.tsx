import { useCallback, useEffect, useState } from "react";
import { capabilityReport, hostFacts, judgeStatus, writeJudgeSecret, type CapabilityReport, type HostFacts } from "@services/STAPI";
import { runJudgeDirectorSelfTest, type JudgeSelfTestReport } from "@judge/index";
import { getGlobalSettings, setJudgeSettings } from "@runtime/settingsStore";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import CapabilitiesGroup, { type CapabilitiesGroupProps } from "./CapabilitiesGroup";
import EntryPoints from "./EntryPoints";
import JudgeSettingsGroup, { type JudgeSettingsGroupProps, type JudgeSettingsPatch } from "./JudgeSettingsGroup";
import { StoryGroup } from "./StoryGroup";
import { MemoryModelGroup } from "./MemoryModelGroup";
import { DisplayGroup, GroupChatGroup, LorebooksGroup, PacingGroup, StagecraftGroup } from "./PlayGroups";

export interface SettingsHost {
  extensionVersion: string;
  memoryModelLimit: (profileId: string | null) => CapabilitiesGroupProps["memoryModel"];
  recheckMemoryModel: () => void;
  openWizard: () => void;
  openStudio: () => void;
  openWizardForRequirements: () => void;
  revealSetting: (id: string) => void;
}

interface SettingsPanelProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  host: SettingsHost;
}

const useJudgeControls = () => {
  const [judge, setJudge] = useState(() => getGlobalSettings().judge);
  const [status, setStatus] = useState<JudgeSettingsGroupProps["status"]>("unchecked");
  const [selfTest, setSelfTest] = useState<{ running: boolean; report: JudgeSelfTestReport | null }>({ running: false, report: null });

  const recheck = useCallback(() => {
    setStatus("checking");
    globalThis.storyOrchestratorJudge?.invalidateStatus();
    void judgeStatus().then(setStatus);
  }, []);

  const change = (patch: JudgeSettingsPatch) => {
    const next = setJudgeSettings(patch).judge;
    setJudge(next);
    if (patch.enabled) recheck();
  };

  const test = async () => {
    const runtime = globalThis.storyOrchestratorJudge;
    if (!runtime) return;
    setSelfTest({ running: true, report: null });
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
  const judge = useJudgeControls();
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
            onRevealSetting={host.revealSetting}
            onFixWithWizard={host.openWizardForRequirements}
          />
          <StoryGroup snapshot={snapshot} manager={manager} busy={busy} setBusy={setBusy} importOpen={importOpen} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={snapshot.copilot.enabled} onChange={(event) => manager.setCopilotSettings({ enabled: event.target.checked })} />
            <span>Enable story copilot (authoring tab + in-play driver)</span>
          </label>
          <MemoryModelGroup snapshot={snapshot} manager={manager} />
          <DisplayGroup snapshot={snapshot} manager={manager} />
          <GroupChatGroup snapshot={snapshot} manager={manager} />
          <LorebooksGroup snapshot={snapshot} />
          <StagecraftGroup snapshot={snapshot} manager={manager} />
          <JudgeSettingsGroup
            settings={judge.judge}
            status={judge.status}
            selfTest={judge.selfTest}
            authorView={snapshot.ui.authorView}
            meter={snapshot.judgeMeter}
            wardenEnabled={wardenOn}
            onChange={judge.change}
            onSaveKey={writeJudgeSecret}
            onRefresh={judge.recheck}
            onRunSelfTest={() => void judge.test()}
          />
          <CapabilitiesGroup
            reports={hostProbe.capabilities}
            facts={hostProbe.facts}
            extensionVersion={host.extensionVersion}
            memoryModel={host.memoryModelLimit(snapshot.extraction.settings.profileId)}
            onRefresh={() => {
              host.recheckMemoryModel();
              hostProbe.probe(true);
            }}
          />
          <PacingGroup snapshot={snapshot} manager={manager} />
          <div className="text-xs opacity-80">{snapshot.status}</div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
