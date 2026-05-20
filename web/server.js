import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createReadStream } from 'fs';
import { Readable } from 'stream';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const CONFIG_DIR = path.join(os.homedir(), '.vibe-code');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const SESSIONS_DIR = path.join(CONFIG_DIR, 'sessions');
const REWIND_DIR = path.join(CONFIG_DIR, 'rewind');
const ENV_PATH = path.join(CONFIG_DIR, '.env');

// ── Config ───────────────────────────────────────────────────────────────────
async function loadConfig() {
  try { return JSON.parse(await fs.readFile(CONFIG_PATH, 'utf-8')); } catch { return {}; }
}
async function saveConfig(updates) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const existing = await loadConfig();
  await fs.writeFile(CONFIG_PATH, JSON.stringify({ ...existing, ...updates }, null, 2));
}

// ── Env ──────────────────────────────────────────────────────────────────────
async function loadEnv() {
  try {
    const content = await fs.readFile(ENV_PATH, 'utf-8');
    const vars = {};
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      vars[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
    return vars;
  } catch { return {}; }
}
async function saveEnv(key, value) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  let lines = [];
  try { lines = (await fs.readFile(ENV_PATH, 'utf-8')).split('\n'); } catch {}
  let found = false;
  lines = lines.map(l => { if (l.trim().startsWith(key + '=')) { found = true; return `${key}=${value}`; } return l; });
  if (!found) lines.push(`${key}=${value}`);
  await fs.writeFile(ENV_PATH, lines.join('\n'));
}

// ── Tool Execution ───────────────────────────────────────────────────────────
const SKIP_DIRS = ['node_modules', '.git', '.cache', 'dist', 'build'];

async function walkDir(dir, results, max = 500) {
  if (results.length >= max) return;
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (results.length >= max) return;
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.includes(e.name)) await walkDir(full, results, max); }
    else if (e.isFile()) results.push(full);
  }
}

function globToRegex(pattern) {
  let r = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') { r += pattern[i+1] === '*' ? (i += 2, '.*') : (i++, '[^/]*'); }
    else if (c === '?') { r += '[^/]'; i++; }
    else if (c === '.') { r += '\\.'; i++; }
    else { r += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); i++; }
  }
  return new RegExp('^' + r + '$');
}

// ── Agent System ─────────────────────────────────────────────────────────────
const agents = new Map();
let agentCounter = 0;
const nextAgentId = () => `agent_${++agentCounter}`;

const AGENT_COLORS = [
  'red', 'green', 'yellow', 'blue', 'magenta',
  'orange', 'pink', 'teal', 'lavender',
];
const nextColor = () => AGENT_COLORS[agentCounter % AGENT_COLORS.length];

const AGENT_TYPES = {
  explore: {
    name: 'Explore',
    description: 'Explore codebase and report findings',
    systemPrompt: 'You are an exploration agent. Your goal is to thoroughly explore the codebase and report your findings. Be comprehensive but concise. Focus on file structure, key patterns, and important code.',
    color: 'teal',
  },
  plan: {
    name: 'Plan',
    description: 'Design implementation plans',
    systemPrompt: 'You are a planning agent. Your goal is to design a detailed implementation plan. Consider architecture, trade-offs, and step-by-step execution. Output a clear, actionable plan.',
    color: 'blue',
  },
  verify: {
    name: 'Verify',
    description: 'Verify implementation correctness',
    systemPrompt: 'You are a verification agent. Your goal is to verify that implementation work is correct. Run tests, check code quality, and validate against requirements. Report any issues found.',
    color: 'green',
  },
  code: {
    name: 'Code',
    description: 'Write and edit code',
    systemPrompt: 'You are a coding agent. Your goal is to write clean, correct code. Follow existing patterns, handle edge cases, and ensure quality. Be thorough but efficient.',
    color: 'magenta',
  },
  debug: {
    name: 'Debug',
    description: 'Investigate and fix bugs',
    systemPrompt: 'You are a debugging agent. Your goal is to investigate issues and fix bugs. Identify root causes, understand error patterns, and implement proper fixes.',
    color: 'red',
  },
};

