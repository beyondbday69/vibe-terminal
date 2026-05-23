import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { LOGO_ROWS, TEAM_PRESETS } from '../constants.js';

export const TeamSelector = ({ activeTeam, onSelect, onClose, termWidth, termHeight }) => {
  const teams = ['solo', ...Object.keys(TEAM_PRESETS)];
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = teams.indexOf(activeTeam);
    return idx >= 0 ? idx : 0;
  });

  useInput((input, key) => {
    if (key.escape) return onClose();
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(teams.length - 1, prev + 1));
      return;
    }
    if (key.return) {
      onSelect(teams[selectedIndex]);
      return;
    }
  });

  const overlayWidth = Math.min(70, termWidth - 8);
  const paddingTop = Math.floor((termHeight - teams.length - 15) / 2);

  const selectedTeamName = teams[selectedIndex];
  const selectedTeamPreset = TEAM_PRESETS[selectedTeamName];

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight} paddingTop={Math.max(1, paddingTop - 3)} alignItems="center">
      {LOGO_ROWS.map((row, i) => (
        <Text key={i} color="#D77757">{row}</Text>
      ))}
      <Text bold color="white" marginBottom={1}>Vibe Code</Text>
      <Box flexDirection="column" width={overlayWidth} borderStyle="double" borderColor="#D77757" paddingX={2} paddingY={1}>
        <Box justifyContent="space-between" marginBottom={1}>
          <Text bold color="#D77757">Select Team Preset</Text>
          <Text color="#737373">ESC: cancel • ENTER: confirm</Text>
        </Box>
        
        <Text color="#333333">{"─".repeat(overlayWidth - 8)}</Text>
        
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          {teams.map((team, i) => {
            const isSelected = i === selectedIndex;
            const isActive = team === activeTeam;
            return (
              <Box key={team} paddingX={1}>
                <Text bold={isSelected} color={isSelected ? '#D77757' : isActive ? '#0ea5e9' : '#d4d4d4'}>
                  {isSelected ? '> ' : '  '}
                  {team.padEnd(15)}
                </Text>
                {isActive && <Text color="#3ECF8E"> [active]</Text>}
              </Box>
            );
          })}
        </Box>

        <Text color="#333333">{"─".repeat(overlayWidth - 8)}</Text>
        
        <Box flexDirection="column" marginTop={1} height={6}>
          {selectedTeamName === 'solo' ? (
            <Text color="#a3a3a3">Work independently. No sub-agents will be spawned automatically.</Text>
          ) : (
            <Box flexDirection="column">
              <Text bold color="#a3a3a3" marginBottom={1}>Roles in {selectedTeamName}:</Text>
              {selectedTeamPreset.map(r => (
                <Text key={r.role} color="#d4d4d4">
                  <Text color="#FBBF24">{r.role.padEnd(15)}</Text> - {r.desc}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
