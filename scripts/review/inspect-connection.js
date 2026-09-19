const o = (await import('/scripts/openai.js')).oai_settings;
return {source:o.chat_completion_source,url:o.custom_url,model:o.custom_model,body:o.custom_include_body,profiles:ctx.extensionSettings.connectionManager?.profiles.map(p=>({id:p.id,api:p.api,preset:p.preset})),settings:rt.getExtractionSettings()};
