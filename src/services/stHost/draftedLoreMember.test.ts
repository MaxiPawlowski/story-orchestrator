const context = {
  characterId: "0" as string | number | undefined,
  characters: [{ avatar: "Arin.card.png", name: "Arin" }, { avatar: "Other.png", name: "Other" }],
  tagMap: { "Arin.card.png": ["cast", "scout", 7], "Other.png": ["other"] } as Record<string, unknown>,
};

jest.mock("./context", () => ({ getContext: () => context }));
jest.mock("./modules", () => ({ worldInfoModule: {} }));

import { draftedLoreMember } from "./worldInfoActivate";

describe("drafted lore member host identity", () => {
  it("uses the avatar filename without its final extension and the avatar's tag-map entry", () => {
    context.characterId = "0";
    expect(draftedLoreMember()).toEqual({ filename: "Arin.card", tags: ["cast", "scout"] });
    context.characterId = 1;
    expect(draftedLoreMember()).toEqual({ filename: "Other", tags: ["other"] });
  });

  it("an absent tag-map entry is no tag info (null), as world-info.js:4832 applies the tag filter only when Array.isArray(tagMapEntry)", () => {
    context.characterId = 1;
    context.tagMap["Other.png"] = [];
    expect(draftedLoreMember()).toEqual({ filename: "Other", tags: [] });
    delete context.tagMap["Other.png"];
    expect(draftedLoreMember()).toEqual({ filename: "Other", tags: null });
    context.tagMap["Other.png"] = "other";
    expect(draftedLoreMember()).toEqual({ filename: "Other", tags: null });
    delete context.tagMap["Other.png"];
    context.characterId = undefined;
    expect(draftedLoreMember()).toEqual({ filename: null, tags: null });
    context.characterId = "";
    expect(draftedLoreMember()).toEqual({ filename: null, tags: null });
  });
});
