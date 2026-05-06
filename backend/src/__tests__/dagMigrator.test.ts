import { describe, it, expect } from 'vitest';
import { migrateToV2 } from '../services/dagMigrator';
import type { WorkflowDefinition } from '../types/workflow';

describe('migrateToV2', () => {
  it('flattens stations into a linear DAG', () => {
    const v1: WorkflowDefinition = {
      stations: [
        { id: 's1', name: 'a', position: { x: 0, y: 0 }, steps: [
          { id: 'st1', name: 's1-1', type: 'script-js', config: { code: '1' }, position: { x: 0, y: 0 } },
          { id: 'st2', name: 's1-2', type: 'script-js', config: { code: '2' }, position: { x: 0, y: 0 } },
        ]},
        { id: 's2', name: 'b', position: { x: 0, y: 1 }, steps: [
          { id: 'st3', name: 's2-1', type: 'script-js', config: { code: '3' }, position: { x: 0, y: 0 } },
        ]},
      ],
    };
    const v2 = migrateToV2(v1);
    expect(v2.schemaVersion).toBe(2);
    expect(v2.nodes.map(n => n.id)).toEqual(['st1', 'st2', 'st3']);
    expect(v2.edges.map(e => `${e.source}->${e.target}`)).toEqual(['st1->st2', 'st2->st3']);
  });

  it('handles if-else with sourceHandle', () => {
    const v1: WorkflowDefinition = {
      stations: [
        {
          id: 's1', name: 'x', position: { x: 0, y: 0 },
          steps: [
            { id: 'cond', name: 'cond', type: 'if-else', config: { condition: 'true' }, position: { x: 0, y: 0 } },
            { id: 'a', name: 'a', type: 'script-js', config: { code: '1' }, position: { x: 0, y: 0 } },
          ],
          edges: [
            { id: 'e1', source: 'cond', target: 'a', sourceHandle: 'true' },
          ],
        },
      ],
    };
    const v2 = migrateToV2(v1);
    const edge = v2.edges.find(e => e.source === 'cond' && e.target === 'a');
    expect(edge?.sourcePort).toBe('true');
  });

  it('preserves inputParameters', () => {
    const v1: WorkflowDefinition = {
      inputParameters: [{ name: 'file', type: 'file' }],
      stations: [{ id: 's', name: 'x', position: { x: 0, y: 0 }, steps: [] }],
    };
    const v2 = migrateToV2(v1);
    expect(v2.inputParameters?.[0].name).toBe('file');
  });
});
