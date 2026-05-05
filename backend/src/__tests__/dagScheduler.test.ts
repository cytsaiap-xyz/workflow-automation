import { describe, it, expect } from 'vitest';
import { runDag } from '../services/dagScheduler';
import type { WorkflowDefinitionV2, DagNode } from '../types/dag';

function n(id: string): DagNode {
  return { id, name: id, type: 'script-js', config: { code: '1' }, position: { x: 0, y: 0 } };
}

describe('runDag', () => {
  it('runs a linear graph in order', async () => {
    const order: string[] = [];
    const def: WorkflowDefinitionV2 = {
      schemaVersion: 2,
      nodes: [n('a'), n('b'), n('c')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
      ],
    };
    await runDag(def, {
      executeNode: async (node) => { order.push(node.id); return { id: node.id }; },
      maxConcurrency: 4,
      initialContext: {},
    });
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('runs independent branches in parallel', async () => {
    let inFlight = 0;
    let peak = 0;
    const def: WorkflowDefinitionV2 = {
      schemaVersion: 2,
      nodes: [n('a'), n('b1'), n('b2'), n('c')],
      edges: [
        { id: 'e1', source: 'a', target: 'b1' },
        { id: 'e2', source: 'a', target: 'b2' },
        { id: 'e3', source: 'b1', target: 'c' },
        { id: 'e4', source: 'b2', target: 'c' },
      ],
    };
    await runDag(def, {
      executeNode: async () => {
        inFlight++; peak = Math.max(peak, inFlight);
        await new Promise(r => setTimeout(r, 30));
        inFlight--;
        return {};
      },
      maxConcurrency: 4,
      initialContext: {},
    });
    expect(peak).toBeGreaterThanOrEqual(2);
  });

  it('respects edge.when (skips downstream when falsy)', async () => {
    const ran: string[] = [];
    const def: WorkflowDefinitionV2 = {
      schemaVersion: 2,
      nodes: [n('a'), n('b')],
      edges: [{ id: 'e1', source: 'a', target: 'b', when: '${output.continue}' }],
    };
    await runDag(def, {
      executeNode: async (node) => { ran.push(node.id); return { continue: false }; },
      maxConcurrency: 4,
      initialContext: {},
    });
    expect(ran).toEqual(['a']);
  });

  it('honors mergeMode=all by waiting for both branches', async () => {
    const ran: string[] = [];
    const def: WorkflowDefinitionV2 = {
      schemaVersion: 2,
      nodes: [n('a'), n('b'), n('c')],
      edges: [
        { id: 'e1', source: 'a', target: 'c', mergeMode: 'all', targetPort: 'a' },
        { id: 'e2', source: 'b', target: 'c', mergeMode: 'all', targetPort: 'b' },
      ],
    };
    await runDag(def, {
      executeNode: async (node) => { ran.push(node.id); return { val: node.id }; },
      maxConcurrency: 4,
      initialContext: {},
    });
    expect(ran[ran.length - 1]).toBe('c');
  });
});
