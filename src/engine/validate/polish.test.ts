import { readFileSync } from "fs";
import { join } from "path";
import { installGameLayer, gameLayer, usesGameLayer, GAME_LAYER_LOADING } from "./gameLayer";
import { parseStory, parseStoryOrThrow } from "../validate";
import { diffStories } from "../storyDiff";
import type { ValidationError } from "../schema";
import { resolveFeatures } from "../../runtime/featureResolve";
import { defaultGlobalSettings } from "../../runtime/settingsModel";

type Raw = Record<string, unknown> & { roster: Array<Record<string, unknown>> };

const load = (): Raw => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/polish-only.story.json"), "utf8")) as Raw;

const errorsOf = (json: unknown): ValidationError[] => {
  const parsed = parseStory(json);
  return Array.isArray(parsed) ? parsed : [];
};

describe("v2.9 plan 03 S2: story polish policy", () => {
  it("reads a story whose only new content is polish, through the game layer", () => {
    const story = parseStoryOrThrow(load());
    expect(story.polish).toEqual({ mode: "shadow", narration: { notes: "Present tense. Short paragraphs.", avoid: ["suddenly"], tics: ["a mix of"], rhythm: "plain" } });
    expect(story.quests).toBeUndefined();
    expect(story.codex).toBeUndefined();
    expect(story.life).toBeUndefined();
    expect(usesGameLayer(load())).toBe(true);
  });

  it("is refused as loading when the game layer is not there yet", () => {
    const layer = gameLayer();
    installGameLayer(null as never);
    try {
      expect(errorsOf(load())).toEqual([{ path: "$", message: GAME_LAYER_LOADING }]);
    } finally {
      if (layer) installGameLayer(layer);
    }
  });

  it.each<[string, unknown, string]>([
    ["an unknown mode", { mode: "auto" }, "polish.mode"],
    ["an unknown key", { mode: "shadow", every: 3 }, "polish.every"],
    ["a narration voice with by_mood", { narration: { notes: "Plain.", by_mood: { calm: "x" } } }, "polish.narration.by_mood"],
    ["a name in the narration avoid list", { narration: { avoid: ["Keeper"] } }, "polish.narration.avoid.0"],
    ["not an object", "shadow", "polish"],
  ])("refuses %s", (_label, polish, path) => {
    expect(errorsOf({ ...load(), polish }).map((error) => error.path)).toContain(path);
  });

  it("needs a narrator for a narration voice", () => {
    const story = load();
    story.roster = story.roster.filter((member) => member.view !== "omniscient");
    expect(errorsOf(story).map((error) => error.path)).toEqual(["polish.narration"]);
  });

  it("a polish change never invalidates a running chat", () => {
    const before = parseStoryOrThrow(load());
    const after = parseStoryOrThrow({ ...load(), polish: { mode: "off" } });
    expect(diffStories(before, after, null).classification).not.toBe("invalidating");
  });

  it("the authored mode is the story default; a chat override wins; the install master switches it off", () => {
    const story = parseStoryOrThrow({ ...load(), polish: { mode: "off" } });
    const global = defaultGlobalSettings();
    expect(resolveFeatures(global, story).polish.controls.mode).toEqual({ value: "off", source: "story" });
    expect(resolveFeatures(global, story, { polish: { mode: "shadow" } }).polish.controls.mode).toEqual({ value: "shadow", source: "chat" });
    expect(resolveFeatures(global, null).polish).toMatchObject({ enabled: true, controls: { mode: { value: "shadow", source: "install" } } });
    expect(resolveFeatures({ ...global, characters: { ...global.characters, polish: false } }, story).polish).toMatchObject({ enabled: false, masterOff: true });
  });
});
