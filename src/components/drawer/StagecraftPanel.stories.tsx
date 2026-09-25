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
  curator: "wi",
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

const snapshot = (options: { curatorEnabled?: boolean; acceptMode?: StagecraftAcceptMode; wardenEnabled?: boolean; scope?: string[]; proposals?: CuratorProposalRecord[]; lastError?: string | null } = {}): RuntimeSnapshot => ({
  stagecraft: {
    settings: { curatorEnabled: options.curatorEnabled ?? true, acceptMode: options.acceptMode ?? "review", wardenEnabled: options.wardenEnabled ?? false, wardenAcceptMode: "review" },
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

// v2.4 plan 06 T17.4: the card shows what the write changes, word by word, and the diff follows the draft.
export const DiffOnPatch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const diff = canvasElement.querySelector('[data-so="curator-diff"]') as HTMLElement;
    await expect(diff).not.toBeNull();
    await expect(diff.querySelector("del")?.textContent).toContain("hold the gate until dawn");
    await expect(diff.querySelector("ins")?.textContent).toContain("are broken");
    const field = canvas.getByRole("textbox");
    await userEvent.clear(field);
    await userEvent.type(field, "The wards are ash");
    await expect(diff.querySelector("ins")?.textContent).toContain("are ash");
  },
};

export const RewriteRefusedPartialView: Story = {
  args: { snapshot: snapshot({ proposals: [{ ...proposal([]), dropped: ["rewrite: only part of this entry was shown; propose a [patch]"] }] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/only part of this entry was shown; propose a \[patch\]/)).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Accept" })).toBeNull();
  },
};

const fuzzyOp: CuratorOpRecord = {
  op: { kind: "patch", lorebook: "Xentar Checkpoints", comment: "The dawn wards", anchor: "wards hold gate || until dawn", replace: "wards are broken", uid: 3 },
  status: "pending",
  message: 'Patch "The dawn wards" (near match, 86%)',
  before: { content: "The wards hold the gate until dawn.", disabled: false, uid: 3 },
  fuzzy: { anchor: "wards hold the gate || until dawn", span: "wards hold the gate until dawn", score: 0.86 },
};

export const FuzzyAnchorShownSpan: Story = {
  args: { snapshot: snapshot({ proposals: [proposal([fuzzyOp])] }), manager: fakeManager() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/near match, 86%: “wards hold the gate until dawn”/)).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="curator-diff"] ins')?.textContent).toContain("are broken");
    await userEvent.click(canvas.getByRole("button", { name: "Accept" }));
    await expect(args.manager.setCuratorOpDecision).toHaveBeenCalledWith("wi-4-6", 0, "accepted", undefined);
  },
};

export const DeclinedDropped: Story = {
  args: { snapshot: snapshot({ proposals: [{ ...proposal([]), dropped: ['rewrite: "The dawn wards" was declined earlier'] }] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/dropped — rewrite: "The dawn wards" was declined earlier/)).toBeInTheDocument();
  },
};

const wardenNote = (status: CuratorOpRecord["status"], message?: string): CuratorProposalRecord => ({
  id: "warden-5-7",
  curator: "warden",
  at: "2026-09-19T10:00:00.000Z",
  boundary: 5,
  messageId: 7,
  checkpointId: "gate",
  reason: "continuity",
  summary: "Mira's reply contradicts an established fact",
  mode: "review",
  ops: [{
    op: {
      kind: "note",
      text: "Continuity: established — The bridge fell in the flood. Keep the next reply consistent with it.",
      facts: ["The bridge fell in the flood."],
      replyMessageId: 7,
      // v2.3 plan 05: the fact list travels as records, so the card can cite the message a truth was
      // read from and hand the author the control that takes them there.
      sources: [
        { id: "m4", text: "The bridge fell in the flood.", provenance: { source: "judge", messageId: 4, boundary: 2, pass: "shared-read", confidence: 0.9, validity: "live" }, conflictingValue: "The bridge is intact (ledger)" },
        { id: "bound:Mira:hp", text: "Mira hp = 5", provenance: { source: "blackboard", messageId: -1, boundary: 0, pass: "blackboard", validity: "live" } },
      ],
    },
    status,
    ...(message ? { message } : {}),
  }],
  dropped: [],
});

