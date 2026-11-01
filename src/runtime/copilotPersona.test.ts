import type { ProvisioningOp, WizardSessionState } from "@wizard/types";
import { emptyEnvironment } from "@wizard/provisioning";
import { applyProvisioning, type ProvisioningScope } from "./copilotProvisioning";
import { mintToken, tokenMatches, type RunContext, type RunToken } from "./runToken";

const persona: ProvisioningOp = { kind: "createPersona", name: "The Courier", description: "You carry letters across the pass." };

function scope(options: { personas?: string[]; create?: jest.Mock | null } = {}) {
  let current: RunContext = { chatId: "chat-a", storyId: "s", storyHash: "h", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const saved: WizardSessionState[] = [];
  const create = options.create === undefined ? jest.fn(async () => ({ ok: true as const, avatarId: "courier.png" })) : options.create;
  const value: ProvisioningScope = {
    ownership: { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) },
    host: { ...(create ? { createPersona: create } : {}) } as never,
    session: () => saved.at(-1) ?? null,
    sessionKey: () => "s",
    storyScopeId: () => "s",
    environment: () => ({ ...emptyEnvironment(), personaNames: options.personas ?? [] }),
    save: (session) => { saved.push(session); },
  };
  return { value, create, saved, switchChat: () => { current = { ...current, chatId: "chat-b", sessionEpoch: 2 }; } };
}

describe("owner 2026-11-01: the wizard may create a persona the author confirms", () => {
  it("creates a new persona unselected, passing the run's ownership check, and records it in the session ledger", async () => {
    const h = scope();
    const result = await applyProvisioning(h.value, persona);
    expect(result).toMatchObject({ ok: true, created: "The Courier" });
    expect(h.create).toHaveBeenCalledWith({ name: "The Courier", description: "You carry letters across the pass.", title: "" }, expect.any(Function));
    const owns = (h.create as jest.Mock).mock.calls[0][1] as () => boolean;
    expect(owns()).toBe(true);
    h.switchChat();
    expect(owns()).toBe(false);
    expect(h.saved.at(-1)?.applied).toEqual(["The Courier"]);
  });

  it("never touches an existing persona", async () => {
    const h = scope({ personas: ["the courier"] });
    const result = await applyProvisioning(h.value, persona);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("never edits yours");
    expect(h.create).not.toHaveBeenCalled();
  });

  it("says so when the host cannot create personas", async () => {
    const h = scope({ create: null });
    expect(await applyProvisioning(h.value, persona)).toMatchObject({ ok: false, message: expect.stringContaining("cannot create personas") });
  });

  it("passes the host's refusal on", async () => {
    const h = scope({ create: jest.fn(async () => ({ ok: false as const, reason: "no persona-create command" })) });
    expect(await applyProvisioning(h.value, persona)).toMatchObject({ ok: false, message: expect.stringContaining("no persona-create command") });
  });
});
