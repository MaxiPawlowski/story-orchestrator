import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOREBOOK_WRITERS, lorebookWriterSites, writerSitesIn } from "../../test/findings/lorebookWriters";

interface Evidence {
  file?: string;
  text: string;
}

interface Row {
  guard: string;
  evidence: Evidence[];
  note?: string;
}

const ROOT = join(__dirname, "../..");
const ledger = JSON.parse(readFileSync(join(ROOT, "test/findings/lorebook-writers.json"), "utf-8")) as { guards: Record<string, string>; rows: Record<string, Row> };
const sites = lorebookWriterSites("src");

const code = (file: string) => readFileSync(join(ROOT, file), "utf-8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const HOST_WI_FILES = ["worldInfo.ts", "worldInfoFiles.ts", "worldInfoActivate.ts", "worldInfoScan.ts"];
const WRITE_VERB = /^(set|create|delete|upsert|update|restore|enable|disable|bind|unbind|deactivate|activate|force|ensure|save|write|remove)/;

const hostExports = (): string[] => HOST_WI_FILES.flatMap((file) =>
  [...code(`src/services/stHost/${file}`).matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((match) => match[1]));

const unlisted = (found: Array<{ key: string }>, rows: Record<string, Row>) => found.map((site) => site.key).filter((key) => !rows[key]);

describe("v2.8 A17: every World Info writer under src/ is censused with its guard", () => {
  it("lists every writer site, and no row outlives its site", () => {
    expect(unlisted(sites, ledger.rows)).toEqual([]);
    const live = new Set(sites.map((site) => site.key));
    expect(Object.keys(ledger.rows).filter((key) => !live.has(key))).toEqual([]);
  });

  it("names a declared guard on every row, with evidence that is in the code", () => {
    const missing = Object.entries(ledger.rows).flatMap(([key, row]) => {
      if (!ledger.guards[row.guard]) return [`${key}: unknown guard "${row.guard}"`];
      if (!row.evidence.length) return [`${key}: no evidence`];
      const file = key.split("#")[0];
      return row.evidence.filter((item) => !code(item.file ?? file).includes(item.text)).map((item) => `${key}: "${item.text}" not in ${item.file ?? file}`);
    });
    expect(missing).toEqual([]);
  });

  it("a host-port row names its consumer, and the consumer is a censused writer", () => {
    const files = new Set(sites.map((site) => site.file.split("/").pop()));
    const ports = Object.entries(ledger.rows).filter(([, row]) => row.guard === "host-port");
    expect(ports.length).toBeGreaterThan(0);
    for (const [key, row] of ports) {
      const consumers = (row.note ?? "").replace(/^consumers?: /, "").split(",").map((name) => name.trim()).filter(Boolean);
      expect({ key, consumers: consumers.length > 0 }).toEqual({ key, consumers: true });
      for (const consumer of consumers) expect({ key, consumer, censused: files.has(consumer) }).toEqual({ key, consumer, censused: true });
    }
  });

  it("covers every host writer STAPI exports, so a new writer cannot be left out of the list", () => {
    const exported = hostExports();
    expect(LOREBOOK_WRITERS.filter((name) => !exported.includes(name))).toEqual([]);
    expect(exported.filter((name) => WRITE_VERB.test(name) && !(LOREBOOK_WRITERS as readonly string[]).includes(name))).toEqual([]);
  });

  it("planted control: an unlisted writer call, a passed reference and a port binding are each caught; imports, types and strings are not", () => {
    const planted = writerSitesIn("src/runtime/planted.ts", [
      'import { upsertWIEntry, deleteWIEntryAt } from "@services/STAPI";',
      'type Port = Pick<typeof Stapi, "createWIEntry">;',
      "interface Deps { setWIEntriesState: (book: string) => Promise<void>; }",
      'export const write = () => upsertWIEntry("Book", "title", "text");',
      "export const port = { deleteWIEntryAt };",
      "export const handed = run(disableWIEntry);",
    ].join("\n"));
    expect(planted.map((site) => site.writer).sort()).toEqual(["deleteWIEntryAt", "disableWIEntry", "upsertWIEntry"]);
    expect(unlisted(planted, ledger.rows)).toEqual(["src/runtime/planted.ts#upsertWIEntry", "src/runtime/planted.ts#deleteWIEntryAt", "src/runtime/planted.ts#disableWIEntry"]);
    const withoutCurator = Object.fromEntries(Object.entries(ledger.rows).filter(([key]) => key !== "src/runtime/curatorWriter.ts#createWIEntry"));
    expect(unlisted(sites, withoutCurator)).toEqual(["src/runtime/curatorWriter.ts#createWIEntry"]);
  });
});
