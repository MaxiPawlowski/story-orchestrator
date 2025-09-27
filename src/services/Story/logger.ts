// src/services/story/logger.ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function makeLogger(ns: string, min: LogLevel = 'debug') {
  const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
  const threshold = order[min] ?? 10;

  return (level: LogLevel, msg: string, data?: any) => {
    if ((order[level] ?? 99) < threshold) return;
    const payload = data ? { ...data } : undefined;
    // eslint-disable-next-line no-console
    (console as any)[level]?.(`[${ns}] ${msg}`, payload ?? '') ||
      console.log(`[${ns}] ${level.toUpperCase()} ${msg}`, payload ?? '');
  };
}
