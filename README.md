# Vibe Code

A terminal-based AI chat client built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs). It renders a rich TUI for chatting with LLMs via configurable API providers, supporting streaming responses, 26 built-in tools, session management, a rewind/branch system, and multi-agent team orchestration.

## Features

- **Rich Terminal UI** — Built with Ink (React for CLIs), featuring animated components, markdown rendering, and mouse-free navigation.
- **Streaming Responses** — Tokens appear word-by-word with optional reasoning content display.
- **26 Built-in Tools** — bash execution, file read/write/edit, search, web fetch, background tasks, cron jobs, agent spawning, and more.
- **Session Management** — Auto-saves conversations to `~/.vibe-code/sessions/` with resume, delete, and favorite support.
- **Rewind & Branch** — Checkpoints are auto-created after each AI response. Use `/rewind` to revert and `/branch` to fork a new session.
- **Sub-Agent System** — Spawn helper agents (reviewer, researcher, etc.) that run autonomously with full tool access.
- **Team Mode** — Orchestrate multi-role teams (designer, backend-dev, reviewer, researcher, devops, manager) with the `/team` command.
- **Multi-Provider** — Supports opencode.ai (default), NVIDIA NIM, and any custom OpenAI-compatible API.
- **Web PWA** — A companion web app in `web/` built with Vite and React.
- **CLI Todo App** — A simple Python todo manager included at `src/todo.py`.

## Requirements

- Node.js 18 or higher
- Python 3.7 or higher (for the CLI todo app)

## Installation

```bash
git clone <repo-url>
cd vibe-terminal
npm install
```

No build step is required — JSX runs directly via `tsx`.

## Usage

Start the terminal app:

```bash
npm start
```

### Commands

Type `/help` in the app for the full list. Key commands:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/model` | Open the interactive model selector |
| `/provider` | Switch API provider (opencode / nvidia / custom) |
| `/team` | Activate team mode with multi-role agents |
| `/agents` or `/report` | View spawned agent reports |
| `/rewind <n>` | Revert to checkpoint N |
| `/branch <n>` | Fork a new session from checkpoint N |
| `/resume` | List and restore saved sessions |
| `/clear` | Clear chat history |
| `/clone <url>` | Clone a git repo and switch workspace |
| `/cd <path>` | Change the current workspace directory |
| `/init` | Analyze codebase and create CLAUDE.md |
| `/auto` | Toggle auto-execute mode for mutative tools |
| `/helpers` | Toggle helper agent suggestions |
| `/diff` | Show session edit log |
| `/exit` | Exit the app |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+M` | Open model selector |
| `Ctrl+T` | Toggle thinking process visibility |
| `Ctrl+O` | View agent detail overlay |
| `Esc` | Interrupt loading / cancel input |
| `Up/Down` | Scroll chat history |
| `PageUp/PageDown` | Fast scroll |

### Tools

The AI has access to 26 tools that execute locally:

- **bash** — Run shell commands with optional timeout
- **file-ops** — Read, write, edit, and glob files
- **search** — Grep search across the codebase
- **web** — Fetch URLs or search the web via DuckDuckGo
- **agents** — Spawn sub-agents, send team messages, list reports
- **tasks & cron** — Background tasks and scheduled jobs
- **conceptual** — Enter/exit plan mode, worktrees

Mutative tools (bash, write_file, edit_file) require confirmation in ask mode. Toggle `/auto` to skip confirmations.

## Architecture

**Runtime:** ES modules (`"type": "module"`). No transpilation or bundling for the CLI.

**Entry point:** `src/index.jsx` renders `<App />` via Ink's `render()`. Sets stdin raw mode and disables mouse tracking.

**Core data flow (`src/App.jsx`):**
1. User message appended to `messages` state
2. POST to `${provider.baseUrl}/chat/completions` with conversation + tool schemas
3. Streaming response rendered token-by-token
4. If `tool_calls` are present, execute locally via `executeToolCall()` in `src/tools/executor.js`
5. Tool results appended; API called again in a recursive loop
6. Loop continues until a text-only response
7. Auto-create checkpoint for the rewind system

