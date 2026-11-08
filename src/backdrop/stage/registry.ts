import type { BackdropAutoInput, BackdropGate, BackdropLayerFactory, BackdropLayerOptions, BackdropLayerSpec } from "../types";

export interface RegisteredLayer {
  kind: string;
  factory: BackdropLayerFactory;
  gate: BackdropGate;
  auto?: BackdropLayerOptions["auto"];
}

const layers = new Map<string, RegisteredLayer>();
const listeners = new Set<() => void>();

export const registerLayer = (kind: string, factory: BackdropLayerFactory, options: BackdropLayerOptions = {}): (() => void) => {
  const entry: RegisteredLayer = { kind, factory, gate: options.gate ?? "effects", ...(options.auto ? { auto: options.auto } : {}) };
  layers.set(kind, entry);
  listeners.forEach((listener) => listener());
  return () => {
    if (layers.get(kind) !== entry) return;
    layers.delete(kind);
    listeners.forEach((listener) => listener());
  };
};

export const registeredLayer = (kind: string): RegisteredLayer | null => layers.get(kind) ?? null;

export const registeredKinds = (): string[] => [...layers.keys()];

export const onLayersChanged = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const gateOpen = (gate: BackdropGate, settings: BackdropAutoInput["settings"]): boolean => settings.enabled && settings[gate];

export const autoLayers = (input: BackdropAutoInput): BackdropLayerSpec[] => [...layers.values()].flatMap((entry) => {
  if (!entry.auto || !gateOpen(entry.gate, input.settings)) return [];
  const spec = entry.auto(input);
  return spec ? [spec] : [];
});
