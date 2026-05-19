import React from 'react';
import { Box, Text } from 'ink';
import { ThinkingText } from './ThinkingText.jsx';
import { COLORS } from '../constants.js';

const SLASH_COMMANDS = ['/help', '/model', '/apikey', '/provider', '/rewind', '/branch', '/clear', '/init', '/resume', '/delete', '/exit'];

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
  const displayText = isMultiLine && inputLines.length > 10
    ? inputLines[0]
    : input;
  const badge = isMultiLine && inputLines.length > 10
    ? `Pasted ${inputLines.length}+ lines`
    : null;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#555555" backgroundColor="#222222" paddingX={1} paddingY={0}>
      {isLoading ? (
        <ThinkingText />
      ) : (
        <Box>
          <Text color={COLORS.primary}>{'> '}</Text>
          <Text color="white">{displayText}</Text>
          {badge && <Text color="#D77757">  [{badge}]</Text>}
          {!badge && ghostText && <Text color="#666666">{ghostText}</Text>}
          {!isMultiLine && <Text color="#666666">{'_'}</Text>}
        </Box>
      )}
    </Box>
  );
};
