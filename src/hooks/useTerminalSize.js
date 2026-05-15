import { useState, useEffect } from 'react';

export const useTerminalSize = () => {
  const [size, setSize] = useState({
    columns: process.stdout.columns || 100,
    rows: process.stdout.rows || 40,
  });

  useEffect(() => {
    const onResize = () => {
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
