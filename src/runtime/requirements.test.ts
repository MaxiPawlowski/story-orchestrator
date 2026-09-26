import type { HostLoreBindings } from "@services/STAPI";
import { readRequirements, type RequirementsView } from "./requirementsRead";

const lore = (overrides: Partial<HostLoreBindings> = {}): HostLoreBindings => ({ global: [], chat: null, persona: null, characters: [], ...overrides });
const view = (overrides: Partial<HostLoreBindings> = {}, persona = "Mira", members: string[] = []): RequirementsView => ({ persona, members, lore: lore(overrides) });
const scan = { scan: true, mirrorBook: null };
const file = (mirrorBook: string | null = null) => ({ scan: false, mirrorBook });
const needs = { lorebooks: ["Sun Ruins"] };

describe("L2: a story's lore requirement reads the books ST will scan", () => {
  it("a globally selected book is present, as before", () => {
    const state = readRequirements(needs, view({ global: ["sun ruins"] }), scan);
    expect(state).toMatchObject({ ready: true, missingLorebooks: [], satisfiedBy: { "Sun Ruins": "global" } });
  });

  it("a book bound to the chat slot is present in scan mode", () => {
    const state = readRequirements(needs, view({ chat: "Sun Ruins" }), scan);
    expect(state).toMatchObject({ ready: true, satisfiedBy: { "Sun Ruins": "chat" }, slotConflict: null });
  });

  it("the persona's book is present", () => {
    expect(readRequirements(needs, view({ persona: "Sun Ruins" }), scan)).toMatchObject({ ready: true, satisfiedBy: { "Sun Ruins": "persona" } });
  });

  it("global wins over the chat slot, the order ST skips duplicates in", () => {
    expect(readRequirements(needs, view({ global: ["Sun Ruins"], chat: "Sun Ruins" }), scan).satisfiedBy).toEqual({ "Sun Ruins": "global" });
  });

  it("D2: a book bound to every enabled member is present", () => {
    const state = readRequirements(needs, view({ characters: [{ name: "Arin", books: ["Sun Ruins"] }, { name: "Luke", books: ["Other", "sun ruins"] }] }), scan);
    expect(state).toMatchObject({ ready: true, satisfiedBy: { "Sun Ruins": "character" }, characterGaps: {} });
  });

  it("D2: a book bound to one of two members reads missing and names the member without it", () => {
    const state = readRequirements(needs, view({ characters: [{ name: "Arin", books: ["Sun Ruins"] }, { name: "Luke", books: [] }] }), scan);
    expect(state).toMatchObject({ ready: false, missingLorebooks: ["Sun Ruins"], satisfiedBy: {}, characterGaps: { "Sun Ruins": ["Luke"] } });
  });

  it("D2: a chat with no draftable character satisfies nothing through character lore", () => {
    expect(readRequirements(needs, view(), scan)).toMatchObject({ ready: false, missingLorebooks: ["Sun Ruins"], characterGaps: {} });
  });

  it("file mode: the chat slot counts when it is not this chat's mirror, and the conflict is named", () => {
    const state = readRequirements(needs, view({ chat: "Sun Ruins" }), file("SO - Mirror - c1"));
    expect(state).toMatchObject({ ready: true, satisfiedBy: { "Sun Ruins": "chat" }, slotConflict: { book: "Sun Ruins", kind: "story-book" } });
  });

  it("file mode: a slot holding this chat's mirror is no conflict and satisfies nothing else", () => {
    const state = readRequirements(needs, view({ chat: "SO - Mirror - c1" }), file("so - mirror - C1"));
    expect(state).toMatchObject({ ready: false, missingLorebooks: ["Sun Ruins"], slotConflict: null });
  });

  it("file mode: a user book in the slot is named as a conflict even with no requirement", () => {
    expect(readRequirements(undefined, view({ chat: "My Notes" }), file()).slotConflict).toEqual({ book: "My Notes", kind: "user-book" });
  });

  it("scan mode: a user book in the slot is no conflict (the mirror no longer needs the slot)", () => {
    expect(readRequirements(undefined, view({ chat: "My Notes" }), scan).slotConflict).toBeNull();
  });

  it("personas and members are read as before", () => {
    const state = readRequirements({ personas: ["Mira"], members: ["Arin", "Luke"] }, view({}, "mira", ["Arin"]), scan);
    expect(state).toMatchObject({ ready: false, missingPersonas: [], missingMembers: ["Luke"] });
  });
});
