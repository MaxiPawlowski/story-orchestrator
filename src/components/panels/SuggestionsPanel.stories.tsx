import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { SuggestionAsk, SuggestionSide } from "@runtime/suggestionsHost";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { PanelFrame } from "./PanelFrame";

const ASK = { chatId: "chat-a", box: "" } as unknown as SuggestionAsk;
const IDEAS = ["I ask the ferryman who else crossed tonight.", "I offer him a third coin to wait.", "I look for footprints on the jetty.", "\"Is the fog always this thick?\""];
const LINES = IDEAS.map((text) => ({ text }));

const SIDE: SuggestionSide = {
  help: [{ checkId: "climb", label: "Climb", hints: [{ text: "a rope", have: false }, { text: "a friend's hand", have: true }] }],
  unavailable: [{ id: "lantern", text: "I light the lantern and go below.", reason: "You need a lantern first." }],
  author: null,
  shows: () => true,
};

const GROUNDED = [
  { text: "I ask the ferryman about the toll he mentioned.", anchorId: "thread:a1" },
  { text: "I check the jetty for the rope he spoke of.", anchorId: "check-help:climb" },
  { text: "I wait by the boathouse." },
  { text: "I knock on the ferryman's door.", anchorId: "offer:knock", authored: true as const },
];

const AUTHOR: SuggestionSide = {
  ...SIDE,
  author: {
    anchors: [
      { id: "thread:a1", kind: "thread", text: "The ferryman's toll", evidence: ["arc a1"] },
      { id: "check-help:climb", kind: "check-help", text: "Climb: a rope could help", evidence: ["check climb"] },
      { id: "offer:knock", kind: "offer", text: "I knock on the ferryman's door.", evidence: ["offer knock"] },
    ],
    grounded: 2, lines: 3,
  },
};

const meta: Meta<typeof SuggestionsPanel> = {
  title: "Panels/SuggestionsPanel",
  component: SuggestionsPanel,
  args: { request: fn(async () => ({ ok: true as const, suggestions: LINES, ask: ASK })), fill: fn(() => ({ ok: true as const })) },
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
    await expect(args.request).toHaveBeenCalledWith(0);
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
    await expect(args.request).toHaveBeenLastCalledWith(1);
  },
};

export const HelpLineAndGreyedOffer: Story = {
  args: { request: fn(async () => ({ ok: true as const, suggestions: LINES, ask: ASK, side: SIDE })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Climb — could help: a rope, a friend's hand (you have it)")).toBeInTheDocument();
    const greyed = canvas.getByRole("button", { name: /lantern/ });
    await expect(greyed).toBeDisabled();
    await expect(canvas.getByText("You need a lantern first.")).toBeInTheDocument();
    await expect(canvasElement.querySelector("[data-so=suggestions-author]")).toBeNull();
    await expect(canvasElement.querySelector("[data-so=suggestion-anchor]")).toBeNull();
    await expect(canvasElement.textContent).not.toMatch(/d20|target|\b12\b/);
    await expect(args.fill).not.toHaveBeenCalled();
  },
};

export const SecretArrivedAfterOpening: Story = {
  args: { request: fn(async () => ({ ok: true as const, suggestions: [...LINES, GROUNDED[3]], ask: ASK, side: { ...SIDE, shows: (text: string) => !/rope|lantern|knock/.test(text) } })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findAllByRole("button", { name: /ferryman|coin/ });
    await expect(canvas.getByText("Climb — could help: a friend's hand (you have it)")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /lantern/ })).toBeNull();
    await expect(canvas.queryByRole("button", { name: /knock/ })).toBeNull();
  },
};

export const GroundedLinesInAuthorView: Story = {
  args: { request: fn(async () => ({ ok: true as const, suggestions: GROUNDED, ask: ASK, side: AUTHOR })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("for: The ferryman's toll")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /knock on the ferryman's door/ })).toBeEnabled();
    await expect(canvas.getByText("Suggestions: anchors thread, check-help, offer, grounded 2/3")).toBeInTheDocument();
  },
};

const framed = (width: number, height: number, side?: SuggestionSide): Story => ({
  ...(side ? { args: { request: fn(async () => ({ ok: true as const, suggestions: LINES, ask: ASK, side })) } } : {}),
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
export const HelpAndOffersAt390 = framed(390, 844, SIDE);
