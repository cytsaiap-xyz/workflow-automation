import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  List,
  CheckCircle,
  XCircle,
  Clock,
  Loader,
  Trash2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Bot,
} from 'lucide-react';
import { executionApi } from '../../shared/api/workflowApi';
import { useConfirm } from '../../shared/components/ConfirmDialog';
import type { Execution, ExecutionLog } from '../../shared/types/workflow';
import { QuizResultView } from './QuizResultView';
import { AssistantChatPanel } from '../assistant/AssistantChatPanel';
import { useAssistantStore } from '@/shared/stores/assistantStore';
import { assistantApi } from '@/shared/api/assistantApi';

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
    completed: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', icon: <CheckCircle size={14} /> },
    failed: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', icon: <XCircle size={14} /> },
    running: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', icon: <Loader size={14} /> },
    cancelled: { bg: 'rgba(100,116,139,0.15)', color: '#64748b', icon: <XCircle size={14} /> },
  };
  const s = styles[status] || styles.cancelled;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 10px', borderRadius: '6px',
      background: s.bg, color: s.color, fontSize: '12px', fontWeight: 600,
    }}>
      {s.icon} {status}
    </span>
  );
}

function TriggerBadge({ trigger }: { trigger: string }) {
  const colors: Record<string, string> = {
    manual: '#8b5cf6', schedule: '#f59e0b', webhook: '#3b82f6', api: '#64748b',
  };
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500,
      background: `${colors[trigger] || '#64748b'}20`, color: colors[trigger] || '#64748b',
    }}>
      {trigger}
    </span>
  );
}

