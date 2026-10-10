import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { MeanwhileProposal } from "@runtime/agendaProposals";
import type { LifeAuthorView } from "@runtime/lifeSnapshot";
import { CharacterLifePanel } from "./CharacterLifePanel";

const life = (patch: Partial<LifeAuthorView> = {}): LifeAuthorView => ({
  rows: [
    {
      id: "arin", name: "Arin", away: null, mood: "tense",
      relationships: [
        { key: "rel_arin_player_trust", toward: "player", axis: "trust", value: 2, range: [-3, 3] },
        { key: "rel_arin_narrator_respect", toward: "narrator", axis: "respect", value: -1, range: [-3, 3] },
      ],
      agendas: [{ id: "debt", goal: "Repay the smuggler before the festival", done: 1, of: 3, next: "met the smuggler at the docks" }],
    },
    { id: "narrator", name: "DM Narrator", away: null, mood: null, relationships: [], agendas: [] },
  ],
  scopeOverflow: [],
  proposals: [],
  ...patch,
});

const meta: Meta<typeof CharacterLifePanel> = {
  title: "Drawer/CharacterLifePanel",
  component: CharacterLifePanel,
};

export default meta;

type Story = StoryObj<typeof CharacterLifePanel>;

export const FeelingsMoodsAndPlans: Story = {
  args: { life: life() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Character life")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-key="rel_arin_player_trust"]')).toHaveTextContent("trust toward the player: 2 (-3 to 3)");
    await expect(canvasElement.querySelector('[data-key="rel_arin_narrator_respect"]')).toHaveTextContent("respect toward DM Narrator: -1");
    await expect(canvasElement.querySelector('[data-agenda="debt"]')).toHaveTextContent("1 of 3");
    await expect(canvasElement.querySelector('[data-so="life-overflow"]')).toBeNull();
  },
};

export const AwayOverflowAndProposals: Story = {
  args: {
    life: life({
      rows: [{ id: "arin", name: "Arin", away: "docks", mood: "calm", relationships: [], agendas: [] }],
      scopeOverflow: ["rel_arin_player_fear"],
      proposals: [{
        id: "p1", memberId: "arin", agendaId: "debt", text: "Arin counted the coins twice.", public: false, reason: "proposed", sourceWindow: { from: 2, to: 9 }, boundary: 4, status: "proposed",
      }],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Character life")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="life-away"]')).toHaveTextContent("away at docks");
    await expect(canvasElement.querySelector('[data-so="life-overflow"]')).toHaveTextContent("rel_arin_player_fear");
    await expect(canvasElement.querySelector('[data-so="life-proposal"]')).toHaveTextContent("Arin: Arin counted the coins twice.");
    await expect(canvasElement.querySelector('[data-so="life-proposal-accept"]')).toBeNull();
  },
};

const proposal = (patch: Partial<MeanwhileProposal>): MeanwhileProposal => ({
  id: "p1", memberId: "arin", agendaId: "debt", text: "Arin counted the coins twice.", public: false, reason: "proposed", sourceWindow: { from: 2, to: 9 }, boundary: 4, status: "proposed",
  ...patch,
});

export const ReviewMeanwhileProposals: Story = {
  args: {
    onDecide: fn(),
    life: life({
      proposals: [
        proposal({}),
        proposal({ id: "p2", text: "Arin sold the old net at the market.", status: "accepted" }),
        proposal({ id: "p3", text: "Arin asked the harbourmaster for work.", status: "applied", appliedAt: { boundary: 3, messageId: 7 } }),
        proposal({ id: "p4", text: "Arin forgot the debt.", status: "rejected" }),
      ],
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Meanwhile, proposed")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Accept" }));
    await expect(args.onDecide).toHaveBeenCalledWith("p1", "accepted");
    await userEvent.click(canvas.getByRole("button", { name: "Reject" }));
    await expect(args.onDecide).toHaveBeenCalledWith("p1", "rejected");
    const settled = canvasElement.querySelectorAll('[data-so="life-proposal-settled"]');
    await expect(settled).toHaveLength(2);
    await expect(settled[0]).toHaveTextContent("lands at the next reply");
    await expect(settled[1]).toHaveTextContent("in their private notes");
    await expect(canvasElement).not.toHaveTextContent("Arin forgot the debt.");
  },
};
