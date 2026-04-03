# Moltis

```admonish warning title="Alpha software: use with care"
Running an AI assistant on your own machine or server is still new territory. Treat Moltis as alpha software: run it in isolated environments, review enabled tools/providers, keep secrets scoped and rotated, and avoid exposing it publicly without strong authentication and network controls.
```

<div style="text-align: center; margin: 2em 0;">
<strong style="font-size: 1.2em;">A secure persistent personal agent server written in Rust.<br>One binary, no runtime, no npm.</strong>
</div>

Moltis compiles your entire AI gateway — web UI, LLM providers, tools, and all assets — into a single self-contained executable. There's no Node.js to babysit, no `node_modules` to sync, no V8 garbage collector introducing latency spikes.

```bash
# Quick install (macOS / Linux)
curl -fsSL https://www.moltis.org/install.sh | sh
```

## Why Moltis?

| Feature | Moltis | Other Solutions |
|---------|--------|-----------------|
| **Deployment** | Single binary | Node.js + dependencies |
| **Memory Safety** | Rust ownership | Garbage collection |
| **Secret Handling** | Zeroed on drop | "Eventually collected" |
| **Sandbox** | Docker + Apple Container | Docker only |
| **Startup** | Milliseconds | Seconds |

## Key Features

- **Multiple LLM Providers** — Anthropic, OpenAI, Google Gemini, DeepSeek, Mistral, Groq, xAI, OpenRouter, Ollama, Local LLM, and more
- **Streaming-First** — Responses appear as tokens arrive, not after completion
- **Sandboxed Execution** — Commands run in isolated containers (Docker or Apple Container)
- **MCP Support** — Connect to Model Context Protocol servers for extended capabilities
- **Multi-Channel** — Web UI, Telegram, Discord, API access with synchronized responses
- **Built-in Throttling** — Per-IP endpoint limits with strict login protection
- **Long-Term Memory** — Embeddings-powered knowledge base with hybrid search
- **Cross-Session Recall** — Search earlier sessions for relevant snippets and prior decisions
- **Automatic Checkpoints** — Restore built-in skill and memory mutations without touching git history
- **Remote Exec Targets** — Route command execution locally, through a paired node, or over SSH
- **Context Hardening** — Load `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, and rule directories with safety scanning
- **Hook System** — Observe, modify, or block actions at any lifecycle point
- **Compile-Time Safety** — Misconfigurations caught by `cargo check`, not runtime crashes

See the full list of [supported providers](providers.md).

## Quick Start

```bash
# Install
curl -fsSL https://www.moltis.org/install.sh | sh

# Run
moltis
```

On first launch:
1. Open the URL shown in your browser
2. Enter the setup code printed in the terminal
3. Create a password or register a passkey
4. Add your LLM provider
5. Start chatting

```admonish note
On first launch, Moltis prints a setup code in the terminal. Use that code to
finish password or passkey setup in the browser. After setup is complete, auth
is enforced on loopback and remote access alike.
```

→ [Full Quickstart Guide](quickstart.md)

## How It Works

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  Web UI  │  │ Telegram │  │ Discord  │  │   API    │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │             │
     └─────────────┴─────────┬───┴─────────────┘
                             │
                             ▼
        ┌───────────────────────────────┐
        │       Moltis Gateway          │
        │   ┌─────────┐ ┌───────────┐   │
        │   │  Agent  │ │   Tools   │   │
        │   │  Loop   │◄┤  Registry │   │
        │   └────┬────┘ └───────────┘   │
        │        │                      │
        │   ┌────▼────────────────┐     │
        │   │  Provider Registry  │     │
        │   │ Anthropic·OpenAI·Gemini… │   │
        │   └─────────────────────┘     │
        └───────────────────────────────┘
                        │
                ┌───────▼───────┐
                │    Sandbox    │
                │ Docker/Apple  │
                └───────────────┘
```

## Documentation

### Getting Started
- **[Quickstart](quickstart.md)** — Up and running in 5 minutes
- **[Installation](installation.md)** — All installation methods
- **[Usage Guide](usage-guide.md)** — Day-to-day workflows after first boot
- **[Configuration](configuration.md)** — `moltis.toml` reference
- **[End-to-End Testing](e2e-testing.md)** — Browser regression coverage for the web UI

### Features
- **[Providers](providers.md)** — Configure LLM providers
- **[MCP Servers](mcp.md)** — Extend with Model Context Protocol
- **[Hooks](hooks.md)** — Lifecycle hooks for customization
- **[Local LLMs](local-llm.md)** — Run models on your machine

### Deployment
- **[Docker](docker.md)** — Container deployment

### Architecture
- **[Architecture](architecture.md)** — System layout, crate map, and data flow
- **[Advanced Use Cases](advanced-use-cases.md)** — Higher-leverage production patterns
- **[Integrations](integrations.md)** — Codex, Claude Code, MCP, and workflow integrations
- **[Streaming](streaming.md)** — How real-time streaming works
- **[Metrics & Tracing](metrics-and-tracing.md)** — Observability

## Security

Moltis applies defense in depth:

- **Authentication** — Password or passkey (WebAuthn) after bootstrap; setup-code-gated onboarding on first run
- **SSRF Protection** — Blocks requests to internal networks
- **Secret Handling** — `secrecy::Secret` zeroes memory on drop
- **Sandboxed Execution** — Sandbox-first execution with explicit local/SSH/node routing
- **Origin Validation** — Prevents Cross-Site WebSocket Hijacking
- **Tight unsafe surface** — the core gateway path stays in safe Rust, with small isolated FFI/bridge boundaries

## Community

- **GitHub**: [github.com/moltis-org/moltis](https://github.com/moltis-org/moltis)
- **Issues**: [Report bugs](https://github.com/moltis-org/moltis/issues)
- **Discussions**: [Ask questions](https://github.com/moltis-org/moltis/discussions)

## License

MIT — Free for personal and commercial use.
