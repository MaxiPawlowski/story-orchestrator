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
    <div id="so-story-lore-global" data-so="story-lore-global" className="flex flex-col gap-1 text-xs so-warning-text">
      <span>
        {one ? "A story lorebook is" : `${books.length} story lorebooks are`} switched on for every chat, so {one ? "its" : "their"} entries reach chats
        that play other stories: {books.join(", ")}
      </span>
      <span className="opacity-80">Each story loads the lorebooks it lists in its own chats; nothing else needs them switched on.</span>
      <div className="flex flex-wrap gap-2">
        <button id="so-story-lore-release" type="button" className="menu_button" disabled={busy} onClick={onRelease}>Load with their stories only</button>
        <button id="so-story-lore-keep" type="button" className="menu_button" disabled={busy} onClick={onKeep}>Keep them on for every chat</button>
      </div>
    </div>
  );
}

export default StoryLoreGlobal;
