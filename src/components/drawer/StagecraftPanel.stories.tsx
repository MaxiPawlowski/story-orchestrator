import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import type { CuratorOpRecord, CuratorProposalRecord, StagecraftAcceptMode } from "@stagecraft/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { StagecraftPanel } from "./StagecraftPanel";

const patchOp = (status: CuratorOpRecord["status"] = "pending"): CuratorOpRecord => ({
  op: { kind: "patch", lorebook: "Xentar Checkpoints", comment: "The dawn wards", anchor: "The wards hold || until dawn", replace: "The wards are broken" },
  status,
  message: 'Patch "The dawn wards"',
  before: { content: "The wards hold the gate until dawn.", disabled: false },
});

const proposal = (ops: CuratorOpRecord[], mode: StagecraftAcceptMode = "review"): CuratorProposalRecord => ({
  id: "wi-4-6",
  at: "2026-08-13T10:00:00.000Z",
  boundary: 4,
  messageId: 6,
  checkpointId: "gate",
  reason: "checkpoint",
  summary: "The gate was breached, so the ward entry is out of date.",
  mode,
  ops,
  dropped: ['rewrite: "Sanctum floor" is not an entry this story owns'],
});

const snapshot = (options: { curatorEnabled?: boolean; acceptMode?: StagecraftAcceptMode; scope?: string[]; proposals?: CuratorProposalRecord[]; lastError?: string | null } = {}): RuntimeSnapshot => ({
  stagecraft: {
    settings: { curatorEnabled: options.curatorEnabled ?? true, acceptMode: options.acceptMode ?? "review" },
    proposals: options.proposals ?? [],
    lastRunBoundary: 4,
    lastError: options.lastError ?? null,
  },
  stagecraftScope: options.scope ?? ["Xentar Checkpoints"],
}) as unknown as RuntimeSnapshot;

const fakeManager = (): RuntimeManager => ({ setCuratorOpDecision: fn() }) as unknown as RuntimeManager;

const meta: Meta<typeof StagecraftPanel> = {
  title: "Drawer/StagecraftPanel",
  component: StagecraftPanel,
  render: (args) => <div style={{ maxWidth: 360 }}><StagecraftPanel {...args} /></div>,
  args: { snapshot: snapshot({ proposals: [proposal([patchOp()])] }), manager: fakeManager() },
};

export default meta;

type Story = StoryObj<typeof StagecraftPanel>;

export const AwaitingReview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Watching Xentar Checkpoints · changes wait for you/)).toBeInTheDocument();
    await expect(canvas.getByText(/patch "The dawn wards"/)).toBeInTheDocument();
    await expect(canvas.getByText(/waiting for you/)).toBeInTheDocument();
    await expect(canvas.getByText(/dropped — rewrite: "Sanctum floor"/)).toBeInTheDocument();
  },
};

// Editing before accepting is the whole point of the card: what the author types is what gets sent.
export const EditBeforeAccepting: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("textbox");
    await userEvent.clear(field);
    await userEvent.type(field, "The wards are ash");
    await userEvent.click(canvas.getByRole("button", { name: "Accept" }));
    await expect(args.manager.setCuratorOpDecision).toHaveBeenCalledWith("wi-4-6", 0, "accepted", expect.objectContaining({ replace: "The wards are ash" }));
  },
};

export const Declining: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Decline" }));
    await expect(args.manager.setCuratorOpDecision).toHaveBeenCalledWith("wi-4-6", 0, "rejected");
  },
};

export const Applied: Story = {
  args: { snapshot: snapshot({ proposals: [{ ...proposal([patchOp("applied")]), appliedAt: "2026-08-13T10:05:00.000Z" }] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/written/)).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Accept" })).toBeNull();
  },
};

export const Failed: Story = {
  args: { snapshot: snapshot({ proposals: [proposal([{ ...patchOp("failed"), message: 'the text "The wards hold" is not in this entry' }])], lastError: "profile is gone" }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/is not in this entry/)).toBeInTheDocument();
    await expect(canvas.getByText("profile is gone")).toBeInTheDocument();
  },
};

export const Off: Story = {
  args: { snapshot: snapshot({ curatorEnabled: false }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Turn it on in settings/)).toBeInTheDocument();
  },
};

export const NoAllowlist: Story = {
  args: { snapshot: snapshot({ scope: [] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/lists no lorebook for the curator/)).toBeInTheDocument();
  },
};
