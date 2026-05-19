# Vibe Code

Terminal-based AI chat client built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs). Chat with LLMs directly from your terminal with 30 built-in tools, sub-agents, streaming responses, and a rich TUI.

## Install

```bash
npm install
```

## Run

```bash
# Set your API key (one of):
export OPENAI_API_KEY="your-api-key"
# or use /apikey in-app
# or add to ~/.vibe-code/.env

npm start
```

## Web Version

A full web port lives in `web/` with the same UI, tools, and config files. Runs as a PWA (installable on mobile/desktop).

```bash
cd web
npm install
npm start    # Vite dev server (port 3000) + Express API (port 3001)
```

Shares `~/.vibe-code/` config, sessions, and rewind data with the terminal version. Adds agent type selection (explore, plan, verify, code, debug) and an `/agents` command.

## Features

- Multiple provider support: opencode.ai (default), NVIDIA NIM, or any OpenAI-compatible API
- 30 built-in tools: file ops, bash, search, web, tasks, cron, agents, notebooks, planning, worktrees
- Streaming responses in real-time
- Rich diff viewer for file edits (side-by-side)
- Sub-agent system — spawn autonomous AI agents with full tool access
- Model switching with `/model`
- Checkpoint/rewind system — `/rewind` to revert, `/branch` to fork conversations
- Session save/restore with `/resume`
- File mentions with `@` autocomplete
- Command dropdown with `/` autocomplete
- `/init` to analyze codebase and create CLAUDE.md
- Bracketed paste support for multi-line input

## Keyboard Shortcuts

| Key | Action |
|---|---|
| Up/Down | Scroll chat |
| PageUp/PageDown | Scroll faster |
| Ctrl+M | Open model selector |
| Ctrl+O | View agent details |
| Enter | Send message |
| Backspace | Delete character |

## Slash Commands

| Command | Description |
|---|---|
| `/help` | Show help |
| `/model` | Open model selector |
| `/model <id>` | Switch model directly |
| `/apikey` | Set and persist API key |
| `/provider` | Switch provider (opencode, nvidia, custom) |
| `/rewind` | Rewind to a checkpoint |
| `/branch` | Fork from a checkpoint |
| `/init` | Analyze codebase, create CLAUDE.md |
| `/resume` | List/resume saved sessions |
| `/delete` | Delete a saved session |
| `/clear` | Clear chat history |
| `/exit` | Exit the app |

## Providers

| Provider | Command | API |
|---|---|---|
| opencode.ai | `/provider opencode` | Default, no key required |
| NVIDIA NIM | `/provider nvidia <key>` | NVIDIA API |
| Custom | `/provider custom <url> <key>` | Any OpenAI-compatible API |

## Tools

The AI has access to 30 tools:

- **File:** `read_file`, `write_file`, `edit_file`
- **Search:** `glob_files`, `grep_search`
- **Execution:** `run_bash`
- **Web:** `web_fetch`, `web_search`
- **Tasks:** `task_create`, `task_get`, `task_list`, `task_update`, `task_output`, `task_stop`
- **Cron:** `cron_create`, `cron_delete`, `cron_list`
- **Agents:** `agent_spawn`, `agent_list`, `agent_get`, `agent_stop`
- **Planning:** `ask_user_question`, `enter_plan_mode`, `exit_plan_mode`
- **Worktrees:** `enter_worktree`, `exit_worktree`
- **Other:** `monitor_process`, `notebook_edit`, `invoke_skill`

## Tech Stack

- [Ink](https://github.com/vadimdemedes/ink) v4 — React for CLIs
- React 18
- Node.js 18+
- `tsx` — TypeScript/JSX execution without build step

## Config

All config is stored in `~/.vibe-code/`:

- `config.json` — active model, provider settings
- `.env` — API keys, base URL
- `sessions/` — saved chat sessions
- `rewind/` — checkpoint data

## License

MIT
