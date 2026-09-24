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

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => fakeContext, sendSystemChatMessage: (text: string) => sendSystemChatMessage(text) }));

import { registerSlashCommands } from "./slashCommands";
import type { RuntimeManager } from "./runtimeManager";

const makeManager = () => {
  const manager = {
    setMemoryPinned: jest.fn(async () => undefined),
    excludeMemoryEntry: jest.fn(async () => undefined),
    runMemorizeBacklog: jest.fn(async () => true),
    memorizeChat: jest.fn(async () => true),
    runExpansionNow: jest.fn(async () => true),
    flagMoment: jest.fn(async () => undefined),
    getOpenArcs: jest.fn(() => ["The missing sun-heart"]),
    getNarrativeStatus: jest.fn(() => ({
      title: "Quest for the Sun Ruins",
      sections: [{ id: "now", label: "Where you are", lines: ["The Ruined Gate"] }],
      text: "Where you are\n  The Ruined Gate",
    })),
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
  it("registers /cp, /so-mem and the player-safe /story", () => {
    expect(registerSlashCommands(makeManager())).toBe(true);
    expect(Object.keys(commands).sort()).toEqual(["cp", "so-mem", "story"]);
  });

  it("/story recap prints the narrative composition, /story threads the open ones", async () => {
    const manager = makeManager();
    registerSlashCommands(manager);
    sendSystemChatMessage.mockClear();
    const recap = await commands.story.callback({}, "recap");
    expect(recap).toContain("Quest for the Sun Ruins");
    expect(recap).toContain("Where you are");
    expect(await commands.story.callback({}, "threads")).toContain("• The missing sun-heart");
    await commands.story.callback({}, "flag it dragged here");
    expect(manager.flagMoment).toHaveBeenCalledWith("it dragged here");
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

  it("/cp expand asks before a real generation, never before a debug response (v2.4 plan 03 D5 preflight)", async () => {
    const manager = makeManager();
    registerSlashCommands(manager);
    await commands.cp.callback({}, "expand");
    expect(manager.runExpansionNow).toHaveBeenLastCalledWith(undefined, true);
    await commands.cp.callback({}, "expand BEAT canned");
    expect(manager.runExpansionNow).toHaveBeenLastCalledWith("BEAT canned", false);
    await commands.cp.callback({}, "memorize");
    expect(manager.memorizeChat).toHaveBeenCalledTimes(1);
  });

  it("/so-mem backlog starts the memorize backlog; bad subcommands return usage", async () => {
    const manager = makeManager();
    registerSlashCommands(manager);
    await commands["so-mem"].callback({}, "backlog");
    expect(manager.memorizeChat).toHaveBeenCalledTimes(1);
    expect(manager.runMemorizeBacklog).not.toHaveBeenCalled();
    const usage = await commands["so-mem"].callback({}, "bogus");
    expect(usage).toContain("/so-mem list");
    const pinUsage = await commands["so-mem"].callback({}, "pin");
    expect(pinUsage).toContain("Usage:");
  });
});
