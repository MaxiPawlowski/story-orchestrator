import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { ROOT, SRC, rel } from "../../test/support/codeHealth";

const BUILD_FLAG = ["__SO", "DEV__"].join("_");
const SPLIT = [BUILD_FLAG, "dist-dev", "build:dev", "serve:dev", "serveFlavour", "--flavor"];
const SELF = join(SRC, "runtime", "oneBuild.guard.test.ts");
const CONFIG = ["webpack.config.js", ".storybook/main.ts", "jest.config.cjs", "global.d.ts", "scripts/debug/global.d.ts", "package.json", "scripts/release/manifest.mjs", "scripts/release/stage.mjs", "scripts/release/gates.mjs"];

const walk = (dir: string): string[] => {
  const fs = require("fs") as typeof import("fs");
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
};

const splitHits = (files: Array<{ path: string; text: string }>): string[] =>
  files.flatMap(({ path, text }) => SPLIT.filter((token) => text.includes(token)).map((token) => `${path}: ${token}`));

describe("one build (owner decision 2026-10-07): the prod/dev split never comes back", () => {
  it("no source file, test or story reads a build flag", () => {
    const files = walk(SRC).filter((path) => path !== SELF).map((path) => ({ path: rel(path), text: readFileSync(path, "utf8") }));
    expect(files.length).toBeGreaterThan(500);
    expect(splitHits(files)).toEqual([]);
  });

  it("no build config defines the flag or a second output", () => {
    const files = CONFIG.map((name) => join(ROOT, name)).filter((path) => existsSync(path)).map((path) => ({ path: rel(path), text: readFileSync(path, "utf8") }));
    expect(files).toHaveLength(CONFIG.length);
    expect(splitHits(files)).toEqual([]);
  });

  it("control: a planted flag, a second output dir and a dev build script are each caught", () => {
    expect(splitHits([
      { path: "src/x.ts", text: `if (${BUILD_FLAG}) globalThis.x = 1;` },
      { path: "webpack.config.js", text: 'const OUTPUT_DIRS = { prod: "dist", dev: "dist-dev" };' },
      { path: "package.json", text: '"build:dev": "webpack --env flavor=dev"' },
    ])).toEqual([`src/x.ts: ${BUILD_FLAG}`, "webpack.config.js: dist-dev", "package.json: build:dev"]);
  });
});
