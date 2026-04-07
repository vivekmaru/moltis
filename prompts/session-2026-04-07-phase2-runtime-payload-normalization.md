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
- Added focused `moltis-chat` tests covering:
  - connected node display-name propagation
  - stale connected node degradation
  - normalized recent-session machine state for connected vs missing nodes

## Validation

- `cargo +nightly-2025-11-30 fmt --all -- --check`
- `cargo check -p moltis-chat`
- `cargo test -p moltis-chat resolve_execution_context_uses_connected_node_display_name`
- `cargo test -p moltis-chat resolve_execution_context_marks_stale_connected_node_degraded`
- `cargo test -p moltis-chat recent_session_summary_payload_uses_normalized_machine_state`
- `cargo test -p moltis-chat recent_session_summary_payload_marks_missing_node_unavailable`
- `cargo test -p moltis-chat resolve_execution_context_marks_connected_node_ready`
