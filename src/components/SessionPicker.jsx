import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import chalk from 'chalk';

export const SessionPicker = ({ sessions, onSelect, onDelete, onFav, onClose, termWidth, termHeight }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [sessionList, setSessionList] = useState(sessions);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const maxVisible = Math.min(10, termHeight - 10);

  useInput((input, key) => {
    if (key.escape) {
      if (confirmDelete !== null) {
        setConfirmDelete(null);
      } else {
        onClose();
      }
      return;
    }
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(sessionList.length - 1, prev + 1));
      return;
    }
    if (key.return) {
      if (confirmDelete !== null) {
        const session = sessionList[confirmDelete];
        if (session) {
          onDelete(session.id);
          setSessionList(prev => prev.filter((_, i) => i !== confirmDelete));
          setSelectedIndex(0);
        }
        setConfirmDelete(null);
        return;
      }
      if (sessionList.length > 0) {
        onSelect(sessionList[selectedIndex]);
      }
      return;
    }
    if (input === 'd' && confirmDelete === null && sessionList.length > 0) {
      setConfirmDelete(selectedIndex);
      return;
    }
    if (input === 'f' && sessionList.length > 0) {
      const session = sessionList[selectedIndex];
      const newFav = !session.favorite;
      onFav(session.id, newFav);
      setSessionList(prev => prev.map((s, i) => i === selectedIndex ? { ...s, favorite: newFav } : s));
      return;
    }
  });

  // Auto-scroll to keep selected visible
  const visibleStart = Math.max(0, Math.min(selectedIndex - maxVisible + 2, sessionList.length - maxVisible));
  const visibleSessions = sessionList.slice(visibleStart, visibleStart + maxVisible);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight} alignItems="center" justifyContent="center">
      <Box flexDirection="column" width={Math.min(70, termWidth - 4)} borderStyle="double" borderColor="#D77757" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="#D77757">Sessions</Text>
        </Box>

        <Text color="#333333">{'─'.repeat(Math.min(66, termWidth - 8))}</Text>

        {sessionList.length === 0 ? (
          <Box marginTop={1}>
            <Text color="#737373">No saved sessions.</Text>
          </Box>
        ) : (
          visibleSessions.map((session, i) => {
            const realIndex = visibleStart + i;
            const isSelected = realIndex === selectedIndex;
            const isConfirming = realIndex === confirmDelete;
            const title = session.title || session.preview || '(untitled)';
            const date = session.savedAt ? new Date(session.savedAt).toLocaleDateString() : '';

            if (isConfirming) {
              return (
                <Box key={session.id} marginTop={1}>
                  <Text color="#EF4444">Delete "{title}"? ENTER=yes  ESC=no</Text>
                </Box>
              );
            }

            const prefix = isSelected ? chalk.hex('#D77757')('>') : ' ';
            const fav = session.favorite ? '*' : ' ';
            const titleColor = isSelected ? '#D77757' : '#d4d4d4';

            return (
              <Box key={session.id} marginTop={0}>
                <Text>
                  {prefix} {fav} <Text color={titleColor}>{title}</Text>
                  <Text color="#525252">  {session.messageCount} msgs  {date}</Text>
                </Text>
              </Box>
            );
          })
        )}

        <Box marginTop={1}>
          <Text color="#333333">{'─'.repeat(Math.min(66, termWidth - 8))}</Text>
        </Box>

        <Box marginTop={0}>
          <Text color="#525252">ENTER: resume  D: delete  F: fav  ESC: close</Text>
        </Box>
      </Box>
    </Box>
  );
};
