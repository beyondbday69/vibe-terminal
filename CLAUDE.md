# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Vibe Code — a terminal-based AI chat client built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs). It renders a rich TUI for chatting with LLMs via configurable API providers, supporting streaming responses, 26 built-in tools, session management, and a rewind/branch system.

## Commands

```bash
npm start          # Run the app (executes: tsx src/index.js)
npm install        # Install dependencies
```

No build step, test framework, or linter. JSX runs directly via `tsx`.

## Architecture

**Runtime:** ES modules (`"type": "module"`). No transpilation or bundling.

**Entry point:** `src/index.jsx` → renders `<App />` via Ink's `render()`. Sets stdin raw mode and disables mouse tracking.

**Core data flow (`src/App.jsx`):**
1. User message → appended to `messages` state
2. POST to `${provider.baseUrl}/chat/completions` with conversation + 26 tool schemas
3. Streaming response — tokens appear word-by-word
4. If response has `tool_calls`, execute locally via `executeToolCall()` in `src/tools/executor.js`
5. Tool results appended, API called again (recursive loop)
6. Loop continues until text-only response
7. Auto-create checkpoint for rewind system

**Input handling:** App sets stdin to raw mode via `process.stdin.setRawMode(true)`. Mouse sequences are stripped from input. Bracketed paste mode (`\x1b[200~` / `\x1b[201~`) is handled for multi-line pastes.

**Config priority (in App.jsx):**
1. `process.env.OPENAI_API_KEY`
2. `~/.vibe-code/.env` (via `src/utils/env.js`)
3. `~/.vibe-code/config.json` (via `saveConfig()`)

**Sub-Agent System (`src/tools/handlers/agents.js`):**
- Agents stored in a module-level `Map` (singleton, survives across tool calls)
- Each agent runs its own recursive AI loop with full tool access
- `Ctrl+O` opens agent detail overlay showing status, iterations, activity log
- No iteration or concurrency limits

**Session/Rewind (`src/utils/sessions.js`, `src/utils/rewind.js`):**
- Sessions auto-save to `~/.vibe-code/sessions/`
- Checkpoints auto-create after each AI response, stored in `~/.vibe-code/rewind/`
- `/rewind <n>` reverts to checkpoint N; `/branch <n>` forks a new session

**Provider System:**
- `/provider opencode` (default, opencode.ai)
- `/provider nvidia <key>` (NVIDIA NIM API)
- `/provider custom <url> <key>` (any OpenAI-compatible API)

**Tools engine (`src/tools/`):**
- `definitions.js` — 26 tool schemas (OpenAI function-calling format)
- `executor.js` — Routes tool calls to handlers; returns structured `{type, message}` objects
- `constants.js` — Execution limits (EXEC_TIMEOUT_MS=30s, FILE_READ_MAX_BYTES=500KB, etc.)
- `state.js` — In-memory `Map` stores for background tasks and cron jobs
- `handlers/` — Modular implementations: bash, file-ops, search, web, tasks, cron, agents

**Key React state in App.jsx:** `messages`, `input`, `activeModel`, `provider`, `isLoading`, `showModelSelector`, `chatScroll`, `sessionId`

**Components (`src/components/`):**
- `AnimatedLogo.jsx`, `AnimatedInputBox.jsx`, `CommandDropdown.jsx`, `ModelSelector.jsx`, `SessionPicker.jsx`, `ThinkingText.jsx`

**Utils (`src/utils/`):** text wrapping, tool formatters, session/rewind management, file listing, `.env` handling

**Accent color:** `#D77757`