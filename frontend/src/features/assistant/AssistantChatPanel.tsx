import { useEffect, useRef, useState } from 'react';
import { assistantApi } from '@/shared/api/assistantApi';
import { useAssistantStore } from '@/shared/stores/assistantStore';
import { PendingChangeCard } from './PendingChangeCard';
import { ToolCallBlock } from './ToolCallBlock';

function splitThoughts(content: string): { visible: string; thoughts: string[] } {
  const thoughts: string[] = [];
  const visible = content.replace(/<thought>([\s\S]*?)<\/thought>/g, (_, t) => {
    thoughts.push(t.trim());
    return '';
  }).trim();
  return { visible, thoughts };
}

interface Props {
  workflowId: string;
  onWorkflowUpdated?: () => void;
}

export function AssistantChatPanel({ workflowId, onWorkflowUpdated }: Props) {
  const {
    panelOpen,
    setPanelOpen,
    conversationId,
    messages,
    pendingChangeIds,
    streaming,
    setConversation,
    appendUser,
    appendStreaming,
    appendToolCall,
    attachToolResult,
    addPendingChange,
    setStreaming,
  } = useAssistantStore();

  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages or streaming state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming, pendingChangeIds]);

  // Load or create conversation when panel opens
  useEffect(() => {
    if (!panelOpen) return;
    assistantApi.conversation
      .findOrCreate({ workflowId, surface: 'panel' })
      .then((c) => {
        setConversation(c.id, c.messages);
      })
      .catch(console.error);
  }, [panelOpen, workflowId, setConversation]);

  const onSend = () => {
    if (!conversationId || !draft.trim() || streaming) return;
    const text = draft.trim();
    setDraft('');
    appendUser(text);
    setStreaming(true);
    assistantApi.sendMessage(conversationId, text, (e: Record<string, unknown>) => {
      if (e.type === 'token') appendStreaming(e.value as string);
      else if (e.type === 'tool_call') appendToolCall(e.name as string, e.args);
      else if (e.type === 'tool_result') attachToolResult(e.name as string, e.summary as string);
      else if (e.type === 'pending_change') addPendingChange(e.change_id as string);
      else if (e.type === 'done' || e.type === 'error') setStreaming(false);
    });
  };

  if (!panelOpen) {
    return (
      <button
        onClick={() => setPanelOpen(true)}
        className="btn btn-primary"
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        ✨ Assistant
      </button>
    );
  }

  return (
    <aside
      className="assistant-panel"
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: 380,
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        boxShadow: 'var(--shadow)',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-tertiary)',
        }}
      >
        <strong style={{ color: 'var(--text-primary)' }}>✨ Assistant</strong>
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => setPanelOpen(false)}
          aria-label="Close assistant panel"
          style={{ fontSize: '1.2em' }}
        >
          ×
        </button>
      </header>

      {/* Messages */}
      <div
        className="messages"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
        }}
      >
        {messages.length === 0 && !streaming && (
          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.9em',
              textAlign: 'center',
              marginTop: '32px',
            }}
          >
            Ask the assistant anything about this workflow.
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`msg msg-${m.role}`}
            style={{
              marginBottom: '12px',
              padding: m.role === 'user' ? '8px 10px' : '0',
              background:
                m.role === 'user' ? 'var(--bg-tertiary)' : 'transparent',
              borderRadius: m.role === 'user' ? '8px' : '0',
              borderLeft:
                m.role === 'assistant'
                  ? '2px solid var(--accent-primary)'
                  : m.role === 'tool'
                  ? '2px solid var(--accent-secondary)'
                  : 'none',
              paddingLeft:
                m.role === 'assistant' || m.role === 'tool' ? '10px' : undefined,
            }}
          >
            <div
              style={{
                fontSize: '0.75em',
                color: 'var(--text-muted)',
                marginBottom: '2px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {m.role}
            </div>
            {m.content && (() => {
              const { visible, thoughts } = splitThoughts(m.content);
              return (
                <>
                  {visible && (
                    <div
                      style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontSize: '0.9em',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {visible}
                    </div>
                  )}
                  {thoughts.map((t, ti) => (
                    <details
                      key={ti}
                      style={{
                        marginTop: 6,
                        padding: '4px 8px',
                        background: 'var(--color-surface-2, #f5f5f5)',
                        borderRadius: 4,
                        fontSize: '0.85em',
                      }}
                    >
                      <summary style={{ cursor: 'pointer', color: 'var(--color-text-muted, #666)' }}>
                        ▸ Thinking
                      </summary>
                      <div
                        style={{
                          marginTop: 4,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          color: 'var(--color-text-muted, #666)',
                        }}
                      >
                        {t}
                      </div>
                    </details>
                  ))}
                </>
              );
            })()}
            {m.toolCalls?.map((tc) => (
              <ToolCallBlock
                key={tc.id}
                name={tc.name}
                args={tc.args}
                resultSummary={tc.resultSummary}
              />
            ))}
          </div>
        ))}

        {/* Pending change cards (shown below messages, not inside a message) */}
        {pendingChangeIds.map((id) => (
          <PendingChangeCard
            key={id}
            changeId={id}
            onApplied={() => onWorkflowUpdated?.()}
          />
        ))}

        {/* Streaming indicator */}
        {streaming && (
          <div
            style={{
              fontStyle: 'italic',
              color: 'var(--text-muted)',
              fontSize: '0.85em',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span className="loading-spinner" style={{ width: 12, height: 12 }} />
            Thinking…
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div
        className="composer"
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
        }}
      >
        <textarea
          className="form-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Describe what you want… (Enter to send, Shift+Enter for newline)"
          rows={3}
          style={{ width: '100%', resize: 'vertical' }}
          disabled={streaming}
        />
        <button
          className="btn btn-primary"
          onClick={onSend}
          disabled={streaming || !draft.trim()}
          style={{ marginTop: '8px', width: '100%' }}
        >
          {streaming ? 'Waiting for response…' : 'Send'}
        </button>
      </div>
    </aside>
  );
}
