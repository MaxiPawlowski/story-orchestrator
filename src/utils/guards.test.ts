import { isRecord, required } from "./guards";

describe("required", () => {
  it("returns a present value unchanged, falsy ones included", () => {
    const value = { a: 1 };
    expect(required(value, "value")).toBe(value);
    expect(required(0, "zero")).toBe(0);
    expect(required("", "empty")).toBe("");
    expect(required(false, "flag")).toBe(false);
  });

  it("throws a TypeError naming what is missing for null and undefined", () => {
    expect(() => required(null, "engine state")).toThrow(new TypeError("engine state is missing"));
    expect(() => required(undefined, "loaded story")).toThrow(new TypeError("loaded story is missing"));
  });
});

describe("isRecord", () => {
  it("accepts plain objects and refuses arrays, null and primitives", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("x")).toBe(false);
  });
});
