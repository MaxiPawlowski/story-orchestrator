import { createHash } from 'node:crypto';

export const INSTALLER_FIXED_BOOKS = [
  'Adolion World', 'Adolion Chronicle',
  'Adolion - Aegis City Noble Life', 'Adolion - The Third Kingdom',
  'Adolion - Tiunhime Village', 'Adolion - Eshalanore', 'Adolion - Mountains of Shadow',
];
export const CHECKPOINT_BOOK = /^Adolion .+ Checkpoints$/;
export const GROUP_PREFIX = 'Adolion - ';
export const MIRROR_PREFIX = 'Story Orchestrator - ';

export interface ManifestStory { id: string; version: number; title: string; checkpoints: number; lorebooks: string[]; members: string[]; personas: string[]; startCast: { disable: string[]; enable: string[] } }
export interface ManifestGroup { name: string; story: string; members: string[] }
export interface ManifestCard { avatar: string; name: string }
export interface ManifestBook { name: string; entries: number }
export interface AdolionManifest {
  commit: string;
  stories: ManifestStory[];
  cards: ManifestCard[];
  books: ManifestBook[];
  groups: ManifestGroup[];
  requiredBooks: string[];
}

export interface ManifestInput {
  commit: string;
  stories: unknown[];
  cards: { avatar: string; data: unknown }[];
  books: { name: string; data: unknown }[];
  groupScript: string;
}

const sorted = (values: Iterable<string>) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
const record = (value: unknown): Record<string, any> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {});

export function parseGroupScript(source: string): ManifestGroup[] {
  const start = source.indexOf('const GROUPS = ');
  const end = source.indexOf('\nconst out', start);
  if (start < 0 || end < 0) throw new Error('st-groups.js: no `const GROUPS = [...]` block (regenerate with write_group_script.py)');
  const body = source.slice(start + 'const GROUPS = '.length, end).trim().replace(/;$/, '');
  const parsed = JSON.parse(body);
  if (!Array.isArray(parsed)) throw new Error('st-groups.js: GROUPS is not an array');
  return parsed.map((group) => ({ name: String(group.name), story: String(group.story), members: sorted(strings(group.members)) }));
}

export const isInstalledBook = (name: string) => INSTALLER_FIXED_BOOKS.includes(name) || CHECKPOINT_BOOK.test(name);

const entryCount = (data: unknown) => Object.keys(record(record(data).entries)).length;

