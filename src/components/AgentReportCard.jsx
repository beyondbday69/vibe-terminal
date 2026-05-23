import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { ROLE_COLORS } from '../constants.js';

export const AgentReportCard = ({ report, termWidth }) => {
  if (!report) return null;

  const role = report.role || 'agent';
  const roleColor = ROLE_COLORS[role] || '#737373';
  const statusColors = {
    running: '#d4a574',
    done: '#98c99a',
    error: '#c97070'
  };
  const statusColor = statusColors[report.status] || '#737373';
  
  const boxWidth = Math.min(termWidth - 4, 80);
  const headerText = ` ${role}  [${report.status}] `;
  const headerLength = headerText.length;
  const paddingLength = Math.max(0, boxWidth - headerLength - 4);
  const topBorder = `\u250C\u2500${chalk.hex(roleColor)(headerText)}${'\u2500'.repeat(paddingLength)}\u2510`;
  const bottomBorder = `\u2514${'\u2500'.repeat(boxWidth - 2)}\u2518`;

  const renderField = (label, value) => {
    if (!value) return null;
    return (
      <Box paddingX={1}>
        <Box width={10}><Text color="#737373">{label}</Text></Box>
        <Box width={boxWidth - 14}><Text>{value}</Text></Box>
      </Box>
    );
  };

  const renderArray = (label, items) => {
    if (!items || items.length === 0) return null;
    return (
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text color="#737373">{label}</Text>
        {items.map((item, i) => (
          <Box key={i} marginLeft={2}>
            <Text color="#a3a3a3">{i + 1}  </Text>
            <Text>{typeof item === 'string' ? item : JSON.stringify(item)}</Text>
          </Box>
        ))}
      </Box>
    );
  };

  const filesEditedText = report.filesEdited 
    ? `${report.filesEdited.length} edited` 
    : '0 edited (read-only role)';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="#525252">{topBorder}</Text>
      
      <Box flexDirection="column" borderStyle="single" borderColor="#525252" borderTop={false} borderBottom={false} width={boxWidth}>
        {renderField('model', report.model || 'unknown')}
        {renderField('task', report.task || 'unknown task')}
        {renderField('files', filesEditedText)}
        
        <Box marginTop={1}>
          {renderField('summary', report.summary)}
        </Box>
        
        {renderArray('findings', report.findings)}
        
        {report.filesEdited && report.filesEdited.length > 0 && (
          <Box flexDirection="column" paddingX={1} marginTop={1}>
            <Text color="#737373">files edited</Text>
            {report.filesEdited.map((f, i) => (
              <Box key={i} marginLeft={2}>
                <Text color="#a3a3a3">{i + 1}  </Text>
                <Text>{f.path} </Text>
                <Text color="#3ECF8E">+{f.linesAdded} </Text>
                <Text color="#EF4444">-{f.linesRemoved}</Text>
              </Box>
            ))}
          </Box>
        )}

        {renderArray('issues', report.issues)}
        {renderArray('recommendations', report.recommendations)}
      </Box>
      
      <Text color="#525252">{bottomBorder}</Text>
    </Box>
  );
};
