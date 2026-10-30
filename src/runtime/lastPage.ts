import { LAST_PAGE_KEY } from "./workspaceRoutes";

const storage = (): Storage | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export const readLastPage = (): string | null => { try { return storage()?.getItem(LAST_PAGE_KEY) ?? null; } catch { return null; } };

export const writeLastPage = (value: string): boolean => { try { storage()?.setItem(LAST_PAGE_KEY, value); return true; } catch { return false; } };
