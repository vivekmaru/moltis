# Architecture

This page gives the high-level map of how Moltis is put together so you can
orient quickly before diving into crate-level docs.

## Design Goals

Moltis is built around four goals:

1. Keep the long-lived gateway, auth, and storage logic in one Rust process.
2. Make dangerous capability boundaries explicit: auth, approvals, sandboxing,
   remote execution, and external channels.
3. Let capabilities compose without turning the codebase into one giant crate.
4. Preserve enough state to feel persistent without hiding critical behavior.

## Runtime Layout

```text
Clients and channels
  Web UI | API | PWA | Telegram | Discord | Slack | WhatsApp | Nodes
                |
                v
HTTP / WS gateway (`moltis-httpd` + `moltis-gateway`)
  auth | RPC | sessions | approvals | provider setup | channel routing
                |
                v
Agent and chat services (`moltis-chat` + `moltis-agents`)
  prompt assembly | model orchestration | tool dispatch | streaming
                |
      +---------+-----------+
      |                     |
      v                     v
Providers               Tools and extensions
`moltis-providers`      `moltis-tools` | `moltis-mcp` | `moltis-skills`
                |
                v
Persistence and state
`moltis-auth` | `moltis-sessions` | `moltis-memory` | `moltis-vault`
```

## Main Crate Groups

### Gateway and transport

- `moltis` / `crates/cli`: CLI entrypoints and operational commands.
- `moltis-httpd`: Axum router, middleware, REST endpoints, WebSocket upgrades.
- `moltis-gateway`: runtime state, RPC methods, provider setup, pairing, chat
  integration, and cross-service coordination.

### Agent execution

- `moltis-chat`: user-facing chat orchestration and session-aware execution.
- `moltis-agents`: prompt construction, model loop, tool-call parsing,
  sub-agent support, and response shaping.
- `moltis-tools`: built-in tools, exec approvals, sandbox routing, fetch/search,
  session tools, and remote-exec routing.

### External capability layers

- `moltis-providers`: OpenAI, Codex, Copilot, Anthropic, local models, and
  other provider adapters.
- `moltis-mcp`: stdio and remote MCP transports, auth, lifecycle, tool bridge.
- `moltis-skills`: skill discovery, install/import flows, and registry helpers.
- `moltis-plugins`: hook discovery and lifecycle dispatch.

### Storage and security

- `moltis-auth`: password/passkey/session/API-key storage and verification.
- `moltis-vault`: encryption-at-rest for sensitive values.
- `moltis-sessions`: session persistence, metadata, branching support.
- `moltis-memory` / `moltis-qmd`: long-term memory storage and retrieval.
- `moltis-config`: schema, validation, migration, and config templates.

## Request Flow

### Web/API request

1. `moltis-httpd` receives HTTP or WebSocket traffic.
2. Middleware applies throttling, origin checks, auth, and security headers.
3. `moltis-gateway` resolves the session, active model, runtime context, and
   route-specific services.
4. `moltis-chat` / `moltis-agents` assemble the prompt and run the agent loop.
5. Providers stream tokens and tool calls back through the gateway.
6. State is persisted in sessions, auth stores, memory, logs, and metrics.

### Tool execution

1. A tool call is selected by the model or activated lazily.
2. Hook and approval layers can inspect, block, or require confirmation.
3. The exec router chooses local sandbox, paired node, or SSH target.
4. Results flow back through the same chat/session pipeline.

## Trust Boundaries

The most important architectural boundaries are:

- **Auth boundary**: `check_auth()` decides whether a request is authenticated.
- **Execution boundary**: `moltis-tools` separates planning from command
  execution and can route commands into sandboxes or remote backends.
- **Extension boundary**: MCP servers, skills, hooks, and channels are treated
  as capability add-ons instead of part of the trusted core.
- **Persistence boundary**: auth/session/memory/vault stores are distinct so
  access control and encryption rules can evolve without one shared blob.

## State Model

Moltis keeps several different categories of state:

- **Config** in `~/.config/moltis/moltis.toml`
- **Operational data** in `~/.moltis/`
- **Credential material** in auth/vault-backed stores
- **Session state** for chats, branches, checkpoints, and runtime bindings
- **Workspace context** from `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, and
  related rule files

For the operator-plus-coding direction, three product objects matter most:

- **Workspaces**: project binding plus durable memory, attached external work,
  and coordinator notes
- **Machines**: the execution route (`local`, `sandbox`, `ssh`, `node`) plus
  the trust boundary that route implies
- **Runs / sessions**: the durable conversation and checkpoint container that
  ties workspaces and machines together

That model now shows up in session metadata and runtime context instead of
remaining implicit in scattered fields:

- `workspace`
- `execution_route`
- `surface`
- `external_agent_source`

This split is deliberate: configuration, durable memory, auth material, and
project context do not all change on the same cadence and should not share the
same failure modes.

## Coordinator State

Moltis now keeps a lightweight session coordinator layer on top of the generic
session-state store. It captures:

- decision
- current plan
- next action
- route constraints
- durable notes
- attached external-agent activity

That state is consumed in three places:

1. The web UI workspace overview
2. Chat context inspection (`chat.context`)
3. Prompt assembly, where coordinator notes are appended to project context

## Where To Go Next

- [Usage Guide](usage-guide.md) for the day-to-day operator workflow
- [Advanced Use Cases](advanced-use-cases.md) for production patterns
- [System Prompt](system-prompt.md) for prompt assembly internals
- [Tool Registry](tool-registry.md) for tool exposure and lazy loading
