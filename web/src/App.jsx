import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// ── Constants ────────────────────────────────────────────────────────────────
const TOOLS = [
  { type: 'function', function: { name: 'run_bash', description: 'Execute a shell command.', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'read_file', description: 'Read file contents.', parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Create or overwrite a file.', parameters: { type: 'object', properties: { file_path: { type: 'string' }, content: { type: 'string' } }, required: ['file_path', 'content'] } } },
  { type: 'function', function: { name: 'edit_file', description: 'Edit a file using SEARCH/REPLACE blocks.', parameters: { type: 'object', properties: { file_path: { type: 'string' }, diff: { type: 'string' } }, required: ['file_path', 'diff'] } } },
  { type: 'function', function: { name: 'glob_files', description: 'Find files matching a glob pattern.', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'grep_search', description: 'Search file contents.', parameters: { type: 'object', properties: { search_term: { type: 'string' }, path: { type: 'string' } }, required: ['search_term'] } } },
  { type: 'function', function: { name: 'web_fetch', description: 'Fetch a URL.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'web_search', description: 'Search the web.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'task_create', description: 'Create a background task.', parameters: { type: 'object', properties: { command: { type: 'string' }, label: { type: 'string' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'task_list', description: 'List background tasks.' } },
  { type: 'function', function: { name: 'task_output', description: 'Get task output.', parameters: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] } } },
  { type: 'function', function: { name: 'task_stop', description: 'Stop a task.', parameters: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] } } },
  { type: 'function', function: { name: 'agent_spawn', description: 'Spawn a sub-agent to work autonomously. Write a detailed, self-contained prompt as the goal - include all context, file paths, expected outputs, and success criteria the agent needs. The agent has full tool access. Optionally specify a type for specialized behavior.', parameters: { type: 'object', properties: { goal: { type: 'string', description: 'Detailed self-contained prompt for the agent with all context needed' }, type: { type: 'string', enum: ['explore', 'plan', 'verify', 'code', 'debug'], description: 'Agent type: explore (codebase analysis), plan (design implementation), verify (check correctness), code (write/edit code), debug (fix bugs)' } }, required: ['goal'] } } },
  { type: 'function', function: { name: 'agent_list', description: 'List all active sub-agents and their status.' } },
  { type: 'function', function: { name: 'agent_get', description: 'Get detailed status and results of a specific agent.', parameters: { type: 'object', properties: { agent_id: { type: 'string', description: 'Agent ID (e.g. agent_1)' } }, required: ['agent_id'] } } },
  { type: 'function', function: { name: 'agent_stop', description: 'Stop a running agent.', parameters: { type: 'object', properties: { agent_id: { type: 'string', description: 'Agent ID to stop' } }, required: ['agent_id'] } } },
];

const SLASH_COMMANDS = ['/help', '/model', '/apikey', '/provider', '/rewind', '/branch', '/clear', '/init', '/resume', '/delete', '/exit', '/agents', '/attach'];

const AGENT_COLORS = [
  'red', 'green', 'yellow', 'blue', 'magenta',
  'orange', 'pink', 'teal', 'lavender',
];

// ── File Picker ──────────────────────────────────────────────────────────────
function FilePicker({ files, selected, onToggle, onAttach, onClose }) {
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState(0);
  const [currentDir, setCurrentDir] = useState('');
  const inputRef = useRef(null);

  // Build directory tree from flat file list
  const { dirs, dirFiles } = useMemo(() => {
    const dirSet = new Set();
    const fileList = [];
    for (const f of files) {
      if (f.startsWith(currentDir ? currentDir + '/' : '')) {
        const rest = currentDir ? f.slice(currentDir.length + 1) : f;
        const slashIdx = rest.indexOf('/');
        if (slashIdx !== -1) {
          dirSet.add((currentDir ? currentDir + '/' : '') + rest.slice(0, slashIdx));
        } else {
          fileList.push(f);
        }
      }
    }
    return { dirs: [...dirSet].sort(), dirFiles: fileList };
  }, [files, currentDir]);

  const filtered = useMemo(() => {
    if (!search) return [...dirs, ...dirFiles];
    const q = search.toLowerCase();
    return [...dirs, ...dirFiles].filter(f => {
      const name = f.split('/').pop();
      return name.toLowerCase().includes(q);
    });
  }, [dirs, dirFiles, search]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const minCursor = currentDir && !search ? -1 : 0;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(minCursor, c - 1)); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(filtered.length - 1, c + 1)); }
    if (e.key === 'Enter') {
      if (cursor === -1) { goUp(); return; }
      if (filtered[cursor]) {
        if (dirs.includes(filtered[cursor])) { enterDir(filtered[cursor]); }
        else { onToggle(filtered[cursor]); }
      }
    }
  };

  const goUp = () => {
    if (!currentDir) return;
    const parts = currentDir.split('/');
    parts.pop();
    const parent = parts.join('/');
    setCurrentDir(parent);
    setCursor(parent ? -1 : 0);
    setSearch('');
  };

  const enterDir = (dir) => {
    setCurrentDir(dir);
    setCursor(-1);
    setSearch('');
  };

  const ext = (f) => f.includes('.') ? f.split('.').pop() : '';

  const icon = (f, isDir) => {
    if (isDir) return '>';
    const e = ext(f);
    if (['js', 'jsx'].includes(e)) return 'JS';
    if (['ts', 'tsx'].includes(e)) return 'TS';
    if (e === 'py') return 'Py';
    if (['html', 'htm'].includes(e)) return '<>';
    if (['css', 'scss'].includes(e)) return '{}';
    if (['json', 'yaml', 'yml', 'toml'].includes(e)) return '{}';
    if (['md', 'txt'].includes(e)) return '#';
    if (['sh', 'bash', 'zsh'].includes(e)) return '$';
    return '  ';
  };

  const displayName = (path) => {
    const name = path.split('/').pop();
    return name;
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-box" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <AnimatedLogo />
        <div className="overlay-header">
          <span className="title">Attach Files</span>
          <span className="hint">ESC close | ENTER open/toggle</span>
        </div>
        <input
          ref={inputRef}
          className="overlay-search"
          placeholder="Search in folder..."
          value={search}
          onChange={e => { setSearch(e.target.value); setCursor(0); }}
        />
        <div className="overlay-list" style={{ maxHeight: 320 }}>
          {currentDir && !search && (
            <div
              className={`overlay-item ${cursor === -1 ? 'selected' : ''}`}
              onClick={goUp}
              onMouseEnter={() => setCursor(-1)}
            >
              <div className="file-item">
                <span className="file-icon file-icon-dir">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                  </svg>
                </span>
                <span className="file-name file-name-dir">..</span>
              </div>
            </div>
          )}
          {filtered.length === 0 && !currentDir && (
            <div className="overlay-item" style={{ color: 'var(--text-muted)', cursor: 'default' }}>
              No files found.
            </div>
          )}
          {filtered.map((item, i) => {
            const isDir = dirs.includes(item);
            const isSelected = selected.has(item);
            return (
              <div
                key={item}
                className={`overlay-item ${i === cursor ? 'selected' : ''} ${isSelected ? 'file-attached' : ''}`}
                onClick={() => isDir ? enterDir(item) : onToggle(item)}
                onMouseEnter={() => setCursor(i)}
              >
                <div className="file-item">
                  <span className={`file-icon ${isDir ? 'file-icon-dir' : ''}`}>
                    {isDir ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                        <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                      </svg>
                    ) : icon(item, false)}
                  </span>
                  <span className={`file-name ${isDir ? 'file-name-dir' : ''} ${isSelected ? 'file-name-selected' : ''}`}>
                    {displayName(item)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="overlay-footer">
          <span className="hint">{selected.size} selected</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="preset-btn active" onClick={onAttach}>Attach</button>
            <button className="preset-btn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Logo ─────────────────────────────────────────────────────────────────────
import newLogo from '../assets/newlogo.png';

function AnimatedLogo({ header }) {
  return (
    <img src={newLogo} alt="Vibe Code" className={`logo-img${header ? ' header' : ''}`} />
  );
}

// ── Thinking Animation ───────────────────────────────────────────────────────
const SPINNER = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
const LOADING_TEXTS = ['Thinking','Building','Cooking','Crafting','Working','Processing','Generating','Analyzing','Composing','Computing'];

function ThinkingText() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 100); return () => clearInterval(t); }, []);
  const spinner = SPINNER[tick % SPINNER.length];
  const text = LOADING_TEXTS[Math.floor(tick / 15) % LOADING_TEXTS.length];
  return (
    <div className="thinking">
      <span className="spinner">{spinner}</span>
      <span className="text"><span>{text}...</span></span>
    </div>
  );
}

// ── Dropdown ─────────────────────────────────────────────────────────────────
function CommandDropdown({ items, selectedIndex, onSelect, label }) {
  if (!items.length) return null;
  const visible = items.slice(0, 6);
  return (
    <div className="dropdown">
      {visible.map((item, i) => (
        <div
          key={i}
          className={`dropdown-item ${i === selectedIndex ? 'selected' : ''}`}
          onClick={() => onSelect(item)}
        >
          <span className="pointer">{i === selectedIndex ? '\u25B8' : ' '}</span>
          <span className="label">{item.label}</span>
          {item.desc && <span className="desc">{item.desc}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Model Selector ───────────────────────────────────────────────────────────
function ModelSelector({ models, activeModel, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  const filtered = models.filter(m => m.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowUp') setSelected(s => Math.max(0, s - 1));
    if (e.key === 'ArrowDown') setSelected(s => Math.min(filtered.length - 1, s + 1));
    if (e.key === 'Enter' && filtered[selected]) { onSelect(filtered[selected]); onClose(); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-box" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <AnimatedLogo />
        <div className="overlay-header">
          <span className="title">Select Model</span>
          <span className="hint">ESC: cancel</span>
        </div>
        <input
          ref={inputRef}
          className="overlay-search"
          placeholder="Search models..."
          value={search}
          onChange={e => { setSearch(e.target.value); setSelected(0); }}
        />
        <div className="overlay-list">
          {filtered.map((model, i) => (
            <div
              key={model}
              className={`overlay-item ${i === selected ? 'selected' : ''}`}
              onClick={() => { onSelect(model); onClose(); }}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="model-name">
                {model === activeModel && <span className="active">{'\u2713 '} </span>}
                {model}
              </span>
            </div>
          ))}
        </div>
        <div className="overlay-footer">
          <span className="hint">{'\u2191\u2193'} navigate</span>
          <span className="hint">ENTER select</span>
        </div>
      </div>
    </div>
  );
}

// ── Provider Selector ────────────────────────────────────────────────────────
function ProviderSelector({ provider, onSave, onClose }) {
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl || '');
  const [modelsUrl, setModelsUrl] = useState(provider.modelsUrl || '');
  const [apiKey, setApiKey] = useState(provider.apiKey || '');
  const [name, setName] = useState(provider.name || 'custom');
  const refs = useRef([]);

  useEffect(() => { refs.current[0]?.focus(); }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
  };

  const handleSubmit = () => {
    if (!baseUrl.trim()) return;
    const p = { name, baseUrl: baseUrl.trim(), apiKey: apiKey.trim() };
    if (modelsUrl.trim()) p.modelsUrl = modelsUrl.trim();
    onSave(p);
    onClose();
  };

  const PRESETS = [
    { label: 'OpenCode', name: 'opencode', baseUrl: 'https://opencode.ai/zen/v1' },
    { label: 'NVIDIA NIM', name: 'nvidia', baseUrl: 'https://integrate.api.nvidia.com/v1' },
  ];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <AnimatedLogo />
        <div className="overlay-header">
          <span className="title">Provider Settings</span>
          <span className="hint">ESC: cancel</span>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {PRESETS.map(p => (
            <button
              key={p.name}
              className={`preset-btn ${name === p.name ? 'active' : ''}`}
              onClick={() => { setName(p.name); setBaseUrl(p.baseUrl); setModelsUrl(''); }}
            >{p.label}</button>
          ))}
        </div>

        <label className="field-label">Base URL</label>
        <input
          ref={el => refs.current[0] = el}
          className="overlay-search"
          placeholder="https://api.openai.com/v1"
          value={baseUrl}
          onChange={e => { setBaseUrl(e.target.value); setName('custom'); }}
          onKeyDown={e => { if (e.key === 'Enter') refs.current[1]?.focus(); }}
        />

        <label className="field-label">Models URL <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional, defaults to baseUrl/models)</span></label>
        <input
          ref={el => refs.current[1] = el}
          className="overlay-search"
          placeholder="https://api.example.com/v1/models"
          value={modelsUrl}
          onChange={e => { setModelsUrl(e.target.value); setName('custom'); }}
          onKeyDown={e => { if (e.key === 'Enter') refs.current[2]?.focus(); }}
        />

        <label className="field-label">API Key</label>
        <input
          ref={el => refs.current[2] = el}
          className="overlay-search"
          type="password"
          placeholder="sk-... (optional)"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
        />

        <div className="overlay-footer" style={{ marginTop: 12 }}>
          <button className="preset-btn active" onClick={handleSubmit}>Save</button>
          <button className="preset-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Session Resume ───────────────────────────────────────────────────────────
function SessionResume({ sessions, onLoad, onDelete, onClose }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  const filtered = sessions.filter(s =>
    (s.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.model || '').toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowUp') setSelected(s => Math.max(0, s - 1));
    if (e.key === 'ArrowDown') setSelected(s => Math.min(filtered.length - 1, s + 1));
    if (e.key === 'Enter' && filtered[selected]) { onLoad(filtered[selected]); onClose(); }
    if (e.key === 'Delete' && filtered[selected]) {
      e.preventDefault();
      onDelete(filtered[selected].id);
      setSelected(s => Math.max(0, s - 1));
    }
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-box" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <AnimatedLogo />
        <div className="overlay-header">
          <span className="title">Resume Session</span>
          <span className="hint">ESC: cancel | DEL: delete</span>
        </div>
        <input
          ref={inputRef}
          className="overlay-search"
          placeholder="Search sessions..."
          value={search}
          onChange={e => { setSearch(e.target.value); setSelected(0); }}
        />
        <div className="overlay-list" style={{ maxHeight: 320 }}>
          {filtered.length === 0 && (
            <div className="overlay-item" style={{ color: 'var(--text-muted)', cursor: 'default' }}>
              {sessions.length === 0 ? 'No saved sessions yet. Chat auto-saves.' : 'No sessions match search.'}
            </div>
          )}
          {filtered.map((session, i) => (
            <div
              key={session.id}
              className={`overlay-item ${i === selected ? 'selected' : ''}`}
              onClick={() => { onLoad(session); onClose(); }}
              onMouseEnter={() => setSelected(i)}
            >
              <div className="session-item">
                <div className="session-info">
                  <span className="session-title">{session.title || 'Untitled'}</span>
                  <span className="session-meta">
                    {session.messageCount || 0} msgs{'  \u2022  '}{session.model || 'unknown'}{'  \u2022  '}{formatTime(session.savedAt)}
                  </span>
                </div>
                <button
                  className="session-delete"
                  onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
                  title="Delete session"
                >x</button>
              </div>
            </div>
          ))}
        </div>
        <div className="overlay-footer">
          <span className="hint">{'\u2191\u2193'} navigate</span>
          <span className="hint">ENTER load</span>
        </div>
      </div>
    </div>
  );
}

// ── Agents Panel ─────────────────────────────────────────────────────────────
function AgentsPanel({ agents, onStop, onRefresh, onClose }) {
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const interval = setInterval(onRefresh, 2000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowUp') setSelected(s => Math.max(0, s - 1));
    if (e.key === 'ArrowDown') setSelected(s => Math.min(agents.length - 1, s + 1));
  };

  const statusColor = (status, color) => {
    if (status === 'running') return `var(--agent-${color || 'teal'})`;
    if (status === 'completed') return 'var(--green)';
    if (status === 'failed') return 'var(--red)';
    return 'var(--text-muted)';
  };

  const statusIcon = (status) => {
    if (status === 'running') return '\u25B6';
    if (status === 'completed') return '\u2713';
    if (status === 'failed') return '\u2717';
    return '\u2014';
  };

  const formatAge = (ms) => {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-box" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <AnimatedLogo />
        <div className="overlay-header">
          <span className="title">Agents</span>
          <span className="hint">ESC close | R refresh</span>
        </div>

        <div className="overlay-list" style={{ maxHeight: 400 }}>
          {agents.length === 0 && (
            <div className="overlay-item" style={{ color: 'var(--text-muted)', cursor: 'default' }}>
              No agents running. The AI can spawn agents with agent_spawn.
            </div>
          )}
          {agents.map((agent, i) => (
            <div
              key={agent.id}
              className={`overlay-item ${i === selected ? 'selected' : ''}`}
              onMouseEnter={() => setSelected(i)}
            >
              <div className="agent-item">
                <div className="agent-status" style={{ color: statusColor(agent.status, agent.color) }}>
                  {statusIcon(agent.status)}
                </div>
                <div className="agent-info">
                  <div className="agent-header">
                    <span className="agent-id" style={{ color: `var(--agent-${agent.color || 'teal'})` }}>{agent.id}</span>
                    <span className="agent-age">{formatAge(agent.createdAt)}</span>
                    <span className="agent-steps">step {agent.iterations}</span>
                  </div>
                  <div className="agent-goal">{agent.goal.length > 70 ? agent.goal.slice(0, 70) + '...' : agent.goal}</div>
                  {agent.log.length > 0 && (
                    <div className="agent-log" style={{ borderLeftColor: `var(--agent-${agent.color || 'teal'})` }}>
                      {agent.log.slice(-3).map((l, j) => <div key={j}>{l}</div>)}
                    </div>
                  )}
                  {agent.result && (
                    <div className="agent-result" style={{ borderLeftColor: `var(--agent-${agent.color || 'teal'})` }}>
                      {agent.result.split('\n').slice(0, 3).join(' ')}
                    </div>
                  )}
                  {agent.error && (
                    <div className="agent-error">{agent.error}</div>
                  )}
                </div>
                {agent.status === 'running' && (
                  <button className="agent-stop-btn" style={{ borderColor: `var(--agent-${agent.color || 'teal'})`, color: `var(--agent-${agent.color || 'teal'})` }} onClick={(e) => { e.stopPropagation(); onStop(agent.id); }}>
                    stop
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="overlay-footer">
          <span className="hint">{agents.filter(a => a.status === 'running').length} running</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {AGENT_COLORS.map(c => (
              <span key={c} style={{ width: 10, height: 10, background: `var(--agent-${c})`, display: 'inline-block' }} />
            ))}
          </div>
          <button className="preset-btn" onClick={onRefresh}>Refresh</button>
        </div>
      </div>
    </div>
  );
}

// ── Tool Result Renderers ────────────────────────────────────────────────────
function ToolStatusLine({ icon, color, name, detail }) {
  return (
    <div className="tool-status">
      <span className="icon" style={{ color }}>{icon}</span>
      <span className="name">{name}</span>
      {detail && <span className="detail" dangerouslySetInnerHTML={{ __html: detail }} />}
    </div>
  );
}

function AgentProgressCard({ result }) {
  const [expanded, setExpanded] = useState(false);
  const [agent, setAgent] = useState(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/agents');
        const list = await r.json();
        const found = list.find(a => a.id === result.id);
        if (found) setAgent(found);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [result.id]);

  const color = result.color || 'teal';
  const status = agent?.status || 'running';
  const statusLabel = status === 'running' ? 'running' : status === 'completed' ? 'done' : status;
  const agentType = agent?.type || result.type;

  return (
    <div className="agent-spawned-card" style={{ borderColor: `var(--agent-${color})` }}>
      <div className="agent-spawned-header" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <span className="agent-spawned-chevron">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span className="agent-spawned-id" style={{ color: `var(--agent-${color})` }}>{result.id}</span>
        {agentType && <span className="agent-spawned-type">{agentType}</span>}
        <span className="agent-spawned-status" style={{ color: `var(--agent-${color})`, borderColor: `var(--agent-${color})` }}>{statusLabel}</span>
        {agent && <span className="agent-spawned-steps">step {agent.iterations}</span>}
      </div>
      <div className="agent-spawned-goal">{result.goal}</div>
      {expanded && agent && (
        <div className="agent-spawned-body">
          {agent.log.length > 0 && (
            <div className="agent-spawned-log" style={{ borderLeftColor: `var(--agent-${color})` }}>
              {agent.log.slice(-5).map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
          {agent.result && (
            <div className="agent-spawned-result">
              {agent.result.split('\n').slice(0, 5).map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
          {agent.error && (
            <div className="agent-spawned-error">{agent.error}</div>
          )}
          {status === 'running' && (
            <button className="agent-stop-btn" style={{ borderColor: `var(--agent-${color})`, color: `var(--agent-${color})` }} onClick={async (e) => {
              e.stopPropagation();
              await fetch('/api/tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'agent_stop', args: { agent_id: result.id } }) });
            }}>Stop</button>
          )}
        </div>
      )}
    </div>
  );
}

function ToolResult({ result }) {
  if (!result) return null;

  if (result.type === 'error') {
    return (
      <>
        <ToolStatusLine icon={'\u2717'} color="var(--red)" name="error" />
        <div className="tool-content" style={{ color: 'var(--red)' }}>{result.message}</div>
      </>
    );
  }

  if (result.type === 'agent_spawned') {
    return <AgentProgressCard result={result} />;
  }

  if (result.type === 'file_read') {
    const lines = result.content.split('\n').slice(0, 5);
    const hasMore = result.lineCount > 5;
    return (
      <>
        <ToolStatusLine
          icon={'\u2713'} color="var(--green)" name="read_file"
          detail={`<span class="file-badge">[${shortenPath(result.path)}]</span>  ${result.lineCount} lines`}
        />
        {lines.map((l, i) => (
          <div key={i} className="tool-content">
            <span className="line-num">{String(i + 1).padStart(3)}</span>{'  '}{l}
          </div>
        ))}
        {hasMore && <div className="tool-content"><span style={{ color: '#525252' }}>{`  ... ${result.lineCount - 5} more lines`}</span></div>}
      </>
    );
  }

  if (result.type === 'file_created') {
    return (
      <>
        <ToolStatusLine
          icon={'\u2713'} color="var(--green)" name="write_file"
          detail={`<span class="file-badge">${shortenPath(result.path)}</span>  ${result.lineCount} lines \u2022 ${result.bytes} bytes`}
        />
        <DiffView oldContent={result.oldContent} newContent={result.content} />
      </>
    );
  }

  if (result.type === 'file_edited') {
    return (
      <>
        <ToolStatusLine
          icon={'\u2713'} color="var(--green)" name="edit_file"
          detail={`<span class="file-badge">${shortenPath(result.path)}</span>  ${result.blockCount} block(s)`}
        />
        <EditDiffView blocks={result.blocks} />
      </>
    );
  }

  if (result.type === 'bash_result') {
    const success = result.exitCode === 0 && !result.timedOut;
    const output = (result.stdout + result.stderr).trim();
    return (
      <>
        <ToolStatusLine
          icon={success ? '\u2713' : '\u2717'} color={success ? 'var(--green)' : 'var(--red)'} name="run_bash"
          detail={`${result.command.slice(0, 40)}  [exit: ${result.exitCode}]`}
        />
        {output.split('\n').slice(0, 10).map((l, i) => (
          <div key={i} className="tool-content" style={{ color: '#d4d4d4' }}>{l}</div>
        ))}
      </>
    );
  }

  if (result.type === 'generic') {
    return (
      <>
        <ToolStatusLine icon={'\u2713'} color="var(--green)" name="result" />
        {(result.message || '').split('\n').slice(0, 10).map((l, i) => (
          <div key={i} className="tool-content" style={{ color: '#a3a3a3' }}>{l}</div>
        ))}
      </>
    );
  }

  return (
    <div className="tool-content" style={{ color: '#a3a3a3' }}>
      {JSON.stringify(result).slice(0, 200)}
    </div>
  );
}

function EditDiffView({ blocks }) {
  if (!blocks?.length) return null;
  return (
    <div className="diff-view">
      {blocks.map((b, i) => {
        const sl = b.searchLines || [];
        const rl = b.replaceLines || [];
        return (
          <React.Fragment key={i}>
            <div className="diff-hunk-separator">@@ line {b.lineNum} @@</div>
            {sl.map((l, j) => {
              const lineNum = b.lineNum + j;
              return (
                <div key={`s${j}`} className="diff-line removed">
                  <span className="diff-line-num old">{String(lineNum).padStart(3)}</span>
                  <span className="diff-line-num new">   </span>
                  <span className="diff-sign">-</span>
                  <span className="diff-text">{l}</span>
                </div>
              );
            })}
            {rl.map((l, j) => {
              const lineNum = b.lineNum + j;
              return (
                <div key={`r${j}`} className="diff-line added">
                  <span className="diff-line-num old">   </span>
                  <span className="diff-line-num new">{String(lineNum).padStart(3)}</span>
                  <span className="diff-sign">+</span>
                  <span className="diff-text">{l}</span>
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function DiffView({ oldContent, newContent }) {
  if (!newContent) return null;
  if (oldContent === null || oldContent === undefined) {
    const lines = newContent.split('\n');
    const preview = lines.slice(0, 10);
    return (
      <div className="diff-view">
        {preview.map((l, i) => (
          <div key={i} className="diff-line added">
            <span className="diff-line-num old"> </span>
            <span className="diff-line-num new">{String(i + 1).padStart(3)}</span>
            <span className="diff-sign">+</span>
            <span className="diff-text">{l}</span>
          </div>
        ))}
        {lines.length > 10 && <div className="diff-more">... {lines.length - 10} more lines</div>}
      </div>
    );
  }

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const diff = computeDiff(oldLines, newLines);
  const CONTEXT = 3;
  const hunks = groupHunks(diff, CONTEXT);

  return (
    <div className="diff-view">
      {hunks.map((hunk, hi) => (
        <React.Fragment key={hi}>
          {hunk.map((entry, ei) => (
            <div key={ei} className={`diff-line ${entry.type}`}>
              <span className="diff-line-num old">{entry.oldLine != null ? String(entry.oldLine).padStart(3) : '   '}</span>
              <span className="diff-line-num new">{entry.newLine != null ? String(entry.newLine).padStart(3) : '   '}</span>
              <span className="diff-sign">{entry.type === 'added' ? '+' : entry.type === 'removed' ? '-' : ' '}</span>
              <span className="diff-text">{entry.line}</span>
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

function computeDiff(oldLines, newLines) {
  const result = [];
  let oi = 0, ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: 'context', line: oldLines[oi], oldLine: oi + 1, newLine: ni + 1 });
      oi++; ni++;
    } else if (oi < oldLines.length && (ni >= newLines.length || !newLines.includes(oldLines[oi]))) {
      result.push({ type: 'removed', line: oldLines[oi], oldLine: oi + 1, newLine: null });
      oi++;
    } else if (ni < newLines.length) {
      result.push({ type: 'added', line: newLines[ni], oldLine: null, newLine: ni + 1 });
      ni++;
    }
  }
  return result;
}

function groupHunks(diff, context) {
  const changed = [];
  diff.forEach((e, i) => { if (e.type !== 'context') changed.push(i); });
  if (changed.length === 0) return [];

  const ranges = [];
  let start = Math.max(0, changed[0] - context);
  let end = Math.min(diff.length - 1, changed[0] + context);
  for (let i = 1; i < changed.length; i++) {
    const s = Math.max(0, changed[i] - context);
    if (s <= end + 1) {
      end = Math.min(diff.length - 1, changed[i] + context);
    } else {
      ranges.push([start, end]);
      start = s;
      end = Math.min(diff.length - 1, changed[i] + context);
    }
  }
  ranges.push([start, end]);

  return ranges.map(([s, e]) => diff.slice(s, e + 1));
}

function shortenPath(p) {
  return p.replace(/^.*\//, '');
}

// ── Strip Markdown ───────────────────────────────────────────────────────────
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```[\w]*\n?/g, '').replace(/```$/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '  ').replace(/^\s*\d+\.\s+/gm, '  ');
}

// ── Chat Message ─────────────────────────────────────────────────────────────
function ChatMessage({ msg }) {
  if (msg.role === 'user') {
    return <div className="msg-user">{msg.content}</div>;
  }
  if (msg.role === 'system') {
    return <div className="msg-system">{msg.content}</div>;
  }
  if (msg.role === 'tool_call') {
    if (msg.status === 'running') {
      return <ToolStatusLine icon={'\u27F3'} color="#a3a3a3" name={msg.name} />;
    }
    return <ToolResult result={msg.result} />;
  }
  if (msg.role === 'assistant') {
    const content = stripMarkdown(msg.content || '').trimStart();
    if (!content) return null;
    return (
      <div className="msg-assistant">
        <span className="bullet">{'\u2022'}</span>
        <span>{content}</span>
      </div>
    );
  }
  return null;
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState([]);
  const [activeModel, setActiveModel] = useState('deepseek-ai/deepseek-r1');
  const [provider, setProvider] = useState({ name: 'opencode', baseUrl: 'https://opencode.ai/zen/v1', apiKey: '' });
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showProviderSelector, setShowProviderSelector] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [showAgents, setShowAgents] = useState(false);
  const [agents, setAgents] = useState([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [codebaseFiles, setCodebaseFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [dropdownItems, setDropdownItems] = useState([]);
  const [dropdownIndex, setDropdownIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/config');
        const { config, env } = await r.json();
        if (config.provider) setProvider(config.provider);
        if (config.activeModel) setActiveModel(config.activeModel);
      } catch {}
      try {
        const r = await fetch('/api/models');
        const { models: m } = await r.json();
        setModels(m);
      } catch {}
    })();
  }, []);

  // ── Refresh models when provider changes ───────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/models');
        const { models: m } = await r.json();
        setModels(m);
      } catch {}
    })();
  }, [provider]);

  // ── Refresh agents ─────────────────────────────────────────────────────────
  const onRefreshAgents = useCallback(async () => {
    try {
      const r = await fetch('/api/agents');
      const list = await r.json();
      setAgents(list);
    } catch {}
  }, []);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, isLoading]);

  // ── Dropdown logic ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!input.startsWith('/') || input.includes(' ')) {
      if (input.startsWith('/model ') && models.length) {
        const q = input.slice(7).toLowerCase();
        setDropdownItems(models.filter(m => m.toLowerCase().includes(q)).map(m => ({ label: m, value: m })));
        setShowDropdown(true);
      } else {
        setShowDropdown(false);
      }
      return;
    }
    const filtered = SLASH_COMMANDS.filter(c => c.startsWith(input.toLowerCase()));
    setDropdownItems(filtered.map(c => ({ label: c, desc: getCommandDesc(c), value: c })));
    setShowDropdown(filtered.length > 0 && input.length > 0);
    setDropdownIndex(0);
  }, [input, models]);

  // ── File Attach ────────────────────────────────────────────────────────────
  const loadCodebaseFiles = useCallback(async () => {
    try {
      const r = await fetch('/api/files');
      const files = await r.json();
      setCodebaseFiles(files);
    } catch {}
  }, []);

  const onAttachFiles = useCallback(async () => {
    const contents = [];
    for (const filePath of selectedFiles) {
      try {
        const r = await fetch('/api/tool', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'read_file', args: { file_path: filePath } }),
        });
        const result = await r.json();
        if (result.type === 'file_read') {
          contents.push({ path: filePath, content: result.content, lineCount: result.lineCount });
        }
      } catch {}
    }
    setAttachedFiles(contents);
    setSelectedFiles(new Set());
    setShowFilePicker(false);
    inputRef.current?.focus();
  }, [selectedFiles]);

  const toggleFile = useCallback((file) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || isLoading) return;

    let prompt = trimmed;
    if (attachedFiles.length > 0) {
      const fileContext = attachedFiles.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n');
      prompt = `${trimmed}\n\nAttached files:\n${fileContext}`;
      setAttachedFiles([]);
    }

    // Handle slash commands
    if (trimmed.startsWith('/')) {
      handleSlashCommand(trimmed);
      setInput('');
      return;
    }

    const userMsg = { role: 'user', content: prompt };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput('');
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let conversation = newMsgs;
    try {
      let requiresLoop = true;

      while (requiresLoop && !controller.signal.aborted) {
        const apiMsgs = conversation.filter(m => m.role !== 'tool_call');
        const systemPrompt = { role: 'system', content: 'You are a helpful coding assistant. Do not use emojis in any response. Use plain text only. Use >, -, *, or numbers for lists. Use backticks for code.' };

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [systemPrompt, ...apiMsgs], model: activeModel, tools: TOOLS }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`${res.status}: ${err.slice(0, 200)}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', streamed = '', toolCalls = [];

        conversation = [...conversation, { role: 'assistant', content: '' }];
        setMessages([...conversation]);

        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            const t = line.trim();
            if (!t || !t.startsWith('data: ')) continue;
            const d = t.slice(6);
            if (d === '[DONE]') continue;
            let parsed;
            try { parsed = JSON.parse(d); } catch { continue; }
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;
            if (delta.content) {
              streamed += delta.content;
              conversation[conversation.length - 1] = { role: 'assistant', content: streamed };
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

        const respMsg = { role: 'assistant' };
        if (streamed) respMsg.content = streamed;
        if (toolCalls.length) respMsg.tool_calls = toolCalls;
        conversation[conversation.length - 1] = respMsg;

        if (toolCalls.length) {
          setMessages([...conversation]);
          for (const call of toolCalls) {
            const funcName = call.function.name;
            let funcArgs;
            try { funcArgs = JSON.parse(call.function.arguments || '{}'); } catch { funcArgs = {}; }
            if (!call.id) call.id = `call_${Date.now()}`;

            const toolMsg = { role: 'tool_call', name: funcName, args: funcArgs, status: 'running', result: null, toolId: `tool_${Date.now()}` };
            conversation = [...conversation, toolMsg];
            setMessages([...conversation]);

            const toolRes = await fetch('/api/tool', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: funcName, args: funcArgs }),
            });
            const result = await toolRes.json();

            conversation[conversation.length - 1] = { ...toolMsg, status: 'completed', result };
            setMessages([...conversation]);

            conversation = [...conversation, { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) }];
          }
        } else {
          requiresLoop = false;
          setMessages([...conversation]);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages([...conversation, { role: 'system', content: `[Error] ${err.message}` }]);
      } else {
        setMessages([...conversation, { role: 'system', content: '[Interrupted]' }]);
      }
    } finally {
      abortRef.current = null;
      setIsLoading(false);
      // Auto-save session
      if (!controller.signal.aborted) {
        const finalMsgs = conversation;
        if (finalMsgs.length > 0) {
          let sid = sessionId;
          if (!sid) {
            sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            setSessionId(sid);
          }
          const firstUser = finalMsgs.find(m => m.role === 'user');
          const title = (firstUser?.content || 'Untitled').slice(0, 80);
          const session = {
            id: sid,
            title,
            model: activeModel,
            provider: provider.name,
            messages: finalMsgs,
            messageCount: finalMsgs.filter(m => m.role === 'user' || m.role === 'assistant').length,
            savedAt: new Date().toISOString(),
          };
          fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(session),
          });
        }
      }
    }
  }, [input, messages, activeModel, isLoading, sessionId, provider]);

  // ── Slash Commands ─────────────────────────────────────────────────────────
  const handleSlashCommand = useCallback(async (cmd) => {
    const lower = cmd.toLowerCase();
    const trim = cmd.trim();

    if (lower === '/help') {
      setMessages(prev => [...prev, { role: 'user', content: cmd }, { role: 'system', content:
        `[Help] Available Commands:\n  /help         - Show this message\n  /model        - Open model selector\n  /model <id>   - Switch model\n  /apikey <key> - Set API key\n  /provider     - Provider settings\n  /clear        - Clear chat\n  /init         - Create CLAUDE.md\n  /resume       - Resume session\n  /save         - Save session\n  /agents       - Show agents\n  /exit         - (web: close tab)\n\nCtrl+M: model selector\nCtrl+A: agents panel\nCtrl+F: attach files` }]);
    } else if (lower === '/model') {
      setShowModelSelector(true);
    } else if (lower.startsWith('/model ')) {
      const m = trim.split(' ')[1];
      if (m) {
        setActiveModel(m);
        fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activeModel: m }) });
        setMessages(prev => [...prev, { role: 'user', content: cmd }, { role: 'system', content: `Model switched to: ${m}` }]);
      }
    } else if (lower === '/clear') {
      setMessages([]);
    } else if (lower.startsWith('/apikey ')) {
      const key = trim.slice(8).trim();
      if (key) {
        fetch('/api/env', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'OPENAI_API_KEY', value: key }) });
        setMessages(prev => [...prev, { role: 'user', content: cmd }, { role: 'system', content: 'API key saved.' }]);
      } else {
        setMessages(prev => [...prev, { role: 'user', content: cmd }, { role: 'system', content: '[Error] Usage: /apikey <your-api-key>' }]);
      }
    } else if (lower === '/provider') {
      setShowProviderSelector(true);
    } else if (lower === '/resume' || lower === '/sessions') {
      (async () => {
        try {
          const r = await fetch('/api/sessions');
          const list = await r.json();
          setSessions(list);
        } catch {}
        setShowResume(true);
      })();
    } else if (lower === '/save') {
      if (messages.length === 0) {
        setMessages(prev => [...prev, { role: 'system', content: '[Error] Nothing to save.' }]);
        return;
      }
      let sid = sessionId;
      if (!sid) {
        sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setSessionId(sid);
      }
      const firstUser = messages.find(m => m.role === 'user');
      const title = (firstUser?.content || 'Untitled').slice(0, 80);
      const session = {
        id: sid,
        title,
        model: activeModel,
        provider: provider.name,
        messages,
        messageCount: messages.filter(m => m.role === 'user' || m.role === 'assistant').length,
        savedAt: new Date().toISOString(),
      };
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
      setMessages(prev => [...prev, { role: 'user', content: cmd }, { role: 'system', content: `Session saved: ${sid}` }]);
    } else if (lower.startsWith('/delete ')) {
      const id = trim.slice(8).trim();
      if (id) {
        fetch(`/api/sessions/${id}`, { method: 'DELETE' });
        setMessages(prev => [...prev, { role: 'user', content: cmd }, { role: 'system', content: `Session deleted: ${id}` }]);
      }
    } else if (lower === '/agents') {
      onRefreshAgents();
      setShowAgents(true);
    } else if (lower === '/attach') {
      loadCodebaseFiles();
      setShowFilePicker(true);
    } else {
      setMessages(prev => [...prev, { role: 'user', content: cmd }, { role: 'system', content: `Unknown command: ${cmd}` }]);
    }
  }, [messages, activeModel, provider, sessionId, onRefreshAgents, loadCodebaseFiles]);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (showModelSelector || showProviderSelector || showResume || showAgents || showFilePicker) return;

    if (e.key === 'Escape') {
      if (isLoading) { abortRef.current?.abort(); return; }
      setInput('');
      return;
    }
    if (e.ctrlKey && e.key === 'm') { e.preventDefault(); setShowModelSelector(true); return; }
    if (e.ctrlKey && e.key === 'a') { e.preventDefault(); onRefreshAgents(); setShowAgents(true); return; }
    if (e.ctrlKey && e.key === 'f') { e.preventDefault(); loadCodebaseFiles(); setShowFilePicker(true); return; }

    if (showDropdown) {
      if (e.key === 'ArrowUp') { e.preventDefault(); setDropdownIndex(i => Math.max(0, i - 1)); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setDropdownIndex(i => Math.min(dropdownItems.length - 1, i + 1)); return; }
      if (e.key === 'Enter' && dropdownItems[dropdownIndex]) {
        e.preventDefault();
        const val = dropdownItems[dropdownIndex].value;
        if (val.startsWith('/')) { setInput(val + ' '); }
        else { setInput(val); }
        setShowDropdown(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [showDropdown, dropdownItems, dropdownIndex, isLoading, showModelSelector, showProviderSelector, showResume, showAgents, showFilePicker, handleSubmit, onRefreshAgents, loadCodebaseFiles]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="header">
        <AnimatedLogo header />
        <div className="header-info">
          <div className="header-title">Vibe Code v1.0.1</div>
          <div className="header-meta">
            Active: <span className="accent">{activeModel.length > 30 ? activeModel.slice(0, 30) + '...' : activeModel}</span>
          </div>
          <div className="header-meta">{models.length} models • {TOOLS.length} AI Tools Active</div>
          <div className="header-shortcuts">
            <span className="accent">Ctrl+M</span> model <span className="accent">/help</span> commands
          </div>
        </div>
        <button className="agents-btn" onClick={() => { onRefreshAgents(); setShowAgents(true); }}>
          Agents
        </button>
      </div>

      {/* Chat */}
      <div className="chat-area" ref={chatRef}>
        {messages.map((msg, i) => (
          <React.Fragment key={i}>
            <ChatMessage msg={msg} />
            <div className="msg-spacer" />
          </React.Fragment>
        ))}
        {isLoading && !messages.some(m => m.role === 'tool_call' && m.status === 'running') && (
          <ThinkingText />
        )}
      </div>

      {/* Input */}
      <div className="input-area">
        {attachedFiles.length > 0 && (
          <div className="attached-files">
            {attachedFiles.map((f, i) => (
              <span key={i} className="attached-chip">
                {f.path.split('/').pop()}
                <button className="attached-remove" onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}>x</button>
              </span>
            ))}
          </div>
        )}
        {showDropdown && (
          <CommandDropdown
            items={dropdownItems}
            selectedIndex={dropdownIndex}
            onSelect={(item) => {
              if (item.value.startsWith('/')) { setInput(item.value + ' '); }
              else { setInput(item.value); }
              setShowDropdown(false);
              inputRef.current?.focus();
            }}
          />
        )}
        <div className="input-box">
          <span className="prefix">{'>'}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask anything..."
            autoFocus
          />
          <button
            className="input-action-btn attach-btn"
            title="Attach files"
            onClick={() => { loadCodebaseFiles(); setShowFilePicker(true); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
          <div className="input-divider" />
          <button
            className="input-action-btn agents-action-btn"
            title="Agents"
            onClick={() => { onRefreshAgents(); setShowAgents(true); }}
          >
            AGENTS
          </button>
          {isLoading && (
            <button className="stop-btn" onClick={() => abortRef.current?.abort()} title="Stop">
              <svg width="12" height="12" viewBox="0 0 12 12"><rect width="12" height="12" rx="2" fill="currentColor"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="footer">
        <span className="dir">~/vibe-terminal</span>
        <span className="meta">
          Model: <span className="accent">{activeModel.length > 30 ? activeModel.slice(0, 30) + '...' : activeModel}</span>
          {'  \u2022  '}Tools Loaded: {TOOLS.length}
        </span>
      </div>

      {/* Model Selector */}
      {showModelSelector && (
        <ModelSelector
          models={models.length ? models : ['deepseek-ai/deepseek-r1', 'gpt-4o', 'claude-3-5-sonnet']}
          activeModel={activeModel}
          onSelect={(m) => {
            setActiveModel(m);
            fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activeModel: m }) });
          }}
          onClose={() => setShowModelSelector(false)}
        />
      )}

      {/* Provider Selector */}
      {showProviderSelector && (
        <ProviderSelector
          provider={provider}
          onSave={(p) => {
            setProvider(p);
            fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: p }) });
            setMessages(prev => [...prev, { role: 'system', content: `Provider: ${p.name} (${p.baseUrl})` }]);
          }}
          onClose={() => setShowProviderSelector(false)}
        />
      )}

      {/* Session Resume */}
      {showResume && (
        <SessionResume
          sessions={sessions}
          onLoad={(session) => {
            setSessionId(session.id);
            if (session.model) setActiveModel(session.model);
            setMessages(session.messages || []);
          }}
          onDelete={(id) => {
            fetch(`/api/sessions/${id}`, { method: 'DELETE' });
            setSessions(prev => prev.filter(s => s.id !== id));
          }}
          onClose={() => setShowResume(false)}
        />
      )}

      {/* Agents Panel */}
      {showAgents && (
        <AgentsPanel
          agents={agents}
          onStop={async (id) => { await fetch('/api/tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'agent_stop', args: { agent_id: id } }) }); onRefreshAgents(); }}
          onRefresh={onRefreshAgents}
          onClose={() => setShowAgents(false)}
        />
      )}

      {/* File Picker */}
      {showFilePicker && (
        <FilePicker
          files={codebaseFiles}
          selected={selectedFiles}
          onToggle={toggleFile}
          onAttach={onAttachFiles}
          onClose={() => { setShowFilePicker(false); inputRef.current?.focus(); }}
        />
      )}
    </div>
  );
}

function getCommandDesc(cmd) {
  const descs = {
    '/help': 'Show help', '/model': 'Select model', '/apikey': 'Set API key',
    '/provider': 'Switch provider', '/rewind': 'Rewind to checkpoint', '/branch': 'Fork from checkpoint',
    '/clear': 'Clear chat', '/init': 'Create CLAUDE.md', '/resume': 'Resume session',
    '/delete': 'Delete session', '/exit': 'Exit app', '/agents': 'Show agents', '/attach': 'Attach files',
  };
  return descs[cmd] || '';
}
