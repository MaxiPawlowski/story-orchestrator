import { writeFile, mkdir, readdir, stat, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import { DEBUG_DIR } from './connection.mts';

const SCREENSHOT_DIR = resolve(DEBUG_DIR, 'screenshots');
const MAX_ARTIFACTS = 40;

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function artifactPath(label: string, ext: string, dir: string = DEBUG_DIR): string {
  const safe = label.replace(/[^a-zA-Z0-9_-]/g, '_');
  return resolve(dir, `${timestamp()}_${safe}.${ext}`);
}

async function rotateDir(dir: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  const files: { path: string; mtime: number }[] = [];
  for (const entry of entries) {
    const path = resolve(dir, entry);
    try {
      const info = await stat(path);
      if (info.isFile() && entry !== 'session.json') files.push({ path, mtime: info.mtimeMs });
    } catch {}
  }
  files.sort((a, b) => b.mtime - a.mtime);
  await Promise.all(files.slice(MAX_ARTIFACTS).map((file) => rm(file.path, { force: true })));
}

export async function rotateDebugArtifacts(): Promise<void> {
  await rotateDir(DEBUG_DIR);
  await rotateDir(SCREENSHOT_DIR);
}

export async function writeJSON(data: unknown, label = 'data'): Promise<string> {
  await mkdir(DEBUG_DIR, { recursive: true });
  await rotateDebugArtifacts();
  const path = artifactPath(label, 'json');
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Wrote JSON: ${path}`);
  return path;
}

export async function writeText(text: string, label = 'text'): Promise<string> {
  await mkdir(DEBUG_DIR, { recursive: true });
  await rotateDebugArtifacts();
  const path = artifactPath(label, 'txt');
  await writeFile(path, text, 'utf-8');
  console.log(`Wrote text: ${path}`);
  return path;
}

export async function writeScreenshot(page: Page, label = 'screenshot'): Promise<string> {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await rotateDebugArtifacts();
  const path = artifactPath(label, 'png', SCREENSHOT_DIR);
  try {
    await page.screenshot({ path, fullPage: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Target closed') || message.includes('Session closed')) {
      throw new Error(`Browser closed during screenshot. ${message}`);
    }
    throw new Error(`Screenshot failed: ${message}`);
  }
  console.log(`Screenshot saved: ${path}`);
  return path;
}
