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
  ...overrides,
});

const snapshot = (options: { extraction?: ExtractionRuntimeState; threads?: string[]; pending?: number; missingMembers?: string[] } = {}): RuntimeSnapshot => {
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
      canon: "The party crossed the dunes and reached the gate at dusk.",
      tensionLevel: "tense",
      pendingCount: options.pending ?? 0,
      pipeline,
    }),
  } as unknown as RuntimeSnapshot;
};

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

export const MissingCast: Story = {
  args: { snapshot: snapshot({ missingMembers: ["Ponticius"] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("This story still needs")).toBeInTheDocument();
    await expect(canvas.getByText(/Cast: Ponticius/)).toBeInTheDocument();
  },
};
