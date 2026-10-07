import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect, waitFor } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import { buildNarrativeStatus } from "@runtime/narrative";
import { derivePipelineStatus } from "@runtime/pipeline";
import { createSaveHealth } from "@runtime/saveHealth";
import type { ExtractionRuntimeState, RuntimeSnapshot } from "@runtime/types";
import { DrawerTabs } from "./DrawerTabs";

const openMemoryTab = async (canvas: ReturnType<typeof within>) => {
  await userEvent.click(canvas.getByRole("tab", { name: "Memory" }));
  await waitFor(() => expect(canvas.getByRole("tabpanel").querySelector('[data-so="memory-tab"]')).not.toBeNull());
};

const openTab = async (canvasElement: HTMLElement, name: string) => {
  await userEvent.click(within(canvasElement).getByRole("tab", { name }));
  await waitFor(() => expect(canvasElement.querySelector(`[data-so-tab="${name.toLowerCase()}"]`)).not.toBeNull());
};

// The narrative and pipeline slices are derived, never hand-written: a story that faked them
// could pass while the real composition is broken.
const derive = (snapshot: RuntimeSnapshot): RuntimeSnapshot => {
  const pipeline = derivePipelineStatus(snapshot.extraction as ExtractionRuntimeState);
  return {
    ...snapshot,
    saveHealth: snapshot.saveHealth ?? createSaveHealth(),
    pipeline,
    narrative: buildNarrativeStatus({
      storyTitle: snapshot.storyTitle,
      checkpointName: snapshot.activeCheckpointName,
      objective: snapshot.activeObjective,
      lastTransition: { fromName: "Camp", toName: snapshot.activeCheckpointName ?? "here" },
      openThreads: (snapshot.memory.arcs ?? []).filter((arc) => arc.status === "open").map((arc) => arc.text),
      canon: snapshot.memory.canon?.text ?? "",
      tensionLevel: snapshot.tension.level,
      pendingCount: snapshot.pendingDeltas.length,
      pipeline,
      sceneLocation: snapshot.scene?.facts.location ?? null,
    }),
  };
};

const sampleSnapshot = (): RuntimeSnapshot => derive(({
    ready: true,
    storyId: "sun-ruins",
    storyHash: "v2-demo",
    storyIdentity: { id: "sun-ruins", pinned: true, drifted: false },
    storyTitle: "Quest for the Sun Ruins",
    storyDescription: "A desert expedition toward a buried temple.",
    activeCheckpointId: "gate",
    activeCheckpointName: "The Ruined Gate",
    activeObjective: "Breach the sanctum.",
    boundary: 6,
    blackboard: { has_key: true, guardian_respect: 2, trap_state: "armed" },
    blackboardMeta: {
      has_key: { version: 1, latched: true, source: "extractor", evidence: "Arin lifted the sun-key from the altar." },
      guardian_respect: { version: 2, latched: false, source: "extractor" },
      trap_state: { version: 1, latched: false, source: "extractor" },
    },
    checkpoints: [
      { id: "camp", name: "Camp", objective: "", active: false, visited: true },
      { id: "gate", name: "The Ruined Gate", objective: "Breach the sanctum.", active: true, visited: false },
    ],
    requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
    validationErrors: [],
    library: [],
    status: "Hydrated Quest for the Sun Ruins",
    extraction: {
      settings: { enabled: true, profileId: "p1", cadence: 3, stabilityLag: 1 },
      audits: [{
        id: "a12",
        reason: "cadence",
        prompt: "p",
        rawResponse: "r",
        scope: ["has_key", "trap_state"],
        acceptedDeltas: [],
        rejected: [],
        window: { from: 0, to: 6 },
        createdAt: "t",
        priority: 1,
        contractHash: "h",
      }],
      reconciliationEvents: [],
      lastReadBoundary: 5,
      scheduler: { queueDepth: 0, inFlight: false, lastError: null },
    },
    expansion: { entries: {}, scheduler: { queueDepth: 0, inFlight: false, lastError: null } },
    memory: {
      entries: [
        {
          id: "m1",
          tier: "facts",
          text: "The sun-key opens the inner sanctum.",
          type: "fact",
          importance: 3,
          expiration: "permanent",
          entities: [],
          confidence: 1,
          activationTriggers: [],
          evidence: "e",
          createdAt: 1,
          recallCount: 2,
          pinned: true,
        },
      ],
      excluded: [],
      writeLog: [],
      settings: {
        enabled: true,
        epistemicLedgerCapable: true,
        injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 },
        tierBudgets: { facts: 0, session_details: 0, short_term: 0, scene_history: 0 },
        tierTokenBudgets: { facts: 0, session_details: 0, short_term: 0, scene_history: 0 },
      },
      backfill: null,
      sceneCount: 2,
      wiWrites: {},
      arcs: [],
      epistemic: [],
      ledger: [],
      canon: { text: "The party crossed the dunes and reached the gate.", inputHash: "h", updatedAt: "t" },
      updatedAt: "t",
    },
    pacing: { alpha: 0.3, shapeOverride: null, hintEnabled: true },
    copilot: { enabled: false },
    ui: { authorView: true, announceTransitions: true, hudEnabled: true },
    talk: {
      enabled: true,
      decisions: [
        { at: "2026-07-06T12:00:00.000Z", messageId: 6, checkpointId: "gate", chosenRosterId: "sphinx", chosenName: "Sphinx", source: "director", latencyMs: 840 },
        { at: "2026-07-06T12:01:00.000Z", messageId: 8, checkpointId: "gate", chosenRosterId: null, chosenName: null, source: "director", latencyMs: 620 },
      ],
    },
    stagecraft: {
      settings: { curatorEnabled: true, acceptMode: "review" },
      lastRunBoundary: 4,
      lastError: null,
      proposals: [{
        id: "wi-4-6",
        at: "2026-08-13T10:00:00.000Z",
        boundary: 4,
        messageId: 6,
        checkpointId: "gate",
        reason: "checkpoint",
        summary: "The gate was breached, so the ward entry is out of date.",
        mode: "review",
        ops: [{
          op: { kind: "patch", lorebook: "Xentar Checkpoints", comment: "The dawn wards", anchor: "The wards hold || until dawn", replace: "The wards are broken" },
          status: "pending",
          message: 'Patch "The dawn wards"',
          before: { content: "The wards hold the gate until dawn.", disabled: false },
        }],
        dropped: ['rewrite: "Sanctum floor" is not an entry this story owns'],
      }],
    },
    stagecraftScope: ["Xentar Checkpoints"],
    pendingDeltas: [],
    convergence: [{ anchorId: "sanctum", anchorName: "Inner Sanctum", progress: 1, threshold: 2, reached: false }],
    tension: { level: "tense", smoothed: 0.72, expected: 0.6, hint: null },
    ledger: [],
    driver: null,
    activeNudge: null,
    payloadCaptures: [
      { at: "2026-07-06T12:00:00.000Z", boundary: 6, reason: "generation", blocks: [
        { key: "story_orchestrator_memory_facts", depth: 4, role: 0, value: "The sun-key opens the inner sanctum." },
        { key: "story_orchestrator_pacing", depth: 2, role: 0, value: "Raise the stakes toward the sanctum." },
      ] },
    ],
    nextTurn: ([
      {
        key: "story_orchestrator_continuity",
        label: "Continuity note",
        owner: "runtime/coordinators/stagecraftCoordinator",
        ownerTab: "scheduler",
        depth: 0,
        role: 0,
        characters: 62,
        target: null,
        oneShot: true,
        oneTurn: true,
        freshness: "live",
        fallback: null,
        preview: "The wards are broken, and the sanctum is unsealed.",
      },
      {
        key: "story_orchestrator_scene",
        label: "Scene so far",
        owner: "runtime/coordinators/sceneCoordinator",
        ownerTab: "scheduler",
        depth: 1,
        role: 0,
        characters: 44,
        target: null,
        oneShot: false,
        oneTurn: false,
        freshness: "stale",
        fallback: null,
        preview: "The inner sanctum, the wards failing at the threshold.",
      },
      {
        key: "story_orchestrator_epistemic",
        label: "What the speaker knows",
        owner: "memory/inject.applyEpistemicInjection",
        ownerTab: "memory",
        depth: 4,
        role: 0,
        characters: 51,
        target: "Arin",
        oneShot: false,
        oneTurn: false,
        freshness: "live",
        fallback: "timeout",
        preview: "[hiding from Arin] the key is a forgery",
      },
      {
        key: "story_orchestrator_memory_facts",
        label: "Memory — established facts",
        owner: "memory/inject.applyMemoryInjection",
        ownerTab: "memory",
        depth: 4,
        role: 0,
        characters: 37,
        target: null,
        oneShot: false,
        oneTurn: false,
        freshness: "live",
        fallback: null,
        preview: "The sun-key opens the inner sanctum.",
      },
      {
        key: "story_orchestrator_pacing",
        label: "Pacing",
        owner: "runtime/runtimeManager.applyPacingSteering",
        ownerTab: "config",
        depth: 4,
        role: 0,
        characters: 36,
        target: null,
        oneShot: false,
        oneTurn: false,
        freshness: "live",
        fallback: null,
        preview: "Raise the stakes toward the sanctum.",
      },
    ] as Array<Record<string, unknown>>).map((row) => ({ tokens: null, tokenSource: null, share: null, position: 1, conditional: false, ...row })),
    nextTurnForeign: [],
    nextTurnCost: {
      ownTokens: null,
      foreignTokens: 0,
      counting: 5,
      estimated: false,
      budget: null,
      context: null,
      response: null,
      budgetUnknown: "the context size has not been read",
      share: null,
      lastGenerationBudget: null,
    },
  }) as unknown as RuntimeSnapshot);

