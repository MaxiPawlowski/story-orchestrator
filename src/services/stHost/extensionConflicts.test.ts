import { extensionConflictsWith, KNOWN_EXTENSIONS, vectorsWorldInfoOn, type ExtensionConflictHost } from "./extensionConflicts";

const ALL_FOLDERS = KNOWN_EXTENSIONS.map((known) => known.folder);

const host = (settings: Record<string, unknown>, options: { installed?: string[]; storage?: Record<string, string> } = {}): ExtensionConflictHost => {
  const installed = new Set(options.installed ?? ALL_FOLDERS);
  return {
    settings: { disabledExtensions: [], ...settings },
    manifest: (name) => (installed.has(name) ? { display_name: name } : null),
    storage: (key) => options.storage?.[key] ?? null,
  };
};

const separated = { "st-stepped-thinking": { is_shutdown: false, is_enabled: true, mode: "separated", character_settings: [] } };

describe("stHost extensionConflicts: which known extensions work against a story", () => {
  it("Stepped Thinking fires only in its deprecated Separated mode", () => {
    expect(extensionConflictsWith(host(separated))).toContain("stepped-thinking-separated");
    expect(extensionConflictsWith(host({ "st-stepped-thinking": { ...separated["st-stepped-thinking"], mode: "embedded" } }))).not.toContain("stepped-thinking-separated");
    expect(extensionConflictsWith(host({ "st-stepped-thinking": { ...separated["st-stepped-thinking"], is_shutdown: true } }))).not.toContain("stepped-thinking-separated");
  });

  it("Stepped Thinking switched off globally still fires when a character turns thinking on", () => {
    const off = { ...separated["st-stepped-thinking"], is_enabled: false };
    expect(extensionConflictsWith(host({ "st-stepped-thinking": off }))).not.toContain("stepped-thinking-separated");
    const character = { ...off, character_settings: [{ avatar: "a.png", is_setting_enabled: true, is_thinking_enabled: true }] };
    expect(extensionConflictsWith(host({ "st-stepped-thinking": character }))).toContain("stepped-thinking-separated");
  });

  it("Presence fires while enabled, with its default on when it has no settings yet", () => {
    expect(extensionConflictsWith(host({ Presence: { enabled: true } }))).toContain("presence");
    expect(extensionConflictsWith(host({}))).toContain("presence");
    expect(extensionConflictsWith(host({ Presence: { enabled: false } }))).not.toContain("presence");
  });

  it("Prompt Inspector fires only while its inspect toggle is on", () => {
    expect(extensionConflictsWith(host({}, { storage: { promptInspectorEnabled: "true" } }))).toContain("prompt-inspector");
    expect(extensionConflictsWith(host({}, { storage: { promptInspectorEnabled: "false" } }))).not.toContain("prompt-inspector");
    expect(extensionConflictsWith({ ...host({}), storage: () => { throw new Error("blocked"); } })).not.toContain("prompt-inspector");
  });

  it("control: a disabled or missing extension never fires, whatever its settings say", () => {
    const everything = { ...separated, Presence: { enabled: true } };
    const storage = { promptInspectorEnabled: "true" };
    expect(extensionConflictsWith(host({ ...everything, disabledExtensions: ALL_FOLDERS }, { storage }))).toEqual([]);
    expect(extensionConflictsWith(host(everything, { installed: [], storage }))).toEqual([]);
    expect(extensionConflictsWith({ settings: everything, storage: () => "true" })).toEqual([]);
    expect(extensionConflictsWith({ settings: null })).toEqual([]);
  });

  it("Vector Storage World Info is read from its setting alone, the way exclusive lore select reads it", () => {
    expect(vectorsWorldInfoOn({ vectors: { enabled_world_info: true } })).toBe(true);
    expect(vectorsWorldInfoOn({ vectors: { enabled_world_info: false } })).toBe(false);
    expect(vectorsWorldInfoOn(undefined)).toBe(false);
    expect(extensionConflictsWith(host({ Presence: { enabled: false }, vectors: { enabled_world_info: true }, disabledExtensions: ["vectors"] }))).toEqual(["vectors-world-info"]);
  });
});
