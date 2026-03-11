import { useState } from 'react';
import type { Station, StepType } from '../../../shared/types/workflow';
import { STEP_TYPE_INFO } from '../../../shared/types/workflow';
import X from 'lucide-react/dist/esm/icons/x';
import Search from 'lucide-react/dist/esm/icons/search';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';

interface NodeLibraryProps {
  onAddStep: (type: StepType) => void;
  stations: Station[];
  onAddStepToStation: (stationId: string, type: StepType) => void;
  onClose: () => void;
}

const NODE_CATEGORIES = {
  triggers: {
    label: '📌 Triggers',
    types: ['trigger-manual', 'trigger-cron', 'trigger-webhook'] as StepType[],
  },
  actions: {
    label: '⚙️ Actions',
    types: ['script-js', 'script-python', 'http-request', 'set-variable', 'action-email', 'action-slack', 'connector-db'] as StepType[],
  },
  flow: {
    label: '🔀 Flow Control',
    types: ['if-else', 'wait'] as StepType[],
  },
  ai: {
    label: '🤖 AI',
    types: ['ai-prompt', 'ai-structured-output', 'ai-agent'] as StepType[],
  },
};

function NodeLibrary({ onAddStep, stations, onAddStepToStation, onClose }: NodeLibraryProps) {
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['triggers', 'actions', 'flow', 'ai']);
  const [selectedStation, setSelectedStation] = useState<string>(stations[0]?.id || '');

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const handleAddNode = (type: StepType) => {
    if (selectedStation) {
      onAddStepToStation(selectedStation, type);
    } else {
      onAddStep(type);
    }
  };

  const filterNodes = (types: StepType[]) => {
    if (!search) return types;
    return types.filter((type) => {
      const info = STEP_TYPE_INFO[type];
      return info.label.toLowerCase().includes(search.toLowerCase());
    });
  };

  return (
    <div
      style={{
        width: '280px',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3 style={{ fontWeight: 600, fontSize: '14px' }}>Node Library</h3>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            className="form-input"
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>
      </div>

      {/* Station Selector */}
      {stations.length > 0 && (
        <div style={{ padding: '0 16px 12px' }}>
          <label className="form-label">Add to Station</label>
          <select
            className="form-select"
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
          >
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Categories */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 16px' }}>
        {Object.entries(NODE_CATEGORIES).map(([key, category]) => {
          const filteredTypes = filterNodes(category.types);
          if (filteredTypes.length === 0) return null;

          const isExpanded = expandedCategories.includes(key);

          return (
            <div key={key} style={{ marginBottom: '8px' }}>
              <button
                onClick={() => toggleCategory(key)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  borderRadius: '6px',
                }}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {category.label}
              </button>

              {isExpanded && (
                <div style={{ paddingLeft: '8px' }}>
                  {filteredTypes.map((type) => {
                    const info = STEP_TYPE_INFO[type];
                    return (
                      <button
                        key={type}
                        onClick={() => handleAddNode(type)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px 12px',
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          marginBottom: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = info.color;
                          e.currentTarget.style.background = 'var(--bg-tertiary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-color)';
                          e.currentTarget.style.background = 'var(--bg-primary)';
                        }}
                      >
                        <span
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            background: `${info.color}20`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px',
                          }}
                        >
                          {info.icon}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {info.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default NodeLibrary;
