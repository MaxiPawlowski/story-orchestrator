import type { PixelImage } from "./pixels";

export interface RawEdit { image: PixelImage; data: string }

export class RawEditCache {
  private entries = new Map<string, RawEdit>();
  private bytes = 0;

  constructor(private readonly limit = 32 * 1024 * 1024) {}

  get(key: string): RawEdit | undefined { return this.entries.get(key); }

  put(key: string, value: RawEdit): void {
    const size = value.image.data.byteLength + value.data.length * 2;
    if (size > this.limit || this.entries.has(key)) return;
    while (this.bytes + size > this.limit) {
      const oldest = this.entries.entries().next().value;
      if (!oldest) break;
      this.entries.delete(oldest[0]); this.bytes -= oldest[1].image.data.byteLength + oldest[1].data.length * 2;
    }
    this.entries.set(key, value); this.bytes += size;
  }

  clear(): void { this.entries.clear(); this.bytes = 0; }
}