const previewActions = { clearNote: fn(), rerunScene: fn() };
const openSettings = fn();

const fakeManager = (): RuntimeManager =>
  ({
    editMemoryEntry: fn(),
    storeDroppedMemory: fn(),
    setMemoryPinned: fn(),
    excludeMemoryEntry: fn(),
    setMemorySettings: fn(),
    setEpistemicLedgerCapable: fn(),
    setEpistemicPinned: fn(),
    removeEpistemicEntry: fn(),
    setArcPinned: fn(),
    removeArc: fn(),
    removeLedgerEntry: fn(),
    flagMoment: fn(),
    restartStory: fn(),
    applyStoryUpdate: fn(async () => undefined),
    setCuratorOpDecision: fn(),
    previewActions,
  }) as unknown as RuntimeManager;

const memorySnapshot = (): RuntimeSnapshot => {
  const snapshot = sampleSnapshot() as unknown as { memory: Record<string, unknown> };
  snapshot.memory = {
    ...snapshot.memory,
    entries: [
      {
        id: "m1",
        tier: "facts",
        text: "The sun-key opens the inner sanctum.",
        type: "fact",
        importance: 3,
        expiration: "permanent",
        entities: [],
        confidence: 1,
        activationTriggers: [],
        evidence: "e",
        createdAt: 1,
        recallCount: 2,
        pinned: true,
      },
      {
        id: "m2",
        tier: "facts",
        text: "The gate is sealed by dawn wards.",
        type: "fact",
        importance: 2,
        expiration: "permanent",
        entities: [],
        confidence: 1,
        activationTriggers: [],
        evidence: "e",
        createdAt: 2,
        recallCount: 0,
        supersededBy: "m1",
      },
      {
        id: "m3",
        tier: "session_details",
        text: "Arin sprained her wrist on the dunes.",
        type: "event",
        importance: 2,
        expiration: "session",
        entities: [],
        confidence: 1,
        activationTriggers: [],
        evidence: "e",
        createdAt: 3,
        recallCount: 1,
        contradicted: true,
      },
      {
        id: "m4",
        tier: "scene_history",
        text: "Crossed the singing dunes at dusk.",
        type: "scene",
        importance: 1,
        expiration: "scene",
        entities: [],
        confidence: 1,
        activationTriggers: [],
        evidence: "e",
        createdAt: 4,
        recallCount: 0,
      },
    ],
    arcs: [
      { id: "a1", status: "open", text: "The missing sun-heart's true owner", createdAt: 1 },
      { id: "a2", status: "resolved", text: "Ponticius's warning", summary: "The guild master's warning proved true.", createdAt: 2 },
    ],
    epistemic: [
      { id: "e1", subject: "Arin", tag: "knows", content: "the sun-key location", createdAt: 1 },
      { id: "e2", subject: "Luke", tag: "hiding", hiddenFrom: "Arin", content: "his brother's letter", createdAt: 2, pinned: true },
    ],
    ledger: [
      { id: "l1", entity: "Sphinx", entityType: "character", field: "mood", value: "watchful", createdAt: 1 },
    ],
  };
  (snapshot as unknown as { ledger: unknown[] }).ledger = [
    { entity: "Sphinx", field: "mood", value: "watchful", bound: false },
    { entity: "Sphinx", field: "respect", value: "2", bound: true },
  ];
  return derive(snapshot as unknown as RuntimeSnapshot);
};

// v2.3 plan 09: past a few dozen rows a list stops being readable, so the tab grows find/tier
// controls — with more rows than a person scrolls, and one of them carrying a name long enough to
// break the layout if the row does not wrap.
const crowdedSnapshot = (): RuntimeSnapshot => {
  const snapshot = memorySnapshot() as unknown as { memory: { entries: Array<Record<string, unknown>> }; ui: Record<string, unknown> };
  // Player view on purpose: find and filter are player affordances, and the count they report is
  // over what a player is actually shown, not over the bookkeeping rows author view adds back.
  snapshot.ui = { ...snapshot.ui, authorView: false };
  const tiers = ["facts", "session_details", "short_term", "scene_history"];
  snapshot.memory.entries = [
    ...snapshot.memory.entries,
    ...Array.from({ length: 60 }, (_, index) => ({
      id: `x${index}`,
      tier: tiers[index % tiers.length],
      text: index === 3
        ? "The Ponticius family's heraldry — a sun bisected by a spear, quartered with the dunes of the eastern reach — is copied on the inner lintel of every waystation " +
          "between Wendhope and the sanctum."
        : `Established fact ${index} about the sun-key and the wardens.`,
      type: "fact",
      importance: index % 5,
      expiration: "permanent",
      entities: [],
      confidence: 1,
      activationTriggers: [],
      evidence: "e",
      createdAt: index + 10,
      recallCount: 0,
      characterId: index % 2 === 0 ? "Arin" : "Luke",
    })),
  ];
  return derive(snapshot as unknown as RuntimeSnapshot);
};

const emptySnapshot = (): RuntimeSnapshot => {
  const snapshot = sampleSnapshot() as unknown as {
    blackboard: Record<string, unknown>;
    blackboardMeta: Record<string, unknown>;
    payloadCaptures: unknown[];
    nextTurn: unknown[];
    convergence: unknown[];
    extraction: { audits: unknown[] };
  };
  snapshot.blackboard = {};
  snapshot.blackboardMeta = {};
  snapshot.payloadCaptures = [];
  snapshot.nextTurn = [];
  snapshot.convergence = [];
  snapshot.extraction = { ...snapshot.extraction, audits: [] };
  return derive(snapshot as unknown as RuntimeSnapshot);
};

