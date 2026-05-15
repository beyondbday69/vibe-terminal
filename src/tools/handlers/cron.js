import { exec } from 'node:child_process';
import { cronJobs, nextCronId } from '../state.js';
import { CRON_MAX_ENTRIES, EXEC_TIMEOUT_MS } from '../constants.js';

export async function handleCronCreate(args) {
  const { command, interval_ms, label } = args;
  if (!command) return 'Error: No command provided.';
  if (!interval_ms || typeof interval_ms !== 'number') return 'Error: No interval_ms provided.';

  const effectiveInterval = Math.max(interval_ms, 60_000);

  if (cronJobs.size >= CRON_MAX_ENTRIES) {
    return `Error: Maximum cron jobs (${CRON_MAX_ENTRIES}) reached.`;
  }

  const id = nextCronId();
  const job = {
    id,
    label: label || command,
    command,
    intervalMs: effectiveInterval,
    timerRef: null,
    lastRun: null,
    runCount: 0,
  };

  job.timerRef = setInterval(() => {
    job.lastRun = Date.now();
    job.runCount++;
    exec(command, { timeout: EXEC_TIMEOUT_MS, cwd: process.cwd() }, () => {});
  }, effectiveInterval);

  cronJobs.set(id, job);
  return `Cron job ${id} created: runs every ${Math.round(effectiveInterval / 1000)}s`;
}

export async function handleCronDelete(args) {
  const { cron_id } = args;
  if (!cron_id) return 'Error: No cron_id provided.';

  const job = cronJobs.get(cron_id);
  if (!job) return `Error: Cron job not found: ${cron_id}`;

  clearInterval(job.timerRef);
  cronJobs.delete(cron_id);
  return `Cron job ${cron_id} deleted.`;
}

export async function handleCronList() {
  if (cronJobs.size === 0) return 'No cron jobs.';

  const lines = ['ID         Interval   Runs  Last Run          Label'];
  for (const [, job] of cronJobs) {
    const interval = `${Math.round(job.intervalMs / 1000)}s`;
    const lastRun = job.lastRun ? new Date(job.lastRun).toLocaleTimeString() : 'never';
    lines.push(
      `${job.id.padEnd(11)}${interval.padEnd(11)}${String(job.runCount).padEnd(6)}${lastRun.padEnd(18)}${job.label}`
    );
  }
  return lines.join('\n');
}
