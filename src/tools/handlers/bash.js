import { exec } from 'node:child_process';
import { EXEC_TIMEOUT_MS, EXEC_MAX_BUFFER } from '../constants.js';

export async function handleRunBash(args) {
  const { command } = args;
  if (!command || typeof command !== 'string') {
    return { type: 'error', message: 'No command provided.' };
  }

  return new Promise((resolve) => {
    exec(
      command,
      {
        timeout: EXEC_TIMEOUT_MS,
        maxBuffer: EXEC_MAX_BUFFER,
        cwd: process.cwd(),
        shell: '/bin/sh',
      },
      (error, stdout, stderr) => {
        resolve({
          type: 'bash_result',
          command,
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error ? (error.code ?? 1) : 0,
          timedOut: error?.killed || false,
        });
      }
    );
  });
}
