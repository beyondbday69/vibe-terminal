import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(express.static(__dirname));

let pty = null;
try {
  pty = (await import('node-pty')).default;
} catch (e) {
  console.log('node-pty not available, falling back to standard child_process.spawn');
}

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  let cliProcess = null;
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };

  if (pty) {
    try {
      cliProcess = pty.spawn('npx', ['tsx', 'src/index.jsx'], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: ROOT_DIR,
        env
      });

      cliProcess.onData((data) => {
        ws.send(JSON.stringify({ type: 'output', data }));
      });

      cliProcess.onExit(({ exitCode }) => {
        console.log(`CLI process exited with code ${exitCode}`);
        ws.close();
      });
    } catch (err) {
      console.error('Failed to spawn PTY:', err);
    }
  }

  // Fallback to standard child_process if node-pty is missing or failed
  if (!cliProcess) {
    console.log('Spawning process using standard child_process spawn fallback');
    cliProcess = spawn('npx', ['tsx', 'src/index.jsx'], {
      cwd: ROOT_DIR,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    cliProcess.stdout.on('data', (data) => {
      ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
    });

    cliProcess.stderr.on('data', (data) => {
      ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
    });

    cliProcess.on('exit', (code) => {
      console.log(`CLI process exited with code ${code}`);
      ws.close();
    });
  }

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());
      if (msg.type === 'input') {
        if (pty && cliProcess.write) {
          cliProcess.write(msg.data);
        } else if (cliProcess.stdin && cliProcess.stdin.writable) {
          cliProcess.stdin.write(msg.data);
        }
      } else if (msg.type === 'resize' && pty && cliProcess.resize) {
        cliProcess.resize(msg.cols, msg.rows);
      }
    } catch (e) {
      // Direct raw input fallback
      if (pty && cliProcess.write) {
        cliProcess.write(message.toString());
      } else if (cliProcess.stdin && cliProcess.stdin.writable) {
        cliProcess.stdin.write(message);
      }
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected, terminating CLI process');
    try {
      if (pty && cliProcess.kill) {
        cliProcess.kill();
      } else if (cliProcess.kill) {
        cliProcess.kill('SIGINT');
      }
    } catch (e) {}
  });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

const PORT = 3005;
server.listen(PORT, () => {
  console.log(`Web CLI Terminal server listening on http://localhost:${PORT}`);
});
