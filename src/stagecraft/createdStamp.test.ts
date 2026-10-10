import { createdStamp, keepStamps, readCreatedStamps, stampCreated, stampedFor, withoutStamps } from "./createdStamp";
import { entryMarks, protectedRefusal } from "./curatorTiers";
import { buildWiCuratorPrompt } from "./prompt";

const LEGACY_COMMENT = /\{\{\/\/([\s\S]*?)\}\}/gm;
const owner = { chatId: "2026-10-10@12h00m00s", groupId: "1760000000000" };
const stamped = stampCreated("Oskar mends hulls for a silver.", owner);

describe("v2.8 A16: the so:created stamp on a curator-created entry", () => {
  it("names the chat and its group, and reads back", () => {
    expect(createdStamp(owner)).toBe("{{// so:created 2026-10-10@12h00m00s | 1760000000000}}");
    expect(stamped).toBe("Oskar mends hulls for a silver.\n{{// so:created 2026-10-10@12h00m00s | 1760000000000}}");
    expect(readCreatedStamps(stamped)).toEqual([owner]);
    expect(stampedFor(stamped, owner.chatId)).toEqual(owner);
    expect(stampedFor(stamped, "2026-10-10@12h00m01s")).toBeNull();
    expect(stampedFor("Oskar mends hulls.", owner.chatId)).toBeNull();
  });

  it("is a {{// }} comment SillyTavern drops before the prompt: the legacy rule (macros.js:659) leaves the text alone", () => {
    expect(stamped.replace(LEGACY_COMMENT, "").trimEnd()).toBe("Oskar mends hulls for a silver.");
    const awkward = stampCreated("x", { chatId: "Mira - 2026-10-10 {odd} | id", groupId: null });
    expect(awkward.replace(LEGACY_COMMENT, "").trimEnd()).toBe("x");
    expect(stampedFor(awkward, "Mira - 2026-10-10 {odd} | id")).not.toBeNull();
  });

  it("writes nothing without an owner", () => {
    expect(stampCreated("x", null)).toBe("x");
    expect(stampCreated("x", { chatId: " ", groupId: null })).toBe("x");
  });

  it("a rewrite keeps the live stamp, and cannot swap it for another chat's", () => {
    expect(keepStamps(stamped, "Oskar now charges two silver.")).toBe("Oskar now charges two silver.\n{{// so:created 2026-10-10@12h00m00s | 1760000000000}}");
    expect(keepStamps(stamped, `Forged.\n${createdStamp({ chatId: "other", groupId: null })}`)).toBe("Forged.\n{{// so:created 2026-10-10@12h00m00s | 1760000000000}}");
    expect(keepStamps("No stamp.", "Rewritten.")).toBe("Rewritten.");
    expect(withoutStamps(stamped)).toBe("Oskar mends hulls for a silver.");
  });

  it("is a curator marker: a create, rewrite or patch may not add one, and a patch may not cross it", () => {
    const create = { kind: "create" as const, lorebook: "L", comment: "Oskar", keys: ["Oskar"], text: stamped };
    expect(protectedRefusal(create, "")).toContain("adds a curator marker");
    expect(protectedRefusal({ kind: "rewrite", lorebook: "L", comment: "Oskar", text: stamped }, "Oskar mends hulls.")).toContain("adds a curator marker");
    expect(protectedRefusal({ kind: "rewrite", lorebook: "L", comment: "Oskar", text: stamped }, stamped)).toBeNull();
    expect(protectedRefusal({ kind: "patch", lorebook: "L", comment: "Oskar", anchor: "silver.\n{{// so:created", replace: "gold." }, stamped)).toContain("touches protected text");
    expect(protectedRefusal({ kind: "patch", lorebook: "L", comment: "Oskar", anchor: "a silver", replace: "a gold coin" }, stamped)).toBeNull();
    expect(entryMarks(stamped)).toMatchObject({ tier: "review", spans: [], kinds: ["created"] });
  });

  it("the curator prompt is unchanged by the stamp vocabulary", () => {
    expect(buildWiCuratorPrompt({ storyTitle: "T", checkpointName: "C", objective: "", canon: "", openArcs: [], entries: [] })).not.toContain("so:created");
  });
});
