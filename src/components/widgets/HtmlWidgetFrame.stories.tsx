import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, waitFor } from "@storybook/test";
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
  + "Promise.all([f,i]).then(function(v){r.f=v[0];r.i=v[1];parent.postMessage({jsonrpc:'2.0',method:'test/report',params:r},'*');});</script>";

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
    await waitFor(() => expect(audits(args.onAudit).some((entry) => entry.method === "test/report")).toBe(true), { timeout: 6000 });
    const report = audits(args.onAudit).find((entry) => entry.method === "test/report");
    await expect(report?.outcome).toBe("refused");
    await expect(JSON.parse(report?.detail ?? "{}")).toEqual({ p: "blocked", l: "blocked", c: "blocked", t: "blocked", f: "blocked", i: "blocked" });
    await expect(args.onIntent).not.toHaveBeenCalled();
  },
};

export const LeavingThePageClosesIt: Story = {
  args: { widget: htmlWidget("<script>setTimeout(function(){location.href='about:blank';},50);</script>") },
  play: async ({ args }) => {
    await waitFor(() => expect(args.onNavigatedAway).toHaveBeenCalled(), { timeout: 4000 });
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="html-widget"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);
export const Wide: Story = fitsAt(VIEWPORTS.wide, primary);
