<div align="center">

<a href="https://moltis.org"><img src="https://raw.githubusercontent.com/moltis-org/moltis/main/website/favicon.svg" alt="Moltis" width="64"></a>

# Moltis — A secure self-hosted agent control plane in Rust

One binary — persistent, routed, yours.

[![CI](https://github.com/moltis-org/moltis/actions/workflows/ci.yml/badge.svg)](https://github.com/moltis-org/moltis/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/moltis-org/moltis/graph/badge.svg)](https://codecov.io/gh/moltis-org/moltis)
[![CodSpeed](https://img.shields.io/endpoint?url=https://codspeed.io/badge.json&style=flat&label=CodSpeed)](https://codspeed.io/moltis-org/moltis)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-1.91%2B-orange.svg)](https://www.rust-lang.org)
[![Discord](https://img.shields.io/discord/1469505370169933837?color=5865F2&label=Discord&logo=discord&logoColor=white)](https://discord.gg/XnmrepsXp5)

[Installation](#installation) • [Comparison](#comparison) • [Architecture](#architecture--crate-map) • [Security](#security) • [Features](#features) • [How It Works](#how-it-works) • [Contributing](CONTRIBUTING.md)

</div>

---

Moltis recently hit [the front page of Hacker News](https://news.ycombinator.com/item?id=46993587). Please [open an issue](https://github.com/moltis-org/moltis/issues) for any friction at all. I'm focused on making Moltis excellent.

**Secure by design** — Your keys stay under your control. By default, command execution is sandboxed, and Moltis makes execution routing explicit when you choose local, SSH, or paired-node backends.

**Your hardware** — Runs on a Mac Mini, a Raspberry Pi, or any server you own. One Rust binary, no Node.js, no npm, no runtime.

**Product direction** — Moltis is no longer best described as a generic chat server. It is a durable control plane for coding and operator workflows: workspaces, explicit execution machines, persistent sessions, memory, approvals, and external-agent handoff all live in one place.

**Full-featured** — Voice, memory, cross-session recall, automatic edit checkpoints, scheduling, Telegram, Discord, browser automation, MCP servers, SSH or node-backed remote exec, managed deploy keys with host pinning in the web UI, a live Settings → Tools inventory, shared coding-agent context files, and context-file threat scanning — all built-in. No plugin marketplace to get supply-chain attacked through.

**Auditable** — The agent loop + provider model fits in ~5K lines. The system is split across modular Rust crates so the gateway, auth, providers, tools, and storage layers can be audited independently.

## Installation

```bash
# One-liner install script (macOS / Linux)
curl -fsSL https://www.moltis.org/install.sh | sh

# macOS / Linux via Homebrew
brew install moltis-org/tap/moltis

# Docker (multi-arch: amd64/arm64)
docker pull ghcr.io/moltis-org/moltis:latest

# Or build from source
cargo install moltis --git https://github.com/moltis-org/moltis
```

## Comparison

| | OpenClaw | PicoClaw | NanoClaw | ZeroClaw | **Moltis** |
|---|---|---|---|---|---|
| Language | TypeScript | Go | TypeScript | Rust | **Rust** |
| Agent loop | ~430K LoC | Small | ~500 LoC | ~3.4K LoC | **~5K LoC** (`runner.rs` + `model.rs`) |
| Full codebase | — | — | — | 1,000+ tests | **~124K LoC** (2,300+ tests) |
| Runtime | Node.js + npm | Single binary | Node.js | Single binary (3.4 MB) | **Single binary (44 MB)** |
| Sandbox | App-level | — | Docker | Docker | **Docker + Apple Container** |
| Memory safety | GC | GC | GC | Ownership | **Ownership, small isolated FFI surface\*** |
| Auth | Basic | API keys | None | Token + OAuth | **Password + Passkey + API keys + Vault** |
| Voice I/O | Plugin | — | — | — | **Built-in (15+ providers)** |
| MCP | Yes | — | — | — | **Yes (stdio + HTTP/SSE)** |
| Hooks | Yes (limited) | — | — | — | **15 event types** |
| Skills | Yes (store) | Yes | Yes | Yes | **Yes (+ OpenClaw Store)** |
| Memory/RAG | Plugin | — | Per-group | SQLite + FTS | **SQLite + FTS + vector** |

\* The main gateway path is Rust-first. Limited `unsafe` exists in isolated FFI and bridge code paths rather than the core request/auth/tooling flow.

> [Full comparison with benchmarks →](https://docs.moltis.org/comparison.html)

## Architecture — Crate Map

**Core** (always compiled):

| Crate | LoC | Role |
|-------|-----|------|
| `moltis` (cli) | 4.0K | Entry point, CLI commands |
| `moltis-agents` | 9.6K | Agent loop, streaming, prompt assembly |
| `moltis-providers` | 17.6K | LLM provider implementations |
| `moltis-gateway` | 36.1K | HTTP/WS server, RPC, auth |
| `moltis-chat` | 11.5K | Chat engine, agent orchestration |
| `moltis-tools` | 21.9K | Tool execution, sandbox |
| `moltis-config` | 7.0K | Configuration, validation |
| `moltis-sessions` | 3.8K | Session persistence |
| `moltis-plugins` | 1.9K | Hook dispatch, plugin formats |
| `moltis-service-traits` | 1.3K | Shared service interfaces |
| `moltis-common` | 1.1K | Shared utilities |
| `moltis-protocol` | 0.8K | Wire protocol types |

**Optional** (feature-gated or additive):

| Category | Crates | Combined LoC |
|----------|--------|-------------|
| Web UI | `moltis-web` | 4.5K |
| GraphQL | `moltis-graphql` | 4.8K |
| Voice | `moltis-voice` | 6.0K |
| Memory | `moltis-memory`, `moltis-qmd` | 5.9K |
| Channels | `moltis-telegram`, `moltis-whatsapp`, `moltis-discord`, `moltis-msteams`, `moltis-channels` | 14.9K |
| Browser | `moltis-browser` | 5.1K |
| Scheduling | `moltis-cron`, `moltis-caldav` | 5.2K |
| Extensibility | `moltis-mcp`, `moltis-skills`, `moltis-wasm-tools` | 9.1K |
| Auth & Security | `moltis-auth`, `moltis-oauth`, `moltis-onboarding`, `moltis-vault` | 6.6K |
| Networking | `moltis-network-filter`, `moltis-tls`, `moltis-tailscale` | 3.5K |
| Provider setup | `moltis-provider-setup` | 4.3K |
| Import | `moltis-openclaw-import` | 7.6K |
| Apple native | `moltis-swift-bridge` | 2.1K |
| Metrics | `moltis-metrics` | 1.7K |
| Other | `moltis-projects`, `moltis-media`, `moltis-routing`, `moltis-canvas`, `moltis-auto-reply`, `moltis-schema-export`, `moltis-benchmarks` | 2.5K |

Use `--no-default-features --features lightweight` for constrained devices (Raspberry Pi, etc.).

## Security

- **Rust-first core** — safety-critical gateway/auth/tooling paths stay in Rust with small isolated FFI boundaries
- **Sandboxed execution by default** — Docker + Apple Container, per-session isolation
- **Secret handling** — `secrecy::Secret`, zeroed on drop, redacted from tool output
- **Authentication** — password + passkey (WebAuthn), rate-limited, per-IP throttle
- **SSRF protection** — DNS-resolved, blocks loopback/private/link-local
- **Origin validation** — rejects cross-origin WebSocket upgrades
- **Hook gating** — `BeforeToolCall` hooks can inspect/block any tool invocation

See [Security Architecture](https://docs.moltis.org/security.html) for details.

## Features

- **AI Gateway** — Multi-provider LLM support (OpenAI Codex, GitHub Copilot, Local), streaming responses, agent loop with sub-agent delegation, parallel tool execution
- **Workspace + Machine Model** — Sessions now expose workspace, execution route, source, and normalized machine posture instead of hiding them in scattered flags
- **Coordinator Workflow** — Durable decision/plan/next-action notes plus attached external Codex / Claude Code / Copilot work
- **Communication** — Web UI, Telegram, Microsoft Teams, Discord, API access, voice I/O (8 TTS + 7 STT providers), mobile PWA with push notifications
- **Memory & Recall** — Per-agent memory workspaces, embeddings-powered long-term memory, hybrid vector + full-text search, session persistence with auto-compaction, cross-session recall, Cursor-compatible project context, context-file safety scanning
- **Safer Agent Editing** — Automatic checkpoints before built-in skill and memory mutations, restore tooling, session branching
- **Extensibility** — MCP servers (stdio + HTTP/SSE), skill system, 15 lifecycle hook events with circuit breaker, destructive command guard
- **Security** — Encryption-at-rest vault (XChaCha20-Poly1305 + Argon2id), password + passkey + API key auth, sandbox isolation, SSRF/CSWSH protection
- **Operations** — Cron scheduling, OpenTelemetry tracing, Prometheus metrics, cloud deploy (Fly.io, DigitalOcean), Tailscale integration, managed SSH deploy keys, host-pinned remote targets, live tool inventory in Settings, and CLI/web remote-exec doctor flows

## How It Works

Moltis is a **self-hosted agent runtime and control plane**. A single Rust
binary sits between you and multiple LLM providers, keeps durable session and
workspace state, and coordinates where actions actually run.

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Web UI    │  │  Telegram   │  │  Discord    │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────┬───────┴────────┬───────┘
                │   WebSocket    │
                ▼                ▼
        ┌──────────────────────────────────────┐
        │            Gateway Server            │
        │       (HTTP · WS · Auth · RPC)       │
        ├──────────────────────────────────────┤
        │  Workspaces | Machines | Sessions    │
        │   ┌───────────┐ ┌────────────────┐   │
        │   │   Agent   │ │ Tool / Route   │   │
        │   │   Runner  │◄┤ Coordination   │   │
        │   └─────┬─────┘ └────────────────┘   │
        │         │                             │
        │  ┌──────▼─────────────────────────┐   │
        │  │ Providers + Memory + Hooks     │   │
        │  │ Codex · Copilot · OpenAI · ... │   │
        │  └────────────────────────────────┘   │
        └──────────────────────────────────────┘
                     │          │
              ┌──────▼───┐  ┌──▼──────────┐
              │ Sandbox  │  │ SSH / Nodes │
              └──────────┘  └─────────────┘
```

The important product objects now are:

- **Workspaces** for project context, durable notes, and attached external work
- **Machines** for explicit execution routing and trust posture
- **Sessions** for the live run, checkpoints, and resumable conversation

See [Quickstart](https://docs.moltis.org/quickstart.html) and [Usage Guide](https://docs.moltis.org/usage-guide.html) for the operator-plus-coding workflow this supports.

## Getting Started

### Build & Run

Requires [just](https://github.com/casey/just) (command runner) and Node.js (for Tailwind CSS).

```bash
git clone https://github.com/moltis-org/moltis.git
cd moltis
just build-css                  # Build Tailwind CSS for the web UI
just build-release              # Build in release mode
cargo run --release --bin moltis
```

For a full release build including WASM sandbox tools:

```bash
just build-release-with-wasm    # Builds WASM artifacts + release binary
cargo run --release --bin moltis
```

Open the URL shown in the terminal. On first run, Moltis prints both the
browser URL and a setup code. Enter the code in the web UI to create your
password or register a passkey before adding providers and starting a session.

Optional flags: `--config-dir /path/to/config --data-dir /path/to/data`

### Docker

```bash
# Docker / OrbStack
docker run -d \
  --name moltis \
  -p 13131:13131 \
  -p 13132:13132 \
  -p 1455:1455 \
  -v moltis-config:/home/moltis/.config/moltis \
  -v moltis-data:/home/moltis/.moltis \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/moltis-org/moltis:latest
```

Open `https://localhost:13131` and complete the setup. For unattended Docker
deployments, set `MOLTIS_PASSWORD`, `MOLTIS_PROVIDER`, and `MOLTIS_API_KEY`
before first boot to skip the setup wizard. See [Docker docs](https://docs.moltis.org/docker.html)
for Podman, OrbStack, TLS trust, and persistence details.

### Cloud Deployment

| Provider | Deploy |
|----------|--------|
| DigitalOcean | [![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/moltis-org/moltis/tree/main) |

**Fly.io** (CLI):

```bash
fly launch --image ghcr.io/moltis-org/moltis:latest
fly secrets set MOLTIS_PASSWORD="your-password"
```

All cloud configs use `--no-tls` because the provider handles TLS termination.
See [Cloud Deploy docs](https://docs.moltis.org/cloud-deploy.html) for details.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=moltis-org/moltis&type=date&legend=top-left)](https://www.star-history.com/#moltis-org/moltis&type=date&legend=top-left)

## License

MIT
