import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FEATURES } from "./registry";
import { SETTING_COPY } from "./settingsCopy";
import {
  FEATURE_TABLE_END, FEATURE_TABLE_START, formatDefault, ownerOf, readmeFeatures, renderFeatureTable, renderSettingsReference, settingRows, spliceFeatureTable,
} from "./settingsReference";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf-8").replace(/\r\n/g, "\n");
const STALE = "stale: run `npm run docs:settings` after editing the registry or the settings copy";

describe("v2.7 plan 29 (finding 20): generated settings reference and README feature table", () => {
  it("the settings reference page is current", () => {
    expect([STALE, read("docs/guide/setup/settings-reference.md")]).toEqual([STALE, renderSettingsReference()]);
  });

  it("the README feature table is current", () => {
    const readme = read("README.md");
    expect([STALE, readme]).toEqual([STALE, spliceFeatureTable(readme)]);
  });

  it("a hand edit to either file is caught (control)", () => {
    const edited = renderSettingsReference().replace("| On |", "| Off |");
    expect(edited).not.toBe(renderSettingsReference());
    const readme = read("README.md").replace(/\| Playing \| Stories \|[^\n]*/, "| Playing | Stories | Hand-written. |  |");
    expect(spliceFeatureTable(readme)).not.toBe(readme);
    expect(() => spliceFeatureTable("# README\n\nno table")).toThrow(/features:start/);
  });

  it("documents every setting that has copy, once, with an owner and a default", () => {
    const rows = settingRows();
    expect(rows.map((row) => row.key)).toEqual(Object.keys(SETTING_COPY));
    expect(rows.filter((row) => !ownerOf(row.key)).map((row) => row.key)).toEqual([]);
    expect(rows.filter((row) => !row.defaultText).map((row) => row.key)).toEqual([]);
    const page = renderSettingsReference();
    for (const row of rows) expect([row.key, page.includes(`\`${row.key}\``)]).toEqual([row.key, true]);
  });

  it("lists every feature but the judge's individual uses in the README table", () => {
    const table = renderFeatureTable();
    expect(readmeFeatures().length).toBe(FEATURES.filter((feature) => !feature.id.startsWith("judge-use-")).length);
    for (const feature of readmeFeatures()) expect([feature.id, table.includes(`| ${feature.name} |`)]).toEqual([feature.id, true]);
    expect(read("README.md")).toContain(FEATURE_TABLE_START);
    expect(read("README.md")).toContain(FEATURE_TABLE_END);
  });

  it("formats defaults in plain words", () => {
    expect(formatDefault("display.hudEnabled", true)).toBe("On");
    expect(formatDefault("extraction.profileId", null)).toBe("Not set");
    expect(formatDefault("extraction.replyEffort", undefined)).toBe("Medium");
    expect(formatDefault("image.purposes.*.family", undefined)).toBe("Per entry");
    expect(formatDefault("talk.chain.max", 3)).toBe("3");
    expect(ownerOf("judge.uses")?.id).toBe("judge");
  });
});
