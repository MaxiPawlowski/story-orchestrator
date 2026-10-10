import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { openMostRecentGroupChat } from './st-navigation.mts';

function decodeRuntime(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const engine = entry.engineState ?? {};
  return {
    storyId: entry.storyId ?? null,
    storyHash: entry.contentHashAtLoad ?? entry.storyHash ?? null,
    pinned: Boolean(entry.pinnedStory),
    storyTitle: entry.storyTitle ?? null,
    activeCheckpointId: engine.activeCheckpointId ?? null,
    boundary: engine.boundary ?? 0,
    checkpointStartedBoundary: engine.checkpointStartedBoundary ?? null,
    visitedAnchors: engine.visitedAnchors ?? [],
    blackboard: engine.blackboard?.values ?? {},
    versions: engine.blackboard?.versions ?? {},
    latched: engine.blackboard?.latched ?? {},
    requirements: entry.extras?.requirements ?? null,
    firedNpcReplies: entry.extras?.firedNpcReplies ?? {},
    lastSessionAt: entry.extras?.lastSessionAt ?? null,
    extraction: entry.extras?.extraction ? {
      settings: entry.extras.extraction.settings ?? null,
      scheduler: entry.extras.extraction.scheduler ?? null,
      lastReadBoundary: entry.extras.extraction.lastReadBoundary ?? 0,
      factCount: Array.isArray(entry.extras?.memory?.entries)
        ? entry.extras.memory.entries.filter((e) => e.tier === 'facts').length
        : (Array.isArray(entry.extras.extraction.facts) ? entry.extras.extraction.facts.length : 0),
      auditCount: Array.isArray(entry.extras.extraction.audits) ? entry.extras.extraction.audits.length : 0,
      lastAudit: Array.isArray(entry.extras.extraction.audits) && entry.extras.extraction.audits.length
        ? entry.extras.extraction.audits[entry.extras.extraction.audits.length - 1]
        : null,
      reconciliationEvents: Array.isArray(entry.extras.extraction.reconciliationEvents) ? entry.extras.extraction.reconciliationEvents : [],
      reconciliationEventCount: Array.isArray(entry.extras.extraction.reconciliationEvents) ? entry.extras.extraction.reconciliationEvents.length : 0,
    } : null,
    expansion: entry.extras?.expansion ? {
      scheduler: entry.extras.expansion.scheduler ?? null,
      entries: entry.extras.expansion.entries ?? {},
      entryCount: entry.extras.expansion.entries ? Object.keys(entry.extras.expansion.entries).length : 0,
    } : null,
    memory: entry.extras?.memory ? {
      tierCounts: ['facts', 'session_details', 'short_term', 'scene_history'].reduce((acc, tier) => {
        acc[tier] = (entry.extras.memory.entries ?? []).filter((e) => e.tier === tier).length;
        return acc;
      }, {}),
      entryCount: Array.isArray(entry.extras.memory.entries) ? entry.extras.memory.entries.length : 0,
      excludedCount: Array.isArray(entry.extras.memory.excluded) ? entry.extras.memory.excluded.length : 0,
      pinnedCount: Array.isArray(entry.extras.memory.entries) ? entry.extras.memory.entries.filter((e) => e.pinned).length : 0,
      supersededCount: Array.isArray(entry.extras.memory.entries) ? entry.extras.memory.entries.filter((e) => e.supersededBy).length : 0,
      foldedCount: Array.isArray(entry.extras.memory.entries) ? entry.extras.memory.entries.filter((e) => e.foldedInto).length : 0,
      contradictedCount: Array.isArray(entry.extras.memory.entries) ? entry.extras.memory.entries.filter((e) => e.contradicted).length : 0,
      tierTokens: ['facts', 'session_details', 'short_term', 'scene_history'].reduce((acc, tier) => {
        acc[tier] = (entry.extras.memory.entries ?? []).filter((e) => e.tier === tier && !e.supersededBy && !e.foldedInto).reduce((sum, e) => sum + (typeof e.tokens === 'number' ? e.tokens : Math.ceil((e.text ?? '').length / 4)), 0);
        return acc;
      }, {}),
      wiWriteCount: entry.extras.memory.wiWrites ? Object.keys(entry.extras.memory.wiWrites).length : 0,
      sceneCount: entry.extras.memory.sceneCount ?? 0,
      openArcCount: Array.isArray(entry.extras.memory.arcs) ? entry.extras.memory.arcs.filter((a) => a.status === 'open').length : 0,
      resolvedArcCount: Array.isArray(entry.extras.memory.arcs) ? entry.extras.memory.arcs.filter((a) => a.status === 'resolved').length : 0,
      arcSummaryCount: Array.isArray(entry.extras.memory.arcs) ? entry.extras.memory.arcs.filter((a) => a.summary).length : 0,
      canonPresent: Boolean(entry.extras.memory.canon?.text),
      canonHash: entry.extras.memory.canon?.inputHash ?? null,
      epistemicCount: Array.isArray(entry.extras.memory.epistemic) ? entry.extras.memory.epistemic.filter((e) => !e.supersededBy).length : 0,
      hidingCount: Array.isArray(entry.extras.memory.epistemic) ? entry.extras.memory.epistemic.filter((e) => !e.supersededBy && e.tag === 'hiding').length : 0,
      ledgerCount: Array.isArray(entry.extras.memory.ledger) ? entry.extras.memory.ledger.length : 0,
      epistemicLedgerCapable: entry.extras.memory.settings?.epistemicLedgerCapable ?? null,
      backfill: entry.extras.memory.backfill ?? null,
      settings: entry.extras.memory.settings ?? null,
    } : null,
    stagecraft: entry.extras?.stagecraft ? {
      proposals: entry.extras.stagecraft.proposals ?? [],
      proposalCount: Array.isArray(entry.extras.stagecraft.proposals) ? entry.extras.stagecraft.proposals.length : 0,
      appliedOpCount: (entry.extras.stagecraft.proposals ?? []).reduce((sum, record) => sum + (record.ops ?? []).filter((op) => op.status === 'applied').length, 0),
      lastRunBoundary: entry.extras.stagecraft.lastRunBoundary ?? -1,
      lastError: entry.extras.stagecraft.lastError ?? null,
    } : null,
    pacing: entry.extras?.pacing ?? null,
    tension: entry.extras?.tension ?? null,
    updatedAt: entry.extras?.updatedAt ?? null,
  };
}

