import { describe, it, expect } from 'vitest';
import { applyDiff } from '../services/diffApplier';
import type { WorkflowDefinition } from '../types/workflow';
import type { WorkflowDiff } from '../types/assistant';

const baseDef = (): WorkflowDefinition => ({
  stations: [
    { id: 's1', name: 'first', position: { x: 0, y: 0 }, steps: [
      { id: 'st1', name: 'step1', type: 'script-js', config: { code: '1' }, position: { x: 0, y: 0 } },
    ]},
  ],
});

describe('applyDiff', () => {
  it('adds a station', () => {
    const out = applyDiff(baseDef(), [{
      kind: 'add_station',
      station: { id: 's2', name: 'second', steps: [], position: { x: 0, y: 1 } },
    }]);
    expect(out.stations.length).toBe(2);
  });

  it('updates a step config', () => {
    const out = applyDiff(baseDef(), [{
      kind: 'update_step', stationId: 's1', stepId: 'st1',
      patch: { config: { code: '2' } },
    }]);
    expect(out.stations[0].steps[0].config.code).toBe('2');
  });

  it('removes a station', () => {
    const out = applyDiff(baseDef(), [{ kind: 'remove_station', stationId: 's1' }]);
    expect(out.stations.length).toBe(0);
  });

  it('replaces workflow stations', () => {
    const out = applyDiff(baseDef(), [{
      kind: 'replace_workflow',
      stations: [{ id: 'sx', name: 'x', steps: [], position: { x: 0, y: 0 } }],
    }]);
    expect(out.stations.length).toBe(1);
    expect(out.stations[0].id).toBe('sx');
  });

  it('throws on invalid diff target', () => {
    expect(() => applyDiff(baseDef(), [{ kind: 'remove_step', stationId: 'missing', stepId: 'x' }]))
      .toThrow(/station not found/i);
  });
});
