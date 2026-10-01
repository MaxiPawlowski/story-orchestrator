import { useState } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { TALK_CHAIN_MAX_CAP } from "@engine/index";
import type { RuntimeManager } from "@runtime/index";
import { PLAYER_COPY } from "@runtime/narrative";
import { getGlobalSettings, type TalkChainSettings } from "@runtime/settingsStore";
import type { RuntimeSnapshot } from "@runtime/types";
import { wiGating } from "@runtime/worldInfoScanHost";
import { STAGECRAFT_ACCEPT_MODES, type StagecraftAcceptMode } from "@stagecraft/index";
import WorldInfoGatingGroup from "./WorldInfoGatingGroup";
import { GroupHeader } from "./GroupHeader";
import { CheckRow, FieldLabel } from "./Field";

const InlineControls = lazyRetry(() => import("./InlineControls"));
const ChapterControls = lazyRetry(() => import("./ChapterControls"));
const InnerVoiceControls = lazyRetry(() => import("./InnerVoiceControls"));

interface GroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
}

export const authoringSettings = (snapshot: RuntimeSnapshot): boolean => snapshot.ui.authorView || !snapshot.storyId;

const isAcceptMode = (value: string): value is StagecraftAcceptMode => (STAGECRAFT_ACCEPT_MODES as readonly string[]).includes(value);

const CURATOR_HELP = "A background agent that reads what has happened and proposes changes to the story's own lorebook — switching entries on or off, correcting text the story " +
  "has overtaken. It only ever touches the lorebooks the story lists for it, it proposes rather than writes, and it can never change story progress or memory.";
const WARDEN_HELP = "After each character reply, the judge checks it against the story's established facts. When the reply breaks one, a note restating that fact goes " +
  "into the next reply's prompt, once. Needs the judge switched on. Sends: the reply text, up to 40 established facts and the ledger's tracked values.";

