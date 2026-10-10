import type { StoryV2 } from "@engine/index";
import { askText, profileRoute, routedModel, stripChannelNoise, PASS_ROLE_LABELS, type PassRole } from "@extraction/index";
import { runAuthoringStage } from "@copilot/index";
import { parseDirectorResponse, renderDirectorPrompt } from "@talk/index";
import { buildWiCuratorPrompt, parseCuratorResponse, type CuratorScope } from "@stagecraft/index";
import { buildCreateCandidatePrompt, parseCreateLines, validateCreate, type CreateCandidateContext } from "@stagecraft/createCandidate";
import { buildSceneSummaryPrompt } from "@memory/contract";
import { INNER_BEAT_MAX_TOKENS, parseInnerBeat, renderInnerBeatPrompt } from "@memory/innerBeat";
import { runModelSelfTest } from "./selfTest";

export interface RoleSelfTestResult {
  role: PassRole;
  profileId: string | null;
  ranAt: string;
  status: "pass" | "fail";
  detail: string;
}

export interface RoleSelfTestOptions {
  profileId: string | null;
  debugResponses?: string[];
  cancelled?: () => boolean;
}

interface DirectorCase {
  id: string;
  acceptable: string[];
  input: {
    checkpointName: string;
    objective: string;
    candidates: Array<{ rosterId: string; name: string; role: string }>;
    allowSilence: boolean;
    window: Array<{ speaker: string; text: string }>;
  };
}

export const ROLE_DIRECTOR_CASES: DirectorCase[] = [
  {
    id: "D01",
    acceptable: ["Ponticius"],
    input: {
      checkpointName: "Accept the Mission",
      objective: "Pick up the Sun Ruins mission from the board.",
      candidates: [
        { rosterId: "ponticius", name: "Ponticius", role: "The gruff guild master who runs the job board, hands out contracts and pays rewards" },
        { rosterId: "arin", name: "Arin", role: "The player's companion, a sharp-tongued swordswoman who travels with the party" },
        { rosterId: "dm_narrator", name: "DM Narrator", role: "The narrator: describes places, crowds, weather, dangers and anyone who is not in the cast" },
      ],
      allowSilence: false,
      window: [
        { speaker: "Arin", text: "\"Gold wax. That's Ponticius's seal.\"" },
        { speaker: "Max", text: "\"Ponticius, what does the Sun Ruins job pay?\"" },
      ],
    },
  },
  {
    id: "D06",
    acceptable: ["DM Narrator"],
    input: {
      checkpointName: "Find the Artifact",
      objective: "Recover the Sun's Heart Artifact from the inner chamber.",
      candidates: [
        { rosterId: "arin", name: "Arin", role: "The player's companion, a sharp-tongued swordswoman who travels with the party" },
        { rosterId: "luke", name: "Luke", role: "The player's twelve-year-old little brother, desperate to join the adventure" },
        { rosterId: "dm_narrator", name: "DM Narrator", role: "The narrator: describes places, crowds, weather, dangers and anyone who is not in the cast" },
      ],
      allowSilence: false,
      window: [
        { speaker: "Arin", text: "\"After you. I insist.\"" },
        { speaker: "Max", text: "I push the heavy door open and step into the dark corridor beyond." },
      ],
    },
  },
  {
    id: "D08",
    acceptable: ["NONE"],
    input: {
      checkpointName: "Departure Preparations",
      objective: "Decide whether to take Luke along before departing for the Sun Ruins.",
      candidates: [
        { rosterId: "arin", name: "Arin", role: "The player's companion, a sharp-tongued swordswoman who travels with the party" },
      ],
      allowSilence: true,
      window: [
        { speaker: "Arin", text: "\"Get some sleep. I'll take first watch.\"" },
        { speaker: "Max", text: "*I roll into my bedroll and close my eyes.*" },
      ],
    },
  },
];

const CURATOR_SCOPE: CuratorScope = {
  storyTitle: "Model self-test",
  checkpointName: "Tunnel",
  objective: "Go under.",
  canon: "The party left camp at dawn. Bel led them into the old tunnel by lantern light, and the camp is far behind.",
  openArcs: [],
  entries: [
    { lorebook: "Self-test", comment: "The Old Tunnel", keys: ["tunnel"], content: "A collapsed mining tunnel under the hills. Damp, narrow, lit only by what the party carries.", disabled: true },
    { lorebook: "Self-test", comment: "Camp", keys: ["camp"], content: "The party is resting at camp by the river and has not moved on yet.", disabled: false },
  ],
};

const SCENE_LINES = [
  "Player: I pick up the brass lantern from the crate and light it.",
  "Bel: Bel nods. \"Then we go down.\" She leads the way into the tunnel.",
  "Player: I follow Bel into the tunnel, lantern raised.",
];

const SCENE_TEXT = SCENE_LINES.join("\n");

