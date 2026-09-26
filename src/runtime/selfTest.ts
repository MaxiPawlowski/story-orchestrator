import { askText, parseSharedReadResponse, profileRoute, routedModel, type ModelCall, type ParsedSharedRead } from "@extraction/index";
import { buildFixtureRun, type ExtractionFixtureSpec } from "@extraction/fixtureRun";

export const SELF_TEST_TIERS = ["deltas", "memory", "arcs", "epistemic", "ledger"] as const;
export type SelfTestTier = typeof SELF_TEST_TIERS[number];

export interface SelfTestTierResult {
  tier: SelfTestTier;
  status: "pass" | "fail";
  detail: string;
  got: string[];
}

export interface SelfTestReport {
  ranAt: string;
  profileId: string | null;
  results: SelfTestTierResult[];
  error?: string;
  suggestion?: { epistemicLedgerCapable: boolean; reason: string };
}

export interface SelfTestOptions {
  profileId: string | null;
  model?: ModelCall;
  debugResponses?: string[];
  cancelled?: () => boolean;
  onProgress?: (step: { pass: number; total: number; label: string }) => void;
}

// Evidence, not guesswork: the same prompt/parse path extraction uses at runtime, over fixtures
// whose right answer is unambiguous, so a tier that fails here fails in play too.
const CORE_FIXTURE: ExtractionFixtureSpec = {
  story: {
    format: 2,
    id: "self-test-core",
    title: "Model self-test",
    description: "Fixed fixture for the memory model self-test.",
    qualities: [
      { key: "has_lantern", type: "bool", source: "extractor", rubric: "Is the lantern in the party's hands?" },
      { key: "location", type: "enum", values: ["camp", "tunnel"], source: "extractor", rubric: "Where is the party right now?" },
    ],
    checkpoints: [
      { id: "camp", name: "Camp", objective: "Get moving.", type: "anchor", start: true },
      { id: "tunnel", name: "Tunnel", objective: "Go under.", type: "anchor" },
    ],
    transitions: [{ from: "camp", to: "tunnel", priority: 1, gate: { q: "location", op: "==", v: "tunnel" } }],
    roster: [{ id: "guide", name: "Bel" }],
  },
  transcript: [
    { index: 0, speaker: "Player", text: "I pick up the brass lantern from the crate and light it." },
    { index: 1, speaker: "Bel", text: "Bel nods. \"Then we go down.\" She leads the way into the tunnel and you follow her in." },
    { index: 2, speaker: "Player", text: "I follow Bel into the tunnel, lantern raised. I still owe her for the ferry crossing." },
  ],
  openArcs: ["The debt owed to Bel"],
};

const CAPABILITY_FIXTURE: ExtractionFixtureSpec = {
  story: {
    format: 2,
    id: "self-test-capability",
    title: "Model self-test (capability)",
    description: "Fixed fixture for the epistemic and ledger tiers.",
    qualities: [{ key: "letter_read", type: "bool", source: "extractor", rubric: "Has anyone read the letter aloud?" }],
    checkpoints: [{ id: "hall", name: "Hall", objective: "Talk.", type: "anchor", start: true }],
    transitions: [],
    roster: [{ id: "bel", name: "Bel" }, { id: "corin", name: "Corin" }],
  },
  transcript: [
    { index: 0, speaker: "Corin", text: "Corin slips the letter into his coat before Bel turns around. \"Nothing important,\" he says." },
    { index: 1, speaker: "Bel", text: "Bel frowns. \"You're bleeding.\" She points at his left arm, wrapped in a torn sleeve." },
    { index: 2, speaker: "Corin", text: "\"It's nothing.\" Corin keeps the letter hidden from Bel and holds his wounded arm still." },
  ],
  epistemicLedgerCapable: true,
  entities: ["Bel", "Corin"],
};

// The grader used to check that a tier produced ANY line, so a model that answered fluently
// about entirely the wrong things — a dragon on the moon, an interstellar chess tournament — was
// certified capable, and the settings panel then recommended enabling the tiers it had just
// mis-graded. Each tier now checks that the answer is about the fixture, whose right answer is
// unambiguous by construction.

const has = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.toLowerCase());
const someHas = (values: string[], needle: string) => values.some((value) => has(value, needle));

