import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { LOGO_ROWS, TEAM_PRESETS, ROLE_COLORS } from '../constants.js';

// Two modes: 'team' picks a team preset, 'role' edits model per role
export const TeamSelector = ({ activeTeam, availableModels, onSelect, onClose, termWidth, termHeight }) => {
  const teams = ['solo', ...Object.keys(TEAM_PRESETS)];
  const [mode, setMode] = useState('team'); // 'team' or 'role'
  const [teamIndex, setTeamIndex] = useState(() => {
    const idx = teams.indexOf(activeTeam);
    return idx >= 0 ? idx : 0;
  });
  const [roleIndex, setRoleIndex] = useState(0);
  const [roleModels, setRoleModels] = useState({}); // { role: model }
  const [modelSearching, setModelSearching] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [modelIndex, setModelIndex] = useState(0);

  const selectedTeamName = teams[teamIndex];
  const selectedTeamPreset = TEAM_PRESETS[selectedTeamName] || [];

  const models = availableModels && availableModels.length > 0
    ? availableModels
    : ['kimi-k2.6', 'gpt-5.5', 'gpt-4o', 'claude-3-5-sonnet', 'gemini-2.0-flash'];

  const filteredModels = modelSearch
    ? models.filter(m => m.toLowerCase().includes(modelSearch.toLowerCase()))
    : models;

  useInput((input, key) => {
    if (key.escape) {
      if (modelSearching) {
        setModelSearching(false);
        setModelSearch('');
        return;
      }
      if (mode === 'role') {
        setMode('team');
        return;
      }
      return onClose();
    }

    if (modelSearching) {
      if (key.backspace || key.delete) {
        setModelSearch(prev => prev.slice(0, -1));
        setModelIndex(0);
        return;
      }
      if (key.upArrow) {
        setModelIndex(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setModelIndex(prev => Math.min(filteredModels.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        if (filteredModels.length > 0) {
          const role = selectedTeamPreset[roleIndex].role;
          setRoleModels(prev => ({ ...prev, [role]: filteredModels[modelIndex] }));
        }
        setModelSearching(false);
        setModelSearch('');
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setModelSearch(prev => prev + input);
        setModelIndex(0);
      }
      return;
    }

    if (mode === 'team') {
      if (key.upArrow) {
        setTeamIndex(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setTeamIndex(prev => Math.min(teams.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        if (selectedTeamName === 'solo') {
          onSelect(selectedTeamName, {});
          return;
        }
        // Enter role editing mode
        setMode('role');
        setRoleIndex(0);
        return;
      }
    }

    if (mode === 'role') {
      if (key.upArrow) {
        setRoleIndex(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setRoleIndex(prev => Math.min(selectedTeamPreset.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        // Open model search for this role
        setModelSearching(true);
        setModelSearch('');
        setModelIndex(0);
        return;
      }
      if (input === 'c' || input === 'C') {
        // Confirm team with current model selections
        onSelect(selectedTeamName, roleModels);
        return;
      }
    }
  });

  const overlayWidth = Math.min(70, termWidth - 8);
  const paddingTop = Math.floor((termHeight - 20) / 2);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight} paddingTop={Math.max(1, paddingTop)} alignItems="center">
      {LOGO_ROWS.map((row, i) => (
        <Text key={i} color="#D77757">{row}</Text>
      ))}
      <Text bold color="white">{' '}</Text>

      {mode === 'team' && (
        <Box flexDirection="column" width={overlayWidth} paddingX={2}>
          <Box marginBottom={1}>
            <Text color="#888888">select team  </Text>
            <Text color="#444444">ESC close  ENTER select</Text>
          </Box>
          <Text color="#2a2a2a">{"─".repeat(overlayWidth - 4)}</Text>
          <Box flexDirection="column" marginTop={1}>
            {teams.map((team, i) => {
              const isSelected = i === teamIndex;
              const isActive = team === activeTeam;
              return (
                <Box key={team}>
                  <Text color={isSelected ? '#f0f0f0' : '#888888'} bold={isSelected}>
                    {isSelected ? '> ' : '  '}{team.padEnd(15)}
                  </Text>
                  {isActive && <Text color="#98c99a"> active</Text>}
                  {!isActive && selectedTeamPreset && i > 0 && TEAM_PRESETS[team] && (
                    <Text color="#444444"> {TEAM_PRESETS[team].length} roles</Text>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {mode === 'role' && !modelSearching && (
        <Box flexDirection="column" width={overlayWidth} paddingX={2}>
          <Box marginBottom={1}>
            <Text color="#888888">{selectedTeamName}  </Text>
            <Text color="#444444">ENTER change model  C confirm  ESC back</Text>
          </Box>
          <Text color="#2a2a2a">{"─".repeat(overlayWidth - 4)}</Text>
          <Box flexDirection="column" marginTop={1}>
            {selectedTeamPreset.map((r, i) => {
              const isSelected = i === roleIndex;
              const roleColor = ROLE_COLORS[r.role] || '#888888';
              const currentModel = roleModels[r.role] || r.model;
              return (
                <Box key={r.role}>
                  <Text color={isSelected ? '#f0f0f0' : roleColor} bold={isSelected}>
                    {isSelected ? '> ' : '  '}{r.role.padEnd(15)}
                  </Text>
                  <Text color="#d4a574">{currentModel}</Text>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {modelSearching && (
        <Box flexDirection="column" width={overlayWidth} paddingX={2}>
          <Box marginBottom={1}>
            <Text color="#888888">model for {selectedTeamPreset[roleIndex].role}  </Text>
            <Text color="#444444">ESC cancel  ENTER select</Text>
          </Box>
          <Box>
            <Text color="#888888">search: </Text>
            <Text color="#d4a574">{modelSearch}</Text>
            <Text color="#444444">_</Text>
          </Box>
          <Text color="#2a2a2a">{"─".repeat(overlayWidth - 4)}</Text>
          <Box flexDirection="column" marginTop={1}>
            {filteredModels.length === 0 ? (
              <Text color="#c97070">no match</Text>
            ) : (
              filteredModels.slice(0, 8).map((m, i) => {
                const isSelected = i === modelIndex;
                return (
                  <Box key={m}>
                    <Text color={isSelected ? '#f0f0f0' : '#888888'} bold={isSelected}>
                      {isSelected ? '> ' : '  '}{m}
                    </Text>
                  </Box>
                );
              })
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};
