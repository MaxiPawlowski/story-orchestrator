import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { DisplayGroup, InnerVoiceGroup, TalkGroup, TransitionNoteRow } from "./PlayGroups";

const snapshot = (authorView: boolean, storyId: string | null = "sun-ruins"): RuntimeSnapshot =>
  ({
    ready: true,
    storyId,
    memory: { settings: { epistemicLedgerCapable: true } },
    pacing: { alpha: 0.3, shapeOverride: null, hintEnabled: true },
    stagecraft: { settings: { curatorEnabled: true, acceptMode: "review", wardenEnabled: true, wardenAcceptMode: "auto" } },
    stagecraftScope: ["Xentar Checkpoints"],
    ui: { authorView, announceTransitions: true, hudEnabled: true, inline: { level: 1, categories: {}, window: 20 } },
    inline: { level: 1, requested: 1, window: 20, categories: {}, newestMessageId: 0, byMessage: {} },
  }) as unknown as RuntimeSnapshot;

const fakeManager = (): RuntimeManager =>
  ({
    setUiSettings: fn(),
    setInlineSettings: fn(),
    setMemorySettings: fn(),
    setStagecraftSettings: fn(),
    setTalkChainSettings: fn(),
    setPacingSettings: fn(),
    notify: fn(),
  }) as unknown as RuntimeManager;

const Groups = ({ snapshot: current, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => (
  <div className="flex flex-col gap-3">
    <DisplayGroup snapshot={current} manager={manager} />
    <TransitionNoteRow snapshot={current} manager={manager} />
    <TalkGroup snapshot={current} manager={manager} />
    <InnerVoiceGroup snapshot={current} manager={manager} />
  </div>
);

const meta: Meta<typeof Groups> = {
  title: "Settings/PlayGroups",
  component: Groups,
};

export default meta;

type Story = StoryObj<typeof Groups>;

export const AuthorView: Story = {
  args: { snapshot: snapshot(true), manager: fakeManager() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("switch", { name: /Several characters may answer/ }));
    await expect(args.manager.setTalkChainSettings).toHaveBeenCalled();
    await expect(canvas.getByRole("switch", { name: /Keep one question when a character asks you/ })).toBeChecked();
    await expect(await canvas.findByLabelText("Notes under messages")).toBeInTheDocument();
    await expect(canvas.queryByRole("switch", { name: "Lorebook curator" })).toBeNull();
    await waitFor(() => expect(canvasElement.querySelector("#so-inner-voice-settings")).not.toBeNull());
    await expect(canvasElement.querySelector("#so-pacing-alpha")).toBeNull();
    await expect(canvasElement.querySelector("#so-chain-hold-extraction")).toBeNull();
  },
};

export const PlayerWithAStory: Story = {
  args: { snapshot: snapshot(false), manager: fakeManager() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText("Notes under messages")).toBeInTheDocument();
    await expect(canvas.queryByRole("switch", { name: "Lorebook curator" })).toBeNull();
    await expect(canvasElement.querySelector("#so-chain-stop-transition")).toBeNull();
  },
};
