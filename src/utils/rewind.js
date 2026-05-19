import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'os';

const REWIND_DIR = path.join(os.homedir(), '.vibe-code', 'rewind');

async function ensureDir() {
  await fs.mkdir(REWIND_DIR, { recursive: true });
}

function checkpointPath(sessionId, index) {
  return path.join(REWIND_DIR, `${sessionId}_${String(index).padStart(5, '0')}.json`);
}

function indexPath(sessionId) {
  return path.join(REWIND_DIR, `${sessionId}_index.json`);
}

// Load the checkpoint index for a session
export async function loadIndex(sessionId) {
  try {
    const raw = await fs.readFile(indexPath(sessionId), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { sessionId, checkpoints: [], current: 0 };
  }
}

// Save the checkpoint index
async function saveIndex(index) {
  await fs.mkdir(REWIND_DIR, { recursive: true });
  await fs.writeFile(indexPath(index.sessionId), JSON.stringify(index, null, 2), 'utf-8');
}

// Create a new checkpoint from current messages
export async function createCheckpoint(sessionId, messages, label) {
  const index = await loadIndex(sessionId);
  const cpIndex = index.checkpoints.length;
  const checkpoint = {
    index: cpIndex,
    sessionId,
    messages: messages.filter(m => m.role !== 'tool_call'),
    label: label || `checkpoint_${cpIndex}`,
    createdAt: new Date().toISOString(),
    messageCount: messages.length,
  };

  await fs.mkdir(REWIND_DIR, { recursive: true });
  await fs.writeFile(checkpointPath(sessionId, cpIndex), JSON.stringify(checkpoint), 'utf-8');

  index.checkpoints.push({
    index: cpIndex,
    label: checkpoint.label,
    createdAt: checkpoint.createdAt,
    messageCount: checkpoint.messageCount,
    preview: getPreview(messages),
  });
  index.current = cpIndex;

  await saveIndex(index);
  return checkpoint;
}

// Get a specific checkpoint
export async function getCheckpoint(sessionId, cpIndex) {
  try {
    const raw = await fs.readFile(checkpointPath(sessionId, cpIndex), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Rewind to a specific checkpoint (delete all after it)
export async function rewindTo(sessionId, cpIndex) {
  const index = await loadIndex(sessionId);
  const checkpoint = await getCheckpoint(sessionId, cpIndex);
  if (!checkpoint) return null;

  // Remove checkpoints after the target
  for (let i = cpIndex + 1; i < index.checkpoints.length; i++) {
    try {
      await fs.unlink(checkpointPath(sessionId, i));
    } catch {}
  }

  index.checkpoints = index.checkpoints.slice(0, cpIndex + 1);
  index.current = cpIndex;
  await saveIndex(index);

  return checkpoint;
}

// List all checkpoints for a session
export async function listCheckpoints(sessionId) {
  const index = await loadIndex(sessionId);
  return index.checkpoints;
}

// Fork from current checkpoint (create a new branch)
export async function forkCheckpoint(sessionId, cpIndex, label) {
  const checkpoint = await getCheckpoint(sessionId, cpIndex);
  if (!checkpoint) return null;

  // Create a new session from the checkpoint
  const forkId = `${sessionId}_fork_${Date.now()}`;
  const forkCheckpoint = {
    index: 0,
    sessionId: forkId,
    messages: checkpoint.messages,
    label: label || `fork_from_${cpIndex}`,
    createdAt: new Date().toISOString(),
    messageCount: checkpoint.messages.length,
  };

  await fs.mkdir(REWIND_DIR, { recursive: true });
  await fs.writeFile(checkpointPath(forkId, 0), JSON.stringify(forkCheckpoint), 'utf-8');

  const forkIndex = {
    sessionId: forkId,
    checkpoints: [{
      index: 0,
      label: forkCheckpoint.label,
      createdAt: forkCheckpoint.createdAt,
      messageCount: forkCheckpoint.messageCount,
      preview: getPreview(checkpoint.messages),
    }],
    current: 0,
  };
  await saveIndex(forkIndex);

  return { forkId, checkpoint: forkCheckpoint };
}

function getPreview(messages) {
  const userMsgs = messages.filter(m => m.role === 'user');
  if (userMsgs.length === 0) return '(empty)';
  const first = userMsgs[0].content || '';
  return first.length > 60 ? first.slice(0, 60) + '...' : first;
}
