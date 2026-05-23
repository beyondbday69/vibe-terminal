(function () {
  'use strict';

  // DOM Elements
  const todoForm = document.getElementById('todo-form');
  const todoInput = document.getElementById('todo-input');
  const todoList = document.getElementById('todo-list');
  const itemsLeftLabel = document.getElementById('items-left');
  const filterButtons = document.querySelectorAll('.filter-btn');
  const clearCompletedBtn = document.getElementById('clear-completed');
  const footer = document.getElementById('footer');

  // State
  const STORAGE_KEY = 'todo-app-state';
  let todos = [];
  let currentFilter = 'all';

  // Initialize
  function init() {
    loadTodos();
    render();
    bindEvents();
  }

  // Persistence
  function saveTodos() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch (e) {
      // Ignore storage errors (e.g., private mode)
    }
  }

  function loadTodos() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          todos = parsed;
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Utils
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function getActiveCount() {
    return todos.filter(t => !t.completed).length;
  }

  function getFilteredTodos() {
    if (currentFilter === 'active') return todos.filter(t => !t.completed);
    if (currentFilter === 'completed') return todos.filter(t => t.completed);
    return todos;
  }

  function getCompletedCount() {
    return todos.filter(t => t.completed).length;
  }

  // Rendering
  function render() {
    const filtered = getFilteredTodos();
    const activeCount = getActiveCount();
    const completedCount = getCompletedCount();

    // Update items left text
    const noun = activeCount === 1 ? 'item' : 'items';
    itemsLeftLabel.textContent = `${activeCount} ${noun} left`;

    // Toggle footer visibility
    if (todos.length === 0) {
      footer.style.display = 'none';
    } else {
      footer.style.display = '';
    }

    // Enable/disable clear completed
    clearCompletedBtn.disabled = completedCount === 0;

    // Update filter buttons
    filterButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === currentFilter);
    });

    // Build list
    todoList.innerHTML = '';

    if (filtered.length === 0 && todos.length > 0) {
      const emptyMsg = document.createElement('li');
      emptyMsg.className = 'empty-state';
      emptyMsg.textContent = currentFilter === 'completed'
        ? 'No completed todos.'
        : 'No active todos.';
      todoList.appendChild(emptyMsg);
    } else if (todos.length === 0) {
      const emptyMsg = document.createElement('li');
      emptyMsg.className = 'empty-state';
      emptyMsg.textContent = 'No todos yet. Add one above!';
      todoList.appendChild(emptyMsg);
    } else {
      filtered.forEach(todo => {
        todoList.appendChild(createTodoElement(todo));
      });
    }
  }

  function createTodoElement(todo) {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.completed ? ' completed' : '');
    li.dataset.id = todo.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.completed;
    checkbox.setAttribute('aria-label', 'Mark as complete');
    checkbox.addEventListener('change', () => toggleTodo(todo.id));

    const span = document.createElement('span');
    span.className = 'todo-text';
    span.textContent = todo.text;
    span.addEventListener('dblclick', () => startEdit(li, todo));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.setAttribute('aria-label', 'Delete todo');
    deleteBtn.addEventListener('click', () => deleteTodo(todo.id));

    li.appendChild(checkbox);
    li.appendChild(span);
    li.appendChild(deleteBtn);

    return li;
  }

  // Inline Editing
  function startEdit(li, todo) {
    if (li.querySelector('.todo-edit-input')) return;

    const span = li.querySelector('.todo-text');
    const originalText = todo.text;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'todo-edit-input';
    input.value = originalText;

    li.replaceChild(input, span);
    input.focus();

    function finish(save) {
      const newText = input.value.trim();
      if (save && newText && newText !== originalText) {
        todo.text = newText;
        saveTodos();
        render();
      } else {
        // Restore span without re-rendering whole list (keeps focus context if needed)
        if (input.parentNode) {
          li.replaceChild(span, input);
        }
      }
    }

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // Manually restore because blur handler would save
        input.removeEventListener('blur', finish);
        const freshSpan = document.createElement('span');
        freshSpan.className = 'todo-text';
        freshSpan.textContent = originalText;
        freshSpan.addEventListener('dblclick', () => startEdit(li, todo));
        if (input.parentNode) {
          li.replaceChild(freshSpan, input);
        }
      }
    });
  }

  // Actions
  function addTodo(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const todo = {
      id: generateId(),
      text: trimmed,
      completed: false,
    };

    todos.push(todo);
    saveTodos();
    render();
  }

  function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
      todo.completed = !todo.completed;
      saveTodos();
      render();
    }
  }

  function deleteTodo(id) {
    todos = todos.filter(t => t.id !== id);
    saveTodos();
    render();
  }

  function clearCompleted() {
    todos = todos.filter(t => !t.completed);
    saveTodos();
    render();
  }

  function setFilter(filter) {
    currentFilter = filter;
    render();
  }

  // Events
  function bindEvents() {
    todoForm.addEventListener('submit', (e) => {
      e.preventDefault();
      addTodo(todoInput.value);
      todoInput.value = '';
      todoInput.focus();
    });

    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        setFilter(btn.dataset.filter);
      });
    });

    clearCompletedBtn.addEventListener('click', clearCompleted);
  }

  // Start
  init();
})();
