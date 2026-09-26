export class SnapshotCache<T> {
  private value: T | null = null;
  private built = 0;

  constructor(private readonly build: () => T) {}

  read(): T {
    if (this.value === null) {
      this.value = this.build();
      this.built += 1;
    }
    return this.value;
  }

  invalidate(): void {
    this.value = null;
  }

  get builds(): number {
    return this.built;
  }
}
