import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import chalk from 'chalk';
import os from 'os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';

// Hooks & Utils
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { wrapText } from './utils/text.js';
import { formatToolResult } from './utils/toolFormatters.js';

function formatMarkdown(text) {
  if (!text) return '';
  let result = text;
  
  const codeBlocks = [];
  // Format code blocks (plain gray text with background)
  result = result.replace(/```([^\n]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    // Add subtle gray background and light gray text
    const hl = chalk.hex('#e5e5e5')(code).split('\n').map(line => chalk.bgHex('#222222')(line)).join('\n');
    
    codeBlocks.push((lang && lang.trim() ? chalk.dim.italic(lang.trim()) + '\n' : '') + hl);
    return `@@@BLOCK_${codeBlocks.length - 1}@@@`;
  });

  // Inline code backticks (soft blue), avoiding newlines to prevent stream flickering
  result = result.replace(/`([^`\n]+)`/g, (match, p1) => chalk.hex('#7eb8f7')(p1));
  // Bold (white bold)
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, (match, p1) => chalk.bold.italic.white(p1));
  result = result.replace(/\*\*(.+?)\*\*/g, (match, p1) => chalk.bold.white(p1));
  result = result.replace(/__(.+?)__/g, (match, p1) => chalk.bold.white(p1));
  // Italic (dim/italic)
  result = result.replace(/\*(.+?)\*/g, (match, p1) => chalk.italic(p1));
  result = result.replace(/_(.+?)_/g, (match, p1) => chalk.italic(p1));
  // Headers (bold brand orange)
  result = result.replace(/^(#{1,6})\s+(.+)$/gm, (match, p1, p2) => chalk.bold.hex('#D77757')(p2));
  // Links (brand orange)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, p1, p2) => `${chalk.underline.hex('#D77757')(p1)} (${chalk.dim(p2)})`);
  // Highlight @ mentions like @[filename] or @filename
  result = result.replace(/(^|\s)@\[([^\]]+)\]/g, (match, space, p1) => space + chalk.bold.hex('#D77757')('@' + p1));
  result = result.replace(/(^|\s)@([a-zA-Z0-9_\-\.\/]+)/g, (match, space, p1) => space + chalk.bold.hex('#D77757')('@' + p1));
  // Bullet markers (keep text, color marker)
  result = result.replace(/^(\s*[-*+]\s+)/gm, (match, p1) => chalk.hex('#D77757')(p1));
  // Numbered list markers
  result = result.replace(/^(\s*\d+\.\s+)/gm, (match, p1) => chalk.hex('#D77757')(p1));

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    result = result.replace(`@@@BLOCK_${i}@@@`, block);
  });

  // Wrap the entire output in white so plain text remains white
  return chalk.white(result);
}

