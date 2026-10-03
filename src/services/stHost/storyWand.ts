export interface WandEntry {
  id: string;
  icon: string;
  label: string;
  run: () => void;
  shown?: () => boolean;
}

export interface WandHandle {
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

// ST's extensions wand is `#extensionsMenu`; an entry is a `.list-group-item` with an
// `.extensionsMenuExtensionButton` icon, the shape stHost/imageSurface.ts already adds.
const MENU = "#extensionsMenu";

const buildItem = (doc: Document, entry: WandEntry): HTMLElement => {
  const item = doc.createElement("div");
  item.id = entry.id;
  item.className = "list-group-item flex-container flexGap5 interactable";
  item.tabIndex = 0;
  item.dataset.so = "story-wand";
  const icon = doc.createElement("div");
  icon.className = `fa-solid ${entry.icon} extensionsMenuExtensionButton`;
  const label = doc.createElement("span");
  label.textContent = entry.label;
  item.append(icon, label);
  return item;
};

export function mountStoryWand(entries: readonly WandEntry[], root: Document = document): WandHandle {
  let visible = false;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const sync = () => {
    const menu = root.querySelector(MENU);
    for (const entry of entries) {
      const existing = root.getElementById(entry.id);
      if (!visible || !menu || entry.shown?.() === false) existing?.remove();
      else if (!existing) menu.append(buildItem(root, entry));
    }
  };
  const activate = (event: Event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-so="story-wand"]') : null;
    const entry = target ? byId.get(target.id) : undefined;
    if (!entry) return;
    if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    entry.run();
  };
  root.addEventListener("click", activate);
  root.addEventListener("keydown", activate);
  return {
    setVisible: (next) => {
      visible = next;
      sync();
    },
    dispose: () => {
      root.removeEventListener("click", activate);
      root.removeEventListener("keydown", activate);
      visible = false;
      sync();
    },
  };
}
