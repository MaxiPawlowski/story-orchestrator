import * as coreMutations from "../../studio/mutations";
import * as innerVoiceMutations from "../../studio/innerVoiceMutations";
import { AGENT_TOOLS, EDIT_TOOLS, MUTATIONS_WITHOUT_A_TOOL, PROVISION_TOOLS, checkToolCall, renderToolSchema, toolJsonSchema } from "./tools";

describe("agent tool set (v2.6 plan 11 A1)", () => {
  it("backs every edit tool by a mutations.ts export, and names a reason for every export without a tool", () => {
    const exported = Object.keys({ ...coreMutations, ...innerVoiceMutations }).sort();
    const backing = Object.values(EDIT_TOOLS).map((spec) => spec.backedBy);
    const excluded = Object.keys(MUTATIONS_WITHOUT_A_TOOL);
    expect(exported.filter((name) => !backing.includes(name as never) && !excluded.includes(name))).toEqual([]);
    expect([...backing, ...excluded].filter((name) => !exported.includes(name))).toEqual([]);
  });

  it("never offers the author-only permission grant or any persona tool", () => {
    expect(Object.keys(PROVISION_TOOLS)).not.toContain("grantLorebook");
    expect(Object.keys(AGENT_TOOLS).filter((name) => /persona/i.test(name))).toEqual([]);
  });

  it("renders a closed JSON schema for every tool, for the harness route", () => {
    Object.values(AGENT_TOOLS).forEach((spec) => {
      const schema = toolJsonSchema(spec) as { inputSchema: { additionalProperties: boolean; required: string[] } };
      expect(schema.inputSchema.additionalProperties).toBe(false);
      expect(schema.inputSchema.required).toEqual(Object.entries(spec.args).filter(([, arg]) => arg.required).map(([name]) => name));
    });
    expect(renderToolSchema()).toContain("- addQuality(quality: object");
  });

  it("refuses an unknown tool with a did-you-mean hint", () => {
    expect(checkToolCall({ tool: "addQualty", args: {} })).toEqual({ ok: false, message: expect.stringContaining('did you mean "addQuality"') });
  });

  it("refuses an unknown argument with a did-you-mean hint, before any parse", () => {
    const check = checkToolCall({ tool: "updateCheckpoint", args: { id: "start", pach: { objective: "x" } } });
    expect(check).toEqual({ ok: false, message: expect.stringContaining('unknown argument "pach" (did you mean "patch"?)') });
  });

  it("refuses a missing or mistyped argument", () => {
    expect(checkToolCall({ tool: "removeQuality", args: {} })).toEqual({ ok: false, message: 'removeQuality: missing argument "key"' });
    expect(checkToolCall({ tool: "setHouseRules", args: { rules: "one rule" } })).toEqual({ ok: false, message: "setHouseRules.rules: expected array" });
  });

  it("turns a valid edit call into the typed op the Studio applies", () => {
    const check = checkToolCall({ tool: "setHouseRules", args: { rules: ["No magic in the city."] } });
    expect(check).toEqual({ ok: true, spec: AGENT_TOOLS.setHouseRules, op: { kind: "setHouseRules", rules: ["No magic in the city."] } });
  });

  it("refuses an edit whose arguments the op grammar rejects", () => {
    const check = checkToolCall({ tool: "setStoryField", args: { field: "id", value: "other" } });
    expect(check).toEqual({ ok: false, message: "setStoryField.field: must be title, description or objective_block" });
  });
});
