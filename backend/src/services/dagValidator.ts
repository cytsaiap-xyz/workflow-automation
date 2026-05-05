import { WorkflowDefinitionV2 } from '../types/dag';

export interface DagValidationResult {
  errors: string[];
  warnings: string[];
}

export function validateDag(def: WorkflowDefinitionV2): DagValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const nodeIds = new Set(def.nodes.map(n => n.id));

  for (const e of def.edges) {
    if (!nodeIds.has(e.source)) errors.push(`orphan edge: source ${e.source} not in nodes`);
    if (!nodeIds.has(e.target)) errors.push(`orphan edge: target ${e.target} not in nodes`);
  }

  for (const n of def.nodes) {
    const eb = n.errorPolicy?.errorBranch;
    if (eb && !nodeIds.has(eb)) errors.push(`errorBranch on node ${n.id} points to missing node ${eb}`);
  }

  const incomingByTarget: Record<string, string[]> = {};
  for (const e of def.edges) {
    (incomingByTarget[e.target] ||= []).push(e.mergeMode || 'all');
  }
  for (const target of Object.keys(incomingByTarget)) {
    const modes = new Set(incomingByTarget[target]);
    if (modes.size > 1) errors.push(`node ${target} has mixed mergeMode (must be all 'all' or all 'any')`);
  }

  // Kahn's cycle detection.
  const indeg: Record<string, number> = {};
  for (const id of nodeIds) indeg[id] = 0;
  for (const e of def.edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) indeg[e.target]++;
  }
  const queue = Object.keys(indeg).filter(id => indeg[id] === 0);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited++;
    for (const e of def.edges) {
      if (e.source !== id) continue;
      if (--indeg[e.target] === 0) queue.push(e.target);
    }
  }
  if (visited !== nodeIds.size) errors.push('cycle detected in DAG');

  // Unreachable nodes.
  const reachable = new Set<string>();
  const sources = def.nodes.filter(n => !def.edges.some(e => e.target === n.id)).map(n => n.id);
  const stack = [...sources];
  while (stack.length) {
    const cur = stack.pop()!;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    for (const e of def.edges) if (e.source === cur) stack.push(e.target);
  }
  for (const id of nodeIds) if (!reachable.has(id)) warnings.push(`unreachable node: ${id}`);

  return { errors, warnings };
}
