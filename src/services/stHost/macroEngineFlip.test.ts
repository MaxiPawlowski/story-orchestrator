import { plainMacroSeam } from "./macroEngine";

type Value = string | ((nonce: string) => string);

const fakeHost = () => {
  const power = { experimental_macro_engine: true };
  const legacy = new Map<string, Value>();
  const engine = new Map<string, Value>();
  const parser = {
    registerMacro(key: string, value: Value) {
      if (power.experimental_macro_engine) engine.set(key, value);
      if (power.experimental_macro_engine) return;
      legacy.set(key, value);
    },
    unregisterMacro(key: string) {
      if (power.experimental_macro_engine) engine.delete(key);
      else legacy.delete(key);
    },
  };
  const substitute = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (raw, key: string) => {
    const value = (power.experimental_macro_engine ? engine : legacy).get(key);
    return value === undefined ? raw : typeof value === "function" ? value("") : value;
  });
  return { power, parser, substitute };
};

describe("{{story_*}} macros survive a macro-engine flip mid-session (nemopresetext P1)", () => {
  it("ST registers into the engine on at registration (macros.js:82, :205-214) and substitutes with the engine on now (script.js:2837)", () => {
    const host = fakeHost();
    const seam = plainMacroSeam(() => host.parser, () => host.power.experimental_macro_engine);
    seam.register("story_title", () => "The Siege");
    expect(host.substitute("{{story_title}}")).toBe("The Siege");
    host.power.experimental_macro_engine = false;
    expect(seam.rearm()).toBe(1);
    expect(host.substitute("{{story_title}}")).toBe("The Siege");
    host.power.experimental_macro_engine = true;
    expect(seam.rearm()).toBe(1);
    expect(host.substitute("{{story_title}}")).toBe("The Siege");
    expect(seam.rearm()).toBe(0);
  });

  it("re-arms only what is still registered", () => {
    const host = fakeHost();
    const seam = plainMacroSeam(() => host.parser, () => host.power.experimental_macro_engine);
    seam.register("story_title", "A");
    seam.register("story_role_kael", "Kael");
    seam.unregister("story_role_kael");
    host.power.experimental_macro_engine = false;
    expect(seam.rearm()).toBe(1);
    expect(host.substitute("{{story_title}} {{story_role_kael}}")).toBe("A {{story_role_kael}}");
  });

  it("does nothing while the engine cannot be read", () => {
    const host = fakeHost();
    let flag: boolean | null = true;
    const seam = plainMacroSeam(() => host.parser, () => flag);
    seam.register("story_title", "A");
    flag = null;
    expect(seam.rearm()).toBe(0);
  });
});
