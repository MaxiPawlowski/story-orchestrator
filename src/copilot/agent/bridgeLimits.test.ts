import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENT_TOOLS, toolJsonSchema } from "./tools";

const bridge = readFileSync(join(__dirname, "../../../server-plugin/story-orchestrator-harness/agentBridge.mjs"), "utf8");
const limit = (key: string): number => Number((bridge.match(new RegExp(key + ": ([0-9_]+)"))?.[1] ?? "0").split("_").join(""));

test("every agent tool description fits the harness bridge's description limit (count and bytes: bridge.test.ts)", () => {
  expect(limit("maxDescriptionChars")).toBeGreaterThan(0);
  for (const tool of Object.values(AGENT_TOOLS).map(toolJsonSchema)) expect(String(tool.description).length).toBeLessThanOrEqual(limit("maxDescriptionChars"));
});
