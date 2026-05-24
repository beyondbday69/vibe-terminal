# Available Workspaces Selection in Workspace Selector

Enhance the `/cd` Workspace Selector UI to automatically discover and display neighboring workspace directories (siblings of the current directory) in a dedicated "Available" tab, styled with keyboard-driven tab switching.

## Concept

Currently, the Workspace Selector only displays a flat list of favorite workspaces. To make switching between active projects effortless, we will introduce a tabbed interface:

1. **Favorites Tab**: Manually registered directories. Allows adding (`[c]`) and deleting (`[d]`).
2. **Available Tab**: Automatically scanned sibling directories in the parent folder of the current workspace.

### UI & Navigation Enhancements

- **Tabs**: Switch between `[favorites]` and `[available]` using the `left` and `right` arrow keys.
- **Auto-Discovery**: On opening `/cd`, the app scans the parent folder of the current active workspace for other non-hidden directories.
- **Add to Favorites Shortcut**: In the "Available" tab, pressing `f` (or `F`) instantly registers the highlighted neighboring directory as a favorite.
- **Navigation**: Arrow `up` and `down` navigates the active list. `Enter` switches to the highlighted directory.

## Proposed Changes

### Parent Directory Scanning

#### [MODIFY] [App.jsx](file:///home/swapnilkolate044/vibe-terminal/src/App.jsx)
- In the `showWorkspaceSelector` state trigger, scan the parent directory of `currentCwd`.
- Filter out files and hidden directories (starting with `.`).
- Pass the resulting array as `availableWorkspaces` to the `<WorkspaceSelector>` component.

---

### Tabbed UI Component

#### [MODIFY] [WorkspaceSelector.jsx](file:///home/swapnilkolate044/vibe-terminal/src/components/WorkspaceSelector.jsx)
- Introduce `activeTab` state (`'favorites'` or `'available'`).
- Support `leftArrow` and `rightArrow` to switch between tabs.
- Display neighboring workspace directories in the "Available" tab.
- Support pressing `f` (or `F`) to trigger a callback `onAddFavorite(path)` to easily save neighboring workspaces.

## Verification Plan

### Manual Verification
- Type `/cd` and press Enter → verify the modal shows `[favorites]` and `[available]` tabs.
- Press `rightArrow` → verify it switches to the `[available]` tab and lists other projects (e.g. `openclaude`, `rog-rn`, etc.).
- Highlight an item in `[available]` and press `f` → verify it adds it to favorites.
- Highlight an item in `[available]` and press `Enter` → verify the app switches to that workspace and closes.
