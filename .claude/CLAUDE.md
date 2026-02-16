# Story Orchestrator

SillyTavern extension that automates non-linear, checkpoint-driven stories mapped as directed graphs. React 19 + TypeScript 5 + Zustand 5 (vanilla) + Tailwind 4, bundled with Webpack.

## Slash Commands

```
/checkpoint list   (/cp list)   — Show checkpoints with status icons (○●✔✖)
/checkpoint prev   (/cp prev)   — Step back one checkpoint
/checkpoint eval   (/cp eval)   — Queue manual arbiter evaluation
/checkpoint <id>   (/cp <id>)   — Activate checkpoint by 1-based index or id
/checkpoint id=<id> (/cp id=<id>) — Activate checkpoint by explicit id
```
