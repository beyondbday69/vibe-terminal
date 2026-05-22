import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';

export const ToolConfirmation = ({ name, args, termWidth }) => {
  const filepath = args.file_path || '';
  const command = args.command || '';
  const content = args.content || '';
  const diff = args.diff || '';

  const boxWidth = Math.min(termWidth - 8, 80);

  let previewText = '';
  if (name === 'run_bash') {
    previewText = command;
  } else if (name === 'write_file') {
    const lines = content.split('\n');
    previewText = lines.slice(0, 8).join('\n') + (lines.length > 8 ? '\n...' : '');
  } else if (name === 'edit_file') {
    const lines = diff.split('\n');
    previewText = lines.slice(0, 10).join('\n') + (lines.length > 10 ? '\n...' : '');
  }

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="#FBBF24" paddingX={2} paddingY={1} width={boxWidth}>
      <Box marginBottom={1}>
        <Text bold color="#FBBF24">⚠️  Confirm Action: {name}</Text>
      </Box>

      {filepath ? (
        <Box marginBottom={1}>
          <Text color="#a3a3a3">File: </Text>
          <Text color="white" bold>{filepath}</Text>
        </Box>
      ) : null}

      {previewText ? (
        <Box flexDirection="column" borderStyle="single" borderColor="#525252" paddingX={1} paddingY={0} marginBottom={1}>
          <Text color="#e5e5e5">{previewText}</Text>
        </Box>
      ) : null}

      <Box>
        <Text bold>Approve execution? </Text>
        <Text color="#3ECF8E" bold>[Y]es (Enter)</Text>
        <Text> / </Text>
        <Text color="#EF4444" bold>[N]o (Esc)</Text>
      </Box>
    </Box>
  );
};
