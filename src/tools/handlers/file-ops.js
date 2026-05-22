import fs from 'node:fs/promises';
import path from 'node:path';
import { FILE_READ_MAX_BYTES } from '../constants.js';

function resolvePath(filePath) {
  const root = process.cwd();
  const p = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
  if (!p.startsWith(root)) {
    throw new Error(`Path ${p} escapes the current working directory`);
  }
  return p;
}

export async function handleReadFile(args) {
  const { file_path } = args;
  if (!file_path) return { type: 'error', message: 'No file_path provided.' };

  let resolved;
  try { resolved = resolvePath(file_path); } catch (e) { return { type: 'error', message: e.message }; }
  try {
    const content = await fs.readFile(resolved, 'utf-8');
    const truncated = content.length > FILE_READ_MAX_BYTES;
    const finalContent = truncated ? content.slice(0, FILE_READ_MAX_BYTES) : content;
    return {
      type: 'file_read',
      path: resolved,
      content: finalContent,
      lineCount: finalContent.split('\n').length,
      truncated,
    };
  } catch (err) {
    if (err.code === 'ENOENT') return { type: 'error', message: `File not found: ${resolved}` };
    if (err.code === 'EACCES') return { type: 'error', message: `Permission denied: ${resolved}` };
    return { type: 'error', message: err.message };
  }
}

export async function handleWriteFile(args) {
  const { file_path, content } = args;
  if (!file_path) return { type: 'error', message: 'No file_path provided.' };
  if (content === undefined) return { type: 'error', message: 'No content provided.' };

  let resolved;
  try { resolved = resolvePath(file_path); } catch (e) { return { type: 'error', message: e.message }; }
  try {
    // Check if file exists before writing
    let oldContent = null;
    try {
      oldContent = await fs.readFile(resolved, 'utf-8');
    } catch {
      // File doesn't exist, which is fine for new files
    }

    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
    return {
      type: 'file_created',
      path: resolved,
      content,
      oldContent,
      bytes: Buffer.byteLength(content),
      lineCount: content.split('\n').length,
      isNew: oldContent === null,
    };
  } catch (err) {
    return { type: 'error', message: `Error writing file: ${err.message}` };
  }
}

export async function handleEditFile(args) {
  const { file_path, diff } = args;
  if (!file_path) return { type: 'error', message: 'No file_path provided.' };
  if (!diff) return { type: 'error', message: 'No diff provided.' };

  let resolved;
  try { resolved = resolvePath(file_path); } catch (e) { return { type: 'error', message: e.message }; }

  let content;
  try {
    content = await fs.readFile(resolved, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return { type: 'error', message: `File not found: ${resolved}` };
    return { type: 'error', message: err.message };
  }

  const blocks = [];
  const regex = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;
  let match;
  while ((match = regex.exec(diff)) !== null) {
    blocks.push({ search: match[1], replace: match[2] });
  }

  if (blocks.length === 0) {
    return { type: 'error', message: 'No valid SEARCH/REPLACE blocks found in diff.' };
  }

  const detailedBlocks = [];
  let totalAdded = 0;
  let totalRemoved = 0;
  let modified = content;

  for (let i = 0; i < blocks.length; i++) {
    const { search, replace } = blocks[i];
    if (!search) return { type: 'error', message: `Block ${i + 1} has empty SEARCH text.` };
    const idx = modified.indexOf(search);
    if (idx === -1) {
      return { type: 'error', message: `Block ${i + 1}: SEARCH text not found in file.` };
    }
    const searchLines = search.split('\n');
    const replaceLines = replace.split('\n');
    const removed = searchLines.length;
    const added = replaceLines.length;
    totalRemoved += removed;
    totalAdded += added;

    const lineNum = modified.slice(0, idx).split('\n').length;
    detailedBlocks.push({ search, replace, searchLines, replaceLines, lineNum, added, removed });

    modified = modified.slice(0, idx) + replace + modified.slice(idx + search.length);
  }

  try {
    await fs.writeFile(resolved, modified, 'utf-8');
    return {
      type: 'file_edited',
      path: resolved,
      blocks: detailedBlocks,
      totalAdded,
      totalRemoved,
      blockCount: blocks.length,
      oldContent: content,
      newContent: modified,
    };
  } catch (err) {
    return { type: 'error', message: `Error writing file: ${err.message}` };
  }
}
