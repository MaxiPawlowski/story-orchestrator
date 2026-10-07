import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const out = resolve('test/sessions/evidence/measurements-v2.7/saga-main-cast');
const audit = JSON.parse(await readFile(join(out, 'resume-audit.json'), 'utf8'));
if (!audit.ok || audit.missing.length || audit.verified.length !== 238) throw new Error('Only a complete verified pack may be archived.');
const inventory = JSON.parse(await readFile(join(out, 'inventory.json'), 'utf8'));
const name = process.argv.includes('--recomposed') ? 'owned-packs-recomposed' : 'owned-packs';
const destination = join(out, name);
await mkdir(destination, { recursive: true });
const files: any[] = [];
for (const member of inventory) for (const set of ['so_saga_main_v1', 'anim-so_saga_main_v1']) {
  const source = join('C:/dev/so-lanes/6/data/default-user/characters', member.folder, set);
  const raw = await readFile(join(source, 'so-sprites.json'), 'utf8');
  const owned = JSON.parse(raw);
  if (owned.owner !== 'story-orchestrator' || owned.character !== member.folder || owned.set !== set) throw new Error('Source set lacks generated ownership evidence.');
  const target = join(destination, member.folder, set);
  await mkdir(target, { recursive: true });
  for (const [label, row] of Object.entries(owned.labels) as Array<[string, any]>) {
    const bytes = await readFile(join(source, `${label}.png`));
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (row.status !== 'complete' || hash !== row.sha256) throw new Error('Owned archive source changed.');
    const existing = await readFile(join(target, `${label}.png`)).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    if (existing && createHash('sha256').update(existing).digest('hex') !== hash) throw new Error('Archive file was changed; preserve it.');
    if (!existing) await writeFile(join(target, `${label}.png`), bytes, { flag: 'wx' });
    files.push({ character: member.folder, set, label, sha256: hash });
  }
  const previous = await readFile(join(target, 'so-sprites.json'), 'utf8').catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
  if (previous && previous !== raw) throw new Error('Archive manifest changed; preserve it.');
  if (!previous) await writeFile(join(target, 'so-sprites.json'), raw, { flag: 'wx' });
}
await writeFile(join(out, `${name}.json`), JSON.stringify({ at: new Date().toISOString(), files, count: files.length }, null, 2));
console.log(JSON.stringify({ destination, files: files.length }));
