import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import os from 'os';
import chalk from 'chalk';

export const WorkspaceSelector = ({
  workspaces,
  activeWorkspace,
  onSelect,
  onCreate,
  onDelete,
  onClose,
  termWidth,
  termHeight
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const [newPathInput, setNewPathInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const homeDir = os.homedir();
  const formatPath = (p) => {
    if (!p) return '';
    if (p.startsWith(homeDir)) {
      return '~' + p.slice(homeDir.length);
    }
    return p;
  };

  useInput((input, key) => {
    if (isAdding) {
      if (key.escape) {
        setIsAdding(false);
        setNewPathInput('');
        setErrorMessage('');
        return;
      }
      if (key.return) {
        if (!newPathInput.trim()) {
          setErrorMessage('Path cannot be empty');
          return;
        }
        onCreate(newPathInput.trim())
          .then(() => {
            setIsAdding(false);
            setNewPathInput('');
            setErrorMessage('');
          })
          .catch((err) => {
            setErrorMessage(err.message || 'Invalid directory path');
          });
        return;
      }
      if (key.delete || key.backspace) {
        setNewPathInput(prev => prev.slice(0, -1));
        setErrorMessage('');
        return;
      }
      // Only capture printable characters
      if (input && !key.meta && !key.ctrl && input >= ' ') {
        setNewPathInput(prev => prev + input);
        setErrorMessage('');
      }
      return;
    }

    // Normal navigation mode
    if (key.escape) {
      return onClose();
    }
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(workspaces.length - 1, prev + 1));
      return;
    }
    if (key.return) {
      if (workspaces.length > 0) {
        onSelect(workspaces[selectedIndex]);
      }
      return;
    }
    if (input === 'c' || input === 'C') {
      setIsAdding(true);
      setNewPathInput('');
      setErrorMessage('');
      return;
    }
    if (input === 'd' || input === 'D' || key.delete) {
      if (workspaces.length > 0) {
        const toDelete = workspaces[selectedIndex];
        onDelete(toDelete);
        setSelectedIndex(prev => Math.max(0, Math.min(prev, workspaces.length - 2)));
      }
      return;
    }
  });

  const panelWidth = Math.min(60, termWidth - 6);

  return (
    <Box
      width={termWidth}
      height={termHeight}
      alignItems="center"
      justifyContent="center"
    >
      <Box
        flexDirection="column"
        width={panelWidth}
        borderStyle="round"
        borderColor="#3a3a3a"
        paddingX={2}
        paddingY={1}
      >
        {/* Title */}
        <Box justifyContent="center" marginBottom={1}>
          <Text color="#D77757" bold>switch workspace</Text>
        </Box>

        <Box justifyContent="center">
          <Text color="#2a2a2a">{"─".repeat(panelWidth - 6)}</Text>
        </Box>

        {/* Workspaces list */}
        <Box flexDirection="column" marginY={1}>
          {workspaces.length === 0 ? (
            <Text color="#555555" italic>No saved workspaces. Press [c] to add one.</Text>
          ) : (
            workspaces.map((p, i) => {
              const active = i === selectedIndex;
              const isActiveWorkspace = p === activeWorkspace;
              const color = active ? '#D77757' : isActiveWorkspace ? '#98c99a' : '#888888';
              const prefix = active ? '▸ ' : '  ';
              const suffix = isActiveWorkspace ? ' (active)' : '';

              return (
                <Box key={p} marginBottom={0}>
                  <Box width={panelWidth - 20}>
                    <Text color={color} bold={active}>
                      {prefix}{formatPath(p)}
                    </Text>
                  </Box>
                  <Text color={isActiveWorkspace ? '#98c99a' : '#444444'}>
                    {suffix}
                  </Text>
                </Box>
              );
            })
          )}
        </Box>

        {/* Add path input */}
        {isAdding && (
          <Box flexDirection="column" borderStyle="single" borderColor="#D77757" paddingX={1} marginY={1}>
            <Box>
              <Text color="#D77757">Add workspace path: </Text>
              <Text color="white" bold>{newPathInput}</Text>
              <Text color="#D77757">█</Text>
            </Box>
            {errorMessage ? (
              <Box marginTop={0}>
                <Text color="#c97070">Error: {errorMessage}</Text>
              </Box>
            ) : null}
            <Box marginTop={0}>
              <Text color="#555555">Press [Enter] to validate/save, [Esc] to cancel</Text>
            </Box>
          </Box>
        )}

        <Box justifyContent="center">
          <Text color="#2a2a2a">{"─".repeat(panelWidth - 6)}</Text>
        </Box>

        {/* Footer shortcuts */}
        <Box justifyContent="center" marginTop={1}>
          <Text color="#555555">
            <Text color="#D77757" bold>[c]</Text> add  <Text color="#D77757" bold>[d]</Text> delete  <Text color="#D77757" bold>[enter]</Text> switch  <Text color="#D77757" bold>[esc]</Text> back
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
