const openai = await import('/scripts/openai.js');
const before = {
    source: openai.oai_settings.chat_completion_source,
    url: openai.oai_settings.custom_url,
    model: openai.oai_settings.custom_model,
    online: ctx.onlineStatus,
};

// Exercise SillyTavern's real connection handler.  This is deliberately a
// browser-side review helper: it does not alter extension or host source.
$('#api_button_openai').trigger('click');
const deadline = Date.now() + 30_000;
while (Date.now() < deadline && ctx.onlineStatus === 'no_connection') {
    await new Promise(resolve => setTimeout(resolve, 250));
}

return {
    before,
    after: {
        online: ctx.onlineStatus,
        statusText: document.querySelector('.online_status_text')?.textContent?.trim(),
        buttonLoading: document.querySelector('#api_button_openai')?.classList.contains('api_loading'),
    },
    alerts: [...document.querySelectorAll('.toast-message')].map(node => node.textContent?.trim()),
};
