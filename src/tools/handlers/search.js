import fs from 'node:fs/promises';
import path from 'node:path';
import { GREP_MAX_RESULTS, GLOB_MAX_RESULTS, SKIP_DIRS } from '../constants.js';

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac',
  '.zip', '.tar', '.gz', '.bz2', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib', '.wasm',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.sqlite', '.db',
]);

function shouldSkipDir(name) {
  return SKIP_DIRS.includes(name) || name.startsWith('.');
}

async function walkDir(dir, results, maxResults) {
  if (results.length >= maxResults) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (results.length >= maxResults) return;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) {
        await walkDir(fullPath, results, maxResults);
      }
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
}

function globToRegex(pattern) {
  let regexStr = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        regexStr += '.*';
        i += 2;
        if (pattern[i] === '/') i++;
      } else {
        regexStr += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      regexStr += '[^/]';
      i++;
    } else if (c === '.') {
      regexStr += '\\.';
      i++;
    } else if (c === '{') {
      const end = pattern.indexOf('}', i);
      if (end !== -1) {
        const options = pattern.slice(i + 1, end).split(',');
        regexStr += '(' + options.map(o => o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')';
        i = end + 1;
      } else {
        regexStr += '\\{';
        i++;
      }
    } else {
      regexStr += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }
  return new RegExp('^' + regexStr + '$');
}

export async function handleGlobFiles(args) {
  const { pattern } = args;
  if (!pattern) return { type: 'error', message: 'Error: No pattern provided.' };

  const cwd = process.cwd();
  const allFiles = [];
  await walkDir(cwd, allFiles, GLOB_MAX_RESULTS + 100);

  const relativePaths = allFiles.map(f => path.relative(cwd, f));
  let isMatch;
  try {
    isMatch = globToRegex(pattern);
  } catch {
    return { type: 'error', message: `Error: Invalid glob pattern: ${pattern}` };
  }
  const matched = relativePaths.filter(f => isMatch.test(f)).slice(0, GLOB_MAX_RESULTS);

  if (matched.length === 0) return { type: 'generic', message: `No files matched the pattern: ${pattern}` };
  return { type: 'generic', message: matched.join('\n') };
}

export async function handleGrepSearch(args) {
  const { search_term, path: searchPath } = args;
  if (!search_term) return { type: 'error', message: 'Error: No search_term provided.' };

  const root = searchPath ? path.resolve(process.cwd(), searchPath) : process.cwd();

  let regex;
  try {
    regex = new RegExp(search_term, 'gi');
  } catch {
    const escaped = search_term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(escaped, 'gi');
  }

  const allFiles = [];
  await walkDir(root, allFiles, 5000);

  const matches = [];
  const batchSize = 20;

  for (let i = 0; i < allFiles.length && matches.length < GREP_MAX_RESULTS; i += batchSize) {
    const batch = allFiles.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (BINARY_EXT.has(ext)) return [];

        let content;
        try {
          content = await fs.readFile(filePath, 'utf-8');
        } catch {
          return [];
        }

        if (content.indexOf('\0') !== -1) return [];

        const lines = content.split('\n');
        const fileMatches = [];
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          regex.lastIndex = 0;
          if (regex.test(lines[lineNum])) {
            const relPath = path.relative(root, filePath);
            fileMatches.push(`${relPath}:${lineNum + 1}:  ${lines[lineNum]}`);
            if (matches.length + fileMatches.length >= GREP_MAX_RESULTS) break;
          }
        }
        return fileMatches;
      })
    );
    for (const fileMatches of results) {
      matches.push(...fileMatches);
      if (matches.length >= GREP_MAX_RESULTS) break;
    }
  }

  if (matches.length === 0) return { type: 'generic', message: `No matches found for: ${search_term}` };
  return { type: 'generic', message: matches.join('\n') };
}
