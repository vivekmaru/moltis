# Advanced Use Cases

This page collects higher-leverage ways people can use Moltis once the basics
are in place.

## Persistent Coding Gateway

Use Moltis as the always-on backend for coding sessions:

- keep providers, auth, MCP servers, and remote exec configured once
- reuse the same session history across browser, mobile PWA, and channels
- preserve project rules from `CLAUDE.md`, `AGENTS.md`, and related files
- keep checkpoints and branches without relying on ad-hoc shell history

This is a good fit when you want the model runtime to stay warm and durable
while clients come and go.

The product direction here is closer to "coding coordinator" than "editor
replacement":

- external tools can still do the hands-on coding
- Moltis keeps the durable workspace, machine, and memory state
- important work gets attached back into the same long-lived operator context

## Remote Execution Fabric

Moltis can route command execution through:

- the local host
- sandboxed local containers
- a paired node
- a named SSH target

That makes it useful for build servers, homelab machines, and GPU boxes where
the planning interface lives in one place but execution happens elsewhere.

This is one of the strongest non-chat use cases for Moltis today: one place to
see and control where actions will run before the agent starts issuing them.

## Long-Lived Operational Automation

Combine cron, approvals, and scoped API keys for recurring work such as:

- daily repository health checks
- dependency or provider drift audits
- backup verification
- incident summaries or log triage
- environment inventory snapshots

The important pattern is to keep the automation surface narrow: dedicated
sessions, scoped keys, limited tools, and clear review points.

## MCP Hub For Internal Tools

Instead of teaching each agent client how to talk to every internal system, use
Moltis as the MCP aggregation layer:

- add remote or stdio MCP servers once
- expose them consistently to every session
- centralize auth material and timeout policy
- make enabled tools visible in the UI

This works well when you have a mix of GitHub, databases, internal APIs, and
custom automation servers.

In practice this is often the lowest-friction way to integrate Moltis with
existing agent ecosystems: use shared instruction files for context and MCP for
tool compatibility.

## Channel-Driven Inbox Assistant

For teams or personal ops workflows, channels can become a controlled inbox:

- Telegram or Discord for quick questions and summaries
- Slack or WhatsApp for narrow, approved flows
- approval gates before destructive execution
- sender allowlists to prevent silent exposure

The key architectural point is that channel sessions remain distinct from the
main web session.

## Memory-Backed Personal Knowledge Base

Use memory as a retrieval layer for:

- runbooks
- team conventions
- hardware inventory
- recurring project context
- postmortem notes

This is most useful when paired with strong project-context hygiene so the
model gets both durable memory and repo-local instructions.

## Production Deployment Pattern

A common production shape is:

1. gateway behind a reverse proxy with TLS
2. strong auth plus passkeys
3. sandboxing enabled by default
4. remote execution through SSH or nodes
5. scoped API keys for automation
6. metrics and logs exported for review

Use [Cloud Deploy](cloud-deploy.md), [Docker](docker.md), and
[Security Architecture](security.md) together when designing this setup.
