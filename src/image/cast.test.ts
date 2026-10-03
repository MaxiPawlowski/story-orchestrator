import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2, parseStoryV2OrThrow, isValidationErrorList, type NormalizedStoryV2 } from "@engine/index";
import { beatIllustrated, beatLabel, castForImage, cueText, isNarratorMember, lookFor } from "./cast";
import { firedLoreKeys, visualLore } from "./lore";
import { imageMessages, sceneForImage, type ImageScene } from "./prompt";
import { resolveImageRoute } from "./routing";
import { defaultImageSettings, sanitizeImageOverride } from "./settings";

const ROOT = join(__dirname, "../..");
const SUN_RAW = JSON.parse(readFileSync(join(ROOT, "examples/sun-ruins/quest-for-the-sun-ruins.json"), "utf8")) as { checkpoints: Array<Record<string, unknown>> };
const withPlayerNames = (names: Record<string, string>): NormalizedStoryV2 => parseStoryV2OrThrow({
  ...SUN_RAW,
  checkpoints: SUN_RAW.checkpoints.map((checkpoint) => (names[checkpoint.id as string] ? { ...checkpoint, player_name: names[checkpoint.id as string] } : checkpoint)),
});

const directorPrompt = (scene: ImageScene, text: string) => {
  const route = resolveImageRoute(defaultImageSettings(), "scene", {}, sanitizeImageOverride(null), null);
  return imageMessages({ purpose: "scene", text, messageId: null }, scene, route).map((message) => message.content).join("\n");
};

const emptyScene = (checkpoint: string | null): ImageScene =>
  sceneForImage({ id: "c", groupId: null, folder: "c", userName: "Player", messages: [], characters: [] }, { purpose: "scene", text: "", messageId: null }, 6, checkpoint);

