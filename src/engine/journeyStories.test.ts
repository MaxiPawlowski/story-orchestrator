import * as fs from "node:fs";
import * as path from "node:path";
import { parseStoryV2 } from "./validate";

const DIR = path.join(process.cwd(), "test/journeys");
const stories = fs.readdirSync(DIR).filter((file) => file.endsWith(".story.json"));

// A journey imports these into the live page; a story that fails validation there blocks every
// later check with a message about the import, not about the story.
describe("journey stories", () => {
  it.each(stories)("%s validates", (file) => {
    const parsed = parseStoryV2(JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")));
    expect(Array.isArray(parsed) ? parsed : []).toEqual([]);
  });
});
