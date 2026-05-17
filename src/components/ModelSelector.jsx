import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { LOGO_ROWS } from '../constants.js';

export const ModelSelector = ({ models, activeModel, onSelect, onClose, termWidth, termHeight }) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredModels = useMemo(() => {
    if (!searchQuery) return models;
    const lowerQuery = searchQuery.toLowerCase();
    return models.filter(m => m.toLowerCase().includes(lowerQuery));
  }, [models, searchQuery]);

  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = filteredModels.indexOf(activeModel);
    return idx >= 0 ? idx : 0;
  });

  const VISIBLE_COUNT = Math.min(12, Math.max(1, filteredModels.length));
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
  }, [searchQuery]);

  useInput((input, key) => {
    if (key.escape) return onClose();
    if (key.upArrow) {
      setSelectedIndex(prev => {
        const next = Math.max(0, prev - 1);
        if (next < scrollOffset) setScrollOffset(next);
        return next;
      });
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(prev => {
        const next = Math.min(filteredModels.length - 1, prev + 1);
        if (next >= scrollOffset + VISIBLE_COUNT) setScrollOffset(next - VISIBLE_COUNT + 1);
        return next;
      });
      return;
    }
    if (key.return) {
      if (filteredModels.length > 0) {
        onSelect(filteredModels[selectedIndex]);
      }
      return;
    }
    if (key.backspace || key.delete) {
      setSearchQuery(prev => prev.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta && !key.upArrow && !key.downArrow) {
      setSearchQuery(prev => prev + input);
    }
  });

  const overlayWidth = Math.min(60, termWidth - 8);
  const paddingTop = Math.floor((termHeight - VISIBLE_COUNT - 10) / 2);
  const visibleModels = filteredModels.slice(scrollOffset, scrollOffset + VISIBLE_COUNT);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight} paddingTop={Math.max(1, paddingTop - 3)} alignItems="center">
      {LOGO_ROWS.map((row, i) => (
        <Text key={i} color="#D77757">{row}</Text>
      ))}
      <Text bold color="white" marginBottom={1}>Vibe Code</Text>
      <Box flexDirection="column" width={overlayWidth} borderStyle="double" borderColor="#D77757" paddingX={2} paddingY={1}>
        <Box justifyContent="space-between" marginBottom={1}>
          <Text bold color="#D77757">Select Model</Text>
          <Text color="#737373">ESC: cancel • ENTER: confirm</Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="#a3a3a3">Search:  </Text>
            <Text bold color="#facc15">{searchQuery}</Text>
            <Text color="#525252">_</Text>
          </Box>
          <Box>
            <Text color="#a3a3a3">Current: </Text>
            <Text bold color="#0ea5e9">{activeModel}</Text>
          </Box>
        </Box>
        <Text color="#333333">{"─".repeat(overlayWidth - 8)}</Text>
        <Box flexDirection="column" marginTop={1}>
          {filteredModels.length === 0 ? (
            <Box paddingX={1}>
              <Text color="#ef4444">No models match "{searchQuery}"</Text>
            </Box>
          ) : (
            visibleModels.map((model, i) => {
              const realIndex = i + scrollOffset;
              const isSelected = realIndex === selectedIndex;
              const isActive = model === activeModel;
              return (
                <Box key={model} paddingX={1}>
                  <Text bold={isSelected} color={isSelected ? '#D77757' : isActive ? '#0ea5e9' : '#d4d4d4'}>
                    {isSelected ? '> ' : '  '}
                    {model}
                    {isActive && <Text color="#22c55e">  [active]</Text>}
                  </Text>
                </Box>
              );
            })
          )}
        </Box>
        {filteredModels.length > VISIBLE_COUNT && (
          <Box marginTop={1} justifyContent="center">
            <Text color="#525252" dimColor>
              {scrollOffset + 1}–{Math.min(scrollOffset + VISIBLE_COUNT, filteredModels.length)} of {filteredModels.length} models ↑↓ scroll
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
