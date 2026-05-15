# Mr. Vibe

Terminal-based AI chat client built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs). Chat with LLMs directly from your terminal with 26 built-in tools, sub-agents, streaming responses, and a rich UI.

## Install

```bash
npm install
```

## Run

```bash
export OPENAI_API_KEY="your-api-key"
npm start
```

## Features

- Chat with AI models via `opencode.ai` API
- 26 built-in tools: file ops, bash, search, web, tasks, cron, agents
- Streaming responses in real-time
- Rich diff viewer for file edits (side-by-side)
- Sub-agent system — spawn autonomous AI agents
- Model switching with `/model`
- Chat history and scrollable output
- Model persistence across sessions

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
| `/clear` | Clear chat history |

## Tools

The AI has access to these tools:

- **File:** `read_file`, `write_file`, `edit_file`
- **Search:** `glob_files`, `grep_search`
- **Execution:** `run_bash`
- **Web:** `web_fetch`, `web_search`
- **Tasks:** `task_create`, `task_get`, `task_list`, `task_update`, `task_output`, `task_stop`
- **Cron:** `cron_create`, `cron_delete`, `cron_list`
- **Agents:** `agent_spawn`, `agent_list`, `agent_get`, `agent_stop`

## Tech Stack

- [Ink](https://github.com/vadimdemedes/ink) v7 — React for CLIs
- React 19
- Node.js 18+
- `tsx` — TypeScript/JSX execution without build step

## License

MIT
