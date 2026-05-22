# Vibe Code

Terminal-based AI chat client built with React and Express. A web-based interface for chatting with LLMs, supporting streaming responses, tool execution, session management, file attachment, checkpoint system, and a sub-agent system.

## Quick Start

```bash
cd web
npm install
npm start
```

Opens at `http://localhost:3000` (Vite dev server proxies API to Express on port 3001).

## Features

### Chat Interface
- Streaming AI responses with word-by-word rendering
- Markdown stripping for clean terminal-style output
- Scrollable chat area with keyboard navigation
- Stop button to interrupt running requests
- Animated thinking indicator with rotating messages
- Copy button on code blocks
- Ghost text autocomplete for slash commands (type `/` to see suggestions)
- Tab or Arrow Right to accept autocomplete suggestion
- Animated logo with blinking mascot and rotating taglines
- Dismissible terminal hint banner

### File Attach System
- Browse and attach files from the codebase to your message
- Directory tree navigation with search
- File type icons based on extension (JS, TS, Py, HTML, CSS, etc.)
- Multi-select support
- Attached files shown as removable chips in input

### Diff View
- Syntax-highlighted diffs with added/removed coloring
- Context-aware hunks (shows surrounding lines)
- Line numbers for both old and new content
- Unified diff format for easy reading

### Tools (16 available)
- **Shell**: `run_bash` - Execute commands with 30s timeout
- **Files**: `read_file`, `write_file`, `edit_file`, `glob_files`, `grep_search`
- **Web**: `web_fetch`, `web_search` (DuckDuckGo)
- **Tasks**: `task_create`, `task_list`, `task_output`, `task_stop`
- **Agents**: `agent_spawn`, `agent_list`, `agent_get`, `agent_stop`

### Agent System
Sub-agents run autonomous AI loops with full tool access:

- **Agent Types**: Explore, Plan, Verify, Code, Debug - each with specialized system prompts
- **Color System**: 9 named colors for visual distinction (red, green, yellow, blue, magenta, orange, pink, teal, lavender)
- **Collapsible Progress**: Expandable cards in chat showing real-time status, logs, and results
- **Live Polling**: Agent status updates every 2 seconds

### Session Management
- Auto-save after each AI response
- `/resume` to browse and load saved sessions
- `/save` to manually save current conversation
- `/delete <id>` to remove sessions
- Full conversation history preserved with tool results
- Shows message count, model, and time since saved

### Checkpoint System
- `/checkpoint` or `/rewind` to save conversation snapshots
- Restore conversations to previous checkpoints
- Branch from checkpoints to try alternative approaches

### Provider System
- `/provider` opens settings overlay
- Presets: OpenCode (default), NVIDIA NIM
- Custom URL, models URL, and API key fields
- Auto-refreshes model list on provider change

### Model Selection
- `/model` opens searchable model selector
- `/model <id>` switches directly
- `Ctrl+M` keyboard shortcut

### PWA Support
- Installable as Progressive Web App
- Service worker for offline caching
- App manifest with theme color

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/model` | Open model selector |
| `/model <id>` | Switch model directly |
| `/apikey <key>` | Set API key |
| `/provider` | Provider settings overlay |
| `/checkpoint` | Save checkpoint |
| `/rewind` | Rewind to checkpoint |
| `/branch` | Fork from checkpoint |
| `/resume` | Browse saved sessions |
| `/save` | Save current session |
| `/delete <id>` | Delete a session |
| `/agents` | Show agents panel |
| `/attach` | Attach files to message |
| `/clear` | Clear chat history |
| `/init` | Create CLAUDE.md |
| `/exit` | Exit (web: close tab) |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+M` | Open model selector |
| `Ctrl+A` | Open agents panel |
| `Ctrl+F` | Attach files |
| `Enter` | Send message |
| `Escape` | Close overlay/cancel |
| `Arrow Up/Down` | Navigate dropdowns |
| `Delete` | Delete session (in resume) |

## Architecture

```
web/
├── server.js          # Express backend with API endpoints and tool execution
├── src/
│   ├── App.jsx        # Main React component (entire UI)
│   ├── App.css        # All styling with CSS variables
│   └── main.jsx       # React entry point
├── public/
│   ├── manifest.json  # PWA manifest
│   ├── sw.js          # Service worker
│   └── icon-*.svg     # App icons
├── assets/
│   ├── newlogo.png    # App logo
│   └── logo.png       # Text logo
└── vite.config.js     # Vite dev server with API proxy
```

### Server Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/config` | Load config and env |
| `POST` | `/api/config` | Save config updates |
| `POST` | `/api/env` | Save env variables |
| `GET` | `/api/models` | Fetch available models |
| `POST` | `/api/chat` | Stream chat completions |
| `POST` | `/api/tool` | Execute any tool |
| `GET` | `/api/sessions` | List saved sessions |
| `GET` | `/api/sessions/:id` | Get session by ID |
| `POST` | `/api/sessions` | Save a session |
| `DELETE` | `/api/sessions/:id` | Delete a session |
| `GET` | `/api/agents` | List all agents |
| `GET` | `/api/files` | List codebase files |
| `GET` | `/api/checkpoints/:sessionId` | Get checkpoints |
| `POST` | `/api/checkpoints` | Save checkpoint |

### Data Storage

All data stored under `~/.vibe-code/`:
- `config.json` - App configuration (provider, model, etc.)
- `.env` - Environment variables (API keys)
- `sessions/` - Saved chat sessions
- `rewind/` - Checkpoint data

## Configuration

### Provider Setup

1. Open `/provider` command
2. Select preset or enter custom URL
3. Enter Models URL if different from base URL
4. Enter API key if needed
5. Models auto-refresh from provider

### API Key

Set via:
- `/apikey <key>` command
- Provider settings overlay
- Environment variable `OPENAI_API_KEY`
- `~/.vibe-code/.env` file

## Agent System Details

### Agent Types

| Type | Color | Purpose |
|------|-------|---------|
| `explore` | Teal | Codebase exploration and analysis |
| `plan` | Blue | Implementation planning |
| `verify` | Green | Correctness verification |
| `code` | Magenta | Code writing and editing |
| `debug` | Red | Bug investigation and fixing |

### Agent Lifecycle

1. **Spawn**: AI calls `agent_spawn` with goal and optional type
2. **Run**: Agent executes autonomous AI loop with tool access
3. **Monitor**: Real-time status via collapsible cards or `/agents` panel
4. **Complete**: Agent returns final result when done
5. **Stop**: Can be stopped externally via UI or `agent_stop` tool

### Agent Colors

Agents are assigned colors from the palette:
- Red, Green, Yellow, Blue, Magenta
- Orange, Pink, Teal, Lavender

Colors persist throughout the agent's lifecycle and are used in:
- Spawned card borders and text
- Agents panel status indicators
- Stop buttons and badges

## Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
cd web
npm install
npm start
```

### Build
```bash
npm run build
```

### No Build Step
JSX runs directly via Vite. No transpilation or bundling needed for development.

## Design Principles

- **Terminal aesthetic**: Monospace font, sharp corners, dark theme
- **No emojis**: ASCII alternatives used throughout
- **Direct content**: All tool output visible immediately, no collapsible sections
- **Accent color**: `#D77757` (warm orange)
- **Responsive**: Works on desktop and mobile
- **PWA**: Installable with offline support

## License

MIT