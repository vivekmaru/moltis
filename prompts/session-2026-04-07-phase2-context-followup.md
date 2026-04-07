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

### Tests

- Added behavior coverage proving the shared prompt-view path works:
  - `raw_prompt_reports_tool_mode_metadata_from_prepared_view`
  - `raw_prompt_matches_full_context_system_prompt`

## Validation

- `cargo +nightly-2025-11-30 fmt --all -- --check`
- `cargo test -p moltis-chat raw_prompt_reports_tool_mode_metadata_from_prepared_view`
- `cargo test -p moltis-chat raw_prompt_matches_full_context_system_prompt`
- `cargo check -p moltis-chat`