export const WardenNoteAwaitingReview: Story = {
  args: { snapshot: snapshot({ wardenEnabled: true, proposals: [wardenNote("pending")] }), manager: fakeManager() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Continuity warden on · notes wait for you/)).toBeInTheDocument();
    await expect(canvas.getByText(/Continuity warden: Mira's reply contradicts an established fact/)).toBeInTheDocument();
    await expect(canvas.getByText("established: The bridge fell in the flood.")).toBeInTheDocument();
    const text = canvas.getByLabelText("Text for continuity note");
    await userEvent.clear(text);
    await userEvent.type(text, "Continuity: the bridge is gone.");
    await userEvent.click(canvas.getByRole("button", { name: "Accept" }));
    await expect(args.manager.setCuratorOpDecision).toHaveBeenCalledWith("warden-5-7", 0, "accepted", expect.objectContaining({ kind: "note", text: "Continuity: the bridge is gone." }));
  },
};

// v2.3 plan 05: the card cites the record, not just the sentence — pass, message, confidence, the
// store that disagrees, and a control that lands on the fact itself.
export const WardenNoteCitesItsSource: Story = {
  args: { snapshot: snapshot({ wardenEnabled: true, proposals: [wardenNote("pending")] }), manager: fakeManager(), onOpenFact: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const origins = [...canvasElement.querySelectorAll('[data-so="warden-fact-origin"]')].map((node) => node.textContent?.trim());
    await expect(origins[0]).toBe("judge · shared-read · message 4 · 90% sure · another store says The bridge is intact (ledger)");
    // A bound field is the blackboard's, and says so rather than offering a memory row that does not exist.
    await expect(origins[1]).toBe("blackboard · blackboard");
    const buttons = canvas.getAllByRole("button", { name: /Show the (fact|blackboard)/ });
    await expect(buttons.map((button) => button.textContent)).toEqual(["Show the fact", "Show the blackboard"]);
    await userEvent.click(buttons[1]);
    await expect(args.onOpenFact).toHaveBeenCalledWith("bound:Mira:hp");
  },
};

export const WardenNoteLapsed: Story = {
  args: { snapshot: snapshot({ wardenEnabled: true, proposals: [wardenNote("rejected", "lapsed")] }), manager: fakeManager() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/lapsed: a newer reply came first/)).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Accept" })).toBeNull();
  },
};

// v2.4 plan 07 T22/T23: one reply, one record, one card per family, each decided on its own.
const familiesNote: CuratorProposalRecord = {
  id: "warden-6-9",
  curator: "warden",
  at: "2026-09-25T10:00:00.000Z",
  boundary: 6,
  messageId: 9,
  checkpointId: "gate",
  reason: "agency+house-rule",
  summary: "Guard's reply writes the player's own part; breaks a house rule",
  mode: "review",
  ops: [
    { op: { kind: "note", family: "agency", text: "Agency: Max's own words and decisions are theirs to write: do not narrate Max acting, accepting, agreeing or refusing.", facts: [], replyMessageId: 9, score: 3.41 }, status: "pending" },
    { op: { kind: "note", family: "house-rule", text: 'House rule: "No character uses a gun." — keep the next reply within it.', facts: [], rules: ["No character uses a gun."], replyMessageId: 9 }, status: "pending" },
  ],
  dropped: [],
};

export const WardenFamiliesAwaitingReview: Story = {
  args: { snapshot: snapshot({ proposals: [familiesNote] }), manager: fakeManager() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Warden: Guard's reply writes the player's own part; breaks a house rule/)).toBeInTheDocument();
    await expect(canvas.getByText(/agency note \(score 3\.41\)/)).toBeInTheDocument();
    await expect(canvas.getByText("house rule: No character uses a gun.")).toBeInTheDocument();
    await expect(canvas.queryByText(/^established:/)).toBeNull();
    await userEvent.click(canvas.getAllByRole("button", { name: "Decline" })[1]);
    await expect(args.manager.setCuratorOpDecision).toHaveBeenCalledWith("warden-6-9", 1, "rejected");
  },
};

