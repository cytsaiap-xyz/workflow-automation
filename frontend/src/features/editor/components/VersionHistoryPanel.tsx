import { useState, useEffect, useCallback } from 'react';
import { Clock, RotateCcw, X } from 'lucide-react';
import { versionApi } from '../../../shared/api/workflowApi';
import { useConfirm } from '../../../shared/components/ConfirmDialog';
import type { WorkflowVersion } from '../../../shared/types/workflow';
import { isV2 } from '../../../shared/types/workflow';

interface Props {
  workflowId: string;
  onRestore: () => void;
  onClose: () => void;
}

export default function VersionHistoryPanel({ workflowId, onRestore, onClose }: Props) {
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { confirm } = useConfirm();

  const fetchVersions = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await versionApi.getVersions(workflowId);
      setVersions(data);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleRestore = async (version: WorkflowVersion) => {
    const confirmed = await confirm({
      title: 'Restore Version',
      message: `Restore to version ${version.version}? Current changes will be saved as a new version.`,
      confirmText: 'Restore',
      type: 'warning',
    });
    if (!confirmed) return;

    try {
      await versionApi.restore(workflowId, version.version);
      onRestore();
    } catch {
      // silently fail
    }
  };

  return (
    <div style={{
      width: '320px',
      borderLeft: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={16} />
          Version History
        </h3>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <div className="loading-spinner" />
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted" style={{ textAlign: 'center', padding: '24px' }}>
            No version history yet. Versions are saved when you update the workflow.
          </p>
        ) : (
          versions.map((version) => (
            <div key={version.id} style={{
              padding: '12px',
              marginBottom: '8px',
              borderRadius: '8px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>
                  Version {version.version}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleRestore(version)}
                  title="Restore this version"
                  style={{ fontSize: '12px', gap: '4px' }}
                >
                  <RotateCcw size={12} />
                  Restore
                </button>
              </div>
              <div className="text-sm text-muted">
                {new Date(version.createdAt).toLocaleString()}
              </div>
              {version.changeSummary && (
                <div className="text-sm" style={{ marginTop: '4px', color: 'var(--text-secondary)' }}>
                  {version.changeSummary}
                </div>
              )}
              <div className="text-sm text-muted" style={{ marginTop: '4px' }}>
                {isV2(version.definition)
                  ? `${version.definition.nodes?.length ?? 0} node${(version.definition.nodes?.length ?? 0) !== 1 ? 's' : ''}`
                  : `${version.definition.stations?.length ?? 0} station${(version.definition.stations?.length ?? 0) !== 1 ? 's' : ''}`}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
