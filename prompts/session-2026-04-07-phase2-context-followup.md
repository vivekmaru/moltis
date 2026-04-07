## Summary

Started the `feat/phase2-context-followup` branch with a prompt-view normalization slice in
`moltis-chat`.

### What changed

- Extracted a shared `prepare_prompt_view()` helper in `crates/chat/src/lib.rs`.
- `chat.raw_prompt` and `chat.full_context` now share the same:
  - tool-mode resolution
  - runtime-context construction
  - project-context loading
  - skill discovery
  - MCP-disabled handling
  - filtered tool-registry preparation
  - system-prompt construction
- This reduces duplicate prompt/debug assembly logic and keeps the two endpoints aligned by
  construction instead of convention.
- Added a shared `prepare_context_capabilities()` helper for `chat.context`.
- `chat.context` now centralizes:
  - active provider name
  - tool support flag
  - context-window size
  - MCP-disabled state
  - tool list
  - skill/plugin list
  - MCP server list
- Normalized `mcpServers` to always be an array for the frontend, even when the MCP service
  returns `{ "servers": [...] }`.
- Added a shared `prepare_context_view()` helper for `chat.context`.
- `chat.context` now builds its top-level response from one prepared view instead of mixing:
  - project lookup
  - connected-node execution resolution
  - workspace recent-session loading
  - coordination state loading
  - session payload assembly
  - token usage and sandbox/execution info
  inline in the RPC handler.
- Extracted `resolve_context_project_info()` and `recent_workspace_sessions()` to keep the
  `chat.context` orchestration consistent with the already-normalized session and workspace
  payload helpers.

### Tests

- Added behavior coverage proving the shared prompt-view path works:
  - `raw_prompt_reports_tool_mode_metadata_from_prepared_view`
  - `raw_prompt_matches_full_context_system_prompt`
- Added context-capability coverage:
  - `normalize_mcp_servers_payload_accepts_wrapped_or_array_shapes`
  - `context_returns_normalized_mcp_servers_array`
- Added context-view coverage:
  - `context_reuses_prepared_current_session_payload`

## Validation

- `cargo +nightly-2025-11-30 fmt --all -- --check`
- `cargo test -p moltis-chat raw_prompt_reports_tool_mode_metadata_from_prepared_view`
- `cargo test -p moltis-chat raw_prompt_matches_full_context_system_prompt`
- `cargo test -p moltis-chat normalize_mcp_servers_payload_accepts_wrapped_or_array_shapes`
- `cargo test -p moltis-chat context_returns_normalized_mcp_servers_array`
- `cargo test -p moltis-chat context_reuses_prepared_current_session_payload`
- `cargo check -p moltis-chat`
