import { RawEditCache } from "./rawCache";

test("raw edit reuse is bounded and closing it releases every retained image", () => {
  const cache = new RawEditCache(80);
  const image = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
  cache.put("first", { image, data: "a".repeat(32) });
  expect(cache.get("first")).toBeDefined();
  cache.put("second", { image, data: "b".repeat(32) });
  expect(cache.get("first")).toBeUndefined();
  expect(cache.get("second")).toBeDefined();
  cache.put("oversize", { image, data: "c".repeat(33) });
  expect(cache.get("oversize")).toBeUndefined();
  expect(cache.get("second")).toBeDefined();
  cache.clear();
  expect(cache.get("second")).toBeUndefined();
});
