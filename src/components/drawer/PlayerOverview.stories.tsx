import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect } from "@storybook/test";
import { buildNarrativeStatus } from "@runtime/narrative";
import { derivePipelineStatus } from "@runtime/pipeline";
import type { ExtractionRuntimeState, RuntimeSnapshot } from "@runtime/types";
import { PlayerOverview } from "./PlayerOverview";

const extraction = (overrides: Partial<ExtractionRuntimeState> = {}): ExtractionRuntimeState => ({
  settings: { enabled: true, profileId: "p1", cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 0 },
  audits: [],
  reconciliationEvents: [],
  lastReadBoundary: 4,
  scheduler: { queueDepth: 0, inFlight: false, lastError: null },
  judgedReads: [],
  ...overrides,
});

const snapshot = (options: { extraction?: ExtractionRuntimeState; threads?: string[]; pending?: number; missingMembers?: string[]; canon?: string } = {}): RuntimeSnapshot => {
  const pipeline = derivePipelineStatus(options.extraction ?? extraction());
  return {
    requirements: { ready: !options.missingMembers?.length, missingPersonas: [], missingMembers: options.missingMembers ?? [], missingLorebooks: [] },
    pipeline,
    narrative: buildNarrativeStatus({
      storyTitle: "Quest for the Sun Ruins",
      checkpointName: "The Ruined Gate",
      objective: "Breach the sanctum.",
      lastTransition: { fromName: "Camp", toName: "The Ruined Gate" },
      openThreads: options.threads ?? ["The missing sun-heart's true owner"],
      canon: options.canon ?? "The party crossed the dunes and reached the gate at dusk.",
      tensionLevel: "tense",
      pendingCount: options.pending ?? 0,
      pipeline,
    }),
  } as unknown as RuntimeSnapshot;
};

// v2.3 plan 09 fixture: a long session's canon is a paragraph per scene, and the recaps have to stay
// readable when it is. Nothing is truncated — the panel scrolls, the story is not edited.
const LONG_CANON = [
  "The party crossed the singing dunes at dusk, and Arin would not say what she had heard in them.",
  "At the waystation the ferryman took the sun-key from Luke's hand, turned it over twice, and gave it back without a word about the price.",
  "The guild master's warning arrived with the morning caravan: whatever is under the ruins was put there by people who expected it to be found.",
  "They reached the ruined gate as the wards came up, and the wardens let them through the first arch before anyone thought to ask why.",
  "Past the arch the corridor runs down further than the hill it is cut into, which nobody has explained and everybody has stopped mentioning.",
].join("\n");

const LONG_THREADS = Array.from({ length: 12 }, (_, index) => `Open thread ${index + 1}: the question the story has not answered yet.`);

const meta: Meta<typeof PlayerOverview> = {
  title: "Drawer/PlayerOverview",
  component: PlayerOverview,
  args: { onOpenSettings: fn() },
  render: (args) => <div style={{ maxWidth: 360 }}><PlayerOverview {...args} /></div>,
};

export default meta;

type Story = StoryObj<typeof PlayerOverview>;

export const Playing: Story = {
  args: { snapshot: snapshot({ pending: 2 }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("The Ruined Gate")).toBeInTheDocument();
    await expect(canvas.getByText(/You left Camp behind/)).toBeInTheDocument();
    await expect(canvas.getByText("The missing sun-heart's true owner")).toBeInTheDocument();
    await expect(canvas.getByText(/2 things the story picked up/)).toBeInTheDocument();
    await expect(canvas.getByText("Following along.")).toBeInTheDocument();
  },
};

export const LongCanonAndManyThreads: Story = {
  args: { snapshot: snapshot({ canon: LONG_CANON, threads: LONG_THREADS, pending: 4 }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/the corridor runs down further than the hill/)).toBeInTheDocument();
    await expect(canvas.getByText(/At the waystation the ferryman took the sun-key/)).toBeInTheDocument();
    await expect(canvas.getByText("Open thread 12: the question the story has not answered yet.")).toBeInTheDocument();
    await expect(canvas.getByText("The Ruined Gate")).toBeInTheDocument();
  },
};

