import type { StoryDisplay } from "@engine/index";
import { storyAllows, type PresenceSettings } from "./displayToggles";
import { storyKind } from "@engine/index";
import { groupPlays, kindLabel, lastPlayedText, type PlayRow, type PlaysIndex } from "./playsIndex";
import { libraryDisplay } from "./presence";

export interface BadgeView {
  title: string;
  kind: "saga" | "story";
  kindLabel: string;
  chapterTitle?: string;
  checkpointName?: string | null;
  lastPlayed?: string | null;
  card: boolean;
}

export interface BadgeSources {
  plays: PlaysIndex;
  bindings: Record<string, string>;
  library: ReadonlyArray<{ id: string; title: string; raw: Record<string, unknown> }>;
  settings: PresenceSettings;
  now: number;
}

export interface BadgeMaps {
  groups: Map<string, BadgeView>;
  chats: Map<string, BadgeView>;
}

const fromRow = (row: PlayRow, display: StoryDisplay | null | undefined, settings: PresenceSettings, now: number): BadgeView => ({
  title: row.title, kind: row.kind, kindLabel: kindLabel(row.kind), checkpointName: row.checkpointName, lastPlayed: lastPlayedText(row.updatedAt, now),
  ...(row.chapterTitle ? { chapterTitle: row.chapterTitle } : {}),
  card: settings.groupCard && storyAllows(display, "groupCard"),
});

export function composeBadges({ plays, bindings, library, settings, now }: BadgeSources): BadgeMaps {
  const groups = new Map<string, BadgeView>();
  const chats = new Map<string, BadgeView>();
  if (!settings.listBadges) return { groups, chats };
  const records = new Map(library.map((record) => [record.id, record]));
  const displayOf = (storyId: string) => libraryDisplay(records.get(storyId)?.raw);
  for (const [chatId, row] of Object.entries(plays)) chats.set(chatId, fromRow(row, displayOf(row.storyId), settings, now));
  for (const [groupId, play] of groupPlays(plays, bindings)) {
    if (play.row) {
      groups.set(groupId, fromRow(play.row, displayOf(play.row.storyId), settings, now));
      continue;
    }
    const record = records.get(bindings[groupId]);
    if (!record) continue;
    const kind = storyKind(record.raw);
    groups.set(groupId, { title: record.title, kind, kindLabel: kindLabel(kind), lastPlayed: null, card: settings.groupCard && storyAllows(displayOf(record.id), "groupCard") });
  }
  return { groups, chats };
}
