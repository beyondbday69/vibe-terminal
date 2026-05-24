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
      if (isDropdownOpen) { setIsDropdownOpen(false); return; }
      return onClose();
    }

    if (isDropdownOpen) {
      if (key.upArrow) { setModelIndex(prev => Math.max(0, prev - 1)); return; }
      if (key.downArrow) { setModelIndex(prev => Math.min(models.length - 1, prev + 1)); return; }
      if (key.return) {
        const roleName = activeRoles[roleIndex].role;
        setRoleModels(prev => ({ ...prev, [roleName]: models[modelIndex] }));
        setIsDropdownOpen(false);
        return;
      }
      return;
    }

    if (key.leftArrow) { setTabIndex(prev => Math.max(0, prev - 1)); setRoleIndex(0); return; }
    if (key.rightArrow) { setTabIndex(prev => Math.min(tabs.length - 1, prev + 1)); setRoleIndex(0); return; }
    if (key.upArrow) { setRoleIndex(prev => Math.max(0, prev - 1)); return; }
    if (key.downArrow) { setRoleIndex(prev => Math.min(activeRoles.length - 1, prev + 1)); return; }

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
        {/* Title */}
        <Box justifyContent="center" marginBottom={1}>
          <Text color="#D77757" bold>select team</Text>
        </Box>

        {/* Tabs */}
        <Box justifyContent="center" marginBottom={1}>
          {tabs.map((tab, i) => (
            <Box key={tab} marginRight={i < tabs.length - 1 ? 2 : 0}>
              <Text
                color={i === tabIndex ? '#D77757' : '#555555'}
                bold={i === tabIndex}
              >
                {i === tabIndex ? `[${tab}]` : ` ${tab} `}
              </Text>
            </Box>
          ))}
        </Box>

        <Box justifyContent="center">
          <Text color="#2a2a2a">{"─".repeat(panelWidth - 6)}</Text>
        </Box>

        {/* Roles */}
        <Box flexDirection="column" marginY={1}>
          {activeRoles.map((r, i) => {
            const active = i === roleIndex;
            const color = ROLE_COLORS[r.role] || '#888888';
            const icon = ROLE_ICONS[r.role] || '•';
            const model = roleModels[r.role] || r.model;

            return (
              <Box key={r.role} marginBottom={0}>
                <Text color={active ? color : '#555555'}>
                  {active ? '▸ ' : '  '}{icon} {r.role}
                </Text>
                <Text color="#3a3a3a">  </Text>
                <Text color={active ? '#888888' : '#3a3a3a'}>{model}</Text>
              </Box>
            );
          })}
        </Box>

        {/* Model dropdown */}
        {isDropdownOpen && (
          <Box flexDirection="column" borderStyle="single" borderColor="#3a3a3a" paddingX={1} marginBottom={1}>
            {models.map((m, i) => (
              <Text key={m} color={i === modelIndex ? '#D77757' : '#555555'} bold={i === modelIndex}>
                {i === modelIndex ? '▸ ' : '  '}{m}
              </Text>
            ))}
          </Box>
        )}

        <Box justifyContent="center">
          <Text color="#2a2a2a">{"─".repeat(panelWidth - 6)}</Text>
        </Box>

        {/* Footer */}
        <Box justifyContent="center" marginTop={1}>
          <Text color="#555555">
            <Text color="#D77757" bold>[s]</Text> start  <Text color="#555555" bold>[esc]</Text> back
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
