import { toolTurnVerdict } from "./toolTurnFold";
import { defaultGlobalSettings, sanitizeGlobalSettings } from "../settingsModel";

describe("SP10 flag", () => {
  it("is install-wide, off by default, and only a literal true turns it on", () => {
    expect(defaultGlobalSettings().spikes).toEqual({ toolTurnFold: false });
    expect(sanitizeGlobalSettings({ spikes: { toolTurnFold: "yes" } }).spikes.toolTurnFold).toBe(false);
    expect(sanitizeGlobalSettings({ spikes: { toolTurnFold: true } }).spikes.toolTurnFold).toBe(true);
    expect(sanitizeGlobalSettings({}).spikes.toolTurnFold).toBe(false);
  });
});

const reply = { is_system: false, is_user: false, mes: "reply", extra: {} };
const user = { is_system: false, is_user: true, mes: "hello", extra: {} };
const tool = { is_system: true, is_user: false, mes: "Tool calls", extra: { tool_invocations: [{ name: "roll" }] } };
const hidden = { is_system: true, is_user: false, mes: "hidden", extra: {} };

describe("SP10 tool-turn verdict", () => {
  it("folds an intermediary into the continuation when only tool invocations sit between them", () => {
    expect(toolTurnVerdict(1, 3, [user, reply, tool, reply])).toBe("fold");
    expect(toolTurnVerdict(1, 4, [user, reply, tool, tool, reply])).toBe("fold");
  });

  it("holds an intermediary while the chat ends on its tool invocation (the continuation is still coming)", () => {
    expect(toolTurnVerdict(1, null, [user, reply, tool])).toBe("hold");
  });

  it("commits when anything but a tool invocation sits between the two replies", () => {
    expect(toolTurnVerdict(1, 3, [user, reply, user, reply])).toBe("commit");
    expect(toolTurnVerdict(1, 3, [user, reply, hidden, reply])).toBe("commit");
    expect(toolTurnVerdict(1, 4, [user, reply, tool, user, reply])).toBe("commit");
  });

  it("commits the newest reply, a re-render at the same id and an unnamed render", () => {
    expect(toolTurnVerdict(3, null, [user, reply, tool, reply])).toBe("commit");
    expect(toolTurnVerdict(3, 3, [user, reply, tool, reply])).toBe("commit");
    expect(toolTurnVerdict(null, 3, [user, reply, tool, reply])).toBe("commit");
  });
});
