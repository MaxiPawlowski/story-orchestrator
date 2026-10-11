export interface SchedulerActivity {
  inFlight: boolean;
  queueDepth: number;
  held?: number;
  heavyInFlight?: boolean;
  heavyQueueDepth?: number;
  heavyHeld?: number;
}

export const schedulerIdle = (scheduler: SchedulerActivity | null | undefined): boolean => Boolean(scheduler
  && !scheduler.inFlight && !scheduler.heavyInFlight
  && scheduler.queueDepth <= (scheduler.held ?? 0)
  && (scheduler.heavyQueueDepth ?? 0) <= (scheduler.heavyHeld ?? 0));
