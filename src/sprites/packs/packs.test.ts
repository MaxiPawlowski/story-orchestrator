import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash, webcrypto } from "node:crypto";
import { parseStory, parseStoryOrThrow, isValidationErrorList, type NormalizedStory } from "@engine/index";
import { diffStories } from "@engine/storyDiff";
import { packCatalog, type PackListing } from "./catalog";
import { packKey, readVisualPack, type IdentityPack } from "./pack";
import { createVisualBridge } from "./bridge";
import { directorView, resolveVisualScene, visualRecord } from "./scene";
import { stageIdentity } from "./stageLooks";
import { lookSignature } from "../visualManifest";
import { imageMessages, sceneForImage, templateImagePrompt } from "../../image/prompt";
import { resolveImageRoute } from "../../image/routing";
import { defaultImageSettings, sanitizeImageOverride } from "../../image/settings";
import { pinnedTags, visualMembers, withVisualScene } from "../../image/visualPlan";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const ROOT = join(__dirname, "../../..");
const DIR = join(ROOT, "test/fixtures/visual-packs");
const raw = (name: string) => JSON.parse(readFileSync(join(DIR, `${name}.pack.json`), "utf8")) as Record<string, unknown>;
const listing = (...names: string[]): PackListing[] => names.map((name) => ({ file: `${name}.pack.json`, pack: raw(name) }));
const ALL = ["style-ink", "identity-wanderer", "identity-wanderer-r2", "place-harbor", "place-observatory"];
const textHash = async (text: string) => createHash("sha256").update(text).digest("hex");
const STORY_RAW = JSON.parse(readFileSync(join(ROOT, "test/fixtures/visual-bridge.story.json"), "utf8")) as Record<string, unknown>;
const story = (patch: Record<string, unknown> = {}): NormalizedStory => parseStoryOrThrow({ ...STORY_RAW, ...patch });
const servedHashes = (names = ALL) => new Map(names.flatMap((name) => (raw(name).assets as Array<{ path: string; sha256: string }>).map((asset) => [asset.path, asset.sha256] as const)));

const bridgeOver = (files: Map<string, string>, packs: () => PackListing[] = () => listing(...ALL)) => {
  const reads: string[] = [];
  const bridge = createVisualBridge({ list: async () => packs(), textHash,
    fileHash: async (path) => { reads.push(path); const hash = files.get(path); if (!hash) throw new Error("404"); return hash; } });
  return { bridge, reads };
};

