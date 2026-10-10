import type { StoryV2 } from "@engine/index";
import { emptyEnvironment, validateProvisioningOp } from "@wizard/index";
import {
  CARD_TOKEN_BUDGET, emptyTutorialCard, exampleBlocksWithoutChar, missingTutorialTopics, parseTutorialDraft, renderTutorialDraftPrompt, reviewTutorialCard, savedName,
  speaksForPlayer, TUTORIAL_STEPS, tutorialBlocked, tutorialCardOp, tutorialLookOps, type TutorialCard,
} from "./characterTutorial";
import { provisioningFollowUpOps } from "./proposal";
import { applyAgentOp, approvePlan, executeReply, isProvisionOp, newAgentSession, opPreview, pendingStep, resolveProvisioning } from "./agent/loop";
import { agentContext } from "./agent/testing";
import { checkToolCall } from "./agent/tools";

const AT = "2026-10-10T00:00:00.000Z";

const story = (): StoryV2 => ({
  format: 2, title: "Harbour", description: "A smuggler's port.", qualities: [],
  checkpoints: [{ id: "start", name: "Start", objective: "Arrive.", type: "anchor", start: true }], transitions: [], roster: [{ id: "mara", name: "Mara Venn" }],
});

const card = (patch: Partial<TutorialCard> = {}): TutorialCard => ({
  ...emptyTutorialCard(),
  name: "Brannoc Hale", role: "harbour master", concept: "a tired official who sells silence",
  appearance: "Broad, grey-bearded, salt-stained blue coat, a brass whistle on a cord.",
  description: "Brannoc runs the harbour office. He speaks slowly and never answers a question the first time it is asked. When pressed he taps his whistle. He wants to retire with his debts paid.",
  personality: "patient, evasive, quietly greedy",
  ...patch,
});

const ids = (findings: ReturnType<typeof reviewTutorialCard>) => findings.map((finding) => finding.id);

describe("v2.8 09 C: the character tutorial", () => {
  it("has the six steps in order, each with a why and topics the knowledge base holds", () => {
    expect(TUTORIAL_STEPS.map((step) => step.id)).toEqual(["who", "look", "voice", "first", "examples", "review"]);
    expect(TUTORIAL_STEPS.filter((step) => !step.why || !step.topics.length)).toEqual([]);
    expect(missingTutorialTopics()).toEqual([]);
  });

  it("review: a clean card has no finding", () => {
    expect(reviewTutorialCard(card(), { characterNames: ["Mara Venn"] })).toEqual([]);
  });

  it("review: blocks a missing name, a taken name and an empty description", () => {
    expect(ids(reviewTutorialCard(card({ name: "" }), { characterNames: [] }))).toContain("name-missing");
    const taken = reviewTutorialCard(card({ name: "mara venn" }), { characterNames: ["Mara Venn"] });
    expect(ids(taken)).toContain("name-taken");
    expect(tutorialBlocked(taken)).toBe(true);
    expect(ids(reviewTutorialCard(card({ description: " " }), { characterNames: [] }))).toContain("description-empty");
  });

  it("review: warns on the name traps SillyTavern has", () => {
    expect(savedName("Dr. Who?")).toBe("Dr. Who");
    expect(ids(reviewTutorialCard(card({ name: "Dr. Who?" }), { characterNames: [] }))).toEqual(expect.arrayContaining(["name-sanitized"]));
    expect(ids(reviewTutorialCard(card({ name: "So Fine" }), { characterNames: [] }))).toContain("name-mention-trap");
    expect(ids(reviewTutorialCard(card({ name: "Lán Fāng" }), { characterNames: [] }))).toContain("name-not-ascii");
  });

  it("review: catches a greeting that speaks for the player, and leaves it off a card outside the opening scene", () => {
    expect(speaksForPlayer("{{user}} nods and follows him inside.")).toBe(true);
    expect(speaksForPlayer("You feel the cold wind on your face.")).toBe(true);
    expect(speaksForPlayer("\"You're late,\" Brannoc says, not looking up.")).toBe(false);
    expect(ids(reviewTutorialCard(card({ opening: true, first_mes: "{{user}} walks in. Brannoc looks up." }), { characterNames: [] }))).toContain("greeting-speaks-for-player");
    expect(ids(reviewTutorialCard(card({ opening: false, first_mes: "Brannoc looks up." }), { characterNames: [] }))).toContain("greeting-not-opening");
    expect(tutorialCardOp(card({ opening: false, first_mes: "Brannoc looks up." }))).not.toHaveProperty("first_mes");
    expect(tutorialCardOp(card({ opening: true, first_mes: "Brannoc looks up." }))).toHaveProperty("first_mes", "Brannoc looks up.");
  });

  it("review: example blocks need a {{char}}: line, and the budget is counted", () => {
    expect(exampleBlocksWithoutChar("<START>\n{{char}}: Aye.\n<START>\nHe sighs.")).toBe(1);
    expect(ids(reviewTutorialCard(card({ mes_example: "<START>\nHe sighs." }), { characterNames: [] }))).toContain("examples-no-char-line");
    expect(ids(reviewTutorialCard(card({ description: "x. ".repeat(CARD_TOKEN_BUDGET * 2) }), { characterNames: [] }))).toContain("token-budget");
    expect(ids(reviewTutorialCard(card({ description: "Tall, grim, loyal, brave, quiet, kind." }), { characterNames: [] }))).toContain("voice-adjectives");
  });

  it("the card lands as a create-only provisioning op the wizard validates, with no appearance on it", () => {
    const op = tutorialCardOp(card());
    expect(validateProvisioningOp(op, emptyEnvironment())).toMatchObject({ ok: true });
    expect(JSON.stringify(op)).not.toContain("brass whistle");
    expect(provisioningFollowUpOps(story(), op).map((entry) => entry.kind)).not.toContain("setAppearance");
  });
});

