import type { StoryV2 } from "@engine/index";
import { emptyEnvironment, type ProvisioningEnvironment } from "@wizard/index";
import { missingAtDone } from "./finish";
import { approvePlan, newAgentSession } from "./loop";

const AT = "2026-10-10T12:00:00.000Z";
const NO_GROUP = "no group for the cast (createGroup with every card)";

const story = (): StoryV2 => ({
  format: 2,
  title: "Arin's Errand",
  description: "",
  qualities: [{ key: "trust", type: "int", source: "extractor", rubric: "How much?" }],
  checkpoints: [{ id: "start", name: "Start", objective: "Begin.", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "arin", name: "Arin" }, { id: "dm", name: "DM Narrator" }],
});

const install = (patch: Partial<ProvisioningEnvironment> = {}): ProvisioningEnvironment => ({
  ...emptyEnvironment(),
  characterNames: ["Arin", "DM Narrator", "Corvin"],
  castNames: ["Arin", "DM Narrator"],
  groupNames: ["Group: Arin, DM Narrator"],
  ...patch,
});

const session = () => approvePlan({ ...newAgentSession("errand", "review", {}, AT), plan: ["edit"], status: "awaiting-plan" }, ["edit"], AT);

describe("v2.8 09 owner 2026-10-10: the done check accepts an existing group that holds the whole cast", () => {
  it("an existing group with every cast member, under any name, is enough", () => {
    const casts = [{ name: "Group: Arin, DM Narrator", members: ["arin", "DM Narrator", "Corvin"] }];
    expect(missingAtDone(session(), story(), install({ groupCasts: casts }))).not.toContain(NO_GROUP);
  });

  it("negative control: a group missing one member, or no member list at all, still asks for the story's own group", () => {
    expect(missingAtDone(session(), story(), install({ groupCasts: [{ name: "Group: Arin, DM Narrator", members: ["Arin"] }] }))).toContain(NO_GROUP);
    expect(missingAtDone(session(), story(), install({ groupCasts: [{ name: "Arin + Corvin", members: ["Arin", "Corvin"] }, { name: "DM", members: ["DM Narrator"] }] }))).toContain(NO_GROUP);
    expect(missingAtDone(session(), story(), install())).toContain(NO_GROUP);
  });

  it("a story with no cast never asks for a group", () => {
    expect(missingAtDone(session(), { ...story(), roster: [] }, install({ castNames: [] }))).not.toContain(NO_GROUP);
  });
});
