import React, { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { Terminal, FileCode2, Globe, Search, Play, FileJson } from 'lucide-react';

function getToolIcon(name) {
  if (name === 'run_bash') return <Terminal size={14} />;
  if (name.includes('file')) return <FileCode2 size={14} />;
  if (name.includes('web')) return <Globe size={14} />;
  if (name.includes('search')) return <Search size={14} />;
  if (name.includes('agent')) return <Play size={14} />;
  return <FileJson size={14} />;
}

export default function ChatWindow({ messages, isStreaming, currentModel }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  return (
    <div className="chat-history" ref={scrollRef}>
      {messages.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div style={{ width: 80, height: 80, borderRadius: 40, background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: 32 }}>✨</span>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>vibe-web</h2>
          <p style={{ color: 'var(--text-muted)' }}>Powered by {currentModel}</p>
        </div>
      )}

      {messages.map((msg, i) => {
        if (msg.role === 'system') return null; // hide system prompts

        if (msg.role === 'tool') {
          let resData;
          try {
            resData = JSON.parse(msg.content);
          } catch {
            resData = { message: msg.content };
          }
          const isError = resData.type === 'error' || resData.exitCode !== undefined && resData.exitCode !== 0;
          
          return (
            <div key={`msg-${i}`} className={`message ${msg.role}`}>
              <div className="tool-call-block">
                <div className="tool-header">
                  {getToolIcon(resData.name || 'tool')}
                  <span>Tool Result ({msg.tool_call_id?.slice(0, 8)})</span>
                </div>
                <div className={`tool-result ${isError ? 'error' : ''}`}>
                  {resData.type === 'bash_result' ? (
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>
                      $ {resData.command}{'\n'}
                      {resData.stdout}{resData.stderr}
                    </pre>
                  ) : (
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>
                      {resData.message || JSON.stringify(resData, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={`msg-${i}`} className={`message ${msg.role}`}>
            <span className="message-role">{msg.role}</span>
            <div className="message-bubble">
              <Markdown className="markdown-body">{msg.content}</Markdown>
              
              {msg.tool_calls?.map(tc => {
                let args = {};
                try {
                  args = JSON.parse(tc.function.arguments);
                } catch {}
                
                return (
                  <div key={tc.id} className="tool-call-block">
                    <div className="tool-header">
                      {getToolIcon(tc.function.name)}
                      <span>Executing: {tc.function.name}</span>
                    </div>
                    <div className="tool-args">
                      {JSON.stringify(args, null, 2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {isStreaming && (
        <div className="message assistant">
          <div className="thinking-indicator">
            <span className="spinner">⠋</span>
            <span>Generating...</span>
          </div>
        </div>
      )}
    </div>
  );
}
