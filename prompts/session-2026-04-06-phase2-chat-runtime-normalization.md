# Phase 2 Chat Runtime Normalization

## Summary

Started the next `moltis-csd` slice from `main` on branch `codex/phase2-chat-runtime-normalization`.

This slice normalizes chat/runtime execution state in `crates/chat/src/lib.rs` by:

- adding a shared `ResolvedExecutionContext` helper for route + machine payload resolution
- reusing that helper in `build_prompt_runtime_context()` and `chat.context()`
- aligning chat-side sandbox availability checks with real sandbox backends instead of plain router presence
- adding focused tests for fallback sandbox and preserved remote binding identity

Follow-up on the same branch:

- normalized prompt-node default routing so only paired-node routes populate `default_node_id`
- moved `recentSessions` payload construction onto a small summary helper to avoid another ad hoc route/source assembly path
- added focused tests for paired-node default routing and recent-session summary normalization

Third slice on the same branch:

- wired prompt runtime and `chat.context()` through the connected-node-aware execution resolver
- stopped chat-side node machine payloads from reporting disconnected paired nodes as ready
- added focused tests for connected vs disconnected paired-node availability

Fourth slice on the same branch:

- switched `chat.context()` recent workspace session summaries to reuse the normalized execution-context helper
- included normalized machine payloads in recent-session summaries so disconnected node bindings stay visibly unavailable there too
- added focused coverage for normalized recent-session machine state

## Validation

- `cargo +nightly-2025-11-30 fmt --all -- --check`
- `cargo test -p moltis-chat execution_mode_for_route_prefers_resolved_route`
- `cargo test -p moltis-chat execution_root_for_route_uses_route_specific_defaults`
- `cargo test -p moltis-chat resolve_execution_context_marks_fallback_sandbox_unavailable_without_backend`
- `cargo test -p moltis-chat resolve_execution_context_preserves_remote_binding_identity`
- `cargo check -p moltis-chat`
- `cargo test -p moltis-chat default_connected_node_id_only_uses_paired_node_route`
- `cargo test -p moltis-chat recent_session_summary_payload_uses_normalized_source_and_route`
- `cargo test -p moltis-chat resolve_execution_context_marks_disconnected_node_unavailable`
- `cargo test -p moltis-chat resolve_execution_context_marks_connected_node_ready`
- `cargo test -p moltis-chat recent_session_summary_payload_uses_normalized_machine_state`
