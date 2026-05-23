import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';

const TOOL_INFO = {
  run_bash: { label: 'Execute Command', icon: '$', color: '#FBBF24' },
  write_file: { label: 'Create / Overwrite File', icon: '+', color: '#3ECF8E' },
  edit_file: { label: 'Edit File', icon: '~', color: '#60A5FA' },
};

export const ToolConfirmation = ({ name, args, termWidth, selectedIndex = 0 }) => {
  const filepath = args.file_path || '';
  const command = args.command || '';
  const content = args.content || '';
  const diff = args.diff || '';

  const boxWidth = Math.min(termWidth - 6, 80);
  const innerWidth = boxWidth - 6;

  const info = TOOL_INFO[name] || { label: name, icon: '?', color: '#FBBF24' };

  let previewLines = [];
  if (name === 'run_bash') {
    previewLines = command.split('\n').slice(0, 6);
    if (command.split('\n').length > 6) previewLines.push('...');
  } else if (name === 'write_file') {
    const lines = content.split('\n');
    previewLines = lines.slice(0, 8);
    if (lines.length > 8) previewLines.push(`... (+${lines.length - 8} more lines)`);
  } else if (name === 'edit_file') {
    const lines = diff.split('\n');
    previewLines = lines.slice(0, 10);
    if (lines.length > 10) previewLines.push(`... (+${lines.length - 10} more lines)`);
  }

  const divider = chalk.hex('#525252')('─'.repeat(innerWidth));

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={info.color} paddingX={2} paddingY={1} width={boxWidth}>
      {/* Header */}
      <Box>
        <Text bold color={info.color}>[{info.icon}] {info.label}</Text>
      </Box>

      <Text>{divider}</Text>

      {/* File path */}
      {filepath ? (
        <Box>
          <Text color="#a3a3a3">  Path: </Text>
          <Text color="white" bold>{filepath}</Text>
        </Box>
      ) : null}

      {/* Command preview for bash */}
      {name === 'run_bash' && command ? (
        <Box>
          <Text color="#a3a3a3">  Cmd:  </Text>
          <Text color="#FBBF24" bold>{command.length > innerWidth - 8 ? command.slice(0, innerWidth - 11) + '...' : command}</Text>
        </Box>
      ) : null}

      {/* Content preview */}
      {previewLines.length > 0 && (name !== 'run_bash' || previewLines.length > 1) ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="#666666">  Preview:</Text>
          <Box flexDirection="column" borderStyle="single" borderColor="#525252" paddingX={1} marginLeft={2} marginRight={2}>
            {previewLines.map((line, i) => {
              let color = '#e5e5e5';
              if (name === 'edit_file') {
                if (line.startsWith('<<<')) color = '#60A5FA';
                else if (line.startsWith('>>>')) color = '#3ECF8E';
                else if (line.startsWith('===')) color = '#FBBF24';
              }
              return <Text key={i} color={color}>{line.length > innerWidth - 6 ? line.slice(0, innerWidth - 9) + '...' : line}</Text>;
            })}
          </Box>
        </Box>
      ) : null}

      <Text>{divider}</Text>

      {/* Action buttons */}
      <Box flexDirection="column" marginTop={0} paddingLeft={2}>
        <Text color={selectedIndex === 0 ? '#3ECF8E' : '#a3a3a3'} bold={selectedIndex === 0}>
          {selectedIndex === 0 ? '❯ ' : '  '}Approve (Enter / Y)
        </Text>
        <Text color={selectedIndex === 1 ? '#EF4444' : '#a3a3a3'} bold={selectedIndex === 1}>
          {selectedIndex === 1 ? '❯ ' : '  '}Reject (Esc / N)
        </Text>
      </Box>
    </Box>
  );
};
