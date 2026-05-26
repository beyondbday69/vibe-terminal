import React, { useRef, useEffect } from 'react';
import { Send, Square, Play, RefreshCw } from 'lucide-react';

export default function ChatInput({ input, setInput, isStreaming, onSend, onCancel, textareaRef }) {
  const defaultRef = useRef(null);
  const ref = textareaRef || defaultRef;

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = `${Math.min(ref.current.scrollHeight, 200)}px`;
    }
  }, [input, ref]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="input-container">
      <div className="input-box glass-panel">
        <div className="textarea-wrapper">
          <textarea
            ref={ref}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message... (Shift+Enter for newline)"
            rows={1}
            disabled={isStreaming}
          />
        </div>
        <div className="input-actions">
          <div style={{ display: 'flex', gap: '8px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>/</kbd> for commands
            </span>
          </div>
          {isStreaming ? (
            <button className="send-btn" onClick={onCancel} title="Cancel generation">
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button className="send-btn" onClick={onSend} disabled={!input.trim()} title="Send">
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
