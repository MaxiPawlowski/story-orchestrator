import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { buildNarrativeStatus } from "@runtime/narrative";
import { derivePipelineStatus } from "@runtime/pipeline";
import type { ExtractionRuntimeState, RuntimeSnapshot } from "@runtime/types";
import { PlayerNow } from "./PlayerNow";

const extraction = {
  settings: { enabled: true, profileId: "p1", cadence: 3, stabilityLag: 0 }, audits: [], reconciliationEvents: [], lastReadBoundary: 4,
  scheduler: { queueDepth: 0, inFlight: false, lastError: null }, judgedReads: [],
} as unknown as ExtractionRuntimeState;
const pipeline = derivePipelineStatus(extraction);

const snapshot = {
  pipeline,
  narrative: buildNarrativeStatus({
    storyTitle: "Quest for the Sun Ruins", checkpointName: "The Ruined Gate", objective: "Breach the sanctum.",
    lastTransition: { fromName: "The Camp", toName: "The Ruined Gate" }, openThreads: ["Who left the gate open"], canon: "",
    tensionLevel: "tense", pendingCount: 0, pipeline, quests: ["Find more lamp oil"],
  }),
} as unknown as RuntimeSnapshot;

const meta: Meta<typeof PlayerNow> = { title: "Drawer/PlayerNow", component: PlayerNow, args: { snapshot } };
export default meta;
type Story = StoryObj<typeof PlayerNow>;

export const Now: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("You left the Camp behind and moved into the Ruined Gate.")).toBeInTheDocument();
    await expect(canvas.getByText("Who left the gate open")).toBeInTheDocument();
    await expect(canvas.getByText("Find more lamp oil")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-section="now"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-section="status"]')).toBeNull();
  },
};

export const QuestsLiveInTheJournal: Story = {
  args: { journalShown: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText("Find more lamp oil")).toBeNull();
  },
};