describe("visual bridge: pack contract", () => {
  it("every fixture pack reads, and its digest matches its content", async () => {
    const names = readdirSync(DIR).map((file) => file.replace(/\.pack\.json$/, ""));
    expect(names.sort()).toEqual([...ALL].sort());
    const catalog = await packCatalog(listing(...ALL), textHash);
    expect(catalog.refused).toEqual([]);
    expect(catalog.packs.size).toBe(ALL.length);
  });

  it("a pack edited after its digest was written is refused, so a changed file never passes as the pinned one", async () => {
    const edited = { ...raw("identity-wanderer"), traits: ["long black hair"] };
    const catalog = await packCatalog([{ file: "edited.pack.json", pack: edited }], textHash);
    expect(catalog.packs.size).toBe(0);
    expect(catalog.refused).toEqual([{ file: "edited.pack.json", problems: ["digest: does not match the pack's content"] }]);
  });

  it("refuses unserved paths, Git LFS pointer media, unknown keys, a default look with changed fields and a missing format version", () => {
    const wanderer = raw("identity-wanderer");
    const assets = wanderer.assets as Array<Record<string, unknown>>;
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ ...wanderer, assets: [{ ...assets[0], path: "C:/campaign/objects/abc.png" }, ...assets.slice(1)] }, /assets\.0\.path/],
      [{ ...wanderer, assets: [{ ...assets[0], media: "text/plain" }, ...assets.slice(1)] }, /assets\.0\.media/],
      [{ ...wanderer, extra: true }, /pack\.extra: unknown key/],
      [{ ...wanderer, looks: { ...(wanderer.looks as object), default: { fields: { outfit: "coat" }, base: "look:default:base" } } }, /default look has no changed fields/],
      [{ ...wanderer, formatVersion: 2 }, /formatVersion/],
      [{ ...wanderer, assets: [{ ...assets[0], path: "/characters/../secrets.json" }, ...assets.slice(1)] }, /assets\.0\.path/],
    ];
    for (const [value, problem] of cases) {
      const read = readVisualPack(value);
      expect(read.ok).toBe(false);
      expect(read.ok ? [] : read.problems.join("\n")).toMatch(problem);
    }
  });

  it("tag and recipe families are route family ids; a short or unknown family is refused by name, never silently read as default", () => {
    const wanderer = raw("identity-wanderer"), style = raw("style-ink");
    const tags = wanderer.tagsByFamily as Record<string, string[]>, recipes = style.recipes as Record<string, unknown>;
    const read = readVisualPack(wanderer);
    expect(read.ok && read.pack.kind === "identity" ? Object.keys(read.pack.tagsByFamily).sort() : []).toEqual(["default", "sdxl-illustrious"]);
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...wanderer, tagsByFamily: { illustrious: tags["sdxl-illustrious"], default: tags.default } },
        "tagsByFamily.illustrious: names no renderer family; use sdxl-illustrious, sdxl-noobai, default ('illustrious' is written 'sdxl-illustrious')"],
      [{ ...wanderer, tagsByFamily: { ...tags, noobai: ["1girl"] } }, "tagsByFamily.noobai: names no renderer family; use sdxl-illustrious, sdxl-noobai, default ('noobai' is written 'sdxl-noobai')"],
      [{ ...wanderer, tagsByFamily: { ...tags, flux: ["1girl"] } }, "tagsByFamily.flux: names no renderer family; use sdxl-illustrious, sdxl-noobai, default"],
      [{ ...style, recipes: { default: recipes["sdxl-illustrious"] } }, "recipes.default: names no renderer family; use sdxl-illustrious, sdxl-noobai"],
    ];
    for (const [value, problem] of cases) {
      const refused = readVisualPack(value);
      expect(refused.ok ? [] : refused.problems).toEqual([problem]);
    }
  });

  it("story bindings validate ids and digests, name a real cast member and checkpoint, and changing them is a compatible update", () => {
    const packs = (STORY_RAW.illustrations as { packs: Record<string, unknown> }).packs;
    const errors = (patch: Record<string, unknown>) => {
      const parsed = parseStory({ ...STORY_RAW, illustrations: { ...(STORY_RAW.illustrations as object), packs: { ...packs, ...patch } } });
      return isValidationErrorList(parsed) ? parsed.map((error) => error.path) : [];
    };
    expect(errors({})).toEqual([]);
    expect(errors({ identities: { ghost: { id: "fixture-wanderer", digest: "a".repeat(64) } } })).toEqual(["illustrations.packs.identities.ghost"]);
    expect(errors({ places: { nowhere: { id: "fixture-harbor", digest: "a".repeat(64) } } })).toEqual(["illustrations.packs.places.nowhere"]);
    expect(errors({ style: { id: "Fixture Ink", digest: "short" } })).toEqual(["illustrations.packs.style.id"]);
    expect(errors({ style: { id: "fixture-ink-style", digest: "short" } })).toEqual(["illustrations.packs.style.digest"]);
    const before = story(), after = story({ illustrations: { ...(STORY_RAW.illustrations as object), packs: { ...packs, style: undefined } } });
    expect(diffStories(before, after, null).entries).toEqual([expect.objectContaining({ code: "visual-packs-changed", kind: "compatible" })]);
  });
});

