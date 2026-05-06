import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Star, Trash2, Plus, RefreshCw, ChevronUp } from 'lucide-react';
import { aiProvidersApi } from '../../shared/api/aiProvidersApi';
import type { AiProvider } from '../../shared/api/aiProvidersApi';
import { toast } from '../../shared/stores/toastStore';

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: '14px',
};

const emptyForm = {
  name: '',
  baseUrl: '',
  model: '',
  apiKey: '',
  supportsVision: false,
  isDefault: false,
};

export function AIProvidersPage() {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await aiProvidersApi.list();
      setProviders(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch providers';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handlePromote = async (id: string) => {
    try {
      const updated = await aiProvidersApi.promote(id);
      setProviders(prev =>
        prev.map(p => ({ ...p, isDefault: p.id === updated.id }))
      );
      toast.success('Provider set as default');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to promote provider';
      toast.error(message);
    }
  };

  const handleDelete = async (id: string, isDefault: boolean) => {
    if (isDefault) {
      toast.error('Cannot delete the default provider. Promote another provider first.');
      return;
    }
    try {
      await aiProvidersApi.remove(id);
      setProviders(prev => prev.filter(p => p.id !== id));
      toast.success('Provider deleted');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete provider';
      // Surface 409 conflict message clearly
      toast.error(message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.baseUrl.trim() || !form.model.trim()) {
      toast.error('Name, Base URL, and Model are required');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: Partial<AiProvider> = {
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        supportsVision: form.supportsVision,
        isDefault: form.isDefault,
      };
      if (form.apiKey.trim()) {
        payload.apiKey = form.apiKey.trim();
      }
      const created = await aiProvidersApi.create(payload);
      // If isDefault, flip all others
      setProviders(prev => {
        const updated = prev.map(p => ({
          ...p,
          isDefault: created.isDefault ? false : p.isDefault,
        }));
        return [...updated, created];
      });
      setForm(emptyForm);
      setShowForm(false);
      toast.success('Provider added');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create provider';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="layout">
      <header className="header">
        <div className="flex items-center gap-4">
          <h1 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings size={24} style={{ color: 'var(--accent-primary)' }} />
            AI Providers
          </h1>
          <p className="text-sm text-muted">{providers.length} provider{providers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={fetchProviders}
            disabled={isLoading}
          >
            <RefreshCw size={18} className={isLoading ? 'loading-spinner' : ''} />
            Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowForm(v => !v)}
          >
            <Plus size={18} />
            Add Provider
          </button>
        </div>
      </header>

      <main className="main-content">
        {error && (
          <div
            className="card"
            style={{
              background: 'rgba(239,68,68,0.1)',
              borderColor: 'var(--accent-error)',
              marginBottom: '1.5rem',
            }}
          >
            <p className="text-error">{error}</p>
          </div>
        )}

        {/* Add Provider Form */}
        {showForm && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h2 className="card-title">New Provider</h2>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => { setShowForm(false); setForm(emptyForm); }}
                title="Close"
              >
                <ChevronUp size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2" style={{ gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input
                    className="form-input"
                    placeholder="e.g. OpenAI GPT-4o"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Model *</label>
                  <input
                    className="form-input"
                    placeholder="e.g. gpt-4o"
                    value={form.model}
                    onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Base URL *</label>
                  <input
                    className="form-input"
                    placeholder="https://api.openai.com/v1"
                    value={form.baseUrl}
                    onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">API Key</label>
                  <input
                    className="form-input"
                    type="password"
                    placeholder="sk-..."
                    value={form.apiKey}
                    onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={form.supportsVision}
                    onChange={e => setForm(f => ({ ...f, supportsVision: e.target.checked }))}
                  />
                  Supports Vision
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                  />
                  Set as Default
                </label>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowForm(false); setForm(emptyForm); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="loading-spinner" style={{ width: '14px', height: '14px' }} />
                  ) : (
                    <Plus size={16} />
                  )}
                  Add Provider
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Providers Table */}
        {isLoading && providers.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <span
              className="loading-spinner"
              style={{ display: 'inline-block', margin: '0 auto 1rem', color: 'var(--accent-primary)', width: '32px', height: '32px' }}
            />
            <p className="text-muted">Loading providers...</p>
          </div>
        ) : providers.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <Settings size={48} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
            <h3>No AI Providers</h3>
            <p className="text-muted" style={{ marginTop: '0.5rem' }}>
              Add a provider to enable AI steps in your workflows.
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Model</th>
                  <th style={thStyle}>Base URL</th>
                  <th style={thStyle}>Vision</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map(provider => (
                  <ProviderRow
                    key={provider.id}
                    provider={provider}
                    onPromote={() => handlePromote(provider.id)}
                    onDelete={() => handleDelete(provider.id, provider.isDefault)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function ProviderRow({
  provider,
  onPromote,
  onDelete,
}: {
  provider: AiProvider;
  onPromote: () => void;
  onDelete: () => void;
}) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
      <td style={{ ...tdStyle, fontWeight: 500 }}>{provider.name}</td>
      <td style={tdStyle}>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            background: 'rgba(59,130,246,0.15)',
            color: 'var(--accent-primary)',
            fontFamily: 'monospace',
          }}
        >
          {provider.model}
        </span>
      </td>
      <td style={{ ...tdStyle, fontSize: '13px', color: 'var(--text-muted)' }}>
        {provider.baseUrl}
      </td>
      <td style={tdStyle}>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 500,
            background: provider.supportsVision
              ? 'rgba(34,197,94,0.15)'
              : 'var(--bg-tertiary)',
            color: provider.supportsVision
              ? 'var(--accent-success)'
              : 'var(--text-muted)',
          }}
        >
          {provider.supportsVision ? 'Yes' : 'No'}
        </span>
      </td>
      <td style={tdStyle}>
        {provider.isDefault ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(245,158,11,0.15)',
              color: 'var(--accent-warning)',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <Star size={12} />
            Default
          </span>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={onPromote}>
            <Star size={12} />
            Promote
          </button>
        )}
      </td>
      <td style={tdStyle}>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={onDelete}
          disabled={provider.isDefault}
          title={provider.isDefault ? 'Cannot delete the default provider' : 'Delete provider'}
          style={{ color: provider.isDefault ? 'var(--text-muted)' : undefined }}
        >
          <Trash2 size={14} style={{ color: provider.isDefault ? undefined : 'var(--accent-error)' }} />
        </button>
      </td>
    </tr>
  );
}