const meta: Meta<typeof DrawerTabs> = {
  title: "Drawer/DrawerTabs",
  component: DrawerTabs,
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={sampleSnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} onOpenSettings={openSettings} />
    </div>
  ),
};

export default meta;

type Story = StoryObj<typeof DrawerTabs>;

export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("The Ruined Gate")).toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  },
};

export const Blackboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openTab(canvasElement, "Blackboard");
    await expect(canvas.getByText("has_key")).toBeInTheDocument();
    await expect(canvas.getByText("guardian_respect")).toBeInTheDocument();
  },
};

export const Scheduler: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openTab(canvasElement, "Scheduler");
    await expect(canvas.getByText("Extraction")).toBeInTheDocument();
    await expect(canvas.getByText("Expansion")).toBeInTheDocument();
    await expect(canvas.getByText("Stall re-checks")).toBeInTheDocument();
    await expect(canvas.getByText("World Info curator")).toBeInTheDocument();
    await expect(canvas.getByText(/Watching Xentar Checkpoints/)).toBeInTheDocument();
  },
};

const authorSnapshot = (): RuntimeSnapshot => {
  const snapshot = sampleSnapshot() as unknown as Record<string, unknown>;
  snapshot.gateQualities = ["has_key", "seal_broken"];
  snapshot.pendingDeltas = [{ quality: "seal_broken", value: true, source: "extractor" }];
  snapshot.authorMoves = [
    { at: "2026-10-02T09:34:24.404Z", boundary: 7, messageId: 8, kind: "author", summary: "Author advance: The Summons → Fort Vicinitas", note: "war-the-summons → war-the-front" },
    { at: "2026-10-02T09:29:50.000Z", boundary: 4, messageId: 5, kind: "author", summary: "Author nudge at The Summons", note: "A servant of the Queen signals the party." },
  ];
  return derive(snapshot as unknown as RuntimeSnapshot);
};

export const BlackboardGateQualitiesAndPending: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={authorSnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, "Blackboard");
    const row = canvasElement.querySelector('[data-so="blackboard-row"][data-key="seal_broken"]');
    await expect(row?.textContent).toContain("unset");
    await expect(row?.getAttribute("data-gate")).toBe("true");
    await expect(row?.querySelector('[data-so="blackboard-pending"]')?.textContent).toBe("→ true");
    await expect(canvasElement.querySelector('[data-so="blackboard-row"][data-key="has_key"] [data-so="blackboard-pending"]')?.textContent).toBe("");
  },
};

export const SchedulerAuthorMoves: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={authorSnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openTab(canvasElement, "Scheduler");
    const moves = [...canvasElement.querySelectorAll('[data-so="author-move"]')].map((node) => node.firstElementChild?.textContent);
    await expect(moves).toEqual(["Author advance: The Summons → Fort Vicinitas", "Author nudge at The Summons"]);
    await expect(canvas.queryByText(/war-the-front\.$/)).toBeNull();
  },
};

// v2.3 plan 09 fixtures: 64 rows, one of them long enough to need wrapping, all four tiers populated.
export const CrowdedMemory: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={crowdedSnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    await step("the find controls appear with the volume that needs them", async () => {
      await expect(canvasElement.querySelector("#so-memory-search")).toBeInTheDocument();
      await expect(canvas.getByText(/Showing 63 of 63/)).toBeInTheDocument();
    });
    await step("a needle narrows the list and says how far", async () => {
      await userEvent.type(canvasElement.querySelector("#so-memory-search") as HTMLInputElement, "heraldry");
      await expect(canvas.getByText(/Showing 1 of 63/)).toBeInTheDocument();
      await expect(canvas.getByText(/a sun bisected by a spear/)).toBeInTheDocument();
      await expect(canvas.queryByText("Established fact 1 about the sun-key and the wardens.")).toBeNull();
      await userEvent.click(canvas.getByRole("button", { name: "Clear" }));
      await expect(canvas.getByText(/Showing 63 of 63/)).toBeInTheDocument();
    });
    await step("a tier pill drops that tier and can put it back", async () => {
      const facts = canvasElement.querySelector('[data-so="memory-tier-filter"][data-tier="facts"]') as HTMLElement;
      await userEvent.click(facts);
      await expect(facts).toHaveAttribute("aria-pressed", "false");
      await expect(canvas.queryByText(/^Facts \(/)).toBeNull();
      await userEvent.click(facts);
      await expect(canvas.getByText(/^Facts \(/)).toBeInTheDocument();
    });
  },
};

// v2.4 plan 07 (J8.5): a claim held in the reconciliation queue is author machinery. The player's
// Memory tab lists what the story holds true, so a conflicted row is not in it.
const heldClaimSnapshot = (authorView: boolean): RuntimeSnapshot => {
  const snapshot = memorySnapshot() as unknown as { memory: { entries: Array<Record<string, unknown>> }; ui: Record<string, unknown> };
  snapshot.ui = { ...snapshot.ui, authorView };
  snapshot.memory.entries = [
    ...snapshot.memory.entries,
    {
      id: "held",
      tier: "facts",
      text: "The sun-key is a forgery.",
      type: "fact",
      importance: 3,
      expiration: "permanent",
      entities: [],
      confidence: 1,
      activationTriggers: [],
      evidence: "e",
      createdAt: 9,
      recallCount: 0,
      provenance: { source: "extractor", messageId: 9, boundary: 6, pass: "shared-read", validity: "conflicted" },
    },
  ];
  return derive(snapshot as unknown as RuntimeSnapshot);
};

export const PlayerMemoryLeavesOutAHeldClaim: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={heldClaimSnapshot(false)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    await expect(canvas.getByText(/The sun-key opens the inner sanctum/)).toBeInTheDocument();
    await expect(canvas.queryByText(/The sun-key is a forgery/)).toBeNull();
  },
};

export const AuthorMemoryShowsAHeldClaimAsConflicted: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={heldClaimSnapshot(true)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    await expect(canvas.getAllByText(/The sun-key is a forgery/).length).toBeGreaterThan(0);
  },
};

const heldSecretSnapshot = (authorView: boolean): RuntimeSnapshot => {
  const snapshot = memorySnapshot() as unknown as { memory: { entries: Array<Record<string, unknown>> }; memoryShown?: unknown[]; ui: Record<string, unknown> };
  snapshot.ui = { ...snapshot.ui, authorView };
  const row = (id: string, text: string) => ({
    id, tier: "facts", text, type: "fact", importance: 3, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: "e", createdAt: 9, recallCount: 0,
  });
  const kept = snapshot.memory.entries;
  snapshot.memory.entries = [...kept, row("secret", "Kel carries a silver key to the old vault."), row("mixed", "Kel trusts Aria. Kel carries a silver key to the old vault.")];
  snapshot.memoryShown = [...kept, row("mixed", "Kel trusts Aria.")];
  return derive(snapshot as unknown as RuntimeSnapshot);
};

export const PlayerMemoryHidesAHeldSecret: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={heldSecretSnapshot(false)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    await expect(canvas.getByText(/Kel trusts Aria/)).toBeInTheDocument();
    await expect(canvas.queryByText(/silver key/)).toBeNull();
    await expect(canvasElement.querySelector('[data-so="memory-row"][data-id="mixed"]')).not.toBeNull();
  },
};

export const AuthorMemoryShowsAHeldSecret: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={heldSecretSnapshot(true)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    await expect(canvas.getAllByText(/silver key/).length).toBeGreaterThan(0);
  },
};

export const Payload: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openTab(canvasElement, "Payload");
    await expect(canvas.getByText("story_orchestrator_memory_facts")).toBeInTheDocument();
    await expect(canvas.getByText(/@depth 4/)).toBeInTheDocument();
  },
};

