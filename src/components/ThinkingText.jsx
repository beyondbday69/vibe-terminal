import React from 'react';
import { Text } from 'ink';
import { COLORS } from '../constants.js';

export const ThinkingText = () => {
  const text = "Thinking...";
  return (
    <Text>
      {text.split('').map((char, i) => {
        const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
        return <Text key={i} color={randomColor}>{char}</Text>;
      })}
    </Text>
  );
};
