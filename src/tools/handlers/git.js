import { exec } from 'node:child_process';
import { loadEnv } from '../../utils/env.js';

function execPromise(cmd, options = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, options, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim() || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export async function handleGitCommitAndPush(args) {
  const { commit_message } = args;
  if (!commit_message) {
    return { type: 'error', message: 'No commit_message provided.' };
  }

  const cwd = process.cwd();
  try {
    // 1. Check if git repository is initialized
    try {
      await execPromise('git rev-parse --is-inside-work-tree', { cwd });
    } catch {
      return { type: 'error', message: `Directory ${cwd} is not a git repository.` };
    }

    // 2. Checkout agy branch
    try {
      await execPromise('git checkout agy', { cwd });
    } catch {
      await execPromise('git checkout -b agy', { cwd });
    }

    // 3. Stage changes
    await execPromise('git add .', { cwd });

    // 4. Check if there are changes to commit
    const status = await execPromise('git status --porcelain', { cwd });
    if (status) {
      // Commit changes
      await execPromise(`git commit -m "${commit_message.replace(/"/g, '\\"')}"`, { cwd });
    }

    // 5. Retrieve token and push
    const env = await loadEnv();
    const token = env.GITHUB_TOKEN || process.env.GITHUB_TOKEN;

    const rawUrl = await execPromise('git remote get-url origin', { cwd });
    let pushUrl = rawUrl;

    if (token && rawUrl.startsWith('https://')) {
      const rest = rawUrl.slice(8);
      const atIdx = rest.indexOf('@');
      if (atIdx !== -1) {
        pushUrl = `https://${token}@${rest.slice(atIdx + 1)}`;
      } else {
        pushUrl = `https://${token}@${rest}`;
      }
    }

    // Push changes
    try {
      await execPromise(`git push -u "${pushUrl}" agy`, { cwd });
    } catch (pushErr) {
      let errMsg = pushErr.message;
      if (token) {
        errMsg = errMsg.replaceAll(token, '****');
      }
      throw new Error(`Failed to push to GitHub: ${errMsg}`);
    }

    return {
      type: 'git_push_result',
      success: true,
      message: `Successfully committed and pushed to branch 'agy'.`
    };
  } catch (err) {
    return { type: 'error', message: err.message };
  }
}
