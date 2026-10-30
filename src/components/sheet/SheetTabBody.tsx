import type { RuntimeSnapshot } from "@runtime/types";
import { memoryPeek, type SheetTab } from "@runtime/storySheet";
import { lazyRetry } from "@utils/lazyRetry";
import type { StorySheetActions } from "./StorySheet";

const JournalTab = lazyRetry(() => import("./tabs/JournalTab"));
const HereNowTab = lazyRetry(() => import("./tabs/HereNowTab"));
const PeopleTab = lazyRetry(() => import("./tabs/PeopleTab"));
const StatsTab = lazyRetry(() => import("./tabs/StatsTab"));
const WidgetTab = lazyRetry(() => import("./tabs/WidgetTab"));
const IdeasTab = lazyRetry(() => import("./tabs/IdeasTab"));
const MemoryTab = lazyRetry(() => import("./tabs/MemoryTab"));

export const SheetTabBody = ({ tab, snapshot, actions }: { tab: SheetTab; snapshot: RuntimeSnapshot; actions: StorySheetActions }) => {
  const game = snapshot.game ?? null;
  const author = snapshot.ui.authorView ? snapshot.gameAuthor ?? null : null;
  if (tab === "journal" && game) return <JournalTab game={game} author={author} onJump={actions.onJump} />;
  if (tab === "here" && game?.scene) return <HereNowTab scene={game.scene} />;
  if (tab === "people" && game?.codex) return <PeopleTab codex={game.codex} />;
  if (tab === "stats") return <StatsTab sheet={game?.statSheet ?? null} provenance={author?.provenance?.[game?.statSheet?.id ?? ""]} onAction={actions.fill} openDrawer={actions.openDrawer} />;
  if (tab === "ideas" && actions.requestSuggestions && actions.fillSuggestion) return <IdeasTab request={actions.requestSuggestions} fill={actions.fillSuggestion} />;
  if (tab === "memory") return <MemoryTab entries={memoryPeek(snapshot)} onOpenMemory={actions.openMemory} />;
  const widget = tab.startsWith("widget-") ? game?.widgets.find((entry) => `widget-${entry.id}` === tab) : undefined;
  if (widget) {
    return <WidgetTab widget={widget} onAction={actions.fill} html={snapshot.ui.presence?.htmlWidgets === false ? null : actions.htmlHost ?? null} openDrawer={actions.openDrawer}
      provenance={author?.provenance?.[widget.id]} />;
  }
  return null;
};

export default SheetTabBody;
