#!/usr/bin/env node
// Apply one mutation, prove it landed, run a command, restore the file.
//
// Why this exists: on 2026-09-20 a `perl -0` mutation sweep silently matched nothing, so the
// command ran against an UNCHANGED file and the run was read as "this mutation survives". A
// survived mutation is the evidence you act on — it says the code is dead and can be deleted — so
// a sweep that cannot prove it edited anything is worse than no sweep at all.
//
//   node scripts/mutate.mjs <file> <line> <replacement> -- <command...>
//   node scripts/mutate.mjs <file> --find <text> --replace <text> -- <command...>
//
// Exits 1 if the file did not change, before running anything.

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const split = argv.indexOf('--');
if (split < 0) {
  console.error('Usage: node scripts/mutate.mjs <file> <line|--find X --replace Y> -- <command...>');
  process.exit(2);
}
const spec = argv.slice(0, split);
const command = argv.slice(split + 1);
const file = spec[0];

const original = readFileSync(file, 'utf-8');
let mutated;

if (spec[1] === '--find') {
  const find = spec[2];
  const replaceAt = spec.indexOf('--replace');
  const replacement = replaceAt >= 0 ? spec[replaceAt + 1] : '';
  if (!original.includes(find)) {
    console.error(`MUTATION DID NOT APPLY: ${file} does not contain the text to replace.`);
    console.error(`  looked for: ${find}`);
    process.exit(1);
  }
  mutated = original.replace(find, replacement);
} else {
  const line = Number(spec[1]);
  const replacement = spec.slice(2).join(' ');
  const lines = original.split('\n');
  if (!Number.isInteger(line) || line < 1 || line > lines.length) {
    console.error(`MUTATION DID NOT APPLY: ${file} has ${lines.length} lines, cannot mutate line ${spec[1]}.`);
    process.exit(1);
  }
  lines[line - 1] = replacement;
  mutated = lines.join('\n');
}

if (mutated === original) {
  console.error(`MUTATION DID NOT APPLY: ${file} is unchanged after the edit — the run below would have proved nothing.`);
  process.exit(1);
}

writeFileSync(file, mutated, 'utf-8');
try {
  const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit', shell: true });
  // The mutation is the experiment: a non-zero exit means the tests noticed, which is the pass.
  console.log(`\nmutation exit=${result.status} (non-zero means the mutation was CAUGHT)`);
  process.exitCode = result.status === 0 ? 3 : 0;
} finally {
  writeFileSync(file, original, 'utf-8');
}
