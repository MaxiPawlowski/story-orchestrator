import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import { authorGuideDoc } from "@features/guideLinks";
import { GUIDE_COPY } from "@features/helpCopy";
import type { GuideTopicId } from "@copilot/guideTopics";
import StudioGuideDialog from "./StudioGuideDialog";

const DEEP_TOPIC: GuideTopicId = "living-cards";

const Opener: React.FC<{ doc: string }> = ({ doc }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="menu_button" onClick={() => setOpen(true)}>Open the guide</button>
      {open && <StudioGuideDialog doc={doc} onClose={() => setOpen(false)} />}
    </>
  );
};

const meta: Meta<typeof Opener> = {
  title: "Studio/StudioGuideDialog",
  component: Opener,
  args: { doc: authorGuideDoc(DEEP_TOPIC) },
};

export default meta;

type Story = StoryObj<typeof Opener>;

const expectScrolledToHeading = async (reader: HTMLElement) => {
  const heading = await waitFor(() => {
    const found = reader.querySelector<HTMLElement>(`#so-guide-h-${DEEP_TOPIC}`);
    expect(found).toBeVisible();
    return found as HTMLElement;
  }, { timeout: 8000 });
  const region = heading.closest<HTMLElement>(".so-guide-content");
  await expect(region).not.toBeNull();
  await waitFor(() => {
    expect(region!.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(heading.getBoundingClientRect().top - region!.getBoundingClientRect().top)).toBeLessThan(8);
  });
};

export const ScrollsToTheTopicEveryOpen: Story = {
  play: async ({ canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body);
    for (const pass of ["chunk loading", "chunk already loaded"]) {
      await step(`open with the ${pass}: the topic heading is scrolled into view`, async () => {
        await userEvent.click(body.getByRole("button", { name: "Open the guide" }));
        const reader = await body.findByRole("dialog", { name: GUIDE_COPY.title });
        await expect(reader).toHaveAttribute("open");
        await expectScrolledToHeading(reader);
        await userEvent.click(within(reader).getByRole("button", { name: GUIDE_COPY.close }));
        await waitFor(() => expect(body.queryByRole("dialog", { name: GUIDE_COPY.title })).toBeNull());
      });
    }
  },
};
