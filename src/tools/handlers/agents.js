// Dynamic imports to avoid circular dependency
let executeToolCall = null;
let toolsDefinition = null;

async function getExecutor() {
  if (!executeToolCall) {
    const executor = await import('../executor.js');
    executeToolCall = executor.executeToolCall;
  }
  return executeToolCall;
}

async function getToolsDefinition() {
  if (!toolsDefinition) {
    const definitions = await import('../definitions.js');
    toolsDefinition = definitions.toolsDefinition;
  }
  return toolsDefinition;
}

// In-memory agent store
const agents = new Map();
let agentCounter = 0;
const nextAgentId = () => `agent_${++agentCounter}`;

const API_URL = () => `${baseUrl}/chat/completions`;

function summarizeResult(funcName, result) {
  if (typeof result === 'string') return result.slice(0, 100);
  if (!result || !result.type) return String(result).slice(0, 100);
  switch (result.type) {
    case 'file_created': return `created ${shortenPath(result.path)} (${result.lineCount} lines)`;
    case 'file_edited': return `edited ${shortenPath(result.path)} (+${result.totalAdded} -${result.totalRemoved})`;
    case 'file_read': return `read ${shortenPath(result.path)} (${result.lineCount} lines)`;
    case 'bash_result': return `exit ${result.exitCode}: ${(result.stdout || '').trim().split('\n')[0].slice(0, 60)}`;
    case 'agent_spawned': return `spawned ${result.id}`;
    case 'error': return `error: ${result.message.slice(0, 80)}`;
    case 'generic': return (result.message || '').split('\n')[0].slice(0, 100);
    default: return `${result.type}`;
  }
}

function shortenPath(p) {
  const cwd = process.cwd();
  if (p.startsWith(cwd)) return p.slice(cwd.length + 1);
  return p;
}

let apiKey = '';
let baseUrl = 'https://opencode.ai/zen/v1';

export function setApiKey(key) {
  apiKey = key;
}

export function setBaseUrl(url) {
  baseUrl = url;
}

export function setModel(model) {
  activeModel = model;
}

export function getAgents() {
  return agents;
}

let activeModel = 'gpt-5.5';

async function callAI(messages) {
  const tools = await getToolsDefinition();
  const res = await fetch(API_URL(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: activeModel,
      messages,
      tools,
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`API Error ${res.status}: ${err.slice(0, 100)}`);
  }

  const json = await res.json();
  if (!json.choices || json.choices.length === 0) {
    throw new Error('No choices returned by API');
  }
  return json.choices[0].message;
}

async function runAgentLoop(agent) {
  const conversation = [
    {
      role: 'system',
      content: `You are a sub-agent working autonomously on a task. Your goal: ${agent.goal}\n\nUse available tools to complete the task. Be thorough. When done, provide a clear summary of what you accomplished.\n\nDo not use emojis in any output.`,
    },
    {
      role: 'user',
      content: agent.goal,
    },
  ];

  try {
    while (agent.status === 'running') {
      agent.iterations++;
      agent.status = 'running';

      const response = await callAI(conversation);
      conversation.push(response);

      if (response.tool_calls && response.tool_calls.length > 0) {
        const executor = await getExecutor();
        for (const call of response.tool_calls) {
          const funcName = call.function.name;
          let funcArgs;
          try {
            funcArgs = JSON.parse(call.function.arguments || '{}');
          } catch {
            funcArgs = {};
          }

          const result = await executor(funcName, funcArgs);
          const resultStr = typeof result === 'object' ? JSON.stringify(result) : String(result);

          conversation.push({
            role: 'tool',
            tool_call_id: call.id,
            content: resultStr,
          });

          agent.lastAction = funcName;
          const argPreview = Object.keys(funcArgs).length > 0 ? Object.entries(funcArgs).map(([k, v]) => `${k}: ${String(v).slice(0, 20)}`).join(', ') : '';
          agent.lastActionDetail = `${funcName}(${argPreview})`;
          // Store clean summary in log, not raw JSON
          const logSummary = summarizeResult(funcName, result);
          agent.log.push(`[${new Date().toLocaleTimeString()}] ${funcName}: ${logSummary}`);
        }
      } else {
        agent.result = response.content;
        agent.status = 'completed';
        return;
      }
    }
  } catch (error) {
    agent.status = 'failed';
    agent.error = error.message;
  }
}

export async function handleAgentSpawn(args) {
  const { goal, task } = args;
  const agentGoal = goal || task;

  if (!agentGoal) {
    return { type: 'error', message: 'No goal or task provided for the agent.' };
  }

  const id = nextAgentId();
  const agent = {
    id,
    goal: agentGoal,
    status: 'running',
    createdAt: Date.now(),
    iterations: 0,
    lastAction: null,
    lastActionDetail: null,
    result: null,
    error: null,
    log: [],
  };

  agents.set(id, agent);

  runAgentLoop(agent).catch(err => {
    agent.status = 'failed';
    agent.error = err.message;
  });

  return {
    type: 'agent_spawned',
    id,
    goal: agentGoal,
  };
}

export async function handleAgentList() {
  if (agents.size === 0) {
    return { type: 'generic', message: 'No agents.' };
  }

  const lines = [];
  for (const [, agent] of agents) {
    const age = Math.round((Date.now() - agent.createdAt) / 1000);
    const status = agent.status === 'running' ? 'running' : agent.status === 'completed' ? 'done' : agent.status;
    const goal = agent.goal.length > 50 ? agent.goal.slice(0, 50) + '...' : agent.goal;
    lines.push(`${agent.id} [${status}] ${age}s | ${goal}`);
  }

  return { type: 'generic', message: lines.join('\n') };
}

export async function handleAgentGet(args) {
  const { agent_id } = args;
  if (!agent_id) return { type: 'error', message: 'No agent_id provided.' };

  const agent = agents.get(agent_id);
  if (!agent) return { type: 'error', message: `Agent not found: ${agent_id}` };

  const age = Math.round((Date.now() - agent.createdAt) / 1000);
  const statusLabel = agent.status === 'running' ? 'running' : agent.status === 'completed' ? 'done' : agent.status;
  const lines = [
    `${agent.id} [${statusLabel}] ${age}s | step ${agent.iterations}`,
    `Goal: ${agent.goal}`,
  ];

  if (agent.lastActionDetail) {
    lines.push(`Last: ${agent.lastActionDetail}`);
  }

  if (agent.log.length > 0) {
    lines.push('Log:');
    agent.log.slice(-5).forEach(l => lines.push(`  ${l}`));
  }

  if (agent.result) {
    lines.push('');
    lines.push('Result:');
    // Show only first 5 lines of result
    const resultLines = agent.result.split('\n');
    resultLines.slice(0, 5).forEach(l => lines.push(`  ${l}`));
    if (resultLines.length > 5) lines.push(`  ... (${resultLines.length - 5} more lines)`);
  }

  if (agent.error) {
    lines.push(`Error: ${agent.error}`);
  }

  return { type: 'generic', message: lines.join('\n') };
}

export async function handleAgentStop(args) {
  const { agent_id } = args;
  if (!agent_id) return { type: 'error', message: 'No agent_id provided.' };

  const agent = agents.get(agent_id);
  if (!agent) return { type: 'error', message: `Agent not found: ${agent_id}` };

  if (agent.status !== 'running' && agent.status !== 'queued') {
    return { type: 'generic', message: `Agent ${agent_id} is already ${agent.status}.` };
  }

  agent.status = 'stopped';
  return { type: 'generic', message: `Agent ${agent_id} stopped.` };
}
