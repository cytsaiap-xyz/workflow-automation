import { useEffect } from 'react';
import { DagCanvas } from './DagCanvas';
import type { NodeStatus } from './DagCanvas';
import { useDagEditorStore } from '@/shared/stores/dagEditorStore';
import { isV2 } from '@/shared/types/workflow';
import type { Workflow, Execution } from '@/shared/types/workflow';

interface Props {
  workflow: Workflow;
  execution: Execution;
}

export function RunPanelV2({ workflow, execution }: Props) {
  const setGraph = useDagEditorStore((s) => s.setGraph);

  useEffect(() => {
    const def = workflow.definition;
    if (isV2(def)) {
      setGraph(def.nodes ?? [], def.edges ?? []);
    }
  }, [workflow, setGraph]);

  const statuses: Record<string, NodeStatus> = {};
  const stations = execution.result?.stations ?? [];
  for (const station of stations) {
    for (const step of station.steps ?? []) {
      statuses[step.stepId] = (step.status as NodeStatus) ?? 'pending';
    }
  }

  return (
    <div
      style={{
        height: '60vh',
        minHeight: 400,
        border: '1px solid var(--border-color, #334155)',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <DagCanvas statuses={statuses} readOnly />
    </div>
  );
}
