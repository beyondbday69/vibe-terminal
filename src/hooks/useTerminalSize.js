import { useState, useEffect } from 'react';

export const useTerminalSize = () => {
  const [size, setSize] = useState({
    columns: process.stdout.columns || 100,
    rows: process.stdout.rows || 40,
  });

  useEffect(() => {
    const onResize = () => {
      // Clear screen before re-render to prevent doubled content
      process.stdout.write('\x1b[2J\x1b[H');
      setSize({
        columns: process.stdout.columns,
        rows: process.stdout.rows,
      });
    };

    process.stdout.on('resize', onResize);
    return () => process.stdout.removeListener('resize', onResize);
  }, []);

  return size;
};
