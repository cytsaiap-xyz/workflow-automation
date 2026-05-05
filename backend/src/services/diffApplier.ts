import { WorkflowDefinition } from '../types/workflow';
import { WorkflowDiff } from '../types/assistant';

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function findStation(def: WorkflowDefinition, id: string) {
  const s = def.stations.find(s => s.id === id);
  if (!s) throw new Error(`Station not found: ${id}`);
  return s;
}

export function applyDiff(def: WorkflowDefinition, diffs: WorkflowDiff[]): WorkflowDefinition {
  const out = clone(def);
  // Ensure stations array exists (v2 definitions may not have it; treat as empty for v1 diff ops)
  if (!Array.isArray(out.stations)) {
    (out as any).stations = [];
  }
  for (const d of diffs) {
    switch (d.kind) {
      case 'add_station': {
        const idx = d.position ?? out.stations.length;
        out.stations.splice(idx, 0, d.station as any);
        break;
      }
      case 'remove_station': {
        const idx = out.stations.findIndex(s => s.id === d.stationId);
        if (idx === -1) throw new Error(`Station not found: ${d.stationId}`);
        out.stations.splice(idx, 1);
        break;
      }
      case 'update_station': {
        const s = findStation(out, d.stationId);
        Object.assign(s, d.patch);
        break;
      }
      case 'add_step': {
        const s = findStation(out, d.stationId);
        const idx = d.position ?? s.steps.length;
        s.steps.splice(idx, 0, d.step as any);
        break;
      }
      case 'remove_step': {
        const s = findStation(out, d.stationId);
        const idx = s.steps.findIndex(st => st.id === d.stepId);
        if (idx === -1) throw new Error(`Step not found: ${d.stepId}`);
        s.steps.splice(idx, 1);
        break;
      }
      case 'update_step': {
        const s = findStation(out, d.stationId);
        const st = s.steps.find(x => x.id === d.stepId);
        if (!st) throw new Error(`Step not found: ${d.stepId}`);
        if (d.patch.config) {
          st.config = { ...st.config, ...d.patch.config };
        }
        for (const k of Object.keys(d.patch)) {
          if (k !== 'config') (st as any)[k] = (d.patch as any)[k];
        }
        break;
      }
      case 'replace_workflow': {
        out.stations = clone(d.stations);
        break;
      }
      default: {
        throw new Error(`Unknown diff kind: ${(d as any).kind}`);
      }
    }
  }
  return out;
}
