import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodePng } from "../../../test/support/decodePng";
import { cutDrawn } from "../liveHead/drawn";
import { syntheticFrames } from "../liveHead/syntheticFrames";
import type { Rig } from "../liveHead/types";
import { publishedFrames } from "./demoFrames";

const PAGE = join(__dirname, "../../../docs/guide/showcase/animated-character");
const demo = JSON.parse(readFileSync(join(PAGE, "demo.json"), "utf8")) as { characters: Array<{ id: string; looks: Record<string, { bust: string; rig: string }> }> };
const looks = demo.characters.flatMap((character) => Object.entries(character.looks).map(([key, look]) => [`${character.id}/${key}`, look] as const));

describe("drawn frames on the demo characters", () => {
  test.each(looks)("%s: placeholder blink and mouth frames line up with the rig and are all accepted", (_name, look) => {
    const art = decodePng(readFileSync(join(PAGE, look.bust))), rig = (JSON.parse(readFileSync(join(PAGE, look.rig), "utf8")) as { rig: Rig }).rig;
    const set = cutDrawn(rig, art, syntheticFrames(art, rig));
    expect(set.refused).toEqual([]);
    expect(set.sprites.map((sprite) => sprite.name).sort()).toEqual(["eyes_closed_0", "eyes_closed_1", "mouth_o", "mouth_talk", "mouth_talk2", "mouth_wide"]);
  });

  test("published frame paths resolve against the page, and a look without frames keeps the warp", () => {
    expect(publishedFrames("base/", { talk: "f/june-talk.png", blink: "f/june-blink.png" })).toEqual({ frames: { blink: "base/f/june-blink.png", talk: "base/f/june-talk.png" } });
    expect(publishedFrames("base/", undefined)).toBeUndefined();
    expect(publishedFrames("base/", {})).toBeUndefined();
  });
});
