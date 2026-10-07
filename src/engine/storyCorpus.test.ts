import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative } from "path";
import { parseStoryV2 } from "./validate";
import { isValidationErrorList } from "./schema";

// v2.5 plan 11 step 6: one authoring vocabulary is only safe if no story in the repo still speaks the
// old one. Every format-2 story file, and every story a scenario or journey imports inline, parses.
const ROOT = join(__dirname, "..", "..");

const walk = (dir: string): string[] => (existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "records" ? [] : walk(path);
    return entry.name.endsWith(".json") ? [path] : [];
  })
  : []);

const storiesIn = (value: unknown, found: unknown[] = []): unknown[] => {
  if (Array.isArray(value)) value.forEach((entry) => storiesIn(entry, found));
  else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.format === 2 && Array.isArray(record.checkpoints)) found.push(record);
    else Object.values(record).forEach((entry) => storiesIn(entry, found));
  }
  return found;
};

const corpus = ["examples", "test/fixtures", "test/scenarios", "test/journeys"].flatMap((dir) => walk(join(ROOT, dir)))
  .flatMap((path) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return [];
    }
    return storiesIn(parsed).map((story, index) => ({ where: `${relative(ROOT, path).replace(/\\/g, "/")}#${index}`, story }));
  });

const REFUSED_ON_PURPOSE: Record<string, string> = {
  "test/scenarios/v27-35-side-exit-always.story.json#0": "transitions.1 an open stretch ends only through arrive_when",
  "test/scenarios/v27-35-side-exit-turns.story.json#0": "transitions.1 an open stretch ends only through arrive_when",
};

const problemsOf = (story: unknown): string[] => {
  const parsed = parseStoryV2(story);
  return isValidationErrorList(parsed) ? parsed.map((error) => `${error.path} ${error.message}`) : [];
};

describe("v2.5 plan 11: the repo's story corpus parses under one vocabulary", () => {
  it("finds the corpus", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(57);
  });

  it("every story a fixture imports to see it refused is refused, for the reason it names", () => {
    for (const [where, reason] of Object.entries(REFUSED_ON_PURPOSE)) {
      const entry = corpus.find((candidate) => candidate.where === where);
      expect(entry).toBeDefined();
      expect(problemsOf(entry!.story).join("; ")).toContain(reason);
    }
  });

  it("every format-2 story parses with no validation error", () => {
    const failing = corpus.filter(({ where }) => !(where in REFUSED_ON_PURPOSE)).flatMap(({ where, story }) => {
      const parsed = parseStoryV2(story);
      return isValidationErrorList(parsed) ? [`${where}: ${parsed.map((error) => `${error.path} ${error.message}`).join("; ")}`] : [];
    });
    expect(failing).toEqual([]);
  });

  it("control: a story with a removed alias fails the same check", () => {
    const [first] = corpus;
    const parsed = parseStoryV2({ ...(first.story as Record<string, unknown>), requirements: { groupMembers: ["Arin"] } });
    expect(isValidationErrorList(parsed)).toBe(true);
  });
});
