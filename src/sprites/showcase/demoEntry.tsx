import React from "react";
import { createRoot } from "react-dom/client";
import { AnimatedCharacterDemo, type DemoData } from "./AnimatedCharacterDemo";
import "../styles.css";
import { log } from "@utils/log";

async function start(): Promise<void> {
  const root = document.getElementById("demo-root");
  if (!root) return;
  const base = root.dataset.base ?? "";
  try {
    const response = await fetch(`${base}demo.json`);
    if (!response.ok) throw new Error(`demo.json: ${response.status}`);
    const data = await response.json() as DemoData;
    createRoot(root).render(<AnimatedCharacterDemo data={data} base={base} />);
  } catch (error) {
    log.warn("The demo could not load", error);
    root.textContent = "The demo could not load. The browser console has the reason.";
  }
}

void start();
