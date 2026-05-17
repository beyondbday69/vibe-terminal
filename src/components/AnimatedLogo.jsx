import React from 'react';
import { Box, Text } from 'ink';
import { LOGO_ROWS } from '../constants.js';

export const AnimatedLogo = () => {
  return (
    <Box flexDirection="column" marginRight={4}>
      {LOGO_ROWS.map((text, i) => (
        <Text key={i} color="#D77757">{text}</Text>
      ))}
    </Box>
  );
};
