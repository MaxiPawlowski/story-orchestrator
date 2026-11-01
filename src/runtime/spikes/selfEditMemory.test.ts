import { unitDraw } from "@engine/chance";
import { provenance } from "@memory/provenance";
import { heldSecrets } from "@memory/heldSecrets";
import type { EpistemicEntry, MemoryEntry } from "@memory/types";
import {
  CORE_ITEMS_MAX, CORE_ROUTE_ROLE, applyCoreDeltas, buildCoreView, coreTokens, coreUpdatePrompt, currentCore, parseCoreDeltas, recordCore, renderCoreBlock,
  replayCore, rollbackCore, emptyCoreStore, CORE_TOKENS_MAX, type CoreUpdate, type CoreView,
} from "./selfEditMemory";

const live = provenance({ source: "extractor", messageId: 1, boundary: 1, pass: "shared-read" });
const SECRET = "Mara buried the silver ring under the mill floor.";
const epistemic: EpistemicEntry[] = [{ id: "e1", subject: "Mara", tag: "hiding", content: SECRET, hiddenFrom: "Tobin", createdAt: 0, provenance: live }];
const secrets = heldSecrets(epistemic, ["Mara", "Tobin", "Ida"]);

const row = (id: string, text: string, messageId = 1): MemoryEntry => ({
  id, tier: "facts", text, type: "event", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: "", createdAt: 0, recallCount: 0,
  messageId, provenance: live,
});

const SHARED = [
  row("m1", "Tobin owes the miller two silver coins."),
  row("m2", SECRET),
  row("m3", "Ida distrusts the river guild."),
  row("m4", "Tobin wants to leave the town before winter."),
  row("m5", "The mill floor was swept on market day."),
];

const viewFor = (member: string): CoreView => buildCoreView({ memberId: member.toLowerCase(), names: [member], shared: SHARED, privateRows: [{ id: "p1", text: `${member} remembers the fair.` }], secrets });