describe("visual bridge: one resolved scene", () => {
  const scene = async (values: Record<string, string | boolean>, path: string[], files = servedHashes(), packs?: () => PackListing[]) =>
    bridgeOver(files, packs).bridge.scene({ story: story(), members: ["wanderer"], values, path, family: "sdxl-illustrious" });

  it("resolves the bound identity, the current look, the place plate and variant, and the style, with dependency hashes", async () => {
    const start = await scene({}, ["quay"]);
    const wanderer = raw("identity-wanderer") as unknown as IdentityPack;
    expect(start.subjects[0]).toMatchObject({ member: "wanderer", source: "pack", substituted: false, tags: ["1girl", "short silver hair", "amber eyes", "freckles"],
      displayed: { look: "default", base: { path: "/characters/Wanderer/pack/default_neutral.png" } } });
    expect(start.place).toMatchObject({ source: "pack", name: "Lantern harbor", plate: { path: "/backgrounds/fixture_harbor_day.png" } });
    expect(start.style).toMatchObject({ source: "pack", target: "soft ink outlines with watercolor washes", recipe: { steps: 28 } });
    expect(start.packs).toContain(packKey(wanderer));
    expect(start.dependencies.map((entry) => entry.path)).toEqual(["/backgrounds/fixture_harbor_day.png", "/characters/Wanderer/pack/default_bust.png", "/characters/Wanderer/pack/default_neutral.png"]);
    const night = await scene({ wanderer_outfit: "grey rain cloak", time_of_day: "night" }, ["quay"]);
    expect(night.subjects[0].displayed?.look).toBe("rain_cloak");
    expect(night.place).toMatchObject({ variant: "night", plate: { path: "/backgrounds/fixture_harbor_night.png" } });
    expect(night.key).not.toBe(start.key);
  });

  it("a later beat's authored background without a pack is an unbound place named from the background, never the earlier pack", async () => {
    const market = await scene({}, ["quay", "market"]);
    expect(market.place).toMatchObject({ source: "none", fallback: "unbound", name: "market lane", checkpoint: "market" });
  });

  it("a look the pack lacks keeps the default look on show and records the substitution", async () => {
    const result = await scene({ wanderer_outfit: "a borrowed apron" }, ["quay"]);
    expect(result.subjects[0]).toMatchObject({ source: "pack", substituted: true, fallback: "look-missing", displayed: { look: "default" } });
    expect(visualRecord(result).subjects[0]).toEqual({ member: "wanderer", source: "pack", fallback: "look-missing", look: "default", substituted: true, qa: "accepted" });
  });

  it("hash mismatch: a stale look file is refused for the default look, and a stale default leaves no pack image at all", async () => {
    const files = servedHashes();
    files.set("/characters/Wanderer/pack/rain_cloak_neutral.png", "0".repeat(64));
    const stale = await scene({ wanderer_outfit: "grey rain cloak" }, ["quay"], files);
    expect(stale.subjects[0]).toMatchObject({ source: "pack", substituted: true, fallback: "asset-mismatch", displayed: { look: "default" } });
    files.set("/characters/Wanderer/pack/default_neutral.png", "0".repeat(64));
    const none = await scene({ wanderer_outfit: "grey rain cloak" }, ["quay"], files);
    expect(none.subjects[0]).toMatchObject({ source: "none", fallback: "asset-mismatch", tags: [] });
    expect(none.subjects[0].displayed).toBeUndefined();
    files.delete("/backgrounds/fixture_harbor_day.png");
    expect((await scene({}, ["quay"], files)).place).toMatchObject({ source: "none", fallback: "asset-mismatch", name: "fixture harbor day" });
  });

  it("the chat pins its pack: a newer revision is reported, never used, and a removed pinned pack is an explicit fallback", async () => {
    const pinned = await scene({}, ["quay"]);
    const r2 = raw("identity-wanderer-r2");
    expect(pinned.subjects[0].pack).toEqual({ id: "fixture-wanderer", digest: raw("identity-wanderer").digest });
    expect(pinned.subjects[0].newer).toEqual({ id: "fixture-wanderer", digest: r2.digest });
    const gone = await scene({}, ["quay"], servedHashes(), () => listing("style-ink", "identity-wanderer-r2", "place-harbor", "place-observatory"));
    expect(gone.subjects[0]).toMatchObject({ source: "none", fallback: "pack-missing", newer: { id: "fixture-wanderer", digest: r2.digest } });
  });

  it("an unbound member and a plugin without packs fall back to the text route, recorded", async () => {
    const none = await bridgeOver(new Map(), () => []).bridge.scene({ story: story(), members: ["wanderer", "keeper"], values: {}, path: ["quay"] });
    expect(none.subjects.map((row) => [row.member, row.source, row.fallback])).toEqual([["wanderer", "none", "pack-missing"], ["keeper", "none", "unbound"]]);
    expect(none.packs).toEqual([]);
  });
});

