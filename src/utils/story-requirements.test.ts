import {
  buildRequirementsState,
  collectMissingLoreEntries,
  computeGlobalLoreStatus,
  computeMissingGroupMembers,
  extractRoleNames,
  extractWorldInfoKeys,
  getChatContextKey,
} from "@utils/story-requirements";

describe("story-requirements helpers", () => {
  const story = {
    global_lorebook: "MainLore",
    roles: { companion: "Companion.png", guide: "Guide" },
    checkpoints: [
      { world_info: { activate: ["Ancient Relic"], deactivate: ["Hidden Sigil"] } },
    ],
  } as any;

  it("derives role names, lore keys, and readiness without host globals", () => {
    expect(extractRoleNames(story)).toEqual({
      names: ["Companion.png", "Guide"],
      normalized: ["companion", "guide"],
    });
    expect(extractWorldInfoKeys(story)).toEqual(["Ancient Relic", "Hidden Sigil"]);
    expect(computeGlobalLoreStatus(story, { world_info: { globalSelect: ["mainlore"] } })).toEqual({
      globalMissing: [],
      globalLoreBookPresent: true,
    });
    expect(getChatContextKey({ chatId: "chat-1", groupId: "group-1" })).toBe("chat-1::group-1");

    const requirements = buildRequirementsState(story, {
      currentUserName: "Player",
      personaDefined: true,
      groupChatSelected: true,
      missingGroupMembers: [],
      worldLoreEntriesPresent: true,
      worldLoreEntriesMissing: [],
      globalLoreBookPresent: true,
      globalLoreBookMissing: [],
    });
    expect(requirements.requirementsReady).toBe(true);
  });

  it("computes missing group members and lore entries from plain inputs", () => {
    expect(computeMissingGroupMembers(
      {
        groupId: "group-1",
        groups: [{ id: "group-1", members: [{ name: "Companion.png" }] }],
      },
      ["Companion.png", "Guide"],
      ["companion", "guide"],
      (member: any) => member.name,
    )).toEqual(["Guide"]);

    expect(collectMissingLoreEntries(["Ancient Relic", "Hidden Sigil"], {
      entries: {
        1: { comment: "Ancient Relic" },
      },
    })).toEqual(["Hidden Sigil"]);
  });
});