function stripAnsi(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

const getRepoName = (url) => {
  const trimmed = url.replace(/\/+$/, '');
  const parts = trimmed.split('/');
  let name = parts[parts.length - 1] || 'repo';
  if (name.endsWith('.git')) {
    name = name.slice(0, -4);
  }
  return name;
};
import { saveSession, loadSession, listSessions, deleteSession, setSessionFavorite, repairLegacySession, generateSessionId } from './utils/sessions.js';
import { listFiles } from './utils/fileList.js';
import { LOGO_ROWS, COLORS, SYSTEM_PROMPT_TEMPLATE, ROLE_COLORS, ROLE_ICONS } from './constants.js';
import { loadEnv, saveEnv } from './utils/env.js';
import { createCheckpoint, listCheckpoints, rewindTo, forkCheckpoint, getCheckpoint } from './utils/rewind.js';

// Components
import { AnimatedLogo } from './components/AnimatedLogo.jsx';
import { AnimatedInputBox } from './components/AnimatedInputBox.jsx';
import { TeamSelector } from './components/TeamSelector.jsx';
import { AgentReportCard } from './components/AgentReportCard.jsx';
import { ModelSelector } from './components/ModelSelector.jsx';
import { SessionPicker } from './components/SessionPicker.jsx';
import { CommandDropdown, COMMANDS } from './components/CommandDropdown.jsx';
import { ToolConfirmation } from './components/ToolConfirmation.jsx';
import { WorkspaceSelector } from './components/WorkspaceSelector.jsx';
import { ProviderSelector } from './components/ProviderSelector.jsx';

// Tools Engine
import { toolsDefinition } from './tools/definitions.js';
import { executeToolCall } from './tools/executor.js';
import { setApiKey, setBaseUrl, setModel, getAgents, handleTeamMessage, popUserMessages, popTeamChatLog, handleTeamSpawn, spawnHelperAgent } from './tools/handlers/agents.js';
import { getMcpTools, initServers, stopAllServers, activeServers, addServer, removeServer } from './utils/mcp.js';

const CONFIG_DIR = path.join(os.homedir(), '.vibe-code');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_PROVIDER = {
  name: 'opencode',
  baseUrl: 'https://opencode.ai/zen/go/v1',
  apiKey: 'sk-lnuJ2jLlii0Z00TEKuQBugkcw25XJGU3Y8USdUXZzFKWuB8ppTE3Fzme9AzKbKdN',
  modelsUrl: 'https://opencode.ai/zen/go/v1/models',
};

const loadConfig = async () => {
  try {
    return JSON.parse(await fs.readFile(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
};

const saveConfig = async (updates) => {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const existing = await loadConfig();
    await fs.writeFile(CONFIG_PATH, JSON.stringify({ ...existing, ...updates }, null, 2), 'utf-8');
  } catch {}
};

const saveModel = async (model) => saveConfig({ activeModel: model });

const getApiMessages = (msgs, systemPrompt = null) => {
  const filtered = msgs.filter(m => m.role !== 'system' && m.role !== 'tool_call').map(m => {
    if (m.role === 'user') {
      return { role: 'user', content: m.apiContent || m.content };
    }
    if (m.role === 'assistant') {
      const out = { role: 'assistant', content: m.content || '' };
      if (m.tool_calls && m.tool_calls.length > 0) {
        out.tool_calls = m.tool_calls;
      }
      if (m.reasoning_content) {
        out.reasoning_content = m.reasoning_content;
      }
      return out;
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
    }
    return { role: m.role, content: m.content };
  });
  return systemPrompt ? [systemPrompt, ...filtered] : filtered;
};

let toolIdCounter = 0;
const nextToolId = () => `tool_${++toolIdCounter}`;

const messageLinesCache = new WeakMap();

const App = () => {
  const { columns: termWidth, rows: termHeight } = useTerminalSize();

  // Ensure stdin is in raw mode for arrow key capture and strip mouse events
  useEffect(() => {
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(true);
    }
    // Disable mouse tracking
    process.stdout.write('\x1b[?1000l');
    process.stdout.write('\x1b[?1002l');
    process.stdout.write('\x1b[?1006l');
    process.stdout.write('\x1b[?1015l');
    process.stdout.write('\x1b[?1003l');
  }, []);

  // Cleanup MCP servers on unmount
  useEffect(() => {
    return () => {
      stopAllServers();
    };
  }, []);

  const [rawInput, setRawInput] = useState('');
  const MOUSE_SEQ = /\x1b\[<\d+;\d+;\d+[Mm]/g;
  const input = rawInput.replace(MOUSE_SEQ, '');
  const setInput = useCallback((val) => {
    if (typeof val === 'function') {
      setRawInput(prev => val(prev).replace(MOUSE_SEQ, ''));
    } else {
      setRawInput(String(val).replace(MOUSE_SEQ, ''));
    }
  }, []);
  const [currentCwd, setCurrentCwd] = useState(process.cwd());
  const [availableModels, setAvailableModels] = useState([]);
  const [activeModel, setActiveModel] = useState('kimi-k2.6');
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [messages, setMessages] = useState([]);
  const [sessionTitle, setSessionTitle] = useState(null);
  const isGeneratingTitle = React.useRef(false);
  const [askBeforeEdits, setAskBeforeEdits] = useState(true);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [confirmIndex, setConfirmIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = React.useRef(null);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showProviderSelector, setShowProviderSelector] = useState(false);
  const [providers, setProviders] = useState([
    {
      name: 'opencode',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      apiKey: 'sk-lnuJ2jLlii0Z00TEKuQBugkcw25XJGU3Y8USdUXZzFKWuB8ppTE3Fzme9AzKbKdN',
      modelsUrl: 'https://opencode.ai/zen/go/v1/models'
    },
    {
      name: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKey: ''
    },
    {
      name: 'opengateway',
      baseUrl: 'https://opengateway.gitlawb.com/v1',
      apiKey: '',
      modelsUrl: 'https://opengateway.gitlawb.com/v1/models'
    }
  ]);
  const [chatScroll, setChatScroll] = useState(0);
  const [showAgentDetail, setShowAgentDetail] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [pickerSessions, setPickerSessions] = useState([]);
  const [dropdownIndex, setDropdownIndex] = useState(0);
  const [pendingDropdownAction, setPendingDropdownAction] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [checkpointList, setCheckpointList] = useState([]);
  const [showThinking, setShowThinking] = useState(true);
  const [activeTeam, setActiveTeam] = useState('solo');
  const [showTeamSelector, setShowTeamSelector] = useState(false);
  const [sessionEdits, setSessionEdits] = useState([]);
  const [activeAgents, setActiveAgents] = useState([]);
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [helpersEnabled, setHelpersEnabled] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false);
  const [availableWorkspaces, setAvailableWorkspaces] = useState([]);
  const [appVersion, setAppVersion] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      const agentsMap = getAgents();
      const list = Array.from(agentsMap.values()).filter(a => a.status !== 'stopped');
      setActiveAgents(list);

      // Show messages from agents to the user
      const incoming = popUserMessages();
      if (incoming.length > 0) {
        setMessages(prev => {
          const newMsgs = [...prev];
          for (const m of incoming) {
            if (m.isHelper) {
              newMsgs.push({
                role: 'system',
                isHelperResult: true,
                helperRole: m.sender,
                content: `[${m.sender}] ${m.message}`
              });
            } else {
              newMsgs.push({ role: 'assistant', content: `[${m.sender}] ${m.message}` });
            }
          }
          return newMsgs;
        });
      }

      // Show inter-agent chatter in the chat log
      const chatLog = popTeamChatLog();
      if (chatLog.length > 0) {
        setMessages(prev => {
          const newMsgs = [...prev];
          for (const entry of chatLog) {
            if (entry.to !== 'user') {
              newMsgs.push({ role: 'system', content: `[${entry.from} -> ${entry.to}] ${entry.message}` });
            }
          }
          return newMsgs;
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const [activeRole, setActiveRole] = useState(null);
  const [tokenUsage, setTokenUsage] = useState({ used: 0, limit: 128000 });

  // Load files when @ is typed
  useEffect(() => {
    if (input.includes('@')) {
      listFiles().then(f => setFileList(f)).catch(() => {});
    }
  }, [input.includes('@')]);

  // Load checkpoints when /rewind or /branch is typed
  useEffect(() => {
    if ((input.startsWith('/rewind') || input.startsWith('/branch')) && sessionId) {
      listCheckpoints(sessionId).then(cps => setCheckpointList(cps)).catch(() => {});
    }
  }, [input.startsWith('/rewind'), input.startsWith('/branch'), sessionId]);
  const sessionIdRef = React.useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Handle async dropdown actions (resume/delete) outside useInput
  useEffect(() => {
    if (!pendingDropdownAction) return;
    const action = pendingDropdownAction;
    setPendingDropdownAction(null);
    (async () => {
      if (action.type === 'resume') {
        const session = await loadSession(action.session.id);
        if (session) {
          setSessionId(session.id);
          setSessionTitle(session.title || null);
          isGeneratingTitle.current = !!session.title;
          if (session.model) { setActiveModel(session.model); saveModel(session.model); }
          setMessages([...session.messages, { role: 'system', content: `Resumed: ${session.title || session.id}` }]);
        }
      } else if (action.type === 'delete') {
        await deleteSession(action.session.id);
        if (action.currentSessionId === action.session.id) setSessionId(null);
        setMessages(prev => [...prev, { role: 'system', content: `Deleted: ${action.session.title || action.session.id}` }]);
      }
    })();
  }, [pendingDropdownAction]);

  const isSubDropdown = (input.startsWith('/model ') || input.startsWith('/resume ') || input.startsWith('/delete ') || input.startsWith('/rewind ') || input.startsWith('/branch '));
  const hasAtMention = input.includes('@');
  const showDropdown = (input.startsWith('/') && input.length > 0) || hasAtMention;
  const filteredCommands = isSubDropdown || hasAtMention ? [] : COMMANDS.filter(c => c.cmd.startsWith(input.toLowerCase()));
  const dropdownModels = isSubDropdown && input.startsWith('/model ') ? availableModels : [];
  const dropdownSessions = isSubDropdown && (input.startsWith('/resume ') || input.startsWith('/delete ')) ? pickerSessions : [];
  const dropdownFiles = hasAtMention ? fileList : [];

  // Load sessions when /resume or /delete is typed
  useEffect(() => {
    if (input.startsWith('/resume') || input.startsWith('/delete')) {
      listSessions().then(s => setPickerSessions(s)).catch(() => {});
    }
  }, [input.startsWith('/resume'), input.startsWith('/delete')]);

  const homeDir = os.homedir();
  const displayDir = currentCwd.startsWith(homeDir) ? currentCwd.replace(homeDir, '~') : currentCwd;

  // No auto-scroll — user controls position with arrow keys

  // Handle paste from stdin (bracketed paste mode)
  useEffect(() => {
    let pasteBuffer = '';
    let inPaste = false;
    const onData = (data) => {
      const str = data.toString();
      if (str.includes('\x1b[200~')) {
        inPaste = true;
        pasteBuffer = str.split('\x1b[200~')[1] || '';
        if (pasteBuffer.includes('\x1b[201~')) {
          pasteBuffer = pasteBuffer.split('\x1b[201~')[0];
          inPaste = false;
          if (pasteBuffer) setInput(prev => prev + pasteBuffer);
          pasteBuffer = '';
        }
        return;
      }
      if (inPaste) {
        if (str.includes('\x1b[201~')) {
          pasteBuffer += str.split('\x1b[201~')[0];
          inPaste = false;
          if (pasteBuffer) setInput(prev => prev + pasteBuffer);
          pasteBuffer = '';
        } else {
          pasteBuffer += str;
        }
        return;
      }
    };
    process.stdin.on('data', onData);
    return () => process.stdin.off('data', onData);
  }, []);

  // Auto-save session when messages change
  useEffect(() => {
    if (messages.length === 0) return;
    const id = sessionId || generateSessionId();
    if (!sessionId) setSessionId(id);

    // Auto-generate title after the first user+assistant exchange
    if (messages.length >= 2 && !sessionTitle && !isGeneratingTitle.current && provider && activeModel) {
      isGeneratingTitle.current = true;
      const systemPrompt = "You are a title generator. Read the conversation and generate a short 3-5 word title for it. Reply ONLY with the title. No quotes, no markdown, no punctuation.";
      const sample = messages.filter(m => m.role !== 'system').slice(0, 4).map(m => `${m.role}: ${m.content}`).join('\n');
      
      const payload = {
        model: activeModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: sample }
        ],
        stream: false,
        max_tokens: 15
      };

      fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (data.choices && data.choices[0] && data.choices[0].message) {
          const generated = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
          setSessionTitle(generated);
          saveSession(id, messages, activeModel, generated).catch(() => {});
        }
      })
      .catch(() => {
        isGeneratingTitle.current = false;
      });
    }

    saveSession(id, messages, activeModel, sessionTitle).catch(() => {});
  }, [messages, sessionId, provider, activeModel, sessionTitle]);


  // Refresh agent detail overlay every second when open
  const [agentDetailTick, setAgentDetailTick] = useState(0);
  useEffect(() => {
    if (!showAgentDetail) return;
    const timer = setInterval(() => {
      setAgentDetailTick(t => t + 1);
      // Refresh agent data from the store
      const agents = getAgents();
      const fresh = agents.get(showAgentDetail.id);
      if (fresh) setShowAgentDetail({...fresh});
    }, 1000);
    return () => clearInterval(timer);
  }, [showAgentDetail?.id]);

  // Initialize agent system with API key and model
  useEffect(() => {
    (async () => {
      const config = await loadConfig();
      const env = await loadEnv();

      // Load custom providers
      if (config.providers && Array.isArray(config.providers)) {
        setProviders(prev => {
          const merged = [...prev];
          config.providers.forEach(p => {
            const existsIdx = merged.findIndex(existing => existing.name === p.name);
            if (existsIdx >= 0) {
              merged[existsIdx] = p;
            } else {
              merged.push(p);
            }
          });
          return merged;
        });
      }

      // Load saved provider
      if (config.provider) {
        setProvider(config.provider);
        setBaseUrl(config.provider.baseUrl);
        if (config.provider.apiKey) {
          setApiKey(config.provider.apiKey);
        }
      }

      // Load API key from .env (highest priority after provider)
      const envKey = env.OPENAI_API_KEY || env.API_KEY || '';
      const providerKey = config.provider?.apiKey || '';
      const finalKey = providerKey || envKey || process.env.OPENAI_API_KEY || '';
      if (finalKey) {
        setApiKey(finalKey);
        process.env.OPENAI_API_KEY = finalKey;
      }

      // Load base URL and models URL from .env
      if (env.BASE_URL || env.MODELS_URL) {
        const p = { ...config.provider || DEFAULT_PROVIDER };
        if (env.BASE_URL) {
          p.baseUrl = env.BASE_URL;
          setBaseUrl(env.BASE_URL);
        }
        if (env.MODELS_URL) {
          p.modelsUrl = env.MODELS_URL;
        }
        setProvider(p);
      }

      if (config.activeModel) setActiveModel(config.activeModel);
      if (config.activeWorkspace) {
        try {
          process.chdir(config.activeWorkspace);
          setCurrentCwd(config.activeWorkspace);
        } catch {}
      }

      let loadedWorkspaces = config.workspaces || [];
      const initialWp = config.activeWorkspace || process.cwd();
      if (!loadedWorkspaces.includes(initialWp)) {
        loadedWorkspaces = [...loadedWorkspaces, initialWp];
        saveConfig({ workspaces: loadedWorkspaces });
      }
      setWorkspaces(loadedWorkspaces);

      if (config.mcpServers) {
        initServers(config.mcpServers).catch(() => {});
      }

      // Auto update and version check
      try {
        const pkgUrl = new URL('../package.json', import.meta.url);
        const pkgTxt = await fs.readFile(pkgUrl, 'utf-8');
        const pkgJson = JSON.parse(pkgTxt);
        setAppVersion(pkgJson.version);
        
        const { exec } = await import('child_process');
        exec(`npm view ${pkgJson.name} version`, (err, stdout) => {
          if (!err && stdout) {
            const latest = stdout.trim();
            if (latest !== pkgJson.version && latest) {
              setUpdateAvailable(`Updating to v${latest} in background...`);
              exec(`npm install -g ${pkgJson.name}@latest`, (installErr) => {
                if (!installErr) {
                  setUpdateAvailable(`Auto-updated to v${latest}! Restart vibe to apply.`);
                } else {
                  setUpdateAvailable(`Update to v${latest} failed.`);
                }
              });
            }
          }
        });
      } catch (err) {}
    })();
  }, []);

  useEffect(() => {
    if (!showWorkspaceSelector) return;
    (async () => {
      try {
        const parentDir = path.dirname(currentCwd);
        const entries = await fs.readdir(parentDir, { withFileTypes: true });
        const dirs = entries
          .filter(e => e.isDirectory() && !e.name.startsWith('.'))
          .map(e => path.join(parentDir, e.name));
        setAvailableWorkspaces(dirs);
      } catch (err) {
        setAvailableWorkspaces([]);
      }
    })();
  }, [showWorkspaceSelector, currentCwd]);

  useEffect(() => {
    setModel(activeModel);
  }, [activeModel]);

  // Fetch models when provider changes
  useEffect(() => {
    const fetchModels = async () => {
      const modelKey = provider.apiKey || process.env.OPENAI_API_KEY || '';
      try {
        const modelsUrl = provider.modelsUrl || `${provider.baseUrl}/models`;
        const res = await fetch(modelsUrl, {
          headers: modelKey ? { 'Authorization': `Bearer ${modelKey}` } : {},
        });
        const json = await res.json();
        if (json && json.data) {
          setAvailableModels(json.data.map(m => m.id));
        } else {
          setAvailableModels(['gpt-5.5']);
        }
      } catch {
        setAvailableModels([]);
      }
    };
    fetchModels();
  }, [provider.baseUrl, provider.apiKey, provider.modelsUrl]);

  useInput((inputChar, key) => {
    if (pendingConfirmation) {
      if (key.upArrow || key.downArrow) {
        setConfirmIndex(prev => (prev === 0 ? 1 : 0));
        return;
      }
      if (inputChar === 'y' || inputChar === 'Y') {
        pendingConfirmation.resolve({ approved: true });
        setPendingConfirmation(null);
        setConfirmIndex(0);
      } else if (inputChar === 'n' || inputChar === 'N' || key.escape) {
        pendingConfirmation.resolve({ approved: false });
        setPendingConfirmation(null);
        setConfirmIndex(0);
      } else if (key.return) {
        pendingConfirmation.resolve({ approved: confirmIndex === 0 });
        setPendingConfirmation(null);
        setConfirmIndex(0);
      }
      return;
    }
    if (showAgentDetail) {
      if (key.escape || inputChar === 'q' || (key.ctrl && inputChar === 'o')) {
        setShowAgentDetail(null);
      }
      return;
    }
    if (showModelSelector) return;

    // ESC to interrupt loading
    if (key.escape && isLoading) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      setIsLoading(false);
      return;
    }
    if (key.escape && input) {
      setInput('');
      return;
    }

    // Shortcuts
    if (key.ctrl && inputChar === 'm') { setShowModelSelector(true); return; }
    if (key.ctrl && inputChar === 't') { setShowThinking(prev => !prev); return; }

    // Number keys 1-9 to toggle agent expansion (only when team active and input is empty)
    if (activeTeam !== 'solo' && activeAgents.length > 0 && !input && !key.ctrl && !key.meta) {
      const num = parseInt(inputChar, 10);
      if (num >= 1 && num <= Math.min(activeAgents.length, 9)) {
        const agentId = activeAgents[num - 1]?.id;
        if (agentId) {
          setExpandedAgent(prev => prev === agentId ? null : agentId);
          return;
        }
      }
    }
    if (key.ctrl && inputChar === 'o') {
      const agents = getAgents();
      const agentMsgs = messages.filter(m => m.role === 'tool_call' && m.name === 'agent_spawn');
      if (agentMsgs.length > 0) {
        const lastMsg = agentMsgs[agentMsgs.length - 1];
        const agentId = lastMsg.result?.id;
        if (agentId) {
          const agent = agents.get(agentId);
          if (agent) setShowAgentDetail(agent);
        }
      }
      return;
    }

    // File mention navigation @
    if (hasAtMention && showDropdown) {
      const lastAt = input.lastIndexOf('@');
      const query = input.slice(lastAt + 1).toLowerCase();
      const items = fileList.filter(f => f.toLowerCase().includes(query));
      if (items.length > 0) {
        if (key.upArrow) { setDropdownIndex(prev => Math.max(0, prev - 1)); return; }
        if (key.downArrow) { setDropdownIndex(prev => Math.min(items.length - 1, prev + 1)); return; }
        if (key.return) {
          const selected = items[dropdownIndex];
          if (selected) {
            setInput(input.slice(0, lastAt) + '@' + selected + ' ');
            setDropdownIndex(0);
          }
          return;
        }
        if (key.escape) { setInput(input.replace(/@[^@]*$/, '')); return; }
      }
    }

    // Sub-dropdown navigation (models, sessions, checkpoints)
    if (isSubDropdown && showDropdown) {
      let items = [];
      if (input.startsWith('/model ')) {
        const query = input.slice(7).toLowerCase();
        items = availableModels.filter(m => m.toLowerCase().includes(query));
      } else if (input.startsWith('/resume ') || input.startsWith('/delete ')) {
        const query = (input.split(' ')[1] || '').toLowerCase();
        items = pickerSessions.filter(s => (s.title || s.preview || s.id || '').toLowerCase().includes(query));
      } else if (input.startsWith('/rewind ') || input.startsWith('/branch ')) {
        items = checkpointList;
      }
      if (items.length > 0) {
        if (key.upArrow) { setDropdownIndex(prev => Math.max(0, prev - 1)); return; }
        if (key.downArrow) { setDropdownIndex(prev => Math.min(items.length - 1, prev + 1)); return; }
        if (key.return) {
          const selected = items[dropdownIndex];
          if (selected) {
            if (input.startsWith('/model ')) {
              setActiveModel(selected);
              saveModel(selected);
              setMessages(prev => [...prev, { role: 'system', content: `Model switched to: ${selected}` }]);
              setInput('');
            } else if (input.startsWith('/rewind ')) {
              handleSubmit(`/rewind ${selected.index}`);
              return;
            } else if (input.startsWith('/branch ')) {
              handleSubmit(`/branch ${selected.index}`);
              return;
            } else {
              setPendingDropdownAction({ type: input.startsWith('/resume ') ? 'resume' : 'delete', session: selected, currentSessionId: sessionId });
              setInput('');
            }
            setDropdownIndex(0);
          }
          return;
        }
        if (key.escape) { setInput(''); return; }
      }
    }

    // Main command dropdown navigation
    if (showDropdown && filteredCommands.length > 0) {
      if (key.upArrow) { setDropdownIndex(prev => Math.max(0, prev - 1)); return; }
      if (key.downArrow) { setDropdownIndex(prev => Math.min(filteredCommands.length - 1, prev + 1)); return; }
      if (key.return) {
        const selected = filteredCommands[dropdownIndex];
        if (selected) {
          setInput(selected.cmd + ' ');
          setDropdownIndex(0);
        }
        return;
      }
    }

    // Scrolling
    if (key.upArrow) { setChatScroll(prev => prev + 1); return; }
    if (key.downArrow) { setChatScroll(prev => Math.max(0, prev - 1)); return; }
    if (key.pageUp) { setChatScroll(prev => prev + 5); return; }
    if (key.pageDown) { setChatScroll(prev => Math.max(0, prev - 5)); return; }

    // Text input
    if (isLoading) return;
    if (key.return) {
      if (input.trim()) handleSubmit(input);
      return;
    }
    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      setDropdownIndex(0);
      return;
    }
    if (inputChar && !key.ctrl && !key.meta) {
      setInput(prev => prev + inputChar);
      if (inputChar !== '@') setDropdownIndex(0);
    }
  }, { isActive: !showModelSelector });

  const handleModelSelect = useCallback((model) => {
    setActiveModel(model);
    setShowModelSelector(false);
    saveModel(model);
    setMessages(prev => [...prev, { role: 'system', content: `Model switched to: ${model}` }]);
  }, []);

  const confirmAndExecuteTool = async (funcName, funcArgs, onUpdateStatus) => {
    const isMutative = ['run_bash', 'write_file', 'edit_file'].includes(funcName);
    if (isMutative && askBeforeEdits) {
      onUpdateStatus('pending_confirmation');
      const userChoice = await new Promise((resolve) => {
        setPendingConfirmation({ name: funcName, args: funcArgs, resolve });
      });
      if (!userChoice.approved) {
        return { type: 'error', message: 'User rejected tool execution.' };
      }
    }
    onUpdateStatus('running');
    return await executeToolCall(funcName, funcArgs);
  };

  const handleSubmit = async (query) => {
    if (!query.trim() || isLoading || showModelSelector) return;
    const trimmedQuery = query.trim();
    const lowerQuery = trimmedQuery.toLowerCase();

    if (trimmedQuery.startsWith('/')) {
      if (lowerQuery === '/help') {
        const helpText = `[Help] Available Commands:\n  /help         - Show this message\n  /model        - Open the interactive model selector\n  /model <id>   - Switch directly to a model\n  /apikey <key> - Set and save API key\n  /provider     - Switch API provider (opencode/nvidia/opengateway/custom)\n  /rewind       - List checkpoints\n  /rewind <n>   - Rewind to checkpoint N\n  /branch <n>   - Fork from checkpoint N\n  /init         - Analyze codebase and create CLAUDE.md\n  /resume       - List saved sessions\n  /resume <id>  - Restore a saved session\n  /delete <id>  - Delete a saved session\n  /mcp          - List configured MCP servers and their tools\n  /mcp add <name> <command> [args...] - Register and connect an MCP server\n  /mcp remove <name> - Remove an MCP server and its tools\n  /clear        - Clear the chat history\n  /exit         - Exit the app\n  /clone <url>  - Clone a git repository and switch workspace\n  /cd <path>    - Change the current workspace directory\n  /auth github <token> - Set GitHub token for git pushing\n  Ctrl+M        - Shortcut to open model selector\n  Ctrl+T        - Toggle thinking process visibility\n  Ctrl+O        - View agent details (when agent is running)\n\nTools: bash, file ops, search, web, tasks, cron, agents`;
        setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: helpText }]);
      } else if (lowerQuery === '/team') {
        setInput('');
        setShowTeamSelector(true);
        return;
      } else if (lowerQuery === '/agents' || lowerQuery === '/report') {
        const agentsMap = getAgents();
        if (agentsMap.size === 0) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[System] No agents have been spawned this session.' }]);
        } else {
          const newMsgs = [{ role: 'user', content: query }];
          for (const [id, agent] of agentsMap.entries()) {
            if (agent.report) {
              newMsgs.push({ type: 'agent_report_card', report: agent.report });
            } else {
              newMsgs.push({ role: 'system', content: `[System] Agent ${id} (${agent.role || 'unknown'}) is ${agent.status}. Goal: ${agent.goal.slice(0, 50)}...` });
            }
          }
          setMessages(prev => [...prev, ...newMsgs]);
        }
      } else if (lowerQuery === '/diff') {
        if (sessionEdits.length === 0) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[System] No files have been edited this session.' }]);
        } else {
          setMessages(prev => [...prev, { role: 'user', content: query }, { type: 'session_diff_log', edits: sessionEdits }]);
        }
      } else if (lowerQuery === '/model') {
        setInput('');
        setShowModelSelector(true);
        return;
      } else if (lowerQuery.startsWith('/model ')) {
        const newModel = trimmedQuery.split(' ')[1];
        if (newModel) {
          setActiveModel(newModel);
          saveModel(newModel);
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[System] Model switched to: ${newModel}` }]);
        }
      } else if (lowerQuery === '/apikey') {
        const extra = provider?.name === 'opengateway' ? '\nGet your OpenGateway key here: https://gitlawb.com/opengateway/dashboard' : '';
        setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[System] Usage: /apikey <your-api-key>\nThe key is saved to ~/.vibe-code/.env${extra}` }]);
      } else if (lowerQuery.startsWith('/apikey ')) {
        const newKey = trimmedQuery.slice(8).trim();
        if (newKey) {
          try {
            await saveEnv('OPENAI_API_KEY', newKey);
            setApiKey(newKey);
            process.env.OPENAI_API_KEY = newKey;
            
            const updatedProvider = { ...provider, apiKey: newKey };
            setProvider(updatedProvider);
            setProviders(prev => {
              const next = [...prev];
              const idx = next.findIndex(p => p.name === provider.name);
              if (idx >= 0) next[idx] = updatedProvider;
              saveConfig({ provider: updatedProvider, providers: next });
              return next;
            });
            
            setMessages(prev => [...prev, { role: 'user', content: '/apikey ****' }, { role: 'system', content: '[System] API key saved to ~/.vibe-code/.env' }]);
          } catch (err) {
            setMessages(prev => [...prev, { role: 'user', content: '/apikey ****' }, { role: 'system', content: `[Error] Failed to save API key: ${err.message}` }]);
          }
        }
      } else if (lowerQuery === '/provider' || lowerQuery.startsWith('/provider ')) {
        setInput('');
        setShowProviderSelector(true);
        return;
      } else if (lowerQuery === '/clear') {
        setMessages([]);
        setSessionTitle(null);
        isGeneratingTitle.current = false;
        setSessionId(null);
        setChatScroll(0);
        setTokenUsage({ used: 0, limit: 128000 });
        // Clear entire terminal including scrollback
        process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
      } else if (lowerQuery === '/export') {
        try {
          const cwd = process.cwd();
          
          let requests = 0;
          let tasks = [];
          
          messages.forEach(m => {
            if (m.role === 'user') requests++;
            
            // Extract tasks from assistant messages
            if (m.role === 'assistant' && m.content) {
              const lines = m.content.split('\n');
              lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]') || trimmed.startsWith('* [ ]') || trimmed.startsWith('* [x]')) {
                  tasks.push(trimmed);
                }
              });
            }
          });

          const titleStr = sessionTitle ? `## Session: ${sessionTitle}\n\n` : '';
          const report = `# Vibe Terminal Session Report\n\n${titleStr}` +
                         `### Statistics\n` +
                         `- **Requests Sent:** ${requests}\n` +
                         `- **Tokens Used:** ${tokenUsage.used.toLocaleString()} / ${tokenUsage.limit.toLocaleString()}\n\n` +
                         `### Tasks & Todo List\n\n` +
                         (tasks.length > 0 ? tasks.join('\n') : '*No tasks found in this session.*') + '\n';
                         
          const outPath = path.join(cwd, 'vibe-report.md');
          await fs.writeFile(outPath, report, 'utf-8');
          
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[System] Session report exported to ${outPath}` }]);
        } catch (err) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[Error] Failed to export session: ${err.message}` }]);
        }
      } else if (lowerQuery === '/rewind') {
        if (!sessionId) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[System] No active session to rewind. Start a conversation first.' }]);
        } else {
          const checkpoints = await listCheckpoints(sessionId);
          if (checkpoints.length === 0) {
            setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[System] No checkpoints found.' }]);
          } else {
            const lines = ['[Rewind] Checkpoints:\n'];
            checkpoints.forEach((cp, i) => {
              const date = new Date(cp.createdAt).toLocaleTimeString();
              const marker = i === checkpoints.length - 1 ? ' (current)' : '';
              lines.push(`  ${i}: ${cp.label}  ${cp.messageCount} msgs  ${date}${marker}`);
            });
            lines.push('\n  /rewind <number>  - Go back to checkpoint');
            lines.push('  /branch <number>  - Fork from checkpoint');
            setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: lines.join('\n') }]);
          }
        }
      } else if (lowerQuery.startsWith('/rewind ')) {
        const cpIndex = parseInt(trimmedQuery.split(' ')[1]);
        if (isNaN(cpIndex)) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[Error] Usage: /rewind <number>' }]);
        } else {
          const checkpoint = await rewindTo(sessionId, cpIndex);
          if (!checkpoint) {
            setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[Error] Checkpoint ${cpIndex} not found.` }]);
          } else {
            setMessages([...checkpoint.messages, { role: 'system', content: `[Rewound to checkpoint ${cpIndex}: "${checkpoint.label}"]` }]);
            setChatScroll(0);
          }
        }
        setInput('');
        return;
      } else if (lowerQuery.startsWith('/branch ')) {
        const cpIndex = parseInt(trimmedQuery.split(' ')[1]);
        if (isNaN(cpIndex)) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[Error] Usage: /branch <number>' }]);
        } else {
          const result = await forkCheckpoint(sessionId, cpIndex, `branch_from_${cpIndex}`);
          if (!result) {
            setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[Error] Checkpoint ${cpIndex} not found.` }]);
          } else {
            setSessionId(result.forkId);
            setMessages([...result.checkpoint.messages, { role: 'system', content: `[Branched from checkpoint ${cpIndex} as session ${result.forkId}]` }]);
            setChatScroll(0);
          }
        }
        setInput('');
        return;
      } else if (lowerQuery === '/mcp' || lowerQuery === '/mcp list') {
        const lines = ['[MCP] Configured Servers:\n'];
        if (activeServers.size === 0) {
          lines.push('  No MCP servers configured. Add one with:');
          lines.push('  /mcp add <name> <command> [args...]');
          lines.push('  /mcp add <name> <url>');
        } else {
          for (const [name, server] of activeServers.entries()) {
            const statusStr = server.status === 'connected' ? chalk.green('Connected') :
                            server.status === 'connecting' ? chalk.yellow('Connecting...') :
                            server.status === 'failed' ? chalk.red('Failed') : chalk.gray('Disconnected');
            lines.push(`  • ${chalk.bold.hex('#D77757')(name)}: ${statusStr}`);
            if (server.url) {
              lines.push(`    URL: ${server.url}`);
            } else {
              lines.push(`    Command: ${server.command} ${server.args.join(' ')}`);
            }
            if (server.status === 'connected') {
              lines.push(`    Tools (${server.tools.length}): ${server.tools.map(t => t.name).join(', ')}`);
            }
            if (server.error) {
              lines.push(`    Error: ${server.error}`);
            }
            if (server.errorLogs.length > 0) {
              lines.push(`    Logs (last 3 lines):`);
              server.errorLogs.slice(-3).forEach(log => {
                lines.push(`      ${chalk.dim(log)}`);
              });
            }
            lines.push('');
          }
        }
        setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: lines.join('\n') }]);
        setInput('');
        return;
      } else if (lowerQuery.startsWith('/mcp add ')) {
        const parts = trimmedQuery.split(/\s+/);
        const name = parts[2];
        const commandOrUrl = parts[3];
        const args = parts.slice(4);
        if (!name || !commandOrUrl) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[Error] Usage:\n  /mcp add <name> <command> [args...]\n  /mcp add <name> <url>\n\nExample:\n  /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /path/to/folder\n  /mcp add HianimeDocs https://gitmcp.io/beyondbday69/Hianime' }]);
          setInput('');
          return;
        }

        setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[System] Connecting to MCP server "${name}"...` }]);
        try {
          let finalCommand = commandOrUrl;
          let finalArgs = args;
          let url = '';
          let configEntry = { command: commandOrUrl, args };

          if (commandOrUrl.startsWith('http://') || commandOrUrl.startsWith('https://')) {
            finalCommand = 'npx';
            finalArgs = ['-y', 'mcp-remote', commandOrUrl];
            url = commandOrUrl;
            configEntry = { url: commandOrUrl };
          }

          const client = await addServer(name, finalCommand, finalArgs, url);
          const config = await loadConfig();
          const mcpServers = config.mcpServers || {};
          mcpServers[name] = configEntry;
          await saveConfig({ mcpServers });

          setMessages(prev => [...prev, { role: 'system', content: `[System] Successfully connected to MCP server "${name}"!\nRegistered tools: ${client.tools.map(t => t.name).join(', ')}` }]);
        } catch (err) {
          setMessages(prev => [...prev, { role: 'system', content: `[Error] Failed to connect to MCP server "${name}": ${err.message}` }]);
        }
        setInput('');
        return;
      } else if (lowerQuery.startsWith('/mcp remove ') || lowerQuery.startsWith('/mcp delete ')) {
        const parts = trimmedQuery.split(/\s+/);
        const name = parts[2];
        if (!name) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[Error] Usage: /mcp remove <name>' }]);
          setInput('');
          return;
        }

        const removed = removeServer(name);
        if (removed) {
          const config = await loadConfig();
          const mcpServers = config.mcpServers || {};
          delete mcpServers[name];
          await saveConfig({ mcpServers });

          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[System] MCP server "${name}" removed.` }]);
        } else {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[Error] MCP server "${name}" not found.` }]);
        }
        setInput('');
        return;
      } else if (lowerQuery === '/resume' || lowerQuery.startsWith('/resume ')) {
        const arg = query.slice(7).trim();
        if (arg.startsWith('http://') || arg.startsWith('https://')) {
          setIsLoading(true);
          try {
            const res = await fetch(arg);
            const session = await res.json();
            if (session && session.messages) {
              const repaired = repairLegacySession(session.messages);
              setSessionId(session.id || `url_${Date.now()}`);
              setSessionTitle(session.title || null);
              isGeneratingTitle.current = !!session.title;
              if (session.model) { setActiveModel(session.model); saveModel(session.model); }
              setMessages([...repaired, { role: 'user', content: query }, { role: 'system', content: `[System] Resumed session from URL.` }]);
            } else {
              setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[Error] Invalid session JSON from URL.' }]);
            }
          } catch (err) {
            setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[Error] Failed to load URL: ${err.message}` }]);
          }
          setIsLoading(false);
          setInput('');
          return;
        }

        const sessions = await listSessions();
        if (sessions.length === 0) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[System] No saved sessions found.' }]);
        } else {
          // Sort favorites first
          sessions.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
          setPickerSessions(sessions);
          setShowSessionPicker(true);
          setInput('');
          return;
        }
      } else if (lowerQuery === '/delete' || lowerQuery.startsWith('/delete ')) {
        const sessions = await listSessions();
        if (sessions.length === 0) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[System] No sessions to delete.' }]);
        } else {
          sessions.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
          setPickerSessions(sessions);
          setShowSessionPicker(true);
          setInput('');
          return;
        }
      } else if (lowerQuery === '/init') {
        const initPrompt = `Please analyze this codebase and create a CLAUDE.md file, which will be given to future instances of Claude Code to operate in this repository.

What to add:
1. Commands that will be commonly used, such as how to build, lint, and run tests. Include the necessary commands to develop in this codebase, such as how to run a single test.
2. High-level code architecture and structure so that future instances can be productive more quickly. Focus on the "big picture" architecture that requires reading multiple files to understand.

Usage notes:
- If there's already a CLAUDE.md, suggest improvements to it.
- When you make the initial CLAUDE.md, do not repeat yourself and do not include obvious instructions like "Provide helpful error messages to users", "Write unit tests for all new utilities", "Never include sensitive information (API keys, tokens) in code or commits".
- Avoid listing every component or file structure that can be easily discovered.
- Don't include generic development practices.
- If there are Cursor rules (in .cursor/rules/ or .cursorrules) or Copilot rules (in .github/copilot-instructions.md), make sure to include the important parts.
- If there is a README.md, make sure to include the important parts.
- Do not make up information such as "Common Development Tasks", "Tips for Development", "Support and Documentation" unless this is expressly included in other files that you read.
- Be sure to prefix the file with the following text:

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.`;
        // Inject as user message so the AI processes it with full tool access
        let conversation = [...messages, { role: 'user', content: initPrompt }];
        setMessages(conversation);
        setInput('');
        setIsLoading(true);
        try {
          const apiMessages = getApiMessages(conversation);
          const res = await fetch(`${provider.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(provider.apiKey || process.env.OPENAI_API_KEY ? { 'Authorization': `Bearer ${provider.apiKey || process.env.OPENAI_API_KEY}` } : {}),
            },
            body: JSON.stringify({
              model: activeModel,
              messages: apiMessages,
              tools: [...toolsDefinition, ...getMcpTools()],
              stream: true,
              stream_options: { include_usage: true },
            }),
          });
          if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            throw new Error(`${res.status} API Error: ${errBody.slice(0, 200)}`);
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let streamedContent = '';
          let streamedReasoning = '';
          let toolCalls = [];
          conversation = [...conversation, { role: 'assistant', content: '' }];
          setMessages([...conversation]);
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const data = trimmed.slice(6);
              if (data === '[DONE]') continue;
              let parsed;
              try { parsed = JSON.parse(data); } catch { continue; }
              if (parsed.usage) {
                setTokenUsage(prev => ({ ...prev, used: parsed.usage.total_tokens || prev.used }));
              }
              const choice = parsed.choices?.[0];
              if (!choice) continue;
              const delta = choice.delta || {};
              let updated = false;
              if (delta.reasoning_content) {
                streamedReasoning += delta.reasoning_content;
                updated = true;
              }
              if (delta.content) {
                streamedContent += delta.content;
                updated = true;
              }
              if (updated) {
                conversation[conversation.length - 1] = {
                  role: 'assistant',
                  content: streamedContent,
                  reasoning_content: streamedReasoning
                };
                setMessages([...conversation]);
              }
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCalls[idx]) toolCalls[idx] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
                  if (tc.id) toolCalls[idx].id = tc.id;
                  if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                  if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                }
              }
            }
          }
          const responseMsg = { role: 'assistant' };
          if (streamedContent) responseMsg.content = streamedContent;
          if (streamedReasoning) responseMsg.reasoning_content = streamedReasoning;
          if (toolCalls.length > 0) responseMsg.tool_calls = toolCalls;
          conversation[conversation.length - 1] = responseMsg;
          // Execute tool calls if any (same loop as main handleSubmit)
          if (responseMsg.tool_calls && responseMsg.tool_calls.length > 0) {
            setMessages([...conversation]);
            let requiresApiCall = true;
            while (requiresApiCall) {
              for (const call of responseMsg.tool_calls) {
                const funcName = call.function.name;
                let funcArgs;
                try { funcArgs = JSON.parse(call.function.arguments || '{}'); } catch { funcArgs = {}; }
                if (!call.id) call.id = `call_${Date.now()}`;
                const toolId = `tool_${Date.now()}`;
                conversation = [...conversation, { role: 'tool_call', toolId, name: funcName, args: funcArgs, status: 'running', result: null }];
                setMessages([...conversation]);
                const result = await confirmAndExecuteTool(funcName, funcArgs, (newStatus) => {
                  conversation[conversation.length - 1] = {
                    ...conversation[conversation.length - 1],
                    status: newStatus,
                  };
                  setMessages([...conversation]);
                });
                conversation[conversation.length - 1] = { ...conversation[conversation.length - 1], status: 'completed', result };
                setMessages([...conversation]);
                const rawContent = typeof result === 'object' ? JSON.stringify(result) : String(result);
                conversation = [...conversation, { role: 'tool', tool_call_id: call.id, content: rawContent }];
              }
              const apiMessages = getApiMessages(conversation);
              const res2 = await fetch(`${provider.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(provider.apiKey || process.env.OPENAI_API_KEY ? { 'Authorization': `Bearer ${provider.apiKey || process.env.OPENAI_API_KEY}` } : {}),
                },
                body: JSON.stringify({ model: activeModel, messages: apiMessages, tools: [...toolsDefinition, ...getMcpTools()], stream: true, stream_options: { include_usage: true } }),
              });
              if (!res2.ok) throw new Error(`${res2.status} API Error`);
              const reader2 = res2.body.getReader();
              let buffer2 = '', streamed2 = '', reasoning2 = '', toolCalls2 = [];
              conversation = [...conversation, { role: 'assistant', content: '' }];
              setMessages([...conversation]);
              while (true) {
                const { done, value } = await reader2.read();
                if (done) break;
                buffer2 += decoder.decode(value, { stream: true });
                const lines2 = buffer2.split('\n');
                buffer2 = lines2.pop();
                for (const line of lines2) {
                  const trimmed = line.trim();
                  if (!trimmed || !trimmed.startsWith('data: ')) continue;
                  const data = trimmed.slice(6);
                  if (data === '[DONE]') continue;
                  let parsed;
                  try { parsed = JSON.parse(data); } catch { continue; }
                  if (parsed.usage) {
                    setTokenUsage(prev => ({ ...prev, used: parsed.usage.total_tokens || prev.used }));
                  }
                  const choice = parsed.choices?.[0];
                  if (!choice) continue;
                  const delta = choice.delta || {};
                  let updated = false;
                  if (delta.reasoning_content) {
                    reasoning2 += delta.reasoning_content;
                    updated = true;
                  }
                  if (delta.content) {
                    streamed2 += delta.content;
                    updated = true;
                  }
                  if (updated) {
                    conversation[conversation.length - 1] = {
                      role: 'assistant',
                      content: streamed2,
                      reasoning_content: reasoning2
                    };
                    setMessages([...conversation]);
                  }
                  if (delta.tool_calls) {
                    for (const tc of delta.tool_calls) {
                      const idx = tc.index ?? 0;
                      if (!toolCalls2[idx]) toolCalls2[idx] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
                      if (tc.id) toolCalls2[idx].id = tc.id;
                      if (tc.function?.name) toolCalls2[idx].function.name += tc.function.name;
                      if (tc.function?.arguments) toolCalls2[idx].function.arguments += tc.function.arguments;
                    }
                  }
                }
              }
              const resp2 = { role: 'assistant' };
              if (streamed2) resp2.content = streamed2;
              if (reasoning2) resp2.reasoning_content = reasoning2;
              if (toolCalls2.length > 0) resp2.tool_calls = toolCalls2;
              conversation[conversation.length - 1] = resp2;
              responseMsg.tool_calls = toolCalls2;
              if (!toolCalls2.length) {
                setMessages([...conversation]);
                requiresApiCall = false;
              } else {
                setMessages([...conversation]);
              }
            }
          } else {
            setMessages([...conversation]);
          }
        } catch (error) {
          setMessages([...conversation, { role: 'system', content: `[Error] ${error.message}` }]);
        } finally {
          setIsLoading(false);
        }
        return;
      } else if (lowerQuery === '/auto') {
        setAskBeforeEdits(prev => {
          const next = !prev;
          setMessages(m => [...m, { role: 'user', content: query }, { role: 'system', content: `[System] Auto mode toggled. Now: ${next ? 'Ask before edits' : 'Auto execute edits'}` }]);
          return next;
        });
      } else if (lowerQuery === '/helpers') {
        setHelpersEnabled(prev => {
          const next = !prev;
          setMessages(m => [...m, { role: 'user', content: query }, { role: 'system', content: `[System] Helper agents toggled. Now: ${next ? 'Enabled' : 'Disabled'}` }]);
          return next;
        });
      } else if (lowerQuery === '/clone') {
        setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[Error] Usage: /clone <repo-url>' }]);
      } else if (lowerQuery.startsWith('/clone ')) {
        const repoUrl = trimmedQuery.slice(7).trim();
        if (!repoUrl) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[Error] Usage: /clone <repo-url>' }]);
          setInput('');
          return;
        }

        setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[System] Preparing to clone/switch workspace...` }]);
        setIsLoading(true);

        const workspacesDir = path.join(os.homedir(), '.vibe-code', 'workspaces');
        try {
          await fs.mkdir(workspacesDir, { recursive: true });
          const repoName = getRepoName(repoUrl);
          const targetPath = path.join(workspacesDir, repoName);

          let exists = false;
          try {
            const stat = await fs.stat(targetPath);
            if (stat.isDirectory()) exists = true;
          } catch {}

          if (exists) {
            process.chdir(targetPath);
            setCurrentCwd(targetPath);
            await saveConfig({ activeWorkspace: targetPath });
            setMessages(prev => [...prev, { role: 'system', content: `[System] Successfully switched to existing workspace: ${targetPath}` }]);
            setIsLoading(false);
          } else {
            setMessages(prev => [...prev, { role: 'system', content: `[System] Cloning ${repoUrl} to ${targetPath}...` }]);
            exec(`git clone ${repoUrl} "${targetPath}"`, async (err, stdout, stderr) => {
              if (err) {
                setMessages(prev => [...prev, { role: 'system', content: `[Error] Failed to clone workspace: ${stderr || err.message}` }]);
              } else {
                try {
                  process.chdir(targetPath);
                  setCurrentCwd(targetPath);
                  await saveConfig({ activeWorkspace: targetPath });
                  setMessages(prev => [...prev, { role: 'system', content: `[System] Successfully cloned and switched to workspace: ${targetPath}` }]);
                } catch (e) {
                  setMessages(prev => [...prev, { role: 'system', content: `[Error] ${e.message}` }]);
                }
              }
              setIsLoading(false);
            });
          }
        } catch (err) {
          setMessages(prev => [...prev, { role: 'system', content: `[Error] ${err.message}` }]);
          setIsLoading(false);
        }
        setInput('');
        return;
      } else if (lowerQuery === '/cd') {
        setInput('');
        setShowWorkspaceSelector(true);
        return;
      } else if (lowerQuery.startsWith('/cd ')) {
        const targetDir = trimmedQuery.slice(4).trim();
        try {
          const resolvedPath = path.resolve(process.cwd(), targetDir);
          const stat = await fs.stat(resolvedPath);
          if (!stat.isDirectory()) {
            throw new Error('Path is not a directory');
          }
          process.chdir(resolvedPath);
          setCurrentCwd(resolvedPath);
          
          let nextWps = [...workspaces];
          if (!nextWps.includes(resolvedPath)) {
            nextWps.push(resolvedPath);
            setWorkspaces(nextWps);
          }

          await saveConfig({ activeWorkspace: resolvedPath, workspaces: nextWps });
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[System] Switched workspace to: ${resolvedPath}` }]);
        } catch (err) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[Error] Failed to change directory: ${err.message}` }]);
        }
        setInput('');
        return;
      } else if (lowerQuery === '/auth') {
        setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[System] Usage: /auth github <token>' }]);
      } else if (lowerQuery.startsWith('/auth ')) {
        const parts = trimmedQuery.split(/\s+/);
        const subCmd = parts[1]?.toLowerCase();
        const token = parts[2];
        if (subCmd !== 'github' || !token) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[Error] Usage: /auth github <token>' }]);
        } else {
          try {
            await saveEnv('GITHUB_TOKEN', token);
            setMessages(prev => [...prev, { role: 'user', content: '/auth github ****' }, { role: 'system', content: '[System] GitHub token saved to ~/.vibe-code/.env' }]);
          } catch (err) {
            setMessages(prev => [...prev, { role: 'user', content: '/auth github ****' }, { role: 'system', content: `[Error] Failed to save GitHub token: ${err.message}` }]);
          }
        }
        setInput('');
        return;
      } else if (lowerQuery === '/exit') {
        stopAllServers();
        process.exit(0);
      } else {
        setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[Error] Unknown command. Type /help for available commands.` }]);
      }
      setInput('');
      return;
    }

    // Strip mentions for TUI display
    const displayedQuery = trimmedQuery.replace(/@\[([^\]]+)\]/g, '$1').replace(/(^|\s)@([a-zA-Z0-9_\-\.\/]+)/g, '$1$2');

    // Parse and load file attachments
    let fileAttachments = '';
    const fileMentions = [];
    const bracketRegex = /@\[([^\]]+)\]/g;
    let match;
    while ((match = bracketRegex.exec(trimmedQuery)) !== null) {
      fileMentions.push(match[1]);
    }
    const plainRegex = /(?:^|\s)@([a-zA-Z0-9_\-\.\/]+)/g;
    while ((match = plainRegex.exec(trimmedQuery)) !== null) {
      if (!fileMentions.includes(match[1])) {
        fileMentions.push(match[1]);
      }
    }

    for (const mention of fileMentions) {
      try {
        const fullPath = path.resolve(currentCwd, mention);
        const content = await fs.readFile(fullPath, 'utf-8');
        fileAttachments += `\n\n[File Content of ${mention}]:\n${content}`;
      } catch (err) {
        // file doesn't exist or is directory
      }
    }

    const apiQuery = displayedQuery + fileAttachments;

    if (activeTeam !== 'solo') {
      const conversation = [...messages, { role: 'user', content: trimmedQuery, apiContent: apiQuery }];
      setMessages(conversation);
      setInput('');
      
      const agentsMap = getAgents();
      let managerExists = false;
      for (const a of agentsMap.values()) {
         if ((a.role === 'manager' || a.role === 'orchestrator') && a.status !== 'stopped') managerExists = true;
      }
      
      if (!managerExists) {
        await handleTeamSpawn({ task: apiQuery, team_id: activeTeam });
      } else {
        await handleTeamMessage({ role: 'manager', message: apiQuery }, null, { senderRole: 'user' });
      }
      return;
    }

    let conversation = [...messages, { role: 'user', content: trimmedQuery, apiContent: apiQuery }];
    setMessages(conversation);
    setInput('');
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const systemPromptContent = SYSTEM_PROMPT_TEMPLATE
      .replace('{CWD}', currentCwd)
      .replace('{MODE}', askBeforeEdits ? 'ask' : 'auto')
      .replace('{TEAM_NAME}', activeTeam)
      .replace('{AGENT_LIST}', 'none') // TODO: wire to actual active agents
      .replace('{EDIT_COUNT}', sessionEdits.length)
      .replace('{CTX_USED}', tokenUsage.used)
      .replace('{CTX_MAX}', tokenUsage.limit);

    const systemPrompt = { role: 'system', content: systemPromptContent };

    try {
      let requiresApiCall = true;

      while (requiresApiCall && !controller.signal.aborted) {
        const apiMessages = getApiMessages(conversation, systemPrompt);

        const res = await fetch(`${provider.baseUrl}/chat/completions`, {
          signal: controller.signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(provider.apiKey || process.env.OPENAI_API_KEY ? { 'Authorization': `Bearer ${provider.apiKey || process.env.OPENAI_API_KEY}` } : {}),
          },
          body: JSON.stringify({
            model: activeModel,
            messages: apiMessages,
            tools: [...toolsDefinition, ...getMcpTools()],
            stream: true,
            stream_options: { include_usage: true },
          }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new Error(`${res.status} API Error: ${errBody.slice(0, 200)}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamedContent = '';
        let streamedReasoning = '';
        let toolCalls = [];

        conversation = [...conversation, { role: 'assistant', content: '' }];
        setMessages([...conversation]);

        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            let parsed;
            try { parsed = JSON.parse(data); } catch { continue; }

            if (parsed.usage) {
              setTokenUsage(prev => ({ ...prev, used: parsed.usage.total_tokens || prev.used }));
            }

            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta || {};

            let updated = false;
            if (delta.reasoning_content) {
              streamedReasoning += delta.reasoning_content;
              updated = true;
            }
            if (delta.content) {
              streamedContent += delta.content;
              updated = true;
            }
            if (updated) {
              conversation[conversation.length - 1] = {
                role: 'assistant',
                content: streamedContent,
                reasoning_content: streamedReasoning
              };
              setMessages([...conversation]);
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCalls[idx]) {
                  toolCalls[idx] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
                }
                if (tc.id) toolCalls[idx].id = tc.id;
                if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
              }
            }
          }
        }

        const responseMsg = { role: 'assistant' };
        if (streamedContent) responseMsg.content = streamedContent;
        if (streamedReasoning) responseMsg.reasoning_content = streamedReasoning;
        if (toolCalls.length > 0) responseMsg.tool_calls = toolCalls;

        conversation[conversation.length - 1] = responseMsg;

        if (responseMsg.tool_calls && responseMsg.tool_calls.length > 0) {
          setMessages([...conversation]);

          for (const call of responseMsg.tool_calls) {
            const funcName = call.function.name;
            let funcArgs;
            try {
              funcArgs = JSON.parse(call.function.arguments || "{}");
            } catch {
              funcArgs = {};
            }
            // Ensure tool_call_id is non-empty
            if (!call.id) call.id = `call_${nextToolId()}`;
            const toolId = nextToolId();

            // Show running state
            conversation = [...conversation, {
              role: 'tool_call',
              toolId,
              name: funcName,
              args: funcArgs,
              status: 'running',
              result: null,
            }];
            setMessages([...conversation]);

            // Execute
            const result = await confirmAndExecuteTool(funcName, funcArgs, (newStatus) => {
              conversation[conversation.length - 1] = {
                ...conversation[conversation.length - 1],
                status: newStatus,
              };
              setMessages([...conversation]);
            });

            // Update to completed state
            conversation[conversation.length - 1] = {
              ...conversation[conversation.length - 1],
              status: 'completed',
              result,
            };
            setMessages([...conversation]);

            if ((funcName === 'edit_file' || funcName === 'write_file') && result && result.success !== false) {
              const added = result.totalAdded || result.lineCount || 0;
              const removed = result.totalRemoved || 0;
              const path = result.path || funcArgs.file_path;
              if (path) {
                setSessionEdits(prev => [...prev, {
                  path,
                  linesAdded: added,
                  linesRemoved: removed,
                  role: activeTeam === 'solo' ? 'you' : (activeRole || 'orchestrator'),
                  ts: Date.now()
                }]);
              }
            }

            // Trigger helper agents in solo mode if enabled
            if (activeTeam === 'solo' && helpersEnabled) {
              if ((funcName === 'edit_file' || funcName === 'write_file') && result && result.success !== false) {
                const path = result.path || funcArgs.file_path;
                if (path) {
                  // Asynchronously fetch content and spawn helper reviewer
                  (async () => {
                    try {
                      const fileContentResult = await executeToolCall('read_file', { file_path: path });
                      const fileContent = fileContentResult?.content || '';
                      const goal = `Review the changes made to the file "${path}". Here is the current complete content of the file:\n\n\`\`\`\n${fileContent}\n\`\`\`\n\nPlease provide a highly concise 2-3 line review of the file, checking for bugs, structure, and quality.`;
                      await spawnHelperAgent('helper-reviewer', goal);
                    } catch (e) {}
                  })();
                }
              } else if (funcName === 'run_bash' && result && result.exitCode !== 0) {
                const goal = `The following command failed with exit code ${result.exitCode}:\n\`${result.command}\`\n\nStdout:\n${result.stdout || ''}\n\nStderr:\n${result.stderr || ''}\n\nPlease analyze the failure and suggest a concrete, extremely concise 2-3 line fix.`;
                spawnHelperAgent('helper-verifier', goal).catch(() => {});
              }
            }

            // Append raw result for API context (only tool_call_id and content)
            const rawContent = typeof result === 'object' ? JSON.stringify(result) : String(result);
            conversation = [...conversation, {
              role: 'tool',
              tool_call_id: call.id,
              content: rawContent,
            }];
          }
        } else {
          setMessages([...conversation]);
          requiresApiCall = false;
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        // User pressed ESC to interrupt
        setMessages([...conversation, { role: 'system', content: '[Interrupted]' }]);
      } else {
        setMessages([...conversation, { role: 'system', content: `[Error] ${error.message}` }]);
      }
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }

    // Auto-create checkpoint after AI response
    if (sessionId && conversation.length >= 2) {
      const userMsgs = conversation.filter(m => m.role === 'user');
      const label = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content.slice(0, 40) : 'checkpoint';
      createCheckpoint(sessionId, conversation, label).catch(() => {});
    }

    // Generate AI title for new sessions
    if (sessionId && conversation.length >= 3) {
      generateTitle(sessionId, conversation);
    }
  };

  const generateTitle = async (sid, msgs) => {
    try {
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey || process.env.OPENAI_API_KEY || ''}`,
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: 'system', content: 'Generate a short title (max 5 words) for this conversation. Reply with ONLY the title, no quotes or punctuation.' },
            { role: 'user', content: msgs.filter(m => m.role === 'user').map(m => m.content).join(' ').slice(0, 200) },
          ],
          stream: false,
          max_tokens: 20,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const title = (json.choices?.[0]?.message?.content || '').trim().replace(/["'.]/g, '');
        if (title) saveSession(sid, msgs, activeModel, title);
      }
    } catch {}
  };

  const handleAddProvider = async (newP) => {
    setProviders(prev => {
      const next = [...prev];
      const idx = next.findIndex(p => p.name === newP.name);
      if (idx >= 0) {
        next[idx] = newP;
      } else {
        next.push(newP);
      }
      saveConfig({ providers: next });
      return next;
    });
    await handleSelectProvider(newP);
  };

  const handleDeleteProvider = async (name) => {
    setProviders(prev => {
      const next = prev.filter(p => p.name !== name);
      saveConfig({ providers: next });
      return next;
    });
  };

  const handleSelectProvider = async (selectedP) => {
    setProvider(selectedP);
    setBaseUrl(selectedP.baseUrl);
    if (selectedP.apiKey) {
      setApiKey(selectedP.apiKey);
      await saveEnv('OPENAI_API_KEY', selectedP.apiKey);
      process.env.OPENAI_API_KEY = selectedP.apiKey;
    }
    await saveEnv('BASE_URL', selectedP.baseUrl);
    if (selectedP.modelsUrl) {
      await saveEnv('MODELS_URL', selectedP.modelsUrl);
    } else {
      await saveEnv('MODELS_URL', '');
    }
    await saveConfig({ provider: selectedP });

    try {
      const modelKey = selectedP.apiKey || process.env.OPENAI_API_KEY || '';
      const modelsUrl = selectedP.modelsUrl || `${selectedP.baseUrl}/models`;
      const res = await fetch(modelsUrl, {
        headers: modelKey ? { 'Authorization': `Bearer ${modelKey}` } : {},
      });
      const json = await res.json();
      if (json && json.data) {
        const ids = json.data.map(m => m.id);
        setAvailableModels(ids);
        if (ids.length > 0) {
          setActiveModel(ids[0]);
          saveModel(ids[0]);
        }
      } else {
        setAvailableModels([]);
      }
    } catch {
      setAvailableModels([]);
    }

    let switchMsg = `[System] Switched to provider: ${selectedP.name} (${selectedP.baseUrl})`;
    if (selectedP.name === 'opengateway' && !selectedP.apiKey && !process.env.OPENAI_API_KEY) {
      switchMsg += `\n[Notice] API key required. Get one at: https://gitlawb.com/opengateway/dashboard\nThen set it using: /apikey <key>`;
    }
    setMessages(prev => [...prev, { role: 'system', content: switchMsg }]);
    setShowProviderSelector(false);
  };

  const parsedChatLines = useMemo(() => {
    const usableWidth = termWidth - 4;
    const userTextWidth = termWidth - 8;
    const allLines = [];

    messages.forEach(msg => {
      if (msg.role === 'tool') return;

      const cLen = msg.content?.length || 0;
      const rLen = msg.reasoning_content?.length || 0;
      const sType = msg.status || 'unknown';
      const cacheKey = `${cLen}_${rLen}_${termWidth}_${showThinking}_${usableWidth}_${sType}`;
      
      const cached = messageLinesCache.get(msg);
      if (cached && cached.key === cacheKey) {
        cached.lines.forEach(l => allLines.push(l));
        return;
      }
      
      const msgLines = [];
      const pushLine = (line) => msgLines.push(line);

      if (msg.role === 'tool_call') {
        if (msg.status === 'pending_confirmation') {
          pushLine({
            type: 'tool_status',
            icon: '›',
            color: '#737373',
            content: msg.name,
          });
        } else {
          const toolLines = formatToolResult(
            msg.name,
            msg.status === 'running' ? null : msg.result,
            usableWidth
          );
          toolLines.forEach(line => pushLine(line));
        }
        pushLine({ type: 'spacer' });
        messageLinesCache.set(msg, { key: cacheKey, lines: msgLines });
        msgLines.forEach(l => allLines.push(l));
        return;
      }

      if (msg.role === 'user') {
        const cleanContent = formatMarkdown(msg.content);
        const wrapped = wrapText(cleanContent, userTextWidth);
        pushLine({ type: 'user', lines: wrapped });
      } else if (msg.role === 'system') {
        if (msg.isHelperResult) {
          const wrapped = wrapText(msg.content, usableWidth);
          wrapped.forEach(line => pushLine({
            type: 'helper_result',
            helperRole: msg.helperRole,
            content: line
          }));
        } else {
          const wrapped = wrapText(msg.content, usableWidth);
          wrapped.forEach(line => pushLine({ type: 'system', content: line }));
        }
      } else {
        if (msg.reasoning_content) {
          if (showThinking) {
            pushLine({ type: 'reasoning_header', content: '[Thinking Process] (Ctrl+T to collapse)' });
            const rawLines = msg.reasoning_content.split('\n');
            rawLines.forEach(rawLine => {
              if (rawLine.length <= usableWidth - 4) {
                pushLine({ type: 'reasoning', content: rawLine });
              } else {
                const wrapped = wrapText(rawLine, usableWidth - 4);
                wrapped.forEach(wl => pushLine({ type: 'reasoning', content: wl }));
              }
            });
          } else {
            pushLine({ type: 'reasoning_header', content: '[Thinking Process] (Ctrl+T to expand)' });
          }
        }
        const cleanContent = formatMarkdown(msg.content || '');
        if (cleanContent) {
          const boxW = Math.min(usableWidth - 2, 120);
          const wrapped = wrapText(cleanContent, boxW - 6);
          const label = ' assistant ';
          const topLine = chalk.hex('#2a2a2a')('┌─') + chalk.hex('#555555')(label) + chalk.hex('#2a2a2a')('─'.repeat(Math.max(0, boxW - label.length - 3)) + '┐');
          const botLine = chalk.hex('#2a2a2a')('└' + '─'.repeat(Math.max(0, boxW - 2)) + '┘');
          pushLine({ type: 'box_border', content: topLine });
          wrapped.forEach((line, idx) => pushLine({ type: 'assistant', content: line, isFirst: idx === 0, boxW }));
          pushLine({ type: 'box_border', content: botLine });
        }
      }
      pushLine({ type: 'spacer' });
      
      messageLinesCache.set(msg, { key: cacheKey, lines: msgLines });
      msgLines.forEach(l => allLines.push(l));
    });

    if (allLines.length > 0 && allLines[allLines.length - 1].type === 'spacer') allLines.pop();
    
    return allLines;
  }, [messages, termWidth, showThinking]);

  const { visibleLines, actualScroll, availableHeight } = useMemo(() => {

    // Dynamic height calculation to completely prevent TUI reflow & flickering
    // 1. PaddingY={1} in the root Box adds exactly 2 blank lines (1 top, 1 bottom)
    let nonChatHeight = 2;

    // 2. Top Header elements
    // <Box justifyContent="space-between"> ◆ agent... takes 1 line
    nonChatHeight += 1;
    // <Text color="#2a2a2a">{"─".repeat(termWidth - 4)}</Text> takes 1 line
    nonChatHeight += 1;

    // 3. Helper Agents list
    if (activeTeam === 'solo') {
      const runningHelpersCount = activeAgents.filter(a => a.isHelper && a.status === 'running').length;
      if (runningHelpersCount > 0) {
        nonChatHeight += runningHelpersCount;
      }
    }

    // 4. CommandDropdown component height
    if (showDropdown) {
      let dropdownItemsCount = 0;
      const fuzzyMatchLocal = (query, text) => {
        const q = query.toLowerCase();
        const t = text.toLowerCase();
        if (t.startsWith(q)) return true;
        let qi = 0;
        for (let i = 0; i < t.length && qi < q.length; i++) {
          if (t[i] === q[qi]) qi++;
        }
        return qi === q.length;
      };

      if (input.includes('@') && fileList && fileList.length > 0) {
        const lastAt = input.lastIndexOf('@');
        const query = input.slice(lastAt + 1).toLowerCase();
        const filtered = fileList.filter(f => fuzzyMatchLocal(query, f));
        dropdownItemsCount = filtered.length;
      } else if (input.startsWith('/model ') && availableModels && availableModels.length > 0) {
        const query = input.slice(7).toLowerCase();
        const filtered = availableModels.filter(m => fuzzyMatchLocal(query, m));
        dropdownItemsCount = filtered.length;
      } else if ((input.startsWith('/resume ') || input.startsWith('/delete ')) && pickerSessions && pickerSessions.length > 0) {
        const query = (input.split(' ')[1] || '').toLowerCase();
        const filtered = pickerSessions.filter(s => {
          const title = (s.title || s.preview || s.id || '').toLowerCase();
          return fuzzyMatchLocal(query, title);
        });
        dropdownItemsCount = filtered.length;
      } else if ((input.startsWith('/rewind ') || input.startsWith('/branch ')) && checkpointList && checkpointList.length > 0) {
        dropdownItemsCount = checkpointList.length;
      } else {
        const filtered = COMMANDS.filter(c => fuzzyMatchLocal(input, c.cmd));
        dropdownItemsCount = filtered.length;
      }

      if (dropdownItemsCount > 0) {
        nonChatHeight += Math.min(dropdownItemsCount, 5); // MAX_VISIBLE is 5
      }
    }

    // 5. Tool Confirmation or InputBox/ActiveAgents
    if (pendingConfirmation) {
      nonChatHeight += 2; // ToolConfirmation takes exactly 2 lines
    } else {
      // Active agents list
      if (activeAgents.length > 0) {
        // Box has marginY={1} which adds exactly 2 lines (1 top, 1 bottom)
        nonChatHeight += 2;
        // Separator/header: <Text color="#2a2a2a">{"─".repeat... takes 1 line
        nonChatHeight += 1;
        // Each agent takes 1 line
        nonChatHeight += activeAgents.length;
        // If an agent is expanded, it shows up to 5 logs
        if (expandedAgent !== null) {
          const matchingAgent = activeAgents.find(a => a.id === expandedAgent);
          if (matchingAgent && matchingAgent.log) {
            nonChatHeight += Math.min(matchingAgent.log.length, 5);
          }
        }
        // Footer hint: <Text color="#2a2a2a">{"─".repeat... takes 1 line
        nonChatHeight += 1;
      }

      // InputBox
      const inputLines = input.split('\n');
      if (inputLines.length > 5) {
        nonChatHeight += 3;
      } else {
        nonChatHeight += 2 + inputLines.length;
      }
    }

    // 6. Bottom footer elements
    // <Text color="#2a2a2a">{"─".repeat(termWidth - 4)}</Text> takes 1 line
    nonChatHeight += 1;
    // <Box justifyContent="space-between"> displayDir ... takes 1 line
    nonChatHeight += 1;

    const availableHeight = Math.max(5, termHeight - nonChatHeight);
    const maxScroll = Math.max(0, parsedChatLines.length - availableHeight);
    const curScroll = Math.max(0, Math.min(chatScroll, maxScroll));
    const startIndex = Math.max(0, parsedChatLines.length - availableHeight - curScroll);
    const lines = parsedChatLines.slice(startIndex, startIndex + availableHeight);

    return { visibleLines: lines, actualScroll: curScroll, maxScroll, availableHeight };
  }, [
    parsedChatLines,
    termHeight,
    chatScroll,
    activeTeam,
    activeAgents,
    showDropdown,
    input,
    dropdownModels,
    dropdownSessions,
    dropdownFiles,
    checkpointList,
    pendingConfirmation,
    expandedAgent,
    fileList,
    dropdownIndex,
    availableModels,
    pickerSessions
  ]);

  if (showTeamSelector) {
    return (
      <TeamSelector
        activeTeam={activeTeam}
        availableModels={availableModels}
        onSelect={(team, roleModels) => {
          setActiveTeam(team);
          setShowTeamSelector(false);
          const modelInfo = roleModels && Object.keys(roleModels).length > 0
            ? '\n' + Object.entries(roleModels).map(([r, m]) => `  ${r}: ${m}`).join('\n')
            : '';
          setMessages(prev => [...prev, { role: 'system', content: `[System] Team switched to: ${team}${modelInfo}` }]);
        }}
        onClose={() => setShowTeamSelector(false)}
        termWidth={termWidth}
        termHeight={termHeight}
      />
    );
  }

  if (showWorkspaceSelector) {
    return (
      <WorkspaceSelector
        workspaces={workspaces}
        availableWorkspaces={availableWorkspaces}
        activeWorkspace={currentCwd}
        onSelect={async (wpPath) => {
          try {
            process.chdir(wpPath);
            setCurrentCwd(wpPath);
            await saveConfig({ activeWorkspace: wpPath });
            setMessages(prev => [...prev, { role: 'system', content: `[System] Switched workspace to: ${wpPath}` }]);
          } catch (err) {
            setMessages(prev => [...prev, { role: 'system', content: `[Error] Failed to change directory: ${err.message}` }]);
          }
          setShowWorkspaceSelector(false);
        }}
        onCreate={async (wpPath) => {
          const resolved = path.resolve(process.cwd(), wpPath);
          const stat = await fs.stat(resolved);
          if (!stat.isDirectory()) {
            throw new Error('Path is not a directory');
          }
          if (workspaces.includes(resolved)) {
            throw new Error('Workspace already exists in the list');
          }
          const nextWps = [...workspaces, resolved];
          setWorkspaces(nextWps);
          await saveConfig({ workspaces: nextWps });
        }}
        onDelete={async (wpPath) => {
          const nextWps = workspaces.filter(w => w !== wpPath);
          setWorkspaces(nextWps);
          await saveConfig({ workspaces: nextWps });
        }}
        onAddFavorite={async (wpPath) => {
          if (!workspaces.includes(wpPath)) {
            const nextWps = [...workspaces, wpPath];
            setWorkspaces(nextWps);
            await saveConfig({ workspaces: nextWps });
          }
        }}
        onClose={() => setShowWorkspaceSelector(false)}
        termWidth={termWidth}
        termHeight={termHeight}
      />
    );
  }

  if (showProviderSelector) {
    return (
      <ProviderSelector
        providers={providers}
        activeProvider={provider}
        onSelect={handleSelectProvider}
        onAdd={handleAddProvider}
        onDelete={handleDeleteProvider}
        onClose={() => setShowProviderSelector(false)}
        termWidth={termWidth}
        termHeight={termHeight}
      />
    );
  }

  if (showModelSelector) {
    return (
      <ModelSelector
        models={availableModels.length > 0 ? availableModels : ['gpt-5.5', 'gpt-4o', 'claude-3-5-sonnet', 'gemini-2.0-flash']}
        activeModel={activeModel}
        onSelect={handleModelSelect}
        onClose={() => setShowModelSelector(false)}
        termWidth={termWidth}
        termHeight={termHeight}
      />
    );
  }

  if (showSessionPicker) {
    return (
      <SessionPicker
        sessions={pickerSessions}
        onSelect={async (session) => {
          const full = await loadSession(session.id);
          if (full) {
            setSessionId(full.id);
            setSessionTitle(full.title || null);
            isGeneratingTitle.current = !!full.title;
            if (full.model) { setActiveModel(full.model); saveModel(full.model); }
            setMessages([...full.messages, { role: 'system', content: `[System] Resumed: ${full.title || full.id}` }]);
          }
          setShowSessionPicker(false);
        }}
        onDelete={async (id) => {
          await deleteSession(id);
          if (sessionId === id) setSessionId(null);
        }}
        onFav={async (id, fav) => {
          await setSessionFavorite(id, fav);
        }}
        onClose={() => setShowSessionPicker(false)}
        termWidth={termWidth}
        termHeight={termHeight}
      />
    );
  }

  if (showAgentDetail) {
    const agent = showAgentDetail;
    const age = Math.round((Date.now() - agent.createdAt) / 1000);
    const borderColor = agent.status === 'running' ? '#D77757' : agent.status === 'completed' ? '#3ECF8E' : '#EF4444';
    return (
      <Box flexDirection="column" width={termWidth} height={termHeight} paddingX={2} paddingY={1}>
        <Box borderStyle="single" borderColor={borderColor} flexDirection="column" paddingX={2} paddingY={1} width={Math.min(termWidth - 4, 90)}>
          <Text bold color="white">Agent {agent.id}</Text>
          <Text color="#a3a3a3">Status: <Text bold color={agent.status === 'running' ? '#D77757' : agent.status === 'completed' ? '#3ECF8E' : '#EF4444'}>{agent.status}</Text></Text>
          <Text color="#a3a3a3">Goal: {chalk.white(agent.goal)}</Text>
          <Text color="#a3a3a3">Steps: {agent.iterations}  |  Time: {age}s</Text>
          {agent.lastActionDetail && <Text color="#a3a3a3">Last: {chalk.hex('#D77757')(agent.lastActionDetail)}</Text>}
          {agent.log.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="#D77757">Activity Log:</Text>
              {agent.log.slice(-15).map((entry, i) => (
                <Text key={i} color="#737373">  {entry}</Text>
              ))}
            </Box>
          )}
          {agent.result && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="#3ECF8E">Result:</Text>
              <Text color="white">{agent.result}</Text>
            </Box>
          )}
          {agent.error && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="#EF4444">Error:</Text>
              <Text color="#EF4444">{agent.error}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text color="#525252">Press Esc or Ctrl+O to close</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight} paddingX={2} paddingY={1}>
      <Box justifyContent="space-between">
        <Box>
          <Text color="#888888">  ◆ vibe-terminal{appVersion ? ` v${appVersion}` : ' agent'}</Text>
          {updateAvailable && <Text color="#d4a574">  ({updateAvailable})</Text>}
        </Box>
        <Box>
          <Text color="#d4a574">{activeModel.length > 20 ? activeModel.slice(0, 20) + '..' : activeModel}</Text>
          <Text color="#444444">  |  </Text>
          <Text color="#888888">{activeTeam}</Text>
        </Box>
      </Box>
      <Text color="#2a2a2a">{"─".repeat(termWidth - 4)}</Text>

      <Box flexDirection="column" height={availableHeight} marginY={0} overflow="hidden">
        {visibleLines.map((line, i) => {
          if (line.type === 'user') {
            return (
              <Box key={i} flexDirection="column" width="100%">
                {line.lines.map((text, j) => {
                  const padLen = Math.max(0, termWidth - 4 - stripAnsi(text).length);
                  return (
                    <Text key={j}>{chalk.bgHex('#141414')(chalk.hex('#f0f0f0')(text) + ' '.repeat(padLen))}</Text>
                  );
                })}
              </Box>
            );
          } else if (line.type === 'system') {
            const isError = line.content.startsWith('[Error]');
            const cleanContent = line.content.replace(/^\[System\]\s*/i, '').replace(/^\[Error\]\s*/i, '');
            return (
              <Box key={i} paddingLeft={2}>
                <Text color={isError ? "#EF4444" : "#737373"} dimColor={!isError} italic>
                  {isError ? '!' : '›'} {cleanContent}
                </Text>
              </Box>
            );
          } else if (line.type === 'helper_result') {
            const roleColor = ROLE_COLORS[line.helperRole] || '#888888';
            const roleIcon = ROLE_ICONS[line.helperRole] || '◇';
            return (
              <Text key={i} color="#737373" dimColor>
                {chalk.hex(roleColor)(roleIcon)} {line.content}
              </Text>
            );
          } else if (line.type === 'reasoning_header') {
            return <Text key={i} color="#444444" bold>{line.content}</Text>;
          } else if (line.type === 'reasoning') {
            return <Text key={i} color="#444444" italic>  {line.content}</Text>;
          } else if (line.type === 'assistant') {
            if (typeof line.content !== 'string') return null;
            const textLen = stripAnsi(line.content).length;
            const padLen = Math.max(0, (line.boxW || 78) - 6 - textLen);
            return (
              <Text key={i}>
                <Text color="#2a2a2a">{'  │  '}</Text>
                <Text color="#f0f0f0">{line.content}</Text>
                {' '.repeat(padLen)}
                <Text color="#2a2a2a">{'  │'}</Text>
              </Text>
            );
          } else if (line.type === 'box_border') {
            return <Text key={i}>  {line.content}</Text>;
          } else if (line.type === 'tool_status') {
            const icon = chalk.hex(line.color)(line.icon);
            const detail = line.detail || '';
            if (line.agentId) {
              const agents = getAgents();
              const agent = agents.get(line.agentId);
              const isDone = agent && (agent.status === 'completed' || agent.status === 'failed' || agent.status === 'stopped');
              const goalText = line.agentGoal || '';
              if (isDone) {
                return <Text key={i}>{'  '}{icon}{' '}{chalk.strikethrough.hex('#444444')(goalText)}</Text>;
              }
              const statusLabel = agent ? (agent.status === 'running' ? chalk.hex('#d4a574')(' [running]') : agent.status === 'idle' ? chalk.hex('#7eb8f7')(' [done]') : '') : '';
              return <Text key={i}>{'  '}{icon}{' '}{chalk.hex('#f0f0f0')(goalText)}{statusLabel}</Text>;
            }
            return <Text key={i}>{'  '}{icon}{' '}{chalk.hex('#f0f0f0')(line.content)}{'  '}{detail}</Text>;
          } else if (line.type === 'tool_content') {
            return <Text key={i}>{line.content}</Text>;
          } else if (line.type === 'agent_report_card') {
            return <AgentReportCard key={i} report={line.report} termWidth={termWidth} />;
          } else if (line.type === 'session_diff_log') {
            const { edits } = line;
            const totalAdded = edits.reduce((sum, e) => sum + e.linesAdded, 0);
            const totalRemoved = edits.reduce((sum, e) => sum + e.linesRemoved, 0);
            return (
              <Box key={i} flexDirection="column" marginTop={1} marginBottom={1}>
                <Text color="#888888">  session edits -- {edits.length} files changed</Text>
                <Text color="#2a2a2a">  {"─".repeat(Math.min(termWidth - 4, 80))}</Text>
                {edits.map((e, idx) => (
                  <Box key={idx} marginLeft={2}>
                    <Box width={30}><Text color="#f0f0f0">{e.path.length > 28 ? '...' + e.path.slice(-25) : e.path}</Text></Box>
                    <Box width={6}><Text color="#6db86d">+{e.linesAdded}</Text></Box>
                    <Box width={6}><Text color="#c97070">-{e.linesRemoved}</Text></Box>
                    <Text color={ROLE_COLORS[e.role] || '#888888'}>{e.role}</Text>
                  </Box>
                ))}
                <Text color="#2a2a2a">  {"─".repeat(Math.min(termWidth - 4, 80))}</Text>
                <Box marginLeft={2}>
                  <Box width={30}><Text color="#888888">total</Text></Box>
                  <Box width={6}><Text color="#6db86d">+{totalAdded}</Text></Box>
                  <Box width={6}><Text color="#c97070">-{totalRemoved}</Text></Box>
                </Box>
              </Box>
            );
          } else {
            return <Text key={i}> </Text>;
          }
        })}
      </Box>

      {activeTeam === 'solo' && activeAgents.filter(a => a.isHelper && a.status === 'running').length > 0 && (
        <Box flexDirection="column" marginY={0} paddingLeft={2}>
          {activeAgents.filter(a => a.isHelper && a.status === 'running').map(agent => {
            const roleColor = ROLE_COLORS[agent.role] || '#888888';
            const roleIcon = ROLE_ICONS[agent.role] || '◇';
            return (
              <Box key={agent.id}>
                <Text color="#737373" dimColor>
                  {chalk.hex(roleColor)(roleIcon)} {agent.role.replace('helper-', '')}  {agent.lastActionDetail || 'analyzing...'}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {showDropdown && (
        <CommandDropdown
          input={input}
          selectedIndex={dropdownIndex}
          onSelect={(cmd) => { setInput(cmd + ' '); setDropdownIndex(0); }}
          models={dropdownModels}
          sessions={dropdownSessions}
          files={dropdownFiles}
          checkpoints={checkpointList}
        />
      )}
      {pendingConfirmation ? (
        <ToolConfirmation
          name={pendingConfirmation.name}
          args={pendingConfirmation.args}
          termWidth={termWidth}
          selectedIndex={confirmIndex}
        />
      ) : (
        <Box flexDirection="column" width="100%">
          {activeAgents.length > 0 && (
            <Box flexDirection="column" marginY={1}>
              <Text color="#2a2a2a">{"─".repeat(Math.min(termWidth - 4, 60))}  {activeTeam === 'solo' ? 'helpers' : `team: ${activeTeam}`}</Text>
              {activeAgents.map((agent, idx) => {
                const isHelper = agent.isHelper;
                const roleColor = isHelper ? '#737373' : (ROLE_COLORS[agent.role || 'manager'] || '#d4a574');
                const roleIcon = ROLE_ICONS[agent.role || 'manager'] || '•';
                const statusColor = isHelper ? '#555555' : (agent.status === 'running' ? '#d4a574' : agent.status === 'idle' ? '#98c99a' : agent.status === 'queued' ? '#444444' : agent.status === 'failed' ? '#c97070' : '#98c99a');
                const statusIcon = agent.status === 'running' ? '●' : agent.status === 'queued' ? '○' : agent.status === 'idle' ? '✓' : agent.status === 'failed' ? '!' : '✓';
                const actionText = agent.status === 'running' ? (agent.lastActionDetail || 'working...') : agent.status === 'queued' ? 'waiting' : agent.status === 'idle' ? 'done' : agent.status;
                const isExpanded = expandedAgent === agent.id;
                const expandIcon = isExpanded ? '▾' : '▸';
                return (
                  <Box key={agent.id} flexDirection="column">
                    <Box>
                      <Box width={3}><Text color="#444444">{idx + 1}</Text></Box>
                      <Box width={2}><Text color={statusColor}>{statusIcon}</Text></Box>
                      <Box width={14}><Text color={roleColor}>{roleIcon} {agent.role || 'agent'}</Text></Box>
                      <Box width={11}><Text color={statusColor}>[{agent.status === 'idle' ? 'done' : agent.status}]</Text></Box>
                      <Box width={4}><Text color="#444444">{Math.round((Date.now() - agent.createdAt) / 1000)}s</Text></Box>
                      <Box><Text color={isHelper ? '#525252' : '#888888'}>  {actionText.slice(0, 40)}</Text></Box>
                      <Box marginLeft={1}><Text color="#444444">{expandIcon}</Text></Box>
                    </Box>
                    {isExpanded && agent.log.length > 0 && (
                      <Box flexDirection="column" paddingLeft={5} marginBottom={1}>
                        {agent.log.slice(-5).map((entry, li) => (
                          <Text key={li} color="#525252">{entry}</Text>
                        ))}
                      </Box>
                    )}
                  </Box>
                );
              })}
              <Text color="#2a2a2a">{"─".repeat(Math.min(termWidth - 4, 60))}  press 1-{Math.min(activeAgents.length, 9)} to expand</Text>
            </Box>
          )}
          <AnimatedInputBox isLoading={isLoading} input={input} setInput={setInput} handleSubmit={handleSubmit} actualScroll={actualScroll} selectedFile={(() => {
            if (!input.includes('@') || fileList.length === 0) return null;
            const lastAt = input.lastIndexOf('@');
            const query = input.slice(lastAt + 1).toLowerCase();
            const filtered = fileList.filter(f => f.toLowerCase().includes(query));
            return filtered[dropdownIndex] || filtered[0] || null;
          })()} />
        </Box>
      )}

      <Text color="#2a2a2a">{"─".repeat(termWidth - 4)}</Text>
      <Box justifyContent="space-between">
        <Text color="#888888">{displayDir}</Text>
        <Box>
          <Text color="#444444">Mode: {askBeforeEdits ? 'ask' : 'auto'}</Text>
          {activeServers.size > 0 ? (
            <>
              <Text color="#444444">  ·  mcp: </Text>
              <Text color="#D77757">{Array.from(activeServers.values()).filter(s => s.status === 'connected').length}/{activeServers.size}</Text>
            </>
          ) : null}
          {activeTeam !== 'solo' ? (
            <>
              <Text color="#444444">  ·  </Text>
              <Text color="#D77757">team: {activeTeam}</Text>
            </>
          ) : null}
          {activeAgents.filter(a => a.status === 'running' && !a.isHelper).length > 0 ? (
            <>
              <Text color="#444444">  ·  </Text>
              <Text color="#d4a574">{activeAgents.filter(a => a.status === 'running' && !a.isHelper).length} running</Text>
            </>
          ) : (
            <>
              <Text color="#444444">  ·  </Text>
              <Text color="#888888">{activeModel}</Text>
            </>
          )}
          <Text color="#444444">  ·  ctx </Text>
          <Text color={tokenUsage.used > tokenUsage.limit * 0.8 ? '#c97070' : tokenUsage.used > tokenUsage.limit * 0.5 ? '#d4a574' : '#98c99a'}>{(tokenUsage.used / 1000).toFixed(1)}k</Text>
          <Text color="#444444">/{(tokenUsage.limit / 1000).toFixed(0)}k</Text>
        </Box>
      </Box>
    </Box>
  );
};

export default App;