**Tools engine (`src/tools/`):**
- `definitions.js` — 26 tool schemas (OpenAI function-calling format)
- `executor.js` — Routes tool calls to handlers
- `constants.js` — Execution limits (timeouts, file size caps)
- `state.js` — In-memory stores for background tasks and cron jobs
- `handlers/` — Modular implementations: bash, file-ops, search, web, tasks, cron, agents

**Session/Rewind (`src/utils/sessions.js`, `src/utils/rewind.js`):**
- Sessions auto-save to `~/.vibe-code/sessions/`
- Checkpoints stored in `~/.vibe-code/rewind/`
- `/rewind <n>` reverts; `/branch <n>` forks

**Sub-Agent System (`src/tools/handlers/agents.js`):**
- Agents stored in a module-level `Map` (singleton)
- Each agent runs its own recursive AI loop with full tool access
- `Ctrl+O` opens agent detail overlay
- Helper agents can auto-spawn on file edits or bash failures when `/helpers` is enabled

**Team Orchestration (`src/utils/teamOrchestrator.js`):**
- Parses team presets into role lists
- Generates orchestrator prompts for delegation

## Project Structure

```
vibe-terminal/
├── src/
│   ├── index.jsx              # Entry point (Ink render)
│   ├── App.jsx                # Main app component, input handling, API loop
│   ├── constants.js           # Logo, colors, system prompt template, role maps
│   ├── todo.py                # CLI todo manager (Python stdlib)
│   ├── components/            # React components for the TUI
│   │   ├── AnimatedLogo.jsx
│   │   ├── AnimatedInputBox.jsx
│   │   ├── CommandDropdown.jsx
│   │   ├── ModelSelector.jsx
│   │   ├── SessionPicker.jsx
│   │   ├── TeamSelector.jsx
│   │   ├── AgentReportCard.jsx
│   │   ├── ToolConfirmation.jsx
│   │   └── ThinkingText.jsx
│   ├── hooks/
│   │   └── useTerminalSize.js
│   ├── tools/
│   │   ├── definitions.js     # Tool schemas
│   │   ├── executor.js        # Tool call router
│   │   ├── constants.js       # Execution limits
│   │   ├── state.js           # In-memory task/cron stores
│   │   └── handlers/          # Tool implementations
│   │       ├── agents.js
│   │       ├── bash.js
│   │       ├── file-ops.js
│   │       ├── search.js
│   │       ├── web.js
│   │       ├── tasks.js
│   │       ├── cron.js
│   │       └── conceptual.js
│   └── utils/
│       ├── sessions.js        # Save/load/delete sessions
│       ├── rewind.js          # Checkpoint create/revert/fork
│       ├── env.js             # ~/.vibe-code/.env handling
│       ├── fileList.js        # File mention autocomplete
│       ├── text.js            # Text wrapping
│       ├── toolFormatters.js  # Tool result display formatting
│       ├── teamOrchestrator.js
│       ├── diffViewer.js
│       └── structuredDiff.js
├── web/                       # Vite + React PWA companion
│   ├── src/
│   ├── public/
│   ├── index.html
│   ├── vite.config.js
│   └── server.js
├── tests/
│   └── test_todo.py           # Unit tests for todo.py
├── docs/
│   ├── todo_app_design.md
│   ├── designer_readiness.md
│   └── reviewer_readiness.md
├── package.json
├── tsconfig.json
└── CLAUDE.md                  # Guidance for Claude Code
```

## Configuration

Config and secrets are stored in `~/.vibe-code/`:

- `config.json` — Saved provider, active model, workspace
- `.env` — API keys (`OPENAI_API_KEY`, `GITHUB_TOKEN`, etc.)
- `sessions/` — Auto-saved chat sessions
- `rewind/` — Session checkpoints

Priority for API keys:
1. `process.env.OPENAI_API_KEY`
2. `~/.vibe-code/.env`
3. `~/.vibe-code/config.json`

## Web PWA

The `web/` directory contains a Vite-based React app that can serve as a browser-based companion. To run it:

```bash
cd web
npm install
npm run dev
```

## CLI Todo App

A minimal Python todo manager using only the standard library:

```bash
python src/todo.py add "Buy groceries"
python src/todo.py list
python src/todo.py complete 1
python src/todo.py delete 1
```

Run tests:

```bash
python -m unittest tests/test_todo.py
```

## License

MIT
