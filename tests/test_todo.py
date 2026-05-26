#!/usr/bin/env python3
"""Unit and integration tests for the CLI Todo application."""

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODO_PY = os.path.join(REPO_ROOT, "src", "todo.py")

# Load the todo module directly from src/todo.py to avoid import path
# conflicts with any other todo.py files.
spec = importlib.util.spec_from_file_location("todo", TODO_PY)
todo_module = importlib.util.module_from_spec(spec)
sys.modules["todo"] = todo_module
spec.loader.exec_module(todo_module)


class TestTodoStore(unittest.TestCase):
    """Tests for the TodoStore class."""

    def setUp(self):
        """Create a temporary directory and data file for each test."""
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_file = os.path.join(self.temp_dir.name, "todos.json")
        self.store = todo_module.TodoStore(self.data_file)

    def tearDown(self):
        """Clean up temporary directory."""
        self.temp_dir.cleanup()

    def test_add_without_due_date(self):
        """Test adding a todo without a due date."""
        todo = self.store.add("Buy milk")
        self.assertEqual(todo["id"], 1)
        self.assertEqual(todo["title"], "Buy milk")
        self.assertEqual(todo["status"], "pending")
        self.assertIsNone(todo["due_date"])

    def test_add_with_due_date(self):
        """Test adding a todo with a due date."""
        todo = self.store.add("Buy eggs", "2024-12-25")
        self.assertEqual(todo["due_date"], "2024-12-25")

    def test_list_todos(self):
        """Test listing all todos."""
        self.store.add("Task 1")
        self.store.add("Task 2")
        todos = self.store.list()
        self.assertEqual(len(todos), 2)
        self.assertEqual(todos[0]["title"], "Task 1")
        self.assertEqual(todos[1]["title"], "Task 2")

    def test_complete_todo(self):
        """Test marking a todo as completed."""
        self.store.add("Task to complete")
        todo = self.store.complete(1)
        self.assertIsNotNone(todo)
        self.assertEqual(todo["status"], "completed")

    def test_complete_invalid_id(self):
        """Test completing a non-existent todo returns None."""
        result = self.store.complete(999)
        self.assertIsNone(result)

    def test_delete_todo(self):
        """Test deleting a todo by ID."""
        self.store.add("Task to delete")
        todo = self.store.delete(1)
        self.assertIsNotNone(todo)
        self.assertEqual(len(self.store.list()), 0)

    def test_delete_invalid_id(self):
        """Test deleting a non-existent todo returns None."""
        result = self.store.delete(999)
        self.assertIsNone(result)

    def test_persistence(self):
        """Test data persists between store instances."""
        self.store.add("Persistent task")
        new_store = todo_module.TodoStore(self.data_file)
        todos = new_store.list()
        self.assertEqual(len(todos), 1)
        self.assertEqual(todos[0]["title"], "Persistent task")

    def test_auto_increment_id(self):
        """Test IDs auto-increment correctly."""
        self.store.add("Task 1")
        self.store.add("Task 2")
        todos = self.store.list()
        self.assertEqual(todos[0]["id"], 1)
        self.assertEqual(todos[1]["id"], 2)

    def test_id_continues_after_delete(self):
        """Test that IDs continue incrementing after deletion."""
        self.store.add("Task 1")
        self.store.add("Task 2")
        self.store.delete(1)
        todo = self.store.add("Task 3")
        self.assertEqual(todo["id"], 3)

    def test_corrupt_json_handled(self):
        """Test that a corrupt JSON file is handled gracefully."""
        with open(self.data_file, "w", encoding="utf-8") as f:
            f.write("not valid json")
        store = todo_module.TodoStore(self.data_file)
        self.assertEqual(store.list(), [])

    def test_non_list_json_handled(self):
        """Test that a JSON file containing a non-list is handled."""
        with open(self.data_file, "w", encoding="utf-8") as f:
            json.dump({"foo": "bar"}, f)
        store = todo_module.TodoStore(self.data_file)
        self.assertEqual(store.list(), [])

    def test_empty_file_handled(self):
        """Test that an empty file is handled gracefully."""
        open(self.data_file, "w", encoding="utf-8").close()
        store = todo_module.TodoStore(self.data_file)
        self.assertEqual(store.list(), [])

    def test_data_directory_created(self):
        """Test that the data directory is created automatically."""
        nested = os.path.join(self.temp_dir.name, "nested", "dir",
                              "todos.json")
        store = todo_module.TodoStore(nested)
        store.add("Task")
        self.assertTrue(os.path.exists(nested))


class TestTodoCLI(unittest.TestCase):
    """Integration tests for the CLI interface."""

    def setUp(self):
        """Create a temporary working directory."""
        self.temp_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        """Clean up temporary working directory."""
        self.temp_dir.cleanup()

    def _run(self, args):
        """Run the CLI in the temporary directory."""
        result = subprocess.run(
            [sys.executable, TODO_PY] + args,
            cwd=self.temp_dir.name,
            capture_output=True,
            text=True,
        )
        return result

    def test_add(self):
        """Test CLI add command."""
        result = self._run(["add", "Buy milk"])
        self.assertEqual(result.returncode, 0)
        self.assertIn("Added todo #1", result.stdout)

    def test_add_with_due_date(self):
        """Test CLI add command with due date."""
        result = self._run(["add", "Buy eggs", "--due-date", "2024-12-25"])
        self.assertEqual(result.returncode, 0)
        self.assertIn("Added todo #1", result.stdout)

    def test_list_empty(self):
        """Test CLI list command with no todos."""
        result = self._run(["list"])
        self.assertEqual(result.returncode, 0)
        self.assertIn("No todos found.", result.stdout)

    def test_list_with_items(self):
        """Test CLI list command shows todos."""
        self._run(["add", "Task 1"])
        self._run(["add", "Task 2", "--due-date", "2024-01-01"])
        result = self._run(["list"])
        self.assertEqual(result.returncode, 0)
        self.assertIn("Task 1", result.stdout)
        self.assertIn("Task 2", result.stdout)
        self.assertIn("2024-01-01", result.stdout)
        self.assertIn("pending", result.stdout)

    def test_complete(self):
        """Test CLI complete command."""
        self._run(["add", "Task"])
        result = self._run(["complete", "1"])
        self.assertEqual(result.returncode, 0)
        self.assertIn("Completed todo #1", result.stdout)

    def test_complete_invalid_id(self):
        """Test CLI complete with non-existent ID."""
        result = self._run(["complete", "999"])
        self.assertEqual(result.returncode, 1)
        self.assertIn("not found", result.stderr)

    def test_delete(self):
        """Test CLI delete command."""
        self._run(["add", "Task"])
        result = self._run(["delete", "1"])
        self.assertEqual(result.returncode, 0)
        self.assertIn("Deleted todo #1", result.stdout)

    def test_delete_invalid_id(self):
        """Test CLI delete with non-existent ID."""
        result = self._run(["delete", "999"])
        self.assertEqual(result.returncode, 1)
        self.assertIn("not found", result.stderr)

    def test_no_command(self):
        """Test running without a command prints help."""
        result = self._run([])
        self.assertEqual(result.returncode, 1)
        output = result.stdout.lower() + result.stderr.lower()
        self.assertIn("usage:", output)


if __name__ == "__main__":
    unittest.main()
