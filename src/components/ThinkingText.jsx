import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const LOADING_TEXTS = [
  'Thinking',
  'Building',
  'Cooking',
  'Crafting',
  'Working',
  'Processing',
  'Generating',
  'Analyzing',
  'Composing',
  'Computing',
];

const THINK_COLORS = ['#D77757', '#E8A08A', '#F0C0B0', '#FFFFFF'];

export const ThinkingText = () => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 100);
    return () => clearInterval(timer);
  }, []);

  const spinner = SPINNER[tick % SPINNER.length];
  const textIndex = Math.floor(tick / 15) % LOADING_TEXTS.length;
  const text = LOADING_TEXTS[textIndex] + '...';

  return (
    <Text>
      <Text color="#D77757">{spinner}</Text>
      <Text> </Text>
      {text.split('').map((char, i) => {
        const colorIndex = (tick + i) % THINK_COLORS.length;
        return <Text key={i} color={THINK_COLORS[colorIndex]}>{char}</Text>;
      })}
    </Text>
  );
};
