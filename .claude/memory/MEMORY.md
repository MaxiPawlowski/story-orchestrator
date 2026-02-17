# Project Memory

## Workflow
- Always work in the **main directory** (`story-orchestrator/`), not worktrees
- Worktrees exist at `.worktrees/` but should not be used for development
- Build: `npm run build` from main dir
- Tests: `npx jest` from main dir

## Known pre-existing issues (not to fix unless asked)
- `turnController.test.ts` — 1 failing test, pre-existing
- STAPI dynamic import TS errors — expected, ST host modules not present at typecheck time
