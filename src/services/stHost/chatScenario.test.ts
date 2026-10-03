import { readCastScenarios, readChatScenario, writeChatScenario } from "./chatScenario";

const characters = [
  { name: "Arin", avatar: "Arin.png", scenario: " Arin's card scene. " },
  { name: "Luke", avatar: "Luke.png", scenario: "" },
  { name: "Ponticius", avatar: "Ponticius.png", scenario: "Guild hall." },
];
const solo = (chatMetadata: Record<string, unknown> = {}) => ({ chatId: "solo-1", chatMetadata, characters, characterId: 0, groupId: null, groups: [] });
const group = (disabled: string[] = []) => ({
  chatId: "group-1", chatMetadata: {}, characters, characterId: undefined, groupId: "g1",
  groups: [{ id: "g1", members: ["Arin.png", "Luke.png", "Ponticius.png"], disabled_members: disabled }],
});

describe("the chat scenario override seam (ST chat_metadata.scenario)", () => {
  it("reads the override, empty when unset, and null with no chat open", () => {
    expect(readChatScenario(solo({ scenario: "x" }))).toEqual({ chatId: "solo-1", text: "x" });
    expect(readChatScenario(solo())).toEqual({ chatId: "solo-1", text: "" });
    expect(readChatScenario({ ...solo(), chatId: null })).toBeNull();
  });

  it("writes only into the chat it was asked for, and an empty text removes the key", () => {
    const context = solo();
    expect(writeChatScenario(context, "solo-1", "story")).toEqual({ ok: true, chatId: "solo-1", text: "story" });
    expect(context.chatMetadata).toEqual({ scenario: "story" });
    expect(writeChatScenario(context, "other", "x").ok).toBe(false);
    expect(context.chatMetadata).toEqual({ scenario: "story" });
    expect(writeChatScenario(context, "solo-1", "").ok).toBe(true);
    expect(context.chatMetadata).toEqual({});
  });

  it("the cards that frame a chat: every enabled group member with a scenario; a one-on-one chat frames nothing (v2.7 plan 03)", () => {
    expect(readCastScenarios(solo())).toEqual([]);
    expect(readCastScenarios(group()).map((entry) => entry.name)).toEqual(["Arin", "Ponticius"]);
    expect(readCastScenarios(group(["Ponticius.png"])).map((entry) => entry.name)).toEqual(["Arin"]);
  });
});
