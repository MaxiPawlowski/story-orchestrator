export class InFlight {
  private readonly writes = new Set<Promise<unknown>>();

  track<T>(write: Promise<T>): Promise<T> {
    this.writes.add(write);
    const settle = () => { this.writes.delete(write); };
    write.then(settle, settle);
    return write;
  }

  async settled() {
    while (this.writes.size) await Promise.allSettled([...this.writes]);
  }
}
