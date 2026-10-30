import { useState } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { TALK_CHAIN_MAX_CAP } from "@engine/index";
import type { RuntimeManager } from "@runtime/index";
import { getGlobalSettings, setGlobalSettings, type TalkChainSettings } from "@runtime/settingsStore";
import type { RuntimeSnapshot } from "@runtime/types";
import { chapterSettings } from "@runtime/chapters";
import { wiGating } from "@runtime/worldInfoScanHost";
import { keepGlobalStoryLore, releaseGlobalStoryLore } from "@runtime/storyLoreHost";
import WorldInfoGatingGroup from "./WorldInfoGatingGroup";
import StoryLoreGlobal from "./StoryLoreGlobal";
import { GroupHeader } from "./GroupHeader";
import { CheckRow, FieldLabel } from "./Field";
import { PresenceControls } from "./PresenceControls";

const InlineControls = lazyRetry(() => import("./InlineControls"));
const ChapterBudgetField = lazyRetry(() => import("./ChapterRecordControls").then((module) => ({ default: module.ChapterBudgetField })));
const InnerVoiceControls = lazyRetry(() => import("./InnerVoiceControls"));

interface GroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
}

export const DisplayGroup = ({ snapshot, manager }: GroupProps) => (
  <div className="flex flex-col gap-2 border-t border-solid border-[var(--so-line)] pt-2">
    <GroupHeader title="Display" scope="install" id="so-display-header" />
    <Lazy fallback={null}><InlineControls snapshot={snapshot} manager={manager} /></Lazy>
    <CheckRow id="so-hud-enabled" setting="display.hudEnabled" checked={snapshot.ui.hudEnabled} onChange={(on) => manager.setUiSettings({ hudEnabled: on })} />
    <CheckRow id="so-your-move-enabled" setting="display.yourMove" checked={snapshot.ui.yourMove !== false} onChange={(on) => manager.setUiSettings({ yourMove: on })} />
    <CheckRow id="so-briefing-enabled" setting="display.briefing" checked={snapshot.ui.briefing !== false} onChange={(on) => manager.setUiSettings({ briefing: on })} />
    <CheckRow id="so-briefing-draft" setting="display.briefingDraft" checked={snapshot.ui.briefingDraft !== false} onChange={(on) => manager.setUiSettings({ briefingDraft: on })} />
    <CheckRow id="so-player-setup-enabled" setting="display.playerSetup" checked={snapshot.ui.playerSetup !== false} onChange={(on) => manager.setUiSettings({ playerSetup: on })} />
    <PresenceControls snapshot={snapshot} onChange={(presence) => manager.setUiSettings({ presence })} />
  </div>
);

export const TransitionNoteRow = ({ snapshot, manager }: GroupProps) => (
  <CheckRow id="so-announce-transitions" setting="display.announceTransitions" checked={snapshot.ui.announceTransitions} onChange={(on) => manager.setUiSettings({ announceTransitions: on })} />
);

export const ChapterBudgetGroup = ({ snapshot, manager }: GroupProps) => (
  <div id="so-chapter-budget-group" className="flex flex-col gap-2 border-t border-solid border-[var(--so-line)] pt-2">
    <GroupHeader title="Chapters" scope="install" id="so-chapter-budget-header" />
    <Lazy fallback={null}><ChapterBudgetField stored={snapshot.memory.settings.chapters}
      onWrite={(next) => manager.setMemorySettings({ chapters: { ...chapterSettings(snapshot.memory.settings.chapters), ...next } })} /></Lazy>
  </div>
);

export const LorebooksGroup = ({ snapshot, manager }: GroupProps) => {
  const [scanMemory, setScanMemory] = useState(() => getGlobalSettings().worldInfo.scanMemory);
  const [lateLore, setLateLore] = useState(() => getGlobalSettings().worldInfo.lateLore);
  const [releasing, setReleasing] = useState(false);
  return (
    <div className="flex flex-col gap-2 border-t border-solid border-[var(--so-line)] pt-2">
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
        lateLore={lateLore}
        onLateLore={(on) => setLateLore(setGlobalSettings({ worldInfo: { lateLore: on } }).worldInfo.lateLore)}
      />
    </div>
  );
};

export const InnerVoiceGroup = ({ snapshot, manager }: GroupProps) => {
  if (!snapshot.ui.authorView) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-solid border-[var(--so-line)] pt-2">
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
    <div className="flex flex-col gap-2 border-t border-solid border-[var(--so-line)] pt-2">
      <GroupHeader title="Added to the reply prompt" scope="install" id="so-character-state-header" />
      <CheckRow id="so-card-overlay" setting="sprites.cardOverlay" checked={on} onChange={change} />
    </div>
  );
};

export const TalkGroup = ({ manager }: GroupProps) => {
  const [, bump] = useState(0);
  const { chain, keepLastQuestion } = getGlobalSettings().talk;
  const update = (patch: Partial<TalkChainSettings>) => {
    manager.setTalkChainSettings(patch);
    bump((value) => value + 1);
  };
  const changeKeep = (on: boolean) => {
    setGlobalSettings({ talk: { keepLastQuestion: on } });
    bump((value) => value + 1);
    manager.notify();
  };
  return (
    <div className="flex flex-col gap-2 border-t border-solid border-[var(--so-line)] pt-2">
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
      <CheckRow id="so-keep-last-question" setting="talk.keepLastQuestion" checked={keepLastQuestion} onChange={changeKeep} />
    </div>
  );
};
