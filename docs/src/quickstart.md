# Quickstart

Get Moltis running in under 5 minutes.

## 1. Install

```bash
curl -fsSL https://www.moltis.org/install.sh | sh
```

Or via Homebrew:

```bash
brew install moltis-org/tap/moltis
```

## 2. Start

```bash
moltis
```

You'll see output like:

```
🚀 Moltis gateway starting...
🌐 Open https://localhost:13131 in your browser
🔐 setup code: 123456
```

The exact URL depends on your bind and TLS configuration. On first run, use the
setup code from the terminal to create a password or register a passkey.

## 3. Finish Setup

1. Open the browser URL shown in the terminal.
2. Enter the setup code.
3. Create a password or register a passkey.
4. Sign in if prompted.

## 4. Configure a Provider

You need an LLM provider configured to chat. The fastest options:

### Option A: API Key (Anthropic, OpenAI, Gemini, etc.)

1. Set an API key as an environment variable and restart Moltis:
   ```bash
   export ANTHROPIC_API_KEY="sk-ant-..."   # Anthropic
   export OPENAI_API_KEY="sk-..."          # OpenAI
   export GEMINI_API_KEY="..."             # Google Gemini
   ```
2. Models appear automatically in the model picker.

Or configure via the web UI: **Settings** → **Providers** → enter your API key.

### Option B: OAuth (Codex / Copilot)

1. In Moltis, go to **Settings** → **Providers**
2. Click **OpenAI Codex** or **GitHub Copilot** → **Connect**
3. Complete the OAuth flow

### Option C: Local LLM (Offline)

1. In Moltis, go to **Settings** → **Providers**
2. Click **Local LLM**
3. Choose a model and save

See [Providers](providers.md) for the full list of supported providers.

## 5. Start Your First Real Session

Go to the **Chat** tab, create a session, and treat it as a workspace-backed
run instead of a disposable chat.

Recommended first steps:

1. Bind the session to a project/workspace.
2. Pick the execution machine explicitly.
3. Open the workspace overview and confirm the current route.
4. Start with a concrete task.

Example:

```
You: Bind this session to my homelab workspace, keep it on the sandbox, and summarize the next three maintenance tasks.
```

## What's Next?

### Enable Tool Use

Moltis can execute code, browse the web, and more. Tools are enabled by
default with sandbox protection and explicit route selection.

Try:

```
You: Create a hello.py file, explain where you will run it, then execute it
```

The important habit is to check **where** commands will run:

- local host
- sandbox
- paired node
- SSH target

The workspace overview and machine selector are the main control surfaces for
that.

### Connect Telegram

Chat with your agent from anywhere:

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Copy the bot token
3. In Moltis: **Settings** → **Telegram** → Enter token → **Save**
4. Message your bot!

### Connect Discord

1. Create a bot in the [Discord Developer Portal](https://discord.com/developers/applications)
2. Enable **Message Content Intent** and copy the bot token
3. In Moltis: **Settings** → **Channels** → **Connect Discord** → Enter token → **Connect**
4. Invite the bot to your server and @mention it!

→ [Full Discord setup guide](discord.md)

### Add MCP Servers

Extend capabilities with [MCP servers](mcp.md):

```toml
# In moltis.toml
[mcp]
[mcp.servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env = { GITHUB_TOKEN = "ghp_..." }
```

### Set Up Memory

Enable long-term memory for context across sessions:

```toml
# In moltis.toml
[memory]
provider = "openai"
model = "text-embedding-3-small"
```

Add knowledge by placing Markdown files in `~/.moltis/memory/`.

### Attach External Agent Work

If you also use Codex, Claude Code, or Copilot, Moltis can already act as the
durable coordinator for that work.

Use:

- `sessions.external.attach` to record important work done outside the web UI
- `sessions.coordination.set` to store the decision, plan, or next action

That lets a new session recover the shape of the work without pretending every
step happened inside one chat transcript.

## Useful Commands

| Command | Description |
|---------|-------------|
| `/new` | Start a new session |
| `/model <name>` | Switch models |
| `/clear` | Clear chat history |
| `/help` | Show available commands |

## File Locations

| Path | Contents |
|------|----------|
| `~/.config/moltis/moltis.toml` | Configuration |
| `~/.config/moltis/provider_keys.json` | API keys |
| `~/.moltis/` | Data (sessions, memory, logs) |

## Getting Help

- **Documentation**: [docs.moltis.org](https://docs.moltis.org)
- **GitHub Issues**: [github.com/moltis-org/moltis/issues](https://github.com/moltis-org/moltis/issues)
- **Discussions**: [github.com/moltis-org/moltis/discussions](https://github.com/moltis-org/moltis/discussions)
