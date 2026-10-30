import { useEffect, useLayoutEffect, useRef } from "react";
import { HUD_COPY, statusSentence } from "@runtime/pipeline";
import { PLAYER_COPY } from "@runtime/narrative";
import type { RuntimeSnapshot } from "@runtime/types";
import type { SheetTab, SheetTabEntry } from "@runtime/storySheet";
import { INLINE_LEVELS, type InlineLevel } from "@runtime/settingsModel";
import { GAME_TEXT } from "@features/gameCopy";
import { SKIP_COPY } from "@runtime/skipGate";
import { INLINE_LEVEL_LABELS, INLINE_LEVEL_SHORT } from "@features/inlineCopy";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";
import { SegmentedControl } from "@components/ui/SegmentedControl";

export interface HudCardActions {
  tabs: readonly SheetTabEntry[];
  openTab: (tab: SheetTab) => void;
  onRetry?: () => void;
  onOpenSettings?: () => void;
  setLevel?: (level: InlineLevel) => void;
  skip?: () => void;
}

export interface HudCardProps extends HudCardActions {
  snapshot: RuntimeSnapshot;
  onMore: () => void;
  onClose: (restoreFocus: boolean) => void;
}

export const NOTICE_MAX = 3;

export const cardNotices = (snapshot: RuntimeSnapshot): { lines: string[]; more: number } => {
  const fresh = (snapshot.game?.observations ?? []).filter((line) => line.fresh).map((line) => line.text);
  return { lines: fresh.slice(0, NOTICE_MAX), more: Math.max(0, fresh.length - NOTICE_MAX) };
};

export const cardRoom = (hudTop: number, clipTop: number): number => Math.max(120, Math.floor(hudTop - clipTop - 8));

const ALIAS: Partial<Record<SheetTab, string>> = { journal: "so-hud-card-journal", ideas: "so-hud-card-suggestions", memory: "so-hud-card-memory" };

export const cardTabs = (tabs: readonly SheetTabEntry[]): SheetTabEntry[] => {
  const widget = tabs.find((tab) => tab.id.startsWith("widget-"));
  return [...tabs.filter((tab) => !tab.id.startsWith("widget-")), ...(widget ? [widget] : [])];
};

export const HudCard = ({ snapshot, tabs, openTab, onRetry, onOpenSettings, setLevel, skip, onMore, onClose }: HudCardProps) => {
  const card = useRef<HTMLElement>(null);
  const now = snapshot.narrative?.sections.find((section) => section.id === "now")?.lines ?? [];
  const notices = cardNotices(snapshot);
  const level = snapshot.ui.inline.level;

  useLayoutEffect(() => {
    const element = card.current;
    const root = element?.closest<HTMLElement>("#so-hud-root");
    if (!element || !root) return undefined;
    const measure = () => {
      const clip = element.closest<HTMLElement>("#sheld")?.getBoundingClientRect().top ?? 0;
      element.style.setProperty("--so-hud-card-room", `${cardRoom(root.getBoundingClientRect().top, clip)}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    card.current?.querySelector<HTMLElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      const root = card.current?.closest("#so-hud-root");
      if (event.target instanceof Node && root && !root.contains(event.target)) onClose(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose(true);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [onClose]);

  return (
    <section ref={card} id="so-hud-card" role="dialog" aria-modal="false" aria-labelledby="so-hud-card-title" className="so-hud-card">
      <div className="so-hud-card-head">
        <h2 id="so-hud-card-title" className="so-hud-card-title">{snapshot.narrative?.headline ?? now[0] ?? HUD_COPY.fallbackScene}</h2>
        <IconButton id="so-hud-card-close" icon="fa-xmark" size="sm" label={HUD_COPY.cardClose} onClick={() => onClose(true)} />
      </div>
      {now[1] ? <p className="so-hud-card-line">{now[1]}</p> : null}
      <div id="so-hud-card-status" className="so-hud-card-status" data-state={snapshot.pipeline.state}>
        <span>{statusSentence(snapshot.pipeline)}</span>
        {snapshot.pipeline.retryable && onRetry && (
          <Button id="so-hud-card-retry" size="sm" icon="fa-rotate" work={onRetry}>{PLAYER_COPY.retryButton}</Button>
        )}
        {snapshot.pipeline.needsSetup && onOpenSettings && (
          <Button id="so-hud-card-settings" size="sm" icon="fa-gear" onClick={() => { onClose(false); onOpenSettings(); }}>{PLAYER_COPY.openSettingsButton}</Button>
        )}
      </div>
      {notices.lines.length > 0 && (
        <div id="so-hud-card-notice" className="so-hud-card-line">
          <span>{GAME_TEXT.noticeLead}</span>
          <ul>{notices.lines.map((line, index) => <li key={index} data-so="hud-card-notice-line">{line}</li>)}</ul>
          {notices.more > 0 && <p data-so="hud-card-notice-more">{`and ${notices.more} ${GAME_TEXT.noticeMore}`}</p>}
        </div>
      )}
      {tabs.length > 0 && (
        <div className="so-hud-card-tabs" role="group" aria-label={HUD_COPY.cardTabs}>
          {cardTabs(tabs).map((tab) => (
            <Button key={tab.id} id={ALIAS[tab.id]} size="sm" icon={tab.icon} data-so="hud-card-tab" data-tab={tab.id} onClick={() => { onClose(false); openTab(tab.id); }}>
              {tab.label}
            </Button>
          ))}
        </div>
      )}
      <div className="so-hud-card-foot">
        {skip && snapshot.skip && (
          <Button id="so-hud-card-skip" size="sm" icon="fa-forward" disabled={!snapshot.skip.enabled} title={snapshot.skip.reason ?? SKIP_COPY.title}
            onClick={() => { onClose(false); skip(); }}>{SKIP_COPY.label}</Button>
        )}
        <Button id="so-hud-card-more" size="sm" variant="ghost" icon="fa-up-right-from-square" title={HUD_COPY.cardMoreTitle} onClick={() => { onClose(false); onMore(); }}>
          {HUD_COPY.cardMore}
        </Button>
        {snapshot.ui.authorView && setLevel && (
          <SegmentedControl id="so-hud-card-level" data-so="hud-card-level" size="sm" label={HUD_COPY.cardLevel} value={String(level)}
            options={INLINE_LEVELS.map((entry) => ({ value: String(entry), label: INLINE_LEVEL_SHORT[entry], title: INLINE_LEVEL_LABELS[entry] }))}
            onChange={(value) => setLevel(Number(value) as InlineLevel)} />
        )}
      </div>
    </section>
  );
};

export default HudCard;
