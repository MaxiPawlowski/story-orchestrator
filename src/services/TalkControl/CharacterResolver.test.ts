import { CharacterResolver } from "@services/TalkControl/CharacterResolver";
import { getCharacterIdByName, getContext } from "@services/STAPI";

jest.mock("@services/STAPI", () => ({
  getContext: jest.fn(),
  getCharacterIdByName: jest.fn(),
}));

const getContextMock = getContext as jest.MockedFunction<typeof getContext>;
const getCharacterIdByNameMock = getCharacterIdByName as jest.MockedFunction<typeof getCharacterIdByName>;

describe("CharacterResolver", () => {
  beforeEach(() => {
    getContextMock.mockReset();
    getCharacterIdByNameMock.mockReset();
  });

  it("resolves by story role display name through ST helper", () => {
    getContextMock.mockReturnValue({
      characters: [{ name: "Arin" }, { name: "DM Narrator" }],
    } as any);
    getCharacterIdByNameMock.mockImplementation((name: string) =>
      name === "DM Narrator" ? 1 : undefined
    );

    const resolver = new CharacterResolver({ roles: { dm: "DM Narrator" } } as any);
    const charId = resolver.resolveCharacterId({
      normalizedId: "dm",
      memberId: undefined,
    } as any);

    expect(charId).toBe(1);
  });

  it("falls back to normalized character name match from chat context", () => {
    getContextMock.mockReturnValue({
      characters: [{ name: "Arin" }, { name: "DM Narrator" }],
    } as any);
    getCharacterIdByNameMock.mockReturnValue(undefined);

    const resolver = new CharacterResolver({ roles: {} } as any);
    const charId = resolver.resolveCharacterId({
      normalizedId: "unknown",
      memberId: " arin ",
    } as any);

    expect(charId).toBe(0);
  });

  it("builds expected speaker ids with mapped display names", () => {
    const resolver = new CharacterResolver({ roles: { dm: "DM Narrator" } } as any);
    const ids = resolver.buildExpectedSpeakerIds({
      normalizedSpeakerId: "dm",
    } as any);

    expect(ids).toContain("dm");
    expect(ids).toContain("dm narrator");
  });
});
