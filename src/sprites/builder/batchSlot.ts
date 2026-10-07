import type { SpriteBatchLease } from "./batchLease";

let active: SpriteBatchLease | null = null;

export const activeSpriteBatch = (): SpriteBatchLease | null => active;
export const setActiveSpriteBatch = (batch: SpriteBatchLease | null): void => { active = batch; };
