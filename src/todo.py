#!/usr/bin/env python3
"""CLI Todo Application with JSON persistence.

A simple command-line todo manager supporting add, list, complete,
and delete operations. Data is stored in data/todos.json.
"""

import argparse
import json
import os
import sys


DEFAULT_DATA_FILE = os.path.join("data", "todos.json")


class TodoStore:
    """Handles loading, saving, and manipulating todo items."""

    def __init__(self, data_file=None):
        """Initialize the store with an optional data file path."""
        self.data_file = data_file or DEFAULT_DATA_FILE
        self.todos = []
        self._next_id = 1
        self._load()

    def _ensure_data_dir(self):
        """Create the data directory if it does not exist."""
        dir_name = os.path.dirname(self.data_file)
        if dir_name and not os.path.exists(dir_name):
            os.makedirs(dir_name)

    def _load(self):
        """Load todos from the JSON data file."""
        if not os.path.exists(self.data_file):
            self.todos = []
            self._next_id = 1
            return

        try:
            with open(self.data_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, ValueError, IOError):
            self.todos = []
            self._next_id = 1
            return

        if not isinstance(data, list):
            self.todos = []
            self._next_id = 1
            return

        self.todos = [item for item in data if isinstance(item, dict)]
        if self.todos:
            self._next_id = max(todo.get("id", 0) for todo in self.todos) + 1
        else:
            self._next_id = 1

    def _save(self):
        """Save todos to the JSON data file."""
        self._ensure_data_dir()
        with open(self.data_file, "w", encoding="utf-8") as f:
            json.dump(self.todos, f, indent=2)

    def add(self, title, due_date=None):
        """Add a new todo item.

        Args:
            title: The todo title.
            due_date: Optional due date string.

        Returns:
            The newly created todo dict.
        """
        todo = {
            "id": self._next_id,
            "title": title,
            "due_date": due_date,
            "status": "pending"
        }
        self.todos.append(todo)
        self._next_id += 1
        self._save()
        return todo

    def list(self):
        """Return all todo items."""
        return self.todos

    def complete(self, todo_id):
        """Mark a todo as completed by ID.

        Args:
            todo_id: The integer ID of the todo.

        Returns:
            The updated todo dict, or None if not found.
        """
        for todo in self.todos:
            if todo.get("id") == todo_id:
                todo["status"] = "completed"
                self._save()
                return todo
        return None

    def delete(self, todo_id):
        """Delete a todo by ID.

        Args:
            todo_id: The integer ID of the todo.

        Returns:
            The removed todo dict, or None if not found.
        """
        for index, todo in enumerate(self.todos):
            if todo.get("id") == todo_id:
                removed = self.todos.pop(index)
                self._save()
                return removed
        return None


def run_command(args, store):
    """Execute the requested command against the store.

    Args:
        args: Parsed argparse.Namespace.
        store: A TodoStore instance.
    """
    if args.command == "add":
        todo = store.add(args.title, args.due_date)
        print(f"Added todo #{todo['id']}: {todo['title']}")

    elif args.command == "list":
        todos = store.list()
        if not todos:
            print("No todos found.")
            return

        print(f"{'ID':<5} {'Title':<30} {'Due Date':<15} {'Status':<10}")
        print("-" * 60)
        for todo in todos:
            due = todo.get("due_date") or "-"
            print(f"{todo['id']:<5} {todo['title']:<30} "
                  f"{due:<15} {todo['status']:<10}")

    elif args.command == "complete":
        todo = store.complete(args.id)
        if todo:
            print(f"Completed todo #{todo['id']}: {todo['title']}")
        else:
            print(f"Error: Todo with ID {args.id} not found.",
                  file=sys.stderr)
            sys.exit(1)

    elif args.command == "delete":
        todo = store.delete(args.id)
        if todo:
            print(f"Deleted todo #{todo['id']}: {todo['title']}")
        else:
            print(f"Error: Todo with ID {args.id} not found.",
                  file=sys.stderr)
            sys.exit(1)


def main(argv=None):
    """Parse arguments and run the appropriate command.

    Args:
        argv: Optional list of argument strings.
    """
    parser = argparse.ArgumentParser(
        description="CLI Todo Application"
    )
    subparsers = parser.add_subparsers(dest="command")

    add_parser = subparsers.add_parser("add", help="Add a new todo")
    add_parser.add_argument("title", help="Todo title")
    add_parser.add_argument("--due-date", help="Optional due date")

    subparsers.add_parser("list", help="List all todos")

    complete_parser = subparsers.add_parser(
        "complete", help="Mark a todo as completed"
    )
    complete_parser.add_argument("id", type=int, help="Todo ID")

    delete_parser = subparsers.add_parser("delete", help="Delete a todo")
    delete_parser.add_argument("id", type=int, help="Todo ID")

    args = parser.parse_args(argv)

    if not args.command:
        parser.print_help()
        sys.exit(1)

    store = TodoStore()
    run_command(args, store)


if __name__ == "__main__":
    main()
