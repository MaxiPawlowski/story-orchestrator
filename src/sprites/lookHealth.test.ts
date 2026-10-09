import { parseStoryV2OrThrow } from "@engine/index";
import { changedLookIssues, type LookActor } from "./lookHealth";
import { defaultSpriteSettings } from "./settings";

test("changed-look readiness reports missing references and backend failures, but not matched, cached, muted or inactive looks", () => {
  const story = parseStoryV2OrThrow({ format: 2, title: "Changed look", description: "Synthetic readiness.",
    roster: [{ id: "arin", name: "Arin", card: { fields: { hair: { quality: "hair", visual: true } } } }],
    qualities: [{ key: "hair", type: "string", source: "extractor", rubric: "Current hair colour." }],
    checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." }], transitions: [] });
  const settings = { ...defaultSpriteSettings(), onDemand: false };
  const actor: LookActor = { name: "Arin", muted: false, profile: { folder: "Arin" }, rules: [] };
  expect(changedLookIssues(story, { hair: "red" }, settings, true, [])).toHaveLength(1);
  expect(changedLookIssues(story, { hair: "red" }, settings, true, [actor])[0].reason).toContain("off");
  expect(changedLookIssues(story, {}, settings, true, [actor])).toEqual([]);
  expect(changedLookIssues(story, { hair: "red" }, settings, false, [actor])).toEqual([]);
  expect(changedLookIssues(story, { hair: "red" }, settings, true, [{ ...actor, muted: true }])).toEqual([]);
  expect(changedLookIssues(story, { hair: "red" }, settings, true, [{ ...actor, generatedLook: JSON.stringify({ hair: "red" }) }])).toEqual([]);
  const matched = { ...actor, rules: [{ id: "red", places: [], checkpoints: [], keywords: [], card: { hair: ["red"] } }] };
  expect(changedLookIssues(story, { hair: "red" }, settings, true, [matched])).toEqual([]);
  const automatic = { ...settings, onDemand: true };
  expect(changedLookIssues(story, { hair: "red" }, automatic, true, [actor])[0].reason).toContain("reference expression pack");
  expect(changedLookIssues(story, { hair: "red" }, automatic, true, [{ ...actor, lookError: "Edit model unavailable." }])[0].reason).toBe("Edit model unavailable.");
});
