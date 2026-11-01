import { unwrapVectorsInterceptor, viewHostCopierPrompts, wrapVectorsInterceptor } from "./copierPrompts";

const upper = (text: string) => text.toUpperCase();

const viewCopierEntry = (entry: { value: string }, view: ((text: string) => string) | null): boolean => {
  const result = viewHostCopierPrompts({ "1_memory": entry }, view);
  return result.ok && result.changed.length === 1;
};

afterEach(() => {
  unwrapVectorsInterceptor();
  Reflect.deleteProperty(globalThis, "vectors_rearrangeChat");
});

describe("copier prompts: an entry's raw text is kept per host object, so each audience is computed from it", () => {
  it("rewrites in place, and a null view gives the raw text back", () => {
    const entry = { value: "a" };
    expect(viewCopierEntry(entry, upper)).toBe(true);
    expect(entry.value).toBe("A");
    expect(viewCopierEntry(entry, null)).toBe(true);
    expect(entry.value).toBe("a");
  });

  it("a value changed in place by its owner becomes the new raw text", () => {
    const entry = { value: "a" };
    viewCopierEntry(entry, upper);
    entry.value = "b";
    viewCopierEntry(entry, null);
    expect(entry.value).toBe("b");
  });

  it("answers which keys changed, and refuses a host without extension prompts", () => {
    expect(viewHostCopierPrompts({ "1_memory": { value: "x" }, "3_vectors": { value: "" } }, upper)).toEqual({ ok: true, changed: ["1_memory"] });
    expect(viewHostCopierPrompts(undefined, upper).ok).toBe(false);
  });

  it("wraps Vector Storage's interceptor once, runs the hook after it, and unwraps", async () => {
    const order: string[] = [];
    const original = jest.fn(async () => { order.push("vectors"); });
    Reflect.set(globalThis, "vectors_rearrangeChat", original);
    expect(wrapVectorsInterceptor(() => order.push("after"))).toEqual({ ok: true, wrapped: true });
    expect(wrapVectorsInterceptor(() => order.push("after"))).toEqual({ ok: true, wrapped: false });
    await (Reflect.get(globalThis, "vectors_rearrangeChat") as (...args: unknown[]) => Promise<void>)([], 0, () => {}, "normal");
    expect(order).toEqual(["vectors", "after"]);
    expect(original).toHaveBeenCalledWith([], 0, expect.any(Function), "normal");
    expect(unwrapVectorsInterceptor()).toEqual({ ok: true, unwrapped: true });
    expect(Reflect.get(globalThis, "vectors_rearrangeChat")).toBe(original);
  });

  it("refuses when Vector Storage is not loaded", () => {
    expect(wrapVectorsInterceptor(() => {}).ok).toBe(false);
  });
});
