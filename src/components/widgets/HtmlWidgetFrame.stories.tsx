import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import type { WidgetView } from "@runtime/gameTypes";
import type { AuditEntry } from "@runtime/htmlWidget";
import { HtmlWidgetFrame } from "./HtmlWidgetFrame";
import { cluesWidget } from "./gameViewFixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const htmlWidget = (template: string): WidgetView => ({
  id: "case-board", title: "Case board", audience: "player", synthesized: false,
  body: { kind: "html", template, actions: [{ id: "ask", text: "I ask about the ledger page." }], source: cluesWidget },
});

const FRIENDLY = "<ul id=list></ul><script>var asked=false;storyWidget.onData(function(w){var l=document.getElementById('list');l.textContent='';"
  + "w.body.clues.forEach(function(c){var li=document.createElement('li');li.textContent=c.text;l.appendChild(li);});"
  + "if(!asked){asked=true;storyWidget.propose('ask');storyWidget.propose('send-everything');}});storyWidget.ready();</script>";

const ESCAPE = "<script>function t(f){try{f();return 'open';}catch(e){return 'blocked';}}"
  + "var r={p:t(function(){return parent.document.title;}),l:t(function(){return localStorage.length;}),c:t(function(){return document.cookie;}),"
  + "t:t(function(){return top.location.href;})};"
  + "var f=fetch('/csrf-token').then(function(){return 'open';},function(){return 'blocked';});"
  + "var i=new Promise(function(res){var img=new Image();img.onload=function(){res('open');};img.onerror=function(){res('blocked');};img.src='/favicon.ico';});"
  + "Promise.all([f,i]).then(function(v){r.f=v[0];r.i=v[1];parent.postMessage({jsonrpc:'2.0',method:'story/propose-intent',params:{id:'raw'}},'*');"
  + "storyWidget.propose(JSON.stringify(r));});</script>";

const meta: Meta<typeof HtmlWidgetFrame> = {
  title: "Panels/HtmlWidgetFrame",
  component: HtmlWidgetFrame,
  args: { widget: htmlWidget(FRIENDLY), onIntent: fn(() => ({ ok: true as const })), onAudit: fn(), onNavigatedAway: fn() },
};

export default meta;

type Story = StoryObj<typeof HtmlWidgetFrame>;

const audits = (onAudit: unknown): AuditEntry[] => (onAudit as { mock: { calls: Array<[AuditEntry]> } }).mock.calls.map(([entry]) => entry);

export const ReadsTheViewAndProposesDeclaredLines: Story = {
  play: async ({ canvasElement, args }) => {
    const frame = canvasElement.querySelector('[data-so="html-widget"]') as HTMLIFrameElement;
    await expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    await waitFor(() => expect(args.onIntent).toHaveBeenCalledWith("I ask about the ledger page."), { timeout: 4000 });
    await expect(args.onIntent).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(audits(args.onAudit).some((entry) => entry.method === "story/propose-intent" && entry.outcome === "refused")).toBe(true));
    await waitFor(() => expect(audits(args.onAudit).some((entry) => entry.method === "ui/notifications/size-changed")).toBe(true));
  },
};

export const EscapeAttemptsAreBlocked: Story = {
  args: { widget: htmlWidget(ESCAPE) },
  play: async ({ args }) => {
    const report = () => audits(args.onAudit).find((entry) => entry.method === "story/propose-intent" && entry.detail?.startsWith("{"));
    await waitFor(() => expect(report()).toBeDefined(), { timeout: 6000 });
    await expect(report()?.outcome).toBe("refused");
    await expect(JSON.parse(report()?.detail ?? "{}")).toEqual({ p: "blocked", l: "blocked", c: "blocked", t: "blocked", f: "blocked", i: "blocked" });
    await expect(audits(args.onAudit).some((entry) => entry.method === "(unsigned)" && entry.outcome === "refused")).toBe(true);
    await expect(audits(args.onAudit).some((entry) => entry.detail === "raw")).toBe(false);
    await expect(args.onIntent).not.toHaveBeenCalled();
  },
};

export const LeavingThePageClosesIt: Story = {
  args: { widget: htmlWidget("<script>setTimeout(function(){location.href='about:blank';},50);</script>") },
  play: async ({ args }) => {
    await waitFor(() => expect(args.onNavigatedAway).toHaveBeenCalled(), { timeout: 4000 });
  },
};

const NAVIGATES = "<script>setTimeout(function(){location.href='data:text/html,'+encodeURIComponent('<script>setTimeout(function(){"
  + "parent.postMessage({jsonrpc:\"2.0\",id:1,method:\"story/propose-intent\",params:{id:\"ask\"}},\"*\");},300);<'+'/script>');},50);</script>";

