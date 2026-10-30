export interface LoreBinding {
  book: string;
  entry: string;
}

export type LoreBindings = Record<string, LoreBinding>;

export const LORE_BINDING_KEYS = ["book", "entry"] as const;
export const LORE_BINDINGS_MAX = 60;
