import { useState } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { TALK_CHAIN_MAX_CAP } from "@engine/index";
import type { RuntimeManager } from "@runtime/index";
import { getGlobalSettings, type TalkChainSettings } from "@runtime/settingsStore";
import type { RuntimeSnapshot } from "@runtime/types";
import { wiGating } from "@runtime/worldInfoScanHost";
import { keepGlobalStoryLore, releaseGlobalStoryLore } from "@runtime/storyLoreHost";
import { STAGECRAFT_ACCEPT_MODES, type StagecraftAcceptMode } from "@stagecraft/index";
import WorldInfoGatingGroup from "./WorldInfoGatingGroup";
import StoryLoreGlobal from "./StoryLoreGlobal";
import { GroupHeader } from "./GroupHeader";
import { Advanced, CheckRow, FieldLabel } from "./Field";

const InlineControls = lazyRetry(() => import("./InlineControls"));
const ChapterControls = lazyRetry(() => import("./ChapterControls"));
const InnerVoiceControls = lazyRetry(() => import("./InnerVoiceControls"));

interface GroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
}

export const authoringSettings = (snapshot: RuntimeSnapshot): boolean => snapshot.ui.authorView || !snapshot.storyId;

const isAcceptMode = (value: string): value is StagecraftAcceptMode => (STAGECRAFT_ACCEPT_MODES as readonly string[]).includes(value);

export const DisplayGroup = ({ snapshot, manager }: GroupProps) => (
  <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
    <GroupHeader title="Display" scope="install" id="so-display-header" />
    <Lazy fallback={null}><InlineControls snapshot={snapshot} manager={manager} /></Lazy>
    <Lazy fallback={null}><ChapterControls snapshot={snapshot} manager={manager} /></Lazy>
    <CheckRow id="so-hud-enabled" setting="display.hudEnabled" checked={snapshot.ui.hudEnabled} onChange={(on) => manager.setUiSettings({ hudEnabled: on })} />
    <CheckRow id="so-briefing-enabled" setting="display.briefing" checked={snapshot.ui.briefing !== false} onChange={(on) => manager.setUiSettings({ briefing: on })} />
    <CheckRow id="so-announce-transitions" setting="display.announceTransitions" checked={snapshot.ui.announceTransitions} onChange={(on) => manager.setUiSettings({ announceTransitions: on })} />
  </div>
);

export const LorebooksGroup = ({ snapshot, manager }: GroupProps) => {
  const [scanMemory, setScanMemory] = useState(() => getGlobalSettings().worldInfo.scanMemory);
  const [releasing, setReleasing] = useState(false);
  return (
    <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <GroupHeader title="Lorebooks" scope="install" id="so-lorebooks-header" />
      <StoryLoreGlobal
        books={snapshot.globalStoryLore ?? []}
        busy={releasing}
        onRelease={() => {
          setReleasing(true);
          void releaseGlobalStoryLore().finally(() => {
            setReleasing(false);
            manager.notify();
          });
        }}
        onKeep={() => {
          keepGlobalStoryLore();
          manager.notify();
        }}
      />
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
      <CheckRow id="so-warden-enabled" setting="stagecraft.wardenEnabled" checked={on}
        onChange={(next) => manager.setStagecraftSettings(next ? { wardenEnabled: true, wardenAcceptMode: mode } : { wardenEnabled: false })} />
      <div className="flex flex-col gap-1 text-sm">
        <FieldLabel htmlFor="so-warden-accept-mode" setting="stagecraft.wardenAcceptMode" />
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
      <GroupHeader title="Background helpers" scope="install" id="so-stagecraft-header" />
      <CheckRow id="so-curator-enabled" setting="stagecraft.curatorEnabled" checked={snapshot.stagecraft.settings.curatorEnabled}
        onChange={(on) => manager.setStagecraftSettings({ curatorEnabled: on })} />
      <div className="flex flex-col gap-1 text-sm">
        <FieldLabel htmlFor="so-curator-accept-mode" setting="stagecraft.acceptMode" />
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
      <CheckRow id="so-chain-enabled" setting="talk.chain.enabled" checked={chain.enabled} onChange={(on) => update({ enabled: on })} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FieldLabel htmlFor="so-chain-max" setting="talk.chain.max" />
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
        <Advanced id="so-talk-advanced">
          <CheckRow id="so-chain-stop-transition" setting="talk.chain.stopOnTransition" checked={chain.stopOnTransition} onChange={(on) => update({ stopOnTransition: on })} />
          <CheckRow id="so-chain-hold-extraction" setting="talk.chain.holdExtraction" checked={chain.holdExtraction} onChange={(on) => update({ holdExtraction: on })} />
        </Advanced>
      )}
    </div>
  );
};

export const PacingGroup = ({ snapshot, manager }: GroupProps) => (
  <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
    <GroupHeader title="Pacing" scope="install" id="so-pacing-header" />
    <CheckRow id="so-pacing-hint" setting="pacing.hintEnabled" checked={snapshot.pacing.hintEnabled} onChange={(on) => manager.setPacingSettings({ hintEnabled: on })} />
    <Advanced id="so-pacing-advanced">
      <div className="flex flex-col gap-1 text-sm">
        <FieldLabel htmlFor="so-pacing-alpha" setting="pacing.alpha" />
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
    </Advanced>
  </div>
);
