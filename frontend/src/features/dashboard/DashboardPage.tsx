import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore } from '../editor/stores/workflowStore';
import ExecuteDialog from '../editor/components/ExecuteDialog';
import { RunWithInputDialog } from '../editor/RunWithInputDialog';
import type { Workflow } from '../../shared/types/workflow';
import { workflowApi } from '../../shared/api/workflowApi';
import {
  Plus,
  Play,
  Edit,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  Pause,
  LayoutDashboard,
  Copy,
  Download,
  Upload
} from 'lucide-react';
import { useConfirm } from '../../shared/components/ConfirmDialog';
import { toast } from '../../shared/stores/toastStore';

function DashboardPage() {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const {
    workflows,
    fetchWorkflows,
    createWorkflow,
    deleteWorkflow,
    updateWorkflow,
    isLoading,
    error
  } = useWorkflowStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDesc, setNewWorkflowDesc] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [executeTarget, setExecuteTarget] = useState<Workflow | null>(null);
  const [fileInputTarget, setFileInputTarget] = useState<Workflow | null>(null);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  // Memoized stats calculation - single iteration for efficiency
  const stats = useMemo(() => {
    const counts = { active: 0, paused: 0, draft: 0 };
    for (const w of workflows) {
      if (w.status === 'active') counts.active++;
      else if (w.status === 'paused') counts.paused++;
      else if (w.status === 'draft') counts.draft++;
    }
    return { total: workflows.length, ...counts };
  }, [workflows]);

  const handleCreate = useCallback(async () => {
    if (!newWorkflowName.trim()) return;

    try {
      const workflow = await createWorkflow(newWorkflowName, newWorkflowDesc);
      setShowCreateModal(false);
      setNewWorkflowName('');
      setNewWorkflowDesc('');
      setNameTouched(false);
      navigate(`/editor/${workflow.id}`);
    } catch (err) {
      console.error('Failed to create workflow:', err);
    }
  }, [newWorkflowName, newWorkflowDesc, createWorkflow, navigate]);

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const isConfirmed = await confirm({
      title: 'Delete Workflow',
      message: 'Are you sure you want to delete this workflow? This action cannot be undone.',
      confirmText: 'Delete',
      type: 'danger'
    });

    if (isConfirmed) {
      await deleteWorkflow(id);
    }
  }, [deleteWorkflow, confirm]);

  const handleToggleStatus = useCallback(async (workflow: Workflow, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = workflow.status === 'active' ? 'paused' : 'active';
    await updateWorkflow(workflow.id, { status: newStatus });
  }, [updateWorkflow]);

  const handleExecute = useCallback(async (workflow: Workflow, e: React.MouseEvent) => {
    e.stopPropagation();
    const params = workflow.definition.inputParameters;
    if (params && params.length > 0) {
      // Route to file-upload dialog if any parameter is of type 'file',
      // otherwise use the plain JSON-body ExecuteDialog.
      if (params.some(p => p.type === 'file')) {
        setFileInputTarget(workflow);
      } else {
        setExecuteTarget(workflow);
      }
      return;
    }
    try {
      await workflowApi.execute(workflow.id);
      toast.success(`Workflow "${workflow.name}" execution started`);
    } catch (err: unknown) {
      toast.error(`Execution failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleExecuteWithParams = useCallback(async (inputData: Record<string, any>) => {
    if (!executeTarget) return;
    setExecuteTarget(null);
    try {
      await workflowApi.execute(executeTarget.id, inputData);
      toast.success(`Workflow "${executeTarget.name}" execution started`);
    } catch (err: unknown) {
      toast.error(`Execution failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [executeTarget]);

  const handleCopy = useCallback(async (workflow: Workflow, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await createWorkflow(
        `${workflow.name} (Copy)`,
        workflow.description,
        workflow.definition
      );
    } catch (err) {
      console.error('Failed to copy workflow:', err);
    }
  }, [createWorkflow]);

  const handleExport = useCallback((workflow: Workflow, e: React.MouseEvent) => {
    e.stopPropagation();
    const exportData = {
      name: workflow.name,
      description: workflow.description,
      definition: workflow.definition,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.name || !data.definition) {
        toast.error('Invalid workflow file: missing name or definition');
        return;
      }
      await createWorkflow(data.name, data.description, data.definition);
      toast.success('Workflow imported successfully');
    } catch (err) {
      toast.error('Failed to import workflow: Invalid JSON');
    }
    e.target.value = '';
  }, [createWorkflow]);

  const getStatusBadge = useCallback((status: Workflow['status']) => {
    switch (status) {
      case 'active':
        return <span className="badge badge-success"><CheckCircle size={12} /> Active</span>;
      case 'paused':
        return <span className="badge badge-warning"><Pause size={12} /> Paused</span>;
      default:
        return <span className="badge badge-neutral"><Clock size={12} /> Draft</span>;
    }
  }, []);

  // Stats already calculated above with useMemo

  return (
    <div className="layout">
      <header className="header">
        <h1>
          <LayoutDashboard size={24} />
          Workflow Automation
        </h1>
        <div className="header-actions">
          <label className="btn btn-secondary cursor-pointer">
            <Upload size={18} />
            Import
            <input 
              type="file" 
              accept=".json" 
              onChange={handleImport} 
              style={{ display: 'none' }} 
            />
          </label>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={18} />
            New Workflow
          </button>
        </div>
      </header>

      <main className="main-content">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 mb-4">
          <div className="card stat-card stat-primary">
            <div className="text-muted text-sm">Total Workflows</div>
            <div className="text-3xl font-semibold mt-2">{stats.total}</div>
          </div>
          <div className="card stat-card stat-success">
            <div className="text-muted text-sm">Active</div>
            <div className="text-3xl font-semibold mt-2 text-success">{stats.active}</div>
          </div>
          <div className="card stat-card stat-warning">
            <div className="text-muted text-sm">Paused</div>
            <div className="text-3xl font-semibold mt-2" style={{ color: 'var(--accent-warning)' }}>{stats.paused}</div>
          </div>
          <div className="card stat-card stat-purple">
            <div className="text-muted text-sm">Draft</div>
            <div className="text-3xl font-semibold mt-2 text-secondary">{stats.draft}</div>
          </div>
        </div>

        {/* Workflows List */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Workflows</h2>
          </div>

          {error && (
            <div className="badge badge-error mb-4">
              <XCircle size={14} />
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="empty-state">
              <div className="loading-spinner"></div>
              <p className="mt-2">Loading workflows...</p>
            </div>
          ) : workflows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <h3>No workflows yet</h3>
              <p className="text-muted">Create your first workflow to get started</p>
              <button 
                className="btn btn-primary mt-4"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus size={18} />
                Create Workflow
              </button>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Stations</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((workflow) => (
                  <tr 
                    key={workflow.id}
                    onClick={() => navigate(`/editor/${workflow.id}`)}
                    className="cursor-pointer"
                  >
                    <td>
                      <div className="font-medium">{workflow.name}</div>
                      {workflow.description && (
                        <div className="text-sm text-muted">{workflow.description}</div>
                      )}
                    </td>
                    <td>{getStatusBadge(workflow.status)}</td>
                    <td>{workflow.definition.stations.length} {workflow.definition.stations.length === 1 ? 'station' : 'stations'}</td>
                    <td className="text-muted text-sm">
                      {new Date(workflow.updatedAt).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="btn btn-sm btn-success btn-icon"
                          onClick={(e) => handleExecute(workflow, e)}
                          title="Execute"
                        >
                          <Play size={14} />
                        </button>
                        <button
                          className={`btn btn-sm btn-icon ${workflow.status === 'active' ? 'btn-warning' : 'btn-secondary'}`}
                          onClick={(e) => handleToggleStatus(workflow, e)}
                          title={workflow.status === 'active' ? 'Pause' : 'Activate'}
                        >
                          {workflow.status === 'active' ? <Pause size={14} /> : <CheckCircle size={14} />}
                        </button>
                        <button 
                          className="btn btn-sm btn-secondary btn-icon"
                          onClick={(e) => handleCopy(workflow, e)}
                          title="Duplicate"
                        >
                          <Copy size={14} />
                        </button>
                        <button 
                          className="btn btn-sm btn-secondary btn-icon"
                          onClick={(e) => handleExport(workflow, e)}
                          title="Export"
                        >
                          <Download size={14} />
                        </button>
                        <button 
                          className="btn btn-sm btn-secondary btn-icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/editor/${workflow.id}`);
                          }}
                          title="Edit"
                        >
                          <Edit size={14} />
                        </button>
                        <button 
                          className="btn btn-sm btn-danger btn-icon"
                          onClick={(e) => handleDelete(workflow.id, e)}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Execute Dialog (non-file inputs) */}
      {executeTarget && executeTarget.definition.inputParameters && (
        <ExecuteDialog
          parameters={executeTarget.definition.inputParameters}
          mode="execute"
          onSubmit={handleExecuteWithParams}
          onCancel={() => setExecuteTarget(null)}
        />
      )}

      {/* Run-with-Input Dialog (file uploads) */}
      {fileInputTarget && fileInputTarget.definition.inputParameters && (
        <RunWithInputDialog
          workflowId={fileInputTarget.id}
          inputs={fileInputTarget.definition.inputParameters}
          open={true}
          onClose={() => setFileInputTarget(null)}
          onComplete={() => {
            toast.success(`Workflow "${fileInputTarget.name}" execution started`);
            setFileInputTarget(null);
          }}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => { setShowCreateModal(false); setNameTouched(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create New Workflow</h3>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => { setShowCreateModal(false); setNameTouched(false); }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Workflow Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., Daily Report Generator"
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  autoFocus
                />
                {nameTouched && !newWorkflowName.trim() && (
                  <p className="text-sm" style={{ color: 'var(--accent-error)', marginTop: '4px' }}>
                    Workflow name is required
                  </p>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <textarea
                  className="form-textarea"
                  placeholder="What does this workflow do?"
                  value={newWorkflowDesc}
                  onChange={(e) => setNewWorkflowDesc(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => { setShowCreateModal(false); setNameTouched(false); }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!newWorkflowName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
