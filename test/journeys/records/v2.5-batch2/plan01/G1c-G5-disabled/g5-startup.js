const B = 'Adolion Academy Checkpoints', C = 'CP nightriver-house - Scene';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 120 && !globalThis.storyOrchestratorScanGating?.active?.(); i++) await sleep(250);
const h = SillyTavern.getContext().getRequestHeaders();
const disk = async () => Object.values((await (await fetch('/api/worldinfo/get', { method: 'POST', headers: h, body: JSON.stringify({ name: B }), cache: 'no-cache' })).json()).entries).find((x) => String(x.comment ?? '').trim() === C)?.disable ?? null;
const rt = globalThis.storyOrchestratorRuntime;
const s = rt.getSnapshot().wiGating;
return { soLoaded: Boolean(rt), chat: SillyTavern.getContext().chatId ?? null, mode: rt.getGlobalSettings().worldInfo.gatingMode, active: globalThis.storyOrchestratorScanGating?.active?.() ?? null, drift: s?.drift ?? null, diskDisable: await disk(), repair: document.querySelector('[data-so="repair-step"]')?.textContent ?? null, renormButton: Boolean(document.querySelector('#so-wi-renormalize')), journal: (rt.extras?.journal ?? []).slice(-5) };
