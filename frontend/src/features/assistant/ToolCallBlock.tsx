import { useState } from 'react';

interface Props {
  name: string;
  args: unknown;
  resultSummary?: string;
}

export function ToolCallBlock({ name, args, resultSummary }: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="tool-call"
      style={{
        marginTop: '8px',
        padding: '6px 8px',
        background: 'var(--bg-tertiary)',
        borderRadius: '4px',
        fontSize: '0.9em',
        border: '1px solid var(--border-color)',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'inherit',
          color: 'var(--text-secondary)',
        }}
      >
        {expanded ? '▾' : '▸'} {resultSummary ? name : `${name}…`}
      </button>
      {expanded && (
        <pre
          style={{
            marginTop: '4px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '0.85em',
            color: 'var(--text-secondary)',
          }}
        >
          {`args: ${JSON.stringify(args, null, 2)}\nresult: ${resultSummary || 'pending…'}`}
        </pre>
      )}
    </div>
  );
}
