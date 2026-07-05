import { writeFile, mkdir, readdir, stat, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEBUG_DIR } from './connection.mjs';

const SCREENSHOT_DIR = resolve(DEBUG_DIR, 'screenshots');
const MAX_ARTIFACTS = 40;

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function artifactPath(label, ext, dir = DEBUG_DIR) {
  const safe = label.replace(/[^a-zA-Z0-9_-]/g, '_');
  return resolve(dir, `${timestamp()}_${safe}.${ext}`);
}

async function rotateDir(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  const files = [];
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

export async function rotateDebugArtifacts() {
  await rotateDir(DEBUG_DIR);
  await rotateDir(SCREENSHOT_DIR);
}

export async function writeJSON(data, label = 'data') {
  await mkdir(DEBUG_DIR, { recursive: true });
  await rotateDebugArtifacts();
  const path = artifactPath(label, 'json');
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Wrote JSON: ${path}`);
  return path;
}

export async function writeText(text, label = 'text') {
  await mkdir(DEBUG_DIR, { recursive: true });
  await rotateDebugArtifacts();
  const path = artifactPath(label, 'txt');
  await writeFile(path, text, 'utf-8');
  console.log(`Wrote text: ${path}`);
  return path;
}

export async function writeScreenshot(page, label = 'screenshot') {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await rotateDebugArtifacts();
  const path = artifactPath(label, 'png', SCREENSHOT_DIR);
  try {
    await page.screenshot({ path, fullPage: true });
  } catch (err) {
    const message = err.message || String(err);
    if (message.includes('Target closed') || message.includes('Session closed')) {
      throw new Error(`Browser closed during screenshot. ${message}`);
    }
    throw new Error(`Screenshot failed: ${message}`);
  }
  console.log(`Screenshot saved: ${path}`);
  return path;
}
