# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Mistral Vibe — a terminal-based AI chat client built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs) and React. It renders a rich TUI in the terminal for chatting with LLMs via the `opencode.ai/zen/v1` API. Supports 26 built-in tools (function calling) that the AI can invoke, model switching, chat history, and scrollable output.

## Commands

```bash
npm start          # Run the app (executes: tsx src/index.js)
npm install        # Install dependencies
```

No build step, test framework, or linter is configured. The project runs JSX directly via `tsx`.

## Architecture

**Runtime:** ES modules (`"type": "module"` in package.json). JSX files are executed directly by `tsx` — no transpilation or bundling.

**Entry point:** `src/index.jsx` → renders `<App />` via Ink's `render()`.

**Core data flow in `src/App.jsx`:**
1. User submits a message → appended to conversation state
2. POST to `https://opencode.ai/zen/v1/chat/completions` with conversation + all 26 tool definitions
3. If the AI response includes `tool_calls`, they execute locally via `executeToolCall()` in `src/tools/executor.js`
4. Tool results are appended and the API is called again (recursive loop)
5. Loop continues until the AI returns a text-only response (no more tool calls)

**Sub-Agent System (`src/tools/handlers/agents.js`):**
- `agent_spawn` — Creates autonomous AI agents that work on tasks independently
- Each agent runs its own recursive AI loop with tool access
- Agents work in the background and report results when complete
- Use `agent_get` to check progress, `agent_list` to see all agents
- Max 5 concurrent agents, 20 iterations per agent

**Key state in App.jsx:** `messages`, `input`, `activeModel`, `isLoading`, `showModelSelector`, `chatScroll`

**Components (`src/components/`):**
- `AnimatedLogo.jsx` — ASCII art logo with row-by-row color animation (150ms intervals)
- `AnimatedInputBox.jsx` — Input field with ghost-text autocomplete for slash commands; shows `ThinkingText` when loading
- `ModelSelector.jsx` — Full-screen overlay with search, arrow-key navigation, and scroll pagination
- `ThinkingText.jsx` — "Thinking..." with each character a random color from the palette

**Tools engine (`src/tools/`):**
- `definitions.js` — 26 tool schemas in OpenAI function-calling format (run_bash, read_file, write_file, edit_file, web_search, glob_files, grep_search, agent_spawn, task_*, cron_*, etc.)
- `executor.js` — Dispatcher that routes tool calls to handler modules. Returns structured objects for rich UI display.
- `handlers/` — Modular tool implementations:
  - `bash.js` — Shell command execution via `child_process.exec`
  - `file-ops.js` — File read/write/edit with structured results
  - `search.js` — Glob and grep with built-in pattern matching
  - `web.js` — Web fetch and DuckDuckGo search
  - `tasks.js` — Background task management
  - `cron.js` — Scheduled command execution
  - `agents.js` — Autonomous sub-agent system (spawns AI loops)
  - `conceptual.js` — Stubs for unimplemented features

**Shared constants (`src/constants.js`):** Color palette (`COLORS`) and ASCII logo rows (`LOGO_ROWS`).

**Hooks (`src/hooks/`):** `useTerminalSize` — subscribes to `process.stdout` resize events, returns `{columns, rows}`.

**Utils (`src/utils/`):** `wrapText` — character-count text wrapping (no word-boundary awareness).

## Slash Commands

`/help`, `/model` (opens selector), `/model <id>` (direct switch), `/clear`

Keyboard: `Ctrl+M` opens model selector, arrow keys/Page Up/Down for chat scrolling, `ESC` to close model selector.

## Available Tools

- **File Operations:** `read_file`, `write_file`, `edit_file`
- **Search:** `glob_files`, `grep_search`
- **Execution:** `run_bash`
- **Web:** `web_fetch`, `web_search`
- **Tasks:** `task_create`, `task_get`, `task_list`, `task_update`, `task_output`, `task_stop`
- **Cron:** `cron_create`, `cron_delete`, `cron_list`
- **Agents:** `agent_spawn`, `agent_list`, `agent_get`, `agent_stop`
- **Other:** `ask_user_question`, `enter_plan_mode`, `exit_plan_mode`, `monitor_process`, `notebook_edit`, `invoke_skill`

## API

- Models list: `GET https://opencode.ai/zen/v1/models`
- Chat completions: `POST https://opencode.ai/zen/v1/chat/completions` (OpenAI-compatible format with tools)

## Known Issues

- `package.json` declares `ink ^4.0.0` and `react ^18.0.0` but the lockfile has `ink 7.0.3` and `react 19.2.6` installed — versions are out of sync.
- The `start` script references `src/index.js` but the actual file is `src/index.jsx` (tsx handles both).
