import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENT_TOOLS, toolJsonSchema } from "./tools";

const bridge = readFileSync(join(__dirname, "../../../server-plugin/story-orchestrator-harness/agentBridge.mjs"), "utf8");
const limit = (key: string): number => Number((bridge.match(new RegExp(key + ": ([0-9_]+)"))?.[1] ?? "0").split("_").join(""));

describe("the agent's tool set fits the harness tool bridge", () => {
  const tools = Object.values(AGENT_TOOLS).map(toolJsonSchema);

  test("no more tools than the bridge accepts (66 tools met a 64 limit after plans 52 and 53)", () => {
    expect(limit("maxTools")).toBeGreaterThan(0);
    expect(tools.length).toBeLessThanOrEqual(limit("maxTools"));
  });

  test("the serialized tool list stays under the bridge byte limit", () => {
    expect(Buffer.byteLength(JSON.stringify(tools))).toBeLessThanOrEqual(limit("maxToolBytes"));
  });

  test("every description fits", () => {
    for (const tool of tools) expect(String(tool.description).length).toBeLessThanOrEqual(limit("maxDescriptionChars"));
  });
});
