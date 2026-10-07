export interface SpriteLookIssue { name: string; reason: string }
let owner: string | null = null;
let issues: SpriteLookIssue[] = [];

export function publishSpriteLookIssues(chatId: string | null, next: SpriteLookIssue[]): boolean {
  if (owner === chatId && JSON.stringify(issues) === JSON.stringify(next)) return false;
  owner = chatId;
  issues = next;
  return true;
}

export const spriteLookIssues = (chatId: string | null): SpriteLookIssue[] => chatId && owner === chatId ? issues : [];
