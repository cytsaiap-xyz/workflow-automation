import { useEffect, useState } from 'react';
import { assistantApi } from '@/shared/api/assistantApi';
import { useAssistantStore } from '@/shared/stores/assistantStore';

interface Props {
  changeId: string;
  onApplied: () => void;
}

export function PendingChangeCard({ changeId, onApplied }: Props) {
  const [change, setChange] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const removePendingChange = useAssistantStore((s) => s.removePendingChange);

  useEffect(() => {
    assistantApi.changes
      .get(changeId)
      .then(setChange)
      .catch((e: Error) => setError(e.message));
  }, [changeId]);

  if (error) {
    return (
      <div style={{ color: 'var(--accent-error)', padding: '8px' }}>
        Error: {error}
      </div>
    );
  }
  if (!change) {
    return (
      <div style={{ padding: '8px', fontStyle: 'italic', color: 'var(--text-muted)' }}>
        loading proposed change…
      </div>
    );
  }

  const diff = Array.isArray(change.diff) ? change.diff : [];
  const rationale = typeof change.rationale === 'string' ? change.rationale : '(no rationale)';

  const onApply = async () => {
    setBusy(true);
    setError(null);
    try {
      await assistantApi.changes.apply(changeId);
      removePendingChange(changeId);
      onApplied();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const onReject = async () => {
    setBusy(true);
    setError(null);
    try {
      await assistantApi.changes.reject(changeId);
      removePendingChange(changeId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="card"
      style={{
        margin: '8px 0',
        padding: '12px',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--accent-primary)',
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9em' }}>Proposed change</p>
      <p style={{ margin: '4px 0 8px', fontSize: '0.85em', color: 'var(--text-secondary)' }}>
        {rationale}
      </p>
      <details style={{ marginBottom: '8px' }}>
        <summary
          style={{ cursor: 'pointer', fontSize: '0.85em', color: 'var(--text-secondary)' }}
        >
          {diff.length} change(s)
        </summary>
        <pre
          style={{
            fontSize: '0.8em',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            marginTop: '4px',
            color: 'var(--text-secondary)',
          }}
        >
          {JSON.stringify(diff, null, 2)}
        </pre>
      </details>
      {error && (
        <p style={{ color: 'var(--accent-error)', fontSize: '0.85em', marginBottom: '8px' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-primary" onClick={onApply} disabled={busy}>
          Apply
        </button>
        <button className="btn btn-secondary" onClick={onReject} disabled={busy}>
          Reject
        </button>
      </div>
    </div>
  );
}
