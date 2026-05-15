import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'os';

const SESSIONS_DIR = path.join(os.homedir(), '.vibe-terminal', 'sessions');

async function ensureDir() {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

function sessionFilename(id) {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

export async function saveSession(id, messages, model, title) {
  await ensureDir();
  // Preserve existing title and favorite status
  const existing = await loadSession(id);
  const finalTitle = title || existing?.title || null;
  const favorite = existing?.favorite || false;
  const data = {
    id,
    model,
    title: finalTitle,
    favorite,
    messages: messages.filter(m => m.role !== 'tool_call'),
    savedAt: new Date().toISOString(),
    messageCount: messages.length,
    preview: getPreview(messages),
  };
  await fs.writeFile(sessionFilename(id), JSON.stringify(data, null, 2), 'utf-8');
}

export async function setSessionFavorite(id, fav) {
  const session = await loadSession(id);
  if (!session) return false;
  session.favorite = fav;
  await fs.writeFile(sessionFilename(id), JSON.stringify(session, null, 2), 'utf-8');
  return true;
}

export async function loadSession(id) {
  try {
    const raw = await fs.readFile(sessionFilename(id), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function listSessions() {
  await ensureDir();
  const files = await fs.readdir(SESSIONS_DIR);
  const sessions = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(SESSIONS_DIR, file), 'utf-8');
      const data = JSON.parse(raw);
      sessions.push({
        id: data.id,
        model: data.model,
        savedAt: data.savedAt,
        messageCount: data.messageCount,
        preview: data.preview,
      });
    } catch {}
  }
  // Sort by most recent first
  sessions.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  return sessions;
}

export async function deleteSession(id) {
  try {
    await fs.unlink(sessionFilename(id));
    return true;
  } catch {
    return false;
  }
}

function getPreview(messages) {
  const userMsgs = messages.filter(m => m.role === 'user');
  if (userMsgs.length === 0) return '(empty)';
  const first = userMsgs[0].content || '';
  return first.length > 60 ? first.slice(0, 60) + '...' : first;
}

export function generateSessionId() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
