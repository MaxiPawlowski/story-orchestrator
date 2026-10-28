import { tidyTags } from "./tagHygiene";
import { assembleImagePrompt, imageMessages, sceneForImage, type ImageReply } from "./prompt";
import { resolveImageRoute } from "./routing";
import { defaultImageSettings, sanitizeImageOverride } from "./settings";
import { brokerSettled, DIRECTOR_FAILED_COPY, GPU_BUSY_COPY, withDirectorRetry } from "./directorRetry";

const route = resolveImageRoute(defaultImageSettings(), "scene", {}, sanitizeImageOverride(null));
const reply = (prompt: string, visible: string[], shot: ImageReply["shot"] = "cowboy"): ImageReply =>
  ({ caption: "", checkpoint: "", reason: "", visible, aspect: null, shot, prompt, negative: "" });
const hygiene = (visible: number, names = ["SO-P41 Ash", "SO-P41 Bram", "Max"]) => ({ names, visible, keepAngle: false });

describe("image e2e review 18: tag assembly", () => {
  it("one framing tag: the director's own framing words are dropped and the chosen shot is appended once", () => {
    const positive = assembleImagePrompt(route, reply("1girl, red hair, cowboy shot, upper body, holding map", ["SO-P41 Ash"]), "", [], hygiene(1)).positive;
    expect(positive.match(/cowboy shot/g)).toHaveLength(1);
    expect(positive).not.toMatch(/upper body/);
    expect(positive.endsWith("cowboy shot")).toBe(true);
  });

  it("from_below and from_above are dropped unless that angle was asked for", () => {
    expect(tidyTags("1girl, from_below, from above, smiling", [], hygiene(1)).rest).toEqual(["smiling"]);
    expect(tidyTags("1girl, from_below, smiling", [], { ...hygiene(1), keepAngle: true }).rest).toEqual(["from_below", "smiling"]);
  });

  it("full card names and the persona never reach the tags, while ordinary words that share a letter run stay", () => {
    const tidy = tidyTags("1girl, SO-P41 Ash, SO-P41 Ash holding a lantern, Max, ash blonde hair, maxi skirt", [], hygiene(1));
    expect(tidy.rest).toEqual(["holding a lantern", "ash blonde hair", "maxi skirt"]);
  });

  it("count tags lead and must match the visible list: pack identity counts win, a wrong director count becomes solo or is dropped", () => {
    expect(tidyTags("3girls, 1boy, reading", [], hygiene(1)).counts).toEqual(["solo"]);
    expect(tidyTags("3girls, 1boy, reading", [], hygiene(2)).counts).toEqual([]);
    expect(tidyTags("1girl, 1boy, reading", [], hygiene(2)).counts).toEqual(["1girl", "1boy"]);
    expect(tidyTags("2boys, reading", ["1girl", "silver hair", "1girl", "braid"], hygiene(2))).toEqual({ counts: ["2girls"], pinned: ["silver hair", "braid"], rest: ["reading"] });
    const positive = assembleImagePrompt(route, reply("reading, 1girl", ["SO-P41 Ash"]), "", ["1girl", "silver hair"], hygiene(1)).positive;
    expect(positive.indexOf("1girl")).toBeLessThan(positive.indexOf("silver hair"));
    expect(positive.indexOf("silver hair")).toBeLessThan(positive.indexOf("reading"));
  });

  it("the director is told the current look beats clothing words from the story, and to lead with count tags", () => {
    const scene = sceneForImage({ id: "c", groupId: "g", folder: "c", userName: "Max", characters: [], messages: [{ name: "Ash", mes: "Ash pulls on her mustard rain jacket.", is_user: false, is_system: false }] },
      { purpose: "scene", text: "", messageId: null }, 6);
    const system = imageMessages({ purpose: "scene", text: "", messageId: null }, scene, route)[0].content;
    expect(system).toContain("never take hair, eyes or clothing from the STORY text");
    expect(system).toContain("Start with count tags");
  });
});

describe("image e2e review 18: a director refused while the GPU is held", () => {
  it("waits for the broker, retries once, and on a second refusal falls back with the reason", async () => {
    const settle = jest.fn(async () => undefined);
    let calls = 0;
    const ok = await withDirectorRetry(async () => { calls += 1; if (calls === 1) throw new Error("API request failed (409 local_residency)"); return "json"; }, settle);
    expect(ok).toEqual({ value: "json", issue: null });
    expect(settle).toHaveBeenCalledTimes(1);
    const refused = await withDirectorRetry(async () => { throw new Error("Not enough free GPU/physical RAM for this profile"); }, settle);
    expect(refused).toMatchObject({ value: null, issue: GPU_BUSY_COPY });
    const invalid = await withDirectorRetry(async () => { throw new Error("The image director returned invalid JSON."); }, settle);
    expect(invalid).toMatchObject({ value: null, issue: DIRECTOR_FAILED_COPY });
    expect(settle).toHaveBeenCalledTimes(2);
  });

  it("the broker wait ends when no image holds the GPU, or at its deadline", async () => {
    const states = ["image", "held", "text-loaded"];
    let clock = 0;
    await brokerSettled(async () => ({ state: states.shift() }), async () => { clock += 1_000; }, () => clock);
    expect(states).toEqual([]);
    clock = 0;
    await brokerSettled(async () => ({ state: "image" }), async () => { clock += 30_000; }, () => clock, 60_000);
    expect(clock).toBe(60_000);
  });
});
