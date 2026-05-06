import { useState, useCallback } from 'react';
import { Play } from 'lucide-react';
import type { InputParameter } from '../../shared/types/workflow';
import { workflowApi } from '../../shared/api/workflowApi';
import type { Execution } from '../../shared/types/workflow';

interface Props {
  workflowId: string;
  inputs: InputParameter[];
  open: boolean;
  onClose: () => void;
  onComplete: (execution: Execution) => void;
}

export function RunWithInputDialog({ workflowId, inputs, open, onClose, onComplete }: Props) {
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
    const initial: Record<string, string | number | boolean> = {};
    for (const i of inputs) {
      if (i.type !== 'file' && i.defaultValue !== undefined) {
        initial[i.name] = i.defaultValue as string | number | boolean;
      } else if (i.type === 'boolean') {
        initial[i.name] = false;
      } else if (i.type === 'number') {
        initial[i.name] = 0;
      } else if (i.type !== 'file') {
        initial[i.name] = '';
      }
    }
    return initial;
  });
  const [files, setFiles] = useState<Record<string, File>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateValue = useCallback((name: string, value: string | number | boolean) => {
    setValues(prev => ({ ...prev, [name]: value }));
  }, []);

  const updateFile = useCallback((name: string, file: File) => {
    setFiles(prev => ({ ...prev, [name]: file }));
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    setRunning(true);
    try {
      const fd = new FormData();
      // Always include triggeredBy so the backend knows this is a manual run
      fd.append('triggeredBy', 'manual');

      for (const i of inputs) {
        if (i.type === 'file') {
          const f = files[i.name];
          if (i.required && !f) throw new Error(`Missing required file: ${i.name}`);
          if (f) fd.append(i.name, f);
        } else {
          const v = values[i.name];
          if (i.required && (v === undefined || v === '')) {
            throw new Error(`Missing required input: ${i.name}`);
          }
          if (v !== undefined) fd.append(i.name, String(v));
        }
      }

      const exec = await workflowApi.executeWithFiles(workflowId, fd);
      onComplete(exec);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Execution failed');
    } finally {
      setRunning(false);
    }
  }, [workflowId, inputs, values, files, onComplete, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3 className="modal-title">Run Workflow</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={running}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="text-sm text-muted" style={{ marginBottom: '16px' }}>
            Provide input parameters for this workflow:
          </p>
          {inputs.map(i => (
            <div className="form-group" key={i.name}>
              <label className="form-label">
                {i.name}
                {i.required && <span style={{ color: 'var(--accent-error)' }}> *</span>}
              </label>
              {i.description && (
                <p className="text-sm text-muted" style={{ marginBottom: '4px' }}>{i.description}</p>
              )}
              {i.type === 'file' ? (
                <div>
                  <input
                    type="file"
                    accept={i.accept}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) updateFile(i.name, f);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '8px 0',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                    }}
                  />
                  {files[i.name] && (
                    <p className="text-sm text-muted" style={{ marginTop: '4px' }}>
                      Selected: {files[i.name].name}
                    </p>
                  )}
                </div>
              ) : i.type === 'boolean' ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!values[i.name]}
                    onChange={e => updateValue(i.name, e.target.checked)}
                  />
                  <span className="text-sm">{values[i.name] ? 'true' : 'false'}</span>
                </label>
              ) : i.type === 'number' ? (
                <input
                  type="number"
                  className="form-input"
                  value={values[i.name] !== undefined ? Number(values[i.name]) : ''}
                  onChange={e => updateValue(i.name, Number(e.target.value))}
                  placeholder={`Enter ${i.name}...`}
                />
              ) : i.type === 'json' ? (
                <textarea
                  className="form-textarea"
                  rows={4}
                  value={String(values[i.name] ?? '')}
                  onChange={e => updateValue(i.name, e.target.value)}
                  placeholder='{"key": "value"}'
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                />
              ) : (
                <textarea
                  className="form-input"
                  value={String(values[i.name] ?? '')}
                  onChange={e => updateValue(i.name, e.target.value)}
                  rows={2}
                  placeholder={`Enter ${i.name}...`}
                />
              )}
            </div>
          ))}
          {error && (
            <p className="text-sm" style={{ color: 'var(--accent-error)', marginTop: '8px' }}>
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={running}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={running}
          >
            {running ? (
              <span className="loading-spinner" />
            ) : (
              <Play size={16} />
            )}
            {running ? 'Running…' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  );
}
