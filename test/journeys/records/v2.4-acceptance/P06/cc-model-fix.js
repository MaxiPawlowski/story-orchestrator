const B = String.fromCharCode(92);
const o = (await import('/scripts/openai.js')).oai_settings;
o.custom_model = ['E:', 'models', 'huggingface', 'PygmalionAI', 'Mythalion-Kimiko-v2_Q5_1_8K', 'Mythalion-Kimiko-v2_Q5_1_8K.gguf'].join(B);
const el = document.querySelector('#custom_model_id'); if (el) el.value = o.custom_model;
const orig = window.fetch; let status = null;
window.fetch = async function (url) { const r = await orig.apply(this, arguments); if (String(url).includes('/api/settings/save')) status = r.status; return r; };
try { await (await import('/script.js')).saveSettings(); } finally { window.fetch = orig; }
const file = JSON.parse((await (await fetch('/api/settings/get', { method: 'POST', headers: SillyTavern.getContext().getRequestHeaders(), body: '{}' })).json()).settings);
return { saveStatus: status, custom_model: file.oai_settings?.custom_model, main_api: file.main_api, mainApi: SillyTavern.getContext().mainApi };
