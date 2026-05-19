import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'os';

const ENV_PATH = path.join(os.homedir(), '.vibe-code', '.env');

export async function loadEnv() {
  try {
    const content = await fs.readFile(ENV_PATH, 'utf-8');
    const vars = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      vars[key] = val;
    }
    return vars;
  } catch {
    return {};
  }
}

export async function saveEnv(key, value) {
  await fs.mkdir(path.dirname(ENV_PATH), { recursive: true });
  let lines = [];
  try {
    const content = await fs.readFile(ENV_PATH, 'utf-8');
    lines = content.split('\n');
  } catch {}

  let found = false;
  lines = lines.map(line => {
    if (line.trim().startsWith(key + '=')) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    lines.push(`${key}=${value}`);
  }

  await fs.writeFile(ENV_PATH, lines.join('\n'), 'utf-8');
}

export async function getEnv() {
  return await loadEnv();
}
