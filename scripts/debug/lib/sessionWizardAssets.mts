export interface WizardGroup { id: string; name: string; source: 'agent' | 'staged' | 'adopted' }

export interface WizardLedger {
  sessions: string[];
  continued: string[];
  unbaselined: string[];
  stories: string[];
  characters: string[];
  lorebooks: string[];
  entries: string[];
  groups: WizardGroup[];
  applied: string[];
}

export interface WizardAllowance { allow: string[]; ledger: WizardLedger }

export interface WizardChat { groupId?: unknown; storyId?: unknown; adopted?: unknown }

export interface WizardRun { end?: unknown; chats?: WizardChat[] }

export interface StoryContext { stories: string[]; storyBooks: string[] }

const isRecord = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []);
const stamp = (value: unknown) => {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
};
const inventoryOf = (header: unknown): Record<string, any> => (isRecord(header) && isRecord(header.inventory) ? header.inventory : {});
const storyId = (item: string) => item.replace(/@[^@]*$/, '');
const sessionsOf = (drafts: unknown) => (isRecord(drafts) && Array.isArray(drafts.sessions) ? drafts.sessions : []).filter(isRecord).filter((session) => typeof session.key === 'string' && session.key.length > 0);
const GROUP_OBSERVATION = /^Created the group "(.+)" with \d+ member/;

const parseGroup = (item: string): { id: string; name: string } | null => {
  const at = item.indexOf('@');
  return at > 0 ? { id: item.slice(0, at), name: item.slice(at + 1) } : null;
};

function agentGroups(session: Record<string, any>, from: number | null): string[] {
  const steps = isRecord(session.agent) && Array.isArray(session.agent.steps) ? session.agent.steps.filter(isRecord) : [];
  return steps
    .filter((step) => step.status === 'applied' && (step.op?.kind === 'createGroup' || step.call?.tool === 'createGroup'))
    .filter((step) => from === null || (stamp(step.at) ?? -Infinity) >= from)
    .map((step) => GROUP_OBSERVATION.exec(String(step.observation ?? ''))?.[1] ?? (typeof step.op?.name === 'string' ? step.op.name : null))
    .filter((name): name is string => Boolean(name));
}

