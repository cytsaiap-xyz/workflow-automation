import { v4 as uuidv4 } from 'uuid';
import type { WorkflowDefinition, Step } from '../types/workflow';
import type { WorkflowDefinitionV2, DagNode, DagEdge } from '../types/dag';

function stepToNode(step: Step): DagNode {
  return {
    id: step.id,
    name: step.name,
    type: step.type,
    position: step.position || { x: 0, y: 0 },
    config: step.config || {},
    inputVars: step.inputVars,
    outputVars: step.outputVars,
    timeout: step.timeout,
    retryPolicy: step.retryPolicy,
  };
}

export function migrateToV2(def: WorkflowDefinition): WorkflowDefinitionV2 {
  const nodes: DagNode[] = [];
  const edges: DagEdge[] = [];

  let prevStationLastStepId: string | null = null;

  for (const station of def.stations) {
    if (!station.steps || station.steps.length === 0) continue;

    const explicitEdges = station.edges || [];
    for (const step of station.steps) {
      nodes.push(stepToNode(step));
    }
    if (explicitEdges.length > 0) {
      for (const e of explicitEdges) {
        edges.push({
          id: e.id || uuidv4(),
          source: e.source,
          target: e.target,
          sourcePort: e.sourceHandle,
        });
      }
    } else {
      for (let i = 1; i < station.steps.length; i++) {
        edges.push({
          id: uuidv4(),
          source: station.steps[i - 1].id,
          target: station.steps[i].id,
        });
      }
    }

    if (prevStationLastStepId) {
      edges.push({
        id: uuidv4(),
        source: prevStationLastStepId,
        target: station.steps[0].id,
      });
    }
    prevStationLastStepId = station.steps[station.steps.length - 1].id;
  }

  return {
    schemaVersion: 2,
    inputParameters: def.inputParameters,
    variables: def.variables,
    nodes,
    edges,
  };
}