function formatDuration(start: string, end?: string): string {
  if (!end) return 'Running...';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function ExecutionsPage() {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, ExecutionLog[]>>({});
  const [assistantWorkflowId, setAssistantWorkflowId] = useState<string | null>(null);

  const handleDebugWithAssistant = useCallback(async (execution: Execution) => {
    const { setPanelOpen, setConversation, appendUser, appendStreaming, appendToolCall, attachToolResult, addPendingChange, setStreaming } = useAssistantStore.getState();
    setAssistantWorkflowId(execution.workflowId);
    setPanelOpen(true);
    const c = await assistantApi.conversation.findOrCreate({
      workflowId: execution.workflowId,
      surface: 'panel',
    });
    setConversation(c.id, c.messages);
    const debugPrompt = `Execution ${execution.id} failed. Please fetch its logs and explain what went wrong, then propose a fix.`;
    appendUser(debugPrompt);
    setStreaming(true);
    assistantApi.sendMessage(c.id, debugPrompt, (e: Record<string, unknown>) => {
      if (e.type === 'token') appendStreaming(e.value as string);
      else if (e.type === 'tool_call') appendToolCall(e.name as string, e.args);
      else if (e.type === 'tool_result') attachToolResult(e.name as string, e.summary as string);
      else if (e.type === 'pending_change') addPendingChange(e.change_id as string);
      else if (e.type === 'done' || e.type === 'error') setStreaming(false);
    });
  }, []);

  const fetchExecutions = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await executionApi.getAll(50);
      setExecutions(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch executions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!logs[id]) {
      try {
        const logData = await executionApi.getLogs(id);
        setLogs(prev => ({ ...prev, [id]: logData }));
      } catch {
        // silently fail for logs
      }
    }
  };

  const handleDelete = async (id: string) => {
    const isConfirmed = await confirm({
      title: 'Delete Execution',
      message: 'Are you sure you want to delete this execution record? This action cannot be undone.',
      confirmText: 'Delete',
      type: 'danger'
    });
    if (!isConfirmed) return;

    try {
      await executionApi.delete(id);
      setExecutions(prev => prev.filter(e => e.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await executionApi.cancel(id);
      await fetchExecutions();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="layout">
      <header className="header">
        <div className="flex items-center gap-4">
          <button className="btn btn-ghost btn-icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.5rem' }}>
              <List size={24} style={{ marginRight: '10px', color: 'var(--accent-primary)' }} />
              Execution History
            </h1>
            <p className="text-sm text-muted">{executions.length} executions</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={fetchExecutions} disabled={isLoading}>
            <RefreshCw size={18} className={isLoading ? 'loading-spinner' : ''} />
            Refresh
          </button>
        </div>
      </header>

      {assistantWorkflowId && (
        <AssistantChatPanel workflowId={assistantWorkflowId} />
      )}

      <main className="main-content">
        {error && (
          <div className="card" style={{
            background: 'rgba(239,68,68,0.1)', borderColor: 'var(--accent-error)', marginBottom: '1.5rem',
          }}>
            <p className="text-error">{error}</p>
          </div>
        )}

        {isLoading && executions.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <Loader size={32} className="loading-spinner" style={{ margin: '0 auto 1rem', color: 'var(--accent-primary)' }} />
            <p className="text-muted">Loading executions...</p>
          </div>
        ) : executions.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <Clock size={48} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
            <h3>No Executions Yet</h3>
            <p className="text-muted">Run a workflow to see execution history here.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={thStyle}></th>
                  <th style={thStyle}>Workflow</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Trigger</th>
                  <th style={thStyle}>Started</th>
                  <th style={thStyle}>Duration</th>
                  <th style={thStyle}>Success</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {executions.map((exec) => (
                  <ExecutionRow
                    key={exec.id}
                    execution={exec}
                    isExpanded={expandedId === exec.id}
                    logs={logs[exec.id]}
                    onToggle={() => toggleExpand(exec.id)}
                    onDelete={() => handleDelete(exec.id)}
                    onCancel={() => handleCancel(exec.id)}
                    onDebugWithAssistant={() => handleDebugWithAssistant(exec)}
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

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '12px 16px', fontSize: '12px',
  fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px', fontSize: '14px',
};

function ExecutionRow({
  execution, isExpanded, logs, onToggle, onDelete, onCancel, onDebugWithAssistant,
}: {
  execution: Execution;
  isExpanded: boolean;
  logs?: ExecutionLog[];
  onToggle: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onDebugWithAssistant: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          borderBottom: '1px solid var(--border-color)',
          cursor: 'pointer',
          background: isExpanded ? 'var(--bg-tertiary)' : undefined,
        }}
      >
        <td style={tdStyle}>
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </td>
        <td style={{ ...tdStyle, fontWeight: 500 }}>{execution.workflowName}</td>
        <td style={tdStyle}><StatusBadge status={execution.status} /></td>
        <td style={tdStyle}><TriggerBadge trigger={execution.triggeredBy} /></td>
        <td style={{ ...tdStyle, fontSize: '13px', color: 'var(--text-muted)' }}>
          {new Date(execution.startTime).toLocaleString()}
        </td>
        <td style={{ ...tdStyle, fontSize: '13px' }}>
          {formatDuration(execution.startTime, execution.endTime)}
        </td>
        <td style={tdStyle}>
          <span style={{ fontWeight: 600, color: execution.successRate >= 100 ? '#22c55e' : execution.successRate > 0 ? '#f59e0b' : '#ef4444' }}>
            {execution.successRate.toFixed(0)}%
          </span>
        </td>
        <td style={tdStyle}>
          {execution.status === 'running' ? (
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              title="Cancel execution"
            >
              <XCircle size={14} style={{ color: 'var(--accent-warning)' }} />
            </button>
          ) : (
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete execution"
            >
              <Trash2 size={14} style={{ color: 'var(--accent-error)' }} />
            </button>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={8} style={{ padding: '0 16px 16px 40px', background: 'var(--bg-tertiary)' }}>
            {/* Station/Step Results */}
            {execution.result?.stations && execution.result.stations.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Station Results</h4>
                {execution.result.stations.map((station) => (
                  <div key={station.stationId} style={{
                    marginBottom: '8px', padding: '10px 14px',
                    borderRadius: '8px', background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <StatusBadge status={station.status} />
                      <span style={{ fontWeight: 500, fontSize: '13px' }}>{station.stationName}</span>
                    </div>
                    {station.steps.length > 0 && (
                      <div style={{ paddingLeft: '12px', borderLeft: '2px solid var(--border-color)' }}>
                        {station.steps.map((step) => (
                          <div key={step.stepId} style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '4px 0', fontSize: '12px',
                          }}>
                            <StatusBadge status={step.status} />
                            <span>{step.stepName}</span>
                            <span style={{ color: 'var(--text-muted)' }}>({step.stepType})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Quiz Result View — rendered when a quiz-output-writer step produced output */}
            {(() => {
              const quizStep = execution.result?.stations
                ?.flatMap((s) => s.steps)
                .find((s) => s.stepType === 'quiz-output-writer' && s.output?.json);
              if (!quizStep) return null;
              return (
                <div style={{ marginTop: '12px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Quiz Output</h4>
                  <QuizResultView
                    json={quizStep.output!.json}
                    filePath={quizStep.output!.filePath as string | undefined}
                  />
                </div>
              );
            })()}

            {/* Logs */}
            {logs && logs.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Logs</h4>
                <div style={{
                  maxHeight: '250px', overflowY: 'auto',
                  background: 'var(--bg-primary)', borderRadius: '8px',
                  border: '1px solid var(--border-color)', padding: '8px',
                  fontFamily: 'monospace', fontSize: '11px',
                }}>
                  {logs.map((log) => (
                    <div key={log.id} style={{
                      padding: '3px 6px', borderRadius: '4px',
                      color: log.level === 'error' ? '#ef4444' : log.level === 'warn' ? '#f59e0b' : 'var(--text-secondary)',
                      background: log.level === 'error' ? 'rgba(239,68,68,0.05)' : undefined,
                    }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      {' '}
                      <span style={{ fontWeight: 600, textTransform: 'uppercase' }}>[{log.level}]</span>
                      {' '}
                      {log.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {logs && logs.length === 0 && (
              <p className="text-muted text-sm" style={{ marginTop: '8px' }}>No logs available.</p>
            )}

            {/* Debug deep-link button for failed executions */}
            {execution.status === 'failed' && (
              <div style={{ marginTop: '14px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={(e) => { e.stopPropagation(); onDebugWithAssistant(); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Bot size={15} />
                  Ask the assistant about this failure
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
