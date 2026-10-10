import { isRecord } from "@utils/guards";
import type { WidgetDrawerTab } from "@engine/index";
import type { WriteResult } from "@utils/writeResult";
import type { IntentView, WidgetView } from "./gameTypes";

export const BRIDGE_PROTOCOL = "story-orchestrator-widget/1";

export const BRIDGE = {
  initialize: "ui/initialize",
  initialized: "ui/notifications/initialized",
  sizeChanged: "ui/notifications/size-changed",
  intent: "story/propose-intent",
  data: "ui/notifications/widget-data",
  teardown: "ui/resource-teardown",
} as const;

export const VIEW_METHODS: readonly string[] = [BRIDGE.initialize, BRIDGE.initialized, BRIDGE.sizeChanged, BRIDGE.intent];

export const FRAME_HEIGHT = { min: 40, max: 800, start: 160 } as const;
export const INTENT_INTERVAL_MS = 1500;
export const AUDIT_DETAIL_MAX = 160;
export const AUDIT_LIMIT = 200;

export const FRAME_SANDBOX = "allow-scripts";

export const FRAME_CSP = [
  "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", "img-src data:", "font-src data:", "media-src data:",
  "connect-src 'none'", "frame-src 'none'", "worker-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'",
].join("; ");

export const FRAME_HELPER = [
  "(function(){var n=0,p={},h=[],last=null;",
  "function send(m){m.jsonrpc='2.0';parent.postMessage(m,'*');}",
  "function size(){send({method:'ui/notifications/size-changed',params:{height:Math.ceil(document.documentElement.scrollHeight)}});}",
  "function deliver(w){last=w;h.forEach(function(f){f(w);});setTimeout(size,0);}",
  "function request(method,params){var id=++n;send({id:id,method:method,params:params||{}});return new Promise(function(res,rej){p[id]={res:res,rej:rej};});}",
  "window.addEventListener('message',function(e){if(e.source!==parent)return;var m=e.data;if(!m||m.jsonrpc!=='2.0')return;",
  "if(m.id!==undefined&&p[m.id]){var q=p[m.id];delete p[m.id];if(m.error)q.rej(m.error);else q.res(m.result);return;}",
  "if(m.method==='ui/notifications/widget-data'&&m.params)deliver(m.params.widget);});",
  "window.storyWidget={ready:function(){return request('ui/initialize',{protocolVersion:'" + BRIDGE_PROTOCOL + "'})",
  ".then(function(r){send({method:'ui/notifications/initialized',params:{}});deliver(r.widget);return r;});},",
  "onData:function(f){h.push(f);if(last)f(last);},propose:function(id){return request('story/propose-intent',{id:id});},resize:size};})();",
].join("");

const escapeAttribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

export const buildSrcdoc = (template: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(FRAME_CSP)}">`
  + `<meta name="referrer" content="no-referrer"><script>${FRAME_HELPER}</script></head><body>${template}</body></html>`;

export interface AuditEntry {
  at: number;
  widgetId: string;
  direction: "in" | "out" | "host";
  method: string;
  outcome: "ok" | "refused";
  detail?: string;
}

export const appendAudit = (ring: readonly AuditEntry[], entry: AuditEntry, limit = AUDIT_LIMIT): AuditEntry[] => [...ring, entry].slice(-limit);

export interface JsonRpcReply {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface BridgeState {
  lastIntentAt: number | null;
}

export interface BridgeContext {
  widget: WidgetView;
  now: number;
  state: BridgeState;
  fill: (text: string) => WriteResult;
  open?: (tab: WidgetDrawerTab) => WriteResult;
  theme?: "light" | "dark";
}

export interface BridgeOutcome {
  reply: JsonRpcReply | null;
  audit: AuditEntry;
  height?: number;
  intent?: { intent: IntentView; result: WriteResult };
  state: BridgeState;
}

export const ERRORS = {
  notJsonRpc: "not a JSON-RPC 2.0 message",
  unknownMethod: "method not offered by this host",
  unknownIntent: "this panel declares no such action",
  tooSoon: "one action at a time: wait a moment",
  badHeight: "height is a number",
  noOpen: "this panel cannot open the story drawer here",
} as const;

const clip = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return text.length > AUDIT_DETAIL_MAX ? `${text.slice(0, AUDIT_DETAIL_MAX - 1)}…` : text;
};

