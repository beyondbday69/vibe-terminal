import React, { useState } from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { ROLE_COLORS, ROLE_ICONS } from '../constants.js';

export const AgentReportCard = ({ report, termWidth }) => {
  // Collapsed by default as per spec
  const [isExpanded, setIsExpanded] = useState(false);

  if (!report) return null;

  const role = report.role || 'agent';
  const roleColor = ROLE_COLORS[role] || '#737373';
  const roleIcon = ROLE_ICONS[role] || '•';
  
  const boxWidth = Math.min(termWidth - 4, 80);

  const statusStr = report.status === 'completed' ? 'done' : report.status;
  const timeStr = report.time ? `${report.time}s` : '';
  const tokStr = report.tokens ? `${report.tokens} tok` : '';
  
  const metaParts = [];
  if (statusStr) metaParts.push(statusStr);
  if (timeStr) metaParts.push(timeStr);
  if (tokStr) metaParts.push(tokStr);
  const metaString = metaParts.length > 0 ? ` [${metaParts.join('  ')}]` : '';

  const summaryLine = report.summary ? (report.summary.length > 40 ? report.summary.slice(0, 37) + '...' : report.summary) : '';
  
  const headerIconAndRole = chalk.hex(roleColor)(`${roleIcon}  ${role}`);
  const headerSummary = chalk.white(`   ${summaryLine}`);
  const headerMeta = chalk.hex('#888888')(`   ${metaString}  ${isExpanded ? '▴' : '▾'}`);

  if (!isExpanded) {
    return (
      <Box>
        <Text>{headerIconAndRole}{headerSummary}{headerMeta}</Text>
      </Box>
    );
  }

  const renderField = (label, value) => {
    if (!value) return null;
    return (
      <Box paddingLeft={5}>
        <Box width={10}><Text color="#737373">{label}</Text></Box>
        <Box width={boxWidth - 15}><Text>{value}</Text></Box>
      </Box>
    );
  };

  const renderArray = (label, items, color, prefix = '·') => {
    if (!items || items.length === 0) return null;
    return (
      <Box flexDirection="column" paddingLeft={5}>
        <Text color="#737373">{label}</Text>
        {items.map((item, i) => (
          <Box key={i}>
            <Text color={color}>{prefix}  </Text>
            <Text color={color}>{typeof item === 'string' ? item : JSON.stringify(item)}</Text>
          </Box>
        ))}
      </Box>
    );
  };

  const filesEditedText = report.filesEdited && report.filesEdited.length > 0
    ? `${report.filesEdited.length} edited` 
    : '0 edited  (read-only role)';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text>{headerIconAndRole}{headerSummary}{headerMeta}</Text>
      </Box>
      
      <Box flexDirection="column" width={boxWidth} marginTop={1}>
        {renderField('model', report.model || 'unknown')}
        {renderField('files', filesEditedText)}
        {renderField('summary', report.summary)}
        
        {renderArray('findings', report.findings, '#f0f0f0', '·')}
        {renderArray('issues', report.issues, '#c97070', '!')}
        {renderArray('recommendations', report.recommendations, '#888888', '→')}
      </Box>
    </Box>
  );
};
