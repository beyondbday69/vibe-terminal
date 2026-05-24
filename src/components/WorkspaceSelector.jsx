import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import os from 'os';
import chalk from 'chalk';

export const WorkspaceSelector = ({
  workspaces,
  availableWorkspaces = [],
  activeWorkspace,
  onSelect,
  onCreate,
  onDelete,
  onAddFavorite,
  onClose,
  termWidth,
  termHeight
}) => {
  const [activeTab, setActiveTab] = useState('favorites'); // 'favorites' or 'available'
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

  const activeList = activeTab === 'favorites' ? workspaces : availableWorkspaces;

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
    if (key.leftArrow) {
      setActiveTab('favorites');
      setSelectedIndex(0);
      return;
    }
    if (key.rightArrow) {
      setActiveTab('available');
      setSelectedIndex(0);
      return;
    }
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(activeList.length - 1, prev + 1));
      return;
    }
    if (key.return) {
      if (activeList.length > 0) {
        onSelect(activeList[selectedIndex]);
      }
      return;
    }
    
    // Shortcuts for Favorites tab
    if (activeTab === 'favorites') {
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
    }

    // Shortcuts for Available tab
    if (activeTab === 'available') {
      if (input === 'f' || input === 'F') {
        if (availableWorkspaces.length > 0) {
          onAddFavorite(availableWorkspaces[selectedIndex]);
        }
        return;
      }
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
        <Box justifyContent="center" marginBottom={0}>
          <Text color="#D77757" bold>switch workspace</Text>
        </Box>

        {/* Tabs */}
        <Box justifyContent="center" marginY={1}>
          <Box marginRight={2}>
            <Text
              color={activeTab === 'favorites' ? '#D77757' : '#555555'}
              bold={activeTab === 'favorites'}
            >
              {activeTab === 'favorites' ? '[favorites]' : ' favorites '}
            </Text>
          </Box>
          <Box>
            <Text
              color={activeTab === 'available' ? '#D77757' : '#555555'}
              bold={activeTab === 'available'}
            >
              {activeTab === 'available' ? '[available]' : ' available '}
            </Text>
          </Box>
        </Box>

        <Box justifyContent="center">
          <Text color="#2a2a2a">{"─".repeat(panelWidth - 6)}</Text>
        </Box>

        {/* Workspaces list */}
        <Box flexDirection="column" marginY={1}>
          {activeList.length === 0 ? (
            <Text color="#555555" italic>
              {activeTab === 'favorites' 
                ? 'No saved workspaces. Press [c] to add one.'
                : 'No neighbor workspaces discovered.'}
            </Text>
          ) : (
            activeList.map((p, i) => {
              const active = i === selectedIndex;
              const isActiveWorkspace = p === activeWorkspace;
              
              // Favorite highlight vs Discovered sibling colors
              const color = active 
                ? '#D77757' 
                : isActiveWorkspace 
                  ? '#98c99a' 
                  : activeTab === 'favorites' 
                    ? '#888888' 
                    : '#666666';

              const prefix = active ? '▸ ' : '  ';
              const suffix = isActiveWorkspace ? ' (active)' : '';

              // Check if already in favorites for the available tab
              const isAlreadyFavorite = activeTab === 'available' && workspaces.includes(p);
              const favStatus = isAlreadyFavorite ? ' ★' : '';

              return (
                <Box key={p} marginBottom={0}>
                  <Box width={panelWidth - 22}>
                    <Text color={color} bold={active}>
                      {prefix}{formatPath(p)}{favStatus}
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
        <Box justifyContent="center" marginTop={1} flexDirection="column" alignItems="center">
          <Box>
            {activeTab === 'favorites' ? (
              <Text color="#555555">
                <Text color="#D77757" bold>[c]</Text> add  <Text color="#D77757" bold>[d]</Text> delete  <Text color="#D77757" bold>[enter]</Text> switch  <Text color="#D77757" bold>[esc]</Text> back
              </Text>
            ) : (
              <Text color="#555555">
                <Text color="#D77757" bold>[f]</Text> fav  <Text color="#D77757" bold>[enter]</Text> switch  <Text color="#D77757" bold>[esc]</Text> back
              </Text>
            )}
          </Box>
          <Box marginTop={0}>
            <Text color="#444444">◄ / ► switch tabs</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
