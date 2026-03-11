import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Step } from '../../../shared/types/workflow';
import { STEP_TYPE_INFO } from '../../../shared/types/workflow';
import CheckCircle from 'lucide-react/dist/esm/icons/check-circle';
import XCircle from 'lucide-react/dist/esm/icons/x-circle';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Loader from 'lucide-react/dist/esm/icons/loader';

interface StepNodeData extends Record<string, unknown> {
  step: Step;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  isSelected?: boolean;
  hasInspectableData?: boolean;
}

// Using a more generic props type for compatibility with Xyflow v12
const StepNode = memo(({ data, selected }: { data: StepNodeData; selected?: boolean }) => {
  const { step, status, isSelected, hasInspectableData } = data;
  const activeSelected = isSelected || selected;
  const typeInfo = (STEP_TYPE_INFO as any)[step.type] || { label: step.type, icon: '📦', color: '#64748b' };

  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={14} className="text-success" />;
      case 'failed':
        return <XCircle size={14} className="text-error" />;
      case 'running':
        return <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />;
      case 'skipped':
        return <Clock size={14} className="text-muted" />;
      default:
        return null;
    }
  };

  const getStatusStyle = () => {
    switch (status) {
      case 'completed':
        return { borderColor: 'var(--accent-success)' };
      case 'failed':
        return { borderColor: 'var(--accent-error)' };
      case 'running':
        return { borderColor: 'var(--accent-primary)', boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)' };
      default:
        return {};
    }
  };

  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        border: `2px solid ${activeSelected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
        borderRadius: '10px',
        padding: '12px 16px',
        minWidth: '200px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        ...getStatusStyle(),
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: '12px',
          height: '12px',
          background: 'var(--accent-primary)',
          border: '2px solid var(--bg-secondary)',
          top: '-6px',
        }}
      />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: `${typeInfo.color}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
          }}
        >
          {typeInfo.icon}
        </div>
        
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ 
            fontSize: '13px', 
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {step.name}
          </div>
          <div style={{ 
            fontSize: '11px', 
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <span style={{ color: typeInfo.color }}>{typeInfo.label}</span>
          </div>
        </div>

        {(status || hasInspectableData) && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {hasInspectableData && (
              <span
                title="Click to inspect data"
                style={{
                  fontSize: '10px',
                  background: 'var(--accent-primary)',
                  color: '#fff',
                  borderRadius: '3px',
                  padding: '1px 4px',
                  fontWeight: 600,
                  lineHeight: '1.4',
                }}
              >
                DATA
              </span>
            )}
            {status && getStatusIcon()}
          </div>
        )}
      </div>

      {step.type === 'if-else' ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{
              width: '12px',
              height: '12px',
              background: '#22c55e',
              border: '2px solid var(--bg-secondary)',
              bottom: '-6px',
              left: '35%',
            }}
          />
          <div style={{
            position: 'absolute',
            bottom: '-20px',
            left: '35%',
            transform: 'translateX(-50%)',
            fontSize: '10px',
            fontWeight: 700,
            color: '#22c55e',
          }}>T</div>
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{
              width: '12px',
              height: '12px',
              background: '#ef4444',
              border: '2px solid var(--bg-secondary)',
              bottom: '-6px',
              left: '65%',
            }}
          />
          <div style={{
            position: 'absolute',
            bottom: '-20px',
            left: '65%',
            transform: 'translateX(-50%)',
            fontSize: '10px',
            fontWeight: 700,
            color: '#ef4444',
          }}>F</div>
        </>
      ) : step.type === 'ai-router' && step.config.aiRoutes && step.config.aiRoutes.length > 0 ? (
        <>
          {step.config.aiRoutes.map((route: { branchId: string; description: string }, i: number) => {
            const count = step.config.aiRoutes!.length;
            const leftPct = ((i + 1) / (count + 1)) * 100;
            const colors = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
            const color = colors[i % colors.length];
            return (
              <div key={route.branchId}>
                <Handle
                  type="source"
                  position={Position.Bottom}
                  id={route.branchId}
                  style={{
                    width: '12px',
                    height: '12px',
                    background: color,
                    border: '2px solid var(--bg-secondary)',
                    bottom: '-6px',
                    left: `${leftPct}%`,
                  }}
                />
                <div style={{
                  position: 'absolute',
                  bottom: '-20px',
                  left: `${leftPct}%`,
                  transform: 'translateX(-50%)',
                  fontSize: '9px',
                  fontWeight: 600,
                  color: color,
                  whiteSpace: 'nowrap',
                  maxWidth: '60px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>{route.branchId}</div>
              </div>
            );
          })}
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            width: '12px',
            height: '12px',
            background: 'var(--accent-primary)',
            border: '2px solid var(--bg-secondary)',
            bottom: '-6px',
          }}
        />
      )}
    </div>
  );
});

StepNode.displayName = 'StepNode';

export default StepNode;
