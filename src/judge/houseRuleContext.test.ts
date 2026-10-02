import { HOUSE_RULE_MAX_GROUP, HOUSE_RULE_MESSAGE_CHARS, HOUSE_RULE_ROLE_CHARS, LORE_CONTENT_CHARS, WARDEN_MAX_LORE } from "./policy";
import { validateJudgeRequest } from "./questions";
import type { JudgeAnswer } from "./types";
import {
  buildWardenRequests, countParagraphs, houseRuleLore, houseRuleP, houseRulesDecidedInCode, paragraphBreak, paragraphLimit, readWarden,
  type HouseRuleContext, type WardenInput,
} from "./warden";

const reply = { speaker: "Narrator", text: "The gate creaks.\n\nBelle laughs." };
const context = (over: Partial<HouseRuleContext> = {}): HouseRuleContext => ({
  scene: { player: "Max", playerMessage: "I push the gate.", speakerRole: "narrator: voices the world", groupMembers: ["Narrator", "Belle"] },
  worldBook: [{ comment: "Primer", text: "The world.", constant: true }, { comment: "Belle", text: "Belle is a barbarian.", constant: false }],
  ...over,
});
const input = (over: Partial<WardenInput> = {}): WardenInput => ({ reply, facts: [], agency: null, houseRules: [], ...over });
const noul = (p: number): JudgeAnswer => ({ type: "noul", noul: p });

describe("paragraph limits decided in code", () => {
  it.each([
    ["Each reply stays within two to four short paragraphs.", { min: 2, max: 4 }],
    ["Replies are 1-3 paragraphs.", { min: 1, max: 3 }],
    ["Write between 2 and 5 paragraphs.", { min: 2, max: 5 }],
    ["Keep it to at most three paragraphs.", { min: 1, max: 3 }],
    ["Never more than 4 long paragraphs.", { min: 1, max: 4 }],
    ["At least two paragraphs per reply.", { min: 2, max: Number.POSITIVE_INFINITY }],
    ["Exactly one paragraph.", { min: 1, max: 1 }],
    ["A single short paragraph.", { min: 1, max: 1 }],
  ])("reads %s", (rule, limit) => {
    expect(paragraphLimit(rule)).toEqual(limit);
  });

  it.each(["Paragraphs stay short.", "No character swears.", "Use paragraphs, not bullet points."])("leaves %s to the judge", (rule) => {
    expect(paragraphLimit(rule)).toBeNull();
  });

  it("counts blank-line blocks, or lines when the reply has no blank line", () => {
    expect(countParagraphs("One.\n\nTwo.\n  \nThree.")).toBe(3);
    expect(countParagraphs("One.\nTwo.")).toBe(2);
    expect(countParagraphs("Only one.")).toBe(1);
    expect(countParagraphs("  ")).toBe(0);
  });

  it("a count outside the range breaks the rule without asking; inside it the judge still decides (\"short\" is not countable)", () => {
    const rule = "Each reply stays within two to four short paragraphs.";
    expect(paragraphBreak(rule, "A.\n\nB.\n\nC.\n\nD.\n\nE.")).toBe(true);
    expect(paragraphBreak(rule, "A.")).toBe(true);
    expect(paragraphBreak(rule, "A.\n\nB.")).toBe(false);
    const long = input({ reply: { speaker: "Narrator", text: "A.\n\nB.\n\nC.\n\nD.\n\nE." }, houseRules: ["No swearing.", rule] });
    const [request] = buildWardenRequests(long);
    expect(Object.keys(request.questions)).toEqual(["rule:0"]);
    expect(request.state.house_rules).toEqual({ rule_0: "No swearing." });
    expect(houseRulesDecidedInCode(long)).toBe(true);
    expect(houseRuleP({ "rule:0": noul(0.1) }, long, 1)).toBe(1);
    expect(readWarden({ "rule:0": noul(0.1) }, long)).toEqual([expect.objectContaining({ family: "house-rule", rules: [rule] })]);
  });

  it("a reply decided entirely in code sends no request", () => {
    const only = input({ reply: { speaker: "Narrator", text: "A." }, houseRules: ["Exactly two paragraphs."] });
    expect(buildWardenRequests(only)).toEqual([]);
    expect(readWarden({}, only).map((finding) => finding.rules)).toEqual([["Exactly two paragraphs."]]);
  });
});

