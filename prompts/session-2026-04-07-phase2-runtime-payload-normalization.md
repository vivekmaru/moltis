## Summary

Normalized the `moltis-chat` runtime machine payload for paired-node sessions so chat-facing
payloads carry concrete node identity instead of a generic placeholder state.

### What changed

- `resolve_execution_context_with_connected_nodes()` now passes connected-node summaries
  directly into `machine_payload()` instead of collapsing them to a bare ID set.
- Node-backed machine payloads now:
  - use the connected node display name when available
  - keep the node ID as the machine ID / binding identity
  - report `health=degraded` when the connected node telemetry is stale
  - keep `health=unavailable` when the bound node is missing
- Chat-side machine payloads now also carry:
  - `platform` for every execution route
  - `telemetryStale` for node-backed sessions, matching connected-node state
- `chat.context()` active-session serialization now goes through a shared helper:
  - reuses the normalized route / machine / external-agent fields
  - adds `workspaceLabel` to the active session payload
  - keeps active session and recent-session payloads closer to the same shape
- `chat.context().workspaceOverview` now also carries `currentSession`:
  - mirrors the normalized active-session payload
  - lets the `/context` workspace overview prefer current route / machine / source from one object
  - preserves the older top-level fields as fallback compatibility
- Added focused `moltis-chat` tests covering:
  - connected node display-name propagation
  - stale connected node degradation
  - normalized recent-session machine state for connected vs missing nodes
  - active session payload normalization and workspace-label behavior

## Validation

- `cargo +nightly-2025-11-30 fmt --all -- --check`
- `cargo check -p moltis-chat`
- `cargo test -p moltis-chat resolve_execution_context_uses_connected_node_display_name`
- `cargo test -p moltis-chat resolve_execution_context_marks_stale_connected_node_degraded`
- `cargo test -p moltis-chat recent_session_summary_payload_uses_normalized_machine_state`
- `cargo test -p moltis-chat recent_session_summary_payload_marks_missing_node_unavailable`
- `cargo test -p moltis-chat resolve_execution_context_marks_connected_node_ready`
- `cargo test -p moltis-chat active_session_payload_uses_normalized_runtime_fields`
- `cargo test -p moltis-chat active_session_payload_defaults_workspace_label_to_null`
- `/opt/homebrew/bin/biome check --write crates/web/src/assets/js/page-chat.js crates/web/ui/e2e/specs/chat-input.spec.js crates/web/src/assets/js/components/workspace-overview.js crates/web/ui/e2e/specs/workspace-overview.spec.js`
- `PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" /usr/local/bin/npx playwright test e2e/specs/chat-input.spec.js --grep "/context shows normalized route, machine, and source labels"`
