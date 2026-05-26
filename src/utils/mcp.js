import { spawn } from 'node:child_process';
import readline from 'node:readline';

export class McpClient {
  constructor(name, command, args = [], url = '') {
    this.name = name;
    this.command = command;
    this.args = args;
    this.url = url;
    this.process = null;
    this.tools = [];
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.rl = null;
    this.status = 'disconnected';
    this.error = null;
    this.errorLogs = [];
  }

  async start() {
    this.status = 'connecting';
    this.error = null;
    this.errorLogs = [];

    return new Promise((resolve, reject) => {
      let resolved = false;

      const handleFail = (err) => {
        if (resolved) return;
        resolved = true;
        this.status = 'failed';
        this.error = err.message || String(err);
        this.stop();
        reject(err);
      };

      try {
        this.process = spawn(this.command, this.args, {
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } catch (err) {
        handleFail(err);
        return;
      }

      this.process.on('error', (err) => {
        handleFail(err);
      });

      this.process.stderr.on('data', (data) => {
        const logLines = data.toString().split('\n').filter(Boolean);
        for (const line of logLines) {
          this.errorLogs.push(line);
          if (this.errorLogs.length > 20) {
            this.errorLogs.shift();
          }
        }
      });

      this.process.on('exit', (code, signal) => {
        const exitMsg = `Process exited with code ${code} and signal ${signal}`;
        this.errorLogs.push(exitMsg);
        this.status = 'disconnected';
        this.rl = null;
        if (!resolved) {
          handleFail(new Error(exitMsg));
        }
      });

      this.rl = readline.createInterface({
        input: this.process.stdout,
        output: this.process.stdin,
        terminal: false
      });

      this.rl.on('line', (line) => {
        try {
          const response = JSON.parse(line);
          if (response.id !== undefined) {
            const handler = this.pendingRequests.get(response.id);
            if (handler) {
              this.pendingRequests.delete(response.id);
              if (response.error) {
                handler.reject(new Error(response.error.message || JSON.stringify(response.error)));
              } else {
                handler.resolve(response.result);
              }
            }
          }
        } catch (err) {
          // Ignore JSON parse errors for noise on stdout, but log it internally
          this.errorLogs.push(`Stdout parse error: ${err.message}. Line: ${line.slice(0, 100)}`);
        }
      });

      // Start handshake
      (async () => {
        try {
          // Step 1: Send 'initialize'
          const initResult = await this.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'vibe-terminal', version: '1.0.0' }
          });

          // Step 2: Send 'notifications/initialized'
          this.sendNotification('notifications/initialized');

          // Step 3: Fetch tools
          const toolsResult = await this.sendRequest('tools/list', {});
          this.tools = toolsResult.tools || [];
          this.status = 'connected';
          resolved = true;
          resolve();
        } catch (err) {
          handleFail(err);
        }
      })();
    });
  }

  stop() {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.process) {
      try {
        this.process.kill();
      } catch {}
      this.process = null;
    }
    this.status = 'disconnected';
    this.tools = [];
    this.pendingRequests.clear();
  }

  sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        return reject(new Error('MCP Server is not running'));
      }
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.process.stdin.write(msg);
    });
  }

  sendNotification(method, params) {
    if (!this.process) return;
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this.process.stdin.write(msg);
  }

  async callTool(toolName, args) {
    return await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });
  }
}

// Manager store
export const activeServers = new Map();

export async function addServer(name, command, args = [], url = '') {
  if (activeServers.has(name)) {
    activeServers.get(name).stop();
  }
  const client = new McpClient(name, command, args, url);
  activeServers.set(name, client);
  await client.start();
  return client;
}

export function removeServer(name) {
  const client = activeServers.get(name);
  if (client) {
    client.stop();
    activeServers.delete(name);
    return true;
  }
  return false;
}

export async function initServers(mcpServersConfig) {
  if (!mcpServersConfig) return;
  const promises = [];
  for (const [name, config] of Object.entries(mcpServersConfig)) {
    if (config) {
      let command = config.command;
      let args = config.args || [];
      let url = config.url || '';
      if (config.url) {
        command = 'npx';
        args = ['-y', 'mcp-remote', config.url];
      }
      if (command) {
        const client = new McpClient(name, command, args, url);
        activeServers.set(name, client);
        promises.push(
          client.start().catch((err) => {
            console.warn(`[MCP] Failed to start server ${name}:`, err.message);
          })
        );
      }
    }
  }
  await Promise.all(promises);
}

export function stopAllServers() {
  for (const client of activeServers.values()) {
    client.stop();
  }
  activeServers.clear();
}

export function getMcpTools() {
  const mcpTools = [];
  for (const [serverName, server] of activeServers.entries()) {
    if (server.status === 'connected') {
      for (const tool of server.tools) {
        mcpTools.push({
          type: 'function',
          function: {
            name: `mcp__${serverName}__${tool.name}`,
            description: tool.description || '',
            parameters: tool.inputSchema || { type: 'object', properties: {} }
          }
        });
      }
    }
  }
  return mcpTools;
}

export async function executeMcpToolCall(prefixedName, args) {
  const parts = prefixedName.split('__');
  if (parts.length < 3) {
    return { type: 'error', message: `Invalid MCP tool name: ${prefixedName}` };
  }
  const serverName = parts[1];
  const toolName = parts.slice(2).join('__');

  const server = activeServers.get(serverName);
  if (!server) {
    return { type: 'error', message: `MCP server "${serverName}" is not connected.` };
  }

  try {
    const result = await server.callTool(toolName, args);
    let text = '';
    if (result.content && Array.isArray(result.content)) {
      text = result.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
    } else {
      text = JSON.stringify(result);
    }

    if (result.isError) {
      return { type: 'error', message: text };
    }
    return { type: 'generic', message: text };
  } catch (err) {
    return { type: 'error', message: `Error calling MCP tool ${toolName} on server ${serverName}: ${err.message}` };
  }
}
