import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { log } from "./log";

export interface MountCounts {
  roots: number;
  elements: number;
  listeners: number;
  timers: number;
  globals: number;
  disposers: number;
}

export interface MountRegistry {
  root(container: Element, node: ReactNode): Root;
  element<T extends Element>(element: T): T;
  listen(target: EventTarget, type: string, handler: () => void, options?: AddEventListenerOptions): void;
  timeout(run: () => void, ms: number): void;
  global(name: string, value: unknown): void;
  add(dispose: () => void): void;
  counts(): MountCounts;
  dispose(): void;
}

type Listener = { target: EventTarget; type: string; handler: EventListener; options?: AddEventListenerOptions };

const safely = (what: string, run: () => void) => {
  try {
    run();
  } catch (error) {
    log.warn(what, error);
  }
};

export function createMountRegistry(): MountRegistry {
  const roots = new Set<Root>();
  const elements = new Set<Element>();
  const listeners = new Set<Listener>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const globals = new Set<string>();
  const disposers: Array<() => void> = [];
  return {
    root(container, node) {
      const root = createRoot(container);
      roots.add(root);
      root.render(node);
      return root;
    },
    element(element) {
      elements.add(element);
      return element;
    },
    listen(target, type, handler, options) {
      const entry: Listener = {
        target,
        type,
        options,
        handler: () => {
          if (options?.once) listeners.delete(entry);
          handler();
        },
      };
      listeners.add(entry);
      target.addEventListener(type, entry.handler, options);
    },
    timeout(run, ms) {
      const id = setTimeout(() => {
        timers.delete(id);
        run();
      }, ms);
      timers.add(id);
    },
    global(name, value) {
      Reflect.set(globalThis, name, value);
      globals.add(name);
    },
    add(dispose) {
      disposers.push(dispose);
    },
    counts: () => ({
      roots: roots.size,
      elements: elements.size,
      listeners: listeners.size,
      timers: timers.size,
      globals: globals.size,
      disposers: disposers.length,
    }),
    dispose() {
      for (const root of roots) safely("a React root failed to unmount", () => root.unmount());
      roots.clear();
      for (const entry of listeners) entry.target.removeEventListener(entry.type, entry.handler, entry.options);
      listeners.clear();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const name of globals) Reflect.deleteProperty(globalThis, name);
      globals.clear();
      for (const element of elements) element.remove();
      elements.clear();
      for (const dispose of disposers.splice(0)) safely("a mount disposer failed", dispose);
    },
  };
}
