import fs from 'node:fs/promises';

const [current, candidate, backup] = process.argv.slice(2);
if (!current || !candidate || !backup) throw new Error('Usage: promoteLocal.mjs <current config> <verified candidate> <new backup>');
const prior = await fs.readFile(current, 'utf8');
const next = JSON.parse(await fs.readFile(candidate, 'utf8'));
const saved = JSON.parse(prior);
const status = await (await fetch(`http://127.0.0.1:${saved.gatewayPort}/status`)).json();
if (status.activeText || status.imageLease || status.waitingText) throw new Error('Finish active/queued work before selecting the verified interpreter.');
if (status.configFile.replace(/\\/g, '/').toLowerCase() !== candidate.replace(/\\/g, '/').toLowerCase()) throw new Error('The running controller is not the candidate being selected.');
await fs.writeFile(backup, prior, { flag: 'wx' });
for (const key of ['comfyPython', 'telemetryPython', 'comfyExtraArgs', 'modelCacheRoot']) saved[key] = next[key];
await fs.writeFile(current, JSON.stringify(saved, null, 2));
console.log(`Selected verified stock interpreter for playtest; previous config: ${backup}`);
