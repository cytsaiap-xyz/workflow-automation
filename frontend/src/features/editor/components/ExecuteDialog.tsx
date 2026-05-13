import { useState, useCallback } from 'react';
import { Play } from 'lucide-react';
import type { InputParameter } from '../../../shared/types/workflow';

interface Props {
  parameters: InputParameter[];
  mode: 'execute' | 'simulate';
  /**
   * Called when the user clicks the run/simulate button.
   *
   * If any of the workflow's input parameters has type 'file' AND the user
   * selected a real File for it, the callback receives a FormData (multipart).
   * Otherwise it receives a plain inputData object (JSON path).
   *
   * The caller decides which API endpoint to hit based on this shape.
   */
  onSubmit: (inputData: Record<string, any> | FormData) => void;
  onCancel: () => void;
}

export default function ExecuteDialog({ parameters, mode, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    for (const param of parameters) {
      if (param.defaultValue !== undefined) {
        initial[param.name] = param.defaultValue;
      } else {
        initial[param.name] = param.type === 'boolean' ? false : param.type === 'number' ? 0 : '';
      }
    }
    return initial;
  });
  const [files, setFiles] = useState<Record<string, File>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};
    for (const param of parameters) {
      if (param.type === 'file') {
        if (param.required && !files[param.name]) {
          newErrors[param.name] = `${param.name} is required`;
        }
        continue;
      }
      if (param.required && (values[param.name] === undefined || values[param.name] === '')) {
        newErrors[param.name] = `${param.name} is required`;
      }
      if (param.type === 'json' && values[param.name]) {
        try {
          JSON.parse(values[param.name]);
        } catch {
          newErrors[param.name] = 'Invalid JSON';
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [parameters, values, files]);

  const handleSubmit = useCallback(() => {
    if (!validate()) return;

    const hasFiles = parameters.some((p) => p.type === 'file' && files[p.name]);

    if (hasFiles) {
      // Multipart path: FormData lets the backend route the upload through multer.
      const fd = new FormData();
      for (const param of parameters) {
        if (param.type === 'file') {
          const f = files[param.name];
          if (f) fd.append(param.name, f);
        } else {
          const v = values[param.name];
          if (v !== undefined && v !== '') fd.append(param.name, String(v));
        }
      }
      onSubmit(fd);
      return;
    }

    // JSON path — unchanged from before.
    const processed: Record<string, any> = {};
    for (const param of parameters) {
      let val = values[param.name];
      if (param.type === 'number') val = Number(val);
      if (param.type === 'json' && typeof val === 'string') {
        try { val = JSON.parse(val); } catch { /* keep as string */ }
      }
      processed[param.name] = val;
    }
    onSubmit(processed);
  }, [validate, values, files, parameters, onSubmit]);

  const updateValue = (name: string, value: any) => {
    setValues(prev => ({ ...prev, [name]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {mode === 'simulate' ? 'Simulate' : 'Execute'} Workflow
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="text-sm text-muted" style={{ marginBottom: '16px' }}>
            Provide input parameters for this workflow:
          </p>
          {parameters.map((param) => (
            <div className="form-group" key={param.name}>
              <label className="form-label">
                {param.name}
                {param.required && <span style={{ color: 'var(--accent-error)' }}> *</span>}
              </label>
              {param.description && (
                <p className="text-sm text-muted" style={{ marginBottom: '4px' }}>{param.description}</p>
              )}
              {param.type === 'file' ? (
                <div>
                  <input
                    type="file"
                    accept={param.accept}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setFiles(prev => ({ ...prev, [param.name]: f }));
                        setErrors(prev => {
                          const next = { ...prev };
                          delete next[param.name];
                          return next;
                        });
                      } else {
                        setFiles(prev => {
                          const next = { ...prev };
                          delete next[param.name];
                          return next;
                        });
                      }
                    }}
                    style={{ display: 'block', width: '100%' }}
                  />
                  {files[param.name] && (
                    <p className="text-sm text-muted" style={{ marginTop: '4px' }}>
                      Selected: <code>{files[param.name].name}</code>
                      {' '}({Math.round(files[param.name].size / 1024)} KB)
                    </p>
                  )}
                </div>
              ) : param.type === 'boolean' ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!values[param.name]}
                    onChange={(e) => updateValue(param.name, e.target.checked)}
                  />
                  <span className="text-sm">{values[param.name] ? 'true' : 'false'}</span>
                </label>
              ) : param.type === 'json' ? (
                <textarea
                  className="form-textarea"
                  rows={4}
                  value={values[param.name] || ''}
                  onChange={(e) => updateValue(param.name, e.target.value)}
                  placeholder='{"key": "value"}'
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                />
              ) : (
                <input
                  type={param.type === 'number' ? 'number' : 'text'}
                  className="form-input"
                  value={values[param.name] ?? ''}
                  onChange={(e) => updateValue(param.name, e.target.value)}
                  placeholder={`Enter ${param.name}...`}
                />
              )}
              {errors[param.name] && (
                <p className="text-sm" style={{ color: 'var(--accent-error)', marginTop: '4px' }}>
                  {errors[param.name]}
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            className={`btn ${mode === 'simulate' ? 'btn-success' : 'btn-primary'}`}
            onClick={handleSubmit}
          >
            <Play size={16} />
            {mode === 'simulate' ? 'Simulate' : 'Execute'}
          </button>
        </div>
      </div>
    </div>
  );
}
