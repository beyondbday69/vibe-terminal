import chalk from 'chalk';
import path from 'node:path';

const CONTEXT_LINES = 3;

/**
 * Generate structured patch hunks from old/new content
 */
export function getPatchFromContents(filePath, oldContent, newContent) {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  // Simple LCS-based diff
  const hunks = [];
  const ops = computeOpcodes(oldLines, newLines);

  let hunk = null;
  for (const op of ops) {
    if (op.tag === 'equal') {
      const lines = oldLines.slice(op.i1, op.i2);
      // Only include context lines around changes
      if (hunk) {
        const contextStart = Math.max(0, lines.length - CONTEXT_LINES);
        hunk.lines.push(...lines.slice(contextStart).map(l => ' ' + l));
        hunks.push(hunk);
        hunk = null;
      }
      // Check if next op is a change - add leading context
      const nextIdx = ops.indexOf(op) + 1;
      if (nextIdx < ops.length && ops[nextIdx].tag !== 'equal') {
        const contextStart = Math.max(0, lines.length - CONTEXT_LINES);
        hunk = {
          oldStart: op.i1 + contextStart + 1,
          oldLines: 0,
          newStart: op.j1 + contextStart + 1,
          newLines: 0,
          lines: lines.slice(contextStart).map(l => ' ' + l),
        };
      }
    } else if (op.tag === 'replace') {
      if (!hunk) {
        hunk = { oldStart: op.i1 + 1, oldLines: 0, newStart: op.j1 + 1, newLines: 0, lines: [] };
      }
      const removed = oldLines.slice(op.i1, op.i2);
      const added = newLines.slice(op.j1, op.j2);
      hunk.lines.push(...removed.map(l => '-' + l));
      hunk.lines.push(...added.map(l => '+' + l));
      hunk.oldLines += removed.length;
      hunk.newLines += added.length;
    } else if (op.tag === 'delete') {
      if (!hunk) {
        hunk = { oldStart: op.i1 + 1, oldLines: 0, newStart: op.j1 + 1, newLines: 0, lines: [] };
      }
      const removed = oldLines.slice(op.i1, op.i2);
      hunk.lines.push(...removed.map(l => '-' + l));
      hunk.oldLines += removed.length;
    } else if (op.tag === 'insert') {
      if (!hunk) {
        hunk = { oldStart: op.i1 + 1, oldLines: 0, newStart: op.j1 + 1, newLines: 0, lines: [] };
      }
      const added = newLines.slice(op.j1, op.j2);
      hunk.lines.push(...added.map(l => '+' + l));
      hunk.newLines += added.length;
    }
  }
  if (hunk) hunks.push(hunk);

  return hunks;
}