describe("v2.8 09 C (D14): Look writes illustrations.appearances through a mutation and a diff card", () => {
  it("proposes addRosterMember first for a member not in the roster, then setAppearance; neither is provisioning", () => {
    const ops = tutorialLookOps(story(), card());
    expect(ops.map((op) => op.kind)).toEqual(["addRosterMember", "setAppearance"]);
    expect(ops.filter((op) => isProvisionOp(op))).toEqual([]);
    expect(tutorialLookOps(story(), card({ name: "Mara Venn" })).map((op) => op.kind)).toEqual(["setAppearance"]);
    expect(tutorialLookOps(story(), card({ appearance: "" }))).toEqual([]);
  });

  it("applying the ops sets the story's appearance for that roster id, and no card field", () => {
    const after = tutorialLookOps(story(), card()).reduce(applyAgentOp, story());
    expect(after.illustrations).toEqual({ appearances: { brannoc_hale: card().appearance } });
    expect(after.roster.find((member) => member.id === "brannoc_hale")).toEqual({ id: "brannoc_hale", name: "Brannoc Hale", role: "harbour master" });
    expect(opPreview(story(), { kind: "setAppearance", id: "mara", appearance: "Thin." })).toMatchObject({ action: "update", after: { appearances: { mara: "Thin." } } });
  });

  it("the agent's setAppearance waits for the author as a diff card in review, lands in the draft in auto-draft, and is never a provisioning confirm", () => {
    const call = { tool: "setAppearance", args: { id: "mara", appearance: "Thin, ink-stained fingers." } };
    expect(checkToolCall(call)).toMatchObject({ ok: true, op: { kind: "setAppearance", id: "mara" } });
    const run = (mode: "review" | "auto-draft") => approvePlan({ ...newAgentSession("look", mode, {}, AT), plan: ["p"], status: "awaiting-plan" }, ["p"], AT);
    const reviewed = executeReply(run("review"), { kind: "call", call }, agentContext(story()), { route: "local", firstTryValid: true, repaired: false, at: AT });
    expect(pendingStep(reviewed.session)).toMatchObject({ family: "edit", status: "pending", op: { kind: "setAppearance" } });
    expect(resolveProvisioning(reviewed.session, 1, { ok: true, message: "created" }, story())).toBe(reviewed.session);
    const drafted = executeReply(run("auto-draft"), { kind: "call", call }, agentContext(story()), { route: "local", firstTryValid: true, repaired: false, at: AT });
    expect(drafted.apply).toEqual({ kind: "setAppearance", id: "mara", appearance: "Thin, ink-stained fingers." });
    const unknown = executeReply(run("review"), { kind: "call", call: { tool: "setAppearance", args: { id: "nobody", appearance: "x" } } }, agentContext(story()), { route: "local", firstTryValid: true, repaired: false, at: AT });
    expect(unknown.session.steps[0]).toMatchObject({ status: "refused", observation: expect.stringContaining("not a roster id") });
  });
});

describe("v2.8 09 C: Draft it for me", () => {
  it("asks for the step's fields only, with what the author has so far", () => {
    const prompt = renderTutorialDraftPrompt("first", card({ first_mes: "" }), { title: "Harbour", description: "A port." });
    expect(prompt).toContain('"first_mes"');
    expect(prompt).toContain("Name: Brannoc Hale");
    expect(prompt).toContain("Never say what the player does");
  });

  it("keeps only the step's fields from the reply", () => {
    expect(parseTutorialDraft("who", '{"name":"Ilsa Crane","role":"fence","concept":"buys anything","description":"smuggled"}')).toEqual({ name: "Ilsa Crane", role: "fence", concept: "buys anything" });
    expect(parseTutorialDraft("look", "not json")).toEqual({});
  });
});
