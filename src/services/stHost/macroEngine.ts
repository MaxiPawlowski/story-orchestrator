import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

export interface HostArgMacro {
  unnamedArgs: Array<{ name: string; description?: string }>;
  handler: (args: string[]) => string;
}

interface MacroRegistryOptions {
  unnamedArgs: HostArgMacro["unnamedArgs"];
  strictArgs: boolean;
  description: string;
  handler: (context: { unnamedArgs: string[] }) => string;
}

interface NewMacroEngine {
  register?: (name: string, options: MacroRegistryOptions) => unknown;
  registry?: { unregisterMacro?: (name: string) => boolean };
}

export interface ArgMacroSeam {
  available(): boolean;
  register(name: string, macro: HostArgMacro, description?: string): WriteResult;
  unregister(name: string): WriteResult;
  owns(name: string): boolean;
}

export function argMacroSeam(context: () => unknown): ArgMacroSeam {
  const owned = new Set<string>();
  const engine = (): NewMacroEngine | null => {
    try {
      const macros = (context() as { macros?: unknown } | null | undefined)?.macros;
      return macros && typeof macros === "object" ? (macros as NewMacroEngine) : null;
    } catch {
      return null;
    }
  };
  return {
    available: () => typeof engine()?.register === "function",
    register(name, macro, description = "") {
      const register = engine()?.register;
      if (typeof register !== "function") return couldNot("this SillyTavern exposes no macros.register");
      const definition = register(name, { unnamedArgs: macro.unnamedArgs, strictArgs: true, description, handler: ({ unnamedArgs }) => macro.handler(unnamedArgs) });
      if (!definition) return couldNot(`SillyTavern refused to register {{${name}}}`);
      owned.add(name);
      return wrote();
    },
    unregister(name) {
      if (!owned.has(name)) return couldNot(`{{${name}}} was not registered here`);
      owned.delete(name);
      const registry = engine()?.registry;
      if (typeof registry?.unregisterMacro !== "function") return couldNot("this SillyTavern exposes no macros.registry.unregisterMacro");
      registry.unregisterMacro(name);
      return wrote();
    },
    owns: (name) => owned.has(name),
  };
}
