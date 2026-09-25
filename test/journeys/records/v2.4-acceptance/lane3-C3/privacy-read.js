const rows = globalThis.__soPrivacy ?? null;
return { installed: Boolean(globalThis.__soPrivacyInstalled), count: rows ? rows.length : null, rows };
