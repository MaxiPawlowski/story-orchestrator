import { join } from "path";
import { readFileSync } from "fs";
import { SRC, buildGraph, prodFiles, reachableFrom, rel } from "../../../test/support/codeHealth";

const LIPSYNC = ["src/sprites/lipsync/lipsyncEn.ts", "src/sprites/lipsync/textMouth.ts"];
const ROOTS = [join(SRC, "index.tsx"), join(SRC, "sprites", "start.tsx"), join(SRC, "sprites", "VnStage.tsx")];

const staticReach = (root: string, read?: (path: string) => string) =>
  [...reachableFrom(buildGraph(prodFiles(), { includeDynamic: false }, read), root, read)].map(rel);

describe("v2.8: the English lip-sync rules ride their own lazy chunk", () => {
  it("both files ship and no stage or entry module imports them statically", () => {
    const present = new Set(prodFiles().map(rel));
    expect(LIPSYNC.filter((path) => !present.has(path))).toEqual([]);
    for (const root of ROOTS) expect(staticReach(root).filter((path) => LIPSYNC.includes(path))).toEqual([]);
  });

  it("control: a planted static import from the animator is reached", () => {
    const animation = join(SRC, "sprites", "animation.ts");
    const read = (path: string) => (path === animation ? `${readFileSync(path, "utf8")}\nexport { TextMouth } from "./lipsync/textMouth";\n` : readFileSync(path, "utf8"));
    expect(staticReach(join(SRC, "sprites", "start.tsx"), read)).toEqual(expect.arrayContaining(LIPSYNC));
  });
});