describe("spike selfEditMemory: per-member core block, edited by small deltas from the memory route", () => {
  it("parses delta lines: keep, add with cites, revise and drop are 1-based in the reply", () => {
    expect(parseCoreDeltas("KEEP\n- ADD want: Leave before winter [m4]\nREVISE 2: Owes two coins [m1, p1]\nDROP 3\nnoise")).toEqual([
      { op: "keep" },
      { op: "add", kind: "want", text: "Leave before winter", cites: ["m4"] },
      { op: "revise", index: 1, text: "Owes two coins", cites: ["m1", "p1"] },
      { op: "drop", index: 2 },
    ]);
  });

  it("the view a member's block is built from is that member's own: the kept-out member never sees the secret row", () => {
    expect(viewFor("Tobin").rows.map((entry) => entry.id)).toEqual(["p1", "m1", "m3", "m4", "m5"]);
    expect(viewFor("Mara").rows.map((entry) => entry.id)).toContain("m2");
    const prompt = coreUpdatePrompt("Tobin", { memberId: "tobin", items: [] }, viewFor("Tobin"));
    expect(prompt.role).toBe(CORE_ROUTE_ROLE);
    expect(prompt.prompt).not.toContain("silver ring");
  });

  it("refuses uncited, foreign-cited, secret-restating, bad-index and over-budget deltas", () => {
    const view = viewFor("Tobin");
    const outcome = applyCoreDeltas({ memberId: "tobin", items: [] }, [
      { op: "add", kind: "want", text: "Leave before winter.", cites: ["m4"] },
      { op: "add", kind: "belief", text: "Something is hidden.", cites: [] },
      { op: "add", kind: "belief", text: "The ring is under the mill.", cites: ["m2"] },
      { op: "add", kind: "belief", text: "Mara buried the silver ring under the mill floor.", cites: ["m5"] },
      { op: "drop", index: 7 },
      ...Array.from({ length: CORE_ITEMS_MAX + 1 }, (_, index) => ({ op: "add" as const, kind: "stance" as const, text: `Wary of stranger ${index}.`, cites: ["p1"] })),
    ], view, secrets);
    expect(outcome.refused.map((entry) => entry.reason).slice(0, 4)).toEqual(["no-cite", "foreign-cite", "secret", "bad-index"]);
    expect(outcome.block.items.length).toBe(CORE_ITEMS_MAX);
    expect(coreTokens(outcome.block.items.map((item) => item.text).join("\n"))).toBeLessThanOrEqual(CORE_TOKENS_MAX);
    expect(outcome.refused.at(-1)?.reason).toBe("full");
  });

  it("floor SM2: held-secret leak 0 — 200 adversarial replies for the kept-out member never put the secret in the block or its render", () => {
    let leaks = 0;
    const attempts = ["ADD belief: Mara buried the silver ring under the mill floor [m5]", "ADD belief: the silver ring lies buried under the mill floor [p1]", "REVISE 1: Mara buried the ring under the mill floor, silver [m1]"];
    for (let index = 0; index < 200; index += 1) {
      const view = viewFor("Tobin");
      const base = applyCoreDeltas({ memberId: "tobin", items: [] }, [{ op: "add", kind: "want", text: "Leave before winter.", cites: ["m4"] }], view, secrets).block;
      const reply = attempts[index % attempts.length] as string;
      const block = applyCoreDeltas(base, parseCoreDeltas(reply), view, secrets).block;
      const rendered = renderCoreBlock("Tobin", block, secrets, ["Tobin"]);
      if (block.items.some((item) => /ring/i.test(item.text)) || /ring/i.test(rendered)) leaks += 1;
    }
    expect(leaks).toBe(0);
    const mara = applyCoreDeltas({ memberId: "mara", items: [] }, parseCoreDeltas(attempts[0] as string), viewFor("Mara"), secrets);
    expect(mara.applied).toHaveLength(1);
  });

  it("floor SM1: rollback ≡ replay, 0 mismatches over 4 seeds x 50 random cuts", () => {
    const members = ["Tobin", "Ida", "Mara"];
    const replies = ["ADD want: Leave before winter [m4]", "ADD stance: Distrusts the guild [m3]", "REVISE 1: Wants to leave soon [m4]", "DROP 1", "KEEP", "ADD belief: Remembers the fair [p1]"];
    let mismatches = 0;
    for (const seed of [2, 7, 19, 31]) {
      const updates: CoreUpdate[] = Array.from({ length: 80 }, (_, index) => {
        const member = members[Math.floor(unitDraw(["core-member", seed, index]) * members.length)] as string;
        return { messageId: index * 2 + 1, boundary: index, memberId: member.toLowerCase(), reply: replies[Math.floor(unitDraw(["core-reply", seed, index]) * replies.length)] as string };
      });
      const viewOf = (update: CoreUpdate) => viewFor(members.find((member) => member.toLowerCase() === update.memberId) as string);
      const full = replayCore(updates, viewOf, secrets);
      for (let cut = 0; cut < 50; cut += 1) {
        const at = Math.floor(unitDraw(["core-cut", seed, cut]) * 162);
        const rolled = rollbackCore(full, at);
        const replayed = replayCore(updates.filter((update) => update.messageId < at), viewOf, secrets);
        if (JSON.stringify(rolled) !== JSON.stringify(replayed)) mismatches += 1;
      }
    }
    expect(mismatches).toBe(0);
  });

  it("recordCore replaces versions at or after the message, so a regenerated reply re-records instead of stacking", () => {
    const block = { memberId: "tobin", items: [{ kind: "want" as const, text: "Leave.", cites: ["m4"] }] };
    let store = recordCore(emptyCoreStore(), { messageId: 5, boundary: 2, block, inputs: ["m4"] });
    store = recordCore(store, { messageId: 5, boundary: 2, block: { memberId: "tobin", items: [] }, inputs: [] });
    expect(store.versions.tobin).toHaveLength(1);
    expect(currentCore(store, "tobin").items).toEqual([]);
    expect(currentCore(store, "nobody")).toEqual({ memberId: "nobody", items: [] });
  });
});
