
// ── Context Tracker ─────────────────────────────────────────────────────────
const MAX_TOKENS = 64000; // Default context window (64K)

function estimateTokens(text) {
  if (!text) return 0;
  // Rough estimation: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

function calculateContextUsage(messages) {
  let totalTokens = 0;
  
  // Add overhead for system prompt
  const systemPrompt = 'You are a helpful coding assistant. Do not use emojis in any response. Use plain text only. Use >, -, *, or numbers for lists. Use backticks for code.';
  totalTokens += estimateTokens(systemPrompt) + 10; // System prompt tokens
  
  // Count tokens from all messages
  for (const msg of messages) {
    if (msg.role === 'system') {
      totalTokens += estimateTokens(msg.content) + 10;
    } else if (msg.role === 'user') {
      totalTokens += estimateTokens(msg.content) + 10;
    } else if (msg.role === 'assistant') {
      totalTokens += estimateTokens(msg.content) + 10;
    } else if (msg.role === 'tool_call') {
      // Tool calls and results take more context
      totalTokens += estimateTokens(msg.name || '') + estimateTokens(JSON.stringify(msg.args || {})) + estimateTokens(JSON.stringify(msg.result || {})) + 30;
    } else if (msg.role === 'tool') {
      totalTokens += estimateTokens(msg.content || '') + 10;
    }
  }
  
  // Add overhead for message structure (role, content fields, etc.)
  totalTokens += messages.length * 10;
  
  return totalTokens;
}

function ContextIndicator({ messages }) {
  const contextUsed = calculateContextUsage(messages);
  const percentage = Math.round((contextUsed / MAX_TOKENS) * 100);
  const remaining = MAX_TOKENS - contextUsed;
  
  // Color based on usage percentage
  let color = 'var(--green)';
  if (percentage > 80) color = 'var(--red)';
  else if (percentage > 60) color = 'var(--yellow)';
  
  const formatNumber = (n) => {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };
  
  return (
    <div className="context-indicator" title={`Context: ${formatNumber(contextUsed)} / ${formatNumber(MAX_TOKENS)} tokens`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      <span className="context-text" style={{ color }}>
        {formatNumber(remaining)} left
      </span>
      <span className="context-percent" style={{ color }}>
        ({percentage}%)
      </span>
    </div>
  );
}

