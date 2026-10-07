const mockPower: Record<string, unknown> = {};

jest.mock("./context", () => ({
  getContext: () => ({ name1: "Max", chatMetadata: {}, powerUserSettings: mockPower }),
}));
jest.mock("./modules", () => ({ importSTModule: async () => ({}) }));
jest.mock("./selectors", () => ({ listSlashCommands: () => [] }));

import { personaDescriptionSent, readPersonas } from "./personas";

describe("v2.7 34 Sol finding 6: whether ST sends the persona description", () => {
  it("in prompt, the deprecated after-character slot and at depth send it; None and the Author's Note slots are not counted as sent", () => {
    expect([0, 1, 4].map(personaDescriptionSent)).toEqual([true, true, true]);
    expect([9, 2, 3].map(personaDescriptionSent)).toEqual([false, false, false]);
    expect(personaDescriptionSent(undefined)).toBe(true);
    expect(personaDescriptionSent("0")).toBe(false);
  });

  it("readPersonas reads the live placement", () => {
    mockPower.persona_description = "Old soldier.";
    mockPower.persona_description_position = 9;
    expect(readPersonas().descriptionSent).toBe(false);
    mockPower.persona_description_position = 0;
    expect(readPersonas().descriptionSent).toBe(true);
  });
});
