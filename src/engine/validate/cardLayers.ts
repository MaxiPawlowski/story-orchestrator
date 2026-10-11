import type { RosterMember, StoryPlayer, ValidationError } from "../schema";
import { isRecord } from "@utils/guards";

export function validateCardLayers(roster: RosterMember[], player: StoryPlayer | undefined, errors: ValidationError[]): void {
  const owners = [...roster.map((member, at) => ({ card: member.card, path: `roster.${at}.card.fields` })), { card: player?.card, path: "player.card.fields" }];
  for (const { card, path } of owners) for (const [field, binding] of Object.entries(card?.fields ?? {})) {
    if (!isRecord(binding)) continue;
    const at = `${path}.${field}`;
    if (binding.layer !== undefined && !["base", "face", "decal"].includes(binding.layer)) errors.push({ path: `${at}.layer`, message: "layer must be base, face or decal" });
    if (binding.rebase !== undefined && typeof binding.rebase !== "boolean") errors.push({ path: `${at}.rebase`, message: "rebase must be boolean" });
    if (binding.rebase === true && (binding.visual !== true || binding.layer && binding.layer !== "base")) errors.push({ path: `${at}.rebase`, message: "rebase needs a visual base field" });
    if (binding.region !== undefined) {
      const r = binding.region;
      if (binding.layer !== "decal" || !isRecord(r) || ![r.x, r.y, r.width, r.height].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)
        || r.width <= 0 || r.height <= 0 || r.x + r.width > 1 || r.y + r.height > 1) errors.push({ path: `${at}.region`, message: "decal region needs x, y, width and height inside [0,1]" });
    }
  }
}