export function wizardAllowance(baseline: unknown, drafts: unknown, startedAt: string | null, run: WizardRun = {}): WizardAllowance {
  const inventory = inventoryOf(baseline);
  const ending = inventoryOf(run.end);
  const knownSessions = new Set(strings(inventory.wizardSessions));
  const knownStories = strings(inventory.v2Stories).map(storyId);
  const startLedger = Array.isArray(inventory.wizardApplied) ? strings(inventory.wizardApplied) : null;
  const from = stamp(startedAt);
  const recent = (session: Record<string, any>) => {
    const updated = stamp(session.updatedAt);
    return from === null || (updated !== null && updated >= from);
  };
  const touched = sessionsOf(drafts).filter(recent);
  const fresh = touched.filter((session) => !knownSessions.has(session.key));
  const known = touched.filter((session) => knownSessions.has(session.key));
  const carried = startLedger ? known : [];
  const had = (key: string) => new Set((startLedger ?? []).filter((item) => item.startsWith(`${key}/`)).map((item) => item.slice(key.length + 1)));
  const growth = [...fresh, ...carried].map((session) => {
    const before = knownSessions.has(session.key) ? had(session.key) : new Set<string>();
    const ledgerBooks = [...strings(session.createdLorebooks), ...(Array.isArray(session.grants) ? session.grants.map((grant: any) => grant?.lorebookFileId) : [])].filter((name): name is string => typeof name === 'string' && name.length > 0);
    const names = strings(session.applied).filter((name) => !before.has(name));
    const books = strings(session.createdLorebooks).filter((name) => !before.has(name));
    const entries = names.filter((name) => !books.includes(name) && ledgerBooks.some((book) => name.startsWith(`${book}/`)));
    return { key: session.key as string, names, books, entries, agent: agentGroups(session, from) };
  });
  const startGroups = Array.isArray(inventory.groups) ? new Set(strings(inventory.groups)) : null;
  const newGroups = startGroups ? strings(ending.groups).filter((item) => !startGroups.has(item)).map(parseGroup).filter((group): group is { id: string; name: string } => group !== null) : [];
  const agentNames = growth.flatMap((entry) => entry.agent);
  const staged = growth.flatMap((entry) => entry.names.filter((name) => !entry.books.includes(name) && !entry.entries.includes(name) && !agentNames.includes(name) && newGroups.some((group) => group.name === name)));
  const groups: WizardGroup[] = [];
  const claim = (name: string, source: WizardGroup['source']) => {
    const match = newGroups.find((group) => group.name === name && !groups.some((taken) => taken.id === group.id));
    if (match) groups.push({ ...match, source });
  };
  for (const name of agentNames) claim(name, 'agent');
  for (const name of staged) claim(name, 'staged');
  const keys = [...fresh, ...carried].map((session) => session.key as string);
  const library = (isRecord(drafts) && Array.isArray(drafts.library) ? drafts.library : []).filter(isRecord);
  const stories = [...new Set(library.map((record) => record.id).filter((id): id is string => typeof id === 'string' && keys.includes(id) && !knownStories.includes(id)))];
  for (const chat of run.chats ?? []) {
    if (chat.adopted !== true || typeof chat.storyId !== 'string' || !stories.includes(chat.storyId) || chat.groupId === undefined || chat.groupId === null) continue;
    const match = newGroups.find((group) => group.id === String(chat.groupId) && !groups.some((taken) => taken.id === group.id));
    if (match) groups.push({ ...match, source: 'adopted' });
  }
  const lorebooks = [...new Set(growth.flatMap((entry) => entry.books))];
  const entries = [...new Set(growth.flatMap((entry) => entry.entries))];
  const characters = [...new Set(growth.flatMap((entry) => entry.names.filter((name) => !entry.books.includes(name) && !entry.entries.includes(name) && !staged.includes(name))))];
  const applied = growth.flatMap((entry) => entry.names.map((name) => `${entry.key}/${name}`));
  const allow = [
    ...fresh.map((session) => `inventory.wizardSessions:+${session.key}`),
    ...stories.map((id) => `inventory.v2Stories:+${id}`),
    ...lorebooks.map((name) => `inventory.lorebooksSelected:+${name}`),
    ...(lorebooks.length ? [`inventory.lorebookCount=+${lorebooks.length}`] : []),
    ...(characters.length ? [`inventory.characterCount=+${characters.length}`] : []),
    ...applied.map((item) => `inventory.wizardApplied:+${item}`),
    ...groups.map((group) => `inventory.groups:+${group.id}`),
  ];
  return {
    allow,
    ledger: {
      sessions: fresh.map((session) => session.key as string),
      continued: growth.filter((entry) => knownSessions.has(entry.key) && entry.names.length + entry.books.length + entry.agent.length > 0).map((entry) => entry.key),
      unbaselined: startLedger ? [] : known.map((session) => session.key as string),
      stories, characters, lorebooks, entries, groups, applied,
    },
  };
}

export function storyContext(baseline: unknown, chats: WizardChat[], drafts: unknown): StoryContext {
  const opened = isRecord(baseline) && isRecord(baseline.story) && typeof baseline.story.id === 'string' && baseline.story.id ? [baseline.story.id] : [];
  const stories = [...new Set([...opened, ...chats.map((chat) => chat.storyId).filter((id): id is string => typeof id === 'string' && id.length > 0)])];
  const storyBooks = [...new Set(sessionsOf(drafts).filter((session) => stories.includes(session.key)).flatMap((session) => strings(session.createdLorebooks)))];
  return { stories, storyBooks };
}

export const STORY_TOKENS = { '{story}': 'stories', '{story-books}': 'storyBooks' } as const;

export function resolveHeaderAllow(entries: string[], context: StoryContext): { allow: string[]; unresolved: string[] } {
  const allow: string[] = [];
  const unresolved: string[] = [];
  for (const entry of entries) {
    const token = (Object.keys(STORY_TOKENS) as Array<keyof typeof STORY_TOKENS>).find((name) => entry.endsWith(name));
    if (!token) { allow.push(entry); continue; }
    const values = context[STORY_TOKENS[token]];
    if (!values.length) { unresolved.push(entry); continue; }
    allow.push(...values.map((value) => `${entry.slice(0, -token.length)}${value}`));
  }
  return { allow, unresolved };
}
