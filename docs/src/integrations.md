# Integrations

Moltis already overlaps with tools like Codex, Claude Code, Cursor, and MCP
server ecosystems. This page separates what is already implemented from the
next integrations that would make sense.

## Existing Integrations

### Shared project-instruction formats

Moltis already loads the instruction files commonly used by coding agents:

- `CLAUDE.md`
- `CLAUDE.local.md`
- `AGENTS.md`
- `.cursorrules`
- `.claude/rules/*.md`
- `.cursor/rules/*.{md,mdc}`

That means a project can keep one set of local operating rules instead of
rewriting them for every tool.

### OpenAI Codex account reuse

Moltis supports the `openai-codex` provider directly. In addition, it can
import existing Codex CLI OAuth tokens from `~/.codex/auth.json` into its own
token store so the provider can come up already configured.

This makes Moltis a good long-lived backend when you already use Codex CLI on
the same machine.

### GitHub Copilot OAuth

GitHub Copilot is also supported as a first-class provider. That makes it
possible to keep a single Moltis gateway while switching between Copilot,
Codex, direct OpenAI API usage, and local models.

### Claude Code plugin repo discovery

Moltis skill discovery can already recognize Claude Code-style plugin
repositories and normalize them into discoverable skills. That is useful when
you want to import existing Claude-oriented skill repos without rewriting them
from scratch.

### MCP as a universal bridge

When a tool already exposes an MCP server, Moltis can consume it directly over
stdio or remote HTTP/SSE. In practice this is the most portable integration
path because it avoids writing one-off native adapters for each ecosystem.

## Practical Workflow Patterns

### Moltis as the persistent backend

Use Codex CLI, browser sessions, or mobile access as clients while Moltis owns:

- provider auth state
- long-lived sessions
- memory
- remote-exec routing
- MCP server connections
- channel integrations

This keeps the durable state in one place instead of scattering it across
several short-lived clients.

The current coordinator workflow is intentionally lightweight:

- external tools keep doing the actual coding
- Moltis stores the long-lived session/workspace state
- important external work is attached back into the session as durable context

That is the point of the "buddy system" direction here: coordination, not
duplication.

### One instruction hierarchy for every tool

Keep repo-level rules in `CLAUDE.md`, `AGENTS.md`, and related rule folders so
Moltis, Claude-oriented tools, and Cursor-style tools all see the same local
intent.

### MCP once, everywhere

If your team already uses MCP for Codex, Claude Code, or desktop agents, Moltis
can become the shared MCP host/consumer layer instead of duplicating server
configuration per client.

## Current Attach Workflow

The first external-agent handoff path is explicit and auditable rather than
deeply embedded in editors.

Use:

- `sessions.external.attach` to record a Codex / Claude Code / Copilot / API
  run summary against a session
- `sessions.coordination.set` to persist decision/plan/next-action notes
- `sessions.workspace_overview` to fetch the combined state for a workspace

Attached external work is shown separately from the current conversation and
separately from durable notes so Moltis can act as the coordinator instead of
pretending all work originated inside one chat window.

## Good Next Integrations

These are sensible candidates based on the current codebase, but they are not
fully implemented yet:

1. **Codex plugin/package adapter** similar to the existing Claude Code plugin
   repo adapter, so Codex-specific skill or plugin repos can be imported as
   first-class Moltis skills.
2. **One-click auth/settings import** for more external clients, extending the
   current Codex token import pattern beyond `~/.codex/auth.json`.
3. **Session handoff/export** so a coding session started in one tool can be
   resumed in Moltis with explicit branch and checkpoint metadata.
4. **Approval/status bridges** so external coding clients can see pending
   approvals and execution route state without needing the full Moltis web UI.

## Recommendation

If you want the most leverage with the least new code:

- use shared instruction files for context compatibility
- use MCP for tool compatibility
- use Moltis as the durable gateway for auth, sessions, memory, and routing

That gives you interoperability today, while leaving room for deeper native
integration later.
