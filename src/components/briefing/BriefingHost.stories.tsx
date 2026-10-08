import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { composeBriefing } from "@engine/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { BRIEFING_COPY } from "@features/helpCopy";
import { BriefingHost } from "./BriefingHost";

const view = composeBriefing({ title: "The Road", player_intro: "You carry a sealed letter over the pass." });

const snapshotWith = (pending: boolean, enabled = true) => ({
  ready: true, storyId: "road", ui: { authorView: false },
  extraction: { settings: { enabled: true, profileId: "memory" } },
  briefing: { storyId: "road", view, pending, enabled },
}) as unknown as RuntimeSnapshot;

const meta: Meta<typeof BriefingHost> = {
  title: "Briefing/BriefingHost",
  component: BriefingHost,
  args: { snapshot: snapshotWith(true), setUi: fn(), onboardingSeen: () => false, markOnboardingSeen: fn() },
};

export default meta;

type Story = StoryObj<typeof BriefingHost>;

export const OpensOnActivation: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("dialog", { name: "The Road" });
    await expect(canvas.getByText("You carry a sealed letter over the pass.")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="briefing-onboarding"]')).not.toBeNull();
    await userEvent.click(canvas.getByLabelText(BRIEFING_COPY.optOut));
    await userEvent.click(canvas.getByRole("button", { name: "Begin" }));
    await expect(args.setUi).toHaveBeenCalledWith({ briefingSeen: true, briefing: false });
    await expect(args.markOnboardingSeen).toHaveBeenCalled();
  },
};

export const AlreadySeen: Story = {
  args: { snapshot: snapshotWith(false) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-briefing")).toBeNull();
  },
};

export const SwitchedOff: Story = {
  args: { snapshot: snapshotWith(true, false) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-briefing")).toBeNull();
  },
};

const blocking = (boundary: number) => ({
  ...snapshotWith(true, false), boundary,
  requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
  extraction: { settings: { enabled: true, profileId: null } },
}) as unknown as RuntimeSnapshot;

export const BlockBeforeFirstReplyOpensAndCloses: Story = {
  args: { snapshot: blocking(0) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("dialog", { name: BRIEFING_COPY.beforeYouStart });
    await userEvent.click(canvas.getByRole("button", { name: BRIEFING_COPY.close }));
    await expect(canvasElement.querySelector("#so-briefing")).toBeNull();
  },
};

export const BlockMidSessionStaysClosed: Story = {
  args: { snapshot: blocking(23) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-briefing")).toBeNull();
  },
};