const base = {
  format: 2, id: "look-fixture", title: "Looks", description: "Pictures.",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  transitions: [{ from: "a", to: "b", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: [
    { id: "dm", name: "Keeper", role: "Narrator: describes places and anyone not in the cast" },
    { id: "mira", name: "Mira", role: "A smuggler who owes the player" },
  ],
};
const story = (extra: Record<string, unknown> = {}, checkpoints?: Array<Record<string, unknown>>) => parseStoryV2OrThrow({
  ...base,
  checkpoints: checkpoints ?? [
    { id: "a", name: "The Hidden Betrayal", objective: "o", type: "anchor", start: true, chapter: "one" },
    { id: "b", name: "Quiet Road", objective: "o", type: "anchor", illustrate: false, chapter: "two" },
  ],
  chapters: [{ id: "one", title: "One" }, { id: "two", title: "Two", final: true, illustrations: { style: "ink wash", appearances: { mira: "travel cloak" } } }],
  illustrations: { checkpoints: true, style: "oil paint", appearances: { mira: "red coat" } },
  ...extra,
});

describe("C6: the image cue never carries a checkpoint's internal name", () => {
  const SUN = withPlayerNames({ cp2: "The Mission", "cp-5": "The Ruins" });

  it("spoiler property: no beat's internal name reaches the cue or the director prompt unless the player name says it", () => {
    const leaks = SUN.checkpoints.flatMap((checkpoint) => {
      const label = beatLabel(checkpoint);
      const text = cueText("checkpoint", label);
      const prompt = directorPrompt(emptyScene(label), text);
      const allowed = (checkpoint.player_name ?? "").includes(checkpoint.name);
      return !allowed && (text.includes(checkpoint.name) || prompt.includes(checkpoint.name)) ? [checkpoint.id] : [];
    });
    expect(leaks).toEqual([]);
  });

  it("names a beat by its player name, else a neutral establishing shot", () => {
    expect(cueText("checkpoint", beatLabel(SUN.checkpointById.cp2))).toBe("Establishing shot of The Mission.");
    expect(cueText("checkpoint", beatLabel(SUN.checkpointById.cp1))).toBe("Establishing shot of the current scene.");
    expect(beatLabel({ player_name: "  " })).toBeNull();
    expect(beatLabel(undefined)).toBeNull();
  });

  it("control: the property fails when the internal name is used", () => {
    const checkpoint = SUN.checkpointById.cp1;
    expect(directorPrompt(emptyScene(checkpoint.name), cueText("checkpoint", checkpoint.name))).toContain(checkpoint.name);
  });
});

describe("C7: lore looks come only from entries the player has seen fire, or from a public line", () => {
  const entries = [
    { world: "Lore", uid: 4, comment: "Old Hermit", key: ["hermit"], content: "Appearance: a winged serpent in disguise." },
    { world: "Lore", uid: 5, comment: "Ferryman", key: ["ferryman"], content: "Appearance: a drowned king.\nPublic appearance: a stooped man in oilskins." },
    { world: "Lore", uid: 6, comment: "Harbour", key: ["harbour"], content: "Appearance: grey stone quays." },
  ];
  const scene = "The hermit waves at the ferryman across the harbour.";

  it("drops an unfired entry's Appearance line and keeps a Public appearance line", () => {
    const lines = visualLore(entries, ["Lore"], [], scene, new Set());
    expect(lines).toEqual(["ferryman: a stooped man in oilskins."]);
    expect(lines.join(" ")).not.toMatch(/serpent|drowned|quays/);
  });

  it("uses an Appearance line once that entry has fired in this chat, and prefers the public line", () => {
    const fired = firedLoreKeys([{ entries: [{ book: "lore", uid: 6 }] }, { entries: [{ book: "Lore", uid: 5 }] }]);
    expect(visualLore(entries, ["Lore"], [], scene, fired)).toEqual(["ferryman: a stooped man in oilskins.", "harbour: grey stone quays."]);
  });

  it("control: firing is per book and uid, not per name", () => {
    expect(visualLore(entries, ["Lore"], [], scene, firedLoreKeys([{ entries: [{ book: "Other", uid: 4 }] }]))).toEqual(["ferryman: a stooped man in oilskins."]);
    expect(visualLore(entries, ["Lore"], [], scene, firedLoreKeys([{ entries: [{ book: "Lore", uid: 4 }] }]))).toContain("hermit: a winged serpent in disguise.");
  });
});

describe("C8: per-checkpoint opt-out and per-chapter look", () => {
  it("parses illustrate: false and a chapter's illustrations, and refuses a bad shape", () => {
    const parsed = story();
    expect(parsed.checkpointById.b.illustrate).toBe(false);
    expect(parsed.checkpointById.a).not.toHaveProperty("illustrate");
    expect(parsed.chapterById?.two.illustrations).toEqual({ style: "ink wash", appearances: { mira: "travel cloak" } });
    const bad = parseStoryV2({ ...base, checkpoints: [{ id: "a", name: "A", objective: "o", type: "anchor", start: true, illustrate: "no" }, { id: "b", name: "B", objective: "o", type: "anchor" }] });
    expect(isValidationErrorList(bad) && bad.map((error) => error.path)).toEqual(["checkpoints.0.illustrate"]);
    const badChapter = parseStoryV2({ ...base, chapters: [{ id: "one", title: "One", final: true, illustrations: { checkpoints: true } }],
      checkpoints: [{ id: "a", name: "A", objective: "o", type: "anchor", start: true, chapter: "one" }, { id: "b", name: "B", objective: "o", type: "anchor", chapter: "one" }] });
    expect(isValidationErrorList(badChapter) && badChapter.map((error) => error.path)).toContain("chapters.0.illustrations.checkpoints");
  });

  it("skips story cues on an opted-out beat only", () => {
    const parsed = story();
    expect(beatIllustrated(parsed, "a")).toBe(true);
    expect(beatIllustrated(parsed, "b")).toBe(false);
    expect(beatIllustrated(parsed, null)).toBe(true);
    expect(beatIllustrated(null, "b")).toBe(true);
  });

  it("overrides style and per-member looks inside the chapter, and falls back to the story outside it", () => {
    const parsed = story();
    expect(lookFor(parsed, "a")).toEqual({ style: "oil paint", appearances: { mira: "red coat" } });
    expect(lookFor(parsed, "b")).toEqual({ style: "ink wash", appearances: { mira: "travel cloak" } });
    expect(lookFor(null, "a")).toEqual({});
  });
});

describe("C9: a narrator or system member is never drawn from its card description", () => {
  const subjects: ImageScene["subjects"] = [
    { key: "k.png", name: "Keeper", appearance: "You are the narrator. Describe the world vividly...", focus: false, described: true },
    { key: "m.png", name: "Mira", appearance: "Freckles, a scar on the chin", focus: true, described: true },
  ];

  it("defines narrator-like from the roster role or an omniscient view", () => {
    expect(isNarratorMember({ role: "Narrator: describes places" })).toBe(true);
    expect(isNarratorMember({ role: "The game master" })).toBe(true);
    expect(isNarratorMember({ role: "DM for the table" })).toBe(true);
    expect(isNarratorMember({ role: "System voice" })).toBe(true);
    expect(isNarratorMember({ role: "A bard", view: "omniscient" })).toBe(true);
    expect(isNarratorMember({ role: "A bard who narrates his past" })).toBe(false);
    expect(isNarratorMember({})).toBe(false);
  });

  it("drops a narrator whose look would be its card description, keeps everyone else", () => {
    const cast = castForImage(subjects, story({ illustrations: undefined }), {});
    expect(cast.map((subject) => subject.name)).toEqual(["Mira"]);
    expect(cast[0].appearance).toBe("Freckles, a scar on the chin");
  });

  it("keeps a narrator with an authored or a card appearance, and applies the active look", () => {
    const parsed = story({ illustrations: { checkpoints: true, appearances: { dm: "never drawn; a voice" } } });
    expect(castForImage(subjects, parsed, lookFor(parsed, "a")).map((subject) => [subject.name, subject.appearance]))
      .toEqual([["Keeper", "never drawn; a voice"], ["Mira", "Freckles, a scar on the chin"]]);
    expect(castForImage([{ ...subjects[0], appearance: "hooded grey robe", described: false }], story(), {}).map((subject) => subject.name)).toEqual(["Keeper"]);
  });

  it("marks a card subject as described only when it has no appearance field", () => {
    const scene = sceneForImage({ id: "c", groupId: null, folder: "c", userName: "Player",
      messages: [{ name: "Keeper", mes: "Rain falls.", is_user: false, is_system: false }],
      characters: [
        { key: "k.png", name: "Keeper", appearance: "", description: "You are the narrator.", enabled: true },
        { key: "m.png", name: "Mira", appearance: "freckles", description: "", enabled: true },
      ] }, { purpose: "scene", text: "", messageId: null }, 6);
    expect(scene.subjects.map((subject) => [subject.name, subject.described])).toEqual([["Keeper", true], ["Mira", false]]);
    expect(castForImage(scene.subjects, story(), {}).map((subject) => subject.name)).toEqual(["Mira"]);
  });
});