// v2.3 plan 09: the next-turn preview is a different question from the capture above it — the capture
// is what the last reply carried, this is what the next one will.
export const NextTurn: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await openTab(canvasElement, "Payload");
    await step("lists every contributor in ST's assembly order with its owner", async () => {
      const panel = canvasElement.querySelector("#so-next-turn") as HTMLElement;
      const rows = [...panel.querySelectorAll('[data-so="next-turn-row"]')];
      await expect(rows.map((row) => row.getAttribute("data-key"))).toEqual([
        "story_orchestrator_continuity",
        "story_orchestrator_scene",
        "story_orchestrator_epistemic",
        "story_orchestrator_memory_facts",
        "story_orchestrator_pacing",
      ]);
      await expect(canvas.getByText("Next reply (5 contributors)")).toBeInTheDocument();
      await expect(canvas.getByText("memory/inject.applyMemoryInjection")).toBeInTheDocument();
      await expect(canvas.getByText(/depth 4 · 37 chars/)).toBeInTheDocument();
    });
    await step("marks a private, a one-turn, a stale and a fallen-back contributor", async () => {
      await expect(canvas.getByText("private → Arin")).toBeInTheDocument();
      await expect(canvas.getByText("one turn")).toBeInTheDocument();
      await expect(canvas.getByText("stale")).toBeInTheDocument();
      await expect(canvas.getByText("fell back (timeout)")).toBeInTheDocument();
    });
    await step("offers each control to the contributor that owns it", async () => {
      await expect(canvas.getByText("Clear the note")).toBeInTheDocument();
      await expect(canvas.getByText("Re-read the scene")).toBeInTheDocument();
      await userEvent.click(canvas.getByText("Clear the note"));
      await expect(previewActions.clearNote).toHaveBeenCalled();
      previewActions.clearNote.mockClear();
      await userEvent.click(canvas.getByText("Re-read the scene"));
      await expect(previewActions.rerunScene).toHaveBeenCalled();
      previewActions.rerunScene.mockClear();
    });
    // V19: the owner was named but not reachable.
    await step("each contributor opens the editor that owns it", async () => {
      await expect(canvas.getAllByRole("button", { name: "Open Scheduler" })).toHaveLength(2);
      await expect(canvas.getAllByRole("button", { name: "Open Memory" })).toHaveLength(2);
      await userEvent.click(canvas.getByRole("button", { name: "Open settings" }));
      await expect(openSettings).toHaveBeenCalled();
      openSettings.mockClear();
      await userEvent.click(canvas.getAllByRole("button", { name: "Open Memory" })[0]);
      await expect(canvas.getByRole("tab", { name: "Memory" })).toHaveAttribute("aria-selected", "true");
      await openTab(canvasElement, "Payload");
      await userEvent.click(canvas.getAllByRole("button", { name: "Open Scheduler" })[0]);
      await expect(canvas.getByRole("tab", { name: "Scheduler" })).toHaveAttribute("aria-selected", "true");
    });
  },
};

export const NextTurnEmpty: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={emptySnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openTab(canvasElement, "Payload");
    await expect(canvas.getByText("Nothing is injected into the next reply.")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="next-turn-reread-scene"]')).toBeNull();
  },
};

