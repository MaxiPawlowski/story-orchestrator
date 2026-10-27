type MemoryContract = typeof import("./contract");

let pending: Promise<MemoryContract> | null = null;

export const loadMemoryContract = (): Promise<MemoryContract> =>
  (pending ??= import("./contract").catch((error: unknown) => { pending = null; throw error; }));
