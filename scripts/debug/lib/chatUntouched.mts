import { createHash } from 'node:crypto';
import { evaluateInST } from './evaluate.mts';

export const MESSAGE_FIELDS = ['name', 'is_user', 'is_system', 'mes', 'swipe_id', 'swipes', 'reasoning'] as const;

export const BOOKKEEPING = ['extras.extraction.audits', 'extras.judge.calls', 'extras.modelCalls', 'extras.updatedAt', 'extras.lastSessionAt', 'extras.saveHealth'] as const;

export interface ChatFingerprint {
  messages: Array<Record<typeof MESSAGE_FIELDS[number], string>>;
  blob: Record<string, string>;
}

const sha = (value: unknown): string => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16);

const swipeTexts = (row: Record<string, unknown>): unknown => (Array.isArray(row.swipes) ? row.swipes.map((swipe) => (typeof swipe === 'string' ? swipe : null)) : null);

export const messagePrint = (message: unknown): ChatFingerprint['messages'][number] => {
  const row = (message && typeof message === 'object' ? message : {}) as Record<string, unknown>;
  const extra = (row.extra && typeof row.extra === 'object' ? row.extra : {}) as Record<string, unknown>;
  return {
    name: sha(row.name), is_user: sha(row.is_user === true), is_system: sha(row.is_system === true), mes: sha(row.mes),
    swipe_id: sha(row.swipe_id), swipes: sha(swipeTexts(row)), reasoning: sha(extra.reasoning),
  };
};

const excluded = (path: string): boolean => BOOKKEEPING.some((skip) => path === skip || path.startsWith(`${skip}.`) || path.includes(`.${skip}`));

export function blobPrint(blob: unknown, prefix = '', into: Record<string, string> = {}): Record<string, string> {
  if (prefix && excluded(prefix)) return into;
  if (blob && typeof blob === 'object' && !Array.isArray(blob)) {
    const entries = Object.entries(blob as Record<string, unknown>);
    if (!entries.length && prefix) into[prefix] = sha({});
    for (const [key, child] of entries) blobPrint(child, prefix ? `${prefix}.${key}` : key, into);
    return into;
  }
  into[prefix || '(blob)'] = sha(blob);
  return into;
}

export const fingerprintChat = (chat: readonly unknown[], blob: unknown): ChatFingerprint => ({ messages: chat.map(messagePrint), blob: blobPrint(blob) });

export function firstChange(before: ChatFingerprint, after: ChatFingerprint): string | null {
  if (before.messages.length !== after.messages.length) return `chat length ${before.messages.length} -> ${after.messages.length}`;
  for (let id = 0; id < before.messages.length; id += 1) {
    const field = MESSAGE_FIELDS.find((name) => before.messages[id][name] !== after.messages[id][name]);
    if (field) return `message ${id}: ${field}`;
  }
  const paths = [...new Set([...Object.keys(before.blob), ...Object.keys(after.blob)])].sort();
  const moved = paths.find((path) => before.blob[path] !== after.blob[path]);
  return moved ? `story blob: ${moved}` : null;
}

export async function captureChatFingerprint(page): Promise<ChatFingerprint> {
  const raw = await evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    return JSON.parse(JSON.stringify({ chat: Array.isArray(ctx.chat) ? ctx.chat : [], blob: ctx.chatMetadata?.story_orchestrator ?? null }));
  });
  return fingerprintChat(raw.chat, raw.blob);
}
