import { WorkflowDefinition } from '../types/workflow';
import { WorkflowDiff } from '../types/assistant';
import { isV2 } from '../types/dag';

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function findStation(def: WorkflowDefinition, id: string) {
  const s = def.stations.find(s => s.id === id);
  if (!s) throw new Error(`Station not found: ${id}`);
  return s;
}

export function applyDiff(def: any, diffs: WorkflowDiff[]): any {
  const out = clone(def);
  const v2 = isV2(out);
  for (const d of diffs) {
    if (v2) {
      applyV2Diff(out, d);
    } else {
      applyV1Diff(out as WorkflowDefinition, d);
    }
  }
  return out;
}

function applyV2Diff(out: any, d: WorkflowDiff): void {
  switch (d.kind) {
    case 'add_node': {
      out.nodes ??= [];
      out.nodes.push(d.node);
      return;
    }
    case 'remove_node': {
      const id = d.nodeId;
      out.nodes = (out.nodes || []).filter((n: any) => n.id !== id);
      out.edges = (out.edges || []).filter((e: any) => e.source !== id && e.target !== id);
      return;
    }
    case 'update_node': {
      const { nodeId, patch } = d;
      const n = (out.nodes || []).find((x: any) => x.id === nodeId);
      if (!n) throw new Error(`Node not found: ${nodeId}`);
      if (patch.config) n.config = { ...n.config, ...patch.config };
      for (const k of Object.keys(patch)) {
        if (k !== 'config') (n as any)[k] = (patch as any)[k];
      }
      return;
    }
    case 'add_edge': {
      out.edges ??= [];
      out.edges.push(d.edge);
      return;
    }
    case 'remove_edge': {
      const id = d.edgeId;
      out.edges = (out.edges || []).filter((e: any) => e.id !== id);
      return;
    }
    case 'update_edge': {
      const { edgeId, patch } = d;
      const e = (out.edges || []).find((x: any) => x.id === edgeId);
      if (!e) throw new Error(`Edge not found: ${edgeId}`);
      Object.assign(e, patch);
      return;
    }
    case 'replace_workflow_v2': {
      out.nodes = clone(d.nodes);
      out.edges = clone(d.edges);
      return;
    }
    case 'add_station':
    case 'remove_station':
    case 'update_station':
    case 'add_step':
    case 'remove_step':
    case 'update_step':
    case 'replace_workflow':
      throw new Error(`Diff kind "${d.kind}" is v1; cannot apply to a v2 workflow (incompatible)`);
    default:
      throw new Error(`Unknown diff kind: ${(d as any).kind}`);
  }
}

function applyV1Diff(out: WorkflowDefinition, d: WorkflowDiff): void {
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
    case 'add_node':
    case 'remove_node':
    case 'update_node':
    case 'add_edge':
    case 'remove_edge':
    case 'update_edge':
    case 'replace_workflow_v2':
      throw new Error(`Diff kind "${d.kind}" is v2; cannot apply to a v1 workflow (incompatible)`);
    default: {
      throw new Error(`Unknown diff kind: ${(d as any).kind}`);
    }
  }
}
