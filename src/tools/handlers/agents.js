// Dynamic imports to avoid circular dependency
import { TEAM_PRESETS } from '../../constants.js';
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

// Messages from agents to the user, polled by App.jsx
const userMessageQueue = [];
export function popUserMessages() {
  return userMessageQueue.splice(0, userMessageQueue.length);
}

// Inter-agent message log (visible in UI)
const teamChatLog = [];
export function popTeamChatLog() {
  return teamChatLog.splice(0, teamChatLog.length);
}

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
let baseUrl = 'https://opencode.ai/zen/go/v1';

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

// ── Role-specific system prompts ──────────────────────────────────────────────

const ROLE_SYSTEM_PROMPTS = {
  manager: `You are the team MANAGER. You are the bridge between the user and the team.

YOUR WORKFLOW:
1. The user sends you a task. Understand it fully.
2. Break the task into distinct sub-tasks for each team member.
3. Use team_message to send EACH team member a detailed, self-contained prompt explaining exactly what they need to do. Include file paths, expected output, constraints, and success criteria.
4. After delegating, use team_message(role: "user", message: "...") to inform the user what you delegated and to whom.
5. Wait for team members to message you back with their results.
6. Synthesise the results and report to the user via team_message(role: "user", message: "...").

CRITICAL RULES:
- You MUST use team_message to delegate. Do NOT just output text.
- Generate DIFFERENT prompts for each role based on their speciality.
- You do NOT edit files yourself. You delegate.
- Every response you give must include at least one team_message tool call.
- When done synthesising, send the final summary to the user via team_message.`,

  designer: `You are a FRONTEND SPECIALIST on a team.

You will receive instructions from the manager via incoming messages.
When you receive a task:
1. Read the relevant files to understand existing patterns.
2. Implement the UI changes (components, CSS, layouts, markup).
3. After completing your work, use team_message(role: "manager", message: "...") to report what you did, what files you changed, and any issues found.

RULES:
- Do NOT touch backend files, routes, or database logic.
- Match existing code style exactly.
- Always report back to the manager when done.
- You can message other roles via team_message if you need coordination.`,

  'backend-dev': `You are a BACKEND SPECIALIST on a team.

You will receive instructions from the manager via incoming messages.
When you receive a task:
1. Read the relevant files to understand existing patterns.
2. Implement the backend changes (APIs, logic, schemas, tests).
3. After completing your work, use team_message(role: "manager", message: "...") to report what you did, what files you changed, and any issues found.

RULES:
- Do NOT touch UI components or CSS.
- Match existing code style exactly.
- Always report back to the manager when done.
- You can message the designer via team_message if you need UI alignment.`,

  researcher: `You are a TECHNICAL RESEARCHER on a team.

You will receive instructions from the manager via incoming messages.
When you receive a task:
1. Search the web, read documentation, analyse dependencies.
2. Produce structured findings.
3. Use team_message(role: "manager", message: "...") to send your findings back.

RULES:
- Do NOT edit code files.
- Always report back to the manager when done.`,

  reviewer: `You are a CODE REVIEWER on a team.

You will receive instructions from the manager via incoming messages.
When you receive a task:
1. Read the specified code files.
2. Find issues (bugs, security, style, performance).
3. Use team_message(role: "manager", message: "...") to report your findings.

RULES:
- Do NOT edit files. Read only.
- Always report back to the manager when done.
- You can message implementers directly via team_message to flag urgent issues.`,

  devops: `You are a DEVOPS SPECIALIST on a team.

You will receive instructions from the manager via incoming messages.
When you receive a task:
1. Handle deployment configs, CI/CD, Docker, environment setup.
2. After completing your work, use team_message(role: "manager", message: "...") to report back.

RULES:
- Do NOT touch application business logic or UI code.
- Always report back to the manager when done.`,
};

// ── AI call ───────────────────────────────────────────────────────────────────

