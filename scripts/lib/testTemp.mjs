import { mkdtempSync, rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const RM_TEMP = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 };

const made = new Set();

export function removeTempDirs() {
  const left = [];
  for (const dir of made) {
    try {
      rmSync(dir, RM_TEMP);
      made.delete(dir);
    } catch {
      left.push(dir);
    }
  }
  return left;
}

function track(dir) {
  if (!made.size) process.once('exit', removeTempDirs);
  made.add(dir);
  return dir;
}

export const testTempDirSync = (prefix, base = tmpdir()) => track(mkdtempSync(join(base, prefix)));

export const testTempDir = async (prefix, base = tmpdir()) => track(await mkdtemp(join(base, prefix)));
