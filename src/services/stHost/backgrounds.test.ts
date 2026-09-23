const mockHost = { settings: { name: "old.jpg" } as { name: string }, switchTo: null as string | null, commands: [] as string[] };

jest.mock("./context", () => ({ getContext: () => ({ chatMetadata: {} }) }));
jest.mock("./modules", () => ({ get backgroundsModule() { return { background_settings: mockHost.settings }; } }));
jest.mock("./slashCommands", () => ({
  executeSlashCommands: async (command: string) => {
    mockHost.commands.push(command);
    if (mockHost.switchTo) mockHost.settings = { name: mockHost.switchTo };
    return true;
  },
}));

import { applyBackground } from "./backgrounds";

// V15b: `applyBackground` answered `{changed, from, to}` and its restore caller read that object as a
// boolean, which is always true. It now answers a WriteResult, and ST not switching is a refusal.
describe("V15b: the background seam answers what the host did", () => {
  beforeEach(() => {
    mockHost.settings = { name: "old.jpg" };
    mockHost.switchTo = null;
    mockHost.commands = [];
  });

  it("a switch the host made is ok and says what it replaced", async () => {
    mockHost.switchTo = "tavern.jpg";
    await expect(applyBackground("tavern.jpg")).resolves.toEqual({ ok: true, changed: true, from: "old.jpg", to: "tavern.jpg" });
  });

  it("a /bg that left the background where it was is refused, not called applied", async () => {
    await expect(applyBackground("tavern.jpg")).resolves.toMatchObject({ ok: false, reason: expect.stringContaining("tavern.jpg") });
    expect(mockHost.commands).toHaveLength(1);
  });

  it("the background already in place is ok with nothing to do, and no command is sent", async () => {
    await expect(applyBackground("OLD.jpg")).resolves.toEqual({ ok: true, changed: false, from: "old.jpg", to: "old.jpg" });
    expect(mockHost.commands).toEqual([]);
  });

  it("no name is a refusal", async () => {
    await expect(applyBackground("  ")).resolves.toMatchObject({ ok: false });
  });
});