async function callAI(messages, modelOverride) {
  const tools = await getToolsDefinition();
  const res = await fetch(API_URL(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelOverride || activeModel,
      messages,
      tools,
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
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

// ── Agent loop ────────────────────────────────────────────────────────────────

async function runAgentLoop(agent) {
  const roleSystem = ROLE_SYSTEM_PROMPTS[agent.role] || 'You are a sub-agent working autonomously on a task. Use available tools. When done, report via team_message(role: "manager", ...).';

  if (!agent.conversation) {
    agent.conversation = [
      {
        role: 'system',
        content: `${roleSystem}\n\nYour role: ${agent.role}\nYour goal: ${agent.goal}\n\nUse available tools to complete the task. Do not use emojis.`,
      },
      {
        role: 'user',
        content: agent.goal,
      },
    ];
  }

  try {
    while (agent.status === 'running') {
      // Drain incoming messages into conversation
      if (agent.messageQueue.length > 0) {
        const msgs = agent.messageQueue.splice(0, agent.messageQueue.length);
        for (const m of msgs) {
          agent.conversation.push({ role: 'user', content: `[Message from ${m.role}]: ${m.content}` });
        }
      }

      if (agent.iterations >= 30) {
        agent.status = 'idle';
        agent.error = 'Exceeded maximum iterations (30). Waiting for new messages.';
        agent.log.push(`[${new Date().toLocaleTimeString()}] hit iteration limit, going idle`);
        return;
      }
      agent.iterations++;

      const response = await callAI(agent.conversation, agent.model);
      agent.conversation.push(response);

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

          const result = await executor(funcName, funcArgs, { senderRole: agent.role, senderAgentId: agent.id });
          const resultStr = typeof result === 'object' ? JSON.stringify(result) : String(result);

          agent.conversation.push({
            role: 'tool',
            tool_call_id: call.id,
            content: resultStr,
          });

          agent.lastAction = funcName;
          const argPreview = Object.keys(funcArgs).length > 0 ? Object.entries(funcArgs).map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`).join(', ') : '';
          agent.lastActionDetail = `${funcName}(${argPreview})`;
          const logSummary = summarizeResult(funcName, result);
          agent.log.push(`[${new Date().toLocaleTimeString()}] ${funcName}: ${logSummary}`);
        }
      } else {
        // AI returned text without tool calls -- go idle, wait for messages
        agent.result = response.content;
        agent.status = 'idle';
        agent.lastActionDetail = 'idle -- waiting for messages';
        agent.log.push(`[${new Date().toLocaleTimeString()}] went idle`);
        return;
      }
    }
  } catch (error) {
    agent.status = 'failed';
    agent.error = error.message;
    agent.log.push(`[${new Date().toLocaleTimeString()}] ERROR: ${error.message}`);
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handleAgentSpawn(args) {
  const { goal, task, role, model } = args;
  const agentGoal = goal || task;

  if (!agentGoal) {
    return { type: 'error', message: 'No goal or task provided for the agent.' };
  }

  const id = nextAgentId();
  const agent = {
    id,
    role: role || 'agent',
    model: model || null,
    goal: agentGoal,
    status: 'running',
    createdAt: Date.now(),
    iterations: 0,
    lastAction: null,
    lastActionDetail: null,
    result: null,
    error: null,
    log: [],
    conversation: null,
    messageQueue: [],
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
  const statusLabel = agent.status;
  const lines = [
    `${agent.id} [${statusLabel}] ${age}s | step ${agent.iterations}`,
    `Role: ${agent.role}`,
    `Goal: ${agent.goal}`,
  ];

  if (agent.lastActionDetail) {
    lines.push(`Last: ${agent.lastActionDetail}`);
  }

  if (agent.log.length > 0) {
    lines.push('Log:');
    agent.log.slice(-8).forEach(l => lines.push(`  ${l}`));
  }

  if (agent.result) {
    lines.push('');
    lines.push('Result:');
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

  agent.status = 'stopped';
  return { type: 'generic', message: `Agent ${agent_id} stopped.` };
}

export async function handleAgentReport(args) {
  const { agent_id } = args;
  if (!agent_id) return { type: 'error', message: 'No agent_id provided.' };

  const agent = agents.get(agent_id);
  if (!agent) return { type: 'error', message: `Agent not found: ${agent_id}` };

  if (!agent.report) {
    if ((agent.status === 'completed' || agent.status === 'idle') && agent.result) {
      agent.report = {
        role: agent.role || 'agent',
        status: agent.status,
        model: agent.model || activeModel,
        task: agent.goal.slice(0, 50),
        summary: agent.result.slice(0, 200),
        findings: [],
        issues: [],
        recommendations: [],
      };
    } else {
      return { type: 'generic', message: `Agent ${agent_id} is ${agent.status} and has no report yet.` };
    }
  }

  return { type: 'agent_report', report: agent.report };
}

export async function handleAgentReportAll() {
  const reports = [];
  for (const [id, agent] of agents.entries()) {
    if (agent.status === 'completed' || agent.status === 'idle') {
      if (!agent.report && agent.result) {
        agent.report = {
          role: agent.role || 'agent',
          status: agent.status,
          model: agent.model || activeModel,
          task: agent.goal.slice(0, 50),
          summary: agent.result.slice(0, 200),
          findings: [],
          issues: [],
          recommendations: [],
        };
      }
      if (agent.report) {
        reports.push(agent.report);
      }
    }
  }
  return { type: 'agent_report_all', reports };
}

// ── Team spawn ────────────────────────────────────────────────────────────────
// Spawns all roles. The manager gets the user's task directly.
// Other roles get a "stand by" goal so they start their loop and wait for
// messages from the manager via team_message.

export async function handleTeamSpawn(args) {
  const { task, team_id } = args;
  if (!task) return { type: 'error', message: 'No task provided for the team.' };

  const preset = TEAM_PRESETS[team_id] || TEAM_PRESETS['full-stack'];
  const spawnedIds = [];

  // Collect the role names so the manager knows who is on the team
  const teamRoles = preset.map(r => r.role).filter(r => r !== 'manager');
  const teamRolesStr = teamRoles.join(', ');

  for (const roleDef of preset) {
    const id = nextAgentId();
    const isManager = roleDef.role === 'manager';
    const agentGoal = isManager
      ? `User task: ${task}\n\nYour team members are: ${teamRolesStr}.\nBreak this task down and use team_message to send each team member a detailed prompt. Then inform the user what you delegated.`
      : `You are the ${roleDef.role}. You are part of a team working on: "${task}"\n\nWait for detailed instructions from the manager. The manager will send you a specific task via team_message. When you receive it, execute it thoroughly, then report back to the manager using team_message(role: "manager", message: "...").`;

    const agent = {
      id,
      role: roleDef.role,
      model: roleDef.model || null,
      goal: agentGoal,
      status: isManager ? 'running' : 'queued',
      createdAt: Date.now(),
      iterations: 0,
      lastAction: null,
      lastActionDetail: isManager ? null : 'queued -- waiting for manager',
      result: null,
      error: null,
      log: [],
      conversation: null,
      messageQueue: [],
    };
    agents.set(id, agent);
    spawnedIds.push(id);

    if (isManager) {
      // Only the manager starts running immediately
      runAgentLoop(agent).catch(err => {
        agent.status = 'failed';
        agent.error = err.message;
      });
    }
    // Other roles stay queued until the manager sends them a team_message
  }

  return {
    type: 'team_result',
    agents: spawnedIds
  };
}

// ── Team message ──────────────────────────────────────────────────────────────

export async function handleTeamMessage(args, _toolName, context = {}) {
  const { role, message } = args;
  if (!role || !message) return { type: 'error', message: 'role and message are required.' };

  const senderRole = context.senderRole || 'user';

  // Log to the team chat for UI visibility
  teamChatLog.push({
    from: senderRole,
    to: role,
    message: message.slice(0, 200),
    ts: Date.now(),
  });

  // Message to the user -- push to UI queue
  if (role === 'user') {
    userMessageQueue.push({ sender: senderRole, message });
    return { type: 'generic', message: 'Message sent to user.' };
  }

  // Find the target agent by role
  let targetAgent = null;
  for (const a of agents.values()) {
    if (a.role === role && a.status !== 'stopped') {
      targetAgent = a;
      break;
    }
  }

  if (!targetAgent) {
    return { type: 'error', message: `No active agent found with role: ${role}` };
  }

  targetAgent.messageQueue.push({ role: senderRole, content: message });
  targetAgent.log.push(`[${new Date().toLocaleTimeString()}] received message from ${senderRole}`);

  // Wake up idle or queued agents
  if (targetAgent.status === 'idle' || targetAgent.status === 'queued' || targetAgent.status === 'completed') {
    targetAgent.status = 'running';
    targetAgent.lastActionDetail = `processing message from ${senderRole}`;
    runAgentLoop(targetAgent).catch(err => {
      targetAgent.status = 'failed';
      targetAgent.error = err.message;
    });
  }

  return { type: 'generic', message: `Message sent to ${role}.` };
}
