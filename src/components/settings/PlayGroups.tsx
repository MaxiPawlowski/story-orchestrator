import { lazy, Suspense, useState } from "react";
import { TALK_CHAIN_MAX_CAP } from "@engine/index";
import type { RuntimeManager } from "@runtime/index";
import { getGlobalSettings, type TalkChainSettings } from "@runtime/settingsStore";
import type { RuntimeSnapshot } from "@runtime/types";
import { wiGating } from "@runtime/worldInfoScanHost";
import { STAGECRAFT_ACCEPT_MODES, type StagecraftAcceptMode } from "@stagecraft/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import WorldInfoGatingGroup from "./WorldInfoGatingGroup";
import { GroupHeader } from "./GroupHeader";

const InlineControls = lazy(() => import("./InlineControls"));
const ChapterControls = lazy(() => import("./ChapterControls"));
const InnerVoiceControls = lazy(() => import("./InnerVoiceControls"));

interface GroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
}

const isAcceptMode = (value: string): value is StagecraftAcceptMode => (STAGECRAFT_ACCEPT_MODES as readonly string[]).includes(value);

const CURATOR_HELP = "A background agent that reads what has happened and proposes changes to the story's own lorebook — switching entries on or off, correcting text the story " +
  "has overtaken. It only ever touches the lorebooks the story lists for it, it proposes rather than writes, and it can never change story progress or memory.";
const WARDEN_HELP = "After each character reply, the judgment model checks it against the story's established facts. When the reply breaks one, a note restating that fact goes " +
  "into the next reply's prompt, once. Needs the judgment model switched on. Sends: the reply text, up to 40 established facts and the ledger's tracked values.";

export const DisplayGroup = ({ snapshot, manager }: GroupProps) => (
  <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
    <GroupHeader title="Display" scope="install" id="so-display-header" />
    <Suspense fallback={null}><InlineControls snapshot={snapshot} manager={manager} /></Suspense>
    <Suspense fallback={null}><ChapterControls snapshot={snapshot} manager={manager} /></Suspense>
    <label className="flex items-center gap-2 text-sm">
      <input id="so-announce-transitions" type="checkbox" checked={snapshot.ui.announceTransitions} onChange={(event) => manager.setUiSettings({ announceTransitions: event.target.checked })} />
      <span>Also post a chat note when the checkpoint changes</span>
    </label>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={snapshot.ui.hudEnabled} onChange={(event) => manager.setUiSettings({ hudEnabled: event.target.checked })} />
      <span>Show story status above the chat input</span>
    </label>
  </div>
);

export const LorebooksGroup = ({ snapshot, manager }: GroupProps) => {
  const [scanMemory, setScanMemory] = useState(() => getGlobalSettings().worldInfo.scanMemory);
  return (
    <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <GroupHeader title="Lorebooks" scope="install" id="so-lorebooks-header" />
      <WorldInfoGatingGroup
        status={snapshot.wiGating ?? null}
        authorView={snapshot.ui.authorView}
        onChoose={(mode) => void (mode === "scan" ? wiGating()?.requestScan() : wiGating()?.requestFile())}
        onRenormalize={() => void wiGating()?.renormalize()}
        scanMemory={scanMemory}
        onScanMemory={(on) => {
          manager.setScanMemory(on);
          setScanMemory(getGlobalSettings().worldInfo.scanMemory);
        }}
      />
    </div>
  );
};

const WardenControls = ({ snapshot, manager }: GroupProps) => (
  <>
    <label className="flex items-center gap-2 text-sm">
      <input
        id="so-warden-enabled"
        type="checkbox"
        checked={snapshot.stagecraft.settings.wardenEnabled}
        onChange={(event) => manager.setStagecraftSettings({ wardenEnabled: event.target.checked })}
      />
      <span>Continuity warden <HelpTooltip title={WARDEN_HELP} /></span>
    </label>
    <label className="flex flex-col gap-1 text-sm">
      <span>Warden notes</span>
      <select
        id="so-warden-accept-mode"
        value={snapshot.stagecraft.settings.wardenAcceptMode}
        onChange={(event) => manager.setStagecraftSettings({ wardenAcceptMode: isAcceptMode(event.target.value) ? event.target.value : "review" })}
      >
        <option value="review">Ask me first</option>
        <option value="auto">Add them on their own</option>
        <option value="off">Don&apos;t check replies</option>
      </select>
    </label>
  </>
);

