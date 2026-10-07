import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { DisplayGroup, InnerVoiceGroup, PacingGroup, StagecraftGroup, TalkGroup, TransitionNoteRow, WardenGroup } from "./PlayGroups";

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
  }) as unknown as RuntimeManager;

const Groups = ({ snapshot: current, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => (
  <div className="flex flex-col gap-3">
    <DisplayGroup snapshot={current} manager={manager} />
    <TransitionNoteRow snapshot={current} manager={manager} />
    <StagecraftGroup snapshot={current} manager={manager} />
    <WardenGroup snapshot={current} manager={manager} />
    <TalkGroup snapshot={current} manager={manager} />
    <InnerVoiceGroup snapshot={current} manager={manager} />
    <PacingGroup snapshot={current} manager={manager} />
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
    const curator = canvas.getByRole("checkbox", { name: "Lorebook curator" });
    await expect(curator).toBeChecked();
    const warden = canvas.getByLabelText("Warden notes");
    await expect(warden).toHaveAttribute("id", "so-warden-accept-mode");
    const values = [...(warden as HTMLSelectElement).options].map((option) => option.value);
    await expect(values).toEqual(["review", "auto"]);
    await expect(values).not.toContain("off");
    const agency = canvas.getByLabelText("Notes about the player's part");
    await expect(agency).toHaveValue("auto");
    await userEvent.selectOptions(agency, "review");
    await expect(args.manager.setStagecraftSettings).toHaveBeenCalledWith({ agencyAcceptMode: "review" });
    await userEvent.click(curator);
    await expect(args.manager.setStagecraftSettings).toHaveBeenCalledWith({ curatorEnabled: false });
    await expect(await canvas.findByLabelText("Notes under messages")).toBeInTheDocument();
    await expect(canvasElement.querySelector("#so-inner-voice-settings")).toBeNull();
    await expect(canvasElement.querySelector("#so-pacing-alpha")).toBeNull();
    await expect(canvasElement.querySelector("#so-chain-hold-extraction")).toBeNull();
  },
};

export const PlayerWithAStory: Story = {
  args: { snapshot: snapshot(false), manager: fakeManager() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText("Notes under messages")).toBeInTheDocument();
    await expect(canvas.queryByRole("checkbox", { name: "Lorebook curator" })).toBeNull();
    await expect(canvasElement.querySelector("#so-warden-accept-mode")).toBeNull();
    await expect(canvasElement.querySelector("#so-chain-stop-transition")).toBeNull();
    await expect(canvas.getByRole("checkbox", { name: "Steer the tension" })).toBeChecked();
  },
};

export const PlayerWithoutAStorySeesTheCurator: Story = {
  args: { snapshot: snapshot(false, null), manager: fakeManager() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("checkbox", { name: "Lorebook curator" })).toBeInTheDocument();
    await expect(canvasElement.querySelector("#so-warden-accept-mode")).toBeNull();
  },
};
