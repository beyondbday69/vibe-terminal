import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TEAM_PRESETS, ROLE_COLORS, ROLE_ICONS } from '../constants.js';

export const TeamSelector = ({ activeTeam, availableModels, onSelect, onClose, termWidth, termHeight, modeText = 'ask mode' }) => {
  const tabs = Object.keys(TEAM_PRESETS);
  const [tabIndex, setTabIndex] = useState(() => {
    const idx = tabs.indexOf(activeTeam);
    return idx >= 0 ? idx : 0;
  });
  
  const [roleIndex, setRoleIndex] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [modelIndex, setModelIndex] = useState(0);

  const [roleModels, setRoleModels] = useState({});

  const activeTabName = tabs[tabIndex];
  const activeRoles = TEAM_PRESETS[activeTabName] || [];

  const models = availableModels && availableModels.length > 0
    ? availableModels
    : ['kimi-k2.6', 'gpt-5.5', 'gpt-4o', 'claude-3-5-sonnet', 'gemini-2.0-flash'];

  useInput((input, key) => {
    if (key.escape) {
      if (isDropdownOpen) {
        setIsDropdownOpen(false);
        return;
      }
      return onClose();
    }

    if (isDropdownOpen) {
      if (key.upArrow) {
        setModelIndex(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setModelIndex(prev => Math.min(models.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        const roleName = activeRoles[roleIndex].role;
        setRoleModels(prev => ({ ...prev, [roleName]: models[modelIndex] }));
        setIsDropdownOpen(false);
        return;
      }
      return;
    }

    if (key.leftArrow) {
      setTabIndex(prev => Math.max(0, prev - 1));
      setRoleIndex(0);
      return;
    }
    if (key.rightArrow) {
      setTabIndex(prev => Math.min(tabs.length - 1, prev + 1));
      setRoleIndex(0);
      return;
    }

    if (key.upArrow) {
      setRoleIndex(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setRoleIndex(prev => Math.min(activeRoles.length - 1, prev + 1));
      return;
    }

    if (key.return) {
      setIsDropdownOpen(true);
      const currentRole = activeRoles[roleIndex].role;
      const currentModel = roleModels[currentRole] || activeRoles[roleIndex].model;
      const mIdx = models.indexOf(currentModel);
      setModelIndex(mIdx >= 0 ? mIdx : 0);
      return;
    }

    if (input === 's' || input === 'S') {
      onSelect(activeTabName, roleModels);
    }
  });

  const overlayWidth = Math.min(80, termWidth - 4);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight} padding={1}>
      <Box marginBottom={1} flexDirection="column">
        <Text color="#D77757">/team</Text>
        <Text color="#f0f0f0">select a team</Text>
        <Text color="#888888">each role runs as a specialist sub-agent with its own model</Text>
      </Box>

      <Box marginBottom={1}>
        {tabs.map((tab, i) => (
          <Box key={tab} marginRight={2}>
            <Text color={i === tabIndex ? '#f0f0f0' : '#888888'} bold={i === tabIndex}>
              {tab}
            </Text>
          </Box>
        ))}
      </Box>

      <Text color="#2a2a2a">{"─".repeat(overlayWidth)}</Text>

      <Box flexDirection="column" marginY={1}>
        {activeRoles.map((r, i) => {
          const isSelectedRole = i === roleIndex;
          const roleColor = ROLE_COLORS[r.role] || '#888888';
          const icon = ROLE_ICONS[r.role] || '•';
          const currentModel = roleModels[r.role] || r.model;

          return (
            <Box key={r.role} flexDirection="row" alignItems="center" marginBottom={1}>
              <Box width={1} marginRight={2}>
                <Text color={roleColor}>┃</Text>
              </Box>
              <Box width={20}>
                <Text color={roleColor}>{icon}  {r.role}</Text>
              </Box>
              <Box width={30}>
                <Text color="#888888">{r.desc}</Text>
              </Box>
              <Box>
                <Text color={isSelectedRole ? '#D77757' : '#f0f0f0'}>[{currentModel} ▾]</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {isDropdownOpen && (
        <Box flexDirection="column" borderStyle="single" borderColor="#525252" paddingX={1} width={30} marginLeft={50}>
          {models.map((m, i) => (
            <Text key={m} color={i === modelIndex ? '#D77757' : '#888888'} bold={i === modelIndex}>
              {i === modelIndex ? '> ' : '  '}{m}
            </Text>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="#888888">
          <Text color="#D77757" bold>[S] start team</Text>   {activeRoles.length} agents · {modeText}
        </Text>
      </Box>
    </Box>
  );
};
