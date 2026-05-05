import type { DagNode } from '@/shared/types/workflow';

interface Props {
  node: DagNode;
  otherNodeIds: string[];
  onChange: (patch: Partial<DagNode>) => void;
}

export function NodeAdvancedSection({ node, otherNodeIds, onChange }: Props) {
  const fan = node.fanOut || { enabled: false, inputArrayPath: '' };
  const ep = node.errorPolicy || { onError: 'stop' as const };

  return (
    <details style={{ marginTop: 12 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 8 }}>Advanced</summary>

      <fieldset style={{ border: '1px solid var(--color-border, #e0e0e0)', borderRadius: 4, padding: 8, marginBottom: 8 }}>
        <legend>Fan-out</legend>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={fan.enabled}
            onChange={e => onChange({ fanOut: { enabled: e.target.checked, inputArrayPath: fan.inputArrayPath } })}
          />
          Run once per item in input array
        </label>
        {fan.enabled && (
          <div style={{ marginTop: 6 }}>
            <label className="form-label" style={{ fontSize: '0.85em' }}>Input array path</label>
            <input
              className="form-input"
              placeholder="e.g. load.chunks"
              value={fan.inputArrayPath}
              onChange={e => onChange({ fanOut: { enabled: fan.enabled, inputArrayPath: e.target.value } })}
            />
          </div>
        )}
      </fieldset>

      <fieldset style={{ border: '1px solid var(--color-border, #e0e0e0)', borderRadius: 4, padding: 8 }}>
        <legend>Error policy</legend>
        <label className="form-label" style={{ fontSize: '0.85em' }}>On error</label>
        <select
          className="form-input"
          value={ep.onError}
          onChange={e => onChange({ errorPolicy: { ...ep, onError: e.target.value as 'stop' | 'continue' | 'retry' } })}
        >
          <option value="stop">stop workflow</option>
          <option value="continue">continue (output null)</option>
          <option value="retry">retry then stop</option>
        </select>

        {ep.onError === 'retry' && (
          <div style={{ marginTop: 6 }}>
            <label className="form-label" style={{ fontSize: '0.85em' }}>Retry count</label>
            <input
              type="number"
              className="form-input"
              min={1}
              max={10}
              value={ep.retryCount || 1}
              onChange={e => onChange({ errorPolicy: { ...ep, retryCount: Number(e.target.value) } })}
            />
          </div>
        )}

        {ep.onError !== 'stop' && (
          <div style={{ marginTop: 6 }}>
            <label className="form-label" style={{ fontSize: '0.85em' }}>Error branch (optional)</label>
            <select
              className="form-input"
              value={ep.errorBranch || ''}
              onChange={e => onChange({ errorPolicy: { ...ep, errorBranch: e.target.value || undefined } })}
            >
              <option value="">(no error branch)</option>
              {otherNodeIds.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>
        )}
      </fieldset>
    </details>
  );
}
