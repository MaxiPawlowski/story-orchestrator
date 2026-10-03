import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import { mountStoryBadges, type StoryBadge } from "@services/stHost/charListBadges";
import { mountStoryWand } from "@services/stHost/storyWand";

const SAGA: StoryBadge = { title: "Sun Ruins", kind: "saga", kindLabel: "Saga", chapterTitle: "The Siege", checkpointName: "The Gate", lastPlayed: "2 days ago", card: true };
const ACT: StoryBadge = { title: "Moon Well", kind: "story", kindLabel: "Story", lastPlayed: "just now", card: true };

const Lists = () => {
  useEffect(() => {
    const handle = mountStoryBadges(() => ({ groups: new Map([["g1", SAGA], ["g2", ACT]]), chats: new Map([["chat-a", SAGA]]) }), () => () => undefined);
    return () => handle.dispose();
  }, []);
  return (
    <div>
      <div id="rm_print_characters_block">
        {["g1", "g2", "g3"].map((id) => (
          <div key={id} className="group_select entity_block" data-grid={id}><div className="avatar" /><div className="ch_name">Group {id}</div></div>
        ))}
      </div>
      <div className="recentChat group" data-file="chat-a" data-group="g1"><div className="chatName">Group g1 – chat-a</div></div>
    </div>
  );
};

const meta: Meta<typeof Lists> = {
  title: "Presence/StoryBadges",
  component: Lists,
};

export default meta;

type Story = StoryObj<typeof Lists>;

export const SagaAndStoryWithCard: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-so="story-badge"]')).toHaveLength(3));
    const badges = [...canvasElement.querySelectorAll<HTMLElement>('[data-so="story-badge"]')];
    await expect(badges.map((badge) => badge.getAttribute("aria-label"))).toEqual(["Saga: Sun Ruins", "Story: Moon Well", "Saga: Sun Ruins"]);
    await expect(canvasElement.querySelector('[data-grid="g3"] [data-so="story-badge"]')).toBeNull();
    badges[0].focus();
    const card = document.querySelector('[data-so="story-card"]');
    await expect(card?.textContent).toContain("Chapter: The Siege");
    await expect(card?.textContent).toContain("Last played 2 days ago");
    badges[0].blur();
    await expect(document.querySelector('[data-so="story-card"]')).toBeNull();
  },
};

const Wand = ({ onRecap, onFlag }: { onRecap: () => void; onFlag: () => void }) => {
  useEffect(() => {
    const handle = mountStoryWand([
      { id: "so-wand-recap", icon: "fa-book-open", label: "Story recap", run: onRecap },
      { id: "so-wand-flag", icon: "fa-flag", label: "Flag this moment", run: onFlag },
    ]);
    handle.setVisible(true);
    return () => handle.dispose();
  }, [onRecap, onFlag]);
  return <div id="extensionsMenu" />;
};

export const WandEntries: StoryObj<typeof Wand> = {
  render: (args) => <Wand {...args} />,
  args: { onRecap: fn(), onFlag: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Story recap"));
    await expect(args.onRecap).toHaveBeenCalled();
    await userEvent.click(canvas.getByText("Flag this moment"));
    await expect(args.onFlag).toHaveBeenCalled();
  },
};
