import React from 'react';
import { render } from 'ink';
import App from './App.jsx';

// Disable any mouse tracking that might be enabled
process.stdout.write('\x1b[?1000l');
process.stdout.write('\x1b[?1002l');
process.stdout.write('\x1b[?1006l');
process.stdout.write('\x1b[?1015l');
process.stdout.write('\x1b[?1003l');

render(<App />, { patchConsole: false });