function summarizeResult(funcName, result) {
  if (typeof result === 'string') return result.slice(0, 100);
  if (!result || !result.type) return String(result).slice(0, 100);
  switch (result.type) {
    case 'file_created': return `created ${shortenPath(result.path)} (${result.lineCount} lines)`;
    case 'file_edited': return `edited ${shortenPath(result.path)} (+${result.totalAdded} -${result.totalRemoved})`;
    case 'file_read': return `read ${shortenPath(result.path)} (${result.lineCount} lines)`;
    case 'bash_result': return `exit ${result.exitCode}: ${(result.stdout || '').trim().split('\n')[0].slice(0, 60)}`;
    case 'agent_spawned': return `spawned ${result.id}`;
    case 'error': return `error: ${(result.message || '').slice(0, 80)}`;
    case 'generic': return (result.message || '').split('\n')[0].slice(0, 100);
    default: return `${result.type}`;
  }
}

function shortenPath(p) {
  const cwd = process.cwd();
  if (p && p.startsWith(cwd)) return p.slice(cwd.length + 1);
  return p;
}

async function callAgentAI(messages) {
  const config = await loadConfig();
  const env = await loadEnv();
  const provider = config.provider || { name: 'opencode', baseUrl: 'https://opencode.ai/zen/v1', apiKey: '' };
  const model = config.activeModel || 'gpt-4o';
  const key = provider.apiKey || env.OPENAI_API_KEY || '';

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Authorization': `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model, messages, tools: agentToolsDef, stream: false }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Agent API Error ${res.status}: ${err.slice(0, 100)}`);
  }

  const json = await res.json();
  return json.choices[0].message;
}

