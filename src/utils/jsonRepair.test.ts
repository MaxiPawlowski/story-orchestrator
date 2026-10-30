import { repairJsonObject } from "./jsonRepair";

describe("repairJsonObject", () => {
  it("passes good JSON through with no fixes", () => {
    expect(repairJsonObject("{\"a\": [1, 2], \"b\": \"x}\"}")).toEqual({ value: { a: [1, 2], b: "x}" }, fixes: [] });
  });

  it("drops prose around the object, even prose holding braces", () => {
    const out = repairJsonObject("Here it is: {\"a\": 1} and {not this}");
    expect(out?.value).toEqual({ a: 1 });
    expect(out?.fixes).toEqual(["text before the object dropped", "text after the object dropped"]);
  });

  it("removes trailing commas outside strings only", () => {
    const out = repairJsonObject("{\"a\": [1, 2,], \"b\": \"x,}\",}");
    expect(out?.value).toEqual({ a: [1, 2], b: "x,}" });
    expect(out?.fixes).toEqual(["trailing comma removed"]);
  });

  it("closes unclosed final brackets", () => {
    const out = repairJsonObject("{\"a\": {\"b\": [1, 2],");
    expect(out?.value).toEqual({ a: { b: [1, 2] } });
    expect(out?.fixes).toContain("unclosed brackets closed");
  });

  it("escapes raw control characters inside strings", () => {
    expect(repairJsonObject("{\"a\": \"line\none\"}")?.value).toEqual({ a: "line\none" });
  });

  it("refuses anything that would need guessed content", () => {
    expect(repairJsonObject("no object")).toBeNull();
    expect(repairJsonObject("{\"a\": \"cut off")).toBeNull();
    expect(repairJsonObject("{\"a\":")).toBeNull();
    expect(repairJsonObject("{\"a\": 1, \"b\"")).toBeNull();
    expect(repairJsonObject("{\"a\": [1}")).toBeNull();
    expect(repairJsonObject("{a: 1}")).toBeNull();
  });
});
