#!/usr/bin/env python3
"""Simple CLI todo manager with JSON persistence."""

import json
import sys
import os
from datetime import datetime

DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tasks.json")


def load_tasks():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_tasks(tasks):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(tasks, f, indent=2)


def next_id(tasks):
    if not tasks:
        return 1
    return max(t["id"] for t in tasks) + 1


def find_task(tasks, task_id):
    for t in tasks:
        if t["id"] == task_id:
            return t
    return None


def cmd_add(args):
    if not args:
        print("Usage: python todo.py add <task description>")
        sys.exit(1)
    tasks = load_tasks()
    task = {
        "id": next_id(tasks),
        "text": " ".join(args),
        "done": False,
        "created": datetime.now().isoformat(),
    }
    tasks.append(task)
    save_tasks(tasks)
    print(f"Added task #{task['id']}: {task['text']}")


def cmd_list(_args):
    tasks = load_tasks()
    if not tasks:
        print("No tasks. Add one with: python todo.py add <description>")
        return
    print(f"{'ID':<4} {'Status':<8} Task")
    print("-" * 50)
    for t in tasks:
        status = "[x] done" if t["done"] else "[ ] open"
        print(f"{t['id']:<4} {status:<8} {t['text']}")
    pending = sum(1 for t in tasks if not t["done"])
    total = len(tasks)
    print(f"\n{pending}/{total} tasks pending")


def cmd_done(args):
    if not args:
        print("Usage: python todo.py done <id>")
        sys.exit(1)
    try:
        task_id = int(args[0])
    except ValueError:
        print("Error: ID must be a number")
        sys.exit(1)
    tasks = load_tasks()
    task = find_task(tasks, task_id)
    if not task:
        print(f"Error: no task with ID {task_id}")
        sys.exit(1)
    task["done"] = True
    task["completed"] = datetime.now().isoformat()
    save_tasks(tasks)
    print(f"Marked task #{task_id} as done: {task['text']}")


def cmd_delete(args):
    if not args:
        print("Usage: python todo.py delete <id>")
        sys.exit(1)
    try:
        task_id = int(args[0])
    except ValueError:
        print("Error: ID must be a number")
        sys.exit(1)
    tasks = load_tasks()
    original_len = len(tasks)
    tasks = [t for t in tasks if t["id"] != task_id]
    if len(tasks) == original_len:
        print(f"Error: no task with ID {task_id}")
        sys.exit(1)
    save_tasks(tasks)
    print(f"Deleted task #{task_id}")


def cmd_clear(_args):
    tasks = load_tasks()
    before = len(tasks)
    tasks = [t for t in tasks if not t["done"]]
    removed = before - len(tasks)
    save_tasks(tasks)
    print(f"Cleared {removed} completed task(s). {len(tasks)} remaining.")


def show_help():
    print("Usage: python todo.py <command> [args]")
    print("")
    print("Commands:")
    print("  add <description>    Add a new task")
    print("  list                 Show all tasks")
    print("  done <id>            Mark a task as completed")
    print("  delete <id>          Delete a task")
    print("  clear                Remove all completed tasks")
    print("  help                 Show this help message")


def main():
    if len(sys.argv) < 2:
        show_help()
        sys.exit(0)

    command = sys.argv[1].lower()
    args = sys.argv[2:]

    commands = {
        "add": cmd_add,
        "list": cmd_list,
        "done": cmd_done,
        "delete": cmd_delete,
        "clear": cmd_clear,
        "help": lambda _: show_help(),
    }

    if command in commands:
        commands[command](args)
    else:
        print(f"Unknown command: {command}")
        show_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
