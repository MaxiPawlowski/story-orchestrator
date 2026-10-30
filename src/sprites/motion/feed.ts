import { stageCues, type StageCue, type StageSignals } from "./cues";

export interface MotionFeedView {
  seq: number;
  cues: readonly StageCue[];
  tension: string | null;
  backgrounds: readonly string[];
}

export class MotionFeed {
  private last: StageSignals | null = null;
  private state: MotionFeedView = { seq: 0, cues: [], tension: null, backgrounds: [] };
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  view = (): MotionFeedView => this.state;

  update(next: StageSignals): void {
    const cues = stageCues(this.last, next);
    this.last = next;
    const backgrounds = next.backgrounds ?? [];
    const sameBackgrounds = backgrounds.join("|") === this.state.backgrounds.join("|");
    if (!cues.length && next.tension === this.state.tension && sameBackgrounds) return;
    this.state = { seq: cues.length ? this.state.seq + 1 : this.state.seq, cues: cues.length ? cues : this.state.cues, tension: next.tension,
      backgrounds: sameBackgrounds ? this.state.backgrounds : backgrounds };
    for (const listener of this.listeners) listener();
  }
}
