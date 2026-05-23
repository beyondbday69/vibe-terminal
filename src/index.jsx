import React from 'react';
import { render } from 'ink';
import App from './App.jsx';

// Disable any mouse tracking that might be enabled
process.stdout.write('\x1b[?1000l');
process.stdout.write('\x1b[?1002l');
process.stdout.write('\x1b[?1006l');
process.stdout.write('\x1b[?1015l');
process.stdout.write('\x1b[?1003l');

// Enter alternate screen buffer for full-screen app
process.stdout.write('\x1b[?1049h');

process.on('exit', () => {
  process.stdout.write('\x1b[?1049l');
});

render(<App />, { patchConsole: false });