export const Memory: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={memorySnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    await expect(canvas.getByText(/Facts \(2\)/)).toBeInTheDocument();
    await expect(canvas.getByText(/The sun-key opens the inner sanctum\./)).toBeInTheDocument();
    await expect(canvas.getByText("⤳ superseded")).toBeInTheDocument();
    await expect(canvas.getByText("⚠ contradicted")).toBeInTheDocument();
    await expect(await canvas.findByText(/Arcs \(open 1 · resolved 1\)/)).toBeInTheDocument();
    await expect(canvas.getByText(/The guild master's warning proved true\./)).toBeInTheDocument();
    await expect(canvas.getByText(/Epistemic map \(2\)/)).toBeInTheDocument();
    await expect(canvas.getByText(/\[hiding from Arin\]/)).toBeInTheDocument();
    await expect(canvas.getByText(/State ledger \(2\)/)).toBeInTheDocument();
    await expect(canvas.getByText(/respect=2/)).toBeInTheDocument();
    await expect(canvas.getByText("blackboard")).toBeInTheDocument();
  },
};

const notStoredSnapshot = (authorView: boolean): RuntimeSnapshot => {
  const snapshot = memorySnapshot() as unknown as { memory: Record<string, unknown>; ui: Record<string, unknown> };
  snapshot.memory = {
    ...snapshot.memory,
    verifyDrops: [{
      entry: {
        id: "d1",
        tier: "facts",
        text: "Arin killed the sphinx.",
        type: "fact",
        importance: 2,
        expiration: "permanent",
        entities: [],
        confidence: 1,
        activationTriggers: [],
        evidence: "e",
        createdAt: 5,
        recallCount: 0,
        messageId: 4,
      },
      p: 0.04,
      at: "2026-09-19T00:00:00.000Z",
      model: "jev-1.13.0",
    }],
  };
  snapshot.ui = { ...snapshot.ui, authorView };
  return derive(snapshot as unknown as RuntimeSnapshot);
};

export const MemoryNotStored: Story = {
  render: () => {
    const manager = fakeManager();
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={notStoredSnapshot(true)} manager={manager} driver={{ context: null, activeNudge: null, controller: {} as never }} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    await userEvent.click(await canvas.findByText(/Not stored — no support in the chat \(1\)/));
    await expect(canvas.getByText("Arin killed the sphinx.")).toBeInTheDocument();
    await expect(canvas.getByText(/support 0\.04 · jev-1\.13\.0/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Store anyway" })).toBeInTheDocument();
  },
};

export const PlayerNeverSeesNotStored: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={notStoredSnapshot(false)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    await expect(canvas.queryByText(/Not stored/)).toBeNull();
    await expect(canvas.queryByText("Arin killed the sphinx.")).toBeNull();
  },
};

const sceneRead = {
  at: "2026-09-19T00:00:00.000Z",
  boundary: 6,
  messageId: 9,
  model: "jev-1.13.0",
  sceneBreak: { p: 0.82, type: "time_skip" as const, triggered: true },
  location: { value: "desert road", confidence: 0.91 },
  time: { value: "dawn", confidence: 0.55 },
  present: [{ id: "arin", name: "Arin", p: 0.96 }, { id: "luke", name: "Luke", p: 0.12 }],
  headingTo: [{ id: "cp3", name: "The Sphinx Gate", p: 0.84, hops: 1 }, { id: "cp4", name: "The Inner Chamber", p: 0.77, hops: 2 }],
  facts: { location: "desert road", time: null, present: ["Arin"], headingTo: ["The Sphinx Gate", "The Inner Chamber"] },
};

const sceneSnapshot = (authorView: boolean): RuntimeSnapshot => {
  const snapshot = memorySnapshot() as unknown as Record<string, unknown> & { ui: Record<string, unknown> };
  snapshot.scene = sceneRead;
  snapshot.ui = { ...snapshot.ui, authorView };
  return derive(snapshot as unknown as RuntimeSnapshot);
};

export const PayloadLoreForced: Story = {
  render: () => {
    const snapshot = sceneSnapshot(true) as unknown as Record<string, unknown>;
    snapshot.loreForced = {
      at: "2026-09-19T00:00:00.000Z",
      boundary: 6,
      messageId: 9,
      use: "lore",
      model: "jev-1.13.0",
      latencyMs: 912,
      stateChars: 900,
      questionCount: 64,
      p: { trigger: "MESSAGE_SENT", "NPC - Ellie": 0.91, "Lore - Adventurer Rank": 0.84 },
    };
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={snapshot as unknown as RuntimeSnapshot} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openTab(canvasElement, "Payload");
    const forced = within(await canvas.findByText("Lore forced this turn").then((node) => node.closest("[data-so=\"lore-forced\"]") as HTMLElement));
    await expect(forced.getByText(/message 9 · MESSAGE_SENT · 912 ms/)).toBeInTheDocument();
    await expect(forced.getByText("NPC - Ellie")).toBeInTheDocument();
    await expect(forced.getByText("91%")).toBeInTheDocument();
  },
};

// v2.4 plan 05 T12: what the last loud generation's scans activated, ours marked by origin, with the
// two misses that are worth a flag.
export const PayloadLoreFired: Story = {
  render: () => {
    const snapshot = sceneSnapshot(true) as unknown as Record<string, unknown>;
    snapshot.loreEvidence = {
      hiddenBooks: [],
      last: {
        chatId: "chat-1", epoch: 1, revision: 0, type: "normal", openedAt: "2026-09-24T00:00:00.000Z", closedAt: "2026-09-24T00:00:05.000Z", rendered: true, lastMessageId: 9,
        forced: [{ world: "Adventurer Lore", uid: 4, comment: "NPC - Ellie" }, { world: "Adventurer Lore", uid: 7, comment: "Lore - Guild Dues" }],
        landed: [{ world: "Adventurer Lore", uid: 4, comment: "NPC - Ellie" }],
        lost: [{ world: "Adventurer Lore", uid: 7, comment: "Lore - Guild Dues" }],
        constantMissed: [{ lorebook: "Sun Ruins", comment: "CP2 - The Gate" }],
        scanCount: 2,
        nestedScans: 1,
        fired: [
          { world: "Sun Ruins", uid: 2, comment: "CP1 - The Road", constant: true, key0: null, origin: "gated" },
          { world: "Adventurer Lore", uid: 4, comment: "NPC - Ellie", constant: false, key0: "Ellie", origin: "pick" },
          { world: "Story Orchestrator - Sun Ruins - chat-1", uid: 1, comment: "so_rel-1", constant: false, key0: "Ellie", origin: "mirror" },
          { world: "Adventurer Lore", uid: 9, comment: "Lore - Weather", constant: false, key0: "rain", origin: "other" },
        ],
      },
    };
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={snapshot as unknown as RuntimeSnapshot} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openTab(canvasElement, "Payload");
    const fired = within(await canvas.findByText("Lore that fired last turn").then((node) => node.closest("[data-so=\"lore-fired\"]") as HTMLElement));
    await expect(fired.getByText(/reply rendered · 2 scans \(1 inside a quiet run\)/)).toBeInTheDocument();
    await expect(fired.getAllByText("gated")).toHaveLength(1);
    await expect(fired.getByText("pick")).toBeInTheDocument();
    await expect(fired.getByText("mirror")).toBeInTheDocument();
    await expect(fired.getByText(/Forced but never reached the reply: Lore - Guild Dues/)).toBeInTheDocument();
    await expect(fired.getByText(/did not fire: CP2 - The Gate/)).toBeInTheDocument();
  },
};

// v2.5 plan 01 D (the T13 spike's S5 table): shown only while per-chat lorebook gating is active.
export const PayloadScanGate: Story = {
  render: () => {
    const snapshot = sceneSnapshot(true) as unknown as Record<string, unknown>;
    snapshot.loreEvidence = {
      hiddenBooks: [],
      last: {
        chatId: "chat-1",
        epoch: 1,
        revision: 0,
        type: "normal",
        openedAt: "2026-09-24T00:00:00.000Z",
        closedAt: "2026-09-24T00:00:05.000Z",
        rendered: true,
        lastMessageId: 9,
        forced: [],
        landed: [],
        lost: [],
        constantMissed: [],
        scanCount: 1,
        nestedScans: 0,
        fired: [{ world: "SO-T13 Xentar", uid: 9, comment: "CP1 - Mission", constant: true, key0: null, origin: "gated" }],
      },
    };
    snapshot.scanGate = {
      chatId: "chat-1",
      owner: "story",
      rows: [
        { lorebook: "SO-T13 Xentar", comment: "CP1 - Mission", uid: 9, on: true, fileDisabled: true, effectiveDisabled: false, gatedBy: ["Quest for the Sun Ruins"] },
        { lorebook: "SO-T13 Xentar", comment: "CP2 - Mission", uid: 17, on: false, fileDisabled: true, effectiveDisabled: true },
      ],
    };
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={snapshot as unknown as RuntimeSnapshot} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openTab(canvasElement, "Payload");
    const table = within(await canvas.findByText(/Per-chat lorebook gating: this chat's path/).then((node) => node.closest("[data-so=\"scan-gate\"]") as HTMLElement));
    await expect(table.getByText(/SO-T13 Xentar · gated by Quest for the Sun Ruins · file off · this chat on · fired/)).toBeInTheDocument();
    await expect(table.getByText(/SO-T13 Xentar · file off · this chat off$/)).toBeInTheDocument();
  },
};

export const PayloadSamplerOverlay: Story = {
  render: () => {
    const snapshot = sceneSnapshot(true) as unknown as Record<string, unknown>;
    snapshot.samplerOverlay = {
      chatId: "chat-1",
      checkpointId: "cp1",
      name: "Artemis Cool",
      api: "chat",
      values: { temperature: 0.55, top_p: 0.9 },
      unknown: ["openai_max_tokens"],
      applied: 2,
      lastApplied: ["temperature"],
      lastSkipped: ["top_p"],
    };
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={snapshot as unknown as RuntimeSnapshot} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openTab(canvasElement, "Payload");
    const row = within(await canvas.findByText(/Sampler overlay/).then((node) => node.closest("[data-so=\"next-turn-overlay\"]") as HTMLElement));
    await expect(row.getByText(/temperature 0.55, top_p 0.9/)).toBeInTheDocument();
    await expect(row.getByText(/the selected preset is untouched\. Applied to 2 request\(s\)\./)).toBeInTheDocument();
    await expect(row.getByText("Not in the last request: top_p")).toBeInTheDocument();
    await expect(row.getByText(/openai_max_tokens/)).toBeInTheDocument();
  },
};

export const PlayerNeverSeesSamplerOverlay: Story = {
  render: () => {
    const snapshot = sceneSnapshot(false) as unknown as Record<string, unknown>;
    snapshot.samplerOverlay = { chatId: "chat-1", checkpointId: "cp1", name: "Artemis Cool", api: "chat", values: { temperature: 0.55 }, unknown: [], applied: 0, lastApplied: [], lastSkipped: [] };
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={snapshot as unknown as RuntimeSnapshot} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText(/Sampler overlay/)).toBeNull();
  },
};

export const ScanGateHiddenWhenFileMode: Story = {
  render: () => {
    const snapshot = sceneSnapshot(true) as unknown as Record<string, unknown>;
    snapshot.scanGate = null;
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={snapshot as unknown as RuntimeSnapshot} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openTab(canvasElement, "Payload");
    await expect(canvas.queryByText(/Scan-time gating/)).toBeNull();
  },
};

export const PlayerNeverSeesLoreFired: Story = {
  render: () => {
    const snapshot = sceneSnapshot(false) as unknown as Record<string, unknown>;
    snapshot.loreEvidence = { hiddenBooks: [], last: null };
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={snapshot as unknown as RuntimeSnapshot} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("tab", { name: "Payload" })).toBeNull();
    await expect(canvas.queryByText("Lore that fired last turn")).toBeNull();
  },
};

export const AuthorSceneRead: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={sceneSnapshot(true)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const panel = await within(canvasElement).findByText("Scene read");
    const scene = within(panel.closest("[data-so=\"scene-read\"]") as HTMLElement);
    await expect(scene.getByText(/Scene change: 82% \(time_skip\) · read asked/)).toBeInTheDocument();
    await expect(scene.getByText("Location: desert road (91%)")).toBeInTheDocument();
    await expect(scene.getByText("Time: dawn (55%) · below floor")).toBeInTheDocument();
    await expect(scene.getByText("Heading toward: The Sphinx Gate 84%")).toBeInTheDocument();
    await expect(scene.queryByText(/Inner Chamber/)).toBeNull();
  },
};

export const PlayerSeesLocationNeverHeading: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={sceneSnapshot(false)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("At desert road.")).toBeInTheDocument();
    await expect(canvasElement.querySelector("[data-so=\"scene-read\"]")).toBeNull();
    await expect(canvas.queryByText(/Sphinx Gate|Heading toward|82%/)).toBeNull();
  },
};

