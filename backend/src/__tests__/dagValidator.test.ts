import { describe, it, expect } from 'vitest';
import { validateDag } from '../services/dagValidator';
import type { WorkflowDefinitionV2 } from '../types/dag';

const minimal = (nodes: any[], edges: any[]): WorkflowDefinitionV2 => ({
  schemaVersion: 2, nodes, edges,
});

describe('validateDag', () => {
  it('passes a linear DAG', () => {
    const v2 = minimal(
      [{ id: 'a', name: 'a', type: 'script-js', config: {}, position: { x: 0, y: 0 } },
       { id: 'b', name: 'b', type: 'script-js', config: {}, position: { x: 0, y: 0 } }],
      [{ id: 'e1', source: 'a', target: 'b' }]
    );
    expect(validateDag(v2).errors).toEqual([]);
  });

  it('detects cycles', () => {
    const v2 = minimal(
      [{ id: 'a', name: 'a', type: 'script-js', config: {}, position: { x: 0, y: 0 } },
       { id: 'b', name: 'b', type: 'script-js', config: {}, position: { x: 0, y: 0 } }],
      [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'a' }]
    );
    const result = validateDag(v2);
    expect(result.errors[0]).toMatch(/cycle/i);
  });

  it('detects orphan edges', () => {
    const v2 = minimal(
      [{ id: 'a', name: 'a', type: 'script-js', config: {}, position: { x: 0, y: 0 } }],
      [{ id: 'e1', source: 'a', target: 'missing' }]
    );
    expect(validateDag(v2).errors[0]).toMatch(/orphan/i);
  });

  it('detects bad errorBranch reference', () => {
    const v2 = minimal(
      [{ id: 'a', name: 'a', type: 'script-js', config: {}, position: { x: 0, y: 0 },
         errorPolicy: { onError: 'continue', errorBranch: 'missing' } }],
      []
    );
    expect(validateDag(v2).errors[0]).toMatch(/errorBranch/);
  });
});
