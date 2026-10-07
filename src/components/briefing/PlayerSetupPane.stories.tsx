import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import { PLAYER_SETUP_COPY } from "@features/playerSetupCopy";
import type { PlayerSetupView } from "@runtime/playerSetup";
import { PlayerSetupPane } from "./PlayerSetupPane";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const view: PlayerSetupView = {
  storyId: "road", pending: true, needsPane: true, fixedName: null,
  player: {
    role: "a hired courier", summary: "You carry a sealed letter across the pass.",
    assumes: ["can ride", "does not know the town's politics"], suggested_description: "Quiet, careful, owes money.",
  },
  current: { avatarId: "max.png", name: "Max" }, personas: [{ avatarId: "max.png", name: "Max" }, { avatarId: "mara.png", name: "Mara" }],
  canCreate: true, record: { pending: true }, lockedName: null, switched: false, injected: true, beforeFirstMessage: true,
  castClash: null, descriptionEmpty: false, injectOff: false,
};

const meta: Meta<typeof PlayerSetupPane> = {
  title: "Briefing/PlayerSetupPane",
  component: PlayerSetupPane,
  args: { view, onChoose: fn(async () => ({ ok: true })) },
};

export default meta;

type Story = StoryObj<typeof PlayerSetupPane>;

export const Choose: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: PLAYER_SETUP_COPY.heading })).toBeVisible();
    await expect(canvas.getByText("a hired courier")).toBeVisible();
    await expect(canvas.queryByText(/Quiet, careful/, { ignore: "textarea, script, style" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: PLAYER_SETUP_COPY.pickButton }));
    await expect(args.onChoose).toHaveBeenCalledWith({ choice: "pick", avatarId: "mara.png" });
    const keep = canvas.getByRole("button", { name: PLAYER_SETUP_COPY.keep("Max") });
    await waitFor(() => expect(keep).toBeEnabled());
    await userEvent.click(keep);
    await expect(args.onChoose).toHaveBeenLastCalledWith({ choice: "keep" });
    await waitFor(() => expect(keep).toBeEnabled());
  },
};

export const Create: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(PLAYER_SETUP_COPY.create));
    const description = canvas.getByLabelText(PLAYER_SETUP_COPY.createDescription) as HTMLTextAreaElement;
    await expect(description.value.startsWith("In this story, {{user}} is a hired courier")).toBe(true);
    await userEvent.type(canvas.getByLabelText(PLAYER_SETUP_COPY.createName), "Rook");
    await userEvent.click(canvas.getByRole("button", { name: PLAYER_SETUP_COPY.createButton }));
    await expect(args.onChoose).toHaveBeenCalledWith({ choice: "create", name: "Rook", description: description.value });
  },
};

export const FixedName: Story = {
  args: { view: { ...view, fixedName: "Mara", personas: [{ avatarId: "mara.png", name: "Mara" }] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(PLAYER_SETUP_COPY.fixed("Mara"))).toBeVisible();
    await expect(canvas.queryByRole("button", { name: PLAYER_SETUP_COPY.keep("Max") })).toBeNull();
    await userEvent.click(canvas.getByText(PLAYER_SETUP_COPY.create));
    await expect(canvas.getByLabelText(PLAYER_SETUP_COPY.createName)).toHaveAttribute("readonly");
  },
};

export const NoCreate: Story = {
  args: { view: { ...view, canCreate: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(PLAYER_SETUP_COPY.noCreate)).toBeVisible();
    await expect(canvas.queryByRole("button", { name: PLAYER_SETUP_COPY.createButton })).toBeNull();
  },
};

export const Settled: Story = {
  args: { view: { ...view, pending: false, record: { pending: false, choice: "keep", avatarId: "max.png", name: "Max" }, lockedName: "Max" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent(PLAYER_SETUP_COPY.playingAs("Max"));
    await expect(canvas.queryByRole("button", { name: PLAYER_SETUP_COPY.keep("Max") })).toBeNull();
  },
};

const pane = (canvasElement: HTMLElement) => canvasElement.querySelector("#so-player-setup");

export const Phone: Story = { ...fitsAt(VIEWPORTS.phone, pane) };
export const Tablet: Story = { ...fitsAt(VIEWPORTS.tablet, pane) };
export const Desktop: Story = { ...fitsAt(VIEWPORTS.wide, pane) };
