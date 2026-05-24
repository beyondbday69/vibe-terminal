import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';

const COMMANDS = [
  { cmd: '/help', desc: 'Show help' },
  { cmd: '/team', desc: 'Select team preset' },
  { cmd: '/agents', desc: 'List active sub-agents' },
  { cmd: '/report', desc: 'Show sub-agent reports' },
  { cmd: '/diff', desc: 'Show session diff log' },
  { cmd: '/clone', desc: 'Clone repository to switch workspace' },
  { cmd: '/cd', desc: 'Change or switch workspaces interactively' },
  { cmd: '/auth', desc: 'Set GitHub token for git pushing' },
  { cmd: '/model', desc: 'Select model' },
  { cmd: '/apikey', desc: 'Set API key' },
  { cmd: '/provider', desc: 'Switch provider' },
  { cmd: '/auto', desc: 'Toggle auto-execute vs ask mode' },
  { cmd: '/helpers', desc: 'Toggle helper agents (auto-review, auto-verify)' },
  { cmd: '/rewind', desc: 'Rewind to checkpoint' },
  { cmd: '/branch', desc: 'Fork from checkpoint' },
  { cmd: '/clear', desc: 'Clear chat' },
  { cmd: '/init', desc: 'Create CLAUDE.md' },
  { cmd: '/resume', desc: 'Resume session' },
  { cmd: '/delete', desc: 'Delete session' },
  { cmd: '/exit', desc: 'Exit app' },
];

const MAX_VISIBLE = 5;
const ACCENT = '#D77757';
const DIM = '#737373';
const BG = '#1a1a1a';
const SELECTED_BG = '#2a2a2a';
const POINTER = '\u25B8'; // ▸

function fuzzyMatch(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.startsWith(q)) return true;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function truncatePath(p, maxLen) {
  if (p.length <= maxLen) return p;
  const half = Math.floor((maxLen - 3) / 2);
  return p.slice(0, half) + '...' + p.slice(-half);
}

function SuggestionList({ items, selectedIndex, renderItem }) {
  const offset = Math.max(0, Math.min(selectedIndex - MAX_VISIBLE + 2, items.length - MAX_VISIBLE));
  const visible = items.slice(offset, offset + MAX_VISIBLE);

  return (
    <Box flexDirection="column" backgroundColor={BG} paddingX={0} paddingY={0}>
      {visible.map((item, i) => {
        const realIndex = offset + i;
        const isSelected = realIndex === selectedIndex;
        return renderItem(item, isSelected, realIndex);
      })}
    </Box>
  );
}

function SuggestionItem({ label, tag, description, isSelected }) {
  const prefix = isSelected
    ? chalk.hex(ACCENT)(POINTER) + ' '
    : '  ';
  const labelText = isSelected
    ? chalk.bold.white(label)
    : chalk.dim(label);
  const tagText = tag ? chalk.hex(DIM)(` [${tag}]`) : '';
  const descText = description ? chalk.hex(DIM)(`  ${description}`) : '';
  return (
    <Box>
      <Text>{prefix}{labelText}{tagText}{descText}</Text>
    </Box>
  );
}

export const CommandDropdown = ({ input, selectedIndex, onSelect, models, sessions, files, checkpoints }) => {
  // File mention dropdown @
  if (input.includes('@') && files && files.length > 0) {
    const lastAt = input.lastIndexOf('@');
    const query = input.slice(lastAt + 1).toLowerCase();
    const filtered = files.filter(f => fuzzyMatch(query, f));
    if (filtered.length === 0) return null;

    return (
      <SuggestionList
        items={filtered}
        selectedIndex={selectedIndex}
        renderItem={(file, isSelected) => (
          <SuggestionItem key={file} label={truncatePath(file, 48)} isSelected={isSelected} />
        )}
      />
    );
  }

  // Sub-dropdown for /model
  if (input.startsWith('/model ') && models && models.length > 0) {
    const query = input.slice(7).toLowerCase();
    const filtered = models.filter(m => fuzzyMatch(query, m));
    if (filtered.length === 0) return null;

    return (
      <SuggestionList
        items={filtered}
        selectedIndex={selectedIndex}
        renderItem={(model, isSelected) => (
          <SuggestionItem key={model} label={model} isSelected={isSelected} />
        )}
      />
    );
  }

  // Sub-dropdown for /resume and /delete
  if ((input.startsWith('/resume ') || input.startsWith('/delete ')) && sessions && sessions.length > 0) {
    const query = (input.split(' ')[1] || '').toLowerCase();
    const filtered = sessions.filter(s => {
      const title = (s.title || s.preview || s.id || '').toLowerCase();
      return fuzzyMatch(query, title);
    });
    if (filtered.length === 0) return null;

    return (
      <SuggestionList
        items={filtered}
        selectedIndex={selectedIndex}
        renderItem={(session, isSelected) => {
          const title = session.title || session.preview || session.id;
          const date = session.savedAt ? new Date(session.savedAt).toLocaleDateString() : '';
          return (
            <SuggestionItem
              key={session.id}
              label={title}
              description={`${session.messageCount} msgs  ${date}`}
              isSelected={isSelected}
            />
          );
        }}
      />
    );
  }

  // Sub-dropdown for /rewind and /branch
  if ((input.startsWith('/rewind ') || input.startsWith('/branch ')) && checkpoints && checkpoints.length > 0) {
    return (
      <SuggestionList
        items={checkpoints}
        selectedIndex={selectedIndex}
        renderItem={(cp, isSelected) => {
          const date = cp.createdAt ? new Date(cp.createdAt).toLocaleTimeString() : '';
          return (
            <SuggestionItem
              key={cp.index}
              label={`[${cp.index}] ${cp.label}`}
              description={`${cp.messageCount} msgs  ${date}`}
              isSelected={isSelected}
            />
          );
        }}
      />
    );
  }

  // Main command dropdown
  const filtered = COMMANDS.filter(c => fuzzyMatch(input, c.cmd));
  if (filtered.length === 0) return null;

  return (
    <SuggestionList
      items={filtered}
      selectedIndex={selectedIndex}
      renderItem={(item, isSelected) => (
        <SuggestionItem key={item.cmd} label={item.cmd} description={item.desc} isSelected={isSelected} />
      )}
    />
  );
};

export { COMMANDS };
