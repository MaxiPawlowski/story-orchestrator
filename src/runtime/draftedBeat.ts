export type DraftedId = number | [number];

export interface DraftedBeatDeps {
  prepare: (id: DraftedId) => Promise<boolean>;
  apply: (id: DraftedId) => void;
}

const sameDraft = (a: DraftedId | null, b: DraftedId) => a !== null && JSON.stringify(a) === JSON.stringify(b);

export class DraftedBeat {
  private pending: Promise<void> | null = null;
  private current: DraftedId | null = null;

  constructor(private readonly deps: DraftedBeatDeps) {}

  drafted(id: DraftedId, prepare: boolean): void {
    this.current = id;
    this.deps.apply(id);
    if (!prepare) {
      this.pending = null;
      return;
    }
    this.pending = this.deps.prepare(id).catch(() => false).then((prepared) => {
      if (prepared && sameDraft(this.current, id)) this.deps.apply(id);
    });
  }

  async settle(): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    await pending;
  }

  hasPending(): boolean {
    return this.pending !== null;
  }
}
