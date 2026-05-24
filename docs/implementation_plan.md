# Helper Agents for Solo Mode

Add lightweight, auto-triggered helper agents that run in the background during solo mode to enhance the main AI's output — without requiring the user to set up a full team.

## Concept

In solo mode, the main AI handles everything. Helper agents are **automatic background assistants** that trigger after specific actions to provide extra value:

| Helper | Triggers After | What It Does |
|--------|---------------|--------------|
| **reviewer** | `write_file` or `edit_file` completes | Reads the changed file, checks for bugs/issues, posts a brief review inline |
| **researcher** | main AI calls `web_search` | Runs a deeper parallel search, adds supplementary context |
| **verifier** | `run_bash` exits with error | Reads error output + relevant files, suggests a fix |

These run as **fire-and-forget background agents** using the existing agent infrastructure. They:
- Spawn automatically (no user command needed)
- Use a lightweight single-iteration loop (1 API call, no tools)
- Post their result as a system message in the chat
- Show as a subtle row in the UI (dimmed, compact)
- Don't waste tokens — they make exactly 1 API call each, no tool loop

## Features

1. **Auto-review on file changes** — After the main AI writes/edits a file, a reviewer agent reads the file and posts a 2-3 line review (bugs, style, suggestions). Color-coded and collapsible.
2. **Auto-verify on bash errors** — When `run_bash` exits non-zero, a verifier agent reads the error + context and suggests a fix before the main AI retries.
3. **Toggleable via `/helpers` command** — Users can enable/disable helpers. Disabled by default to avoid surprise token usage.
4. **Compact UI row** — Helper agents show as a single dimmed line below the main chat: `◇ reviewer  checking utils.js...` then fade to the result.
5. **Solo helpers don't use tools** — They get the file content injected into their prompt and return plain text. Zero tool calls = minimal tokens.

## Proposed Changes

### Constants & Config

#### [MODIFY] [constants.js](file:///home/swapnilkolate044/vibe-terminal/src/constants.js)
- Add `HELPER_AGENT_PROMPTS` — system prompts for each helper type (reviewer, verifier)
- Add `ROLE_COLORS` and `ROLE_ICONS` entries for `helper-reviewer` and `helper-verifier`

---

### Agent Infrastructure

#### [MODIFY] [agents.js](file:///home/swapnilkolate044/vibe-terminal/src/tools/handlers/agents.js)
- Add `spawnHelperAgent(type, context)` function that:
  - Creates an agent with `isHelper: true` flag
  - Uses a simplified single-call AI loop (no tool access, 1 iteration max)
  - Posts result to `userMessageQueue` as a helper message
  - Auto-sets status to `done` after the single call
- Helper agents use `role: 'helper-reviewer'` or `'helper-verifier'`

---

### Main App Logic

#### [MODIFY] [App.jsx](file:///home/swapnilkolate044/vibe-terminal/src/App.jsx)
- Add `helpersEnabled` state (default: `false`)
- Add `/helpers` slash command to toggle
- After tool execution in the main loop:
  - If `write_file`/`edit_file` succeeded → spawn `helper-reviewer` with the file content
  - If `run_bash` failed (exit code != 0) → spawn `helper-verifier` with the error output
- In the agent polling `useEffect`, handle helper agent results:
  - Show as a special styled system message (dimmed, with role icon)
- In the agent panel UI: show helpers as compact dimmed rows
- Filter helpers from the "X running" counter in footer (they're brief, don't clutter)

---

### Slash Command

#### [MODIFY] [CommandDropdown.jsx](file:///home/swapnilkolate044/vibe-terminal/src/components/CommandDropdown.jsx)
- Add `/helpers` command entry: `"Toggle helper agents (auto-review, auto-verify)"`

## Verification Plan

### Manual Verification
- Run the app, enable `/helpers`, write a file → verify reviewer fires and posts a review
- Run a bash command that fails → verify verifier fires and posts a suggestion
- Confirm helpers show in the agent panel as dimmed rows
- Confirm `/helpers` toggles them on/off
- Confirm helpers don't fire when disabled
- Confirm each helper makes exactly 1 API call (check agent iterations)
