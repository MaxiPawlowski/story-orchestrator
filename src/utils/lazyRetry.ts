import { createElement, lazy, type ComponentProps, type ElementType, type ReactElement } from "react";

type LazyComponent = Awaited<ReturnType<Parameters<typeof lazy>[0]>>["default"];

const failed = new Set<() => void>();

export function lazyRetry<T extends LazyComponent>(factory: () => Promise<{ default: T }>): (props: ComponentProps<T>) => ReactElement {
  const load = () => lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      failed.add(reset);
      throw error;
    }
  });
  let current: ElementType = load();
  const reset = () => { current = load(); };
  const LazyRetry = (props: ComponentProps<T>): ReactElement => createElement(current, props);
  return LazyRetry;
}

export const resetFailedLazies = (): number => {
  const count = failed.size;
  failed.forEach((reset) => reset());
  failed.clear();
  return count;
};
