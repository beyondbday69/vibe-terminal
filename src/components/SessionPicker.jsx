import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';

export const SessionPicker = ({ sessions, onSelect, onDelete, onFav, onClose, termWidth, termHeight }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [sessionList, setSessionList] = useState(sessions);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const VISIBLE_COUNT = Math.min(12, Math.max(1, sessionList.length));

  useEffect(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
  }, []);

  useInput((input, key) => {
    if (key.escape) {
      if (confirmDelete) {
        setConfirmDelete(null);
      } else {
        onClose();
      }
      return;
    }
    if (key.upArrow) {
      setSelectedIndex(prev => {
        const next = Math.max(0, prev - 1);
        if (next < scrollOffset) setScrollOffset(next);
        return next;
      });
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(prev => {
        const next = Math.min(sessionList.length - 1, prev + 1);
        if (next >= scrollOffset + VISIBLE_COUNT) setScrollOffset(next - VISIBLE_COUNT + 1);
        return next;
      });
      return;
    }
    if (key.return) {
      if (confirmDelete) {
        // Confirmed delete
        const session = sessionList[confirmDelete];
        if (session) {
          onDelete(session.id);
          setSessionList(prev => prev.filter((_, i) => i !== confirmDelete));
          setSelectedIndex(prev => Math.max(0, Math.min(prev, sessionList.length - 2)));
        }
        setConfirmDelete(null);
        return;
      }
      if (sessionList.length > 0) {
        onSelect(sessionList[selectedIndex]);
      }
      return;
    }
    if (input === 'd' && !confirmDelete) {
      if (sessionList.length > 0) {
        setConfirmDelete(selectedIndex);
      }
      return;
    }
    if (input === 'f') {
      if (sessionList.length > 0) {
        const session = sessionList[selectedIndex];
        const newFav = !session.favorite;
        onFav(session.id, newFav);
        setSessionList(prev => prev.map((s, i) => i === selectedIndex ? { ...s, favorite: newFav } : s));
      }
      return;
    }
  });

  const overlayWidth = Math.min(70, termWidth - 4);
  const paddingTop = Math.max(2, Math.floor((termHeight - VISIBLE_COUNT - 8) / 2));
  const visibleSessions = sessionList.slice(scrollOffset, scrollOffset + VISIBLE_COUNT);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight} paddingTop={paddingTop} alignItems="center">
      <Box flexDirection="column" width={overlayWidth} borderStyle="double" borderColor="#FB923C" paddingX={2} paddingY={1}>
        <Box justifyContent="space-between" marginBottom={1}>
          <Text bold color="#FB923C">Sessions</Text>
          <Text color="#737373">ENTER: resume  D: delete  F: fav</Text>
        </Box>

        <Text color="#333333">{"─".repeat(overlayWidth - 4)}</Text>

        {sessionList.length === 0 ? (
          <Box paddingX={1} marginTop={1}>
            <Text color="#737373">No saved sessions.</Text>
          </Box>
        ) : (
          <Box flexDirection="column" marginTop={1}>
            {visibleSessions.map((session, i) => {
              const realIndex = i + scrollOffset;
              const isSelected = realIndex === selectedIndex;
              const isConfirming = realIndex === confirmDelete;
              const date = new Date(session.savedAt).toLocaleDateString();
              const title = session.title || session.preview || '(untitled)';

              if (isConfirming) {
                return (
                  <Box key={session.id} paddingX={1}>
                    <Text color="#ef4444">{'  '}Delete "{title}"? ENTER: yes  ESC: no</Text>
                  </Box>
                );
              }

              return (
                <Box key={session.id} paddingX={1}>
                  <Text bold={isSelected} color={isSelected ? '#FB923C' : '#d4d4d4'}>
                    {isSelected ? '> ' : '  '}
                    {session.favorite ? '* ' : '  '}
                    {title}
                  </Text>
                  <Text color="#525252">  {session.messageCount} msgs  {date}</Text>
                </Box>
              );
            })}
          </Box>
        )}

        <Text color="#333333" marginTop={1}>{"─".repeat(overlayWidth - 4)}</Text>

        {sessionList.length > VISIBLE_COUNT && (
          <Box justifyContent="center" marginTop={1}>
            <Text color="#525252" dimColor>
              {scrollOffset + 1}–{Math.min(scrollOffset + VISIBLE_COUNT, sessionList.length)} of {sessionList.length}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
