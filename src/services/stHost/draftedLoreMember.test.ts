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

  it("distinguishes a character with no tags from no drafted character", () => {
    context.characterId = 1;
    delete context.tagMap["Other.png"];
    expect(draftedLoreMember()).toEqual({ filename: "Other", tags: [] });
    context.characterId = undefined;
    expect(draftedLoreMember()).toEqual({ filename: null, tags: null });
    context.characterId = "";
    expect(draftedLoreMember()).toEqual({ filename: null, tags: null });
  });
});