export const frameData = (widget: WidgetView): WidgetView | null => (widget.body.kind === "html" ? widget.body.source : null);

const declared = (widget: WidgetView): IntentView[] => (widget.body.kind === "html" ? widget.body.actions : []);

export const dataNotification = (widget: WidgetView) => ({ jsonrpc: "2.0" as const, method: BRIDGE.data, params: { widget: frameData(widget) } });

export const teardownNotification = (reason: string) => ({ jsonrpc: "2.0" as const, method: BRIDGE.teardown, params: { reason } });

const isId = (value: unknown): value is number | string => (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.length <= 64);

export function handleViewMessage(raw: unknown, context: BridgeContext): BridgeOutcome {
  const { widget, now, state } = context;
  const audit = (method: string, outcome: AuditEntry["outcome"], detail?: unknown): AuditEntry => ({
    at: now, widgetId: widget.id, direction: "in", method, outcome, ...(detail !== undefined ? { detail: clip(detail) } : {}),
  });
  if (!isRecord(raw) || raw.jsonrpc !== "2.0" || typeof raw.method !== "string") {
    return { reply: null, audit: audit("(invalid)", "refused", ERRORS.notJsonRpc), state };
  }
  const id = isId(raw.id) ? raw.id : null;
  const params = isRecord(raw.params) ? raw.params : {};
  const fail = (code: number, message: string): JsonRpcReply | null => (id === null ? null : { jsonrpc: "2.0", id, error: { code, message } });
  const ok = (result: unknown): JsonRpcReply | null => (id === null ? null : { jsonrpc: "2.0", id, result });
  if (!VIEW_METHODS.includes(raw.method)) return { reply: fail(-32601, ERRORS.unknownMethod), audit: audit(raw.method.slice(0, 64), "refused", raw.params), state };
  if (raw.method === BRIDGE.initialize) {
    const result = {
      protocolVersion: BRIDGE_PROTOCOL, hostInfo: { name: "Story Orchestrator" },
      hostCapabilities: { intents: declared(widget).map((intent) => intent.id) },
      hostContext: { displayMode: "inline", theme: context.theme ?? "dark", motion: widget.still ? "off" : "on" }, widget: frameData(widget),
    };
    return { reply: ok(result), audit: audit(raw.method, "ok"), state };
  }
  if (raw.method === BRIDGE.initialized) return { reply: null, audit: audit(raw.method, "ok"), state };
  if (raw.method === BRIDGE.sizeChanged) {
    const height = typeof params.height === "number" && Number.isFinite(params.height) ? Math.round(params.height) : null;
    if (height === null) return { reply: null, audit: audit(raw.method, "refused", ERRORS.badHeight), state };
    return { reply: null, audit: audit(raw.method, "ok", height), height: Math.min(FRAME_HEIGHT.max, Math.max(FRAME_HEIGHT.min, height)), state };
  }
  const intent = declared(widget).find((entry) => entry.id === params.id);
  if (!intent) return { reply: fail(-32602, ERRORS.unknownIntent), audit: audit(raw.method, "refused", params.id), state };
  if (state.lastIntentAt !== null && now - state.lastIntentAt < INTENT_INTERVAL_MS) return { reply: fail(-32000, ERRORS.tooSoon), audit: audit(raw.method, "refused", ERRORS.tooSoon), state };
  const result = intent.open ? context.open?.(intent.open) ?? { ok: false as const, reason: ERRORS.noOpen } : context.fill(intent.text);
  const next = { lastIntentAt: now };
  const reply = result.ok ? ok({ proposed: true }) : fail(-32001, result.reason);
  return { reply, audit: audit(raw.method, result.ok ? "ok" : "refused", result.ok ? intent.id : `${intent.id}: ${result.reason}`), intent: { intent, result }, state: next };
}
