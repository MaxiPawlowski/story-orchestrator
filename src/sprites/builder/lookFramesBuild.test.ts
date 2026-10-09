import { lookFrameRequest, lookKeyInput, lookStillRequest, type LookBuild } from "./lookFrames";
import { applyLookResult, type LookActor } from "../lookApply";
import { builderRender, defaultSpriteSettings, RENDER_PRESETS, sanitizeSpriteSettings } from "../settings";

describe("plan 32 W7: changed-look frames as production requests", () => {
  const fingerprint = (name: string) => ({ name, sha256: name.padEnd(64, "0").slice(0, 64), size: 1 });
  const build = (config: Partial<LookBuild["config"]> = {}): LookBuild => ({
    folder: "Mira", set: "look_abcdef12", label: "happy", key: "abcdef1234", story: "story", member: "mira",
    models: { diffusion: fingerprint("edit"), encoder: fingerprint("encoder"), vae: fingerprint("vae") },
    config: { baseSet: "base", box: { x: 4, y: 0, width: 40, height: 30 }, models: { diffusion: "edit", encoder: "encoder", vae: "vae" }, steps: 25, ...config },
  });

  it("builds each frame from the changed look's still, never from the base pack", () => {
    const still = { path: "/characters/Mira/look_abcdef12/happy.png", sha256: "c".repeat(64) };
    for (const kind of ["blink", "talk"] as const) {
      expect(lookFrameRequest(build(), kind, still)).toMatchObject({
        character: "Mira", set: "look_abcdef12", label: "happy", kind, value: "happy",
        reference: still.path, referenceHash: still.sha256, box: build().config.box, steps: 25, resolution: 1024, story: "story", member: "mira",
      });
    }
    expect(lookFrameRequest(build(), "blink", still).seed).toBe((0xabcdef12 + 1) >>> 0);
    expect(lookFrameRequest(build(), "talk", still).seed).toBe((0xabcdef12 + 2) >>> 0);
    expect(lookStillRequest(build(), "red hair", { path: "/characters/Mira/base/happy.png", sha256: "b".repeat(64) }))
      .toMatchObject({ kind: "look", value: "red hair", reference: "/characters/Mira/base/happy.png", seed: 0xabcdef12, resolution: 1024 });
  });

  it("renders the look and its frames at the builder's own preset", () => {
    const fast = build({ steps: 20, resolution: 512 });
    expect(lookFrameRequest(fast, "talk", { path: "/a.png", sha256: "a".repeat(64) })).toMatchObject({ steps: 20, resolution: 512 });
    expect(lookStillRequest(fast, "scar", { path: "/b.png", sha256: "b".repeat(64) })).toMatchObject({ steps: 20, resolution: 512 });
  });

  it("keeps the look cache key of a standard builder, and separates a fast one", () => {
    const input = { story: "story", member: "mira", fields: { hair: "red", outfit: "coat" }, version: "v", models: build().models, recipe: { id: "edit", version: 1 } };
    const before = JSON.stringify({ contract: 2, story: "story", member: "mira", fields: [["hair", "red"], ["outfit", "coat"]], version: "v",
      models: build().models, recipe: { id: "edit", version: 1 }, box: build().config.box, steps: 25 });
    expect(lookKeyInput({ ...input, config: build().config })).toBe(before);
    expect(lookKeyInput({ ...input, config: build({ resolution: 1024 }).config })).toBe(before);
    expect(lookKeyInput({ ...input, config: build({ resolution: 512 }).config })).not.toBe(before);
    expect(lookKeyInput({ ...input, fields: { outfit: "coat", hair: "red" }, config: build().config })).toBe(before);
  });
});

describe("plan 32 W7: a finished look refreshes the actor's frame map", () => {
  const profile = { folder: "Mira", default: "neutral", labels: { neutral: { what: "calm", notFor: "", examples: [], fallback: [] },
    happy: { what: "glad", notFor: "", examples: [], fallback: ["neutral"] } } } as unknown as LookActor["profile"];
  const actor = (desiredLabel = "happy"): LookActor => ({ profile, desiredLabel, set: "default", label: "neutral", path: "/characters/Mira/neutral.png",
    packs: new Map([["default", new Map([["neutral", "/characters/Mira/neutral.png"]])]]),
    frames: new Map([["default", new Map([["neutral", { blink: "/characters/Mira/anim-default/neutral.blink.png" }]])]]), lookError: "old" });
  const result = { set: "look_1", label: "happy", stamp: "{\"hair\":\"red\"}", files: [{ label: "happy", path: "/characters/Mira/look_1/happy.png" }],
    frames: { blink: "/characters/Mira/anim-look_1/happy.blink.png", talk: "/characters/Mira/anim-look_1/happy.talk.png" } };

  it("switches to the new look and animates it with its own frames", () => {
    const mira = actor();
    expect(applyLookResult(mira, result)).toBe(true);
    expect(mira).toMatchObject({ set: "look_1", path: "/characters/Mira/look_1/happy.png", label: "happy", generatedLook: result.stamp, lookError: undefined });
    expect(mira.frames.get("look_1")?.get("happy")).toEqual(result.frames);
    expect(mira.frames.get("default")?.get("neutral")).toEqual({ blink: "/characters/Mira/anim-default/neutral.blink.png" });
  });

  it("files a result for an expression the actor has left, without switching to it", () => {
    const mira = actor("neutral");
    expect(applyLookResult(mira, result)).toBe(false);
    expect(mira.set).toBe("default");
    expect(mira.path).toBe("/characters/Mira/neutral.png");
    expect(mira.frames.get("look_1")?.get("happy")).toEqual(result.frames);
  });

  it("keeps the still alone when the look came without frames", () => {
    const mira = actor();
    expect(applyLookResult(mira, { ...result, frames: undefined })).toBe(true);
    expect(mira.frames.has("look_1")).toBe(false);
  });
});

describe("plan 32 W6 defaults: two-frame mouth, 1024/25 with an opt-in fast preset", () => {
  it("ships the simple mouth, the standard preset and on-demand looks on (owner decision 2026-10-09)", () => {
    expect(defaultSpriteSettings()).toMatchObject({ mouth: "simple", renderPreset: "standard", onDemand: true, cardOverlay: true });
    expect(sanitizeSpriteSettings({ onDemand: false, cardOverlay: false })).toMatchObject({ onDemand: false, cardOverlay: false });
    expect(RENDER_PRESETS).toEqual({ standard: { resolution: 1024, steps: 25 }, fast: { resolution: 512, steps: 20 } });
    expect(sanitizeSpriteSettings({ renderPreset: "fast" }).renderPreset).toBe("fast");
    expect(sanitizeSpriteSettings({ renderPreset: "turbo" }).renderPreset).toBe("standard");
  });

  it("keeps a builder's own resolution only when it is a valid edit size", () => {
    const entry = { baseSet: "base", box: { x: 0, y: 0, width: 8, height: 8 }, models: { diffusion: "d", encoder: "e", vae: "v" }, steps: 20 };
    expect(sanitizeSpriteSettings({ builders: { Mira: { ...entry, resolution: 512 } } }).builders.Mira.resolution).toBe(512);
    expect(sanitizeSpriteSettings({ builders: { Mira: { ...entry, resolution: 500 } } }).builders.Mira).not.toHaveProperty("resolution");
    expect(builderRender(entry)).toEqual({ steps: 20, resolution: 1024 });
  });
});
