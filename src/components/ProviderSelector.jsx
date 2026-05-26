import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export const ProviderSelector = ({ providers, activeProvider, onSelect, onAdd, onDelete, onClose, termWidth, termHeight }) => {
  const [flow, setFlow] = useState('select'); // 'select', 'add_name', 'add_base_url', 'add_models_url', 'add_api_key'
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = providers.findIndex(p => p.name === activeProvider.name);
    return idx >= 0 ? idx : 0;
  });

  // Wizard fields
  const [newName, setNewName] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [newModelsUrl, setNewModelsUrl] = useState('');
  const [newApiKey, setNewApiKey] = useState('');

  useInput((input, key) => {
    if (flow === 'select') {
      if (key.escape) return onClose();
      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex(prev => Math.min(providers.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        if (providers[selectedIndex]) {
          onSelect(providers[selectedIndex]);
        }
        return;
      }
      if (input === 'a' || input === 'A') {
        setFlow('add_name');
        setNewName('');
        return;
      }
      if (input === 'd' || input === 'D' || key.delete || key.backspace) {
        const selected = providers[selectedIndex];
        if (selected && selected.name !== 'opencode' && selected.name !== 'nvidia') {
          onDelete(selected.name);
          setSelectedIndex(0);
        }
        return;
      }
      return;
    }

    // Input Wizard navigation
    if (key.escape) {
      setFlow('select');
      return;
    }

    if (key.return) {
      if (flow === 'add_name') {
        if (!newName.trim()) return;
        setFlow('add_base_url');
        setNewBaseUrl('');
      } else if (flow === 'add_base_url') {
        if (!newBaseUrl.trim()) return;
        setFlow('add_models_url');
        setNewModelsUrl('');
      } else if (flow === 'add_models_url') {
        setFlow('add_api_key');
        setNewApiKey('');
      } else if (flow === 'add_api_key') {
        onAdd({
          name: newName.trim(),
          baseUrl: newBaseUrl.trim(),
          modelsUrl: newModelsUrl.trim() || `${newBaseUrl.trim()}/models`,
          apiKey: newApiKey.trim(),
        });
        setFlow('select');
      }
      return;
    }

    if (key.backspace || key.delete) {
      if (flow === 'add_name') setNewName(prev => prev.slice(0, -1));
      if (flow === 'add_base_url') setNewBaseUrl(prev => prev.slice(0, -1));
      if (flow === 'add_models_url') setNewModelsUrl(prev => prev.slice(0, -1));
      if (flow === 'add_api_key') setNewApiKey(prev => prev.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta && !key.upArrow && !key.downArrow) {
      if (flow === 'add_name') setNewName(prev => prev + input);
      if (flow === 'add_base_url') setNewBaseUrl(prev => prev + input);
      if (flow === 'add_models_url') setNewModelsUrl(prev => prev + input);
      if (flow === 'add_api_key') setNewApiKey(prev => prev + input);
    }
  });

  const panelWidth = Math.min(50, termWidth - 6);

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
        {flow === 'select' ? (
          <>
            {/* Title */}
            <Box justifyContent="center" marginBottom={1}>
              <Text color="#D77757" bold>select provider</Text>
            </Box>

            <Box justifyContent="center">
              <Text color="#2a2a2a">{"─".repeat(panelWidth - 6)}</Text>
            </Box>

            {/* Providers */}
            <Box flexDirection="column" marginY={1}>
              {providers.map((p, i) => {
                const isSelected = i === selectedIndex;
                const isActive = p.name === activeProvider.name;
                const isBuiltin = p.name === 'opencode' || p.name === 'nvidia';
                
                const activeColor = isActive ? '#0ea5e9' : '#d4d4d4';
                
                return (
                  <Box key={p.name} marginBottom={0}>
                    <Text color={isSelected ? '#D77757' : '#555555'}>
                      {isSelected ? '▸ ' : '  '}
                    </Text>
                    <Text color={isSelected ? '#D77757' : activeColor} bold={isSelected}>
                      {p.name}
                    </Text>
                    {isActive && <Text color="#3ECF8E"> [active]</Text>}
                    <Box flexGrow={1} />
                    <Text color="#555555">{isBuiltin ? '[system]' : '[custom]'}</Text>
                  </Box>
                );
              })}
            </Box>

            <Box justifyContent="center">
              <Text color="#2a2a2a">{"─".repeat(panelWidth - 6)}</Text>
            </Box>

            {/* Footer */}
            <Box justifyContent="center" marginTop={1}>
              <Text color="#555555">
                <Text color="#D77757" bold>[a]</Text> add  <Text color="#D77757" bold>[d]</Text> delete  <Text color="#555555" bold>[esc]</Text> back
              </Text>
            </Box>
          </>
        ) : (
          <>
            {/* Wizard Title */}
            <Box justifyContent="center" marginBottom={1}>
              <Text color="#D77757" bold>add provider</Text>
            </Box>
            
            <Box justifyContent="center">
              <Text color="#2a2a2a">{"─".repeat(panelWidth - 6)}</Text>
            </Box>

            <Box flexDirection="column" marginY={1}>
              {/* Step 1: Name */}
              <Box>
                <Text color={flow === 'add_name' ? 'white' : '#737373'}>name: </Text>
                {flow === 'add_name' ? (
                  <Text bold color="#FBBF24">{newName}<Text color="#525252">_</Text></Text>
                ) : (
                  <Text color="#3ECF8E">{newName}</Text>
                )}
              </Box>

              {/* Step 2: Base URL */}
              {(flow !== 'add_name') && (
                <Box>
                  <Text color={flow === 'add_base_url' ? 'white' : '#737373'}>base url: </Text>
                  {flow === 'add_base_url' ? (
                    <Text bold color="#FBBF24">{newBaseUrl}<Text color="#525252">_</Text></Text>
                  ) : (
                    <Text color="#3ECF8E">{newBaseUrl}</Text>
                  )}
                </Box>
              )}

              {/* Step 3: Models URL */}
              {(flow === 'add_models_url' || flow === 'add_api_key') && (
                <Box>
                  <Text color={flow === 'add_models_url' ? 'white' : '#737373'}>models url: </Text>
                  {flow === 'add_models_url' ? (
                    <Text bold color="#FBBF24">{newModelsUrl}<Text color="#525252">_</Text></Text>
                  ) : (
                    <Text color="#3ECF8E">{newModelsUrl || '(default: baseUrl/models)'}</Text>
                  )}
                </Box>
              )}

              {/* Step 4: API Key */}
              {(flow === 'add_api_key') && (
                <Box>
                  <Text color="white">api key: </Text>
                  <Text bold color="#FBBF24">{'*'.repeat(newApiKey.length)}<Text color="#525252">_</Text></Text>
                </Box>
              )}
            </Box>
            
            <Box justifyContent="center">
              <Text color="#2a2a2a">{"─".repeat(panelWidth - 6)}</Text>
            </Box>

            {/* Footer */}
            <Box justifyContent="center" marginTop={1}>
              <Text color="#555555">
                <Text color="#D77757" bold>[enter]</Text> next  <Text color="#555555" bold>[esc]</Text> cancel
              </Text>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};
