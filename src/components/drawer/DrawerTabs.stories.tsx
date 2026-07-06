import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { DrawerTabs } from "./DrawerTabs";

const sampleSnapshot = (): RuntimeSnapshot =>
  ({
    ready: true,
    storyHash: "v2-demo",
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
    convergence: [{ anchorId: "sanctum", anchorName: "Inner Sanctum", progress: 1, threshold: 2, reached: false }],
    tension: { level: "high", smoothed: 0.72, expected: 0.6, hint: null },
    payloadCaptures: [
      { at: "2026-07-06T12:00:00.000Z", boundary: 6, reason: "generation", blocks: [
        { key: "story_orchestrator_memory_facts", depth: 4, role: 0, value: "The sun-key opens the inner sanctum." },
        { key: "story_orchestrator_pacing", depth: 2, role: 0, value: "Raise the stakes toward the sanctum." },
      ] },
    ],
  }) as unknown as RuntimeSnapshot;

const fakeManager = (): RuntimeManager =>
  ({
    getLedger: () => [],
    editMemoryEntry: fn(),
    setMemoryPinned: fn(),
    excludeMemoryEntry: fn(),
    setMemorySettings: fn(),
    setEpistemicLedgerCapable: fn(),
    setEpistemicPinned: fn(),
    removeEpistemicEntry: fn(),
    setArcPinned: fn(),
    removeArc: fn(),
    removeLedgerEntry: fn(),
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
  return snapshot as unknown as RuntimeSnapshot;
};

const emptySnapshot = (): RuntimeSnapshot => {
  const snapshot = sampleSnapshot() as unknown as { blackboard: Record<string, unknown>; blackboardMeta: Record<string, unknown>; payloadCaptures: unknown[]; convergence: unknown[]; extraction: { audits: unknown[] } };
  snapshot.blackboard = {};
  snapshot.blackboardMeta = {};
  snapshot.payloadCaptures = [];
  snapshot.convergence = [];
  snapshot.extraction = { ...snapshot.extraction, audits: [] };
  return snapshot as unknown as RuntimeSnapshot;
};

const ledgerManager = (): RuntimeManager =>
  ({
    ...fakeManager(),
    getLedger: () => [
      { entity: "Sphinx", field: "mood", value: "watchful", bound: false },
      { entity: "Sphinx", field: "respect", value: "2", bound: true },
    ],
  }) as unknown as RuntimeManager;

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
      <DrawerTabs snapshot={memorySnapshot()} manager={ledgerManager()} driver={{ context: null, activeNudge: null, controller: {} as never }} />
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
