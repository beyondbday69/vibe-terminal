import chalk from 'chalk';
import path from 'node:path';
import { SYNTAX_COLORS } from '../constants.js';

// ── Diff Viewer Constants (matches design spec) ────────────────────────────────
const C_DIM = '#888888';
const C_GREEN = '#6db86d';         // muted green text for added
const C_RED = '#c97070';           // muted red text for removed
const C_GREEN_BG = '#1a2e1a';     // dark green bg for added lines
const C_RED_BG = '#2e1a1a';       // dark red bg for removed lines
const C_HUNK_BG = '#1a1e2e';      // hunk header bg
const C_HUNK_FG = '#6a8abf';      // hunk header text
const C_LINE_NUM = '#383838';     // line numbers
const C_SEP = '#2a2a2a';
const C_ACCENT = '#7eb8f7';
const C_WHITE = '#f0f0f0';
const C_YELLOW = '#d4a574';
const C_CODE_BG = '#141414';

function applySyntaxHighlighting(text) {
  let highlighted = text;
  
  // Comments
  highlighted = highlighted.replace(/(\/\/.*|\/\*[\s\S]*?\*\/)/g, chalk.hex(SYNTAX_COLORS.comments)('$1'));
  
  // Strings
  highlighted = highlighted.replace(/(["'`])(?:(?=(\\?))\2.)*?\1/g, chalk.hex(SYNTAX_COLORS.strings)('$&'));
  
  // Keywords
  const keywords = /\b(const|let|var|function|return|if|else|for|while|import|export|class|extends|new|this|await|async|try|catch)\b/g;
  highlighted = highlighted.replace(keywords, chalk.hex(SYNTAX_COLORS.keywords)('$1'));
  
  // Numbers
  highlighted = highlighted.replace(/\b(\d+(\.\d+)?)\b/g, chalk.hex(SYNTAX_COLORS.numbers)('$1'));
  
  return highlighted;
}
const SIDE_BY_SIDE_MIN_WIDTH = 100;
const MAX_ROWS = 50;

// ── Helpers ────────────────────────────────────────────────────────────────────
function fileRel(p) {
  const cwd = process.cwd();
  if (p.startsWith(cwd)) return path.relative(cwd, p);
  return p;
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── Simple LCS Diff Algorithm ──────────────────────────────────────────────────
function computeOpcodes(oldLines, newLines) {
  const opcodes = [];
  const m = oldLines.length;
  const n = newLines.length;

  // Simple LCS table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find opcodes
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

  // Merge consecutive same-tag operations into ranges
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
      const next = opcodes[idx + 1];
      merged.push({ tag: 'replace', i1: curr.i1, i2: curr.i2, j1: next.j1, j2: next.j2 });
      idx++;
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

// ── Cell Renderer ──────────────────────────────────────────────────────────────
function renderCell(lineno, text, tag, codeWidth) {
  const lnoStr = (lineno !== '' && lineno !== '…') ? String(lineno).padStart(3) : '   ';

  if (tag === 'pad') {
    return ' '.repeat(5 + codeWidth);
  }

  if (tag === 'skip') {
    const skipContent = chalk.hex(C_CODE_BG).bgHex(C_CODE_BG)('    ') +
      chalk.bold.hex(C_ACCENT2).bgHex(C_CODE_BG)(' … ') +
      chalk.dim.hex(C_SEP).bgHex(C_CODE_BG)('─'.repeat(Math.max(0, codeWidth - 3)));
    return skipContent;
  }

  let displayText = text || '';
  if (displayText.length > codeWidth) {
    displayText = displayText.slice(0, codeWidth - 1) + '…';
  } else {
    displayText = displayText.padEnd(codeWidth);
  }

  const highlightedText = applySyntaxHighlighting(displayText);

  let result = '';
  if (tag === 'eq') {
    result = chalk.hex(C_LINE_NUM).bgHex(C_CODE_BG)(lnoStr) +
      chalk.bgHex(C_CODE_BG)('  ') +
      chalk.bgHex(C_CODE_BG)(highlightedText);
  } else if (tag === 'add') {
    result = chalk.hex(C_GREEN).bgHex(C_GREEN_BG)(lnoStr) +
      chalk.hex(C_GREEN).bgHex(C_GREEN_BG)(' +') +
      chalk.hex(C_GREEN).bgHex(C_GREEN_BG)(displayText);
  } else if (tag === 'del') {
    result = chalk.hex(C_RED).bgHex(C_RED_BG)(lnoStr) +
      chalk.hex(C_RED).bgHex(C_RED_BG)(' -') +
      chalk.hex(C_RED).bgHex(C_RED_BG)(displayText);
  }

  return result;
}

// ── Main Diff View Generator ───────────────────────────────────────────────────
export function formatDiffView(filePath, newContent, oldContent, termWidth, role = null) {
  const p = filePath.startsWith('/') ? filePath : path.resolve(process.cwd(), filePath);
  const isNew = oldContent === null || oldContent === undefined;
  const relPath = fileRel(p);

  const oldLines = isNew ? [] : oldContent.split('\n');
  const newLines = newContent.split('\n');

  const opcodes = computeOpcodes(oldLines, newLines);

  const leftRows = [];
  const rightRows = [];

  for (const op of opcodes) {
    if (op.tag === 'equal') {
      for (let k = 0; k < op.i2 - op.i1; k++) {
        leftRows.push({ lno: op.i1 + k + 1, text: oldLines[op.i1 + k], tag: 'eq' });
        rightRows.push({ lno: op.j1 + k + 1, text: newLines[op.j1 + k], tag: 'eq' });
      }
    } else if (op.tag === 'replace') {
      const oldSlice = oldLines.slice(op.i1, op.i2);
      const newSlice = newLines.slice(op.j1, op.j2);
      const maxLen = Math.max(oldSlice.length, newSlice.length);
      for (let k = 0; k < maxLen; k++) {
        if (k < oldSlice.length) {
          leftRows.push({ lno: op.i1 + k + 1, text: oldSlice[k], tag: 'del' });
        } else {
          leftRows.push({ lno: '', text: '', tag: 'pad' });
        }
        if (k < newSlice.length) {
          rightRows.push({ lno: op.j1 + k + 1, text: newSlice[k], tag: 'add' });
        } else {
          rightRows.push({ lno: '', text: '', tag: 'pad' });
        }
      }
    } else if (op.tag === 'delete') {
      for (let k = 0; k < op.i2 - op.i1; k++) {
        leftRows.push({ lno: op.i1 + k + 1, text: oldLines[op.i1 + k], tag: 'del' });
        rightRows.push({ lno: '', text: '', tag: 'pad' });
      }
    } else if (op.tag === 'insert') {
      for (let k = 0; k < op.j2 - op.j1; k++) {
        leftRows.push({ lno: '', text: '', tag: 'pad' });
        rightRows.push({ lno: op.j1 + k + 1, text: newLines[op.j1 + k], tag: 'add' });
      }
    }
  }

  // Collapse if too many rows
  let finalLeft = leftRows;
  let finalRight = rightRows;
  if (leftRows.length > MAX_ROWS) {
    const h = Math.floor(MAX_ROWS / 2);
    finalLeft = [
      ...leftRows.slice(0, h),
      { lno: '…', text: '…', tag: 'skip' },
      ...leftRows.slice(-h),
    ];
    finalRight = [
      ...rightRows.slice(0, h),
      { lno: '…', text: '…', tag: 'skip' },
      ...rightRows.slice(-h),
    ];
  }

  const tw = Math.max(Math.min(termWidth, 120), 40);
  const action = isNew ? chalk.bold.hex(C_GREEN)('NEW') : chalk.bold.hex(C_YELLOW)('EDIT');
  const adds = rightRows.filter(r => r.tag === 'add').length;
  const dels = leftRows.filter(r => r.tag === 'del').length;

  const lines = [];

  // Header
  const roleText = role ? chalk.dim(` [${role}]`) : '';
  lines.push({ type: 'tool_content', content: `  ${chalk.hex(C_ACCENT)('│')} ${action} ${chalk.hex(C_WHITE)(relPath)}${roleText}` });
  lines.push({ type: 'tool_content', content: '' });

  if (tw >= SIDE_BY_SIDE_MIN_WIDTH) {
    // Side-by-side view
    const cellW = Math.floor((tw - 1) / 2);
    const codeW = Math.max(cellW - 5, 10);
    const sep = '─'.repeat(tw);

    const hdr = chalk.dim.hex(C_DIM)('BEFORE'.padStart(Math.floor((cellW + 6) / 2)).padEnd(cellW)) +
      ' ' +
      chalk.bold.hex(C_ACCENT)('AFTER'.padStart(Math.floor((cellW + 4) / 2)));
    lines.push({ type: 'tool_content', content: hdr });
    lines.push({ type: 'tool_content', content: chalk.hex(C_SEP)(sep) });

    for (let i = 0; i < finalLeft.length; i++) {
      const left = renderCell(finalLeft[i].lno, finalLeft[i].text, finalLeft[i].tag, codeW);
      const right = renderCell(finalRight[i].lno, finalRight[i].text, finalRight[i].tag, codeW);
      const leftPlain = stripAnsi(left);
      const padLen = Math.max(0, cellW - leftPlain.length);
      const row = left + chalk.bgHex(C_CODE_BG)(' '.repeat(padLen)) + ' ' + right;
      lines.push({ type: 'tool_content', content: row });
    }

    lines.push({ type: 'tool_content', content: chalk.hex(C_SEP)(sep) });
  } else {
    // Unified view for narrow terminals
    const codeW = Math.max(tw - 8, 10);
    const sep = '─'.repeat(tw);

    lines.push({ type: 'tool_content', content: chalk.bold.hex(C_ACCENT)('AFTER'.padStart(Math.floor((tw + 5) / 2))) });
    lines.push({ type: 'tool_content', content: chalk.hex(C_SEP)(sep) });

    for (let i = 0; i < finalLeft.length; i++) {
      if (finalLeft[i].tag === 'del') {
        lines.push({ type: 'tool_content', content: renderCell(finalLeft[i].lno, finalLeft[i].text, 'del', codeW) });
      }
      if (finalRight[i].tag === 'add') {
        lines.push({ type: 'tool_content', content: renderCell(finalRight[i].lno, finalRight[i].text, 'add', codeW) });
      }
      if (finalLeft[i].tag === 'eq') {
        lines.push({ type: 'tool_content', content: renderCell(finalRight[i].lno, finalRight[i].text, 'eq', codeW) });
      }
      if (finalLeft[i].tag === 'skip') {
        lines.push({ type: 'tool_content', content: renderCell('…', '…', 'skip', codeW) });
      }
    }

    lines.push({ type: 'tool_content', content: chalk.hex(C_SEP)(sep) });
  }

  // Summary
  const summary = chalk.bold.hex(C_GREEN)(`  +${adds} `) + chalk.bold.hex(C_RED)(`-${dels}`);
  const extra = isNew ? chalk.dim.hex(C_DIM)(`  (new file, ${newLines.length} lines)`) : '';
  lines.push({ type: 'tool_content', content: summary + extra });
  lines.push({ type: 'tool_content', content: '' });

  return lines;
}
