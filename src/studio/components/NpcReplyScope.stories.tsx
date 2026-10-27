import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import type { NpcReplyEffect } from "@engine/index";
import NpcReplyScope from "./NpcReplyScope";

const Harness: React.FC<{ initial: NpcReplyEffect }> = ({ initial }) => {
  const [reply, setReply] = useState<NpcReplyEffect>(initial);
  return (
    <div>
      <NpcReplyScope reply={reply} index={0} update={(_, patch) => setReply((current) => ({ ...current, ...patch }))} />
      <pre data-testid="reply">{JSON.stringify(reply)}</pre>
    </div>
  );
};

const meta: Meta<typeof Harness> = { title: "Studio/NpcReplyScope", component: Harness };

export default meta;

type Story = StoryObj<typeof Harness>;

export const ScopesAReplyPerVisit: Story = {
  args: { initial: { trigger: "afterSpeak", member: "Mara", kind: "scripted", text: "Hm." } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Reply 1 id")).toHaveAttribute("placeholder", "afterSpeak:Mara:0");
    await userEvent.type(canvas.getByLabelText("Reply 1 id"), "mara-hm");
    await userEvent.selectOptions(canvas.getByLabelText("Reply 1 once per"), "entry");
    await userEvent.type(canvas.getByLabelText("Reply 1 cooldown"), "3");
    await expect(canvas.getByTestId("reply").textContent).toContain('"id":"mara-hm"');
    await expect(canvas.getByTestId("reply").textContent).toContain('"once_per":"entry"');
    await expect(canvas.getByTestId("reply").textContent).toContain('"cooldown_player_turns":3');
    await userEvent.selectOptions(canvas.getByLabelText("Reply 1 once per"), "story");
    await expect(canvas.getByTestId("reply").textContent).not.toContain("once_per");
  },
};
