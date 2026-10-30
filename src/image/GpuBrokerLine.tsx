import { useEffect, useState } from "react";
import { gpuBrokerStatus, type GpuBrokerStatus } from "@services/stHost/gpuBroker";
import { brokerLine } from "./brokerLine";
import { StatusText } from "@components/ui/StatusText";

export function GpuBrokerLineView({ status }: { status: GpuBrokerStatus | null }) {
  const line = brokerLine(status);
  if (!line) return null;
  const body = <><span className="font-semibold">GPU sharing: </span>{line.text}</>;
  return line.tone === "warn"
    ? <StatusText id="so-gpu-broker" role="status" tone="warn">{body}</StatusText>
    : <p id="so-gpu-broker" role="status" data-tone={line.tone} className="text-xs opacity-80">{body}</p>;
}

export default function GpuBrokerLine({ read = gpuBrokerStatus }: { read?: () => Promise<GpuBrokerStatus | null> }) {
  const [status, setStatus] = useState<GpuBrokerStatus | null>(null);
  useEffect(() => {
    let live = true;
    const tick = () => { void read().then((next) => { if (live) setStatus(next); }); };
    tick();
    const timer = setInterval(tick, 5000);
    return () => { live = false; clearInterval(timer); };
  }, [read]);
  return <GpuBrokerLineView status={status} />;
}