describe("visual bridge: the director sees only the permitted projection", () => {
  it("future look and future place never reach the director input, the template or the pinned tags", async () => {
    const { bridge } = bridgeOver(servedHashes());
    const parsed = story();
    const chat = { id: "c", groupId: "g", folder: "c", userName: "Player", characters: [{ key: "Wanderer.png", name: "Wanderer", description: "", appearance: "card tags", enabled: true }],
      messages: [{ name: "Wanderer", mes: "Wanderer unrolls a map on the quay.", is_user: false, is_system: false }] };
    const base = sceneForImage(chat, { purpose: "scene", text: "", messageId: null }, 6, null, "fixture harbor day");
    expect(visualMembers(base.subjects, parsed)).toEqual(["wanderer"]);
    const visual = await bridge.scene({ story: parsed, members: visualMembers(base.subjects, parsed), values: { wanderer_outfit: "grey rain cloak" }, path: ["quay"], family: "sdxl-illustrious" });
    const drawn = withVisualScene(base, visual);
    const route = resolveImageRoute(defaultImageSettings(), "scene", {}, sanitizeImageOverride(null));
    const prompt = imageMessages({ purpose: "scene", text: "", messageId: null }, drawn, route).map((message) => message.content).join("\n");
    const surfaces = [prompt, templateImagePrompt(drawn, "scene", ""), pinnedTags(drawn, null).join(", "), JSON.stringify(directorView(visual))];
    for (const surface of surfaces) {
      expect(surface).not.toMatch(/festival robe|embroidered/i);
      expect(surface).not.toMatch(/observatory|telescope|starry/i);
      expect(surface).not.toMatch(/night/i);
    }
    expect(prompt).toContain("Wanderer (focus) (identity tags, copy verbatim): 1girl, short silver hair, amber eyes, freckles. Current appearance: outfit: grey rain cloak");
    expect(prompt).toContain("CURRENT LOCATION: Lantern harbor (A small stone harbor");
    expect(drawn.placeDetail).toMatch(/^A small stone harbor with paper lanterns strung over the quay\. [^.]/);
    expect(drawn.placeDetail).not.toContain("..");
    expect(pinnedTags(drawn, { caption: "", checkpoint: "", reason: "", visible: ["Wanderer"], aspect: null, shot: null, prompt: "1girl, smiling", negative: "" }))
      .toEqual(["short silver hair", "amber eyes", "freckles"]);
    expect(pinnedTags(drawn, { caption: "", checkpoint: "", reason: "", visible: ["Someone else"], aspect: null, shot: null, prompt: "scenery", negative: "" })).toEqual([]);
  });
});

describe("visual bridge: stale and replaced packs", () => {
  it("a file replaced under the same name, or a pack replaced in the catalog, makes the resolved scene stale", async () => {
    const files = servedHashes();
    let packs = listing(...ALL);
    const { bridge } = bridgeOver(files, () => packs);
    const resolved = await bridge.scene({ story: story(), members: ["wanderer"], values: {}, path: ["quay"] });
    expect(await bridge.stillCurrent(resolved)).toBe(true);
    files.set("/characters/Wanderer/pack/default_neutral.png", "1".repeat(64));
    expect(await bridge.stillCurrent(resolved)).toBe(false);
    files.set("/characters/Wanderer/pack/default_neutral.png", servedHashes().get("/characters/Wanderer/pack/default_neutral.png") as string);
    expect(await bridge.stillCurrent(resolved)).toBe(true);
    packs = listing("style-ink", "identity-wanderer-r2", "place-harbor", "place-observatory");
    expect(await bridge.stillCurrent(resolved)).toBe(false);
  });

  it("verification hashes each file once per catalog read and again on a fresh read", async () => {
    const { bridge, reads } = bridgeOver(servedHashes());
    await bridge.scene({ story: story(), members: ["wanderer"], values: {}, path: ["quay"] });
    const first = reads.length;
    await bridge.scene({ story: story(), members: ["wanderer"], values: {}, path: ["quay"] });
    expect(reads.length).toBe(first);
    await bridge.scene({ story: story(), members: ["wanderer"], values: {}, path: ["quay"] }, { fresh: true });
    expect(reads.length).toBe(first * 2);
  });
});

describe("visual bridge: stage looks without builders", () => {
  it("every verified look becomes a stage set keyed by its look signature, and an unverified file is left out", async () => {
    const wanderer = (await packCatalog(listing("identity-wanderer"), textHash)).packs.values().next().value as IdentityPack;
    const files = servedHashes(["identity-wanderer"]);
    files.delete("/characters/Wanderer/pack/rain_cloak_happy.png");
    files.set("/characters/Wanderer/pack/festival_robe_neutral.png", "2".repeat(64));
    const identity = stageIdentity(wanderer, (asset) => files.get(asset.path) === asset.sha256);
    expect(identity.defaultFiles).toEqual(new Map([["neutral", "/characters/Wanderer/pack/default_neutral.png"], ["happy", "/characters/Wanderer/pack/default_happy.png"]]));
    expect(identity.looks).toEqual({ [lookSignature({ outfit: "grey rain cloak" })]: { set: "pk_rain_cloak", files: new Map([["neutral", "/characters/Wanderer/pack/rain_cloak_neutral.png"]]) } });
    const resolved = resolveVisualScene({ story: story(), members: ["wanderer"], values: {}, path: ["quay"], catalog: await packCatalog(listing(...ALL), textHash), verified: () => true });
    expect(resolved.subjects[0].source).toBe("pack");
  });
});
