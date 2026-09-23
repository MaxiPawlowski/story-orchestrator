// V22 (v2.3 process rule 11): a claim cites an archived record that exists. Gate records and plan
// docs cite repo paths in backticks; `.debug/` rotates and cannot be cited by a gate record written
// since the 2026-09-23 replan. This reads every backticked path out of the docs and resolves it.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['test/', 'docs/', 'scripts/', 'src/', 'examples/', '.claude/', 'records/'];

const expandBraces = (path) => {
  const match = /\{([^{}]*)\}/.exec(path);
  if (!match) return [path];
  return match[1].split(',').flatMap((part) => expandBraces(path.slice(0, match.index) + part + path.slice(match.index + match[0].length)));
};

/** Backticked repo paths in a markdown text, normalised: `records/` expands to test/journeys/records/, `:line` and `#anchor` are dropped. */
export function citedPaths(text) {
  const found = [];
  for (const [, raw] of text.matchAll(/`([^`\n]+)`/g)) {
    const token = raw.trim().split(/\s+/)[0].replace(/[),.;]+$/, '');
    if (!ROOTS.some((root) => token.startsWith(root))) continue;
    if (/[<>*$]|\.\.\./.test(token)) continue;
    const bare = token.replace(/#.*$/, '').replace(/(?::[\d,–-]+)+$/, '').replace(/:[A-Za-z_][\w.]*$/, '');
    for (const path of expandBraces(bare)) found.push(path.startsWith('records/') ? `test/journeys/${path}` : path);
  }
  return [...new Set(found)];
}

/** `.debug/` citations inside a gate record written since the replan (a `### V… gate` section). */
export function debugCitationsInReplanRecords(text) {
  const hits = [];
  let inReplanRecord = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^#{2,4} /.test(line)) inReplanRecord = /^#{2,4} V\d+[a-z]?\b.*gate/i.test(line);
    if (!inReplanRecord) continue;
    for (const [, raw] of line.matchAll(/`([^`\n]+)`/g)) if (/^\.debug\/\S/.test(raw.trim())) hits.push(raw.trim());
  }
  return hits;
}

export function docFiles(root) {
  const plans = join(root, 'docs/plans/v2.3');
  return [...readdirSync(plans).filter((name) => name.endsWith('.md')).map((name) => join('docs/plans/v2.3', name)), '.claude/CLAUDE.md'];
}

export function missingCitations(root, files = docFiles(root)) {
  const missing = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf-8');
    for (const path of citedPaths(text)) if (!existsSync(join(root, path))) missing.push({ file, path });
  }
  return missing;
}
