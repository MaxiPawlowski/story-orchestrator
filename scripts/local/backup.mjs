import fs from 'node:fs/promises';
import path from 'node:path';

const root = 'C:/dev/SillyTavern-MainBranch';
const target = `C:/dev/backups/story-orchestrator/local-residency-${Date.now()}`;
await fs.mkdir(target, { recursive: true });
const files = [
    ['C:/dev/tray/items/story-orchestrator.json', 'tray-story-orchestrator.json'],
    ...['gpu', 'media'].flatMap((kind) => ['package.json', 'index.mjs', 'gate.mjs', 'managed.mjs', 'files.mjs', 'jobs.mjs', 'config.json'].map((name) => [`${root}/plugins/story-orchestrator-${kind}/${name}`, `${kind}/${name}`])),
];
const copied = [];
for (const [source, name] of files) {
    try { await fs.access(source); } catch { continue; }
    await fs.mkdir(path.dirname(path.join(target, name)), { recursive: true });
    await fs.copyFile(source, path.join(target, name)); copied.push(name);
}
const settings = JSON.parse(await fs.readFile(`${root}/data/default-user/settings.json`, 'utf8'));
const extensions = settings.extension_settings ?? {};
const profiles = (extensions.connectionManager?.profiles ?? []).filter((row) => row.name === 'Artemis Local (Unsloth)' || row.name === 'Story Orchestrator Memory Unsloth');
const selection = {
    profiles: profiles.map((row) => ({ id: row.id, name: row.name, api: row.api, 'api-url': row['api-url'], model: row.model })),
    selectedProfile: extensions.connectionManager?.selectedProfile,
    extraction: { profileId: extensions['story-orchestrator']?.settings?.extraction?.profileId, profiles: extensions['story-orchestrator']?.settings?.extraction?.profiles, routes: extensions['story-orchestrator']?.settings?.extraction?.routes },
    imageDirectorProfileId: extensions['story-orchestrator']?.settings?.image?.directorProfileId,
};
await fs.writeFile(path.join(target, 'routing-before.json'), JSON.stringify(selection, null, 2));
await fs.writeFile('C:/dev/tools/story-orchestrator-local/backup-location.json', JSON.stringify({ target, copied, at: new Date().toISOString() }, null, 2));
console.log(`Preserved ${copied.length} owned configuration/plugin files and routing fields in ${target}`);
