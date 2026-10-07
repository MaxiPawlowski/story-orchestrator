import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { isInCharacterPlayerLine, isOocLine, isOocText, isPlayerLine, latestPlayerLineIsOoc } from "./ooc";

const SRC = join(__dirname, "..");

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
});

describe("v2.7 finding 19: the one out-of-character predicate", () => {
  it.each([
    ["((brb))", true], ["  ((long\naside))  ", true], ["OOC: one sec", true], ["ooc:lower", true], ["(OOC) quick question", true], ["( OOC: spaced", true],
    ["I say (quietly) hi", false], ["Look ((there))", false], ["((half", false], ["The OOC: sign", false], ["", false], ["   ", false],
  ])("%j -> %s", (text, expected) => expect(isOocText(text)).toBe(expected));

  it("applies to the player's own visible lines only", () => {
    expect(isOocLine({ is_user: true, mes: "((brb))" })).toBe(true);
    expect(isOocLine({ is_user: false, mes: "((brb))" })).toBe(false);
    expect(isOocLine({ is_user: true, is_system: true, mes: "((brb))" })).toBe(false);
    expect(isOocLine({ is_user: true })).toBe(false);
    expect(isOocLine(null)).toBe(false);
    expect(isPlayerLine({ is_user: true, mes: "((brb))" })).toBe(true);
    expect(isInCharacterPlayerLine({ is_user: true, mes: "((brb))" })).toBe(false);
    expect(isInCharacterPlayerLine({ is_user: true, mes: "I nod (slowly)." })).toBe(true);
  });

  it("reads the newest player line at or before the boundary", () => {
    const chat = [{ is_user: true, mes: "I go." }, { is_user: false, mes: "((ok))" }, { is_user: true, mes: "OOC: wait" }, { is_user: false, mes: "Fine." }];
    expect(latestPlayerLineIsOoc(chat, 3)).toBe(true);
    expect(latestPlayerLineIsOoc(chat, 1)).toBe(false);
    expect(latestPlayerLineIsOoc([], 0)).toBe(false);
  });

  it("is defined once: no other source file carries its own OOC pattern", () => {
    const owners = walk(SRC).filter((path) => /OOC\\s\*\[:\)\]|\\\(\\\(\[/.test(readFileSync(path, "utf8")));
    expect(owners.map((path) => relative(SRC, path).replace(/\\/g, "/"))).toEqual(["engine/ooc.ts"]);
  });
});
