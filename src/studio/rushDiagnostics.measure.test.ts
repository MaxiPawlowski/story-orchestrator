import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Story } from "@engine/index";
import { runDiagnostics } from "./diagnostics";

const dir = join(__dirname, "../../test/fixtures");
const drafts: Story[] = readdirSync(dir).filter((name) => name.endsWith(".story.json")).sort()
  .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8").replace(/^﻿/, "")) as Story)
  .filter((draft) => Array.isArray(draft.checkpoints) && Array.isArray(draft.transitions));

describe("v3.0 42a F6: exit-on-entry baseline", () => {
  it("F6 baseline (informational, no target): exit-on-entry findings over the fixture stories", () => {
    const findings = drafts.map((draft) => runDiagnostics(draft).filter((entry) => entry.code === "exit-on-entry").length);
    const tenseExits = drafts.reduce((sum, draft) => {
      const hot = new Set(draft.checkpoints.filter((checkpoint) => checkpoint.type === "anchor" && ["tense", "critical", "peak"].includes(checkpoint.tension_target ?? "")).map((checkpoint) => checkpoint.id));
      return sum + draft.transitions.filter((transition) => hot.has(transition.from)).length;
    }, 0);
    const result = { stories: drafts.length, storiesFlagged: findings.filter(Boolean).length, findings: findings.reduce((a, b) => a + b, 0), tenseAnchorExits: tenseExits };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    expect(result.findings).toBeLessThanOrEqual(result.tenseAnchorExits);
  });
});
