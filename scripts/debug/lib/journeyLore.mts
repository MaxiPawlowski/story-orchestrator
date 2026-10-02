const isRecord = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export interface StoryRefs { files: string[]; inline: unknown[]; selected: string[] }

export function journeyStoryRefs(journey: unknown): StoryRefs {
  const refs: StoryRefs = { files: [], inline: [], selected: [] };
  const walk = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!isRecord(node)) return;
    const imported = node.import_story;
    if (typeof imported === 'string') refs.files.push(imported);
    else if (isRecord(imported) && typeof imported.file === 'string') refs.files.push(imported.file);
    else if (isRecord(imported)) refs.inline.push(imported);
    const selected = node.select_story;
    if (typeof selected === 'string') refs.selected.push(selected);
    else if (isRecord(selected) && typeof selected.id === 'string') refs.selected.push(selected.id);
    Object.values(node).forEach(walk);
  };
  walk(isRecord(journey) ? journey.checks : null);
  return { files: [...new Set(refs.files)], inline: refs.inline, selected: [...new Set(refs.selected)] };
}

const loreKey = (name: string) => name.trim().toLowerCase();

export function storyListedBooks(stories: unknown[]): string[] {
  const out = new Map<string, string>();
  for (const story of stories) {
    const books = isRecord(story) && isRecord(story.requirements) && Array.isArray(story.requirements.lorebooks) ? story.requirements.lorebooks : [];
    for (const book of books) if (typeof book === 'string' && book.trim() && !out.has(loreKey(book))) out.set(loreKey(book), book.trim());
  }
  return [...out.values()];
}

export function splitJourneyLorebooks(names: unknown, listed: string[]): { global: string[]; storyScoped: string[] } {
  const keys = new Set(listed.map(loreKey));
  const wanted = (Array.isArray(names) ? names : []).filter((name): name is string => typeof name === 'string' && Boolean(name.trim()));
  return { global: wanted.filter((name) => !keys.has(loreKey(name))), storyScoped: wanted.filter((name) => keys.has(loreKey(name))) };
}
