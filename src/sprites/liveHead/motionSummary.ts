import type { HeadManifest } from "./manifest";

export function motionSummary(manifest: Pick<HeadManifest, "rig" | "layers">): string {
  const rig = manifest.rig, locks = (rig.strands ?? []).filter((strand) => strand.nodes.length >= 2 && strand.nodes.length <= 8).length;
  const hand = Boolean(rig.hand) && manifest.layers.some((layer) => layer.name === "hand");
  const parts = [locks ? `hair (${locks} ${locks === 1 ? "lock" : "locks"})` : "", "body sway", hand ? "hand" : ""].filter(Boolean);
  return `Moves: ${parts.join(", ")}.${locks ? "" : " No hair locks in this rig, so the hair stays still."}`;
}
