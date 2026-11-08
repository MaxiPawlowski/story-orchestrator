export const FRAME_WINDOW = 240;

export class FrameStats {
  private readonly intervals: number[] = [];
  private readonly costs: number[] = [];
  private last = 0;
  frames = 0;

  record(now: number, cost: number): void {
    if (this.last) this.push(this.intervals, now - this.last);
    this.push(this.costs, cost);
    this.last = now;
    this.frames += 1;
  }

  pause(): void { this.last = 0; }

  private push(list: number[], value: number): void {
    list.push(value);
    if (list.length > FRAME_WINDOW) list.shift();
  }

  static median(values: readonly number[]): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  view(): { frames: number; fpsMedian: number; frameMsMedian: number; drawMsMedian: number; samples: number } {
    const interval = FrameStats.median(this.intervals);
    return {
      frames: this.frames, samples: this.intervals.length, fpsMedian: interval ? Math.round((1000 / interval) * 10) / 10 : 0,
      frameMsMedian: Math.round(interval * 100) / 100, drawMsMedian: Math.round(FrameStats.median(this.costs) * 100) / 100,
    };
  }
}

export const MIN_FRAME_MS = 1000 / 60 - 4;

export const shouldDraw = (now: number, last: number, fps = 60): boolean => now - last >= Math.max(MIN_FRAME_MS, 1000 / Math.max(1, fps) - 4);
