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

function stripMarkdown(text) {
  if (!text) return '';
  let result = text;
  // Remove code block markers but keep content
  result = result.replace(/```[\w]*\n?/g, '');
  result = result.replace(/```$/gm, '');
  // Remove inline code backticks
  result = result.replace(/`([^`]+)`/g, '$1');
  // Remove bold/italic markers
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
  result = result.replace(/\*\*(.+?)\*\*/g, '$1');
  result = result.replace(/\*(.+?)\*/g, '$1');
  result = result.replace(/___(.+?)___/g, '$1');
  result = result.replace(/__(.+?)__/g, '$1');
  result = result.replace(/_(.+?)_/g, '$1');
  // Remove headers
  result = result.replace(/^#{1,6}\s+/gm, '');
  // Remove bullet markers (keep text)
  result = result.replace(/^\s*[-*+]\s+/gm, '  ');
  // Remove numbered list markers (keep text)
  result = result.replace(/^\s*\d+\.\s+/gm, '  ');
  return result;
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
import { saveSession, loadSession, listSessions, deleteSession, setSessionFavorite, generateSessionId } from './utils/sessions.js';
import { listFiles } from './utils/fileList.js';
import { loadEnv, saveEnv } from './utils/env.js';
import { createCheckpoint, listCheckpoints, rewindTo, forkCheckpoint, getCheckpoint } from './utils/rewind.js';

// Components
import { AnimatedLogo } from './components/AnimatedLogo.jsx';
import { AnimatedInputBox } from './components/AnimatedInputBox.jsx';
import { ModelSelector } from './components/ModelSelector.jsx';
import { SessionPicker } from './components/SessionPicker.jsx';
import { CommandDropdown, COMMANDS } from './components/CommandDropdown.jsx';
import { ToolConfirmation } from './components/ToolConfirmation.jsx';

// Tools Engine
import { toolsDefinition } from './tools/definitions.js';
import { executeToolCall } from './tools/executor.js';
import { setApiKey, setBaseUrl, setModel, getAgents } from './tools/handlers/agents.js';

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

let toolIdCounter = 0;
const nextToolId = () => `tool_${++toolIdCounter}`;

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
  const [askBeforeEdits, setAskBeforeEdits] = useState(true);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [confirmIndex, setConfirmIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = React.useRef(null);
  const [showModelSelector, setShowModelSelector] = useState(false);
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
          setMessages(session.messages);
          setSessionId(session.id);
          if (session.model) { setActiveModel(session.model); saveModel(session.model); }
          setMessages(prev => [...prev, { role: 'system', content: `Resumed: ${session.title || session.id}` }]);
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
    saveSession(id, messages, activeModel).catch(() => {});
  }, [messages]);


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
    })();
  }, []);

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
        const helpText = `[Help] Available Commands:\n  /help         - Show this message\n  /model        - Open the interactive model selector\n  /model <id>   - Switch directly to a model\n  /apikey <key> - Set and save API key\n  /provider     - Switch API provider (opencode/nvidia/custom)\n  /rewind       - List checkpoints\n  /rewind <n>   - Rewind to checkpoint N\n  /branch <n>   - Fork from checkpoint N\n  /init         - Analyze codebase and create CLAUDE.md\n  /resume       - List saved sessions\n  /resume <id>  - Restore a saved session\n  /delete <id>  - Delete a saved session\n  /clear        - Clear the chat history\n  /exit         - Exit the app\n  /clone <url>  - Clone a git repository and switch workspace\n  /auth github <token> - Set GitHub token for git pushing\n  Ctrl+M        - Shortcut to open model selector\n  Ctrl+T        - Toggle thinking process visibility\n  Ctrl+O        - View agent details (when agent is running)\n\nTools: bash, file ops, search, web, tasks, cron, agents`;
        setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: helpText }]);
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
        setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[System] Usage: /apikey <your-api-key>\nThe key is saved to ~/.vibe-code/.env' }]);
      } else if (lowerQuery.startsWith('/apikey ')) {
        const newKey = trimmedQuery.slice(8).trim();
        if (newKey) {
          try {
            await saveEnv('OPENAI_API_KEY', newKey);
            setApiKey(newKey);
            setMessages(prev => [...prev, { role: 'user', content: '/apikey ****' }, { role: 'system', content: '[System] API key saved to ~/.vibe-code/.env' }]);
          } catch (err) {
            setMessages(prev => [...prev, { role: 'user', content: '/apikey ****' }, { role: 'system', content: `[Error] Failed to save API key: ${err.message}` }]);
          }
        }
      } else if (lowerQuery === '/provider') {
        const lines = [
          `[Provider] Current: ${provider.name}`,
          `  Base URL: ${provider.baseUrl}`,
          `  Models URL: ${provider.modelsUrl || '(default: baseUrl/models)'}`,
          `  API Key: ${provider.apiKey ? '****' + provider.apiKey.slice(-4) : '(not set)'}`,
          '',
          'Usage:',
          '  /provider opencode                       - Use opencode.ai (default)',
          '  /provider nvidia <api_key>               - Use NVIDIA NIM API',
          '  /provider custom <url> <key> [models_url]- Use custom OpenAI-compatible API',
        ];
        setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: lines.join('\n') }]);
      } else if (lowerQuery.startsWith('/provider ')) {
        const parts = trimmedQuery.split(/\s+/);
        const providerName = parts[1]?.toLowerCase();
        let newProvider;
        if (providerName === 'opencode') {
          newProvider = {
            name: 'opencode',
            baseUrl: 'https://opencode.ai/zen/go/v1',
            apiKey: 'sk-lnuJ2jLlii0Z00TEKuQBugkcw25XJGU3Y8USdUXZzFKWuB8ppTE3Fzme9AzKbKdN',
            modelsUrl: 'https://opencode.ai/zen/go/v1/models'
          };
        } else if (providerName === 'nvidia') {
          const key = parts[2] || '';
          newProvider = { name: 'nvidia', baseUrl: 'https://integrate.api.nvidia.com/v1', apiKey: key };
          if (key) await saveEnv('NVIDIA_API_KEY', key);
        } else if (providerName === 'custom') {
          const url = parts[2] || '';
          const key = parts[3] || '';
          const modelsUrl = parts[4] || '';
          if (!url) {
            setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[Error] Usage: /provider custom <base_url> <api_key> [models_url]' }]);
            setInput('');
            return;
          }
          newProvider = { name: 'custom', baseUrl: url, apiKey: key };
          if (modelsUrl) {
            newProvider.modelsUrl = modelsUrl;
            await saveEnv('CUSTOM_MODELS_URL', modelsUrl);
          }
          if (key) await saveEnv('CUSTOM_API_KEY', key);
          await saveEnv('CUSTOM_BASE_URL', url);
        } else {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[Error] Unknown provider. Use: opencode, nvidia, custom' }]);
          setInput('');
          return;
        }
        setProvider(newProvider);
        setBaseUrl(newProvider.baseUrl);
        if (newProvider.apiKey) {
          setApiKey(newProvider.apiKey);
          await saveEnv('OPENAI_API_KEY', newProvider.apiKey);
        }
        await saveEnv('BASE_URL', newProvider.baseUrl);
        if (newProvider.modelsUrl) {
          await saveEnv('MODELS_URL', newProvider.modelsUrl);
        } else {
          await saveEnv('MODELS_URL', '');
        }
        await saveConfig({ provider: newProvider });
        // Fetch models from new provider
        try {
          const modelKey = newProvider.apiKey || process.env.OPENAI_API_KEY || '';
          const modelsUrl = newProvider.modelsUrl || `${newProvider.baseUrl}/models`;
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
        setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[System] Switched to provider: ${newProvider.name} (${newProvider.baseUrl})` }]);
      } else if (lowerQuery === '/clear') {
        setMessages([]);
        setSessionId(null);
        setChatScroll(0);
        setTokenUsage({ used: 0, limit: 128000 });
        // Clear entire terminal including scrollback
        process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
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
      } else if (lowerQuery === '/resume' || lowerQuery.startsWith('/resume ')) {
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
          const apiMessages = conversation.filter(m => m.role !== 'system' && m.role !== 'tool_call');
          const res = await fetch(`${provider.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(provider.apiKey || process.env.OPENAI_API_KEY ? { 'Authorization': `Bearer ${provider.apiKey || process.env.OPENAI_API_KEY}` } : {}),
            },
            body: JSON.stringify({
              model: activeModel,
              messages: apiMessages,
              tools: toolsDefinition,
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
              const apiMessages = conversation.filter(m => m.role !== 'system' && m.role !== 'tool_call');
              const res2 = await fetch(`${provider.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(provider.apiKey || process.env.OPENAI_API_KEY ? { 'Authorization': `Bearer ${provider.apiKey || process.env.OPENAI_API_KEY}` } : {}),
                },
                body: JSON.stringify({ model: activeModel, messages: apiMessages, tools: toolsDefinition, stream: true, stream_options: { include_usage: true } }),
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
        process.exit(0);
      } else {
        setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[Error] Unknown command. Type /help for available commands.` }]);
      }
      setInput('');
      return;
    }

    let conversation = [...messages, { role: 'user', content: trimmedQuery }];
    setMessages(conversation);
    setInput('');
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const systemPrompt = { role: 'system', content: 'You are a helpful coding assistant. Do not use emojis in any response. Use plain text only. Use >, -, *, or numbers for lists. Use backticks for code. When you have completed modifying the codebase, you MUST use the git_commit_and_push tool to commit and push your changes to the "agy" branch.' };

    try {
      let requiresApiCall = true;

      while (requiresApiCall && !controller.signal.aborted) {
        const apiMessages = [systemPrompt, ...conversation.filter(m => m.role !== 'system' && m.role !== 'tool_call')];

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
            tools: toolsDefinition,
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

  const { visibleLines, actualScroll } = useMemo(() => {
    const usableWidth = termWidth - 4;
    const userTextWidth = termWidth - 8;
    const allLines = [];

    messages.forEach(msg => {
      if (msg.role === 'tool') return;

      if (msg.role === 'tool_call') {
        if (msg.status === 'pending_confirmation') {
          allLines.push({
            type: 'tool_status',
            icon: '⚠️',
            color: '#FBBF24',
            content: `${msg.name} (pending confirmation...)`,
          });
        } else {
          const toolLines = formatToolResult(
            msg.name,
            msg.status === 'running' ? null : msg.result,
            usableWidth
          );
          toolLines.forEach(line => allLines.push(line));
        }
        allLines.push({ type: 'spacer' });
        return;
      }

      if (msg.role === 'user') {
        const wrapped = wrapText(msg.content, userTextWidth);
        allLines.push({ type: 'user', lines: wrapped });
      } else if (msg.role === 'system') {
        const wrapped = wrapText(msg.content, usableWidth);
        wrapped.forEach(line => allLines.push({ type: 'system', content: line }));
      } else {
        if (msg.reasoning_content) {
          if (showThinking) {
            const cleanReasoning = stripMarkdown(msg.reasoning_content);
            const wrappedReasoning = wrapText(cleanReasoning, usableWidth - 4);
            allLines.push({ type: 'reasoning_header', content: '[Thinking Process] (Ctrl+T to collapse)' });
            wrappedReasoning.forEach((line) => {
              allLines.push({
                type: 'reasoning',
                content: line
              });
            });
          } else {
            allLines.push({ type: 'reasoning_header', content: '[Thinking Process] (Ctrl+T to expand)' });
          }
        }
        const cleanContent = stripMarkdown(msg.content || '');
        if (cleanContent) {
          const wrapped = wrapText(cleanContent, usableWidth - 2);
          wrapped.forEach((line, idx) => allLines.push({ type: 'assistant', content: line, isFirst: idx === 0 }));
        }
      }
      allLines.push({ type: 'spacer' });
    });

    if (allLines.length > 0 && allLines[allLines.length - 1].type === 'spacer') allLines.pop();

    // Fixed height chat area with user-controlled scroll
    const headerRows = 8;
    const inputRows = 4;
    const footerRows = 2;
    const availableHeight = Math.max(5, termHeight - headerRows - inputRows - footerRows);
    const maxScroll = Math.max(0, allLines.length - availableHeight);
    const curScroll = Math.max(0, Math.min(chatScroll, maxScroll));
    const startIndex = Math.max(0, allLines.length - availableHeight - curScroll);
    const lines = allLines.slice(startIndex, startIndex + availableHeight);

    return { visibleLines: lines, actualScroll: curScroll, maxScroll };
  }, [messages, termWidth, termHeight, chatScroll]);

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
            setMessages(full.messages);
            setSessionId(full.id);
            if (full.model) { setActiveModel(full.model); saveModel(full.model); }
            setMessages(prev => [...prev, { role: 'system', content: `[System] Resumed: ${full.title || full.id}` }]);
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
      <Box alignItems="center">
        <AnimatedLogo />
        <Box flexDirection="column">
          <Text bold color="white">Vibe Code v1.0.1</Text>
          <Box><Text color="#a3a3a3">Active: </Text><Text bold color="#D77757">{activeModel.length > 30 ? activeModel.slice(0, 30) + '...' : activeModel}</Text></Box>
          <Text color="#a3a3a3">{availableModels.length || '...'} models • {toolsDefinition.length} AI Tools Active</Text>
          <Text color="#a3a3a3"><Text color="#D77757">Ctrl+M</Text> or <Text color="#D77757">/help</Text> for commands</Text>
        </Box>
      </Box>

      <Box flexDirection="column" flexGrow={1} marginY={1} overflow="hidden">
        {visibleLines.map((line, i) => {
          if (line.type === 'user') {
            return (
              <Box key={i} flexDirection="column" width="100%">
                {line.lines.map((text, j) => {
                  const padLen = Math.max(0, termWidth - 4 - text.length);
                  return (
                    <Text key={j}>{chalk.bgHex('#222222')(chalk.white(text) + ' '.repeat(padLen))}</Text>
                  );
                })}
              </Box>
            );
          } else if (line.type === 'system') {
            return <Text key={i} color="#FBBF24">{line.content}</Text>;
          } else if (line.type === 'reasoning_header') {
            return <Text key={i} color="#666666" bold>{line.content}</Text>;
          } else if (line.type === 'reasoning') {
            return <Text key={i} color="#666666" italic>  {line.content}</Text>;
          } else if (line.type === 'assistant') {
            if (!line.content) return null;
            return <Text key={i} bold color="white">{line.isFirst ? '• ' : '  '}{line.content}</Text>;
          } else if (line.type === 'tool_status') {
            const icon = chalk.hex(line.color)(line.icon);
            const detail = line.detail || '';
            // Agent task line - show goal with strikethrough if completed
            if (line.agentId) {
              const agents = getAgents();
              const agent = agents.get(line.agentId);
              const isDone = agent && (agent.status === 'completed' || agent.status === 'failed' || agent.status === 'stopped');
              const goalText = line.agentGoal || '';
              if (isDone) {
                return <Text key={i}>{'  '}{icon}{' '}{chalk.strikethrough.gray(goalText)}</Text>;
              }
              const statusLabel = agent ? (agent.status === 'running' ? chalk.hex('#D77757')(' [running]') : '') : '';
              return <Text key={i}>{'  '}{icon}{' '}{chalk.white(goalText)}{statusLabel}</Text>;
            }
            return <Text key={i}>{'  '}{icon}{' '}{chalk.bold.white(line.content)}{'  '}{detail}</Text>;
          } else if (line.type === 'tool_content') {
            return <Text key={i}>{line.content}</Text>;
          } else {
            return <Text key={i}> </Text>;
          }
        })}
      </Box>

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
        <AnimatedInputBox isLoading={isLoading} input={input} setInput={setInput} handleSubmit={handleSubmit} actualScroll={actualScroll} selectedFile={(() => {
          if (!input.includes('@') || fileList.length === 0) return null;
          const lastAt = input.lastIndexOf('@');
          const query = input.slice(lastAt + 1).toLowerCase();
          const filtered = fileList.filter(f => f.toLowerCase().includes(query));
          return filtered[dropdownIndex] || filtered[0] || null;
        })()} />
      )}

      <Box justifyContent="space-between" marginTop={1}>
        <Text bold color="white">{displayDir}</Text>
        <Box>
          <Text color="#a3a3a3">Mode: </Text>
          <Text bold color={askBeforeEdits ? '#D77757' : '#666666'}>{askBeforeEdits ? 'Ask before edits' : 'Auto execute edits'}</Text>
          <Text color="#a3a3a3">  •  Model: </Text>
          <Text color="#D77757">{activeModel.length > 20 ? activeModel.slice(0, 20) + '..' : activeModel}</Text>
          <Text color="#a3a3a3">  •  </Text>
          <Text color={tokenUsage.used > tokenUsage.limit * 0.8 ? '#EF4444' : tokenUsage.used > tokenUsage.limit * 0.5 ? '#FBBF24' : '#3ECF8E'}>{(tokenUsage.used / 1000).toFixed(1)}k</Text>
          <Text color="#666666">/{(tokenUsage.limit / 1000).toFixed(0)}k ctx</Text>
        </Box>
      </Box>
    </Box>
  );
};

export default App;
