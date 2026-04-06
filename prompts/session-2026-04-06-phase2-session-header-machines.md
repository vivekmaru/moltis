# Phase 2 Session Header Machines

## Summary

Started the next `moltis-csd` web slice from `main` on branch `feat/phase2-session-header-machines`.

This slice removes the remaining node-centric session-header routing path in `crates/web/src/assets/js/components/session-header.js` by:

- switching the session header selector from `node.list` / `nodes.set_session` to `machines.list` / `machines.set_session`
- preferring normalized machine identity from `session.machine.id` and `executionRoute` before falling back to legacy `node_id` / `sandbox_enabled`
- updating the in-memory active session state with normalized `machine`, `executionRoute`, `node_id`, and `sandbox_enabled` after a machine switch
- keeping the selector subscribed to machine availability changes via the existing presence and node telemetry events

It also adds a focused E2E regression in `crates/web/ui/e2e/specs/agents.spec.js` that mocks the machine RPCs and verifies the session header machine selector updates the active session route and machine state.

## Validation

- `/opt/homebrew/bin/biome check --write crates/web/src/assets/js/components/session-header.js crates/web/ui/e2e/specs/agents.spec.js`
- `PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" /usr/local/bin/npx playwright test e2e/specs/agents.spec.js --grep "session header machine selector switches execution machine"`
