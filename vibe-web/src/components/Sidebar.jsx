import React from 'react';
import { MessageSquare, LayoutDashboard, Settings, User } from 'lucide-react';

export default function Sidebar({ isOpen, sessions, onSelectSession }) {
  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <span style={{ fontSize: '1.5rem', marginRight: '8px' }}>⚡</span>
        vibe-web
      </div>
      
      <div className="sidebar-content">
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 12 }}>Sessions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sessions.map(s => (
              <button 
                key={s.id} 
                onClick={() => onSelectSession(s.id)}
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: 'var(--text-primary)',
                  padding: '8px 12px',
                  borderRadius: 8,
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  transition: 'background 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <MessageSquare size={16} color="var(--accent-secondary)" />
                <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.label || 'New Chat'}
                </div>
              </button>
            ))}
            {sessions.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0 12px' }}>
                No sessions yet.
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="sidebar-footer">
        <button className="glass-button" style={{ justifyContent: 'flex-start' }}>
          <LayoutDashboard size={16} /> Workspaces
        </button>
        <button className="glass-button" style={{ justifyContent: 'flex-start' }}>
          <Settings size={16} /> Settings
        </button>
      </div>
    </div>
  );
}
