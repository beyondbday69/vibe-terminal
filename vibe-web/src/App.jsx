import React, { useState, useEffect, useRef } from 'react';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import Sidebar from './components/Sidebar';
import { Menu, Plus } from 'lucide-react';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [currentModel, setCurrentModel] = useState('kimi-k2.6');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const abortControllerRef = useRef(null);
  const textareaRef = useRef(null);

  // Fetch sessions on load
  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setSessions(data);
      })
      .catch(console.error);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMsg = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: newMessages,
          model: currentModel
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error('Chat API failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let assistantContent = '';
      let currentToolCalls = [];
      let buffer = '';

      setMessages([...newMessages, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep last incomplete line

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) continue;
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;
            
            try {
              const data = JSON.parse(dataStr);
              const delta = data.choices[0]?.delta || {};

              if (delta.content) {
                assistantContent += delta.content;
              }
              
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  if (tc.id) {
                    currentToolCalls.push({
                      id: tc.id,
                      type: tc.type,
                      function: { name: tc.function.name, arguments: tc.function.arguments || '' }
                    });
                  } else if (tc.function && tc.function.arguments) {
                    currentToolCalls[tc.index].function.arguments += tc.function.arguments;
                  }
                }
              }

              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: assistantContent,
                  tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined
                };
                return updated;
              });

            } catch (err) {
              console.error('Error parsing SSE', err, dataStr);
            }
          }
        }
      }

      // Execute tools sequentially if any
      if (currentToolCalls.length > 0) {
        let finalMessages = [...newMessages, { 
          role: 'assistant', 
          content: assistantContent,
          tool_calls: currentToolCalls
        }];

        for (const tc of currentToolCalls) {
          try {
            const toolRes = await fetch('/api/tool', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments)
              })
            });
            const resultData = await toolRes.json();
            finalMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: JSON.stringify(resultData)
            });
            setMessages([...finalMessages]);
          } catch (e) {
            console.error('Tool execution failed', e);
            finalMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: JSON.stringify({ error: e.message })
            });
            setMessages([...finalMessages]);
          }
        }

        // We could recursively call chat again, but to keep UI simple, let user see results
      }

    } catch (e) {
      if (e.name === 'AbortError') {
        console.log('Stream cancelled');
      } else {
        console.error(e);
        setMessages(prev => [...prev, { role: 'system', content: `Error: ${e.message}` }]);
      }
    } finally {
      setIsStreaming(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setInput('');
  };

  return (
    <div className="app-container">
      <Sidebar 
        isOpen={sidebarOpen} 
        sessions={sessions} 
        onSelectSession={id => console.log('Select session', id)} 
      />
      
      <main className="main-content">
        <div className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button className="glass-button" style={{ padding: '8px' }} onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Menu size={18} />
            </button>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.1rem' }}>
              Vibe Terminal <span style={{ color: 'var(--accent-secondary)' }}>Web</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="glass-button primary" onClick={startNewChat}>
              <Plus size={16} /> New Chat
            </button>
          </div>
        </div>

        <ChatWindow 
          messages={messages} 
          isStreaming={isStreaming} 
          currentModel={currentModel} 
        />
        
        <ChatInput 
          input={input} 
          setInput={setInput} 
          isStreaming={isStreaming} 
          onSend={handleSend} 
          onCancel={handleCancel}
          textareaRef={textareaRef}
        />
      </main>
    </div>
  );
}
