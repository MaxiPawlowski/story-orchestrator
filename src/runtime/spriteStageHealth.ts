export interface SpriteStageIssue { name: string; reason: string }

export interface SpriteInventoryEntry { sets: string[]; faces: string[] }

export interface SpriteStageHealth {
  builtInExpressions: boolean;
  packIssues: SpriteStageIssue[];
  inventory: Record<string, SpriteInventoryEntry>;
}

const EMPTY: SpriteStageHealth = { builtInExpressions: false, packIssues: [], inventory: {} };

let owner: string | null = null;
let health: SpriteStageHealth = EMPTY;

export function publishSpriteStageHealth(chatId: string | null, next: SpriteStageHealth): boolean {
  if (owner === chatId && JSON.stringify(health) === JSON.stringify(next)) return false;
  owner = chatId;
  health = next;
  return true;
}

export const spriteStageHealth = (chatId: string | null): SpriteStageHealth => (chatId && owner === chatId ? health : EMPTY);

export const spriteInventory = (): Record<string, SpriteInventoryEntry> => health.inventory;
