import React from 'react';
import { Box, Text } from 'ink';
import { ThinkingText } from './ThinkingText.jsx';
import { COLORS } from '../constants.js';

const SLASH_COMMANDS = ['/help', '/model', '/apikey', '/provider', '/rewind', '/branch', '/clear', '/init', '/resume', '/delete', '/exit', '/mcp'];

export const AnimatedInputBox = ({ isLoading, input, selectedFile }) => {

  // Ghost text autocomplete
  let ghostText = '';
  if (!input) {
    ghostText = 'Ask anything';
  } else if (input.startsWith('/')) {
    const match = SLASH_COMMANDS.find(cmd => cmd.startsWith(input) && cmd !== input);
    if (match) ghostText = match.slice(input.length);
  } else if (input.includes('@') && selectedFile) {
    const lastAt = input.lastIndexOf('@');
    const query = input.slice(lastAt + 1);
    if (selectedFile.startsWith(query) && selectedFile !== query) {
      ghostText = selectedFile.slice(query.length);
    }
  }

  const inputLines = input.split('\n');
  const isMultiLine = inputLines.length > 1;
  const hasTooManyLines = inputLines.length > 5;
  const displayText = hasTooManyLines
    ? `pasted ${inputLines.length} lines`
    : input;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#555555" backgroundColor="#222222" paddingX={1} paddingY={0}>
      {isLoading ? (
        <ThinkingText />
      ) : (
        <Box>
          <Text color={COLORS[0]}>{'> '}</Text>
          <Text color="white">{displayText}</Text>
          {!hasTooManyLines && ghostText && <Text color="#666666">{ghostText}</Text>}
          {!isMultiLine && <Text color="#666666">{'_'}</Text>}
        </Box>
      )}
    </Box>
  );
};