export const DisplayGroup = ({ snapshot, manager }: GroupProps) => (
  <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
    <GroupHeader title="Display" scope="install" id="so-display-header" />
    <Lazy fallback={null}><InlineControls snapshot={snapshot} manager={manager} /></Lazy>
    <Lazy fallback={null}><ChapterControls snapshot={snapshot} manager={manager} /></Lazy>
    <CheckRow id="so-announce-transitions" checked={snapshot.ui.announceTransitions} onChange={(on) => manager.setUiSettings({ announceTransitions: on })}
      label={PLAYER_COPY.announceTransitions} />
    <CheckRow checked={snapshot.ui.hudEnabled} onChange={(on) => manager.setUiSettings({ hudEnabled: on })} label="Show story status above the chat input" />
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

const WardenControls = ({ snapshot, manager }: GroupProps) => {
  const { wardenEnabled, wardenAcceptMode } = snapshot.stagecraft.settings;
  const on = wardenEnabled && wardenAcceptMode !== "off";
  const mode = wardenAcceptMode === "off" ? "review" : wardenAcceptMode;
  return (
    <>
      <CheckRow id="so-warden-enabled" checked={on} label="Continuity warden" help={WARDEN_HELP}
        onChange={(next) => manager.setStagecraftSettings(next ? { wardenEnabled: true, wardenAcceptMode: mode } : { wardenEnabled: false })} />
      <div className="flex flex-col gap-1 text-sm">
        <FieldLabel htmlFor="so-warden-accept-mode" label="Warden notes" />
        <select
          id="so-warden-accept-mode"
          value={mode}
          disabled={!on}
          onChange={(event) => manager.setStagecraftSettings({ wardenAcceptMode: isAcceptMode(event.target.value) && event.target.value !== "off" ? event.target.value : "review" })}
        >
          <option value="review">Ask me first</option>
          <option value="auto">Add them on their own</option>
        </select>
      </div>
    </>
  );
};

export const StagecraftGroup = ({ snapshot, manager }: GroupProps) => {
  if (!authoringSettings(snapshot)) return null;
  return (
    <div id="so-stagecraft-settings" className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <GroupHeader title="Stagecraft" scope="install" id="so-stagecraft-header" />
      <CheckRow id="so-curator-enabled" checked={snapshot.stagecraft.settings.curatorEnabled} label="World Info curator" help={CURATOR_HELP}
        onChange={(on) => manager.setStagecraftSettings({ curatorEnabled: on })} />
      <div className="flex flex-col gap-1 text-sm">
        <FieldLabel htmlFor="so-curator-accept-mode" label="Curator changes" />
        <select
          id="so-curator-accept-mode"
          value={snapshot.stagecraft.settings.acceptMode}
          disabled={!snapshot.stagecraft.settings.curatorEnabled}
          onChange={(event) => manager.setStagecraftSettings({ acceptMode: isAcceptMode(event.target.value) ? event.target.value : "review" })}
        >
          <option value="review">Ask me first</option>
          <option value="auto">Apply on their own</option>
          <option value="off">Never apply: only show me what it would do</option>
        </select>
      </div>
      {snapshot.stagecraft.settings.curatorEnabled && snapshot.ready && snapshot.stagecraftScope.length === 0 && (
        <div id="so-curator-unscoped" className="text-xs opacity-70">This story lists no lorebook for the curator, so it stays idle. Add one on the Studio&apos;s Story tab.</div>
      )}
      {snapshot.ui.authorView && <WardenControls snapshot={snapshot} manager={manager} />}
      {snapshot.ui.authorView && <Lazy fallback={null}><InnerVoiceControls snapshot={snapshot} manager={manager} /></Lazy>}
    </div>
  );
};

const CHAIN_HELP = "A single player message can be answered by more than one character. The judge picks each next speaker and stops when it hands the turn back to you; " +
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
      <CheckRow id="so-chain-enabled" checked={chain.enabled} onChange={(on) => update({ enabled: on })} label="Several characters may answer one message" help={CHAIN_HELP} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="so-chain-max">Voices per turn at most</label>
        <input
          id="so-chain-max"
          type="number"
          min={1}
          max={TALK_CHAIN_MAX_CAP}
          className="st-input w-20"
          value={chain.max}
          onChange={(event) => update({ max: Math.min(TALK_CHAIN_MAX_CAP, Math.max(1, Math.round(Number(event.target.value) || 1))) })}
        />
      </div>
      {snapshot.ui.authorView && (
        <>
          <CheckRow id="so-chain-stop-transition" checked={chain.stopOnTransition} onChange={(on) => update({ stopOnTransition: on })} label="End the chain when the scene changes" />
          <CheckRow id="so-chain-hold-extraction" checked={chain.holdExtraction} onChange={(on) => update({ holdExtraction: on })}
            label="Wait for the whole reply before reading the scene" help="Off: each voice's turn is read as it lands, so a scene change can interrupt the chain." />
        </>
      )}
    </div>
  );
};

export const PacingGroup = ({ snapshot, manager }: GroupProps) => (
  <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
    <GroupHeader title="Pacing" scope="install" id="so-pacing-header" />
    <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor="so-pacing-alpha" label="Smoothing α" help="How quickly the measured tension follows the latest scene. Higher = jumpier, lower = smoother." />
        <input
          id="so-pacing-alpha"
          className="text_pole"
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={snapshot.pacing.alpha}
          onChange={(event) => manager.setPacingSettings({ alpha: Math.min(1, Math.max(0, Number(event.target.value) || 0)) })}
        />
      </div>
      <CheckRow className="sm:mt-5" checked={snapshot.pacing.hintEnabled} onChange={(on) => manager.setPacingSettings({ hintEnabled: on })} label="Steering hint"
        help="Quietly nudge the main model toward the story's intended tension (escalate or cool down) via an injected note." />
    </div>
  </div>
);
