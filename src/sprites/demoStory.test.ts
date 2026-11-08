import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStory } from "@engine/validate";
import { shippedPoses } from "./poses/library";
import { readStageDirection } from "./direction";

const DEMO = join(__dirname, "../../test/showcase/demo");
const ART = join(__dirname, "../../docs/guide/assets/showcase");
const raw = JSON.parse(readFileSync(join(DEMO, "beacon.story.json"), "utf8"));
const BUILT_FACES = ["neutral", "happy", "angry", "worried"];
const BACKDROPS = ["harbor-town-afternoon", "library-fireplace-night", "forest-path-mist", "mountain-lake-dawn"];
const PROFILES = ["opening", "conversation", "decision", "action", "aftermath"];

interface Checkpoint {
  id: string;
  min_turns?: number;
  leads?: string[];
  stuck_after?: number;
  offers?: { id: string; text: string }[];
  talk_control?: { lead: string; profile: string; speakers: { member: string }[] };
  effects: { background?: string; stage: unknown; card?: Record<string, Record<string, string>>; npc_replies?: { member: string }[] };
}
const checkpoints = raw.checkpoints as Checkpoint[];
const names: string[] = raw.roster.map((member: { name: string }) => member.name);

describe("demo story fixture", () => {
  test("validates as a story", () => {
    const parsed = parseStory(raw);
    expect(Array.isArray(parsed) ? parsed : []).toEqual([]);
  });

  test("three members, three or four scenes, cards for every member", () => {
    expect(names).toHaveLength(3);
    expect(checkpoints.length).toBeGreaterThanOrEqual(3);
    expect(checkpoints.length).toBeLessThanOrEqual(4);
    expect(raw.requirements.members).toEqual(names);
    expect(names.every((name) => name.startsWith("SO-"))).toBe(true);
    for (const name of names) {
      const card = JSON.parse(readFileSync(join(DEMO, `${name.replace(/^SO-Demo /, "").toLowerCase()}.card.json`), "utf8"));
      expect(card.spec).toBe("chara_card_v2");
      expect(card.data.name).toBe(name);
    }
  });

  test("every scene paces its talk with a profile and a lead from the cast", () => {
    for (const checkpoint of checkpoints) {
      const talk = checkpoint.talk_control!;
      expect(PROFILES).toContain(talk.profile);
      expect(names).toContain(talk.lead);
      expect(talk.speakers.map((speaker) => speaker.member).sort()).toEqual([...names].sort());
    }
    expect(new Set(checkpoints.map((checkpoint) => checkpoint.talk_control!.profile)).size).toBeGreaterThanOrEqual(3);
  });

  test("shows a stuck lead ladder, minimum turns and in-chat elements", () => {
    const stuck = checkpoints.filter((checkpoint) => (checkpoint.leads?.length ?? 0) >= 3);
    expect(stuck).not.toHaveLength(0);
    expect(stuck.every((checkpoint) => checkpoint.leads!.every((lead) => lead.length <= 240) && (checkpoint.stuck_after ?? 6) <= 3)).toBe(true);
    expect(checkpoints.some((checkpoint) => (checkpoint.min_turns ?? 0) >= 2)).toBe(true);
    expect(checkpoints.some((checkpoint) => (checkpoint.offers?.length ?? 0) >= 2)).toBe(true);
    expect(raw.codex.people.length + raw.codex.places.length).toBeGreaterThan(0);
  });

  test("every scene changes the background to a picture of the shared showcase set", () => {
    const backgrounds = checkpoints.map((checkpoint) => checkpoint.effects.background ?? "");
    expect(new Set(backgrounds).size).toBe(checkpoints.length);
    const ids = backgrounds.map((background) => /^so-demo-([a-z-]+)\.jpg$/.exec(background)?.[1]);
    expect(ids.every((id) => id && BACKDROPS.includes(id))).toBe(true);
    if (existsSync(join(ART, "backdrops"))) for (const id of ids) expect(existsSync(join(ART, "backdrops", `${id}.jpg`))).toBe(true);
  });

  test("directs shipped poses and built faces, and changes one look", () => {
    const library = new Set(shippedPoses().map((pose) => pose.id));
    const allowed = new Map<string, Set<string>>(raw.roster.map((member: { id: string; sprites: { pose: string; poses: string[] } }) => [member.id, new Set([member.sprites.pose, ...member.sprites.poses])]));
    for (const checkpoint of checkpoints) {
      const direction = readStageDirection(checkpoint.effects.stage);
      expect(direction).not.toBeNull();
      for (const [member, entry] of Object.entries(direction!.cast)) {
        expect(library.has(entry.pose ?? "stand_relaxed")).toBe(true);
        expect(allowed.get(member)?.has(entry.pose ?? "stand_relaxed")).toBe(true);
        expect(BUILT_FACES).toContain(entry.face);
      }
      for (const reply of checkpoint.effects.npc_replies ?? []) expect(names).toContain(reply.member);
    }
    const looks = checkpoints.flatMap((checkpoint) => Object.entries(checkpoint.effects.card ?? {}).flatMap(([owner, fields]) => Object.keys(fields).map((field) => `${owner}.${field}`)));
    expect(looks).toEqual(["june.outfit"]);
  });
});