export async function dumpStoryState(page) {
  return await evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    return ctx.chatMetadata?.story_orchestrator ?? null;
  });
}

export async function dumpCurrentChatState(page) {
  const before = await evaluateInST(page, () => ({ chatId: SillyTavern.getContext().chatId, groupId: SillyTavern.getContext().groupId }));
  if (!before?.chatId) {
    await openMostRecentGroupChat(page);
  }
  const data = await evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const blob = ctx.chatMetadata?.story_orchestrator ?? null;
    const selected = blob?.selectedStoryId ?? null;
    const entry = selected && blob?.stories ? blob.stories[selected] ?? null : null;
    const runtimeSnapshot = globalThis.storyOrchestratorRuntime?.getSnapshot?.() ?? null;
    const activeNudge = globalThis.storyOrchestratorRuntime?.getActiveNudge?.() ?? null;
    const possibleTransitions = globalThis.storyOrchestratorRuntime?.getPossibleTransitions?.() ?? null;
    const lastStoryUpdate = globalThis.storyOrchestratorRuntime?.getLastStoryUpdate?.() ?? null;
    const copilotNudgePrompt = ctx.extensionPrompts?.story_copilot_nudge ?? null;
    // The active background is a host read, not persisted state: `/bg` with no argument returns it.
    const background = (() => {
      const locked = ctx.chatMetadata?.custom_background;
      const source = typeof locked === 'string' && locked ? locked : (document.querySelector('.bg_example.selected-background') as HTMLElement | null)?.getAttribute('bgfile') ?? '';
      const inner = source.replace(/^url\((['"]?)/, '').replace(/(['"]?)\)$/, '');
      const file = inner.split('/').pop() ?? inner;
      try { return { name: decodeURIComponent(file), locked: Boolean(locked) }; } catch { return { name: file, locked: Boolean(locked) }; }
    })();
    const pacingPrompt = ctx.extensionPrompts?.story_orchestrator_pacing ?? null;
    // v2.3 plan 05: two sources for "what did the request carry". The runtime's own capture ring is
    // ALWAYS on and per-block, so a scenario (which cannot arm the HTTP recorder itself) can assert
    // inside a named injected block; the `st-payload` ring is per-member raw bodies and needs arming,
    // so it is included when it is there. Same shape either way — see lib/payloadAssert.mts.
    // Four sources, each labelled, because "the payload carries X" means different things and a
    // mislabelled source is how a plumbing check gets read as a proof about a request that was sent:
    //   `current` — the blocks the NEXT prompt would carry (what readInjectedPromptBlocks sees now).
    //               On by default, so a mocked scenario can assert the injection without generating.
    //   `capture` — a real generation's captured blocks (the runtime ring, last 5).
    //   `http`    — a raw request body from the `st-payload` ring, with the member it was drafted for.
    const toBlocks = (list: any[]) => list.map((block: any) => ({ key: String(block?.key ?? ''), value: String(block?.value ?? '') }));
    const currentBlocks = Object.entries(ctx.extensionPrompts ?? {})
      .filter(([key, entry]: [string, any]) => key.startsWith('story_') && typeof entry?.value === 'string' && entry.value.trim().length)
      .map(([key, entry]: [string, any]) => ({ key, value: String(entry.value) }));
    const runtimeCaptures = globalThis.storyOrchestratorRuntime?.getPayloadCaptures?.() ?? [];
    const payloadEntries = [
      { source: 'current', member: null, capturedAt: null, blocks: toBlocks(currentBlocks), body: null },
      ...runtimeCaptures.map((capture: any) => ({ source: 'capture', member: null, capturedAt: capture?.at ?? null, blocks: toBlocks(capture?.blocks ?? []), body: null })),
      ...(globalThis.__soDebugPayloads?.entries ?? []).slice(-20).map((payload: any) => ({
        source: 'http',
        member: payload?.draftMember ?? null,
        capturedAt: payload?.capturedAt ?? null,
        blocks: null,
        body: typeof payload?.body === 'string' ? payload.body : null,
      })),
    ];
    const memoryPrompts = ['facts', 'session_details', 'short_term', 'scene_history'].reduce((acc, tier) => {
      acc[tier] = ctx.extensionPrompts?.[`story_orchestrator_memory_${tier}`] ?? null;
      return acc;
    }, {});
    // v2.3 plan 06: the effect ledger owes an account of the state it changed that belongs to no chat,
    // and `disabled_members` is the one that outlives the chat that wrote it. Read it from the GROUP,
    // not from our own mirror: the mirror is what this chat MEANT to write.
    const group = (() => {
      const groups = ctx.groups ?? [];
      const open = groups.find((entry) => String(entry?.id ?? '') === String(ctx.groupId ?? '')) ?? null;
      if (!open) return null;
      const characters = ctx.characters ?? [];
      return {
        id: open.id ?? null,
        name: open.name ?? null,
        disabledMembers: Array.isArray(open.disabled_members) ? open.disabled_members : [],
        members: (open.members ?? []).map((avatar) => ({ avatar, name: characters.find((card) => card?.avatar === avatar)?.name ?? null })),
      };
    })();
    return {
      chatId: ctx.chatId,
      groupId: ctx.groupId ?? null,
      group,
      selectedStoryId: selected,
      globalSettings: (globalThis as any).storyOrchestratorRuntime?.getGlobalSettings?.() ?? ctx.extensionSettings?.['story-orchestrator']?.settings ?? null,
      globalSettingsStored: ctx.extensionSettings?.['story-orchestrator']?.settings ?? null,
      libraryIds: (ctx.extensionSettings?.['story-orchestrator']?.v2Stories ?? []).map((record) => ({ id: record.id ?? null, hash: record.hash, title: record.title })),
      version: blob?.version ?? null,
      storyCount: blob?.stories ? Object.keys(blob.stories).length : 0,
      entry,
      runtimeSnapshot,
      activeNudge,
      possibleTransitions,
      lastStoryUpdate,
      copilotNudgePrompt,
      pacingPrompt,
      memoryPrompts,
      payloadEntries,
      background,
    };
  });

  return {
    chatId: data?.chatId ?? null,
    groupId: data?.groupId ?? null,
    group: data?.group ?? null,
    version: data?.version ?? null,
    selectedStoryId: data?.selectedStoryId ?? null,
    globalSettings: data?.globalSettings ?? null,
    globalSettingsStored: data?.globalSettingsStored ?? null,
    libraryIds: data?.libraryIds ?? [],
    storyCount: data?.storyCount ?? 0,
    state: decodeRuntime(data?.entry),
    liveSnapshot: data?.runtimeSnapshot ?? null,
    activeNudge: data?.activeNudge ?? null,
    possibleTransitions: data?.possibleTransitions ?? null,
    lastStoryUpdate: data?.lastStoryUpdate ?? null,
    copilotNudgePrompt: data?.copilotNudgePrompt ?? null,
    pacingPrompt: data?.pacingPrompt ?? null,
    memoryPrompts: data?.memoryPrompts ?? null,
    payloadEntries: data?.payloadEntries ?? [],
    background: data?.background ?? null,
    _note: 'State is from chatMetadata.story_orchestrator for the current chat.',
  };
}

function compactCurrent(data) {
  const state = data?.state ?? null;
  return {
    chatId: data?.chatId ?? null,
    groupId: data?.groupId ?? null,
    selectedStoryId: data?.selectedStoryId ?? null,
    storyIdentity: data?.liveSnapshot?.storyIdentity ?? null,
    settingsHome: data?.globalSettings ? { extraction: data.globalSettings.extraction, display: data.globalSettings.display } : null,
    storyTitle: state?.storyTitle ?? null,
    activeCheckpointId: state?.activeCheckpointId ?? null,
    boundary: state?.boundary ?? 0,
    blackboard: state?.blackboard ?? {},
    latched: state?.latched ?? {},
    requirementsReady: state?.requirements?.ready ?? null,
    auditCount: state?.extraction?.auditCount ?? 0,
    factCount: state?.extraction?.factCount ?? 0,
    reconciliationEventCount: state?.extraction?.reconciliationEventCount ?? 0,
    convergence: data?.liveSnapshot?.convergence ?? null,
    expansion: data?.liveSnapshot?.expansion ?? state?.expansion ?? null,
    memory: state?.memory ?? null,
    background: data?.background ?? null,
    stagecraft: (() => {
      const live = data?.liveSnapshot?.stagecraft ?? null;
      return live ? { settings: live.settings, scope: data?.liveSnapshot?.stagecraftScope ?? [], proposalCount: (live.proposals ?? []).length, appliedOpCount: state?.stagecraft?.appliedOpCount ?? 0, lastError: live.lastError ?? null } : null;
    })(),
    memoryInjected: data?.memoryPrompts ? Object.fromEntries(Object.entries(data.memoryPrompts).map(([tier, prompt]) => [tier, Boolean((prompt as { value?: unknown } | null)?.value)])) : null,
    tension: data?.liveSnapshot?.tension ?? state?.tension ?? null,
    pacingPrompt: data?.pacingPrompt ?? null,
    possibleTransitions: data?.possibleTransitions ?? null,
    lastStoryUpdate: data?.lastStoryUpdate ?? null,
    lastSessionAt: state?.lastSessionAt ?? null,
    payloadCaptures: (() => {
      const captures = data?.liveSnapshot?.payloadCaptures ?? [];
      return { count: captures.length, latestReason: captures[0]?.reason ?? null, latestBlocks: captures[0]?.blocks?.length ?? null };
    })(),
    copilot: {
      enabled: data?.liveSnapshot?.copilot?.enabled ?? null,
      activeNudge: data?.activeNudge ?? null,
      nudgeInjected: Boolean((data?.copilotNudgePrompt as { value?: unknown } | null)?.value),
    },
    // v2.3 plan 06: what this chat's effects did to shared host state. `unsupported` names the rows a
    // BACKEND refused (the preset on a chat-completion connection), which is a diagnosis, not a bug.
    effects: (() => {
      const effects = data?.liveSnapshot?.effects ?? null;
      if (!effects) return null;
      const ledger = effects.ledger ?? [];
      return {
        ledger: ledger.map((row) => ({ effect: row.effect, target: row.target, status: row.status, before: row.before ?? null, after: row.after ?? null, reason: row.reason ?? null, boundary: row.boundary ?? null })),
        cast: effects.cast ?? [],
        unsupported: ledger.filter((row) => row.status === 'failed' && /Text Completion|not supported|unsupported/i.test(String(row.reason ?? ''))).length,
      };
    })(),
    group: data?.group ?? null,
  };
}

function parseExpectedValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  const number = Number(value);
  if (value.trim() !== '' && Number.isFinite(number)) return number;
  return value;
}

function getPath(data, path) {
  const aliases = { activeCheckpoint: 'activeCheckpointId', bb: 'blackboard' };
  return path.split('.').reduce((current, part) => current?.[aliases[part] ?? part], data);
}

function checkExpectations(data, args) {
  const failures = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--expect') continue;
    const raw = args[index + 1] ?? '';
    const eq = raw.indexOf('=');
    if (eq < 1) {
      failures.push(`Invalid expectation: ${raw}`);
      continue;
    }
    const path = raw.slice(0, eq);
    const expected = parseExpectedValue(raw.slice(eq + 1));
    const actual = getPath(data, path);
    if (actual !== expected) failures.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  return failures;
}

// The other half of "nothing else changed": `--expect x=null` cannot tell a null value from a
// missing key, and "the extractor never wrote this" is an absence, not a value (v2.3 plan 02 §R6).
function checkAbsences(data, args) {
  const failures = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--expect-absent') continue;
    const path = args[index + 1] ?? '';
    const parts = path.split('.').filter(Boolean);
    if (parts.length < 2) {
      failures.push(`Invalid absence (needs a parent and a key, e.g. bb.entered_mines): ${path}`);
      continue;
    }
    const parent = getPath(data, parts.slice(0, -1).join('.'));
    const key = parts[parts.length - 1];
    if (parent && Object.prototype.hasOwnProperty.call(parent, key)) {
      failures.push(`${path}: expected absent, got ${JSON.stringify(parent[key])}`);
    }
  }
  return failures;
}

const USAGE = `Usage: node scripts/debug/so-state.mts [current|all] [--full] [--expect path=value] [--expect-absent path.key]

Examples:
  node scripts/debug/so-state.mts
  node scripts/debug/so-state.mts current --expect activeCheckpointId=door --expect bb.player_has_key=true`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }
  runCli(async (page) => {
    const args = process.argv.slice(2);
    const subcommand = args.find((arg) => !arg.startsWith('--') && !args[args.indexOf(arg) - 1]?.startsWith('--')) ?? 'current';
    const full = args.includes('--full');

    if (subcommand === 'current') {
      const data = await dumpCurrentChatState(page);
      const output = full ? data : compactCurrent(data);
      console.log(JSON.stringify(output, null, 2));
      const failures = [...checkExpectations(output, args), ...checkAbsences(output, args)];
      if (failures.length) {
        console.error(`Expectation failed: ${failures.join('; ')}`);
        process.exitCode = 1;
      }
      await writeJSON(data, 'so-state-current');
    } else {
      const data = await dumpStoryState(page);
      console.log(JSON.stringify(data, null, 2));
      await writeJSON(data, 'so-state-all');
    }
  });
}
