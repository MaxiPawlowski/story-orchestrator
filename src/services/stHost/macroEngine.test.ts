import { argMacroSeam } from "./macroEngine";

type Registered = { name: string; options: { unnamedArgs: Array<{ name: string }>; strictArgs: boolean; description: string; handler: (context: { unnamedArgs: string[] }) => string } };

const fakeHost = (withRegister = true) => {
  const registered: Registered[] = [];
  const removed: string[] = [];
  const macros = withRegister
    ? {
      register: (name: string, options: Registered["options"]) => { registered.push({ name, options }); return { name }; },
      registry: { unregisterMacro: (name: string) => { removed.push(name); return true; } },
    }
    : {};
  return { registered, removed, context: () => ({ macros }) };
};

describe("argument macros through macros.register (v2.5 plan 07 A2)", () => {
  it("registers through the non-deprecated macros.register with positional args, strict", () => {
    const host = fakeHost();
    const seam = argMacroSeam(host.context);
    const result = seam.register("story_quality", { unnamedArgs: [{ name: "key", description: "quality key" }], handler: (args) => `v:${args[0]}` }, "a quality");
    expect(result).toEqual({ ok: true });
    expect(host.registered).toHaveLength(1);
    const { name, options } = host.registered[0];
    expect(name).toBe("story_quality");
    expect(options.unnamedArgs).toEqual([{ name: "key", description: "quality key" }]);
    expect(options.strictArgs).toBe(true);
    expect(options.description).toBe("a quality");
    expect(options.handler({ unnamedArgs: ["gold"] })).toBe("v:gold");
    expect(seam.owns("story_quality")).toBe(true);
  });

  it("refuses with a reason when the host has no macros.register, and owns nothing", () => {
    const host = fakeHost(false);
    const seam = argMacroSeam(host.context);
    expect(seam.available()).toBe(false);
    const result = seam.register("story_quality", { unnamedArgs: [{ name: "key" }], handler: () => "" });
    expect(result.ok).toBe(false);
    expect(seam.owns("story_quality")).toBe(false);
  });

  it("refuses when the registry answers null (ST logged the registration error)", () => {
    const seam = argMacroSeam(() => ({ macros: { register: () => null } }));
    expect(seam.register("story_quality", { unnamedArgs: [{ name: "key" }], handler: () => "" }).ok).toBe(false);
    expect(seam.owns("story_quality")).toBe(false);
  });

  it("unregisters through macros.registry.unregisterMacro, and only what it registered", () => {
    const host = fakeHost();
    const seam = argMacroSeam(host.context);
    expect(seam.unregister("story_quality").ok).toBe(false);
    seam.register("story_quality", { unnamedArgs: [{ name: "key" }], handler: () => "" });
    expect(seam.unregister("story_quality")).toEqual({ ok: true });
    expect(host.removed).toEqual(["story_quality"]);
    expect(seam.owns("story_quality")).toBe(false);
  });

  it("a context that throws reads as unavailable, never as a crash", () => {
    const seam = argMacroSeam(() => { throw new Error("no host"); });
    expect(seam.available()).toBe(false);
    expect(seam.register("x", { unnamedArgs: [{ name: "k" }], handler: () => "" }).ok).toBe(false);
  });
});
