import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import type { ChapterRecord } from "@memory/types";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { ChaptersPanel } from "./ChaptersPanel";

const record = (id: string, patch: Partial<ChapterRecord> = {}): ChapterRecord => ({
  id, chapterId: id, part: 1, title: "Arrival at Harrowgate", playerTitle: "Arrival", range: { from: 0, to: 14 }, boundaries: { from: 0, to: 6 },
  checkpoints: ["gate", "market"], summary: "Mara and Kael reached Harrowgate at dusk. Kael lost his sword at the gate.", short: "They arrived; Kael came away unarmed.",
  consequences: [{ text: "Kael is unarmed", sources: ["f1"] }], people: [{ rosterId: "kael", name: "Kael", text: "unarmed and sullen" }],
  open: [{ arcId: "a1", text: "Find the quartermaster", disposition: "carry" }], blackboardDelta: {}, blackboardAt: {}, status: "sealed",
  provenance: { source: "code" } as ChapterRecord["provenance"], tokens: { summary: 180, short: 14 }, sealedAt: { boundary: 6, messageId: 14, at: 0, pathLength: 3 }, ...patch,
});

const snapshot = (records: ChapterRecord[]): RuntimeSnapshot => ({
  memory: { chapters: records },
  chapters: { declared: true, current: { id: "siege", number: 2, playerTitle: "The Siege", interlude: false }, records: [], ended: false, epilogue: null },
}) as unknown as RuntimeSnapshot;

const fakeManager = () => ({
  chapters: { editSummary: fn(async () => true), reseal: fn(async () => null), unseal: fn(async () => true), sealNow: fn(async () => null) },
}) as unknown as RuntimeManager;

const meta: Meta<typeof ChaptersPanel> = {
  title: "Drawer/ChaptersPanel",
  component: ChaptersPanel,
  render: (args) => <div style={{ maxWidth: 360 }}><ChaptersPanel {...args} /></div>,
  args: { snapshot: snapshot([record("arrival")]), confirm: fn(async () => true) },
};

export default meta;

type Story = StoryObj<typeof ChaptersPanel>;

export const Sealed: Story = {
  args: { manager: fakeManager() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Now: The Siege")).toBeInTheDocument();
    await expect(canvas.getByText("sealed")).toBeInTheDocument();
    await expect(canvas.getByText(/Kael is unarmed/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Re-seal" })).toBeInTheDocument();
  },
};

export const EditSummary: Story = {
  args: { manager: fakeManager() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Edit summary" }));
    const field = canvas.getByLabelText("Summary");
    await userEvent.clear(field);
    await userEvent.type(field, "Kael kept his sword after all.");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.manager.chapters.editSummary).toHaveBeenCalledWith("arrival", "Kael kept his sword after all.", "They arrived; Kael came away unarmed."));
  },
};

export const ResealAsksFirst: Story = {
  args: { manager: fakeManager(), snapshot: snapshot([record("arrival", { status: "author-edited" })]) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("edited by you")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Re-seal" }));
    await waitFor(() => expect(args.confirm).toHaveBeenCalledWith(expect.stringContaining("replaces the summary you edited")));
    await waitFor(() => expect(args.manager.chapters.reseal).toHaveBeenCalledWith("arrival"));
  },
};

export const NothingSealedYet: Story = {
  args: { manager: fakeManager(), snapshot: snapshot([]) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No chapter sealed yet.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Seal now" }));
    await waitFor(() => expect(args.manager.chapters.sealNow).toHaveBeenCalled());
  },
};
