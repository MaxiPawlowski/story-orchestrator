import { getContext, getPlayerName, profileExists, subscribeToHostEvents, type HostSubscriptionEntry } from "@services/STAPI";
import { ConsumptionLedger, type LedgerEvent } from "../../polish/ledger";
import { debugResponseFor } from "../modelCallCore";
import { resolveRoute } from "../passProfiles";
import type { RuntimeManager } from "../runtimeManager";
import { beginRun } from "../runToken";
import { getGlobalSettings } from "../settingsStore";
import { hostMessageId, type TurnBridge } from "../turnBridge";
import { createShadow } from "./shadow";
import { POLISH_HOLD_MS, polishHostDeps } from "./hostDeps";
import { createStandIn } from "./standIn";
import { couldNot, type WriteResult } from "@utils/writeResult";

const chatId = () => String(getContext().chatId ?? "");
const chatRows = (): unknown[] => (Array.isArray(getContext().chat) ? getContext().chat : []);
const lastRow = (): number | null => (chatRows().length ? chatRows().length - 1 : null);
const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

type Writer = (messageId: number, row: unknown, mes: string) => WriteResult;

export function installPolish(bridge: TurnBridge, manager: RuntimeManager): () => void {
  const ledger = new ConsumptionLedger();
  const host = polishHostDeps(manager.polishHost);
  let writer: Writer | null = null;
  const ready = async () => { writer ??= (await import("@services/stHost/polishWrite")).polishReplyText; };
  const tuning = () => getGlobalSettings().characters;
  const standIn = createStandIn({
    ledger, chatId, rows: chatRows, holdMs: () => POLISH_HOLD_MS, run: () => beginRun(manager.getOwnership()),
    config: () => globalThis.storyOrchestratorDebugPolishStandIn ?? null, ready,
    write: (messageId, row, mes) => (writer ? writer(messageId, row, mes) : couldNot("the polish writer has not loaded")), now: () => Date.now(), sleep,
  });
  const shadow = createShadow({
    host, ledger, route: () => resolveRoute(manager.getExtractionSettings(), "polish", profileExists), planted: () => debugResponseFor("polish") !== null,
    tuning: () => ({ holdMs: POLISH_HOLD_MS, maxPerHour: tuning().polishMaxPerHour }), playerName: () => getPlayerName() ?? "", now: () => Date.now(),
  });
  const observe = (event: LedgerEvent) => { ledger.observe(event); };
  const mutated = (value: unknown) => observe({ kind: "mutation", id: hostMessageId(value) });
  const entries: HostSubscriptionEntry[] = [
    { eventName: "MESSAGE_RECEIVED", handler: (messageId, type) => {
      const id = hostMessageId(messageId);
      if (id !== null && !globalThis.storyOrchestratorDebugPolishStandIn) void shadow.receive(id, type);
    } },
    { eventName: "GENERATION_STARTED", handler: (_type, _options, dryRun) => observe({ kind: "generation-started", chatId: chatId(), dryRun: dryRun === true }) },
    { eventName: "GENERATION_STOPPED", handler: () => { shadow.noteStopped(lastRow()); observe({ kind: "generation-stopped", lastId: lastRow() }); } },
    { eventName: "MESSAGE_SENT", handler: () => observe({ kind: "player-sent" }) },
    { eventName: "CHAT_CHANGED", handler: () => observe({ kind: "chat-changed" }) },
    { eventName: "MESSAGE_EDITED", handler: mutated },
    { eventName: "MESSAGE_UPDATED", handler: mutated },
    { eventName: "MESSAGE_SWIPED", handler: mutated },
    { eventName: "MESSAGE_DELETED", handler: mutated },
  ];
  const unsubscribe = subscribeToHostEvents(entries);
  bridge.setReplySettle((messageId, type) => standIn.settle(messageId, type));
  globalThis.storyOrchestratorPolish = { standIn: () => ({ ...standIn.stats, abandoned: { ...standIn.stats.abandoned } }), shadowCalls: shadow.calls, live: () => ledger.size() };
  return () => {
    bridge.setReplySettle(null);
    unsubscribe();
    globalThis.storyOrchestratorPolish = undefined;
  };
}
