import { createElement, lazy } from "react";

type LazyComponent = Awaited<ReturnType<Parameters<typeof lazy>[0]>>["default"];

const failed = new Set<() => void>();

export function lazyRetry<T extends LazyComponent>(factory: () => Promise<{ default: T }>): T {
  const load = () => lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      failed.add(reset);
      throw error;
    }
  });
  let current: LazyComponent = load();
  const reset = () => { current = load(); };
  const LazyRetry = (props: object) => createElement(current, props);
  return LazyRetry as unknown as T;
}

export const resetFailedLazies = (): number => {
  const count = failed.size;
  failed.forEach((reset) => reset());
  failed.clear();
  return count;
};
