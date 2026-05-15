import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ThinkingText } from './ThinkingText.jsx';
import { COLORS } from '../constants.js';

const SLASH_COMMANDS = ['/help', '/model', '/clear'];

export const AnimatedInputBox = ({ isLoading, input, setInput, handleSubmit, actualScroll }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    let timer;
    if (isLoading) {
      timer = setInterval(() => setTick(t => t + 1), 150);
    }
    return () => clearInterval(timer);
  }, [isLoading]);

  // Ghost text autocomplete for slash commands
  let ghostText = '';
  if (!input) {
    ghostText = 'Ask anything...';
  } else if (input.startsWith('/')) {
    const match = SLASH_COMMANDS.find(cmd => cmd.startsWith(input) && cmd !== input);
    if (match) ghostText = match.slice(input.length);
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#555555" backgroundColor="#222222" paddingX={1} paddingY={0}>
      {isLoading ? (
        <ThinkingText />
      ) : (
        <Box>
          <Text color={COLORS.primary}>{'> '}</Text>
          <Text color="white">{input}</Text>
          {ghostText && <Text color="#666666">{ghostText}</Text>}
          <Text color="#666666">{'_'}</Text>
        </Box>
      )}
    </Box>
  );
};
