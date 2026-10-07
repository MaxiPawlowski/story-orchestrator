import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { SuggestionAsk } from "@runtime/suggestionsHost";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { PanelFrame } from "./PanelFrame";

const ASK = { chatId: "chat-a", box: "" } as unknown as SuggestionAsk;
const IDEAS = ["I ask the ferryman who else crossed tonight.", "I offer him a third coin to wait.", "I look for footprints on the jetty.", "\"Is the fog always this thick?\""];

const meta: Meta<typeof SuggestionsPanel> = {
  title: "Panels/SuggestionsPanel",
  component: SuggestionsPanel,
  args: { request: fn(async () => ({ ok: true as const, suggestions: IDEAS, ask: ASK })), fill: fn(() => ({ ok: true as const })) },
};

export default meta;

type Story = StoryObj<typeof SuggestionsPanel>;

export const FillsTheBoxNeverSends: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const buttons = await canvas.findAllByRole("button", { name: /ferryman|coin|footprints|fog/ });
    await expect(buttons).toHaveLength(4);
    await userEvent.click(buttons[1]);
    await expect(args.fill).toHaveBeenCalledWith(ASK, IDEAS[1]);
    await expect(await canvas.findByText("It is in the box where you type. Change it or send it.")).toBeInTheDocument();
    await expect(args.request).toHaveBeenCalledTimes(1);
  },
};

export const RefusedBecauseThePlayerTyped: Story = {
  args: { fill: fn(() => ({ ok: false as const, reason: "You started typing, so the suggestion was not put in." })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click((await canvas.findAllByRole("button", { name: /ferryman/ }))[0]);
    await expect(await canvas.findByText("You started typing, so the suggestion was not put in.")).toBeInTheDocument();
  },
};

export const NothingCameBack: Story = {
  args: { request: fn(async () => ({ ok: false as const, reason: "No suggestions came back. Try again in a moment." })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("No suggestions came back. Try again in a moment.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Other ideas" }));
    await expect(args.request).toHaveBeenCalledTimes(2);
  },
};

const framed = (width: number, height: number): Story => ({
  render: (args) => (
    <PanelFrame id="suggestions" title="What could I do?" geometry={{ x: 20, y: 20, w: 360, h: 320 }} viewport={{ width, height }} onChange={fn()} onClose={fn()}>
      <SuggestionsPanel {...args} />
    </PanelFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findAllByRole("button", { name: /ferryman|coin|footprints|fog/ })).toHaveLength(4);
  },
});

export const InAPanelAt390 = framed(390, 844);
export const InAPanelAt768 = framed(768, 1024);
export const InAPanelAt1440 = framed(1440, 900);