function computeOpcodes(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  let i = m, j = n;
  const raw = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      raw.unshift({ tag: 'equal', oldIdx: i - 1, newIdx: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ tag: 'insert', newIdx: j - 1 });
      j--;
    } else {
      raw.unshift({ tag: 'delete', oldIdx: i - 1 });
      i--;
    }
  }

  // Merge into ranges
  const opcodes = [];
  let k = 0;
  while (k < raw.length) {
    const tag = raw[k].tag;
    let end = k;
    while (end < raw.length && raw[end].tag === tag) end++;
    if (tag === 'equal') {
      opcodes.push({ tag, i1: raw[k].oldIdx, i2: raw[end - 1].oldIdx + 1, j1: raw[k].newIdx, j2: raw[end - 1].newIdx + 1 });
    } else if (tag === 'delete') {
      opcodes.push({ tag, i1: raw[k].oldIdx, i2: raw[end - 1].oldIdx + 1, j1: 0, j2: 0 });
    } else {
      opcodes.push({ tag, i1: 0, i2: 0, j1: raw[k].newIdx, j2: raw[end - 1].newIdx + 1 });
    }
    k = end;
  }

  // Merge adjacent delete+insert into replace
  const merged = [];
  for (let idx = 0; idx < opcodes.length; idx++) {
    const curr = opcodes[idx];
    if (curr.tag === 'delete' && idx + 1 < opcodes.length && opcodes[idx + 1].tag === 'insert') {
      merged.push({ tag: 'replace', i1: curr.i1, i2: curr.i2, j1: opcodes[idx + 1].j1, j2: opcodes[idx + 1].j2 });
      idx++;
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

/**
 * Render a structured diff hunk to styled lines
 */
export function renderHunk(hunk, width) {
  const lines = [];
  const maxLineNum = Math.max(hunk.oldStart + hunk.oldLines - 1, hunk.newStart + hunk.newLines - 1, 1);
  const gutterWidth = maxLineNum.toString().length + 3; // marker + 2 spaces
  const contentWidth = Math.max(10, width - gutterWidth - 1);

  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;

  // Group adjacent remove/add lines for word-level diff
  const processedLines = processAdjacentLines(hunk.lines);

  for (const item of processedLines) {
    const sigil = item.type === 'add' ? '+' : item.type === 'remove' ? '-' : ' ';
    const lineNum = item.type === 'add'
      ? String(newLine++).padStart(maxLineNum.toString().length)
      : item.type === 'remove'
        ? String(oldLine++).padStart(maxLineNum.toString().length)
        : (oldLine++, newLine++, String(oldLine - 1).padStart(maxLineNum.toString().length));

    const gutter = `${lineNum} ${sigil}`;

    if (item.wordDiff && item.matchedLine) {
      // Word-level diff rendering (may return null if change ratio too high)
      const wordLines = renderWordDiff(item, item.matchedLine, contentWidth, gutterWidth, width, gutter);
      if (wordLines) {
        lines.push(...wordLines);
      } else {
        // Fall through to standard rendering
        const bg = item.type === 'add' ? '#1a3a1a' : item.type === 'remove' ? '#3a1a1a' : null;
        const fg = item.type === 'add' ? '#3ECF8E' : item.type === 'remove' ? '#EF4444' : '#a3a3a3';
        const code = item.code || '';
        const wrapped = wrapText(code, contentWidth);
        wrapped.forEach((line) => {
          const padLen = Math.max(0, width - gutterWidth - line.length);
          const gutterStyled = chalk.hex(fg)(gutter);
          const codeStyled = bg ? chalk.bgHex(bg).hex(fg)(line) : chalk.hex(fg)(line);
          const pad = bg ? chalk.bgHex(bg)(' '.repeat(padLen)) : ' '.repeat(padLen);
          lines.push(gutterStyled + ' ' + codeStyled + pad);
        });
      }
    } else {
      // Standard rendering
      const bg = item.type === 'add' ? '#1a3a1a' : item.type === 'remove' ? '#3a1a1a' : null;
      const fg = item.type === 'add' ? '#3ECF8E' : item.type === 'remove' ? '#EF4444' : '#a3a3a3';
      const code = item.code || '';
      const wrapped = wrapText(code, contentWidth);
      wrapped.forEach((line, idx) => {
        const padLen = Math.max(0, width - gutterWidth - line.length);
        const gutterStyled = chalk.hex(fg)(gutter);
        const codeStyled = bg ? chalk.bgHex(bg).hex(fg)(line) : chalk.hex(fg)(line);
        const pad = bg ? chalk.bgHex(bg)(' '.repeat(padLen)) : ' '.repeat(padLen);
        lines.push(gutterStyled + ' ' + codeStyled + pad);
      });
    }
  }
  return lines;
}

function processAdjacentLines(rawLines) {
  const items = rawLines.map(l => ({
    type: l.startsWith('+') ? 'add' : l.startsWith('-') ? 'remove' : 'nochange',
    code: l.slice(1),
  }));

  const result = [];
  let i = 0;
  while (i < items.length) {
    const curr = items[i];
    if (curr.type === 'remove') {
      const removes = [curr];
      let j = i + 1;
      while (j < items.length && items[j].type === 'remove') { removes.push(items[j]); j++; }
      const adds = [];
      while (j < items.length && items[j].type === 'add') { adds.push(items[j]); j++; }
      if (removes.length > 0 && adds.length > 0) {
        const pairCount = Math.min(removes.length, adds.length);
        for (let k = 0; k < pairCount; k++) {
          removes[k].wordDiff = true;
          adds[k].wordDiff = true;
          removes[k].matchedLine = adds[k];
          adds[k].matchedLine = removes[k];
        }
        result.push(...removes, ...adds);
        i = j;
      } else {
        result.push(curr);
        i++;
      }
    } else {
      result.push(curr);
      i++;
    }
  }
  return result;
}

function wordDiff(oldText, newText) {
  // Simple word-level diff using LCS on words
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const m = oldWords.length;
  const n = newWords.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldWords[i - 1] === newWords[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  let i = m, j = n;
  const parts = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      parts.unshift({ value: oldWords[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      parts.unshift({ value: newWords[j - 1], added: true });
      j--;
    } else {
      parts.unshift({ value: oldWords[i - 1], removed: true });
      i--;
    }
  }
  return parts;
}

function renderWordDiff(item, matchedLine, contentWidth, gutterWidth, totalWidth, gutter) {
  const removedText = item.type === 'remove' ? item.code : matchedLine.code;
  const addedText = item.type === 'remove' ? matchedLine.code : item.code;
  const wordDiffs = wordDiff(removedText, addedText);

  const CHANGE_THRESHOLD = 0.4;
  const totalLength = removedText.length + addedText.length;
  const changedLength = wordDiffs.filter(p => p.added || p.removed).reduce((s, p) => s + p.value.length, 0);
  if (totalLength > 0 && changedLength / totalLength > CHANGE_THRESHOLD) {
    return null; // Fall back to standard rendering
  }

  const bg = item.type === 'add' ? '#1a3a1a' : '#3a1a1a';
  const wordBg = item.type === 'add' ? '#2a5a2a' : '#5a2a2a';
  const fg = item.type === 'add' ? '#3ECF8E' : '#EF4444';

  let content = '';
  for (const part of wordDiffs) {
    let shouldShow = false;
    if (item.type === 'add') {
      shouldShow = part.added || (!part.removed);
    } else {
      shouldShow = part.removed || (!part.added);
    }
    if (!shouldShow) continue;

    if ((item.type === 'add' && part.added) || (item.type === 'remove' && part.removed)) {
      content += chalk.bgHex(wordBg).hex('#ffffff')(part.value);
    } else {
      content += part.value;
    }
  }

  const codeStyled = chalk.bgHex(bg).hex(fg)(content);
  const padLen = Math.max(0, totalWidth - gutterWidth - stripAnsi(content).length);
  const pad = chalk.bgHex(bg)(' '.repeat(padLen));
  return [chalk.hex(fg)(gutter) + ' ' + codeStyled + pad];
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function wrapText(text, maxWidth) {
  if (text.length <= maxWidth) return [text];
  const lines = [];
  let remaining = text;
  while (remaining.length > maxWidth) {
    lines.push(remaining.slice(0, maxWidth));
    remaining = remaining.slice(maxWidth);
  }
  if (remaining) lines.push(remaining);
  return lines;
}
