import type { BackdropAssetProvider, BackdropAssets, BackdropBase } from "./types";
import { log } from "@utils/log";

const providers = new Map<string, BackdropAssetProvider>();
const changeListeners = new Set<(key: string | null) => void>();
const shownListeners = new Set<(base: BackdropBase | null) => void>();
let shown: BackdropBase | null = null;

export const registerAssetProvider = (provider: BackdropAssetProvider): (() => void) => {
  providers.set(provider.id, provider);
  notifyAssetsChanged(null);
  return () => {
    if (providers.get(provider.id) !== provider) return;
    providers.delete(provider.id);
    notifyAssetsChanged(null);
  };
};

export const lookupAssets = async (base: BackdropBase): Promise<BackdropAssets> => {
  const found = await Promise.all([...providers.values()].map(async (provider) => {
    try { return (await provider.lookup(base)) ?? {}; }
    catch (error) { log.warn(`Backdrop asset provider ${provider.id} failed`, error); return {}; }
  }));
  return found.reduce<BackdropAssets>((merged, part) => ({ ...merged, ...Object.fromEntries(Object.entries(part).filter(([, value]) => typeof value === "string" && value)) }), {});
};

export const notifyAssetsChanged = (key: string | null): void => {
  changeListeners.forEach((listener) => listener(key));
};

export const onAssetsChanged = (listener: (key: string | null) => void): (() => void) => {
  changeListeners.add(listener);
  return () => { changeListeners.delete(listener); };
};

export const noteBaseShown = (base: BackdropBase | null): void => {
  if (shown?.key === base?.key && shown?.url === base?.url) return;
  shown = base;
  shownListeners.forEach((listener) => listener(base));
};

export const shownBase = (): BackdropBase | null => shown;

export const onBaseShown = (listener: (base: BackdropBase | null) => void): (() => void) => {
  shownListeners.add(listener);
  return () => { shownListeners.delete(listener); };
};
