import { useDagEditorStore } from '@/shared/stores/dagEditorStore';

export function EdgeConfigPanel() {
  const { selectedEdgeId, edges, upsertEdge, removeEdge, selectEdge } = useDagEditorStore();
  const edge = edges.find(e => e.id === selectedEdgeId);
  if (!edge) return null;
  const set = (patch: Partial<typeof edge>) => upsertEdge({ ...edge, ...patch });

  return (
    <aside
      className="card"
      style={{
        position: 'fixed', right: 16, top: 80, width: 320,
        padding: 16, zIndex: 30,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong>Edge: {edge.source} → {edge.target}</strong>
        <button className="btn" onClick={() => selectEdge(undefined)} aria-label="Close">×</button>
      </header>

      <div className="form-group">
        <label className="form-label">Target port (named input)</label>
        <input
          className="form-input"
          value={edge.targetPort || ''}
          onChange={e => set({ targetPort: e.target.value || undefined })}
          placeholder="e.g. reviewer"
        />
      </div>

      <div className="form-group">
        <label className="form-label">When (expression)</label>
        <textarea
          className="form-input"
          value={edge.when || ''}
          onChange={e => set({ when: e.target.value || undefined })}
          placeholder="${output.status}"
          rows={2}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Merge mode</label>
        <select
          className="form-input"
          value={edge.mergeMode || 'all'}
          onChange={e => set({ mergeMode: e.target.value as 'all' | 'any' })}
        >
          <option value="all">all (wait for all incoming)</option>
          <option value="any">any (race)</option>
        </select>
      </div>

      <button
        className="btn"
        onClick={() => { removeEdge(edge.id); selectEdge(undefined); }}
        style={{ marginTop: 8 }}
      >
        Delete edge
      </button>
    </aside>
  );
}
