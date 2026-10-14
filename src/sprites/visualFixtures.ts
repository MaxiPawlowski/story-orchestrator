import type { VisualManifest } from "./visualManifest";
export const visualFixture = (): VisualManifest => {
  const base = { path: "/characters/Synthetic/base/neutral.png", sha256: "a".repeat(64), key: "base-key", recipe: { id: "qwen21-card-base", version: 2 } };
  const bust = { path: "/characters/Synthetic/bust/bust.png", sha256: "b".repeat(64), key: "bust-key", recipe: { id: "visual-bust-crop", version: 1 } };
  const id = "c".repeat(64);
  return { id, revision: 1, character: "Synthetic", card: { path: "/characters/Synthetic.png", sha256: "d".repeat(64) },
    baseSet: "base", base, bust, box: { x: 8, y: 8, width: 32, height: 32 }, looks: { default: { root: `${id}:1`, signature: "[]", base, bust } } };
};
