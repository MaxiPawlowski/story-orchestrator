import * as fs from "node:fs";
import * as path from "node:path";
import { parseStoryV2, READ_AS_TYPES } from "@engine/index";

const DIR = path.join(process.cwd(), "test/fixtures");
const sidecars = fs.readdirSync(DIR).filter((file) => file.endsWith(".hints.json")).map((file) => file.replace(".hints.json", ""));

// v2.2 plan 06: `so-live-suite --judge` merges these into recorded fixture stories, so a hint that
// cannot work must fail here, not halfway through a live run.
describe("live-suite hint sidecars", () => {
  it("exist for every extractor fixture", () => {
    const stories = fs.readdirSync(DIR).filter((file) => /^extractor\d*\.story\.json$/.test(file)).map((file) => file.replace(".story.json", ""));
    expect(sidecars.filter((name) => name.startsWith("extractor")).sort()).toEqual(stories.sort());
  });

  it.each(sidecars)("%s merges into a story that still validates", (name) => {
    const story = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.story.json`), "utf8")) as { qualities: Array<Record<string, unknown>> };
    const hints = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.hints.json`), "utf8")) as Record<string, { read_as: keyof typeof READ_AS_TYPES }>;
    const keys = new Set(story.qualities.map((quality) => quality.key));
    expect(Object.keys(hints).filter((key) => !keys.has(key))).toEqual([]);
    const merged = { ...story, qualities: story.qualities.map((quality) => ({ ...quality, ...(hints[String(quality.key)] ?? {}) })) };
    const parsed = parseStoryV2(merged);
    expect(Array.isArray(parsed) ? parsed : []).toEqual([]);
  });
});
