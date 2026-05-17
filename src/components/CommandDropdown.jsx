import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';

const COMMANDS = [
  { cmd: '/help', desc: 'Show help' },
  { cmd: '/model', desc: 'Select model' },
  { cmd: '/apikey', desc: 'Set API key' },
  { cmd: '/provider', desc: 'Switch API provider' },
  { cmd: '/clear', desc: 'Clear chat' },
  { cmd: '/init', desc: 'Analyze codebase, create CLAUDE.md' },
  { cmd: '/resume', desc: 'Resume session' },
  { cmd: '/delete', desc: 'Delete session' },
  { cmd: '/exit', desc: 'Exit app' },
];

const VISIBLE_ITEMS = 6;

export const CommandDropdown = ({ input, selectedIndex, onSelect, models, sessions, files }) => {
  // File mention dropdown @
  if (input.includes('@') && files && files.length > 0) {
    const lastAt = input.lastIndexOf('@');
    const query = input.slice(lastAt + 1).toLowerCase();
    const filtered = files.filter(f => f.toLowerCase().includes(query));
    const scrollOffset = Math.max(0, Math.min(selectedIndex - VISIBLE_ITEMS + 2, filtered.length - VISIBLE_ITEMS));
    const visible = filtered.slice(scrollOffset, scrollOffset + VISIBLE_ITEMS);

    return (
      <Box flexDirection="column" backgroundColor="#1a1a1a" borderStyle="single" borderColor="#444444" paddingX={1}>
        <Box marginBottom={0}>
          <Text color="#525252">Files ({filtered.length})</Text>
        </Box>
        {visible.map((file, i) => {
          const realIndex = scrollOffset + i;
          const isSelected = realIndex === selectedIndex;
          return (
            <Box key={file}>
              <Text>
                {isSelected ? chalk.hex('#D77757')('>') : ' '}
                {' '}
                <Text color={isSelected ? '#D77757' : '#d4d4d4'}>{file}</Text>
              </Text>
            </Box>
          );
        })}
        {filtered.length > VISIBLE_ITEMS && (
          <Text color="#525252">  {selectedIndex + 1}/{filtered.length}</Text>
        )}
      </Box>
    );
  }

  // Sub-dropdown for /model
  if (input.startsWith('/model ') && models && models.length > 0) {
    const query = input.slice(7).toLowerCase();
    const filtered = models.filter(m => m.toLowerCase().includes(query));
    const scrollOffset = Math.max(0, Math.min(selectedIndex - VISIBLE_ITEMS + 2, filtered.length - VISIBLE_ITEMS));
    const visible = filtered.slice(scrollOffset, scrollOffset + VISIBLE_ITEMS);

    return (
      <Box flexDirection="column" backgroundColor="#1a1a1a" borderStyle="single" borderColor="#444444" paddingX={1}>
        <Box marginBottom={0}>
          <Text color="#525252">Models ({filtered.length})</Text>
        </Box>
        {visible.map((model, i) => {
          const realIndex = scrollOffset + i;
          const isSelected = realIndex === selectedIndex;
          return (
            <Box key={model}>
              <Text>
                {isSelected ? chalk.hex('#D77757')('>') : ' '}
                {' '}
                <Text color={isSelected ? '#D77757' : '#d4d4d4'}>{model}</Text>
              </Text>
            </Box>
          );
        })}
        {filtered.length > VISIBLE_ITEMS && (
          <Text color="#525252">  {selectedIndex + 1}/{filtered.length}</Text>
        )}
      </Box>
    );
  }

  // Sub-dropdown for /resume and /delete
  if ((input.startsWith('/resume ') || input.startsWith('/delete ')) && sessions && sessions.length > 0) {
    const query = input.split(' ')[1]?.toLowerCase() || '';
    const filtered = sessions.filter(s => {
      const title = (s.title || s.preview || s.id || '').toLowerCase();
      return title.includes(query);
    });
    const scrollOffset = Math.max(0, Math.min(selectedIndex - VISIBLE_ITEMS + 2, filtered.length - VISIBLE_ITEMS));
    const visible = filtered.slice(scrollOffset, scrollOffset + VISIBLE_ITEMS);

    return (
      <Box flexDirection="column" backgroundColor="#1a1a1a" borderStyle="single" borderColor="#444444" paddingX={1}>
        <Box marginBottom={0}>
          <Text color="#525252">Sessions ({filtered.length})</Text>
        </Box>
        {visible.map((session, i) => {
          const realIndex = scrollOffset + i;
          const isSelected = realIndex === selectedIndex;
          const title = session.title || session.preview || session.id;
          const date = session.savedAt ? new Date(session.savedAt).toLocaleDateString() : '';
          return (
            <Box key={session.id}>
              <Text>
                {isSelected ? chalk.hex('#D77757')('>') : ' '}
                {' '}
                <Text color={isSelected ? '#D77757' : '#d4d4d4'}>{title}</Text>
                <Text color="#525252">  {session.messageCount} msgs  {date}</Text>
              </Text>
            </Box>
          );
        })}
        {filtered.length > VISIBLE_ITEMS && (
          <Text color="#525252">  {selectedIndex + 1}/{filtered.length}</Text>
        )}
      </Box>
    );
  }

  // Main command dropdown
  const filtered = COMMANDS.filter(c => c.cmd.startsWith(input.toLowerCase()));
  if (filtered.length === 0) return null;

  return (
    <Box flexDirection="column" backgroundColor="#1a1a1a" borderStyle="single" borderColor="#444444" paddingX={1}>
      {filtered.map((item, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Box key={item.cmd}>
            <Text>
              {isSelected ? chalk.hex('#D77757')('>') : ' '}
              {' '}
              <Text bold color={isSelected ? '#D77757' : '#d4d4d4'}>{item.cmd}</Text>
              <Text color="#666666">  {item.desc}</Text>
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

export { COMMANDS };
