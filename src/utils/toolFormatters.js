import chalk from 'chalk';
import path from 'node:path';
import { getPatchFromContents, renderHunk } from './structuredDiff.js';

const CONTENT_INDENT = 2;
const MAX_LINE_WIDTH_RATIO = 0.85;

function indent(text, spaces = CONTENT_INDENT) {
  return ' '.repeat(spaces) + text;
}

function shortenPath(p) {
  const cwd = process.cwd();
  if (p.startsWith(cwd)) return path.relative(cwd, p);
  return p;
}

function truncateLine(line, maxWidth) {
  if (line.length <= maxWidth) return line;
  return line.slice(0, maxWidth - 1) + '…';
}

export function formatToolResult(funcName, result, termWidth) {
  if (!result) return formatToolRunning(funcName);
  if (result.type === 'error') return formatError(result, funcName, termWidth);
  if (result.type === 'file_created') return formatFileCreated(result, termWidth);
  if (result.type === 'file_edited') return formatFileEdited(result, termWidth);
  if (result.type === 'file_read') return formatFileRead(result, termWidth);
  if (result.type === 'bash_result') return formatBashResult(result, termWidth);
  if (result.type === 'agent_spawned') return formatAgentSpawned(result, termWidth);
  return formatGenericResult(result, funcName, termWidth);
}

function formatToolRunning(funcName) {
  return [
    { type: 'tool_status', icon: '⟳', color: '#a3a3a3', content: funcName },
  ];
}

function formatError(result, funcName, termWidth) {
  return [
    { type: 'tool_status', icon: '✗', color: '#ef4444', content: funcName || 'error' },
    { type: 'tool_content', content: indent(chalk.red(result.message)), color: '#ef4444' },
  ];
}

function formatFileCreated(result, termWidth) {
  const relPath = shortenPath(result.path);
  const lines = [];

  lines.push({
    type: 'tool_status',
    icon: '✓',
    color: '#22c55e',
    content: `write_file`,
    detail: chalk.hex('#737373')(`${relPath}  ${result.lineCount} lines • ${result.bytes} bytes`),
  });

  // Use structured diff renderer
  const oldContent = result.oldContent ?? '';
  const hunks = getPatchFromContents(result.path, oldContent, result.content);
  if (hunks.length > 0) {
    hunks.forEach(hunk => {
      const diffLines = renderHunk(hunk, Math.min(termWidth - 2, 90));
      diffLines.forEach(dl => lines.push({ type: 'tool_content', content: indent(dl) }));
    });
  } else {
    // New file - show content in a box
    const contentLines = result.content.split('\n');
    const boxW = Math.min(Math.floor(termWidth * 0.85), 80);
    const innerW = boxW - 2;
    const lineNumWidth = String(contentLines.length).length;
    const codeW = innerW - lineNumWidth - 3;
    lines.push({ type: 'tool_content', content: indent(chalk.hex('#525252')('\u250c' + '\u2500'.repeat(innerW) + '\u2510')) });
    contentLines.forEach((line, i) => {
      const num = chalk.hex('#525252')(String(i + 1).padStart(lineNumWidth));
      const code = chalk.white(truncateLine(line, codeW).padEnd(codeW));
      lines.push({ type: 'tool_content', content: indent(chalk.hex('#525252')('\u2502 ') + num + ' ' + code + chalk.hex('#525252')(' \u2502')) });
    });
    lines.push({ type: 'tool_content', content: indent(chalk.hex('#525252')('\u2514' + '\u2500'.repeat(innerW) + '\u2518')) });
  }

  return lines;
}

function formatFileRead(result, termWidth) {
  const relPath = shortenPath(result.path);
  const lines = [];

  // Show badge with filename in accent color + preview of 5 lines
  const contentLines = result.content.split('\n');
  const preview = contentLines.slice(0, 5);
  const hasMore = contentLines.length > 5;

  lines.push({
    type: 'tool_status',
    icon: '✓',
    color: '#22c55e',
    content: `read_file`,
    detail: chalk.hex('#D77757')(`[${relPath}]`) + chalk.hex('#737373')(`  ${result.lineCount} lines`),
  });

  preview.forEach((line, i) => {
    const num = chalk.hex('#525252')(String(i + 1).padStart(3));
    lines.push({ type: 'tool_content', content: indent(`${num}  ${chalk.white(truncateLine(line, termWidth - 10))}`) });
  });

  if (hasMore) {
    lines.push({ type: 'tool_content', content: indent(chalk.hex('#525252')(`  ... ${contentLines.length - 5} more lines`)) });
  }

  return lines;
}

