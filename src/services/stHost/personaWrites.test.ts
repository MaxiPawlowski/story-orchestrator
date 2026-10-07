const mockHost = {
  open: "chat-a",
  metadata: { "chat-a": {}, "chat-b": {} } as Record<string, Record<string, unknown>>,
  userAvatar: "max.png",
  onLoad: () => undefined as void,
  commands: [] as string[],
};

const mockModule = {
  get user_avatar() { return mockHost.userAvatar; },
  setUserAvatar: jest.fn(async (avatarId: string) => { mockHost.userAvatar = avatarId; }),
  setPersonaLockState: jest.fn(async () => { mockHost.metadata[mockHost.open].persona = mockHost.userAvatar; }),
};

jest.mock("./personas", () => ({
  loadPersonasModule: async () => { mockHost.onLoad(); return mockModule; },
  personaCrudAvailable: () => true,
}));
jest.mock("./context", () => ({
  getContext: () => ({
    chatMetadata: mockHost.metadata[mockHost.open],
    powerUserSettings: { personas: { "max.png": "Max", "mara.png": "Mara" } },
    executeSlashCommandsWithOptions: async (command: string) => { mockHost.commands.push(command); return { pipe: "rook.png", isError: false }; },
  }),
}));

import { createPersona, lockPersonaToChat, PERSONA_WRITE_LAPSED, selectPersona } from "./personaWrites";

const owner = "chat-a";
const owns = () => mockHost.open === owner;

beforeEach(() => {
  mockHost.open = "chat-a";
  mockHost.metadata = { "chat-a": {}, "chat-b": {} };
  mockHost.userAvatar = "max.png";
  mockHost.onLoad = () => undefined;
  mockHost.commands = [];
  jest.clearAllMocks();
});

describe("Sol finding 5: every persona write re-checks the chat right before it touches ST", () => {
  it("a chat switch while personas.js loads: no lock, no switch, and the chat that is now open holds no persona", async () => {
    mockHost.onLoad = () => { mockHost.open = "chat-b"; };
    expect(await lockPersonaToChat(owns)).toEqual({ ok: false, reason: PERSONA_WRITE_LAPSED });
    expect(await selectPersona("mara.png", owns)).toEqual({ ok: false, reason: PERSONA_WRITE_LAPSED });
    expect(mockModule.setPersonaLockState).not.toHaveBeenCalled();
    expect(mockModule.setUserAvatar).not.toHaveBeenCalled();
    expect(mockHost.metadata["chat-b"]).toEqual({});
    expect(mockHost.userAvatar).toBe("max.png");
  });

  it("create refuses before the slash command once the chat has changed", async () => {
    mockHost.open = "chat-b";
    expect(await createPersona({ name: "Rook", description: "", title: "Story: X" }, owns)).toEqual({ ok: false, reason: PERSONA_WRITE_LAPSED });
    expect(mockHost.commands).toEqual([]);
  });

  it("control: in the owning chat the lock lands in that chat's metadata only", async () => {
    expect(await lockPersonaToChat(owns)).toEqual({ ok: true, avatarId: "max.png" });
    expect(mockHost.metadata).toEqual({ "chat-a": { persona: "max.png" }, "chat-b": {} });
  });
});
