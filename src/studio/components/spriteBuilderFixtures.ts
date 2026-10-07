import type { SpriteBuilderHost } from "./SpriteBuilder";
import type { SpriteCandidate } from "../../sprites/builder/builder";
import { EDIT_NODES } from "../../sprites/builder/recipes";

export const SPRITE_FIXTURE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6i8AAAAASUVORK5CYII=";
const hash = "a".repeat(64);
const pixels = new Uint8ClampedArray(64 * 64 * 4);
for (let at = 4; at < pixels.length; at += 4) {
  pixels[at] = at % 256; pixels[at + 1] = (at * 7) % 256; pixels[at + 2] = (at * 11) % 256; pixels[at + 3] = 255;
}

export const spriteBuilderFixtures: SpriteBuilderHost = {
  members: () => [{ name: "Test", folder: "Test", image: `data:image/png;base64,${SPRITE_FIXTURE_PNG}` }], list: async () => [],
  discover: async () => ({ nodes: Object.fromEntries(EDIT_NODES.map((node) => [node, {}])), embeddings: [], checkpoints: [],
    diffusionModels: ["edit"], textEncoders: ["encoder"], vaes: ["vae"], loras: [], upscalers: [],
    alpha: [{ id: "installed_alpha", node: "BiRefNetRMBG", model: "BiRefNet_toonout", files: [{ name: "alpha", sha256: hash, size: 1 }] }] }),
  fingerprint: async (_kind, name) => ({ name, sha256: hash, size: 1 }), manifest: async () => null,
  sets: async () => [], delete: async () => ({ ok: true, deleted: true }), referenceSets: async () => [""],
  referencePack: async (character, set) => ({ character, set, sha256: hash,
    files: [{ label: "neutral", path: "neutral.png", sha256: hash, width: 64, height: 64 }] }),
  decode: async () => ({ width: 64, height: 64, data: pixels, sha256: hash }),
  builder: () => ({ close: () => {}, cancel: () => {}, build: async (request): Promise<SpriteCandidate> => ({ request, key: String(request.seed),
    data: SPRITE_FIXTURE_PNG, qa: { ok: true, reasons: [], changed: 1, alphaPixels: 1, ringDrift: 0 }, seconds: 1,
    inputs: { base: hash, models: request.models, kind: request.kind, value: request.value, seed: request.seed, steps: request.steps, box: request.box } }),
  save: async () => ({ path: "/characters/Test/pilot/neutral.png", sha256: hash }) }),
};
