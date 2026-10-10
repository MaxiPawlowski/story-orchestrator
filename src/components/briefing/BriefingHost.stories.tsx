import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { composeBriefing } from "@engine/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { BRIEFING_COPY } from "@features/helpCopy";
import { BRIEFING_DRAFT_COPY } from "@features/briefingDraftCopy";
import { BriefingHost, type BriefingHostProps } from "./BriefingHost";

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

const drafted = composeBriefing({ title: "The Road", player_intro: "You carry a sealed letter over the pass." }, [
  { heading: "Where you are", text: "The foot of the pass, the night before the crossing." },
  { heading: "How to play", text: "Write what you do and say; the characters answer." },
]);

const DraftArrives = (props: BriefingHostProps) => {
  const [snapshot, setSnapshot] = useState(props.snapshot);
  useEffect(() => {
    const timer = setTimeout(() => setSnapshot({ ...snapshot, briefing: { storyId: "road", view: drafted, pending: true, enabled: true } } as RuntimeSnapshot), 50);
    return () => clearTimeout(timer);
  }, []);
  return <BriefingHost {...props} snapshot={snapshot} />;
};

export const DraftReplacesTheIntroInTheOpenModal: Story = {
  render: (args) => <DraftArrives {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await canvas.findByRole("dialog", { name: "The Road" });
    await canvas.findByText("The foot of the pass, the night before the crossing.");
    await expect(canvas.queryByText("You carry a sealed letter over the pass.")).toBeNull();
    await expect(canvasElement.querySelector('[data-so="briefing-drafted"]')).toHaveTextContent(BRIEFING_DRAFT_COPY.drafted);
    await expect(dialog).toHaveAttribute("open");
  },
};

export const BlockMidSessionStaysClosed: Story = {
  args: { snapshot: blocking(23) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-briefing")).toBeNull();
  },
};