export const StagecraftGroup = ({ snapshot, manager }: GroupProps) => (
  <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
    <GroupHeader title="Stagecraft" scope="install" id="so-stagecraft-header" />
    <label className="flex items-center gap-2 text-sm">
      <input
        id="so-curator-enabled"
        type="checkbox"
        checked={snapshot.stagecraft.settings.curatorEnabled}
        onChange={(event) => manager.setStagecraftSettings({ curatorEnabled: event.target.checked })}
      />
      <span>World Info curator <HelpTooltip title={CURATOR_HELP} /></span>
    </label>
    <label className="flex flex-col gap-1 text-sm">
      <span>Curator changes</span>
      <select
        id="so-curator-accept-mode"
        value={snapshot.stagecraft.settings.acceptMode}
        onChange={(event) => manager.setStagecraftSettings({ acceptMode: isAcceptMode(event.target.value) ? event.target.value : "review" })}
      >
        <option value="review">Ask me first</option>
        <option value="auto">Apply on their own</option>
        <option value="off">Only show me what it would do</option>
      </select>
    </label>
    {snapshot.stagecraft.settings.curatorEnabled && snapshot.ready && snapshot.stagecraftScope.length === 0 && (
      <div id="so-curator-unscoped" className="text-xs opacity-70">This story lists no lorebook for the curator, so it stays idle. Add one on the Studio&apos;s Story tab.</div>
    )}
    {snapshot.ui.authorView && <WardenControls snapshot={snapshot} manager={manager} />}
    {snapshot.ui.authorView && <Suspense fallback={null}><InnerVoiceControls snapshot={snapshot} manager={manager} /></Suspense>}
  </div>
);

const CHAIN_HELP = "A single player message can be answered by more than one character. The judgment model picks each next speaker and stops when it hands the turn back to you; " +
  "a story may set its own order on a checkpoint. Off: one voice per turn, as before.";

export const TalkGroup = ({ snapshot, manager }: GroupProps) => {
  const [, bump] = useState(0);
  const chain = getGlobalSettings().talk.chain;
  const update = (patch: Partial<TalkChainSettings>) => {
    manager.setTalkChainSettings(patch);
    bump((value) => value + 1);
  };
  return (
    <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <GroupHeader title="Speaker direction" scope="install" id="so-talk-header" />
      <label className="flex items-center gap-2 text-sm">
        <input id="so-chain-enabled" type="checkbox" checked={chain.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
        <span>Several characters may answer one message <HelpTooltip title={CHAIN_HELP} /></span>
      </label>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span>Voices per turn at most</span>
        <input
          id="so-chain-max"
          type="number"
          min={1}
          max={TALK_CHAIN_MAX_CAP}
          className="st-input w-20"
          value={chain.max}
          onChange={(event) => update({ max: Math.min(TALK_CHAIN_MAX_CAP, Math.max(1, Math.round(Number(event.target.value) || 1))) })}
        />
      </label>
      {snapshot.ui.authorView && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input id="so-chain-stop-transition" type="checkbox" checked={chain.stopOnTransition} onChange={(event) => update({ stopOnTransition: event.target.checked })} />
            <span>End the chain when the scene changes</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input id="so-chain-hold-extraction" type="checkbox" checked={chain.holdExtraction} onChange={(event) => update({ holdExtraction: event.target.checked })} />
            <span>Wait for the whole reply before reading the scene <HelpTooltip title="Off: each voice's turn is read as it lands, so a scene change can interrupt the chain." /></span>
          </label>
        </>
      )}
    </div>
  );
};

export const PacingGroup = ({ snapshot, manager }: GroupProps) => (
  <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
    <GroupHeader title="Pacing" scope="install" id="so-pacing-header" />
    <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span>Smoothing α <span className="opacity-60">(install-wide)</span> <HelpTooltip title={"How quickly the measured tension follows the latest scene. Higher = jumpier, " +
          "lower = smoother."} /></span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={snapshot.pacing.alpha}
          onChange={(event) => manager.setPacingSettings({ alpha: Math.min(1, Math.max(0, Number(event.target.value) || 0)) })}
        />
      </label>
      <label className="flex flex-wrap items-center gap-2 mt-5">
        <input type="checkbox" checked={snapshot.pacing.hintEnabled} onChange={(event) => manager.setPacingSettings({ hintEnabled: event.target.checked })} />
        <span className="min-w-0">Steering hint <HelpTooltip title="Quietly nudge the main model toward the story's intended tension (escalate or cool down) via an injected note." /></span>
      </label>
    </div>
  </div>
);
