import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryV2 } from "@engine/validate";
import { shippedPoses } from "./poses/library";
import { readStageDirection } from "./direction";

const raw = JSON.parse(readFileSync(join(__dirname, "../../test/showcase/lantern-inn.story.json"), "utf8"));
const BUILT_FACES = ["neutral", "happy", "angry", "worried"];

describe("showcase story fixture", () => {
  test("validates as a format-2 story", () => {
    const parsed = parseStoryV2(raw);
    expect(Array.isArray(parsed) ? parsed : []).toEqual([]);
  });

  test("every directed pose is in the shipped library and in the member's allowlist", () => {
    const library = new Set(shippedPoses().map((pose) => pose.id));
    const allowed = new Map<string, Set<string>>(raw.roster.map((member: { id: string; sprites: { pose: string; poses: string[] } }) => [member.id, new Set([member.sprites.pose, ...member.sprites.poses])]));
    for (const checkpoint of raw.checkpoints) {
      const direction = readStageDirection(checkpoint.effects.stage);
      expect(direction).not.toBeNull();
      for (const [member, entry] of Object.entries(direction!.cast)) {
        expect(library.has(entry.pose ?? "stand_relaxed")).toBe(true);
        expect(allowed.get(member)?.has(entry.pose ?? "stand_relaxed")).toBe(true);
        expect(BUILT_FACES).toContain(entry.face);
      }
    }
  });

  test("shows all three framings and changes both a base look and a decal", () => {
    const framings = new Set(raw.checkpoints.map((checkpoint: { effects: { stage: { framing: string } } }) => checkpoint.effects.stage.framing));
    expect([...framings].sort()).toEqual(["close", "full", "thigh"]);
    const looks = raw.checkpoints.flatMap((checkpoint: { effects: { card?: Record<string, Record<string, string>> } }) => Object.entries(checkpoint.effects.card ?? {}).flatMap(([owner, fields]) => Object.keys(fields).map((field) => `${owner}.${field}`)));
    expect(looks.sort()).toEqual(["garrick.scar", "wren.outfit"]);
  });

  test("the card names are marked for cleanup and match the requirements", () => {
    const names = raw.roster.map((member: { name: string }) => member.name);
    expect(names.every((name: string) => name.startsWith("SO-"))).toBe(true);
    expect(raw.requirements.members).toEqual(names);
  });
});
