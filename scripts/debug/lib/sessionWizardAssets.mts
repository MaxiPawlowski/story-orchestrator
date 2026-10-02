export interface WizardLedger {
  sessions: string[];
  stories: string[];
  characters: string[];
  lorebooks: string[];
  skipped: string[];
}

export interface WizardAllowance { allow: string[]; ledger: WizardLedger }

const isRecord = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []);
const stamp = (value: unknown) => {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export function wizardAllowance(baseline: unknown, drafts: unknown, startedAt: string | null): WizardAllowance {
  const inventory = isRecord(baseline) && isRecord(baseline.inventory) ? baseline.inventory : {};
  const knownSessions = new Set(strings(inventory.wizardSessions));
  const knownStories = strings(inventory.v2Stories).map((item) => item.replace(/@[^@]*$/, ''));
  const from = stamp(startedAt);
  const sessions = (isRecord(drafts) && Array.isArray(drafts.sessions) ? drafts.sessions : []).filter(isRecord).filter((session) => {
    if (typeof session.key !== 'string' || !session.key || knownSessions.has(session.key)) return false;
    const updated = stamp(session.updatedAt);
    return from === null || (updated !== null && updated >= from);
  });
  const keys = sessions.map((session) => session.key as string);
  const lorebooks = [...new Set(sessions.flatMap((session) => strings(session.createdLorebooks)))];
  const characters = [...new Set(sessions.flatMap((session) => {
    const books = new Set(strings(session.createdLorebooks));
    return strings(session.applied).filter((name) => !books.has(name));
  }))];
  const library = (isRecord(drafts) && Array.isArray(drafts.library) ? drafts.library : []).filter(isRecord);
  const stories = [...new Set(library.map((record) => record.id).filter((id): id is string => typeof id === 'string' && keys.includes(id) && !knownStories.includes(id)))];
  const expressible = (name: string) => !name.includes(',');
  const skipped = [...keys, ...stories, ...lorebooks].filter((name) => !expressible(name));
  const allow = [
    ...keys.filter(expressible).map((key) => `inventory.wizardSessions:+${key}`),
    ...stories.filter(expressible).map((id) => `inventory.v2Stories:+${id}`),
    ...lorebooks.filter(expressible).map((name) => `inventory.lorebooksSelected:+${name}`),
    ...(lorebooks.length ? [`inventory.lorebookCount=+${lorebooks.length}`] : []),
    ...(characters.length ? [`inventory.characterCount=+${characters.length}`] : []),
  ];
  return { allow, ledger: { sessions: keys, stories, characters, lorebooks, skipped } };
}