export const ANavigatedFrameIsNotHeard: Story = {
  args: { widget: htmlWidget(NAVIGATES) },
  play: async ({ args }) => {
    await waitFor(() => expect(args.onNavigatedAway).toHaveBeenCalled(), { timeout: 4000 });
    await new Promise((resolve) => setTimeout(resolve, 900));
    await expect(args.onIntent).not.toHaveBeenCalled();
    await expect(audits(args.onAudit).filter((entry) => entry.method === "story/propose-intent")).toEqual([]);
  },
};

const POSTS_BEFORE_LOAD = "<script>setTimeout(function(){location.href='data:text/html,'+encodeURIComponent('<script>"
  + "parent.postMessage({jsonrpc:\"2.0\",id:1,method:\"story/propose-intent\",params:{id:\"ask\"}},\"*\");"
  + "var t=Date.now();while(Date.now()-t<400){}<'+'/script>');},50);</script>";

export const ANavigatedFramePostingBeforeItsLoadIsDropped: Story = {
  args: { widget: htmlWidget(POSTS_BEFORE_LOAD) },
  play: async ({ args }) => {
    await waitFor(() => expect(args.onNavigatedAway).toHaveBeenCalled(), { timeout: 4000 });
    await new Promise((resolve) => setTimeout(resolve, 900));
    await expect(args.onIntent).not.toHaveBeenCalled();
    await expect(audits(args.onAudit).filter((entry) => entry.method === "story/propose-intent")).toEqual([]);
  },
};

const nonceOf = (frame: HTMLIFrameElement | null) => /N='([0-9a-f]{32})'/.exec(frame?.getAttribute("srcdoc") ?? "")?.[1] ?? "";

const post = (frame: HTMLIFrameElement, nonce?: string) => window.dispatchEvent(new MessageEvent("message", {
  data: { jsonrpc: "2.0", id: 9, method: "story/propose-intent", params: { id: "ask" }, ...(nonce === undefined ? {} : { nonce }) }, source: frame.contentWindow,
}));

export const AnUnsignedMessageWhileTheFrameMayTalkIsDropped: Story = {
  args: { widget: htmlWidget("<p>quiet</p><script>storyWidget.ready();</script>") },
  play: async ({ canvasElement, args }) => {
    const frame = canvasElement.querySelector('[data-so="html-widget"]') as HTMLIFrameElement;
    await waitFor(() => expect(audits(args.onAudit).some((entry) => entry.method === "ui/initialize")).toBe(true), { timeout: 4000 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    post(frame);
    await waitFor(() => expect(audits(args.onAudit).some((entry) => entry.method === "(unsigned)")).toBe(true));
    await expect(args.onIntent).not.toHaveBeenCalled();
    post(frame, nonceOf(frame));
    await waitFor(() => expect(args.onIntent).toHaveBeenCalledWith("I ask about the ledger page."));
    await expect(args.onNavigatedAway).not.toHaveBeenCalled();
  },
};

const Remountable = (props: Parameters<typeof HtmlWidgetFrame>[0]) => {
  const [mount, setMount] = useState(0);
  return (
    <div>
      <button type="button" style={{ color: "#000", background: "#fff" }} onClick={() => setMount((value) => value + 1)}>Remount</button>
      <HtmlWidgetFrame key={mount} {...props} />
    </div>
  );
};

export const ARemountRotatesTheNonce: Story = {
  args: { widget: htmlWidget("<p>quiet</p>") },
  render: (args) => <Remountable {...args} />,
  play: async ({ canvasElement, args }) => {
    const frame = () => canvasElement.querySelector<HTMLIFrameElement>('[data-so="html-widget"]');
    const first = nonceOf(frame());
    await expect(first).toMatch(/^[0-9a-f]{32}$/);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Remount" }));
    await waitFor(() => expect(nonceOf(frame())).not.toBe(first));
    const second = nonceOf(frame());
    await expect(second).toMatch(/^[0-9a-f]{32}$/);
    const node = frame() as HTMLIFrameElement;
    post(node, first);
    await waitFor(() => expect(audits(args.onAudit).some((entry) => entry.method === "(unsigned)")).toBe(true));
    await expect(args.onIntent).not.toHaveBeenCalled();
    post(node, second);
    await waitFor(() => expect(args.onIntent).toHaveBeenCalledWith("I ask about the ledger page."));
    await expect(args.onIntent).toHaveBeenCalledTimes(1);
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="html-widget"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);
export const Wide: Story = fitsAt(VIEWPORTS.wide, primary);