const playerSnapshot = (): RuntimeSnapshot => {
  const snapshot = sampleSnapshot() as unknown as { ui: Record<string, unknown>; pendingDeltas: unknown[] };
  snapshot.ui = { authorView: false, announceTransitions: true, hudEnabled: true };
  snapshot.pendingDeltas = [{ quality: "luke_decision", value: "accepted", source: "extractor" }];
  return derive(snapshot as unknown as RuntimeSnapshot);
};

export const PlayerView: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={playerSnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("tab", { name: "Blackboard" })).toBeNull();
    await expect(canvas.queryByRole("tab", { name: "Scheduler" })).toBeNull();
    await expect(canvas.queryByRole("tab", { name: "Payload" })).toBeNull();
    await expect(canvas.getByRole("tab", { name: "Memory" })).toBeInTheDocument();
    await expect(canvas.getByText("The Ruined Gate")).toBeInTheDocument();
    await expect(canvas.getByText(/1 thing the story picked up/)).toBeInTheDocument();
    // No engine vocabulary, no gate progress, no raw quality keys on the player surface.
    await expect(canvas.queryByText(/boundary 6/i)).toBeNull();
    await expect(canvas.queryByText(/luke_decision/)).toBeNull();
    await expect(canvas.queryByText(/Convergence/)).toBeNull();
    await expect(canvas.queryByText(/Inner Sanctum/)).toBeNull();
  },
};

const playerMemorySnapshot = (): RuntimeSnapshot => {
  const snapshot = memorySnapshot() as unknown as { ui: Record<string, unknown> };
  snapshot.ui = { authorView: false, announceTransitions: true, hudEnabled: true };
  return derive(snapshot as unknown as RuntimeSnapshot);
};

export const PlayerMemory: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={playerMemorySnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    await expect(canvas.getByText(/The sun-key opens the inner sanctum\./)).toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: "Exclude" }).length).toBeGreaterThan(0);
    await expect(canvas.queryByText(/Epistemic map/)).toBeNull();
    await expect(canvas.queryByText(/State ledger/)).toBeNull();
    await expect(canvas.queryByText(/hiding from Arin/)).toBeNull();
    await expect(canvas.queryByText(/⤳ superseded/)).toBeNull();
    await expect(canvas.queryByText(/The gate is sealed by dawn wards\./)).toBeNull();
    await expect(canvas.queryByText(/Arcs \(open/)).toBeNull();
  },
};

const backfillSnapshot = (backfill: { running: boolean; processed: number; total: number; lastError: string | null; stoppedNote?: string; preparing?: boolean }): RuntimeSnapshot => {
  const snapshot = playerMemorySnapshot() as unknown as { memory: Record<string, unknown> };
  snapshot.memory = { ...snapshot.memory, backfill };
  return derive(snapshot as unknown as RuntimeSnapshot);
};
type MemorizeManager = RuntimeManager & { memorizeChat: ReturnType<typeof fn>; runMemorizeBacklog: ReturnType<typeof fn>; cancelMemorizeBacklog: ReturnType<typeof fn> };
const memorizeManagerFor = () => ({ ...fakeManager(), memorizeChat: fn(), runMemorizeBacklog: fn(), cancelMemorizeBacklog: fn() }) as unknown as MemorizeManager;
const memorizeManager = memorizeManagerFor();
const stoppedManager = memorizeManagerFor();
const preparingManager = memorizeManagerFor();

export const MemorizePreparing: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs
        snapshot={backfillSnapshot({ running: true, processed: 0, total: 4, lastError: null, preparing: true })}
        manager={preparingManager}
        driver={{ context: null, activeNudge: null, controller: {} as never }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    const button = canvas.getByRole("button", { name: "Preparing…" });
    await expect(button).toBeDisabled();
    await expect(button).not.toHaveClass("text-red-300");
    await expect(canvas.queryByRole("button", { name: "Memorize chat" })).toBeNull();
    await expect(canvas.queryByText(/Memorizing:/)).toBeNull();
    await expect(canvasElement.querySelector("#so-memorize-error")).toBeNull();
    await expect(canvasElement.querySelector("#so-memorize-note")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Stop" }));
    await expect(preparingManager.cancelMemorizeBacklog).toHaveBeenCalledTimes(1);
    await expect(preparingManager.memorizeChat).not.toHaveBeenCalled();
  },
};

export const PlayerStopsMemorizing: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs
        snapshot={backfillSnapshot({ running: true, processed: 1, total: 4, lastError: null })}
        manager={memorizeManager}
        driver={{ context: null, activeNudge: null, controller: {} as never }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    await expect(canvas.getByRole("button", { name: "Memorize chat" })).toBeDisabled();
    await expect(canvas.getByText("Memorizing: 1/4")).toBeInTheDocument();
    const stop = canvas.getByRole("button", { name: "Stop" });
    await expect(stop).toHaveAttribute("id", "so-memorize-stop");
    await userEvent.click(stop);
    await expect(memorizeManager.cancelMemorizeBacklog).toHaveBeenCalledTimes(1);
  },
};

export const MemorizeStopped: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs
        snapshot={backfillSnapshot({ running: false, processed: 1, total: 4, lastError: null, stoppedNote: "Stopped after 1 of 3 parts. What was read is kept; the whole-chat pass did not run." })}
        manager={stoppedManager}
        driver={{ context: null, activeNudge: null, controller: {} as never }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    await expect(canvas.getByRole("button", { name: "Memorize chat" })).toBeEnabled();
    await expect(canvas.queryByRole("button", { name: "Stop" })).toBeNull();
    const note = canvas.getByText(/Stopped after 1 of 3 parts/);
    await expect(note).toHaveAttribute("id", "so-memorize-note");
    await expect(note).not.toHaveClass("text-red-300");
    await expect(canvasElement.querySelector("#so-memorize-error")).toBeNull();
    await expect(canvas.queryByText(/Memorizing:/)).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Memorize chat" }));
    await expect(stoppedManager.memorizeChat).toHaveBeenCalledTimes(1);
    await expect(stoppedManager.runMemorizeBacklog).not.toHaveBeenCalled();
  },
};

export const MemorizeFailed: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs
        snapshot={backfillSnapshot({ running: false, processed: 1, total: 4, lastError: "Response not OK" })}
        manager={fakeManager()}
        driver={{ context: null, activeNudge: null, controller: {} as never }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    const error = canvas.getByText("Memorizing the chat stopped before the end. Try again later.");
    await expect(error).toHaveAttribute("id", "so-memorize-error");
    await expect(error).toHaveClass("so-error-text");
    await expect(canvas.queryByText("Response not OK")).toBeNull();
    await expect(canvasElement.querySelector("#so-memorize-note")).toBeNull();
  },
};

