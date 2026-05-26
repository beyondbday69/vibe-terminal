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

function wrapInBox(label, contentLines, termWidth) {
  const boxW = Math.min(termWidth - 4, 78);
  
  let colorizedLabel = label;
  if (label.includes(' · ')) {
    const [action, file] = label.split(' · ');
    colorizedLabel = `${chalk.hex('#d4a574')(action)} ${chalk.hex('#555555')('·')} ${chalk.hex('#7eb8f7')(file)}`;
  } else {
    colorizedLabel = chalk.hex('#7eb8f7')(label);
  }

  const borderLeft = chalk.hex('#2a2a2a')('┌─ ');
  const borderRight = chalk.hex('#2a2a2a')(' ' + '─'.repeat(Math.max(0, boxW - label.length - 5)) + '┐');
  const topLine = borderLeft + colorizedLabel + borderRight;
  
  const botLine = chalk.hex('#2a2a2a')('└' + '─'.repeat(boxW - 2) + '┘');
  const result = [];
  result.push({ type: 'box_border', content: topLine });
  contentLines.forEach(l => {
    result.push(l);
  });
  result.push({ type: 'box_border', content: botLine });
  return result;
}

export function formatToolResult(funcName, result, termWidth) {
  if (!result) return formatToolRunning(funcName);
  if (result.type === 'error') return formatError(result, funcName, termWidth);
  if (result.type === 'file_created') return formatFileCreated(result, termWidth);
  if (result.type === 'file_edited') return formatFileEdited(result, termWidth);
  if (result.type === 'file_read') return formatFileRead(result, termWidth);
  if (result.type === 'bash_result') return formatBashResult(result, termWidth);
  if (result.type === 'agent_spawned') return formatAgentSpawned(result, termWidth);
  if (result.type === 'team_result') return formatTeamSpawn(result, termWidth);
  if (result.type === 'agent_report_all') return formatAgentReportAll(result, termWidth);
  return formatGenericResult(result, funcName, termWidth);
}

function formatTeamSpawn(result, termWidth) {
  const lines = [];
  lines.push({
    type: 'tool_status',
    icon: '►',
    color: '#0ea5e9',
    content: 'team_spawn',
    detail: chalk.hex('#737373')(`Team operation complete (${result.agents?.length || 0} agents)`),
  });
  return lines;
}

function formatAgentReportAll(result, termWidth) {
  const lines = [];
  lines.push({
    type: 'tool_status',
    icon: '✓',
    color: '#3ECF8E',
    content: 'agent_report_all',
    detail: chalk.hex('#737373')(`Fetched reports for ${result.reports?.length || 0} agents`),
  });
  return lines;
}

function formatToolRunning(funcName) {
  return [
    { type: 'tool_status', icon: '⟳', color: '#d4a574', content: funcName },
  ];
}

function formatError(result, funcName, termWidth) {
  return [
    { type: 'tool_status', icon: '✗', color: '#EF4444', content: funcName || 'error' },
    { type: 'tool_content', content: indent(chalk.red(result.message)), color: '#EF4444' },
  ];
}

function formatFileCreated(result, termWidth) {
  const relPath = shortenPath(result.path);
  const innerLines = [];

  innerLines.push({ type: 'tool_content', content: indent(chalk.hex('#888888')(`${result.lineCount} lines  ${result.bytes} bytes`)) });

  const oldContent = result.oldContent ?? '';
  const hunks = getPatchFromContents(result.path, oldContent, result.content);
  if (hunks.length > 0) {
    hunks.forEach(hunk => {
      const diffLines = renderHunk(hunk, Math.min(termWidth - 8, 74));
      diffLines.forEach(dl => innerLines.push({ type: 'tool_content', content: indent(dl) }));
    });
  } else {
    const contentLines = result.content.split('\n');
    const preview = contentLines.slice(0, 8);
    preview.forEach((line, i) => {
      const num = chalk.hex('#383838')(String(i + 1).padStart(3));
      innerLines.push({ type: 'tool_content', content: indent(`${num}  ${chalk.hex('#f0f0f0')(truncateLine(line, termWidth - 12))}`) });
    });
    if (contentLines.length > 8) {
      innerLines.push({ type: 'tool_content', content: indent(chalk.hex('#444444')(`  ... ${contentLines.length - 8} more lines`)) });
    }
  }

  return wrapInBox(`write · ${relPath}`, innerLines, termWidth);
}