const gradeCore = (parsed: ParsedSharedRead): SelfTestTierResult[] => {
  const deltas = parsed.deltas.map((entry) => `${entry.delta.q}=${String(entry.delta.v)}`);
  const memory = parsed.memory.map((entry) => `${entry.tier}: ${entry.text}`);
  const arcs = parsed.arcs.map((entry) => `${entry.kind}: ${entry.text}`);

  // Both, not either: the transcript states plainly that the lantern is picked up AND that the
  // party goes into the tunnel, so a model that reads one and misses the other is not reading the
  // scene — it is guessing from the checkpoint names.
  const readLocation = someHas(deltas, "location=tunnel");
  const readLantern = someHas(deltas, "has_lantern=true");

  // Across all lines, not per line: a model may reasonably split the scene into two memories.
  const memoryText = memory.join(" — ");
  const memoryOnTopic = has(memoryText, "lantern") && has(memoryText, "tunnel");

  const arcText = arcs.join(" — ");
  const arcOnTopic = has(arcText, "debt") && has(arcText, "bel");

  return [
    {
      tier: "deltas",
      status: readLocation && readLantern ? "pass" : "fail",
      detail: "reads both gated qualities out of the scene (location=tunnel and has_lantern=true)",
      got: deltas,
    },
    {
      tier: "memory",
      status: memoryOnTopic ? "pass" : "fail",
      detail: "writes a memory line about THIS scene (it must mention the lantern and the tunnel)",
      got: memory,
    },
    {
      tier: "arcs",
      status: arcOnTopic ? "pass" : "fail",
      detail: "notices the thread this scene opens (the debt owed to Bel)",
      got: arcs,
    },
  ];
};

const gradeCapability = (parsed: ParsedSharedRead): SelfTestTierResult[] => {
  const epistemic = parsed.epistemic.map((entry) => `[${entry.tag}] ${entry.subject}${entry.hiddenFrom ? ` from ${entry.hiddenFrom}` : ""}: ${entry.content}`);
  const ledger = parsed.ledger.map((entry) => `${entry.entity}.${entry.field}=${entry.value}`);

  // Corin hides the letter from Bel. The subject and the tag both have to be right — "Bel knows
  // about the letter" is the opposite claim and must not pass.
  const tracksSecret = parsed.epistemic.some((entry) => entry.tag === "hiding"
    && has(entry.subject, "corin")
    && (has(entry.hiddenFrom ?? "", "bel") || has(entry.content, "bel")));

  // Corin's left arm is wounded. Which side of the pair carries which word is the model's choice
  // (`wound=left arm` and `arm=wounded` are both fine), so the pair is checked as one string.
  const tracksWound = parsed.ledger.some((entry) => has(entry.entity, "corin")
    && has(`${entry.field}=${entry.value}`, "arm")
    && has(`${entry.field}=${entry.value}`, "wound"));

  return [
    {
      tier: "epistemic",
      status: tracksSecret ? "pass" : "fail",
      detail: "tracks who knows what (Corin is hiding the letter from Bel)",
      got: epistemic,
    },
    {
      tier: "ledger",
      status: tracksWound ? "pass" : "fail",
      detail: "tracks entity state (Corin's arm is wounded)",
      got: ledger,
    },
  ];
};

export async function runModelSelfTest(options: SelfTestOptions): Promise<SelfTestReport> {
  const ranAt = new Date().toISOString();
  const profileId = options.profileId;
  if (!profileId) return { ranAt, profileId, results: [], error: "No memory model profile selected." };

  const passes: Array<{ spec: ExtractionFixtureSpec; label: string; grade: (parsed: ParsedSharedRead) => SelfTestTierResult[] }> = [
    { spec: CORE_FIXTURE, label: "core extraction", grade: gradeCore },
    { spec: CAPABILITY_FIXTURE, label: "epistemic and ledger", grade: gradeCapability },
  ];

  const results: SelfTestTierResult[] = [];
  for (const [index, pass] of passes.entries()) {
    if (options.cancelled?.()) return { ranAt, profileId, results, error: "Cancelled." };
    options.onProgress?.({ pass: index + 1, total: passes.length, label: pass.label });
    const { story, prompt } = buildFixtureRun(pass.spec);
    try {
      const planted = options.debugResponses ?? (__SO_DEV__ ? globalThis.storyOrchestratorDebugSelfTestResponses : null) ?? null;
      const raw = await askText(options.model ?? routedModel(profileRoute(profileId)), prompt, { role: "read", pass: "read", maxTokens: 512, debugResponse: planted?.[index] ?? null });
      if (options.cancelled?.()) return { ranAt, profileId, results, error: "Cancelled." };
      results.push(...pass.grade(parseSharedReadResponse(raw, story)));
    } catch (error) {
      return { ranAt, profileId, results, error: error instanceof Error ? error.message : `Self-test pass "${pass.label}" failed` };
    }
  }

  // A capability suggestion recommends turning a feature OFF, so it may only come from a complete,
  // semantically graded run. Every incomplete path — no profile, cancelled, a transport failure in
  // either pass — returns above with `error` set and no suggestion, so reaching this line means
  // both passes were graded. (A `results.length === SELF_TEST_TIERS.length` guard here would be
  // unreachable: no mutation of it changes any test, which is the definition of dead code.)
  const capabilityFailed = results.some((result) => (result.tier === "epistemic" || result.tier === "ledger") && result.status === "fail");
  return {
    ranAt,
    profileId,
    results,
    ...(capabilityFailed ? { suggestion: { epistemicLedgerCapable: false, reason: "This model did not produce usable epistemic/ledger lines on a fixture where the answer is unambiguous." } } : {}),
  };
}