const notConfiguredSnapshot = (): RuntimeSnapshot => {
  const snapshot = playerSnapshot() as unknown as { extraction: { settings: Record<string, unknown> }; pendingDeltas: unknown[] };
  snapshot.extraction = { ...snapshot.extraction, settings: { ...snapshot.extraction.settings, enabled: true, profileId: null } };
  snapshot.pendingDeltas = [];
  return derive(snapshot as unknown as RuntimeSnapshot);
};

export const NotConfigured: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={notConfiguredSnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} onOpenSettings={fn()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/choose a memory model/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Open story settings" })).toBeInTheDocument();
  },
};

// V19: the drawer footer carries the settings panel's tasks. Repair shows only while a step is missing,
// says what the story loses, and lands on the panel's own Repair row.
export const FooterEntryPoints: Story = {
  render: () => {
    const openRepair = fn();
    const newStory = fn();
    (globalThis as { __footer?: unknown }).__footer = { openRepair, newStory };
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={notConfiguredSnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} onOpenRepair={openRepair} onNewStory={newStory} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const calls = (globalThis as unknown as { __footer: { openRepair: ReturnType<typeof fn>; newStory: ReturnType<typeof fn> } }).__footer;
    const repair = canvasElement.querySelector("#so-drawer-repair") as HTMLButtonElement;
    await expect(repair).toBeInTheDocument();
    await expect(repair.textContent).toMatch(/^Repair: /);
    await userEvent.click(repair);
    await expect(calls.openRepair).toHaveBeenCalled();
    await expect(canvasElement.querySelector("#so-drawer-new-story")).toBeNull();
    await expect(calls.newStory).not.toHaveBeenCalled();
  },
};

export const FooterWithoutARepairStep: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={sampleSnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} onOpenRepair={fn()} onNewStory={fn()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-drawer-entry-points")).toBeInTheDocument();
    await expect(canvasElement.querySelector("#so-drawer-new-story")).toBeInTheDocument();
    await expect(canvasElement.querySelector("#so-drawer-repair")).toBeNull();
  },
};

const catchingUpSnapshot = (): RuntimeSnapshot => {
  const snapshot = playerSnapshot() as unknown as { extraction: Record<string, unknown> };
  snapshot.extraction = {
    ...snapshot.extraction,
    reconciliationEvents: [{ id: "r1", boundary: 6, checkpointId: "gate", targetedKeys: ["has_key"], scheduledAt: "t", resolvedAt: null, evidence: [] }],
  };
  return derive(snapshot as unknown as RuntimeSnapshot);
};

export const CatchingUp: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={catchingUpSnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/re-checking recent scenes/)).toBeInTheDocument();
    await expect(canvas.queryByText(/has_key/)).toBeNull();
  },
};

export const Empty: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={emptySnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openTab(canvasElement, "Blackboard");
    await expect(canvas.getByText("No blackboard values yet.")).toBeInTheDocument();
    await openTab(canvasElement, "Payload");
    await expect(canvas.getByText(/No captures yet\./)).toBeInTheDocument();
  },
};

const driftedSnapshot = (): RuntimeSnapshot => {
  const snapshot = sampleSnapshot() as unknown as { storyIdentity: Record<string, unknown> };
  snapshot.storyIdentity = { id: "sun-ruins", pinned: true, drifted: true };
  return derive(snapshot as unknown as RuntimeSnapshot);
};

// The author loop's entry points (plan 05): Edit story and the explicit "take the library's copy"
// are author-view only; Restart is the player's too.
export const AuthorStoryControls: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={driftedSnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} onEditStory={fn()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Edit story" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Update to the latest" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Restart story" })).toBeInTheDocument();
  },
};

export const PlayerStoryControls: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={playerSnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} onEditStory={fn()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Restart story" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Edit story" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: /Update to the latest/ })).toBeNull();
  },
};

const unmetSnapshot = (): RuntimeSnapshot => {
  const snapshot = sampleSnapshot() as unknown as { requirements: Record<string, unknown> };
  snapshot.requirements = { ready: false, missingPersonas: ["Traveller"], missingMembers: ["Arin"], missingLorebooks: ["Sun Ruins Lore"] };
  return derive(snapshot as unknown as RuntimeSnapshot);
};

// "Fix with wizard" (plan 06) replaces the diagnose-only dots: the author gets a step that can
// actually create the missing cast and lore. Author view only — it opens the Studio.
export const FixRequirementsWithWizard: Story = {
  args: { onFixWithWizard: fn() },
  render: (args) => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={unmetSnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} onFixWithWizard={args.onFixWithWizard} />
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Missing: Arin")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Fix with wizard" }));
    await expect(args.onFixWithWizard).toHaveBeenCalled();
  },
};

const boundLoreSnapshot = (): RuntimeSnapshot => {
  const snapshot = sampleSnapshot() as unknown as { requirements: Record<string, unknown> };
  snapshot.requirements = {
    ready: false,
    missingPersonas: [],
    missingMembers: [],
    missingLorebooks: ["Cast Lore"],
    satisfiedBy: { "Sun Ruins Lore": "chat" },
    characterGaps: { "Cast Lore": ["Luke"] },
    slotConflict: { book: "Sun Ruins Lore", kind: "story-book" },
  };
  return derive(snapshot as unknown as RuntimeSnapshot);
};

// Author view names which binding ST scans each required book through, the member a character-bound
// book is missing on, and a file-mode chat slot the memory mirror cannot take.
export const AuthorLoreBindings: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={boundLoreSnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Sun Ruins Lore: chat lorebook")).toBeInTheDocument();
    await expect(canvas.getByText("Cast Lore: not bound to Luke")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="mirror-slot-conflict"]')?.textContent).toContain("Memory mirror not scanned in this chat");
  },
};

// v2.7 02 C1: a story that sets no scenario, in a group whose cards each carry one, is framed by
// every card at once. Author view names them beside the requirements; the player never sees it.
export const AuthorCompetingScenarios: Story = {
  render: () => {
    const snapshot = sampleSnapshot() as unknown as Record<string, unknown>;
    snapshot.competingScenarios = ["Arin", "Luke"];
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={derive(snapshot as unknown as RuntimeSnapshot)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector('[data-so="scenario-competing"]');
    await expect(row?.textContent).toContain("2 character card scenario(s) frame this chat and the story sets none");
    await expect(row?.textContent).toContain("Cards: Arin, Luke");
  },
};

export const PlayerSeesNoCompetingScenarios: Story = {
  render: () => {
    const snapshot = playerSnapshot() as unknown as Record<string, unknown>;
    snapshot.competingScenarios = ["Arin", "Luke"];
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={derive(snapshot as unknown as RuntimeSnapshot)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="scenario-competing"]')).toBeNull();
    await expect(canvasElement.textContent).not.toMatch(/card scenario/i);
  },
};

export const PlayerSeesNoLoreBindings: Story = {
  render: () => {
    const snapshot = playerSnapshot() as unknown as { requirements: Record<string, unknown> };
    snapshot.requirements = {
      ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [],
      satisfiedBy: { "Sun Ruins Lore": "chat" }, slotConflict: { book: "Sun Ruins Lore", kind: "story-book" },
    };
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={derive(snapshot as unknown as RuntimeSnapshot)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="lore-satisfied-by"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-so="mirror-slot-conflict"]')).toBeNull();
  },
};

export const PlayerSeesNoWizardFix: Story = {
  render: () => {
    const snapshot = playerSnapshot() as unknown as { requirements: Record<string, unknown> };
    snapshot.requirements = { ready: false, missingPersonas: [], missingMembers: ["Arin"], missingLorebooks: [] };
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={derive(snapshot as unknown as RuntimeSnapshot)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} onFixWithWizard={fn()} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("The cast is not ready in this chat.")).toBeInTheDocument();
    await expect(canvas.queryByText("Arin")).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Fix with wizard" })).toBeNull();
  },
};

