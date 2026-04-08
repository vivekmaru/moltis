# Usage Guide

This guide focuses on the normal day-to-day workflow once Moltis is installed.
At this point, the most useful way to think about Moltis is:

- a **workspace** keeps durable context and coordinator state
- a **machine** makes execution routing explicit
- a **session** is the live run that ties those together

The default workflow is no longer "open chat, ask anything." It is "open the
right workspace, confirm the right machine, and continue real work."

## First Run

1. Start Moltis with `moltis`.
2. Open the browser URL shown in the terminal.
3. Enter the setup code printed at startup.
4. Create a password or register a passkey.
5. Add at least one provider in **Settings → Providers**.

After setup is complete, the same auth flow applies on localhost and remote
access.

## Daily Workflow

### 1. Choose a model

Use the chat model picker or `/model <name>` to switch between providers for a
session. Session-level choices are useful when you want one thread on Codex and
another on a local model.

### 2. Start or resume a session

- Use `/new` for a fresh thread.
- Resume from the session list when you want previous context and checkpoints.
- Use session branching when you want to explore an alternative path without
  overwriting the original thread.
- Prefer continuing a workspace-bound session over creating throwaway threads
  when the work has real history, decisions, or machine assumptions.

### 3. Attach project context

Point the session at a project so Moltis can ingest:

- `CLAUDE.md`
- `CLAUDE.local.md`
- `AGENTS.md`
- `.cursorrules`
- `.claude/rules/*.md`
- `.cursor/rules/*.{md,mdc}`

That gives the model the same local instructions your coding tools already use.

Treat that project binding as the session's workspace. The session header and
workspace overview surface four pieces of coordinator state explicitly:

- workspace
- execution route
- surface
- external agent source

You should not have to infer whether a session is local, sandboxed, attached to
SSH/node, or carrying imported Codex/Claude/Copilot work.

### 4. Let the agent use tools

By default Moltis exposes built-in tools such as command execution, web fetch,
web search, session management, and optional MCP tools. The important operating
rule is simple:

- keep approvals on unless you have a fully sandboxed automation path
- keep sandboxing on unless you have a deliberate reason to relax it
- make the execution route visible when using local, node, or SSH backends

Moltis is strongest when you treat tool use as an operator workflow, not a
hidden side effect of "chatting."

### 5. Save useful state

Use memory when you want durable recall across sessions, and use checkpoints or
session branching when you want safe reversible edits inside the agent workflow.

For coding and operator sessions, also keep the coordinator loop current:

- decision
- current plan
- next action
- route/tool constraints
- durable notes

The web UI reads that state back into the workspace overview, and the prompt
assembly path injects it alongside project context so resumed sessions can pick
up with less reconstruction.

## Coding Memory Flow

The intended workflow for Codex, Claude Code, or Copilot handoff is:

1. Bind the session to the right workspace/project.
2. Pick the execution machine explicitly before running commands.
3. Attach external-agent work when something important happened outside the
   Moltis web UI.
4. Update the coordination loop when you make a decision or define the next
   action.

The point is not to replace those coding tools. The point is to let Moltis own
the durable state around them:

- workspace identity
- execution route
- memory and notes
- attached external work
- resumable context for the next session

Workspace binding now carries a machine default as well:

- when you bind a session to a workspace, Moltis reapplies that workspace's
  preferred machine if one is recorded
- when you switch the machine for a workspace-bound session, Moltis persists
  that choice back to the workspace so the next session starts from the same
  execution route
- the workspace overview shows the stored preferred machine separately from the
  session's current route so you can tell whether you are using the workspace
  default or a temporary override
- recent workspace session cards also show the normalized machine state for
  each session, so disconnected node routes remain visibly unavailable instead
  of looking like generic node bindings

The first attach/import workflow is API- and RPC-based instead of editor-plugin
based:

- the workspace overview includes an **Attach external work** form for quick
  manual Codex / Claude Code / Copilot / API handoffs
- `sessions.external.attach` records an external run summary in workspace state
- `sessions.coordination.set` updates decision/plan/next-action notes
- `sessions.workspace_overview` returns the combined state used by the UI
- `machines.list` and `machines.get` describe the available local, sandbox,
  SSH, and node routes
- `machines.set_session` makes the session-to-machine binding explicit instead
  of inferring it from legacy route fields

Use the manual attach flow when something important happened outside the Moltis
web chat but should still become part of the durable workspace record. The
attached work is kept separate from the live conversation and from durable
notes, which helps Moltis stay in the coordinator role instead of flattening
every external run into one chat transcript.

The attach form can also capture import metadata and coordinator state in one
step:

- imported session key
- imported message count
- current plan
- next action
- durable notes

That is useful when you want to hand a branch back from Codex / Claude Code /
Copilot and leave the next Moltis session with a clear landing point instead of
just a loose summary.

## Recommended Settings

### Personal workstation

- Password or passkey enabled
- Sandbox mode on
- Local, sandbox, or SSH exec depending on your workflow
- One or two trusted MCP servers instead of a large unmanaged set

This is the best fit for the product today: a personal control plane for
coding, homelab, and operator workflows on trusted hardware.

### Shared/internal server

- Strong password plus passkey where possible
- Reverse proxy with TLS and explicit forwarded headers
- Scoped API keys for automation
- Remote execution through named SSH targets or paired nodes
- Metrics/log shipping enabled

## Common Tasks

### Configure providers

Use **Settings → Providers** for API-key or OAuth-backed providers. Moltis can
use direct API keys, OAuth-backed Codex/Copilot accounts, and local models in
the same instance.

### Review tool availability

Open **Settings → Tools** to see the effective inventory for the current
session and model, including whether MCP tools are active and where `exec`
would run.

### Manage SSH and nodes

- **Settings → SSH** for managed keys, named targets, host pinning, and doctor
  checks
- **Settings → Nodes** for paired remote machines and route inventory
- Use the chat toolbar machine selector to switch the active session between:
  - local host
  - sandbox
  - paired nodes
  - managed SSH targets

The selector only appears when there is a meaningful choice to make. A
single-machine session keeps the simpler local-host view.

If the active session is bound to a workspace, machine selections become sticky
at the workspace level. That is the intended default for repeat operator flows
like a home server workspace that should keep landing on the same SSH target or
paired node.

The workspace overview is now the primary operator view for execution routing.
It shows:

- the current machine posture
- trust state and health
- approval mode and route guardrails
- available machines, including which one is current and which one is the
  workspace default

That gives you a place to audit where commands will run before you change the
session machine or start issuing operator tasks.

### Share access safely

- Use session cookies for browsers
- Use scoped API keys for scripts or services
- Use channel allowlists before exposing Telegram/Discord/Slack-style surfaces

## Operational Habits

- Keep `moltis.toml` under change control if you operate a shared instance.
- Review new MCP servers, skills, and hooks before enabling them.
- Prefer scoped API keys over reusing your browser session for automation.
- Treat `Settings → Security`, `Settings → Tools`, and `moltis doctor` as part
  of normal maintenance.
- Treat the workspace overview as your main pre-flight check before running
  agent-driven operator tasks.

## Next Steps

- [Advanced Use Cases](advanced-use-cases.md)
- [Integrations](integrations.md)
- [Authentication](authentication.md)
- [Sandbox](sandbox.md)