const agentToolsDef = [
  { type: 'function', function: { name: 'run_bash', description: 'Execute a shell command.', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'read_file', description: 'Read file contents.', parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Create or overwrite a file.', parameters: { type: 'object', properties: { file_path: { type: 'string' }, content: { type: 'string' } }, required: ['file_path', 'content'] } } },
  { type: 'function', function: { name: 'edit_file', description: 'Edit a file using SEARCH/REPLACE blocks.', parameters: { type: 'object', properties: { file_path: { type: 'string' }, diff: { type: 'string' } }, required: ['file_path', 'diff'] } } },
  { type: 'function', function: { name: 'glob_files', description: 'Find files matching a glob pattern.', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'grep_search', description: 'Search file contents.', parameters: { type: 'object', properties: { search_term: { type: 'string' }, path: { type: 'string' } }, required: ['search_term'] } } },
  { type: 'function', function: { name: 'web_fetch', description: 'Fetch a URL.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'web_search', description: 'Search the web.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'agent_spawn', description: 'Spawn a sub-agent. Optional: specify type (explore, plan, verify, code, debug) for specialized behavior.', parameters: { type: 'object', properties: { goal: { type: 'string' }, type: { type: 'string', enum: ['explore', 'plan', 'verify', 'code', 'debug'], description: 'Agent type for specialized behavior' } }, required: ['goal'] } } },
  { type: 'function', function: { name: 'agent_list', description: 'List agents.' } },
  { type: 'function', function: { name: 'agent_get', description: 'Get agent status.', parameters: { type: 'object', properties: { agent_id: { type: 'string' } }, required: ['agent_id'] } } },
];

async function runAgentLoop(agent, systemPrompt) {
  const defaultPrompt = `You are a sub-agent working autonomously on a task. Your goal: ${agent.goal}\n\nUse available tools to complete the task. Be thorough. When done, provide a clear summary of what you accomplished.\n\nDo not use emojis in any output.`;
  const conversation = [
    { role: 'system', content: systemPrompt ? `${systemPrompt}\n\nYour specific goal: ${agent.goal}` : defaultPrompt },
    { role: 'user', content: agent.goal },
  ];

  try {
    while (agent.status === 'running') {
      agent.iterations++;
      const response = await callAgentAI(conversation);
      conversation.push(response);

      if (response.tool_calls && response.tool_calls.length > 0) {
        for (const call of response.tool_calls) {
          const funcName = call.function.name;
          let funcArgs;
          try { funcArgs = JSON.parse(call.function.arguments || '{}'); } catch { funcArgs = {}; }

          const result = await executeTool(funcName, funcArgs);
          conversation.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });

          agent.lastAction = funcName;
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

async function executeTool(name, args) {
  try {
    switch (name) {
      case 'run_bash': {
        return await new Promise(resolve => {
          exec(args.command, { timeout: 30000, maxBuffer: 10*1024*1024, cwd: process.cwd(), shell: '/bin/sh' },
            (err, stdout, stderr) => resolve({
              type: 'bash_result', command: args.command,
              stdout: stdout || '', stderr: stderr || '',
              exitCode: err ? (err.code ?? 1) : 0, timedOut: err?.killed || false
            }));
        });
      }
      case 'read_file': {
        const p = path.isAbsolute(args.file_path) ? args.file_path : path.resolve(process.cwd(), args.file_path);
        const content = await fs.readFile(p, 'utf-8');
        return { type: 'file_read', path: p, content: content.slice(0, 500000), lineCount: content.split('\n').length, truncated: content.length > 500000 };
      }
      case 'write_file': {
        const p = path.isAbsolute(args.file_path) ? args.file_path : path.resolve(process.cwd(), args.file_path);
        let old = null;
        try { old = await fs.readFile(p, 'utf-8'); } catch {}
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, args.content, 'utf-8');
        return { type: 'file_created', path: p, content: args.content, oldContent: old, bytes: Buffer.byteLength(args.content), lineCount: args.content.split('\n').length, isNew: old === null };
      }
      case 'edit_file': {
        const p = path.isAbsolute(args.file_path) ? args.file_path : path.resolve(process.cwd(), args.file_path);
        const original = await fs.readFile(p, 'utf-8');
        let content = original;
        const blocks = [];
        const re = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;
        let m;
        while ((m = re.exec(args.diff)) !== null) blocks.push({ search: m[1], replace: m[2] });
        if (!blocks.length) return { type: 'error', message: 'No valid SEARCH/REPLACE blocks found.' };
        let totalAdded = 0, totalRemoved = 0;
        const detailed = [];
        for (const b of blocks) {
          const idx = content.indexOf(b.search);
          if (idx === -1) return { type: 'error', message: `SEARCH text not found: ${b.search.slice(0, 60)}` };
          const sl = b.search.split('\n'), rl = b.replace.split('\n');
          totalRemoved += sl.length; totalAdded += rl.length;
          detailed.push({ ...b, searchLines: sl, replaceLines: rl, lineNum: content.slice(0, idx).split('\n').length });
          content = content.slice(0, idx) + b.replace + content.slice(idx + b.search.length);
        }
        await fs.writeFile(p, content, 'utf-8');
        return { type: 'file_edited', path: p, blocks: detailed, totalAdded, totalRemoved, blockCount: blocks.length, oldContent: original, newContent: content };
      }
      case 'glob_files': {
        const files = [];
        await walkDir(process.cwd(), files);
        const cwd = process.cwd();
        const rels = files.map(f => path.relative(cwd, f));
        const isMatch = globToRegex(args.pattern);
        return { type: 'generic', message: rels.filter(f => isMatch.test(f)).slice(0, 500).join('\n') || 'No files matched.' };
      }
      case 'grep_search': {
        const root = args.path ? path.resolve(process.cwd(), args.path) : process.cwd();
        let regex;
        try { regex = new RegExp(args.search_term, 'gi'); }
        catch { regex = new RegExp(args.search_term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); }
        const files = [];
        await walkDir(root, files, 5000);
        const matches = [];
        for (const f of files) {
          if (matches.length >= 200) break;
          try {
            const c = await fs.readFile(f, 'utf-8');
            if (c.indexOf('\0') !== -1) continue;
            c.split('\n').forEach((line, i) => {
              regex.lastIndex = 0;
              if (regex.test(line)) matches.push(`${path.relative(root, f)}:${i+1}:  ${line}`);
            });
          } catch {}
        }
        return { type: 'generic', message: matches.join('\n') || 'No matches found.' };
      }
      case 'web_fetch': {
        const res = await fetch(args.url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'VibeCode/1.0' } });
        if (!res.ok) return { type: 'error', message: `HTTP ${res.status}` };
        const text = await res.text();
        return { type: 'generic', message: text.slice(0, 50000) };
      }
      case 'web_search': {
        try {
          const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`, {
            signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          const html = await res.text();
          const results = [];
          const linkRe = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
          let lm;
          while ((lm = linkRe.exec(html)) && results.length < 10) results.push({ url: lm[1], title: lm[2].replace(/<[^>]+>/g, '').trim() });
          if (!results.length) return { type: 'generic', message: 'No results found.' };
          return { type: 'generic', message: results.map((r, i) => `${i+1}. ${r.title} - ${r.url}`).join('\n') };
        } catch (e) { return { type: 'generic', message: `Search failed: ${e.message}` }; }
      }
      case 'agent_spawn': {
        const { goal, type } = args;
        if (!goal) return { type: 'error', message: 'No goal provided for agent.' };
        const agentType = type && AGENT_TYPES[type] ? AGENT_TYPES[type] : null;
        const id = nextAgentId();
        const color = agentType ? agentType.color : nextColor();
        const agent = {
          id, goal, status: 'running', createdAt: Date.now(),
          iterations: 0, lastAction: null, result: null, error: null, log: [], color,
          type: type || null,
        };
        agents.set(id, agent);
        runAgentLoop(agent, agentType?.systemPrompt).catch(err => { agent.status = 'failed'; agent.error = err.message; });
        return { type: 'agent_spawned', id, goal, color };
      }
      case 'agent_list': {
        if (agents.size === 0) return { type: 'generic', message: 'No agents.' };
        const lines = [];
        for (const [, agent] of agents) {
          const age = Math.round((Date.now() - agent.createdAt) / 1000);
          const status = agent.status === 'running' ? 'running' : agent.status === 'completed' ? 'done' : agent.status;
          const goal = agent.goal.length > 50 ? agent.goal.slice(0, 50) + '...' : agent.goal;
          lines.push(`${agent.id} [${status}] ${age}s | ${goal}`);
        }
        return { type: 'generic', message: lines.join('\n') };
      }
      case 'agent_get': {
        const { agent_id } = args;
        if (!agent_id) return { type: 'error', message: 'No agent_id provided.' };
        const agent = agents.get(agent_id);
        if (!agent) return { type: 'error', message: `Agent not found: ${agent_id}` };
        const age = Math.round((Date.now() - agent.createdAt) / 1000);
        const statusLabel = agent.status === 'running' ? 'running' : agent.status === 'completed' ? 'done' : agent.status;
        const lines = [`${agent.id} [${statusLabel}] ${age}s | step ${agent.iterations}`, `Goal: ${agent.goal}`];
        if (agent.lastAction) lines.push(`Last: ${agent.lastAction}`);
        if (agent.log.length > 0) { lines.push('Log:'); agent.log.slice(-5).forEach(l => lines.push(`  ${l}`)); }
        if (agent.result) { lines.push('', 'Result:'); agent.result.split('\n').slice(0, 5).forEach(l => lines.push(`  ${l}`)); }
        if (agent.error) lines.push(`Error: ${agent.error}`);
        return { type: 'generic', message: lines.join('\n') };
      }
      case 'agent_stop': {
        const { agent_id } = args;
        if (!agent_id) return { type: 'error', message: 'No agent_id provided.' };
        const agent = agents.get(agent_id);
        if (!agent) return { type: 'error', message: `Agent not found: ${agent_id}` };
        if (agent.status !== 'running') return { type: 'generic', message: `Agent ${agent_id} is already ${agent.status}.` };
        agent.status = 'stopped';
        return { type: 'generic', message: `Agent ${agent_id} stopped.` };
      }
      default: return { type: 'generic', message: `Tool ${name} not implemented.` };
    }
  } catch (e) { return { type: 'error', message: e.message }; }
}

// ── API Routes ───────────────────────────────────────────────────────────────
app.get('/api/agents', async (req, res) => {
  const list = [];
  for (const [id, agent] of agents) {
    list.push({
      id: agent.id, goal: agent.goal, status: agent.status,
      createdAt: agent.createdAt, iterations: agent.iterations,
      lastAction: agent.lastAction, result: agent.result,
      error: agent.error, log: agent.log, color: agent.color,
    });
  }
  res.json(list);
});

app.get('/api/files', async (req, res) => {
  const files = [];
  await walkDir(process.cwd(), files, 500);
  const cwd = process.cwd();
  const rels = files.map(f => path.relative(cwd, f)).sort();
  res.json(rels);
});

app.get('/api/config', async (req, res) => {
  const config = await loadConfig();
  const env = await loadEnv();
  res.json({ config, env: { OPENAI_API_KEY: env.OPENAI_API_KEY, BASE_URL: env.BASE_URL } });
});

app.post('/api/config', async (req, res) => {
  await saveConfig(req.body);
  res.json({ ok: true });
});

app.post('/api/env', async (req, res) => {
  const { key, value } = req.body;
  await saveEnv(key, value);
  res.json({ ok: true });
});

app.get('/api/models', async (req, res) => {
  const config = await loadConfig();
  const env = await loadEnv();
  const provider = config.provider || { name: 'opencode', baseUrl: 'https://opencode.ai/zen/v1', apiKey: '' };
  const key = provider.apiKey || env.OPENAI_API_KEY || '';
  const modelsUrl = provider.modelsUrl || `${provider.baseUrl}/models`;
  try {
    const r = await fetch(modelsUrl, { headers: key ? { 'Authorization': `Bearer ${key}` } : {} });
    const json = await r.json();
    res.json({ models: json.data.map(m => m.id), provider });
  } catch (e) { res.json({ models: [], provider, error: e.message }); }
});

app.post('/api/chat', async (req, res) => {
  const { messages, model, tools } = req.body;
  const config = await loadConfig();
  const env = await loadEnv();
  const provider = config.provider || { name: 'opencode', baseUrl: 'https://opencode.ai/zen/v1', apiKey: '' };
  const key = provider.apiKey || env.OPENAI_API_KEY || '';

  const systemPrompt = { role: 'system', content: 'You are a helpful coding assistant. Do not use emojis in any response. Use plain text only. Use >, -, *, or numbers for lists. Use backticks for code.' };
  const apiMessages = [systemPrompt, ...messages.filter(m => m.role !== 'system' && m.role !== 'tool_call')];

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;

  try {
    const apiRes = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages: apiMessages, tools, stream: true }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.text();
      res.status(apiRes.status).json({ error: err });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = apiRes.body.getReader();
    const decoder = new TextDecoder();

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      res.end();
    };
    await pump();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tool', async (req, res) => {
  const { name, args } = req.body;
  const result = await executeTool(name, args);
  res.json(result);
});

// ── Sessions ─────────────────────────────────────────────────────────────────
app.get('/api/sessions', async (req, res) => {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  const files = await fs.readdir(SESSIONS_DIR);
  const sessions = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try { sessions.push(JSON.parse(await fs.readFile(path.join(SESSIONS_DIR, f), 'utf-8'))); } catch {}
  }
  sessions.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  res.json(sessions);
});

app.get('/api/sessions/:id', async (req, res) => {
  try { res.json(JSON.parse(await fs.readFile(path.join(SESSIONS_DIR, `${req.params.id}.json`), 'utf-8'))); }
  catch { res.status(404).json({ error: 'Not found' }); }
});

app.post('/api/sessions', async (req, res) => {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  const session = req.body;
  await fs.writeFile(path.join(SESSIONS_DIR, `${session.id}.json`), JSON.stringify(session, null, 2));
  res.json({ ok: true });
});

app.delete('/api/sessions/:id', async (req, res) => {
  try { await fs.unlink(path.join(SESSIONS_DIR, `${req.params.id}.json`)); res.json({ ok: true }); }
  catch { res.status(404).json({ error: 'Not found' }); }
});

// ── Checkpoints ──────────────────────────────────────────────────────────────
app.get('/api/checkpoints/:sessionId', async (req, res) => {
  const indexPath = path.join(REWIND_DIR, `${req.params.sessionId}_index.json`);
  try { res.json(JSON.parse(await fs.readFile(indexPath, 'utf-8'))); }
  catch { res.json({ sessionId: req.params.sessionId, checkpoints: [], current: 0 }); }
});

app.post('/api/checkpoints', async (req, res) => {
  await fs.mkdir(REWIND_DIR, { recursive: true });
  const { sessionId, messages, label } = req.body;
  const indexPath = path.join(REWIND_DIR, `${sessionId}_index.json`);
  let index;
  try { index = JSON.parse(await fs.readFile(indexPath, 'utf-8')); }
  catch { index = { sessionId, checkpoints: [], current: 0 }; }
  const cpIndex = index.checkpoints.length;
  const cp = { index: cpIndex, sessionId, messages, label, createdAt: new Date().toISOString(), messageCount: messages.length };
  await fs.writeFile(path.join(REWIND_DIR, `${sessionId}_${String(cpIndex).padStart(5, '0')}.json`), JSON.stringify(cp));
  index.checkpoints.push({ index: cpIndex, label, createdAt: cp.createdAt, messageCount: cp.messageCount });
  index.current = cpIndex;
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  res.json(cp);
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Vibe Code server on port ${PORT}`));
