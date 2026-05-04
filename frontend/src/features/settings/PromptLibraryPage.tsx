import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Trash2, Plus, RefreshCw, ChevronUp, Copy, Edit2 } from 'lucide-react';
import { promptTemplatesApi } from '../../shared/api/promptTemplatesApi';
import type { PromptTemplate } from '../../shared/api/promptTemplatesApi';
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
  role: 'system' as 'system' | 'user',
  content: '',
  description: '',
  requiresVision: false,
  tags: '',
};

type FormState = typeof emptyForm;

// ---------- sub-component: template row ----------

function TemplateRow({
  template,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  template: PromptTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
      <td style={{ ...tdStyle, fontWeight: 500 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {template.name}
          {template.builtin && (
            <span
              style={{
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 600,
                background: 'rgba(139,92,246,0.15)',
                color: 'var(--accent-primary)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Built-in
            </span>
          )}
        </div>
        {template.description && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {template.description}
          </div>
        )}
      </td>
      <td style={tdStyle}>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            background: template.role === 'system'
              ? 'rgba(59,130,246,0.15)'
              : 'rgba(34,197,94,0.15)',
            color: template.role === 'system'
              ? 'var(--accent-primary)'
              : 'var(--accent-success)',
            fontFamily: 'monospace',
          }}
        >
          {template.role}
        </span>
      </td>
      <td style={tdStyle}>
        {template.tags.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {template.tags.map(tag => (
              <span
                key={tag}
                style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-muted)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>
        )}
      </td>
      <td style={tdStyle}>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 500,
            background: template.requiresVision
              ? 'rgba(34,197,94,0.15)'
              : 'var(--bg-tertiary)',
            color: template.requiresVision
              ? 'var(--accent-success)'
              : 'var(--text-muted)',
          }}
        >
          {template.requiresVision ? 'Yes' : 'No'}
        </span>
      </td>
      <td style={tdStyle}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onEdit}
            title="Edit template"
          >
            <Edit2 size={14} />
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onDuplicate}
            title="Duplicate template"
          >
            <Copy size={14} />
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onDelete}
            disabled={template.builtin}
            title={template.builtin ? 'Cannot delete a built-in template' : 'Delete template'}
            style={{ color: template.builtin ? 'var(--text-muted)' : undefined }}
          >
            <Trash2
              size={14}
              style={{ color: template.builtin ? undefined : 'var(--accent-error)' }}
            />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---------- sub-component: add/edit form ----------

function TemplateForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  isSubmitting,
  title,
  submitLabel,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  title: string;
  submitLabel: string;
}) {
  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div className="card-header">
        <h2 className="card-title">{title}</h2>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={onCancel}
          title="Close"
        >
          <ChevronUp size={16} />
        </button>
      </div>
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-2" style={{ gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input
              className="form-input"
              placeholder="e.g. Quiz question generator"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Role *</label>
            <select
              className="form-input"
              value={form.role}
              onChange={e =>
                setForm(f => ({ ...f, role: e.target.value as 'system' | 'user' }))
              }
            >
              <option value="system">system</option>
              <option value="user">user</option>
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Description</label>
            <input
              className="form-input"
              placeholder="Brief description of what this template does"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Content *</label>
            <textarea
              className="form-input"
              rows={14}
              placeholder="Enter the prompt template content..."
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              style={{ fontFamily: 'monospace', fontSize: '13px', resize: 'vertical' }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Tags (comma-separated)</label>
            <input
              className="form-input"
              placeholder="e.g. quiz, science, multiple-choice"
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            <input
              type="checkbox"
              checked={form.requiresVision}
              onChange={e => setForm(f => ({ ...f, requiresVision: e.target.checked }))}
            />
            Requires Vision
          </label>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="loading-spinner" style={{ width: '14px', height: '14px' }} />
            ) : (
              <Plus size={16} />
            )}
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- main page ----------

type EditState = { id: string } & FormState;

