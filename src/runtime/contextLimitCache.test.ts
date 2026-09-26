import { contextLimitInvalidators, createContextLimitCache } from "./contextLimitCache";

const setup = () => {
  const presets: Record<string, string | null> = { p1: "Artemis Extraction", p2: "Bare" };
  const limit = jest.fn((profileId: string | null) => ({ value: profileId === "p1" ? 32768 : 8192, source: "preset" as const }));
  const cache = createContextLimitCache({ limit, presetOf: (profileId) => (profileId ? presets[profileId] ?? null : null) });
  return { presets, limit, cache };
};

describe("context limit cache", () => {
  it("reads the preset once per (profile, preset) pair, however often the panel renders", () => {
    const { limit, cache } = setup();
    for (let index = 0; index < 20; index += 1) expect(cache.read("p1").value).toBe(32768);
    expect(limit).toHaveBeenCalledTimes(1);
    expect(cache.read("p2").value).toBe(8192);
    expect(limit).toHaveBeenCalledTimes(2);
    expect(cache.reads).toBe(2);
  });

  it("a profile pointed at another preset is a new key, read again", () => {
    const { presets, limit, cache } = setup();
    cache.read("p1");
    presets.p1 = "Artemis Long";
    cache.read("p1");
    expect(limit).toHaveBeenCalledTimes(2);
  });

  it("invalidate (a preset edit, a profile update, Recheck) forces the next read", () => {
    const { limit, cache } = setup();
    cache.read("p1");
    cache.invalidate();
    cache.read("p1");
    expect(limit).toHaveBeenCalledTimes(2);
  });

  it("control: without invalidation an edited preset under the same name would stay cached", () => {
    const { limit, cache } = setup();
    cache.read("p1");
    limit.mockImplementation(() => ({ value: 4096, source: "preset" as const }));
    expect(cache.read("p1").value).toBe(32768);
    cache.invalidate();
    expect(cache.read("p1").value).toBe(4096);
  });

  it("invalidates on PRESET_CHANGED and CONNECTION_PROFILE_UPDATED", () => {
    const { limit, cache } = setup();
    const entries = contextLimitInvalidators(cache);
    expect(entries.map((entry) => entry.eventName)).toEqual(["PRESET_CHANGED", "CONNECTION_PROFILE_UPDATED"]);
    for (const entry of entries) {
      cache.read("p1");
      entry.handler(undefined, undefined);
    }
    cache.read("p1");
    expect(limit).toHaveBeenCalledTimes(3);
  });
});
