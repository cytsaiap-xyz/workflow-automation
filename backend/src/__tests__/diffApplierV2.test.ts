import { describe, it, expect } from 'vitest';
import { applyDiff } from '../services/diffApplier';

describe('applyDiff v2', () => {
  const base = (): any => ({
    schemaVersion: 2,
    nodes: [{ id: 'a', name: 'a', type: 'script-js', config: {}, position: { x: 0, y: 0 } }],
    edges: [],
  });

  it('adds a node and edge', () => {
    const out: any = applyDiff(base(), [
      { kind: 'add_node', node: { id: 'b', name: 'b', type: 'script-js', config: {}, position: { x: 1, y: 0 } } } as any,
      { kind: 'add_edge', edge: { id: 'e1', source: 'a', target: 'b' } } as any,
    ]);
    expect(out.nodes.length).toBe(2);
    expect(out.edges[0].source).toBe('a');
  });

  it('updates a node patch (config merge)', () => {
    const out: any = applyDiff(base(), [
      { kind: 'update_node', nodeId: 'a', patch: { config: { code: 'x' } } } as any,
    ]);
    expect(out.nodes[0].config.code).toBe('x');
  });

  it('removes a node and dangling edges', () => {
    const def: any = {
      schemaVersion: 2,
      nodes: [
        { id: 'a', name: 'a', type: 'script-js', config: {}, position: { x: 0, y: 0 } },
        { id: 'b', name: 'b', type: 'script-js', config: {}, position: { x: 1, y: 0 } },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
    };
    const out: any = applyDiff(def, [{ kind: 'remove_node', nodeId: 'b' } as any]);
    expect(out.nodes.length).toBe(1);
    expect(out.edges.length).toBe(0);
  });

  it('rejects v1 kinds against a v2 workflow', () => {
    expect(() => applyDiff(base(), [
      { kind: 'add_station', station: { id: 's', name: 'x', steps: [], position: { x: 0, y: 0 } } } as any,
    ])).toThrow(/v1.*v2|incompatible/i);
  });
});
