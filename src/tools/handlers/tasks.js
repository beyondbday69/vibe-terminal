import { spawn } from 'node:child_process';
import { tasks, nextTaskId } from '../state.js';
import { TASK_MAX_CONCURRENT, TASK_OUTPUT_MAX_LINES } from '../constants.js';

export async function handleTaskCreate(args) {
  const { command, label } = args;
  if (!command) return { type: 'error', message: 'Error: No command provided.' };

  if (tasks.size >= TASK_MAX_CONCURRENT) {
    return { type: 'error', message: `Error: Maximum concurrent tasks (${TASK_MAX_CONCURRENT}) reached. Stop some tasks first.` };
  }

  const id = nextTaskId();
  const proc = spawn('sh', ['-c', command], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const task = {
    id,
    label: label || command,
    command,
    proc,
    status: 'running',
    outputChunks: [],
    exitCode: null,
    createdAt: Date.now(),
  };

  const appendOutput = (data) => {
    const lines = data.toString().split('\n');
    task.outputChunks.push(...lines);
    if (task.outputChunks.length > TASK_OUTPUT_MAX_LINES) {
      task.outputChunks = task.outputChunks.slice(-TASK_OUTPUT_MAX_LINES);
    }
  };

  proc.stdout.on('data', appendOutput);
  proc.stderr.on('data', appendOutput);

  proc.on('close', (code) => {
    task.status = code === 0 ? 'completed' : 'failed';
    task.exitCode = code;
  });

  proc.on('error', (err) => {
    task.status = 'failed';
    task.outputChunks.push(`[Process error: ${err.message}]`);
  });

  tasks.set(id, task);
  return { type: 'generic', message: `Task ${id} started: ${command}` };
}

export async function handleTaskGet(args) {
  const { task_id } = args;
  if (!task_id) return { type: 'error', message: 'Error: No task_id provided.' };

  const task = tasks.get(task_id);
  if (!task) return { type: 'error', message: `Error: Task not found: ${task_id}` };

  const age = Math.round((Date.now() - task.createdAt) / 1000);
  return { type: 'generic', message: [
    `ID:       ${task.id}`,
    `Label:    ${task.label}`,
    `Status:   ${task.status}`,
    `Exit code: ${task.exitCode ?? '(still running)'}`,
    `Age:      ${age}s`,
    `Output:   ${task.outputChunks.length} lines`,
  ].join('\n') };
}

export async function handleTaskList() {
  if (tasks.size === 0) return { type: 'generic', message: 'No background tasks.' };

  const lines = ['ID         Status      Age    Label'];
  for (const [, task] of tasks) {
    const age = Math.round((Date.now() - task.createdAt) / 1000);
    lines.push(
      `${task.id.padEnd(11)}${task.status.padEnd(12)}${String(age + 's').padEnd(7)}${task.label}`
    );
  }
  return { type: 'generic', message: lines.join('\n') };
}

export async function handleTaskUpdate(args) {
  const { task_id, label } = args;
  if (!task_id) return { type: 'error', message: 'Error: No task_id provided.' };

  const task = tasks.get(task_id);
  if (!task) return { type: 'error', message: `Error: Task not found: ${task_id}` };

  if (label) task.label = label;
  return { type: 'generic', message: `Task ${task_id} updated.` };
}

export async function handleTaskOutput(args) {
  const { task_id } = args;
  if (!task_id) return { type: 'error', message: 'Error: No task_id provided.' };

  const task = tasks.get(task_id);
  if (!task) return { type: 'error', message: `Error: Task not found: ${task_id}` };

  const last100 = task.outputChunks.slice(-100);
  if (last100.length === 0) return { type: 'generic', message: `Task ${task_id}: no output yet.` };
  return { type: 'generic', message: last100.join('\n') };
}

export async function handleTaskStop(args) {
  const { task_id } = args;
  if (!task_id) return { type: 'error', message: 'Error: No task_id provided.' };

  const task = tasks.get(task_id);
  if (!task) return { type: 'error', message: `Error: Task not found: ${task_id}` };

  if (task.status !== 'running') {
    return { type: 'error', message: `Task ${task_id} is already ${task.status}.` };
  }

  let exited = false;
  task.proc.on('close', () => { exited = true; });
  task.proc.kill('SIGTERM');
  task.status = 'stopped';

  // Force kill after 5s if still alive
  setTimeout(() => {
    if (!exited) {
      try { task.proc.kill('SIGKILL'); } catch {}
    }
  }, 5000);

  return { type: 'generic', message: `Task ${task_id} stopped.` };
}
