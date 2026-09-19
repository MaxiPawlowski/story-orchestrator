import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import { buildNarrativeStatus } from "@runtime/narrative";
import { derivePipelineStatus } from "@runtime/pipeline";
import type { ExtractionRuntimeState, RuntimeSnapshot } from "@runtime/types";
import { DrawerTabs } from "./DrawerTabs";

// The narrative and pipeline slices are derived, never hand-written: a story that faked them
// could pass while the real composition is broken.
const derive = (snapshot: RuntimeSnapshot): RuntimeSnapshot => {
  const pipeline = derivePipelineStatus(snapshot.extraction as ExtractionRuntimeState);
  return {
    ...snapshot,
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
    storyIdentity: { id: "sun-ruins", playedVersion: 1, libraryVersion: 1, pinned: true, drifted: false },
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
      settings: { enabled: true, profileId: "p1", cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 1 },
      audits: [{ id: "a12", reason: "cadence", prompt: "p", rawResponse: "r", scope: ["has_key", "trap_state"], acceptedDeltas: [], rejected: [], window: { from: 0, to: 6 }, createdAt: "t", priority: 1, contractHash: "h" }],
      reconciliationEvents: [],
      lastReadBoundary: 5,
      scheduler: { queueDepth: 0, inFlight: false, lastError: null },
    },
    expansion: { entries: {}, scheduler: { queueDepth: 0, inFlight: false, lastError: null } },
    memory: {
      entries: [
        { id: "m1", tier: "facts", text: "The sun-key opens the inner sanctum.", type: "fact", importance: 3, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: "e", createdAt: 1, recallCount: 2, pinned: true },
      ],
      excluded: [],
      writeLog: [],
      settings: { enabled: true, epistemicLedgerCapable: true, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierBudgets: { facts: 0, session_details: 0, short_term: 0, scene_history: 0 }, tierTokenBudgets: { facts: 0, session_details: 0, short_term: 0, scene_history: 0 } },
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
  }) as unknown as RuntimeSnapshot);

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
    applyStoryUpdate: fn(),
    setCuratorOpDecision: fn(),
  }) as unknown as RuntimeManager;

const memorySnapshot = (): RuntimeSnapshot => {
  const snapshot = sampleSnapshot() as unknown as { memory: Record<string, unknown> };
  snapshot.memory = {
    ...snapshot.memory,
    entries: [
      { id: "m1", tier: "facts", text: "The sun-key opens the inner sanctum.", type: "fact", importance: 3, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: "e", createdAt: 1, recallCount: 2, pinned: true },
      { id: "m2", tier: "facts", text: "The gate is sealed by dawn wards.", type: "fact", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: "e", createdAt: 2, recallCount: 0, supersededBy: "m1" },
      { id: "m3", tier: "session_details", text: "Arin sprained her wrist on the dunes.", type: "event", importance: 2, expiration: "session", entities: [], confidence: 1, activationTriggers: [], evidence: "e", createdAt: 3, recallCount: 1, contradicted: true },
      { id: "m4", tier: "scene_history", text: "Crossed the singing dunes at dusk.", type: "scene", importance: 1, expiration: "scene", entities: [], confidence: 1, activationTriggers: [], evidence: "e", createdAt: 4, recallCount: 0 },
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

const emptySnapshot = (): RuntimeSnapshot => {
  const snapshot = sampleSnapshot() as unknown as { blackboard: Record<string, unknown>; blackboardMeta: Record<string, unknown>; payloadCaptures: unknown[]; convergence: unknown[]; extraction: { audits: unknown[] } };
  snapshot.blackboard = {};
  snapshot.blackboardMeta = {};
  snapshot.payloadCaptures = [];
  snapshot.convergence = [];
  snapshot.extraction = { ...snapshot.extraction, audits: [] };
  return derive(snapshot as unknown as RuntimeSnapshot);
};

const meta: Meta<typeof DrawerTabs> = {
  title: "Drawer/DrawerTabs",
  component: DrawerTabs,
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <DrawerTabs snapshot={sampleSnapshot()} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
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
    await userEvent.click(canvas.getByRole("tab", { name: "Blackboard" }));
    await expect(canvas.getByText("has_key")).toBeInTheDocument();
    await expect(canvas.getByText("guardian_respect")).toBeInTheDocument();
  },
};

export const Scheduler: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Scheduler" }));
    await expect(canvas.getByText("Extraction")).toBeInTheDocument();
    await expect(canvas.getByText("Expansion")).toBeInTheDocument();
    await expect(canvas.getByText("Stall re-checks")).toBeInTheDocument();
    await expect(canvas.getByText("World Info curator")).toBeInTheDocument();
    await expect(canvas.getByText(/Watching Xentar Checkpoints/)).toBeInTheDocument();
  },
};

