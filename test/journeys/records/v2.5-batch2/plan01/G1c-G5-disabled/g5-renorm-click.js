const B = 'Adolion Academy Checkpoints', C = 'CP nightriver-house - Scene';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const btn = document.querySelector('#so-wi-renormalize');
const was = { disabled: btn?.disabled ?? null, text: btn?.textContent ?? null };
btn.click();
let dialogText = null;
for (let i = 0; i < 20; i++) { const d = document.querySelector('dialog[open]'); if (d) { dialogText = (d.querySelector('.popup-content')?.textContent ?? '').slice(0, 300); d.querySelector('.popup-button-ok')?.click(); break; } await sleep(150); }
const rt = globalThis.storyOrchestratorRuntime;
for (let i = 0; i < 80 && (rt.getSnapshot().wiGating?.drift?.length ?? 1) !== 0; i++) await sleep(250);
await sleep(1000);
const h = SillyTavern.getContext().getRequestHeaders();
const disk = Object.values((await (await fetch('/api/worldinfo/get', { method: 'POST', headers: h, body: JSON.stringify({ name: B }), cache: 'no-cache' })).json()).entries).find((x) => String(x.comment ?? '').trim() === C)?.disable ?? null;
return { button: was, dialogText, drift: rt.getSnapshot().wiGating?.drift?.length ?? null, diskDisable: disk, repair: document.querySelector('[data-so="repair-step"]')?.textContent ?? null };
