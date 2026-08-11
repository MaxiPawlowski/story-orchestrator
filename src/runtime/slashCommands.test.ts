interface FakeCommand {
  name: string;
  callback: (args: Record<string, unknown>, value: string | string[]) => Promise<string>;
}

const commands: Record<string, FakeCommand> = {};
const fakeContext = {
  SlashCommandParser: { addCommandObject: (command: FakeCommand) => { commands[command.name] = command; }, commands },
  SlashCommand: { fromProps: (props: FakeCommand) => props },
  SlashCommandArgument: { fromProps: (props: unknown) => props },
  ARGUMENT_TYPE: { STRING: "string" },
};

const sendSystemChatMessage = jest.fn(() => true);

jest.mock("@services/STAPI", () => ({ getContext: () => fakeContext, sendSystemChatMessage: (text: string) => sendSystemChatMessage(text) }));

import { registerSlashCommands } from "./slashCommands";
import type { RuntimeManager } from "./runtimeManager";

const makeManager = () => {
  const manager = {
    setMemoryPinned: jest.fn(async () => undefined),
    excludeMemoryEntry: jest.fn(async () => undefined),
    runMemorizeBacklog: jest.fn(async () => true),
    getSnapshot: jest.fn(() => ({
      status: "ok",
      checkpoints: [],
      convergence: [],
      memory: {
        backfill: null,
        entries: [
          { id: "m1", tier: "facts", text: "The key opens the vault.", pinned: false },
          { id: "m2", tier: "facts", text: "Old rumor.", supersededBy: "m1" },
        ],
      },
    })),
  };
  return manager as unknown as RuntimeManager & typeof manager;
};

beforeAll(() => {
  (globalThis as Record<string, unknown>).window = { toastr: undefined, setTimeout };
});

beforeEach(() => {
  Object.keys(commands).forEach((key) => delete commands[key]);
});

describe("registerSlashCommands", () => {
  it("registers /cp and /so-mem", () => {
    expect(registerSlashCommands(makeManager())).toBe(true);
    expect(Object.keys(commands).sort()).toEqual(["cp", "so-mem"]);
  });

  it("/so-mem list numbers active entries, hides superseded ones, and posts a chat message", async () => {
    registerSlashCommands(makeManager());
    sendSystemChatMessage.mockClear();
    const output = await commands["so-mem"].callback({}, "list");
    expect(output).toContain("1. [facts] The key opens the vault.");
    expect(output).not.toContain("Old rumor.");
    expect(output).not.toContain("m1");
    expect(sendSystemChatMessage).toHaveBeenCalledWith(output);
  });

  it("/so-mem pin and exclude accept ids and list numbers", async () => {
    const manager = makeManager();
    registerSlashCommands(manager);
    await commands["so-mem"].callback({}, "pin m1 off");
    expect(manager.setMemoryPinned).toHaveBeenCalledWith("m1", false);
    await commands["so-mem"].callback({}, "pin m1");
    expect(manager.setMemoryPinned).toHaveBeenCalledWith("m1", true);
    await commands["so-mem"].callback({}, "exclude m2");
    expect(manager.excludeMemoryEntry).toHaveBeenCalledWith("m2");
    await commands["so-mem"].callback({}, "list");
    await commands["so-mem"].callback({}, "pin 1");
    expect(manager.setMemoryPinned).toHaveBeenLastCalledWith("m1", true);
    await commands["so-mem"].callback({}, "exclude 1");
    expect(manager.excludeMemoryEntry).toHaveBeenLastCalledWith("m1");
  });

  it("/so-mem backlog starts the memorize backlog; bad subcommands return usage", async () => {
    const manager = makeManager();
    registerSlashCommands(manager);
    await commands["so-mem"].callback({}, "backlog");
    expect(manager.runMemorizeBacklog).toHaveBeenCalledTimes(1);
    const usage = await commands["so-mem"].callback({}, "bogus");
    expect(usage).toContain("/so-mem list");
    const pinUsage = await commands["so-mem"].callback({}, "pin");
    expect(pinUsage).toContain("Usage:");
  });
});
