# CLI Todo App Design Document

## 1. Overview

A lightweight, terminal-based task manager written in Python. Users manage tasks through a single entry-point script without a persistent server or GUI. The primary goals are speed, clarity, and minimal friction for terminal-centric workflows.

Goals:
- Add, view, complete, and delete tasks via intuitive subcommands.
- Display tasks in a scannable, column-aligned format.
- Provide clear, actionable feedback for every command.
- Store data locally in a simple JSON or text file.

## 2. CLI Command Structure & Usage Examples

Entry point: `python src/todo.py`

### Add a task
```
python src/todo.py add "TASK_DESCRIPTION" [--due YYYY-MM-DD] [--priority low|medium|high]
```
Examples:
```
python src/todo.py add "Buy milk" --due 2024-12-25
python src/todo.py add "Review pull request" --priority high
python src/todo.py add "Walk the dog"
```

### List tasks
```
python src/todo.py list [--status all|pending|completed] [--sort due|priority|created]
```
Examples:
```
python src/todo.py list
python src/todo.py list --status pending
python src/todo.py list --sort due
```

### Complete a task
```
python src/todo.py complete TASK_ID
```
Example:
```
python src/todo.py complete 3
```

### Delete a task
```
python src/todo.py delete TASK_ID [--force]
```
Example:
```
python src/todo.py delete 2
python src/todo.py delete 2 --force
```

## 3. Output Formatting Specifications

### Task List Table
When listing tasks, output must be column-aligned for readability. Use fixed-width columns or padded strings.

Example output for `python src/todo.py list`:
```
ID  Status      Due Date    Priority  Description
--  ------      --------    --------  -----------
1   [ ]         2024-12-25  medium    Buy milk
2   [x]         --          high      Review pull request
3   [ ]         --          low       Walk the dog
```

Column rules:
- ID: right-aligned, minimum width 3 characters.
- Status: `[ ]` for pending, `[x]` for completed.
- Due Date: `YYYY-MM-DD` or `--` if unset.
- Priority: lowercase string, width 8 characters.
- Description: truncated with ellipsis at terminal width minus other columns.

### Empty state
If no tasks exist, print exactly:
```
No tasks found. Use "python src/todo.py add <description>" to create one.
```

### Add / Complete / Delete confirmation
On success, print a single line:
```
Added task #4: Walk the dog
Completed task #2
Deleted task #3
```

## 4. User Flows

### Adding a task
1. User types `python src/todo.py add "Buy milk" --due 2024-12-25`.
2. App validates the due date format.
3. App appends the task to storage with a new auto-increment ID.
4. App prints confirmation: `Added task #1: Buy milk`.

### Listing tasks
1. User types `python src/todo.py list`.
2. App reads all tasks from storage.
3. If tasks exist, app prints the formatted table sorted by ID ascending.
4. If no tasks exist, app prints the empty-state message.

### Completing a task
1. User types `python src/todo.py complete 1`.
2. App verifies that task ID `1` exists.
3. App marks task status as completed.
4. App prints confirmation: `Completed task #1`.

### Deleting a task
1. User types `python src/todo.py delete 1`.
2. App verifies that task ID `1` exists.
3. If `--force` is omitted, app prompts: `Delete task #1: "Buy milk"? (y/n)`.
4. On confirmation (or when `--force` is used), app removes the task.
5. App prints confirmation: `Deleted task #1`.

## 5. Error Handling & Feedback Guidelines

All error messages must be printed to stderr and use a non-zero exit code. Error messages must be plain text, one sentence, and suggest the next step.

### Invalid or missing arguments
```
Error: Missing task description. Usage: python src/todo.py add "<description>"
Error: Invalid due date "2024-25-12". Expected format: YYYY-MM-DD.
Error: Unknown priority "urgent". Choose from: low, medium, high.
```

### Invalid task ID
```
Error: Task ID 99 not found. Use "python src/todo.py list" to see valid IDs.
```

### Empty task list (for operations requiring an existing task)
```
Error: No tasks exist. Use "python src/todo.py add <description>" to create one.
```

### General syntax errors
```
Error: Unknown command "update". See usage: python src/todo.py --help
```

### Prompt cancellation
If a user answers `n` or presses Ctrl+C during a delete confirmation:
```
Operation cancelled. Task was not deleted.
```
