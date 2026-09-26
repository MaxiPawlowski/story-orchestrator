export interface SwipeKey {
  chat: string;
  message: number;
  text: string;
  scope: string;
  story: string;
}

export const SWIPE_KEY_PARTS: ReadonlyArray<keyof SwipeKey> = ["chat", "message", "text", "scope", "story"];

export const swipeKeyOf = (key: SwipeKey, parts: ReadonlyArray<keyof SwipeKey> = SWIPE_KEY_PARTS): string =>
  JSON.stringify(parts.map((part) => [part, key[part]]));

export class SwipeCache<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly capacity = 32, private readonly keyOf: (key: SwipeKey) => string = (key) => swipeKeyOf(key)) {}

  put(key: SwipeKey, value: T) {
    const id = this.keyOf(key);
    this.entries.delete(id);
    this.entries.set(id, value);
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.capacity) break;
      this.entries.delete(oldest);
    }
  }

  get(key: SwipeKey): T | null {
    return this.entries.get(this.keyOf(key)) ?? null;
  }

  get size() {
    return this.entries.size;
  }
}
