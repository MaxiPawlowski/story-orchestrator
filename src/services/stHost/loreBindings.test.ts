const host = {
  books: ["Sun Ruins", "Arin Lore", "Luke Lore", "Extra", "Persona Book", "Notes"],
  selected: ["Sun Ruins"],
  context: {} as Record<string, unknown>,
  charLore: [] as Array<{ name?: string; extraBooks?: string[] }>,
};

jest.mock("./context", () => ({ getContext: () => host.context }));
jest.mock("./worldInfo", () => ({
  listAllLorebooks: () => host.books,
  listSelectedLorebooks: () => host.selected,
  getWorldInfoSettings: () => ({ world_info: { charLore: host.charLore } }),
  readChatLorebookSlot: () => { const slot = (host.context.chatMetadata as Record<string, unknown> | undefined)?.world_info; return typeof slot === "string" ? slot : ""; },
}));

import { readLoreBindings } from "./selectors";

const arin = { name: "Arin", avatar: "arin.png", data: { extensions: { world: "Arin Lore" } } };
const luke = { name: "Luke", avatar: "luke.png", data: { extensions: { world: "" } } };
const bella = { name: "Bella", avatar: "bella.png", data: { extensions: { world: "Gone" } } };

describe("readLoreBindings (v25-08-H2..H4, H9)", () => {
  beforeEach(() => {
    host.charLore = [];
    host.context = {
      chatMetadata: { world_info: "Notes" },
      powerUserSettings: { persona_description_lorebook: "Persona Book" },
      characters: [arin, luke, bella],
      groups: [{ id: "g1", members: ["arin.png", "luke.png", "bella.png"], disabled_members: ["bella.png"] }],
      groupId: "g1",
    };
  });

  it("reads the chat slot, the persona's book and each ENABLED member's books", () => {
    host.charLore = [{ name: "luke", extraBooks: ["Luke Lore", "Extra"] }];
    expect(readLoreBindings()).toEqual({
      global: ["Sun Ruins"],
      chat: "Notes",
      persona: "Persona Book",
      characters: [{ name: "Arin", books: ["Arin Lore"] }, { name: "Luke", books: ["Luke Lore", "Extra"] }],
      listed: ["Sun Ruins", "Arin Lore", "Luke Lore", "Extra", "Persona Book", "Notes"],
    });
  });

  it("a binding to a book that no longer exists counts as empty", () => {
    host.context.chatMetadata = { world_info: "Deleted" };
    host.context.powerUserSettings = { persona_description_lorebook: "Deleted" };
    expect(readLoreBindings()).toMatchObject({ chat: null, persona: null });
  });

  it("solo: the open character is the only draftable member", () => {
    host.context.groupId = null;
    host.context.characterId = "0";
    expect(readLoreBindings().characters).toEqual([{ name: "Arin", books: ["Arin Lore"] }]);
  });

  it("no chat and no character: no character lore", () => {
    host.context = { chatMetadata: {}, characters: [arin], groups: [], groupId: null };
    expect(readLoreBindings()).toMatchObject({ global: ["Sun Ruins"], chat: null, persona: null, characters: [] });
  });
});