function formatFileRead(result, termWidth) {
  const relPath = shortenPath(result.path);
  const lines = [];

  const contentLines = result.content.split('\n');
  const preview = contentLines.slice(0, 5);

  lines.push({
    type: 'tool_status',
    icon: '✓',
    color: '#98c99a',
    content: `read`,
    detail: chalk.hex('#7eb8f7')(`${relPath}`) + chalk.hex('#444444')(`  ${result.lineCount} lines`),
  });

  preview.forEach((line, i) => {
    const num = chalk.hex('#383838')(String(i + 1).padStart(3));
    lines.push({ type: 'tool_content', content: indent(`${num}  ${chalk.hex('#888888')(truncateLine(line, termWidth - 10))}`) });
  });

  if (contentLines.length > 5) {
    lines.push({ type: 'tool_content', content: indent(chalk.hex('#444444')(`  ... ${contentLines.length - 5} more lines`)) });
  }

  return lines;
}

function formatFileEdited(result, termWidth) {
  const relPath = shortenPath(result.path);
  const innerLines = [];

  const addedStr = chalk.hex('#6db86d')(`+${result.totalAdded}`);
  const removedStr = chalk.hex('#c97070')(`-${result.totalRemoved}`);
  innerLines.push({ type: 'tool_content', content: indent(`${addedStr}  ${removedStr}`) });

  if (result.oldContent !== undefined && result.newContent !== undefined) {
    const hunks = getPatchFromContents(result.path, result.oldContent, result.newContent);
    hunks.forEach(hunk => {
      const diffLines = renderHunk(hunk, Math.min(termWidth - 8, 74));
      diffLines.forEach(dl => innerLines.push({ type: 'tool_content', content: indent(dl) }));
    });
  } else {
    result.blocks.forEach((block) => {
      innerLines.push({ type: 'tool_content', content: indent(chalk.hex('#6a8abf')(`@@ line ${block.lineNum} @@`)) });
      block.searchLines.forEach(sl => {
        innerLines.push({ type: 'tool_content', content: indent(chalk.hex('#c97070')(`- ${truncateLine(sl, termWidth - 8)}`)) });
      });
      block.replaceLines.forEach(rl => {
        innerLines.push({ type: 'tool_content', content: indent(chalk.hex('#6db86d')(`+ ${truncateLine(rl, termWidth - 8)}`)) });
      });
    });
  }

  return wrapInBox(`edit · ${relPath}`, innerLines, termWidth);
}

function formatBashResult(result, termWidth) {
  const lines = [];
  const success = result.exitCode === 0 && !result.timedOut;

  lines.push({
    type: 'tool_status',
    icon: success ? '✓' : '✗',
    color: success ? '#98c99a' : '#c97070',
    content: `$`,
    detail: chalk.hex('#888888')(`${truncateLine(result.command, 50)}`) + chalk.hex('#444444')(` [${result.exitCode}]`),
  });

  const hasOutput = result.stdout.trim() || result.stderr.trim();
  if (!hasOutput) {
    return lines;
  }

  if (result.stdout.trim()) {
    result.stdout.trim().split('\n').slice(0, 10).forEach(l => {
      lines.push({ type: 'tool_content', content: indent(chalk.hex('#f0f0f0')(truncateLine(l, termWidth - 6))) });
    });
    const totalLines = result.stdout.trim().split('\n').length;
    if (totalLines > 10) {
      lines.push({ type: 'tool_content', content: indent(chalk.hex('#444444')(`... ${totalLines - 10} more lines`)) });
    }
  }
  if (result.stderr.trim()) {
    result.stderr.trim().split('\n').slice(0, 5).forEach(l => {
      lines.push({ type: 'tool_content', content: indent(chalk.hex('#c97070')(truncateLine(l, termWidth - 6))) });
    });
  }
  if (result.timedOut) {
    lines.push({ type: 'tool_content', content: indent(chalk.hex('#c97070')('timed out')) });
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
  lines.push({ type: 'tool_status', icon: '✓', color: '#3ECF8E', content: funcName });
  msg.split('\n').forEach(l => {
    lines.push({ type: 'tool_content', content: indent(chalk.hex('#a3a3a3')(truncateLine(l, termWidth - 6))) });
  });
  return lines;
}
