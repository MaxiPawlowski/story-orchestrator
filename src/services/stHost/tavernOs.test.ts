import { tavernOsOnWith, TAVERNOS_FOLDERS, type TavernOsHost } from "./tavernOs";

const MANIFEST = { display_name: "TavernOS (Ultimate Edition)", generate_interceptor: "tavernOSGenerateInterceptor" };

const host = (settings: Record<string, unknown> = {}, installed: Record<string, unknown> = { "third-party/HUD": MANIFEST }, marker?: unknown): TavernOsHost => ({
  settings: { disabledExtensions: [], ...settings },
  manifest: (name) => installed[name] ?? null,
  marker,
});

describe("stHost tavernOs: is TavernOS HUD rewriting generation requests", () => {
  it("installed and enabled under any known folder, recognised by its manifest", () => {
    for (const folder of TAVERNOS_FOLDERS) expect(tavernOsOnWith(host({}, { [folder]: MANIFEST }))).toBe(true);
    expect(tavernOsOnWith(host({}, { "third-party/HUD": { display_name: "TavernOS" } }))).toBe(true);
    expect(tavernOsOnWith(host({}, { "third-party/HUD": { generate_interceptor: "tavernOSGenerateInterceptor" } }))).toBe(true);
  });

  it("its own fetch marker counts even without a manifest", () => {
    expect(tavernOsOnWith(host({}, {}, true))).toBe(true);
    expect(tavernOsOnWith({ settings: null, marker: true })).toBe(true);
  });

  it("disabled, missing, or another extension in the same folder name is off", () => {
    expect(tavernOsOnWith(host({ disabledExtensions: ["third-party/hud"] }))).toBe(false);
    expect(tavernOsOnWith(host({}, {}))).toBe(false);
    expect(tavernOsOnWith(host({}, { "third-party/HUD": { display_name: "Some Other HUD" } }))).toBe(false);
    expect(tavernOsOnWith(host({}, {}, "true"))).toBe(false);
  });

  it("settings not loaded, or no manifest lookup, name nothing", () => {
    expect(tavernOsOnWith({ settings: undefined, manifest: () => MANIFEST })).toBe(false);
    expect(tavernOsOnWith({ settings: {} })).toBe(false);
  });
});
