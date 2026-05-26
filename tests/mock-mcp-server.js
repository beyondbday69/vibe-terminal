import readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    const { id, method, params } = request;

    if (method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'mock-mcp-server',
            version: '1.0.0'
          }
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else if (method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'greet',
              description: 'Greet a user by name',
              inputSchema: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'The name of the user to greet'
                  }
                },
                required: ['name']
              }
            }
          ]
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else if (method === 'tools/call') {
      const toolName = params.name;
      const args = params.arguments || {};
      
      let contentText = '';
      let isError = false;

      if (toolName === 'greet') {
        const name = args.name || 'Stranger';
        contentText = `Hello, ${name}! This is a successful tool response from the mock MCP server.`;
      } else {
        contentText = `Unknown tool: ${toolName}`;
        isError = true;
      }

      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: contentText
            }
          ],
          isError
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch (err) {
    // Ignore malformed input
  }
});
