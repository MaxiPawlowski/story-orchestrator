import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { NO_GROUP_NOTICE } from "@runtime/noGroup";
import MakeGroupCard, { MAKE_GROUP_LABEL } from "./MakeGroupCard";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof MakeGroupCard> = {
  title: "Settings/MakeGroupCard",
  component: MakeGroupCard,
  args: {
    view: { notice: NO_GROUP_NOTICE, storyId: "ruins", storyTitle: "The Ruins" },
    wizardOn: true,
    onMakeGroup: fn(async () => ({ ok: true as const, group: "The Ruins", message: "Made the group \"The Ruins\" for \"The Ruins\" and opened it." })),
    onFixWithWizard: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof MakeGroupCard>;

export const MakesAGroup: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(NO_GROUP_NOTICE)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: MAKE_GROUP_LABEL }));
    await expect(args.onMakeGroup).toHaveBeenCalledWith("ruins");
    await expect(await canvas.findByText(/opened it/)).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="make-group-fix"]')).toBeNull();
  },
};

export const NarratorCardMissing: Story = {
  args: {
    onMakeGroup: fn(async () => ({
      ok: false as const, reason: "missing" as const, missing: ["Ruins Narrator"], narrator: "Ruins Narrator",
      message: "The story's narrator card \"Ruins Narrator\" is not on this install, and the story is told through it. A group without them would be a partial cast, so no group was made.",
    })),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: MAKE_GROUP_LABEL }));
    await userEvent.click(await canvas.findByRole("button", { name: "Fix with wizard" }));
    await expect(args.onFixWithWizard).toHaveBeenCalledWith("ruins", ["Ruins Narrator"]);
  },
};

export const WizardOff: Story = {
  args: { ...NarratorCardMissing.args, wizardOn: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: MAKE_GROUP_LABEL }));
    await expect(await canvas.findByRole("button", { name: "Fix with wizard" })).toBeDisabled();
  },
};

const makeGroup = (canvasElement: HTMLElement) => within(canvasElement).getByRole("button", { name: MAKE_GROUP_LABEL });

export const Phone: Story = fitsAt(VIEWPORTS.phone, makeGroup);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, makeGroup);
export const Desktop: Story = fitsAt(VIEWPORTS.wide, makeGroup);
