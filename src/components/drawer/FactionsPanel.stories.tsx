import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import type { FactionAuthorView } from "@runtime/factionSnapshot";
import { FactionsPanel } from "./FactionsPanel";

const factions = (patch: Partial<FactionAuthorView> = {}): FactionAuthorView => ({
  rows: [
    {
      id: "guild", name: "The Guild", value: -2, range: [-5, 5], band: "Wary", visible: true, members: ["Mara"],
      moves: [
        { id: "stole", add: -2, heardBy: "present", boundary: 4, messageId: 9 },
        { id: "saved", add: 2, heardBy: "faction", boundary: null, messageId: null },
      ],
      ledger: ["hostility_level: tense"],
    },
    { id: "crown", name: "The Crown", value: 0, range: [-5, 5], band: "Neutral", visible: false, members: [], moves: [], ledger: [] },
  ],
  scopeOverflow: [],
  ...patch,
});

const meta: Meta<typeof FactionsPanel> = {
  title: "Drawer/FactionsPanel",
  component: FactionsPanel,
};

export default meta;

type Story = StoryObj<typeof FactionsPanel>;

export const StandingMovesAndMembers: Story = {
  args: { factions: factions() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Factions")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-faction="guild"] [data-so="faction-value"]')).toHaveTextContent("-2");
    await expect(canvasElement.querySelector('[data-move="stole"]')).toHaveTextContent("fired at turn 4, message 9");
    await expect(canvasElement.querySelector('[data-move="saved"]')).toHaveTextContent("not yet");
    await expect(canvasElement.querySelector('[data-faction="crown"] [data-so="faction-hidden"]')).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="faction-ledger"]')).toHaveTextContent("hostility_level: tense");
  },
};

export const Overflow: Story = {
  args: { factions: factions({ rows: [], scopeOverflow: ["apprentice_saved"] }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="faction-overflow"]')).toHaveTextContent("apprentice_saved");
  },
};
