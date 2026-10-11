import { useEffect, useRef } from "react";
import type { PoseEntry } from "@engine/schema";
import { drawSkeleton } from "../../sprites/poses/skeleton";

export default function PoseSkeleton({ pose }: { pose: PoseEntry }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (canvas.current) drawSkeleton(canvas.current, pose.keypoints); }, [pose]);
  return <canvas ref={canvas} role="img" aria-label={`${pose.label} skeleton`} style={{ width: "100%", maxWidth: 180, height: "auto", background: "black" }} />;
}
