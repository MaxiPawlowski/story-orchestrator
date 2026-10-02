import type { StoryRequirements } from "@engine/index";
import type { HostLoreBindings } from "@services/STAPI";
import type { LoreSource, RequirementsState, SlotConflict } from "./types";
import { bookKey } from "./worldInfoMatch";

export interface RequirementsView {
  persona: string;
  members: string[];
  muted?: string[];
  storyMuted?: string[];
  cards?: string[];
  lore: HostLoreBindings;
}

export interface RequirementsOptions {
  /** Scan-time gating is active: the memory mirror reaches scans without the chat slot. */
  scan: boolean;
  /** This chat's own mirror book, when it has one. */
  mirrorBook: string | null;
  storyLore?: boolean;
}

const same = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();
const holds = (books: string[], wanted: string) => books.some((book) => same(book, wanted));

const chatSlotCounts = (lore: HostLoreBindings, options: RequirementsOptions) =>
  lore.chat !== null && (options.scan || !options.mirrorBook || !same(lore.chat, options.mirrorBook));

function sourceOf(book: string, view: RequirementsView, options: RequirementsOptions): { source: LoreSource | null; unbound: string[] } {
  const { lore } = view;
  if (holds(lore.global, book)) return { source: "global", unbound: [] };
  if (lore.chat !== null && same(lore.chat, book) && chatSlotCounts(lore, options)) return { source: "chat", unbound: [] };
  if (lore.persona !== null && same(lore.persona, book)) return { source: "persona", unbound: [] };
  const unbound = lore.characters.filter((character) => !holds(character.books, book)).map((character) => character.name);
  if (lore.characters.length && !unbound.length) return { source: "character", unbound: [] };
  if (options.storyLore && (lore.listed ?? []).some((name) => bookKey(name) === bookKey(book))) return { source: "story", unbound: [] };
  return { source: null, unbound: unbound.length < lore.characters.length ? unbound : [] };
}

function slotConflictOf(requirements: StoryRequirements | undefined, lore: HostLoreBindings, options: RequirementsOptions): SlotConflict | null {
  if (options.scan || lore.chat === null) return null;
  if (options.mirrorBook && same(lore.chat, options.mirrorBook)) return null;
  return { book: lore.chat, kind: holds(requirements?.lorebooks ?? [], lore.chat) ? "story-book" : "user-book" };
}

export function readRequirements(requirements: StoryRequirements | undefined, view: RequirementsView, options: RequirementsOptions): RequirementsState {
  const slotConflict = slotConflictOf(requirements, view.lore, options);
  const persona = view.persona.trim().toLowerCase();
  const missingPersonas = (requirements?.personas ?? []).filter((wanted) => !persona || persona !== wanted.toLowerCase());
  const missingMembers = (requirements?.members ?? []).filter((member) => !holds(view.members, member));
  const mutedMembers = (requirements?.members ?? []).filter((member) => holds(view.members, member) && holds(view.muted ?? [], member) && !holds(view.storyMuted ?? [], member));
  const satisfiedBy: Record<string, LoreSource> = {};
  const characterGaps: Record<string, string[]> = {};
  const missingLorebooks = (requirements?.lorebooks ?? []).filter((book) => {
    const found = sourceOf(book, view, options);
    if (found.source) satisfiedBy[book] = found.source;
    else if (found.unbound.length) characterGaps[book] = found.unbound;
    return found.source === null;
  });
  const listed = view.lore.listed ?? [];
  return {
    ready: missingPersonas.length === 0 && missingMembers.length === 0 && missingLorebooks.length === 0,
    missingPersonas,
    missingMembers,
    missingLorebooks,
    absentMembers: view.cards?.length ? missingMembers.filter((member) => !holds(view.cards ?? [], member)) : missingMembers,
    absentLorebooks: listed.length ? missingLorebooks.filter((book) => !listed.some((name) => bookKey(name) === bookKey(book))) : missingLorebooks,
    mutedMembers,
    satisfiedBy,
    characterGaps,
    slotConflict,
  };
}
