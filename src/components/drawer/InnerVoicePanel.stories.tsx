import type { Meta, StoryObj } from "@storybook/react";
import { within, expect } from "@storybook/test";
import { provenance, type EpistemicEntry, type InnerBeat } from "@memory/index";
import type { RuntimeSnapshot } from "@runtime/types";
import InnerVoicePanel from "./InnerVoicePanel";

const intent = (id: string, subject: string, content: string, boundary: number): EpistemicEntry => ({
  id, subject, tag: "intends", content, createdAt: boundary, messageId: boundary,
  provenance: provenance({ source: "extractor", messageId: boundary, boundary, pass: "epistemic:intends" }),
});

const beat = (memberId: string, basedOnMessageId: number, text: string, used = false): InnerBeat => ({
  chatId: "chat-1", memberId, basedOnMessageId, checkpointId: "vault", beat: text, tone: "wary", at: "2026-09-30T10:00:00.000Z", ...(used ? { used } : {}),
});

const snapshotWith = (overrides: Partial<{ epistemic: EpistemicEntry[]; innerBeats: InnerBeat[]; boundary: number }>): RuntimeSnapshot => ({
  boundary: overrides.boundary ?? 4,
  activeCheckpointId: "vault",
  innerCast: [
    { id: "kael", name: "Kael", drive: "Clear his brother's name", motive: "Get the ledger before Lyria reads it" },
    { id: "lyria", name: "Lyria" },
    { id: "narrator", name: "DM Narrator", omniscient: true },
  ],
  memory: { epistemic: overrides.epistemic ?? [], derived: [], innerBeats: overrides.innerBeats ?? [] },
} as unknown as RuntimeSnapshot);

const meta: Meta<typeof InnerVoicePanel> = {
  title: "Drawer/InnerVoicePanel",
  component: InnerVoicePanel,
};

export default meta;

type Story = StoryObj<typeof InnerVoicePanel>;

export const DriveMotiveIntentAndBeat: Story = {
  args: {
    snapshot: snapshotWith({
      epistemic: [intent("i1", "Kael", "slip out before dawn", 3), intent("i2", "Lyria", "find out who took the key", 3)],
      innerBeats: [beat("kael", 7, "Stall Lyria at the door")],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rows = canvasElement.querySelectorAll('[data-so="inner-voice-row"]');
    await expect(rows).toHaveLength(3);
    await expect(canvas.getByText(/Clear his brother's name/)).toBeInTheDocument();
    await expect(canvas.getByText(/slip out before dawn/)).toBeInTheDocument();
    await expect(rows[0].querySelector('[data-so="inner-voice-beat"]')?.textContent).toContain("fresh");
    await expect(canvas.getByText(/narrator view/)).toBeInTheDocument();
  },
};

export const LapsedIntentIsHiddenAndUsedBeatSaysSo: Story = {
  args: {
    snapshot: snapshotWith({
      boundary: 60,
      epistemic: [intent("i1", "Kael", "slip out before dawn", 3)],
      innerBeats: [beat("kael", 7, "Stall Lyria at the door", true)],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText(/slip out before dawn/)).toBeNull();
    await expect(canvasElement.querySelector('[data-so="inner-voice-beat"]')?.textContent).toContain("used");
  },
};
