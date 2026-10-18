import type { Story } from "@engine/index";
import {
  approvePlan, decideStep, executeReply, newAgentSession, pendingStep, recheckReadBack, renderStepPrompt, resolveProvisioning, reviewStep, stopAgent, unsettledReadBacks, type StepMeta,
} from "./index";
import { agentContext } from "./testing";
import type { AgentReply, AgentSession } from "./types";

const AT = "2026-10-16T00:00:00.000Z";
const META: StepMeta = { route: "local", firstTryValid: true, repaired: false, at: AT };

const story = (): Story => ({
  title: "Harbour", description: "A smuggler's port.", qualities: [], transitions: [], roster: [],
  checkpoints: [{ id: "start", name: "Start", objective: "Arrive.", type: "anchor", start: true }],
});

const running = (budget = 60): AgentSession =>
  approvePlan({ ...newAgentSession("cast", "review", { maxSteps: budget }, AT), plan: ["cards"], status: "awaiting-plan" }, ["cards"], AT);

const FULL = "Ilsa buys anything that fell off a ship. When a seller haggles, she lowers her offer by a coin each time. She keeps her shop dark so nobody sees her hands shake.";

const card = (name: string, description: string, extra: Record<string, unknown> = {}): AgentReply =>
  ({ kind: "call", call: { tool: "createCharacterCard", args: { name, description, ...extra } } });

const step = (session: AgentSession, reply: AgentReply) => executeReply(session, reply, agentContext(story()), META).session;

describe("v2.8 09 harvest: one bounded revision before the author sees a card", () => {
  it("a flagged card is held for review with its notes, and the session keeps running", () => {
    const held = step(running(), card("Ilsa Crane", "Buys stolen goods."));
    expect(held.status).toBe("running");
    expect(held.steps[0]).toMatchObject({ status: "review", notes: ["description-thin"] });
    expect(held.steps[0].observation).toContain("replaces: 1");
    expect(pendingStep(held)).toBeNull();
    expect(renderStepPrompt(held, story(), agentContext(story()).environment)).toContain("CARD WITH NOTES (step #1");
  });

  it("the one replacement waits for the author and marks the original replaced", () => {
    const held = step(running(), card("Ilsa Crane", "Buys stolen goods."));
    const revised = step(held, card("Ilsa Crane", FULL, { replaces: 1 }));
    expect(revised.status).toBe("awaiting-author");
    expect(revised.steps.map((entry) => entry.status)).toEqual(["replaced", "pending"]);
    expect(revised.steps[1]).toMatchObject({ replaces: 1, notes: [] });
    expect(revised.steps[1].op).toMatchObject({ description: FULL });
  });

  it("a replacement that still has notes goes to the author with them, never back for a second revision", () => {
    const held = step(running(), card("Ilsa Crane", "Buys stolen goods."));
    const revised = step(held, card("Ilsa Crane", "Buys stolen goods cheaply.", { replaces: 1 }));
    expect(revised.steps[1]).toMatchObject({ status: "pending", notes: ["description-thin"] });
    expect(revised.steps[1].observation).toContain("Notes left for the author");
  });

  it("the same card, or any other reply, keeps the original for the author", () => {
    const held = step(running(), card("Ilsa Crane", "Buys stolen goods."));
    const same = step(held, card("Ilsa Crane", "Buys stolen goods.", { replaces: 1 }));
    expect(same.steps).toHaveLength(1);
    expect(same.steps[0].status).toBe("pending");
    expect(same.status).toBe("awaiting-author");
    const other = step(held, { kind: "call", call: { tool: "readGraph", args: {} } });
    expect(other.steps).toHaveLength(1);
    expect(other.steps[0]).toMatchObject({ status: "pending", observation: expect.stringContaining("kept this card") });
    const done = step(held, { kind: "done", summary: "finished" });
    expect(done.status).toBe("awaiting-author");
  });

  it("a refused revision sends the original to the author; a wrong step id is refused", () => {
    const held = step(running(), card("Ilsa Crane", "Buys stolen goods."));
    const refused = step(held, card("", FULL, { replaces: 1 }));
    expect(refused.steps.map((entry) => entry.status)).toEqual(["pending", "refused"]);
    const wrong = step(running(), card("Ilsa Crane", FULL, { replaces: 4 }));
    expect(wrong.steps[0]).toMatchObject({ status: "refused", observation: expect.stringContaining("not a card waiting for revision") });
  });

  it("a stop or an empty budget hands a held card to the author", () => {
    const held = step(running(), card("Ilsa Crane", "Buys stolen goods."));
    expect(pendingStep(stopAgent(held))?.id).toBe(1);
    const capped = step(running(1), card("Ilsa Crane", "Buys stolen goods."));
    expect(capped.steps[0].status).toBe("pending");
    expect(capped.status).toBe("awaiting-author");
  });

  it("a revision naming the step as text, or the same card name without replaces, is the one revision", () => {
    const held = step(running(), card("Ilsa Crane", "Buys stolen goods."));
    const texted = step(held, card("Ilsa Crane", FULL, { replaces: "1" }));
    expect(texted.steps.map((entry) => entry.status)).toEqual(["replaced", "pending"]);
    expect(texted.steps[1].op).not.toHaveProperty("replaces");
    const named = step(held, card("ilsa crane", FULL));
    expect(named.steps.map((entry) => entry.status)).toEqual(["replaced", "pending"]);
    expect(named.steps[1].replaces).toBe(1);
  });

  it("a clean card goes straight to the author", () => {
    const clean = step(running(), card("Ilsa Crane", FULL));
    expect(clean.steps[0].status).toBe("pending");
    expect(clean.status).toBe("awaiting-author");
  });
});

