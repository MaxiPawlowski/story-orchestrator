import type { GpuBrokerStatus } from "@services/stHost/gpuBroker";

export interface BrokerLine { tone: "quiet" | "busy" | "warn"; text: string }

const STATE_TEXT = {
  idle: "Idle: no text model loaded. It loads on the next reply.",
  "text-loaded": "Text model loaded. A picture swaps it out and back.",
  image: "Rendering a picture. Replies wait until it is done.",
  waiting: "Waiting: a reply or a picture is queued behind the other.",
  held: "Text unloaded by hand. Replies wait until it is loaded again.",
  degraded: "The local text server stopped. Pictures still render; replies fail until an admin loads text again.",
} as const;

export function brokerLine(status: GpuBrokerStatus | null): BrokerLine | null {
  if (!status) return null;
  if (status.adapter === "none") return { tone: "quiet", text: "GPU sharing is installed but off: pictures render without coordination." };
  if (status.adapter === "managed") return { tone: "quiet", text: "GPU sharing runs through an external controller." };
  const state = status.state ?? (status.waitingText ? "waiting" : "text-loaded");
  const tone = state === "degraded" ? "warn" : state === "image" || state === "waiting" ? "busy" : "quiet";
  const why = state === "waiting" && status.lastError ? ` Last refusal: ${status.lastError}` : "";
  return { tone, text: `${STATE_TEXT[state]}${why}` };
}
