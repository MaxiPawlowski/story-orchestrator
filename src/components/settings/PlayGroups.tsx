import { useState } from "react";
import { authoringSettings } from "./settingsVisibility";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { TALK_CHAIN_MAX_CAP } from "@engine/index";
import type { RuntimeManager } from "@runtime/index";
import { getGlobalSettings, setGlobalSettings, type TalkChainSettings } from "@runtime/settingsStore";
import type { RuntimeSnapshot } from "@runtime/types";
import { wiGating } from "@runtime/worldInfoScanHost";
import { keepGlobalStoryLore, releaseGlobalStoryLore } from "@runtime/storyLoreHost";
import { STAGECRAFT_ACCEPT_MODES, wardenFamilyMode, type StagecraftAcceptMode } from "@stagecraft/index";
import WorldInfoGatingGroup from "./WorldInfoGatingGroup";
import StoryLoreGlobal from "./StoryLoreGlobal";
import { GroupHeader } from "./GroupHeader";
import { CheckRow, FieldLabel } from "./Field";
import { PresenceControls } from "./PresenceControls";

const InlineControls = lazyRetry(() => import("./InlineControls"));
const ChapterControls = lazyRetry(() => import("./ChapterControls"));
const InnerVoiceControls = lazyRetry(() => import("./InnerVoiceControls"));

interface GroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
}

export { authoringSettings };

const isAcceptMode = (value: string): value is StagecraftAcceptMode => (STAGECRAFT_ACCEPT_MODES as readonly string[]).includes(value);

export const DisplayGroup = ({ snapshot, manager }: GroupProps) => (
  <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
    <GroupHeader title="Display" scope="install" id="so-display-header" />
    <Lazy fallback={null}><InlineControls snapshot={snapshot} manager={manager} /></Lazy>
    <CheckRow id="so-hud-enabled" setting="display.hudEnabled" checked={snapshot.ui.hudEnabled} onChange={(on) => manager.setUiSettings({ hudEnabled: on })} />
    <CheckRow id="so-briefing-enabled" setting="display.briefing" checked={snapshot.ui.briefing !== false} onChange={(on) => manager.setUiSettings({ briefing: on })} />
    <CheckRow id="so-player-setup-enabled" setting="display.playerSetup" checked={snapshot.ui.playerSetup !== false} onChange={(on) => manager.setUiSettings({ playerSetup: on })} />
    <PresenceControls snapshot={snapshot} onChange={(presence) => manager.setUiSettings({ presence })} />
  </div>
);

export const TransitionNoteRow = ({ snapshot, manager }: GroupProps) => (
  <CheckRow id="so-announce-transitions" setting="display.announceTransitions" checked={snapshot.ui.announceTransitions} onChange={(on) => manager.setUiSettings({ announceTransitions: on })} />
);

export const ChapterGroup = ({ snapshot, manager }: GroupProps) => (
  <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
    <Lazy fallback={null}><ChapterControls snapshot={snapshot} manager={manager} /></Lazy>
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
      <div className="flex flex-col gap-1 text-sm">
        <FieldLabel htmlFor="so-agency-accept-mode" setting="stagecraft.agencyAcceptMode" />
        <select
          id="so-agency-accept-mode"
          value={wardenFamilyMode(snapshot.stagecraft.settings, "agency")}
          disabled={wardenAcceptMode === "off"}
          onChange={(event) => manager.setStagecraftSettings({ agencyAcceptMode: isAcceptMode(event.target.value) ? event.target.value : "auto" })}
        >
          <option value="auto">Add them on their own</option>
          <option value="review">Ask me first</option>
          <option value="off">Do not check</option>
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
      <CheckRow id="so-curator-create" setting="stagecraft.createEnabled" checked={snapshot.stagecraft.settings.createEnabled}
        disabled={!snapshot.stagecraft.settings.curatorEnabled} onChange={(on) => manager.setStagecraftSettings({ createEnabled: on })} />
      <CheckRow id="so-curator-create-measured" setting="stagecraft.createRequireMeasured" checked={snapshot.stagecraft.settings.createRequireMeasured}
        disabled={!snapshot.stagecraft.settings.curatorEnabled || !snapshot.stagecraft.settings.createEnabled}
        onChange={(on) => manager.setStagecraftSettings({ createRequireMeasured: on })} />
      {snapshot.stagecraft.settings.curatorEnabled && snapshot.ready && snapshot.stagecraftScope.length === 0 && (
        <div id="so-curator-unscoped" className="text-xs opacity-70">This story lists no lorebook for the curator, so it stays idle. Add one on the Studio&apos;s Story tab.</div>
      )}
    </div>
  );
};

export const WardenGroup = ({ snapshot, manager }: GroupProps) => {
  if (!snapshot.ui.authorView) return null;
  return (
    <div id="so-warden-settings" className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <GroupHeader title="Continuity warden" scope="install" id="so-warden-header" />
      <WardenControls snapshot={snapshot} manager={manager} />
    </div>
  );
};

export const InnerVoiceGroup = ({ snapshot, manager }: GroupProps) => {
  if (!snapshot.ui.authorView) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <Lazy fallback={null}><InnerVoiceControls snapshot={snapshot} manager={manager} /></Lazy>
    </div>
  );
};

export const CharacterStateGroup = ({ manager }: GroupProps) => {
  const [on, setOn] = useState(() => getGlobalSettings().sprites.cardOverlay);
  const change = (cardOverlay: boolean) => {
    setGlobalSettings({ sprites: { cardOverlay } });
    setOn(cardOverlay);
    manager.notify();
  };
  return (
    <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      <GroupHeader title="Added to the reply prompt" scope="install" id="so-character-state-header" />
      <CheckRow id="so-card-overlay" setting="sprites.cardOverlay" checked={on} onChange={change} />
    </div>
  );
};

export const TalkGroup = ({ manager }: GroupProps) => {
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
    </div>
  );
};

export const PacingGroup = ({ snapshot, manager }: GroupProps) => (
  <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
    <GroupHeader title="Pacing" scope="install" id="so-pacing-header" />
    <CheckRow id="so-pacing-hint" setting="pacing.hintEnabled" checked={snapshot.pacing.hintEnabled} onChange={(on) => manager.setPacingSettings({ hintEnabled: on })} />
  </div>
);