const rng = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

describe("v2.8 09 harvest A8: the revision loop is bounded (property over scripted sessions)", () => {
  it("holds over 300 seeded sessions", () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 300; seed += 1) {
      const random = rng(seed);
      let session = running(20 + Math.floor(random() * 20));
      const resolved = new Set<number>();
      for (let turn = 0; turn < 40; turn += 1) {
        const pick = random();
        if (session.status === "awaiting-author") {
          const pending = pendingStep(session);
          if (!pending) { failures.push(`${seed}: awaiting-author without a pending step`); break; }
          if (pick < 0.6) {
            resolved.add(pending.id);
            session = resolveProvisioning(session, pending.id, { ok: true, message: "created" }, story());
          } else {
            session = decideStep(session, pending.id, { kind: "reject", reason: "no" }, story()).session;
          }
          continue;
        }
        if (session.status !== "running") break;
        const held = reviewStep(session);
        const name = `Harbour Hand ${turn}`;
        const reply: AgentReply = pick < 0.3 ? card(name, "Works the docks.")
          : pick < 0.45 ? card(name, FULL)
            : pick < 0.65 && held ? card(String((held.op as { name: string }).name), FULL, { replaces: held.id })
              : pick < 0.72 && held ? card(String((held.op as { name: string }).name), String((held.op as { description: string }).description), { replaces: held.id })
                : pick < 0.78 ? card(name, FULL, { replaces: 99 })
                  : pick < 0.9 ? { kind: "call", call: { tool: "readGraph", args: {} } }
                    : { kind: "done", summary: "done" };
        const before = session.steps.length;
        session = step(session, reply);
        const added = session.steps.slice(before);
        if (added.some((entry) => entry.status === "review") && session.status === "awaiting-author" && !pendingStep(session)) failures.push(`${seed}: review set awaiting-author`);
      }
      for (const entry of session.steps) {
        const replacements = session.steps.filter((other) => other.replaces === entry.id);
        if (replacements.length > 1) failures.push(`${seed}: step ${entry.id} replaced ${replacements.length} times`);
        if (entry.replaces !== undefined && entry.status === "replaced") failures.push(`${seed}: replacement ${entry.id} was itself replaced`);
        if (entry.family === "provision" && entry.status === "applied" && !resolved.has(entry.id)) failures.push(`${seed}: step ${entry.id} created without the author`);
      }
      if (session.status === "awaiting-author" && !pendingStep(session)) failures.push(`${seed}: ends awaiting-author with nothing pending`);
    }
    expect(failures).toEqual([]);
  });
});

describe("v2.8 09 harvest A5: the agent step keeps the read-back", () => {
  it("an unconfirmed card resolves applied with its state, refuses a second create, and a later check upgrades it", () => {
    const pending = step(running(), card("Ilsa Crane", FULL));
    const readBack = { state: "unconfirmed" as const, lossy: [], avatar: "Ilsa Crane.png" };
    const applied = resolveProvisioning(pending, 1, { ok: true, message: "may exist", readBack }, story());
    expect(applied.steps[0]).toMatchObject({ status: "applied", readBack });
    expect(unsettledReadBacks(applied).map((entry) => entry.id)).toEqual([1]);
    const again = step(applied, card("Ilsa Crane", FULL));
    expect(again.steps[1]).toMatchObject({ status: "refused", observation: expect.stringContaining("already created at step #1") });
    const upgraded = recheckReadBack(applied, 1, { ...readBack, state: "stored" }, "Ilsa Crane");
    expect(upgraded.steps[0]).toMatchObject({ readBack: { state: "stored" }, observation: 'Created the character card "Ilsa Crane".' });
    expect(unsettledReadBacks(upgraded)).toEqual([]);
  });
});
