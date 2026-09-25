const o = (await import('/scripts/openai.js')).oai_settings;
o.custom_include_body = 'chat_template_kwargs: {enable_thinking: false}';
const el = document.querySelector('#custom_include_body'); if (el) el.value = o.custom_include_body;
const orig = window.fetch; let status = null;
window.fetch = async function (url) { const r = await orig.apply(this, arguments); if (String(url).includes('/api/settings/save')) status = r.status; return r; };
try { await (await import('/script.js')).saveSettings(); } finally { window.fetch = orig; }
return { mainApi: SillyTavern.getContext().mainApi, source: o.chat_completion_source, url: o.custom_url, model: o.custom_model, body: o.custom_include_body, saveStatus: status };
