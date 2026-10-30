import { rovingTarget } from "./rovingKeys";

describe("kit roving focus (tabs, segmented controls)", () => {
  it("arrows wrap, Home/End jump, other keys are ignored", () => {
    expect(rovingTarget("ArrowRight", 0, 3)).toBe(1);
    expect(rovingTarget("ArrowRight", 2, 3)).toBe(0);
    expect(rovingTarget("ArrowLeft", 0, 3)).toBe(2);
    expect(rovingTarget("Home", 2, 3)).toBe(0);
    expect(rovingTarget("End", 0, 3)).toBe(2);
    expect(rovingTarget("Enter", 0, 3)).toBeNull();
    expect(rovingTarget("ArrowRight", 0, 0)).toBeNull();
  });

  it("an axis takes only its own arrows; nothing focused starts from the first item", () => {
    expect(rovingTarget("ArrowDown", 0, 3, "horizontal")).toBeNull();
    expect(rovingTarget("ArrowRight", 0, 3, "vertical")).toBeNull();
    expect(rovingTarget("ArrowDown", 1, 3, "vertical")).toBe(2);
    expect(rovingTarget("ArrowRight", -1, 3)).toBe(1);
  });
});
