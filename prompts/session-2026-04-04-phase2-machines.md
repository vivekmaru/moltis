# Session Summary: Phase 2 Machines Slice

Date: 2026-04-04

## Scope

Implemented the first concrete Phase 2 slice for the "trusted operator + coding
coordinator" direction: make execution machines first-class in the runtime and
the chat UI.

## Implemented

### Machine model

- Added a new gateway machine model in `crates/gateway/src/machine.rs`.
- Normalized execution targets into machine descriptors for:
  - local host
  - sandbox
  - paired nodes
  - managed SSH targets
  - legacy configured SSH target fallback
- Included machine trust state, health, availability, capability metadata, and
  stable ids.

### RPC surface

- Added:
  - `machines.list`
  - `machines.get`
  - `machines.set_session`
- Registered the new methods in gateway discovery and scope authorization.
- Bound `machines.set_session` to session metadata so route choice becomes an
  explicit session-level machine binding instead of an inferred node/sandbox mix.

### Session and runtime payloads

- Extended session payloads and workspace overview payloads with a normalized
  `machine` object.
- Added the same machine object to `chat.context`.
- Updated the WebSocket session event payloads to include machine data.

### Web UI

- Added `machine-store.js` and `machine-selector.js`.
- Replaced the chat toolbar's route selector behavior with a machine-first
  selector while reusing the existing toolbar DOM.
- Updated session restore behavior to restore the selected machine.
- Extended the debug/context view to show the current machine and trust state.

### Documentation

- Updated `docs/src/architecture.md` with the machine inventory/binding model.
- Updated `docs/src/usage-guide.md` with the machine selector and new RPCs.

## Validation

Passed:

- `cargo +nightly-2025-11-30 fmt --all -- --check`
- `cargo check -p moltis-gateway -p moltis-httpd -p moltis-web -p moltis-chat`
- `cargo test -p moltis-gateway machines_list_includes_local_and_connected_nodes`
- `cargo test -p moltis-gateway machines_set_session_updates_session_binding`
- `cargo test -p moltis-gateway managed_ssh_target_uses_host_pinning_for_health`
- `cargo test -p moltis-gateway machines_read_methods_require_read`
- `cargo test -p moltis-gateway machines_set_session_requires_write`
- `biome check --write crates/web/src/assets/js/page-chat.js crates/web/src/assets/js/sessions.js crates/web/src/assets/js/machine-selector.js crates/web/src/assets/js/stores/machine-store.js crates/web/ui/e2e/specs/node-selector.spec.js`
- `cd crates/web/ui && npx playwright test e2e/specs/node-selector.spec.js`

Environment work required for web validation:

- installed `crates/web/ui` npm dependencies with `npm install`
- installed Playwright Chromium with `npx playwright install chromium`

Known remaining warnings:

- `biome` still reports pre-existing warnings in `crates/web/src/assets/js/sessions.js`
  unrelated to this machine-slice change

## Next Steps

- make workspace-to-machine binding more explicit at the workspace level, not
  just per session
- expose richer machine health, trust, and capability details in the primary UI
- add a fuller operator machine view beyond the chat toolbar selector
- keep reducing legacy `node_id`-centric assumptions in favor of the machine model
