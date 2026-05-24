# Workspace Selector UI for `/cd` Command

Create a beautiful, interactive, center-aligned Workspace Selector UI for the `/cd` command (when run without arguments), allowing users to switch, add/create, and delete workspaces.

## Concept

Currently, `/cd <path>` switches the current directory, but there is no way to manage a collection of favorite workspaces or view them interactively. 

We will introduce a `WorkspaceSelector` UI component that activates when `/cd` is typed without arguments. It will persist favorite workspaces in the user's config file (`~/.vibe-code/config.json`).

### UI Features

1. **Center-aligned Card**: Matches the rounded borders and styling of the `TeamSelector` component.
2. **List Workspaces**: Shows all favorite workspaces with a pointer `▸` indicating the current selection.
3. **Switch Workspaces**: Use `up` and `down` arrow keys to highlight a workspace, and press `Enter` to switch to it immediately.
4. **Create / Add Workspace**: Press `c` (or `C`) to open an input field inside the card to add a new directory path. Pressing `Enter` adds it to the list (and validates that it exists).
5. **Delete Workspace**: Press `d` (or `D` or `Delete` key) to remove the highlighted workspace from the list.
6. **Esc to Close**: Press `Esc` to return to the terminal main loop.

## Proposed Changes

### Configuration Persistence

#### [MODIFY] [App.jsx](file:///home/swapnilkolate044/vibe-terminal/src/App.jsx)
- Load `workspaces` array from config on startup (defaults to an array containing `process.cwd()`).
- Add `/cd` command handler that:
  - If no argument → opens the `WorkspaceSelector` UI.
  - If path argument → switches to it directly and adds it to favorite workspaces list if not already present.
- Implement `handleAddWorkspace`, `handleDeleteWorkspace`, and `handleSwitchWorkspace` logic to update config and state.

---

### UI Components

#### [NEW] [WorkspaceSelector.jsx](file:///home/swapnilkolate044/vibe-terminal/src/components/WorkspaceSelector.jsx)
- Create a round-bordered card in Ink.
- Support key navigation (`upArrow`, `downArrow`, `escape`, `return`).
- Add state `isAdding` (boolean) and `newPathInput` (string) to capture text when adding a new workspace directory.
- Render helper keys in footer: `[c] add  [d] delete  [enter] switch  [esc] back`

---

### Command Dropdown

#### [MODIFY] [CommandDropdown.jsx](file:///home/swapnilkolate044/vibe-terminal/src/components/CommandDropdown.jsx)
- Update `/cd` description to: `"Change or switch workspaces interactively"`.

## Verification Plan

### Manual Verification
- Run the app, type `/cd` and press Enter → verify the Workspace Selector card opens.
- Verify arrow keys highlight different workspaces.
- Press `c`, type a path, press Enter → verify it adds to the list and persists.
- Press `d` → verify the workspace is removed.
- Press `Enter` on a workspace → verify the workspace switches and the card closes.
- Verify `Esc` closes the selector card.
