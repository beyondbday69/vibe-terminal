import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { COLORS, LOGO_ROWS } from '../constants.js';

export const AnimatedLogo = () => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const maxSteps = LOGO_ROWS.length + 1;
    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= maxSteps - 1) {
          clearInterval(timer);
          return maxSteps;
        }
        return prev + 1;
      });
    }, 150);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box flexDirection="column" marginRight={4}>
      {LOGO_ROWS.map((text, i) => {
        if (i === currentStep) {
          return <Text key={i} bold color="white">{text}</Text>;
        } else if (i < currentStep) {
          return <Text key={i} color={COLORS[i] || 'white'}>{text}</Text>;
        } else {
          return <Text key={i}>{" ".repeat(text.length)}</Text>;
        }
      })}
    </Box>
  );
};