export const CatchingUp: Story = {
  args: { snapshot: snapshot({ extraction: extraction({ reconciliationEvents: [{ id: "r1", boundary: 6, checkpointId: "gate", targetedKeys: ["has_key"], scheduledAt: "t", resolvedAt: null, evidence: [] }] }) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/re-checking recent scenes/)).toBeInTheDocument();
    await expect(canvas.queryByText(/has_key/)).toBeNull();
  },
};

export const NotConfigured: Story = {
  args: { snapshot: snapshot({ extraction: extraction({ settings: { enabled: true, profileId: null, cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 0 } }) }) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open story settings" }));
    await expect(args.onOpenSettings).toHaveBeenCalledTimes(1);
  },
};

export const SteppedBack: Story = {
  args: { snapshot: { ...snapshot(), lastRollback: { checkpointName: "Investigate the Job Board", at: "2026-08-12T10:00:00.000Z" } } as RuntimeSnapshot },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/The story stepped back to Investigate the Job Board/)).toBeInTheDocument();
  },
};

// E1: an edit the run cannot rewind to. The notice must say the story did NOT move, and the one
// action this surface owns must be reachable by name.
export const EditTooFarBack: Story = {
  args: {
    onReread: fn(),
    snapshot: {
      ...snapshot(),
      rollbackUnavailable: { messageId: 2, checkpointName: "Investigate the Job Board", oldest: { boundary: 4, messageId: 1 }, at: "2026-08-12T10:00:00.000Z" },
    } as RuntimeSnapshot,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/has not moved: you are still at Investigate the Job Board/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Re-read from Investigate the Job Board" }));
    await expect(args.onReread).toHaveBeenCalledTimes(1);
  },
};

export const MissingCast: Story = {
  args: { snapshot: snapshot({ missingMembers: ["Ponticius"] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("This story still needs")).toBeInTheDocument();
    await expect(canvas.getByText(/Cast: Ponticius/)).toBeInTheDocument();
  },
};

// v2.3 plan 07 (C4): the player refused the prepared route twice over. The surface says the world has
// not answered yet and nothing else — no machinery, no counts, and never the compliance that did not
// happen. The author's recovery lives in the author view, which is not rendered here.
export const RefusedRoute: Story = {
  args: {
    snapshot: {
      ...snapshot(),
      narrative: buildNarrativeStatus({
        storyTitle: "Quest for the Sun Ruins",
        checkpointName: "The Duel",
        objective: "Accept the duel or refuse it.",
        lastTransition: null,
        openThreads: [],
        canon: "",
        tensionLevel: "tense",
        pendingCount: 0,
        pipeline: derivePipelineStatus(extraction()),
        agencyNotice: "The story is deciding how the world answers that.",
      }),
    } as RuntimeSnapshot,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("The story is deciding how the world answers that.")).toBeInTheDocument();
    await expect(canvas.queryByText(/refused|route|stall/i)).toBeNull();
  },
};

// A `player_action` objective belongs to the player, so the recap says so in one line — the same
// policy the steering hint and the generation prompt carry.
export const PlayerActionObjective: Story = {
  args: {
    snapshot: {
      ...snapshot(),
      narrative: buildNarrativeStatus({
        storyTitle: "Quest for the Sun Ruins",
        checkpointName: "The Duel",
        objective: "Take the Sun's Heart or leave it.",
        lastTransition: null,
        openThreads: [],
        canon: "",
        tensionLevel: "critical",
        pendingCount: 0,
        pipeline: derivePipelineStatus(extraction()),
        objectiveKind: "player_action",
      }),
    } as RuntimeSnapshot,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("What happens next is yours to decide.")).toBeInTheDocument();
  },
};

// v2.3 plan 06's line, on the surface a player always has open. It was rendered in the away popup and
// /story recap and NOT here, because this component drops the composition's status section and draws
// its own pipeline line — the same defect the agency notice would have had.
export const SaveNotConfirmed: Story = {
  args: {
    snapshot: {
      ...snapshot(),
      narrative: buildNarrativeStatus({
        storyTitle: "Quest for the Sun Ruins",
        checkpointName: "The Ruined Gate",
        objective: "Breach the sanctum.",
        lastTransition: null,
        openThreads: [],
        canon: "",
        tensionLevel: "tense",
        pendingCount: 0,
        pipeline: derivePipelineStatus(extraction()),
        saveNotice: "changes not saved, retrying",
      }),
    } as RuntimeSnapshot,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("changes not saved, retrying")).toBeInTheDocument();
  },
};
