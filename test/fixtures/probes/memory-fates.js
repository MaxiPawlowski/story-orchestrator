// AE-03 (test-only; never installed). What ST's next prompt ACTUALLY holds for the memory tiers,
// read from the extension prompt slots ST keeps (the applied artifact), never from
// getMemoryInjectionBlocks(), which re-renders the tiers from the store and can only agree with the
// slots by luck. Loaded by the `inject_script` verb; unit-tested in scripts/debug/memoryFatesProbe.test.mts.
(() => {
  const prefix = 'story_orchestrator_memory_';
  const appliedMemorySlots = (extensionPrompts) => Object.entries(extensionPrompts ?? {})
    .filter(([key, entry]) => key.startsWith(prefix) && entry && typeof entry.value === 'string' && entry.value.trim().length > 0)
    .map(([key, entry]) => ({ key, value: entry.value }));
  const injectedFateFailures = ({ entries, fates, extensionPrompts }) => {
    const slots = appliedMemorySlots(extensionPrompts);
    const held = slots.map((slot) => slot.value).join(String.fromCharCode(10));
    const injected = (entries ?? []).filter((row) => fates?.[row.id] === 'injected');
    if (!injected.length) return ['no row is fated injected, so the memory slots ST holds were checked against nothing'];
    const failures = [];
    for (const row of injected) {
      const needle = String(row.text ?? '').slice(0, 40);
      if (!needle.trim()) failures.push(`${row.id} is fated injected but has no text to look for`);
      else if (!held.includes(needle)) failures.push(`${row.id} is fated injected but its text is not in the memory slots ST holds (applied: ${slots.map((slot) => slot.key).join(', ') || 'none'})`);
    }
    return failures;
  };
  const check = () => {
    const snapshot = globalThis.storyOrchestratorRuntime.getSnapshot();
    const extensionPrompts = globalThis.SillyTavern.getContext().extensionPrompts;
    return {
      failures: injectedFateFailures({ entries: snapshot.memory?.entries ?? [], fates: snapshot.memoryInjection?.fates ?? {}, extensionPrompts }),
      applied: appliedMemorySlots(extensionPrompts).map((slot) => slot.key),
    };
  };
  globalThis.__soFatesProbe = { prefix, appliedMemorySlots, injectedFateFailures, check };
  return { installed: true };
})();
