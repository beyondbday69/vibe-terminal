import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import chalk from 'chalk';
import os from 'os';
import fs from 'node:fs/promises';
import path from 'node:path';

// Hooks & Utils
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { wrapText } from './utils/text.js';
import { formatToolResult } from './utils/toolFormatters.js';
import { saveSession, loadSession, listSessions, deleteSession, generateSessionId } from './utils/sessions.js';

// Components
import { AnimatedLogo } from './components/AnimatedLogo.jsx';
import { AnimatedInputBox } from './components/AnimatedInputBox.jsx';
import { ModelSelector } from './components/ModelSelector.jsx';

// Tools Engine
import { toolsDefinition } from './tools/definitions.js';
import { executeToolCall } from './tools/executor.js';
import { setApiKey, setModel, getAgents } from './tools/handlers/agents.js';

const CONFIG_PATH = path.join(os.homedir(), '.vibe-terminal.json');

const saveModel = async (model) => {
  try {
    await fs.writeFile(CONFIG_PATH, JSON.stringify({ activeModel: model }), 'utf-8');
  } catch {}
};

let toolIdCounter = 0;
const nextToolId = () => `tool_${++toolIdCounter}`;

const App = () => {
  const { columns: termWidth, rows: termHeight } = useTerminalSize();

  const [input, setInput] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [activeModel, setActiveModel] = useState('gpt-5.5');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [chatScroll, setChatScroll] = useState(0);
  const [showAgentDetail, setShowAgentDetail] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  const cwd = process.cwd();
  const homeDir = os.homedir();
  const displayDir = cwd.startsWith(homeDir) ? cwd.replace(homeDir, '~') : cwd;

  useEffect(() => {
    setChatScroll(0);
  }, [messages.length, isLoading]);

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
    const key = process.env.OPENAI_API_KEY || '';
    setApiKey(key);
  }, []);

  useEffect(() => {
    setModel(activeModel);
  }, [activeModel]);

  useEffect(() => {
    const init = async () => {
      try {
        const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf-8'));
        if (config.activeModel) setActiveModel(config.activeModel);
      } catch {}
      try {
        const res = await fetch('https://opencode.ai/zen/v1/models');
        const json = await res.json();
        setAvailableModels(json.data.map(m => m.id));
      } catch {
        setAvailableModels([]);
      }
    };
    init();
  }, []);

  useInput((inputChar, key) => {
    if (showAgentDetail) {
      if (key.escape || inputChar === 'q' || (key.ctrl && inputChar === 'o')) {
        setShowAgentDetail(null);
      }
      return;
    }
    if (showModelSelector) return;

    // Shortcuts
    if (key.ctrl && inputChar === 'm') { setShowModelSelector(true); return; }
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
      return;
    }
    if (inputChar && !key.ctrl && !key.meta) {
      // Handle paste (multi-char input) and single chars
      setInput(prev => prev + inputChar);
    }
  }, { isActive: !showModelSelector });

  const handleModelSelect = useCallback((model) => {
    setActiveModel(model);
    setShowModelSelector(false);
    saveModel(model);
    setMessages(prev => [...prev, { role: 'system', content: `Model switched to: ${model}` }]);
  }, []);

  const handleSubmit = async (query) => {
    if (!query.trim() || isLoading || showModelSelector) return;
    const trimmedQuery = query.trim();
    const lowerQuery = trimmedQuery.toLowerCase();

    if (trimmedQuery.startsWith('/')) {
      if (lowerQuery === '/help') {
        const helpText = `[Help] Available Commands:\n  /help         - Show this message\n  /model        - Open the interactive model selector\n  /model <id>   - Switch directly to a model\n  /resume       - List saved sessions\n  /resume <id>  - Restore a saved session\n  /clear        - Clear the chat history\n  Ctrl+M        - Shortcut to open model selector\n  Ctrl+O        - View agent details (when agent is running)\n\nTools: bash, file ops, search, web, tasks, cron, agents`;
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
      } else if (lowerQuery === '/clear') {
        setMessages([]);
        setSessionId(null);
      } else if (lowerQuery === '/resume') {
        const sessions = await listSessions();
        if (sessions.length === 0) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: '[System] No saved sessions found.' }]);
        } else {
          const lines = ['[Sessions] Saved sessions:\n'];
          sessions.forEach((s, i) => {
            const date = new Date(s.savedAt).toLocaleString();
            lines.push(`  ${i + 1}. ${s.id}  ${s.model}  ${s.messageCount} msgs  ${date}`);
            lines.push(`     ${s.preview}`);
          });
          lines.push('\nUse /resume <session_id> to restore a session.');
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: lines.join('\n') }]);
        }
      } else if (lowerQuery.startsWith('/resume ')) {
        const targetId = trimmedQuery.split(' ')[1];
        const session = await loadSession(targetId);
        if (!session) {
          setMessages(prev => [...prev, { role: 'user', content: query }, { role: 'system', content: `[Error] Session not found: ${targetId}` }]);
        } else {
          setMessages(session.messages);
          setSessionId(session.id);
          if (session.model) {
            setActiveModel(session.model);
            saveModel(session.model);
          }
          setMessages(prev => [...prev, { role: 'system', content: `[System] Resumed session ${session.id} (${session.messages.length} messages)` }]);
        }
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

    try {
      let requiresApiCall = true;

      while (requiresApiCall) {
        const apiMessages = conversation.filter(m => m.role !== 'system' && m.role !== 'tool_call');

        const res = await fetch('https://opencode.ai/zen/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`,
          },
          body: JSON.stringify({
            model: activeModel,
            messages: apiMessages,
            tools: toolsDefinition,
            stream: true,
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

            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta || {};

            // Capture DeepSeek reasoning_content
            if (delta.reasoning_content) {
              streamedReasoning += delta.reasoning_content;
            }

            if (delta.content) {
              streamedContent += delta.content;
              conversation[conversation.length - 1] = { role: 'assistant', content: streamedContent };
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
            const result = await executeToolCall(funcName, funcArgs);

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
      setMessages([...conversation, { role: 'system', content: `[Error] ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const { visibleLines, actualScroll } = useMemo(() => {
    const usableWidth = termWidth - 4;
    const userTextWidth = termWidth - 8;
    const allLines = [];

    messages.forEach(msg => {
      if (msg.role === 'tool') return;

      if (msg.role === 'tool_call') {
        const toolLines = formatToolResult(
          msg.name,
          msg.status === 'running' ? null : msg.result,
          usableWidth
        );
        toolLines.forEach(line => allLines.push(line));
        allLines.push({ type: 'spacer' });
        return;
      }

      if (msg.role === 'user') {
        const wrapped = wrapText(msg.content, userTextWidth);
        wrapped.forEach((line, idx) => allLines.push({ type: 'user', content: line, isFirst: idx === 0 }));
      } else if (msg.role === 'system') {
        const wrapped = wrapText(msg.content, usableWidth);
        wrapped.forEach(line => allLines.push({ type: 'system', content: line }));
      } else {
        const wrapped = wrapText(msg.content || '', usableWidth - 2);
        wrapped.forEach((line, idx) => allLines.push({ type: 'assistant', content: line, isFirst: idx === 0 }));
      }
      allLines.push({ type: 'spacer' });
    });

    if (allLines.length > 0 && allLines[allLines.length - 1].type === 'spacer') allLines.pop();

    const RESERVED_ROWS = 19;
    const availableHeight = Math.max(0, termHeight - RESERVED_ROWS);
    const maxScroll = Math.max(0, allLines.length - availableHeight);
    const curScroll = Math.max(0, Math.min(chatScroll, maxScroll));
    const startIndex = Math.max(0, allLines.length - availableHeight - curScroll);
    const lines = availableHeight > 0 ? allLines.slice(startIndex, allLines.length - curScroll) : [];

    return { visibleLines: lines, actualScroll: curScroll };
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

  if (showAgentDetail) {
    const agent = showAgentDetail;
    const age = Math.round((Date.now() - agent.createdAt) / 1000);
    const borderColor = agent.status === 'running' ? '#8b5cf6' : agent.status === 'completed' ? '#22c55e' : '#ef4444';
    return (
      <Box flexDirection="column" width={termWidth} height={termHeight} paddingX={2} paddingY={1}>
        <Box borderStyle="single" borderColor={borderColor} flexDirection="column" paddingX={2} paddingY={1} width={Math.min(termWidth - 4, 90)}>
          <Text bold color="white">Agent {agent.id}</Text>
          <Text color="#a3a3a3">Status: <Text bold color={agent.status === 'running' ? '#8b5cf6' : agent.status === 'completed' ? '#22c55e' : '#ef4444'}>{agent.status}</Text></Text>
          <Text color="#a3a3a3">Goal: {chalk.white(agent.goal)}</Text>
          <Text color="#a3a3a3">Steps: {agent.iterations}  |  Time: {age}s</Text>
          {agent.lastActionDetail && <Text color="#a3a3a3">Last: {chalk.hex('#8b5cf6')(agent.lastActionDetail)}</Text>}
          {agent.log.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="#8b5cf6">Activity Log:</Text>
              {agent.log.slice(-15).map((entry, i) => (
                <Text key={i} color="#737373">  {entry}</Text>
              ))}
            </Box>
          )}
          {agent.result && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="#22c55e">Result:</Text>
              <Text color="white">{agent.result}</Text>
            </Box>
          )}
          {agent.error && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="#ef4444">Error:</Text>
              <Text color="#ef4444">{agent.error}</Text>
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
      <Box justifyContent="center">
        <Box borderStyle="single" borderColor="#c2410c" paddingX={4} paddingY={1} alignItems="center">
          <AnimatedLogo />
          <Box flexDirection="column">
            <Text bold color="white">Mr. Vibe v1.0.1</Text>
            <Box><Text color="#a3a3a3">Active: </Text><Text bold color="#FB923C">{activeModel}</Text></Box>
            <Text color="#a3a3a3">{availableModels.length || '...'} models • {toolsDefinition.length} AI Tools Active</Text>
            <Text>{"\n"}{displayDir}{"\n"}</Text>
            <Text color="#a3a3a3"><Text color="#fb923c">Ctrl+M</Text> or <Text color="#fb923c">/help</Text> for commands</Text>
          </Box>
        </Box>
      </Box>

      <Box flexDirection="column" flexGrow={1} marginY={1} overflow="hidden">
        {visibleLines.map((line, i) => {
          if (line.type === 'user') {
            const visibleLen = line.content.length;
            const padLen = Math.max(0, termWidth - visibleLen);
            return (
              <Text key={i}>{chalk.bgHex('#222222')(chalk.white(line.content) + ' '.repeat(padLen))}</Text>
            );
          } else if (line.type === 'system') {
            return <Text key={i} color="#facc15">{line.content}</Text>;
          } else if (line.type === 'assistant') {
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
              const statusLabel = agent ? (agent.status === 'running' ? chalk.hex('#8b5cf6')(' [running]') : '') : '';
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

      <AnimatedInputBox isLoading={isLoading} input={input} setInput={setInput} handleSubmit={handleSubmit} actualScroll={actualScroll} />

      <Box justifyContent="space-between" marginTop={1}>
        <Text bold color="white">{displayDir}</Text>
        <Text color="#a3a3a3">Model: <Text color="#FB923C">{activeModel}</Text>  •  Tools Loaded: {toolsDefinition.length}</Text>
      </Box>
    </Box>
  );
};

export default App;