export const Payload: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Payload" }));
    await expect(canvas.getByText("story_orchestrator_memory_facts")).toBeInTheDocument();
    await expect(canvas.getByText(/@depth 4/)).toBeInTheDocument();
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
    await userEvent.click(canvas.getByRole("tab", { name: "Memory" }));
    await expect(canvas.getByText(/Facts \(2\)/)).toBeInTheDocument();
    await expect(canvas.getByText(/The sun-key opens the inner sanctum\./)).toBeInTheDocument();
    await expect(canvas.getByText("⤳ superseded")).toBeInTheDocument();
    await expect(canvas.getByText("⚠ contradicted")).toBeInTheDocument();
    await expect(canvas.getByText(/Arcs \(open 1 · resolved 1\)/)).toBeInTheDocument();
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
    verifyDrops: [{ entry: { id: "d1", tier: "facts", text: "Arin killed the sphinx.", type: "fact", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: "e", createdAt: 5, recallCount: 0, messageId: 4 }, p: 0.04, at: "2026-09-19T00:00:00.000Z", model: "jev-1.13.0" }],
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
    await userEvent.click(canvas.getByRole("tab", { name: "Memory" }));
    await userEvent.click(canvas.getByText(/Not stored — no support in the chat \(1\)/));
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
    await userEvent.click(canvas.getByRole("tab", { name: "Memory" }));
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
    snapshot.loreForced = { at: "2026-09-19T00:00:00.000Z", boundary: 6, messageId: 9, use: "lore", model: "jev-1.13.0", latencyMs: 912, stateChars: 900, questionCount: 64, p: { trigger: "MESSAGE_SENT", "NPC - Ellie": 0.91, "Lore - Adventurer Rank": 0.84 } };
    return (
      <div style={{ maxWidth: 360 }}>
        <DrawerTabs snapshot={snapshot as unknown as RuntimeSnapshot} manager={fakeManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Payload" }));
    const forced = within(await canvas.findByText("Lore forced this turn").then((node) => node.closest("[data-so=\"lore-forced\"]") as HTMLElement));
    await expect(forced.getByText(/message 9 · MESSAGE_SENT · 912 ms/)).toBeInTheDocument();
    await expect(forced.getByText("NPC - Ellie")).toBeInTheDocument();
    await expect(forced.getByText("91%")).toBeInTheDocument();
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
    await userEvent.click(canvas.getByRole("tab", { name: "Memory" }));
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

const catchingUpSnapshot = (): RuntimeSnapshot => {
  const snapshot = playerSnapshot() as unknown as { extraction: Record<string, unknown> };
  snapshot.extraction = { ...snapshot.extraction, reconciliationEvents: [{ id: "r1", boundary: 6, checkpointId: "gate", targetedKeys: ["has_key"], scheduledAt: "t", resolvedAt: null, evidence: [] }] };
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
    await userEvent.click(canvas.getByRole("tab", { name: "Blackboard" }));
    await expect(canvas.getByText("No blackboard values yet.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Payload" }));
    await expect(canvas.getByText(/No captures yet\./)).toBeInTheDocument();
  },
};

const driftedSnapshot = (): RuntimeSnapshot => {
  const snapshot = sampleSnapshot() as unknown as { storyIdentity: Record<string, unknown> };
  snapshot.storyIdentity = { id: "sun-ruins", playedVersion: 1, libraryVersion: 3, pinned: true, drifted: true };
  return derive(snapshot as unknown as RuntimeSnapshot);
};

// The author loop's entry points (plan 05): Edit story and the explicit "take the newer version"
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
    await expect(canvas.getByRole("button", { name: "Update to v3" })).toBeInTheDocument();
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
    await expect(canvas.queryByRole("button", { name: /Update to v/ })).toBeNull();
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
    await expect(canvas.getByText("Cast: Arin")).toBeInTheDocument();
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
