import { Button } from "@components/ui/Button";
import { Callout } from "@components/ui/Callout";
export interface StoryLoreGlobalProps {
  books: string[];
  busy: boolean;
  onRelease: () => void;
  onKeep: () => void;
}

export function StoryLoreGlobal({ books, busy, onRelease, onKeep }: StoryLoreGlobalProps) {
  if (!books.length) return null;
  const one = books.length === 1;
  return (
    <Callout id="so-story-lore-global" data-so="story-lore-global" tone="warn" size="sm"
      actions={<>
        <Button id="so-story-lore-release" type="button" disabled={busy} onClick={onRelease}>Load with their stories only</Button>
        <Button id="so-story-lore-keep" type="button" disabled={busy} onClick={onKeep}>Keep them on for every chat</Button>
      </>}>
      <p>
        {one ? "A story lorebook is" : `${books.length} story lorebooks are`} switched on for every chat, so {one ? "its" : "their"} entries reach chats
        that play other stories: {books.join(", ")}
      </p>
      <p className="opacity-80">Each story loads the lorebooks it lists in its own chats; nothing else needs them switched on.</p>
    </Callout>
  );
}

export default StoryLoreGlobal;