export const FlagMoment: Story = {
  render: () => {
    const manager = fakeManager();
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={playerSnapshot()} manager={manager} driver={{ context: null, activeNudge: null, controller: {} as never }} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Flag this moment"));
    const note = canvas.getByPlaceholderText("What happened here? (optional)");
    await userEvent.type(note, "recap was useless");
    await userEvent.click(canvas.getByRole("button", { name: "Flag" }));
    await expect(canvas.getByLabelText("Flag this moment")).toBeInTheDocument();
  },
};

// V13: the refused-route card says only what the code knows — the turns were read and moved no exit
// — and offers "Generate the road ahead" only where the checkpoint has a stub to expand.
const refusalSnapshot = (canGenerate: boolean): RuntimeSnapshot => ({
  ...sampleSnapshot(),
  agencyRecovery: { checkpointId: "gate", checkpointName: "The Ruined Gate", turns: 2, alternate: "camp", alternateName: "Camp", canGenerate },
});
const refusalManager = () => ({ ...fakeManager(), runExpansionNow: fn(), activateCheckpoint: fn() }) as unknown as RuntimeManager & {
  runExpansionNow: ReturnType<typeof fn>;
  activateCheckpoint: ReturnType<typeof fn>;
};
const authoredExitManager = refusalManager();
const stubManager = refusalManager();

export const RefusedRouteOnAnAuthoredExit: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={refusalSnapshot(false)} manager={authoredExitManager} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openTab(canvasElement, "Scheduler");
    const card = within((await canvas.findByText("Refused route")).closest("[data-so=\"agency-recovery\"]") as HTMLElement);
    await expect(card.getByText(/turns were read, and nothing in them moved an exit of The Ruined Gate/)).toBeInTheDocument();
    await expect(card.queryByText(/narrated on their behalf/)).toBeNull();
    await expect(card.queryByRole("button", { name: "Generate the road ahead" })).toBeNull();
    await userEvent.click(card.getByRole("button", { name: "Take Camp" }));
    await expect(authoredExitManager.activateCheckpoint).toHaveBeenCalledWith("camp");
  },
};

export const RefusedRouteWithARoadToGenerate: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={refusalSnapshot(true)} manager={stubManager} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openTab(canvasElement, "Scheduler");
    const card = within((await canvas.findByText("Refused route")).closest("[data-so=\"agency-recovery\"]") as HTMLElement);
    await userEvent.click(card.getByRole("button", { name: "Generate the road ahead" }));
    await expect(stubManager.runExpansionNow).toHaveBeenCalledTimes(1);
  },
};

const floorSnapshot = (authorView: boolean): RuntimeSnapshot => {
  const snapshot = sampleSnapshot() as unknown as { ui: Record<string, unknown>; rollbackUnavailable: unknown };
  snapshot.ui = { authorView, announceTransitions: true, hudEnabled: true };
  snapshot.rollbackUnavailable = { messageId: 2, checkpointName: "The Ruined Gate", oldest: { boundary: 4, messageId: 7 }, at: "2026-09-24T10:00:00.000Z" };
  return derive(snapshot as unknown as RuntimeSnapshot);
};
const branchFromOldest = fn();

export const AuthorBranchesFromTheOldestRestorablePoint: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={floorSnapshot(true)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} onBranchFromOldest={branchFromOldest} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Oldest restorable point: boundary 4, message 7/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Branch from the oldest restorable point" }));
    await expect(branchFromOldest).toHaveBeenCalledWith(7);
  },
};

export const PlayerNeverSeesTheHistoryFloor: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={floorSnapshot(false)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} onBranchFromOldest={branchFromOldest} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/further than this chat can rewind/)).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Branch from the oldest restorable point" })).toBeNull();
    await expect(canvasElement.querySelector("#so-history-floor")).toBeNull();
  },
};

const FATE_ROWS = [
  ["f-injected", "injected", "The sun-key opens the inner sanctum."],
  ["f-quarantined", "quarantined", "The gate is sealed by dawn wards."],
  ["f-superseded", "superseded", "The key is lost."],
  ["f-folded", "folded", "The key is golden."],
  ["f-other", "other-speaker", "Kael owes Mara a crossing."],
  ["f-over", "over-budget", "The dunes shift at night."],
  ["f-pinned", "pinned-overflow", "The ferryman never lies."],
] as const;

const fateSnapshot = (authorView: boolean): RuntimeSnapshot => {
  const snapshot = memorySnapshot() as unknown as { memory: Record<string, unknown>; ui: Record<string, unknown>; memoryInjection: unknown };
  snapshot.memory = {
    ...snapshot.memory,
    entries: FATE_ROWS.map(([id, , text], index) => ({
      id,
      tier: "facts",
      text,
      type: "fact",
      importance: 2,
      expiration: "permanent",
      entities: [],
      confidence: 1,
      activationTriggers: [],
      evidence: "e",
      createdAt: index,
      recallCount: 0,
    })),
  };
  snapshot.memoryInjection = { fates: Object.fromEntries(FATE_ROWS.map(([id, fate]) => [id, fate])), trim: {} };
  snapshot.ui = { ...snapshot.ui, authorView };
  return derive(snapshot as unknown as RuntimeSnapshot);
};

export const MemoryFates: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={fateSnapshot(true)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    const badges = [...canvasElement.querySelectorAll('[data-so="memory-fate"]')].map((node) => node.getAttribute("data-fate"));
    await expect(badges.sort()).toEqual(FATE_ROWS.map(([, fate]) => fate).sort());
    await expect(canvas.getByText("trimmed: pinned, did not fit")).toBeInTheDocument();
    await expect(canvas.getByText("held out: another speaker's")).toBeInTheDocument();
  },
};

export const PlayerNeverSeesMemoryFates: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={fateSnapshot(false)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    await expect(canvasElement.querySelectorAll('[data-so="memory-fate"]').length).toBe(0);
  },
};

const citedSnapshot = (authorView: boolean): RuntimeSnapshot => {
  const snapshot = memorySnapshot() as unknown as { memory: Record<string, unknown>; ui: Record<string, unknown>; chatJump: unknown };
  snapshot.memory = {
    ...snapshot.memory,
    entries: [{
      id: "cited",
      tier: "facts",
      text: "The ferryman owes the player a crossing.",
      type: "fact",
      importance: 2,
      expiration: "permanent",
      entities: [],
      confidence: 1,
      activationTriggers: [],
      evidence: "e",
      createdAt: 1,
      recallCount: 0,
      provenance: { source: "extractor", messageId: 5, boundary: 3, pass: "shared-read", validity: "live" },
    }],
  };
  snapshot.chatJump = { chatLength: 9, known: { from: 0, to: 8 }, changed: [5] };
  snapshot.ui = { ...snapshot.ui, authorView };
  return derive(snapshot as unknown as RuntimeSnapshot);
};

const jumpFromDrawer = fn();

export const AuthorJumpsFromACitation: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={citedSnapshot(true)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} onJumpToMessage={jumpFromDrawer} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    const jump = canvas.getByRole("button", { name: "message 5 (changed since)" });
    await userEvent.click(jump);
    await expect(jumpFromDrawer).toHaveBeenCalledWith(5);
    await openTab(canvasElement, "Scheduler");
    await expect(canvasElement.querySelector('[data-so="jump-to-message"][data-mesid="6"]')).not.toBeNull();
  },
};

export const PlayerSeesNoJumpButtons: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={citedSnapshot(false)} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} onJumpToMessage={jumpFromDrawer} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openMemoryTab(canvas);
    await expect(canvasElement.querySelectorAll('[data-so="jump-to-message"]').length).toBe(0);
  },
};
