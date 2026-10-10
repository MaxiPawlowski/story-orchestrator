import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { LivingAuthorView, LivingProposalRow } from "@runtime/livingSnapshot";
import { LivingPanel } from "./LivingPanel";

const row = (patch: Partial<LivingProposalRow> = {}): LivingProposalRow => ({
  id: "liv_p2", status: "proposed", name: "The Cold Quay", objective: "A quay lantern goes dark while the harbourmaster watches.", reason: "the lantern thread is still open",
  issues: [], frontierId: "liv_1", anchorId: "liv_2", buildsOn: null, autonomy: "suggest", stale: false, at: "2026-10-10T10:00:00Z", branch: null,
  ...patch,
});

const view = (patch: Partial<LivingAuthorView> = {}): LivingAuthorView => ({
  living: true, branching: true, enabled: true, autonomy: "suggest", horizon: 1, frontierId: "liv_1", generated: 2, reachedGenerated: 1, chapters: 1, ops: 6, folded: 0, passes: 2,
  proposals: [row()],
  ...patch,
});

const actions = () => ({
  decide: fn(async () => true),
  regenerate: fn(async () => null),
  runNow: fn(async () => null),
  save: fn(async () => ({ ok: true, title: "Lantern Coast (played)", excluded: 1 })),
});

const meta: Meta<typeof LivingPanel> = {
  title: "Drawer/LivingPanel",
  component: LivingPanel,
};

export default meta;

type Story = StoryObj<typeof LivingPanel>;

export const SuggestAcceptRejectRegenerate: Story = {
  args: { view: view(), canSave: true, actions: actions() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Living story")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="living-summary"]')).toHaveTextContent("suggests, you decide");
    await expect(canvasElement.querySelector('[data-so="living-proposal"]')).toHaveTextContent("waiting for you");
    await userEvent.click(canvas.getByRole("button", { name: "Accept" }));
    await expect(args.actions?.decide).toHaveBeenCalledWith("liv_p2", "accepted");
    await userEvent.click(canvas.getByRole("button", { name: "Reject" }));
    await expect(args.actions?.decide).toHaveBeenCalledWith("liv_p2", "rejected");
    await userEvent.click(canvas.getByRole("button", { name: "Write it again" }));
    await expect(args.actions?.regenerate).toHaveBeenCalledWith("liv_p2");
    await userEvent.click(canvas.getByRole("button", { name: "Write the next turning point now" }));
    await expect(args.actions?.runNow).toHaveBeenCalled();
  },
};

export const EditBeforeAccepting: Story = {
  args: { view: view(), canSave: true, actions: actions() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Edit" }));
    const name = canvas.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "The Dark Quay");
    await userEvent.click(canvas.getByRole("button", { name: "Accept edited" }));
    await expect(args.actions?.decide).toHaveBeenCalledWith("liv_p2", "accepted", { name: "The Dark Quay", objective: "A quay lantern goes dark while the harbourmaster watches." });
  },
};

export const BranchExplainsWhy: Story = {
  args: {
    view: view({
      living: false, frontierId: null, generated: 0, reachedGenerated: 0, chapters: 0, autonomy: "auto",
      proposals: [row({
        id: "liv_p1", status: "applied", name: "The Long Way Round", frontierId: "mill", anchorId: "liv_b1_way", autonomy: "auto",
        branch: { why: "the player twice did something none of the ways on fit", prepared: false, convergeTo: "ford", fromName: "The Mill", toName: "The Ford" },
      }), row({
        id: "liv_p2", status: "applied", name: "Along the Weir", frontierId: "ford", anchorId: "liv_b2_way", autonomy: "auto",
        branch: { why: "prepared ahead", prepared: true, convergeTo: "sluice", fromName: "The Ford", toName: "The Sluice" },
      })],
    }),
    canSave: false,
    actions: actions(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Story branches")).toBeInTheDocument();
    const why = canvasElement.querySelectorAll('[data-so="living-branch-why"]');
    await expect(why[0]).toHaveTextContent("The story branched because the player twice did something none of the ways on fit");
    await expect(why[0]).toHaveTextContent("rejoins at The Ford");
    await expect(why[1]).toHaveTextContent("Prepared ahead: one more way forward from here");
    await expect(canvas.queryByRole("button", { name: "Accept" })).toBeNull();
    await expect(canvasElement.querySelector("#so-living-run")).toBeNull();
    await expect(canvasElement.querySelector("#so-living-author-save")).toBeNull();
  },
};

export const StaleAndFailed: Story = {
  args: {
    view: view({
      enabled: false,
      proposals: [row({ stale: true }), row({ id: "liv_p1", status: "failed", name: "", objective: "", reason: "malformed", issues: ["the reply did not parse"] })],
    }),
    canSave: true,
    actions: actions(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("out of date", { exact: false })).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="living-issues"]')).toHaveTextContent("the reply did not parse");
    await expect(canvas.getByRole("button", { name: "Write the next turning point now" })).toBeDisabled();
    const again = canvas.getAllByRole("button", { name: "Write it again" });
    await expect(again).toHaveLength(1);
    await userEvent.click(again[0] as HTMLElement);
    await expect(args.actions?.regenerate).toHaveBeenCalledWith("liv_p1");
  },
};

export const AuthorSaveKeepsUnreached: Story = {
  args: { view: view({ proposals: [] }), canSave: true, actions: actions() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Nothing written yet.")).toBeInTheDocument();
    await userEvent.click(canvas.getByLabelText("Keep turning points nobody reached"));
    await userEvent.click(canvas.getByRole("button", { name: "Save as story" }));
    await expect(args.actions?.save).toHaveBeenCalledWith(true);
    await expect(await canvas.findByText("Saved “Lantern Coast (played)” to the library.", { exact: false })).toBeInTheDocument();
  },
};