const AUTHORING_DRAFT: StoryV2 = {
  format: 2,
  id: "self-test-authoring",
  title: "Model self-test",
  description: "A lantern-lit descent into an old tunnel.",
  qualities: [],
  checkpoints: [{ id: "camp", name: "Camp", objective: "Get moving.", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "guide", name: "Bel" }],
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

type Run = (profileId: string, answer: (index: number) => string | null) => Promise<{ passed: boolean; detail: string }>;

const runDirector: Run = async (profileId, answer) => {
  let parsed = 0;
  for (const [index, entry] of ROLE_DIRECTOR_CASES.entries()) {
    const candidates = entry.input.candidates.map((candidate) => ({ ...candidate, weight: 1 }));
    const prompt = renderDirectorPrompt({ storyTitle: "Model self-test", ...entry.input, candidates });
    const raw = await askText(routedModel(profileRoute(profileId)), prompt, { role: "director", pass: "director", maxTokens: 96, debugResponse: answer(index) });
    if (parseDirectorResponse(raw, candidates, entry.input.allowSilence)) parsed += 1;
  }
  return { passed: parsed === ROLE_DIRECTOR_CASES.length, detail: `${String(parsed)} of ${String(ROLE_DIRECTOR_CASES.length)} director cases answered a usable SPEAKER line` };
};

const runCurator: Run = async (profileId, answer) => {
  const raw = await askText(routedModel(profileRoute(profileId)), buildWiCuratorPrompt(CURATOR_SCOPE), { role: "curator", pass: "curator", maxTokens: 512, debugResponse: answer(0) });
  const proposal = parseCuratorResponse(raw, CURATOR_SCOPE.entries);
  return { passed: proposal.ops.length > 0, detail: `the curator fixture (the party left camp for the tunnel) gave ${String(proposal.ops.length)} usable op(s)` };
};

const LORE_CONTEXT: CreateCandidateContext = {
  allowlist: ["Self-test"],
  entries: CURATOR_SCOPE.entries,
  roster: ["Bel"],
  facts: ["Old Marn keeps the tunnel's only map and sells copies for a silver each.", "Bel bought Old Marn's map before the party left camp.", "The tunnel floods past the second gate."],
};

const runLore: Run = async (profileId, answer) => {
  const prompt = buildCreateCandidatePrompt(CURATOR_SCOPE, LORE_CONTEXT);
  const raw = await askText(routedModel(profileRoute(profileId)), prompt, { role: "lore", pass: "loreCreate", maxTokens: 512, debugResponse: answer(0) });
  const valid = parseCreateLines(raw).filter((op) => validateCreate(op, LORE_CONTEXT).ok);
  return { passed: valid.length > 0, detail: `the lore fixture (a map-seller two facts name) gave ${String(valid.length)} usable new entry card(s)` };
};

const runSynthesis: Run = async (profileId, answer) => {
  const raw = await askText(routedModel(profileRoute(profileId)), buildSceneSummaryPrompt(SCENE_TEXT), { role: "synthesis", pass: "sceneSummary", maxTokens: 256, debugResponse: answer(0) });
  const summary = stripChannelNoise(raw).trim();
  return { passed: summary.length > 0, detail: summary ? "wrote a scene summary" : "the scene summary came back empty" };
};

const runAuthoring: Run = async (profileId, answer) => {
  const result = await runAuthoringStage(
    { draft: AUTHORING_DRAFT, stage: "qualities", message: "Propose one quality for whether the lantern is lit.", history: [] },
    routedModel(profileRoute(profileId)),
    { role: "authoring", pass: "copilot", debugResponse: answer(0) },
  );
  const passed = result.status === "ok" || result.status === "questions";
  return { passed, detail: passed ? "returned a valid proposal" : `the proposal was not valid JSON (${result.issues.slice(0, 2).join("; ")})` };
};

const runRead: Run = async (profileId, answer) => {
  const planted = [answer(0), answer(1)].filter((value): value is string => value !== null);
  const report = await runModelSelfTest({ profileId, ...(planted.length ? { debugResponses: planted } : {}) });
  if (report.error) throw new Error(report.error);
  const core = report.results.filter((result) => result.tier === "deltas" || result.tier === "memory" || result.tier === "arcs");
  const passing = core.filter((result) => result.status === "pass").length;
  return { passed: core.length > 0 && passing === core.length, detail: `${String(passing)} of ${String(core.length)} core read tiers passed` };
};

const runInner: Run = async (profileId, answer) => {
  const prompt = renderInnerBeatPrompt({
    storyTitle: "Model self-test", memberName: "Bel", checkpointName: "Tunnel", objective: "Go under.", steering: "",
    agency: "- The player's own acts are theirs to write.", privateRows: "- What you want: to reach the flooded vault before the rival crew",
    window: SCENE_LINES.map((line) => ({ speaker: line.split(":")[0], text: line.slice(line.indexOf(":") + 1).trim() })),
  });
  const raw = await askText(routedModel(profileRoute(profileId)), prompt, { role: "inner", pass: "inner", maxTokens: INNER_BEAT_MAX_TOKENS, debugResponse: answer(0) });
  const beat = parseInnerBeat(stripChannelNoise(raw));
  return { passed: beat !== null, detail: beat ? "wrote a usable BEAT line" : "no usable BEAT line came back" };
};

const RUNS: Record<PassRole, Run> = { read: runRead, synthesis: runSynthesis, authoring: runAuthoring, director: runDirector, curator: runCurator, inner: runInner, lore: runLore };

export async function runRoleSelfTest(role: PassRole, options: RoleSelfTestOptions): Promise<RoleSelfTestResult> {
  const ranAt = new Date().toISOString();
  const base = { role, profileId: options.profileId, ranAt };
  if (!options.profileId) return { ...base, status: "fail", detail: `No profile is chosen for ${PASS_ROLE_LABELS[role]}.` };
  const planted = options.debugResponses ?? null;
  try {
    const outcome = await RUNS[role](options.profileId, (index) => planted?.[index] ?? null);
    if (options.cancelled?.()) return { ...base, status: "fail", detail: "Cancelled." };
    return { ...base, status: outcome.passed ? "pass" : "fail", detail: outcome.detail };
  } catch (error) {
    return { ...base, status: "fail", detail: errorText(error) };
  }
}
