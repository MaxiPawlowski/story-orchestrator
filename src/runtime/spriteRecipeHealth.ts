export interface SpriteRecipeHealth { status: "unchecked" | "ready" | "missing" | "unreachable"; problem: string | null; source: "install" | "discovered" | null; waiting: string[] }

let health: SpriteRecipeHealth | null = null;

export function publishSpriteRecipe(next: SpriteRecipeHealth | null): boolean {
  if (JSON.stringify(health) === JSON.stringify(next)) return false;
  health = next;
  return true;
}

export const spriteRecipeHealth = (): SpriteRecipeHealth | null => health;