describe("house rules with the scene and the world book", () => {
  it("without context the rules ride the combined request exactly as before", () => {
    const [request, ...rest] = buildWardenRequests(input({ facts: ["F."], houseRules: ["No guns."] }));
    expect(rest).toEqual([]);
    expect(Object.keys(request.state)).toEqual(["established_facts", "reply", "house_rules"]);
    expect(request.questions["rule:0"].instructions).toBe("Does `reply` break `house_rules.rule_0`?");
  });

  it("context is unused when no rule is asked: no request, nothing of it sent", () => {
    expect(buildWardenRequests(input({ houseRuleContext: context() }))).toEqual([]);
    const [request] = buildWardenRequests(input({ facts: ["F."], houseRuleContext: context() }));
    expect(JSON.stringify(request)).not.toMatch(/scene|world_book|barbarian/);
  });

  it("asks the rules in their own call beside an unchanged continuity/agency request, naming the context the judge may read", () => {
    const withContext = buildWardenRequests(input({ facts: ["F."], agency: { player: "Max", message: "I wait." }, houseRules: ["{{user}} decides for {{User}}."], houseRuleContext: context() }));
    const without = buildWardenRequests(input({ facts: ["F."], agency: { player: "Max", message: "I wait." } }));
    expect(withContext).toHaveLength(2);
    expect(JSON.stringify(withContext[0])).toBe(JSON.stringify(without[0]));
    const [, rules] = withContext;
    expect(Object.keys(rules.state)).toEqual(["reply", "house_rules", "scene", "world_book"]);
    expect(rules.state.house_rules).toEqual({ rule_0: "Max decides for Max." });
    expect(rules.state.scene).toEqual({ player: "Max", speaker_role: "narrator: voices the world", group_members: ["Narrator", "Belle"], player_message: "I push the gate." });
    expect(rules.state.world_book).toEqual({ entry_0: { title: "Belle", text: "Belle is a barbarian." }, entry_1: { title: "Primer", text: "The world." } });
    expect(rules.questions["rule:0"].instructions).toBe("Does `reply` break `house_rules.rule_0`? Judge it with `scene` and `world_book`.");
    expect(validateJudgeRequest(rules)).toEqual([]);
  });

  it("names only the scene when no entry fired, and leaves a rule without a macro untouched", () => {
    const [request] = buildWardenRequests(input({ houseRules: ["No guns."], houseRuleContext: context({ worldBook: [] }) }));
    expect(Object.keys(request.state)).toEqual(["reply", "house_rules", "scene"]);
    expect(request.state.house_rules).toEqual({ rule_0: "No guns." });
    expect(request.questions["rule:0"].instructions).toBe("Does `reply` break `house_rules.rule_0`? Judge it with `scene`.");
  });

  it("keeps the budget: keyword entries before constant ones, 8 entries of 600 chars, 24 members, 400-char player line, 160-char role", () => {
    const worldBook = [
      ...Array.from({ length: 6 }, (_, index) => ({ comment: `Constant ${index}`, text: "c".repeat(900), constant: true })),
      ...Array.from({ length: 6 }, (_, index) => ({ comment: `Keyword ${index}`, text: "k".repeat(900), constant: false })),
    ];
    const kept = houseRuleLore(worldBook);
    expect(kept).toHaveLength(WARDEN_MAX_LORE);
    expect(kept.map((entry) => entry.comment)).toEqual(["Keyword 0", "Keyword 1", "Keyword 2", "Keyword 3", "Keyword 4", "Keyword 5", "Constant 0", "Constant 1"]);
    expect(kept.every((entry) => entry.text.length === LORE_CONTENT_CHARS)).toBe(true);
    const scene = { player: "Max", playerMessage: "m".repeat(900), speakerRole: "r".repeat(900), groupMembers: Array.from({ length: 40 }, (_, index) => `Member ${index}`) };
    const [request] = buildWardenRequests(input({ houseRules: ["No guns."], houseRuleContext: { scene, worldBook } }));
    const state = request.state.scene as { group_members: string[]; player_message: string; speaker_role: string };
    expect([state.group_members.length, state.player_message.length, state.speaker_role.length]).toEqual([HOUSE_RULE_MAX_GROUP, HOUSE_RULE_MESSAGE_CHARS, HOUSE_RULE_ROLE_CHARS]);
    expect(validateJudgeRequest(request)).toEqual([]);
  });

  it("findings name the authored rule text, never the resolved one", () => {
    const rule = "{{user}}'s choices belong to {{user}}.";
    const asked = input({ houseRules: [rule], houseRuleContext: context() });
    expect(readWarden({ "rule:0": noul(0.9) }, asked)).toEqual([expect.objectContaining({ family: "house-rule", rules: [rule] })]);
  });
});
