# Phase 2 Session Header Machines

## Summary

Started the next `moltis-csd` web slice from `main` on branch `feat/phase2-session-header-machines`.

This slice removes the remaining node-centric session-header routing path in `crates/web/src/assets/js/components/session-header.js` by:

- switching the session header selector from `node.list` / `nodes.set_session` to `machines.list` / `machines.set_session`
- preferring normalized machine identity from `session.machine.id` and `executionRoute` before falling back to legacy `node_id` / `sandbox_enabled`
- updating the in-memory active session state with normalized `machine`, `executionRoute`, `node_id`, and `sandbox_enabled` after a machine switch
- keeping the selector subscribed to machine availability changes via the existing presence and node telemetry events

It also adds a focused E2E regression in `crates/web/ui/e2e/specs/agents.spec.js` that mocks the machine RPCs and verifies the session header machine selector updates the active session route and machine state.

Follow-up slice on the same branch:

- switched the tools overview in `crates/web/src/assets/js/page-settings.js` from `node.list` to `machines.list`
- changed the execution-route summary to count remote routes from machine kinds (`node` / `ssh`) instead of the old node inventory
- extended `crates/web/ui/e2e/specs/settings-nav.spec.js` to verify the tools page shows machine-based route counts

Cleanup slice on the same branch:

- removed the unused legacy `crates/web/src/assets/js/nodes-selector.js` module
- removed the unused legacy `crates/web/src/assets/js/stores/node-store.js` store
- kept the active toolbar/header machine flows on the normalized `machine-selector` / `machine-store` path only

## Validation

- `/opt/homebrew/bin/biome check --write crates/web/src/assets/js/components/session-header.js crates/web/ui/e2e/specs/agents.spec.js`
- `PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" /usr/local/bin/npx playwright test e2e/specs/agents.spec.js --grep "session header machine selector switches execution machine"`
- `/opt/homebrew/bin/biome check --write crates/web/src/assets/js/page-settings.js crates/web/ui/e2e/specs/settings-nav.spec.js`
- `PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" /usr/local/bin/npx playwright test e2e/specs/settings-nav.spec.js --grep "tools settings shows effective inventory and routing summary"`

## Review Follow-up

Addressed the remaining PR review note on the same branch:

- `crates/web/src/assets/js/components/session-header.js` now calls `updateSandboxUI(...)` after a successful `machines.set_session` switch so the live execution prompt and command mode update immediately when leaving sandbox
- `crates/web/ui/e2e/specs/agents.spec.js` now includes a regression proving the header machine selector flips the active session and command execution state back to host when switching from sandbox to local

Additional validation for the follow-up:

- `/opt/homebrew/bin/biome check --write crates/web/src/assets/js/components/session-header.js crates/web/ui/e2e/specs/agents.spec.js`
- `PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" /usr/local/bin/npx playwright test e2e/specs/agents.spec.js --grep "session header machine selector"`