function formatFileEdited(result, termWidth) {
  const relPath = shortenPath(result.path);
  const lines = [];

  lines.push({
    type: 'tool_status',
    icon: '✓',
    color: '#22c55e',
    content: `edit_file`,
    detail: chalk.hex('#737373')(`${relPath}  ${result.blockCount} block(s)`),
  });

  const addedStr = chalk.hex('#3ECF8E')(`+${result.totalAdded}`);
  const removedStr = chalk.hex('#EF4444')(`-${result.totalRemoved}`);
  lines.push({ type: 'tool_content', content: indent(`${addedStr} added  ${removedStr} removed`) });

  // Use structured diff renderer
  if (result.oldContent !== undefined && result.newContent !== undefined) {
    const hunks = getPatchFromContents(result.path, result.oldContent, result.newContent);
    hunks.forEach(hunk => {
      const diffLines = renderHunk(hunk, Math.min(termWidth - 2, 90));
      diffLines.forEach(dl => lines.push({ type: 'tool_content', content: indent(dl) }));
    });
  } else {
    // Fallback to block-level diff if full content not available
    result.blocks.forEach((block) => {
      lines.push({ type: 'tool_content', content: indent(chalk.hex('#737373')(`@@ line ${block.lineNum} @@`)) });
      block.searchLines.forEach(sl => {
        lines.push({ type: 'tool_content', content: indent(chalk.hex('#EF4444')(`- ${truncateLine(sl, termWidth - 8)}`)) });
      });
      block.replaceLines.forEach(rl => {
        lines.push({ type: 'tool_content', content: indent(chalk.hex('#3ECF8E')(`+ ${truncateLine(rl, termWidth - 8)}`)) });
      });
    });
  }

  return lines;
}

function formatBashResult(result, termWidth) {
  const lines = [];
  const success = result.exitCode === 0 && !result.timedOut;
  const icon = success ? '✓' : '✗';
  const iconColor = success ? '#22c55e' : '#ef4444';

  lines.push({
    type: 'tool_status',
    icon,
    color: iconColor,
    content: `run_bash`,
    detail: chalk.hex('#737373')(`${truncateLine(result.command, 40)}  [exit: ${result.exitCode}]`),
  });

  const hasOutput = result.stdout.trim() || result.stderr.trim();
  if (!hasOutput) {
    lines.push({ type: 'tool_content', content: indent(chalk.hex('#737373')('(no output)')) });
    return lines;
  }

  // Show output directly
  if (result.stdout.trim()) {
    result.stdout.trim().split('\n').forEach(l => {
      lines.push({ type: 'tool_content', content: indent(chalk.white(truncateLine(l, termWidth - 6))) });
    });
  }
  if (result.stderr.trim()) {
    result.stderr.trim().split('\n').forEach(l => {
      lines.push({ type: 'tool_content', content: indent(chalk.hex('#EF4444')(truncateLine(l, termWidth - 6))) });
    });
  }
  if (result.timedOut) {
    lines.push({ type: 'tool_content', content: indent(chalk.hex('#EF4444')('Command timed out')) });
  }

  return lines;
}

function formatAgentSpawned(result, termWidth) {
  const lines = [];
  lines.push({
    type: 'tool_status',
    icon: '>',
    color: '#D77757',
    content: 'agent_spawn',
    detail: chalk.hex('#737373')(`${result.id}`),
    agentId: result.id,
    agentGoal: result.goal,
  });
  return lines;
}

function formatGenericResult(result, funcName, termWidth) {
  const msg = result.message || String(result);
  const lines = [];
  lines.push({ type: 'tool_status', icon: '✓', color: '#22c55e', content: funcName });
  msg.split('\n').forEach(l => {
    lines.push({ type: 'tool_content', content: indent(chalk.hex('#a3a3a3')(truncateLine(l, termWidth - 6))) });
  });
  return lines;
}
