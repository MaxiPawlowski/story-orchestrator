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

export const LabelsAndWhyThisNumber: Story = {
  args: {
    life: life({
      labels: [{
        member: "arin", toward: "player", shown: "wary",
        public: [
          { label: "wary", gate: null, holds: true, follows: false, hold: null },
          { label: "warming to you", gate: "shared_meal == true", holds: false, follows: false, hold: null },
        ],
        secrets: [
          { id: "loyal", label: "secretly loyal to you", gate: "saw_letter == true", boundary: 4, messageId: 9 },
          { id: "debt", label: "owes you a debt", gate: "paid_debt == true", boundary: null, messageId: null },
        ],
      }],
      history: {
        rel_arin_player_trust: [
          { boundary: 2, messageId: 5, from: 0, to: 1, evidence: "Arin smiles as you share the bread" },
          { boundary: 4, messageId: 9, from: 1, to: 2, evidence: null },
        ],
      },
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Character life")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="life-label"]')).toHaveTextContent("shown “wary”");
    await expect(canvasElement.querySelector('[data-so="life-label-secret"][data-revealed="true"]')).toHaveTextContent("revealed at boundary 4, message 9");
    await expect(canvasElement.querySelector('[data-so="life-label-secret"][data-revealed="false"]')).toHaveTextContent("not revealed");
    await userEvent.click(canvas.getByText("why this number"));
    await expect(canvasElement.querySelectorAll('[data-so="life-axis-step"]')).toHaveLength(2);
    await expect(canvasElement.querySelector('[data-so="life-axis-step"]')).toHaveTextContent("Arin smiles as you share the bread");
  },
};

export const PromisesToThePlayer: Story = {
  args: {
    life: life({
      commitments: [
        { member: "arin", id: "gate", what: "get past the north gate together", state: "made", at: 2, overdue: true, heard: true },
        { member: "arin", id: "debt", what: "repay the debt from the river", state: "kept", at: 5, overdue: false, heard: true },
        { member: "arin", id: "ledger", what: "hide the ledger until the fair", state: "waiting", at: null, overdue: false, heard: false },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("Character life")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="life-commitment"][data-state="made"]')).toHaveTextContent("made at boundary 2 · overdue");
    await expect(canvasElement.querySelector('[data-so="life-commitment"][data-state="kept"]')).toHaveTextContent("kept at boundary 5");
    await expect(canvasElement.querySelector('[data-so="life-commitment"][data-state="waiting"]')).toHaveTextContent("not made yet · out of the player's hearing");
  },
};

export const ReactiveCues: Story = {
  args: {
    life: life(),
    cues: {
      rows: [
        { member: "arin", key: "cue:arin:ledger", kind: "reaction", lane: "may", text: "the stolen ledger is back", latchedAt: 3, landedAt: null, offers: 1 },
        { member: "arin", key: "cue:arin:warn", kind: "remark", lane: "must", text: "the guild is hunting the thief", latchedAt: null, landedAt: 5, offers: 2 },
      ],
      previews: [{ member: "arin", winner: "cue:arin:market", tiedWith: ["cue:arin:dock"], ranked: ["cue:arin:market", "cue:arin:dock"],
        dropped: [{ key: "cue:arin:secret", reason: "held-secret" }] }],
      receipts: [],
      lapses: [{ key: "norm:steel:arin", recipient: "arin", at: 6, reason: "recipient-away", defRev: "d", source: { kind: "norm", normId: "steel", member: "arin" } }],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("Character life")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="life-cue"][data-lane="must"]')).toHaveTextContent("landed at boundary 5");
    await expect(canvasElement.querySelector('[data-so="life-cue-next"]')).toHaveTextContent("tied with cue:arin:dock (declaration order decides)");
    await expect(canvasElement.querySelector('[data-so="life-cue-next"]')).toHaveTextContent("cue:arin:secret (held-secret)");
    await expect(canvasElement.querySelector('[data-so="life-cue-lapse"]')).toHaveTextContent("lapsed: norm:steel:arin (recipient-away)");
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

export const StoryTime: Story = {
  args: {
    life: life({ clock: { time: 13, label: "3rd of Seedtide, afternoon", move: { boundary: 7, messageId: 14, from: 5, to: 13, writer: "checkpoint" } } }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Character life")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="life-clock"]')).toHaveTextContent("Story time: 3rd of Seedtide, afternoon (story_time 13)");
    await expect(canvasElement.querySelector('[data-so="life-clock-move"]')).toHaveTextContent("moved 5 → 13 by a checkpoint at message 14, boundary 7");
  },
};

export const NoClock: Story = {
  args: { life: life({ clock: null }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Character life")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="life-clock"]')).toBeNull();
  },
};
