import type { Quality } from "@engine/index";
import { coerceOpForQuality, defaultLeaf, defaultValueForOp, opsForType } from "./gateOptions";

const q = (over: Partial<Quality>): Quality => ({ key: "k", type: "int", source: "extractor", rubric: "r", ...over });

describe("opsForType", () => {
  it("numeric types allow ordered comparisons but not in", () => {
    expect(opsForType("int")).toContain(">=");
    expect(opsForType("float")).not.toContain("in");
  });
  it("bool allows only equality", () => {
    expect(opsForType("bool")).toEqual(["==", "!="]);
  });
  it("enum and string allow in but not ordered", () => {
    expect(opsForType("enum")).toContain("in");
    expect(opsForType("string")).not.toContain(">=");
  });
});

describe("defaultValueForOp", () => {
  it("in produces an empty array", () => {
    expect(defaultValueForOp(q({ type: "enum", values: ["a"] }), "in")).toEqual([]);
  });
  it("bool defaults to false, number to 0, enum to first value", () => {
    expect(defaultValueForOp(q({ type: "bool" }), "==")).toBe(false);
    expect(defaultValueForOp(q({ type: "int" }), "==")).toBe(0);
    expect(defaultValueForOp(q({ type: "enum", values: ["x", "y"] }), "==")).toBe("x");
  });
});

describe("coerceOpForQuality", () => {
  it("keeps a valid op and repairs an invalid one", () => {
    expect(coerceOpForQuality(q({ type: "int" }), ">=")).toBe(">=");
    expect(coerceOpForQuality(q({ type: "bool" }), ">=")).toBe("==");
  });
});

describe("defaultLeaf", () => {
  it("uses the first quality and a valid default", () => {
    const leaf = defaultLeaf([q({ key: "trust", type: "int" })]);
    expect(leaf).toEqual({ q: "trust", op: "==", v: 0 });
  });
  it("falls back when there are no qualities", () => {
    expect(defaultLeaf([])).toEqual({ q: "", op: "==", v: "" });
  });
});
