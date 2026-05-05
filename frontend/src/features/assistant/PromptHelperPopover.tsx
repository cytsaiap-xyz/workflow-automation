import { useEffect, useState } from 'react';
import { assistantApi } from '@/shared/api/assistantApi';

interface Props {
  workflowId: string;
  nodeId: string;
  field: 'aiSystemPrompt' | 'aiPrompt';
  onUse: (newValue: string) => void;
  onClose: () => void;
}

export function PromptHelperPopover({ workflowId, nodeId, field, onUse, onClose }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    assistantApi.conversation
      .findOrCreate({ workflowId, surface: 'node-popover', nodeId })
      .then((c) => {
        setConversationId(c.id);
        setMessages(c.messages);
      })
      .catch(console.error);
  }, [workflowId, nodeId]);

  const send = () => {
    if (!conversationId || !draft.trim() || streaming) return;
    const text = draft.trim();
    setDraft('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setStreaming(true);
    assistantApi.sendMessage(conversationId, text, (e: any) => {
      if (e.type === 'token') {
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === 'assistant') {
            return [...m.slice(0, -1), { role: 'assistant', content: last.content + e.value }];
          }
          return [...m, { role: 'assistant', content: e.value }];
        });
      } else if (e.type === 'done' || e.type === 'error') {
        setStreaming(false);
      }
    });
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  return (
    <div
      className="popover"
      style={{
        position: 'absolute',
        right: 0,
        top: '100%',
        zIndex: 200,
        width: 360,
        padding: 12,
        marginTop: 4,
        background: 'var(--bg-secondary, #fff)',
        border: '1px solid var(--border-color, #e0e0e0)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <strong style={{ color: 'var(--text-primary)' }}>✨ Prompt helper</strong>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={onClose}
          aria-label="Close prompt helper"
          style={{ padding: '2px 6px' }}
        >
          ×
        </button>
      </header>
      <div
        style={{
          fontSize: '0.85em',
          color: 'var(--text-muted, #666)',
          marginBottom: 8,
        }}
      >
        Field: <code>{field}</code>
      </div>
      <div
        className="messages"
        style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 8 }}
      >
        {messages.length === 0 && !streaming && (
          <div style={{ fontSize: '0.85em', color: 'var(--text-muted, #888)', fontStyle: 'italic' }}>
            Describe what this node should do and the assistant will draft a prompt for you.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`} style={{ marginBottom: 6, fontSize: '0.9em' }}>
            <div style={{ color: 'var(--text-muted, #666)', fontSize: '0.75em', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
              {m.role}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-primary)' }}>
              {m.content}
            </div>
          </div>
        ))}
        {streaming && (
          <div style={{ fontStyle: 'italic', color: 'var(--text-muted, #888)', fontSize: '0.85em' }}>
            …
          </div>
        )}
      </div>
      <textarea
        className="form-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Describe what this node should do…"
        rows={2}
        style={{ width: '100%', resize: 'vertical' }}
        disabled={streaming}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={send}
          disabled={streaming || !draft.trim()}
        >
          Ask
        </button>
        {lastAssistant && (
          <button
            className="btn btn-sm"
            onClick={() => onUse(lastAssistant.content)}
            disabled={streaming}
          >
            Use this prompt
          </button>
        )}
      </div>
    </div>
  );
}
