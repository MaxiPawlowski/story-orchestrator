import { eligibleLoreMember } from "./wiCharacterFilter";

const member = { filename: "Arin", tags: ["cast", "scout"] };

describe("ST character-filter eligibility", () => {
  it.each([
    [undefined, true],
    [{ names: ["Arin"] }, true],
    [{ names: ["Other"] }, false],
    [{ names: ["Arin"], isExclude: true }, false],
    [{ names: ["Other"], isExclude: true }, true],
    [{ tags: ["scout"] }, true],
    [{ tags: ["other"] }, false],
    [{ tags: ["cast"], isExclude: true }, false],
    [{ tags: ["other"], isExclude: true }, true],
    [{ names: ["Arin"], tags: ["other"] }, false],
    [{ names: ["Other"], tags: ["scout"] }, false],
    [{ names: ["arin"] }, false],
  ])("matches host name/tag filters: %j", (filter, expected) => {
    expect(eligibleLoreMember(filter, member)).toBe(expected);
  });

  it("a valid character with no tags fails tag inclusion, while no drafted character follows ST's skipped tag check", () => {
    expect(eligibleLoreMember({ tags: ["cast"] }, { filename: "Arin", tags: [] })).toBe(false);
    expect(eligibleLoreMember({ tags: ["cast"] }, { filename: null, tags: null })).toBe(true);
    expect(eligibleLoreMember({ names: ["Arin"] }, { filename: null, tags: null })).toBe(false);
  });

  it("a drafted character with no tag-map entry skips the tag filter both ways (world-info.js:4825-4840)", () => {
    expect(eligibleLoreMember({ tags: ["cast"] }, { filename: "Arin", tags: null })).toBe(true);
    expect(eligibleLoreMember({ tags: ["cast"], isExclude: true }, { filename: "Arin", tags: null })).toBe(true);
    expect(eligibleLoreMember({ names: ["Other"], tags: ["cast"] }, { filename: "Arin", tags: null })).toBe(false);
  });
});
