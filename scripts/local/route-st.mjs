import fs from 'node:fs';

const file = 'C:/dev/SillyTavern-MainBranch/data/default-user/settings.json';
const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
const ext = settings.extension_settings;
const cm = ext.connectionManager;
const before = { profiles: [], extraction: null, imageBackend: null, imageComfyUrl: null };

const localProfiles = cm.profiles.filter((row) => row.name === 'Artemis Local (Unsloth)' || row.name === 'Story Orchestrator Memory Unsloth');
if (localProfiles.length !== 2) throw new Error(`expected 2 local profiles, found ${localProfiles.length}`);
for (const profile of localProfiles) {
    before.profiles.push({ name: profile.name, api: profile.api });
    profile.api = 'llamacpp';
}
const memoryProfile = localProfiles.find((row) => row.name === 'Story Orchestrator Memory Unsloth');
if (!memoryProfile) throw new Error('memory profile missing');

const so = ext['story-orchestrator'].settings;
before.extraction = JSON.parse(JSON.stringify(so.extraction));
so.extraction.profileId = memoryProfile.id;
for (const role of Object.keys(so.extraction.profiles ?? {})) so.extraction.profiles[role] = memoryProfile.id;
so.extraction.fallbackProfileId = memoryProfile.id;

before.imageBackend = so.image.backend ?? null;
before.imageComfyUrl = so.image.comfyUrl;
so.image.backend = 'comfy';
so.image.comfyUrl = 'http://127.0.0.1:8188';

fs.writeFileSync(file, JSON.stringify(settings, null, 2));
fs.writeFileSync('C:/dev/tools/story-orchestrator-local/routing-after.json', JSON.stringify({
    at: new Date().toISOString(),
    localProfiles: localProfiles.map((row) => ({ name: row.name, api: row.api, url: row['api-url'] })),
    extraction: { profileId: so.extraction.profileId, profiles: so.extraction.profiles, fallbackProfileId: so.extraction.fallbackProfileId },
    image: { backend: so.image.backend, comfyUrl: so.image.comfyUrl, directorProfileId: so.image.directorProfileId },
    before,
}, null, 2));
console.log('Routing set: chat + all extraction passes -> local memory/chat profiles (llamacpp/18888); image backend -> comfy (media plugin + broker); image director unchanged:', so.image.directorProfileId);
