const o = (await import('/scripts/openai.js')).oai_settings;
const state = await fetch('/api/backends/chat-completions/status',{method:'POST',headers:ctx.getRequestHeaders(),body:JSON.stringify({chat_completion_source:'custom',custom_url:o.custom_url})});
const result=await state.json();
return {status:state.status, models:result, online:ctx.onlineStatus, alerts:[...document.querySelectorAll('.toast-message')].map(x=>x.textContent)};