export function PromptLibraryPage() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(emptyForm);
  const [isAddSubmitting, setIsAddSubmitting] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await promptTemplatesApi.list();
      setTemplates(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch templates';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.content.trim()) {
      toast.error('Name and Content are required');
      return;
    }
    setIsAddSubmitting(true);
    try {
      const created = await promptTemplatesApi.create({
        name: addForm.name.trim(),
        role: addForm.role,
        content: addForm.content.trim(),
        description: addForm.description.trim() || undefined,
        requiresVision: addForm.requiresVision,
        tags: addForm.tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean),
        builtin: false,
      });
      setTemplates(prev => [...prev, created]);
      setAddForm(emptyForm);
      setShowAddForm(false);
      toast.success('Template added');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create template';
      toast.error(message);
    } finally {
      setIsAddSubmitting(false);
    }
  };

  const openEdit = (t: PromptTemplate) => {
    setEditState({
      id: t.id,
      name: t.name,
      role: t.role,
      content: t.content,
      description: t.description ?? '',
      requiresVision: t.requiresVision,
      tags: t.tags.join(', '),
    });
    setShowAddForm(false);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editState) return;
    if (!editState.name.trim() || !editState.content.trim()) {
      toast.error('Name and Content are required');
      return;
    }
    setIsEditSubmitting(true);
    try {
      const updated = await promptTemplatesApi.update(editState.id, {
        name: editState.name.trim(),
        role: editState.role,
        content: editState.content.trim(),
        description: editState.description.trim() || undefined,
        requiresVision: editState.requiresVision,
        tags: editState.tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean),
      });
      setTemplates(prev => prev.map(t => (t.id === updated.id ? updated : t)));
      setEditState(null);
      toast.success('Template updated');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update template';
      toast.error(message);
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleDuplicate = async (t: PromptTemplate) => {
    try {
      const created = await promptTemplatesApi.create({
        name: `${t.name} (copy)`,
        role: t.role,
        content: t.content,
        description: t.description,
        requiresVision: t.requiresVision,
        tags: [...t.tags],
        builtin: false,
      });
      setTemplates(prev => [...prev, created]);
      toast.success('Template duplicated');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to duplicate template';
      toast.error(message);
    }
  };

  const handleDelete = async (t: PromptTemplate) => {
    if (t.builtin) {
      toast.error('Cannot delete a built-in template.');
      return;
    }
    try {
      await promptTemplatesApi.remove(t.id);
      setTemplates(prev => prev.filter(p => p.id !== t.id));
      toast.success('Template deleted');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete template';
      toast.error(message);
    }
  };

  return (
    <div className="layout">
      <header className="header">
        <div className="flex items-center gap-4">
          <h1
            style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            <BookOpen size={24} style={{ color: 'var(--accent-primary)' }} />
            Prompt Library
          </h1>
          <p className="text-sm text-muted">
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={fetchTemplates}
            disabled={isLoading}
          >
            <RefreshCw size={18} className={isLoading ? 'loading-spinner' : ''} />
            Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowAddForm(v => !v);
              setEditState(null);
            }}
          >
            <Plus size={18} />
            Add Template
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

        {/* Add Template Form */}
        {showAddForm && (
          <TemplateForm
            form={addForm}
            setForm={setAddForm}
            onSubmit={handleAdd}
            onCancel={() => {
              setShowAddForm(false);
              setAddForm(emptyForm);
            }}
            isSubmitting={isAddSubmitting}
            title="New Template"
            submitLabel="Add Template"
          />
        )}

        {/* Edit Template Form */}
        {editState && (
          <TemplateForm
            form={editState}
            setForm={patch =>
              setEditState(prev => {
                if (!prev) return prev;
                const next =
                  typeof patch === 'function' ? patch(prev) : patch;
                return { ...prev, ...next };
              })
            }
            onSubmit={handleEdit}
            onCancel={() => setEditState(null)}
            isSubmitting={isEditSubmitting}
            title={`Edit: ${editState.name}`}
            submitLabel="Save Changes"
          />
        )}

        {/* Templates Table */}
        {isLoading && templates.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <span
              className="loading-spinner"
              style={{
                display: 'inline-block',
                margin: '0 auto 1rem',
                color: 'var(--accent-primary)',
                width: '32px',
                height: '32px',
              }}
            />
            <p className="text-muted">Loading templates...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <BookOpen size={48} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
            <h3>No Prompt Templates</h3>
            <p className="text-muted" style={{ marginTop: '0.5rem' }}>
              Add a template to use in AI steps of your workflows.
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Tags</th>
                  <th style={thStyle}>Vision</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    onEdit={() => openEdit(t)}
                    onDuplicate={() => handleDuplicate(t)}
                    onDelete={() => handleDelete(t)}
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
