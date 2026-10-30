import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const DIR = __dirname;
const sources = readdirSync(DIR).filter((name) => /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name))
  .map((name) => ({ name, text: readFileSync(join(DIR, name), "utf8") }));
const imports = (text: string) => [...text.matchAll(/from\s+"([^"]+)"/g), ...text.matchAll(/import\(\s*"([^"]+)"\s*\)/g)].map((match) => match[1]);

const ALLOWED = [/^\.\//, /^\.\.\/(settings|stage|reactionMap)$/, /^react$/, /^@engine\/schema$/, /^@runtime\/(hash|types)$/, /^@services\/stHost\/backgroundLayer$/];
const WRITERS = /setGlobalSettings|saveMetadata|saveSettings|applyDelta|enqueue|setQuality|upsertWIEntry|applyBackground|executeSlashCommands|spriteWriteExpressions/;

describe("sprite motion is presentation only", () => {
  it("imports nothing that writes story state, memory, settings or the host", () => {
    expect(sources.length).toBeGreaterThan(5);
    const stray = sources.flatMap(({ name, text }) => imports(text).filter((spec) => !ALLOWED.some((pattern) => pattern.test(spec))).map((spec) => `${name}: ${spec}`));
    expect(stray).toEqual([]);
    expect(sources.filter(({ text }) => WRITERS.test(text)).map(({ name }) => name)).toEqual([]);
  });

  it("reads the host background only through the read seam", () => {
    const host = sources.flatMap(({ name, text }) => (text.includes("@services/stHost/backgroundLayer") ? [name] : []));
    expect(host).toEqual(["BackgroundFade.tsx"]);
    expect(sources.find(({ name }) => name === "BackgroundFade.tsx")?.text).not.toMatch(/applyBackground|getCurrentBackground/);
  });

  it("the guard catches a planted writer import", () => {
    const planted = "import { setGlobalSettings } from \"@runtime/settingsStore\";";
    expect(imports(planted).some((spec) => !ALLOWED.some((pattern) => pattern.test(spec)))).toBe(true);
    expect(WRITERS.test(planted)).toBe(true);
  });
});
