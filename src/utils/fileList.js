import fs from 'node:fs/promises';
import path from 'node:path';

const SKIP_DIRS = ['node_modules', '.git', '.cache', 'dist', 'build', '.next'];
const MAX_FILES = 100;

async function walkDir(dir, results, maxResults, prefix = '') {
  if (results.length >= maxResults) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (results.length >= maxResults) return;
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.includes(entry.name)) {
        results.push(relPath + '/');
        await walkDir(path.join(dir, entry.name), results, maxResults, relPath);
      }
    } else if (entry.isFile()) {
      results.push(relPath);
    }
  }
}

export async function listFiles() {
  const cwd = process.cwd();
  const results = [];
  await walkDir(cwd, results, MAX_FILES);
  return results;
}
