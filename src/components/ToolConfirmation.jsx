import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';

const TOOL_INFO = {
  run_bash: { label: 'run', icon: '$', color: '#d4a574' },
  write_file: { label: 'write', icon: '+', color: '#98c99a' },
  edit_file: { label: 'edit', icon: '~', color: '#7eb8f7' },
};

export const ToolConfirmation = ({ name, args, termWidth, selectedIndex = 0 }) => {
  const filepath = args.file_path || '';
  const command = args.command || '';

  const info = TOOL_INFO[name] || { label: name, icon: '?', color: '#d4a574' };

  // For bash: show the command inline
  // For edit/write: show just the path
  let detail = '';
  if (name === 'run_bash') {
    detail = command.length > 60 ? command.slice(0, 57) + '...' : command;
  } else if (filepath) {
    const short = filepath.length > 50 ? '...' + filepath.slice(-47) : filepath;
    detail = short;
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={info.color}>{info.label}</Text>
        <Text color="#888888"> {detail}</Text>
      </Box>
      <Box>
        <Text color="#888888">apply?  </Text>
        <Text bold={selectedIndex === 0} color={selectedIndex === 0 ? '#98c99a' : '#888888'}>y  </Text>
        <Text bold={selectedIndex === 1} color={selectedIndex === 1 ? '#c97070' : '#888888'}>n  </Text>
        <Text color="#444444">e(edit)</Text>
      </Box>
    </Box>
  );
};