export function buildManifest(input: ManifestInput): AdolionManifest {
  const stories = input.stories.map((raw) => {
    const story = record(raw);
    const requirements = record(story.requirements);
    const checkpoints = Array.isArray(story.checkpoints) ? story.checkpoints.map(record) : [];
    const start = checkpoints.find((checkpoint) => checkpoint.start === true) ?? checkpoints[0];
    const cast = record(record(start?.effects).cast_changes);
    return {
      id: String(story.id), version: Number(story.version), title: String(story.title ?? story.id),
      checkpoints: checkpoints.length,
      lorebooks: sorted(strings(requirements.lorebooks)), members: sorted(strings(requirements.members)), personas: sorted(strings(requirements.personas)),
      startCast: { disable: sorted(strings(cast.disable)), enable: sorted(strings(cast.enable)) },
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const cards = input.cards.map(({ avatar, data }) => ({ avatar, name: String(record(record(data).data).name ?? record(data).name ?? avatar.replace(/\.png$/i, '')) }))
    .sort((a, b) => a.avatar.localeCompare(b.avatar));
  const books = input.books.filter((book) => isInstalledBook(book.name)).map((book) => ({ name: book.name, entries: entryCount(book.data) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const missingFixed = INSTALLER_FIXED_BOOKS.filter((name) => !books.some((book) => book.name === name));
  if (missingFixed.length) throw new Error(`the pinned build lacks the installer's fixed books: ${missingFixed.join(', ')}`);
  const groups = parseGroupScript(input.groupScript).sort((a, b) => a.story.localeCompare(b.story));
  return { commit: input.commit, stories, cards, books, groups, requiredBooks: sorted(stories.flatMap((story) => story.lorebooks)) };
}

export interface LaneGroupFile { file: string; id: string; name: string; chats: string[] }
export interface LaneDisk {
  worlds: string[];
  characters: string[];
  chatDirs: string[];
  groups: LaneGroupFile[];
  groupChats: string[];
  settings: Record<string, any>;
}
export interface StripPlan {
  worlds: string[];
  characters: string[];
  chatDirs: string[];
  groupFiles: string[];
  groupChats: string[];
  settings: Record<string, any>;
  removed: { stories: string[]; bindings: string[]; selected: string[] };
  media: { image: boolean; sprites: boolean };
}

const spritesSwitchedOff = (value: unknown) => record(value).enabled === false && record(value).explicit === true;

export function mediaOff(root: Record<string, any>) {
  if (!root.settings || typeof root.settings !== 'object') root.settings = {};
  const was = { image: record(root.settings.image).enabled !== false, sprites: !spritesSwitchedOff(root.settings.sprites) };
  root.settings.image = { ...record(root.settings.image), enabled: false };
  root.settings.sprites = { ...record(root.settings.sprites), enabled: false, explicit: true };
  return was;
}

export const mirrorName = (name: string, titles: string[]) => {
  const title = titles.find((candidate) => name.startsWith(`${MIRROR_PREFIX}${candidate} - `));
  return title ? `${MIRROR_PREFIX}${title} - <chat>` : name;
};

const isMirrorOf = (name: string, titles: string[]) => titles.some((title) => name === `${MIRROR_PREFIX}${title}` || name.startsWith(`${MIRROR_PREFIX}${title} - `));

export function stripPlan(manifest: AdolionManifest, disk: LaneDisk): StripPlan {
  const titles = manifest.stories.map((story) => story.title);
  const storyIds = new Set(manifest.stories.map((story) => story.id));
  const bookNames = new Set(manifest.books.map((book) => book.name));
  const worlds = disk.worlds.filter((name) => bookNames.has(name) || name.startsWith('Adolion') || isMirrorOf(name, titles));
  const avatars = new Set(manifest.cards.map((card) => card.avatar));
  const characters = disk.characters.filter((avatar) => avatars.has(avatar));
  const stems = new Set(characters.map((avatar) => avatar.replace(/\.png$/i, '')));
  const chatDirs = disk.chatDirs.filter((dir) => stems.has(dir));
  const groups = disk.groups.filter((group) => group.name.startsWith(GROUP_PREFIX));
  const groupIds = new Set(groups.map((group) => String(group.id)));
  const chatIds = new Set(groups.flatMap((group) => group.chats));
  const groupChats = disk.groupChats.filter((file) => chatIds.has(file.replace(/\.jsonl$/i, '')));

  const settings = structuredClone(disk.settings);
  const root = record(record(settings.extension_settings)['story-orchestrator']);
  const media = mediaOff(root);
  const library = Array.isArray(root.v2Stories) ? root.v2Stories : [];
  const removedStories = library.filter((entry) => storyIds.has(record(entry).id)).map((entry) => String(record(entry).id));
  if (Array.isArray(root.v2Stories)) root.v2Stories = library.filter((entry) => !storyIds.has(record(entry).id));
  const bindings = record(root.groupStories);
  const removedBindings = Object.keys(bindings).filter((id) => groupIds.has(id) || storyIds.has(bindings[id]));
  if (root.groupStories) root.groupStories = Object.fromEntries(Object.entries(bindings).filter(([id]) => !removedBindings.includes(id)));
  const worldInfo = record(record(settings.world_info_settings).world_info);
  const gone = new Set(worlds);
  const selected = strings(worldInfo.globalSelect);
  const removedSelected = selected.filter((name) => gone.has(name));
  if (Array.isArray(worldInfo.globalSelect)) worldInfo.globalSelect = selected.filter((name) => !gone.has(name));
  if (settings.active_group != null && groupIds.has(String(settings.active_group))) settings.active_group = null;
  if (typeof settings.active_character === 'string' && avatars.has(settings.active_character)) settings.active_character = null;
  if (settings.tag_map && typeof settings.tag_map === 'object') {
    settings.tag_map = Object.fromEntries(Object.entries(settings.tag_map).filter(([key]) => !avatars.has(key) && !groupIds.has(key)));
  }
  return {
    worlds, characters, chatDirs, groupFiles: groups.map((group) => group.file), groupChats, settings,
    removed: { stories: removedStories, bindings: removedBindings, selected: removedSelected }, media,
  };
}

export interface InventoryBook { name: string; entries: number; enabled: number; contentSha: string }
export interface InventoryGroup { name: string; story: string | null; members: string[]; disabled: string[] }
export interface InventoryStory { id: string; version: number; hash: string; title: string; checkpoints: number }
export interface RuntimeReadiness { ready: boolean; storyId: string | null; missingLorebooks: string[]; missingMembers: string[]; missingPersonas: string[] }
export interface Inventory {
  commit: string;
  books: InventoryBook[];
  cards: string[];
  characterCount: number;
  groups: InventoryGroup[];
  library: InventoryStory[];
  selected: string[];
  extraction: Record<string, unknown> | null;
  media: { image: boolean; sprites: boolean };
  ledger: { lorebooks: string[]; characters: string[] } | null;
  runtime: Record<string, RuntimeReadiness> | null;
  /** The group whose chat is open when the inventory is read: its story's cast is in force, every other group's was put back on leave. */
  openGroup?: string | null;
}

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
  return value;
};

export function bookDigest(name: string, data: unknown): InventoryBook {
  const entries = Object.values(record(record(data).entries)).map(record);
  const content = entries.map(({ disable, ...rest }) => rest).sort((a, b) => Number(a.uid) - Number(b.uid));
  return {
    name, entries: entries.length, enabled: entries.filter((entry) => !entry.disable).length,
    contentSha: createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex').slice(0, 16),
  };
}

export interface InventoryInput {
  commit: string;
  books: { name: string; data: unknown }[];
  characters: string[];
  groups: { id: string; name: string; members: string[]; disabled_members?: string[] }[];
  settings: Record<string, any>;
  ledger?: { lorebooks?: string[]; characters?: string[] } | null;
  runtime?: Record<string, RuntimeReadiness> | null;
  openGroup?: string | null;
}

export function buildInventory(manifest: AdolionManifest, input: InventoryInput): Inventory {
  const titles = manifest.stories.map((story) => story.title);
  const root = record(record(input.settings.extension_settings)['story-orchestrator']);
  const bindings = record(root.groupStories);
  const avatars = new Set(manifest.cards.map((card) => card.avatar));
  const storyIds = new Set(manifest.stories.map((story) => story.id));
  const extraction = record(record(root.settings).extraction);
  return {
    commit: manifest.commit,
    books: input.books.filter((book) => isInstalledBook(book.name) || book.name.startsWith('Adolion') || isMirrorOf(book.name, titles))
      .map((book) => bookDigest(mirrorName(book.name, titles), book.data)).sort((a, b) => a.name.localeCompare(b.name)),
    cards: sorted(input.characters.filter((avatar) => avatars.has(avatar))),
    characterCount: input.characters.length,
    groups: input.groups.filter((group) => group.name.startsWith(GROUP_PREFIX)).map((group) => ({
      name: group.name, story: typeof bindings[String(group.id)] === 'string' ? bindings[String(group.id)] : null,
      members: sorted(strings(group.members)), disabled: sorted(strings(group.disabled_members)),
    })).sort((a, b) => a.name.localeCompare(b.name) || String(a.story).localeCompare(String(b.story))),
    library: (Array.isArray(root.v2Stories) ? root.v2Stories : []).map(record)
      .filter((entry) => storyIds.has(entry.id) || String(entry.id ?? '').startsWith('adolion-'))
      .map((entry) => ({ id: String(entry.id), version: Number(entry.version), hash: String(entry.hash ?? ''), title: String(entry.title ?? ''), checkpoints: Array.isArray(entry.raw?.checkpoints) ? entry.raw.checkpoints.length : 0 }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    selected: sorted(strings(record(record(input.settings.world_info_settings).world_info).globalSelect)),
    extraction: Object.keys(extraction).length ? canonical({ enabled: extraction.enabled, cadence: extraction.cadence, stabilityLag: extraction.stabilityLag, profileId: extraction.profileId ?? null }) as Record<string, unknown> : null,
    media: { image: record(record(root.settings).image).enabled !== false, sprites: !spritesSwitchedOff(record(root.settings).sprites) },
    ledger: input.ledger ? { lorebooks: sorted(strings(input.ledger.lorebooks)), characters: sorted(strings(input.ledger.characters)) } : null,
    runtime: input.runtime ? Object.fromEntries(Object.keys(input.runtime).sort().map((id) => [id, input.runtime![id]])) : null,
    ...(input.openGroup !== undefined ? { openGroup: input.openGroup } : {}),
  };
}

/**
 * The members a fresh import leaves disabled: the start checkpoint's `cast_changes`, applied
 * disable-then-enable like `EffectsApplier.applyCastChanges`, over a group created with none disabled.
 */
export function expectedStartDisabled(manifest: AdolionManifest, group: ManifestGroup): string[] {
  const story = manifest.stories.find((candidate) => candidate.id === group.story);
  if (!story) return [];
  const enabled = new Set(story.startCast.enable.map((name) => name.toLowerCase()));
  const disabled = new Set(story.startCast.disable.map((name) => name.toLowerCase()).filter((name) => !enabled.has(name)));
  return sorted(manifest.cards.filter((card) => group.members.includes(card.avatar) && disabled.has(card.name.toLowerCase())).map((card) => card.avatar));
}

const setDiff = (want: string[], have: string[]) => ({ missing: want.filter((item) => !have.includes(item)), extra: have.filter((item) => !want.includes(item)) });

export function storyReadiness(manifest: AdolionManifest, inventory: Inventory, story: ManifestStory): { missingLorebooks: string[]; missingMembers: string[] } {
  const listed = new Set(inventory.books.map((book) => book.name));
  const selected = new Set(inventory.selected);
  const group = inventory.groups.find((candidate) => candidate.story === story.id);
  const present = new Set(inventory.cards);
  const names = new Set(manifest.cards.filter((card) => group?.members.includes(card.avatar) && present.has(card.avatar)).map((card) => card.name.toLowerCase()));
  return {
    missingLorebooks: story.lorebooks.filter((book) => !listed.has(book) || !selected.has(book)),
    missingMembers: story.members.filter((member) => !names.has(member.toLowerCase())),
  };
}

export function checkInventory(manifest: AdolionManifest, inventory: Inventory): string[] {
  const problems: string[] = [];
  if (inventory.commit !== manifest.commit) problems.push(`inventory is of campaign ${inventory.commit}, manifest is ${manifest.commit}`);
  for (const book of manifest.books) {
    const found = inventory.books.find((candidate) => candidate.name === book.name);
    if (!found) problems.push(`book missing: ${book.name}`);
    else if (found.entries !== book.entries) problems.push(`book ${book.name}: ${found.entries} entries, build has ${book.entries}`);
  }
  const strayBooks = inventory.books.filter((book) => !book.name.startsWith(MIRROR_PREFIX) && !manifest.books.some((wanted) => wanted.name === book.name)).map((book) => book.name);
  if (strayBooks.length) problems.push(`books not in the build: ${strayBooks.join(', ')}`);
  const cards = setDiff(manifest.cards.map((card) => card.avatar), inventory.cards);
  if (cards.missing.length) problems.push(`cards missing: ${cards.missing.join(', ')}`);
  for (const group of manifest.groups) {
    const found = inventory.groups.filter((candidate) => candidate.name === group.name);
    if (found.length !== 1) { problems.push(`group ${group.name}: found ${found.length}, want 1`); continue; }
    const members = setDiff(group.members, found[0].members);
    if (members.missing.length || members.extra.length) problems.push(`group ${group.name}: members missing [${members.missing.join(', ')}] extra [${members.extra.join(', ')}]`);
    if (found[0].story !== group.story) problems.push(`group ${group.name}: bound to ${found[0].story ?? 'nothing'}, want ${group.story}`);
    if (inventory.openGroup !== undefined) {
      const open = inventory.openGroup === group.name;
      const cast = setDiff(open ? expectedStartDisabled(manifest, group) : [], found[0].disabled);
      if (cast.missing.length || cast.extra.length) problems.push(open
        ? `group ${group.name} (open): start cast not in force: disabled missing [${cast.missing.join(', ')}] extra [${cast.extra.join(', ')}]`
        : `group ${group.name}: cast left behind after its chat was left: disabled [${cast.extra.join(', ')}]`);
    }
  }
  const strayGroups = inventory.groups.filter((group) => !manifest.groups.some((wanted) => wanted.name === group.name)).map((group) => group.name);
  if (strayGroups.length) problems.push(`groups not in the build: ${strayGroups.join(', ')}`);
  for (const story of manifest.stories) {
    const found = inventory.library.find((candidate) => candidate.id === story.id);
    if (!found) problems.push(`story missing from the library: ${story.id}`);
    else if (found.version !== story.version || found.checkpoints !== story.checkpoints) problems.push(`story ${story.id}: library v${found.version}/${found.checkpoints} cp, build v${story.version}/${story.checkpoints} cp`);
  }
  const strayStories = inventory.library.filter((story) => !manifest.stories.some((wanted) => wanted.id === story.id)).map((story) => story.id);
  if (strayStories.length) problems.push(`stories not in the build: ${strayStories.join(', ')}`);
  const selection = setDiff(manifest.requiredBooks, inventory.selected);
  if (selection.missing.length) problems.push(`required books not selected: ${selection.missing.join(', ')}`);
  if (selection.extra.length) problems.push(`selected books no Adolion story requires: ${selection.extra.join(', ')}`);
  for (const story of manifest.stories) {
    const gap = storyReadiness(manifest, inventory, story);
    if (gap.missingLorebooks.length || gap.missingMembers.length) problems.push(`story ${story.id} not ready (install): lorebooks [${gap.missingLorebooks.join(', ')}] members [${gap.missingMembers.join(', ')}]`);
    const live = inventory.runtime?.[story.id];
    if (inventory.runtime && !live) problems.push(`story ${story.id}: no runtime requirements read`);
    else if (live && (!live.ready || live.storyId !== story.id)) problems.push(`story ${story.id} not ready (runtime, playing ${live.storyId ?? 'nothing'}): lorebooks [${live.missingLorebooks.join(', ')}] members [${live.missingMembers.join(', ')}] personas [${live.missingPersonas.join(', ')}]`);
  }
  if (inventory.media.image || inventory.media.sprites) problems.push(`media generation is on in the lane (image ${inventory.media.image}, sprites ${inventory.media.sprites}): a lane must never reach the shared ComfyUI`);
  if (inventory.ledger) {
    const books = setDiff(manifest.books.map((book) => book.name), inventory.ledger.lorebooks);
    const created = setDiff(manifest.cards.map((card) => card.avatar), inventory.ledger.characters);
    if (books.missing.length || books.extra.length) problems.push(`installer ledger books differ: missing [${books.missing.join(', ')}] extra [${books.extra.join(', ')}]`);
    if (created.missing.length || created.extra.length) problems.push(`installer ledger cards differ: missing [${created.missing.join(', ')}] extra [${created.extra.join(', ')}]`);
  } else problems.push('no installer ledger (build/installed.json) in the export');
  return problems;
}

export function diffInventories(left: unknown, right: unknown, path = '$'): string[] {
  if (Array.isArray(left) && Array.isArray(right)) {
    const out = left.length === right.length ? [] : [`${path}: length ${left.length} vs ${right.length}`];
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) out.push(...diffInventories(left[index], right[index], `${path}[${index}]`));
    return out;
  }
  if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
    const keys = sorted([...Object.keys(left), ...Object.keys(right)]);
    return keys.flatMap((key) => diffInventories((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key], `${path}.${key}`));
  }
  return JSON.stringify(left) === JSON.stringify(right) ? [] : [`${path}: ${JSON.stringify(left)} vs ${JSON.stringify(right)}`];
}

export function installerProblems(output: string): string[] {
  return output.split(/\r?\n/).filter((line) => /^(FAIL|SKIP|WARN) /.test(line));
}
