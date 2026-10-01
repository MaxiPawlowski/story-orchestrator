import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXPECTED_PLUGIN_VERSIONS, pluginVersionIssue, SERVER_PLUGIN_DIRS, type ServerPluginId } from "@utils/pluginVersions";
import { checkPluginVersions, PLUGIN_VERSION_SUMMARY, type PluginVersionDeps } from "./pluginVersionCheck";

const deps = (judge: string | null, harness: string | null) => {
  const warned: string[] = [];
  const journaled: Array<[string, string]> = [];
  const value: PluginVersionDeps = {
    judgeVersion: async () => judge,
    harnessVersion: async () => harness,
    warn: (text) => warned.push(text),
    journal: (summary, detail) => journaled.push([summary, detail]),
  };
  return { value, warned, journaled };
};

describe("CR-J5: the bundle checks the server plugins it was built against", () => {
  it("a plugin that answers with another version is warned about and journaled, naming the install command", async () => {
    const run = deps("1.2.0", EXPECTED_PLUGIN_VERSIONS.harness);
    const issues = await checkPluginVersions(run.value);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("story-orchestrator-judge plugin on the server is 1.2.0");
    expect(issues[0]).toContain("npm run plugins:install");
    expect(run.warned).toEqual(issues);
    expect(run.journaled).toEqual([[PLUGIN_VERSION_SUMMARY, issues[0]]]);
  });

  it("matching versions and absent plugins say nothing; a failed status read is not a mismatch", async () => {
    const matching = deps(EXPECTED_PLUGIN_VERSIONS.judge, EXPECTED_PLUGIN_VERSIONS.harness);
    expect(await checkPluginVersions(matching.value)).toEqual([]);
    const absent = deps(null, null);
    expect(await checkPluginVersions(absent.value)).toEqual([]);
    const failing = { ...absent.value, judgeVersion: async () => { throw new Error("offline"); } };
    expect(await checkPluginVersions(failing)).toEqual([]);
    expect([...matching.warned, ...absent.warned]).toEqual([]);
  });

  it.each(Object.keys(EXPECTED_PLUGIN_VERSIONS) as ServerPluginId[])("the expected %s version is the one the repo's plugin ships", (id) => {
    const dir = join(__dirname, "..", "..", "server-plugin", SERVER_PLUGIN_DIRS[id]);
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string };
    const source = /export const PLUGIN_VERSION = '([^']+)'/.exec(readFileSync(join(dir, "index.mjs"), "utf8"))?.[1];
    expect(manifest.version).toBe(EXPECTED_PLUGIN_VERSIONS[id]);
    expect(source).toBe(EXPECTED_PLUGIN_VERSIONS[id]);
    expect(pluginVersionIssue(id, EXPECTED_PLUGIN_VERSIONS[id])).toBeNull();
  });
});
