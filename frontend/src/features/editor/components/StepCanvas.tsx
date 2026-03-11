import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  MarkerType,
  NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import StepNode from '../nodes/StepNode';
import type { Station, Step, StepType, Execution } from '../../../shared/types/workflow';

const nodeTypes: NodeTypes = {
  step: StepNode,
};

interface StepCanvasProps {
  station: Station;
  execution?: Execution | null;
  isSimulating?: boolean;
  selectedStepId?: string | null;
  onStepClick: (stepId: string) => void;
  onStepUpdate?: (stepId: string, data: Partial<Step>) => void;
  onStepConnect?: (sourceId: string, targetId: string, sourceHandle?: string) => void;
  onAddStep?: (type: StepType, name: string) => void;
}

export default function StepCanvas({
  station,
  execution,
  isSimulating = false,
  selectedStepId,
  onStepClick,
  onStepUpdate,
  onStepConnect,
}: StepCanvasProps) {
  // Convert station steps to React Flow nodes
  const initialNodes = useMemo(() => {
    return station.steps.map((step, index) => ({
      id: step.id,
      type: 'step',
      position: step.position || { x: 100, y: index * 120 + 50 },
      data: {
        step,
        status: getStepStatus(step.id, station.id, execution),
        isSelected: selectedStepId === step.id,
        hasInspectableData: hasStepData(step.id, station.id, execution),
      },
    }));
  }, [station.steps, execution, selectedStepId, station.id]);

  // Create edges: use persisted station.edges if available, else auto-connect by order
  const initialEdges = useMemo(() => {
    if (station.edges && station.edges.length > 0) {
      const routerColors = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
      return station.edges.map((edge) => {
        const isTrue = edge.sourceHandle === 'true';
        const isFalse = edge.sourceHandle === 'false';
        // Check if this edge comes from an ai-router step
        const sourceStep = station.steps.find(s => s.id === edge.source);
        const isRouter = sourceStep?.type === 'ai-router';
        let color = isTrue ? '#22c55e' : isFalse ? '#ef4444' : '#22c55e';
        let label: string | undefined = isTrue ? 'T' : isFalse ? 'F' : undefined;
        if (isRouter && edge.sourceHandle && sourceStep?.config.aiRoutes) {
          const routeIdx = sourceStep.config.aiRoutes.findIndex(r => r.branchId === edge.sourceHandle);
          if (routeIdx >= 0) {
            color = routerColors[routeIdx % routerColors.length];
            label = edge.sourceHandle;
          }
        }
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          type: 'smoothstep',
          animated: isSimulating,
          style: { stroke: color, strokeWidth: 2 },
          label,
          labelStyle: { fill: color, fontWeight: 700, fontSize: 12 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 16,
            height: 16,
          },
        } as Edge;
      });
    }

    const edges: Edge[] = [];
    const steps = station.steps;
    for (let i = 1; i < steps.length; i++) {
      const prevStep = steps[i - 1];
      const currentStep = steps[i];
      edges.push({
        id: `step-edge-${prevStep.id}-${currentStep.id}`,
        source: prevStep.id,
        target: currentStep.id,
        type: 'smoothstep',
        animated: isSimulating,
        style: { stroke: '#22c55e', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#22c55e',
          width: 16,
          height: 16,
        },
      });
    }
    return edges;
  }, [station.steps, station.edges, isSimulating]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when station changes
  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Handle manual connection
  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        const isTrue = params.sourceHandle === 'true';
        const isFalse = params.sourceHandle === 'false';
        const sourceStep = station.steps.find(s => s.id === params.source);
        const isRouter = sourceStep?.type === 'ai-router';
        const routerColors = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
        let color = isTrue ? '#22c55e' : isFalse ? '#ef4444' : '#22c55e';
        let label: string | undefined = isTrue ? 'T' : isFalse ? 'F' : undefined;
        if (isRouter && params.sourceHandle && sourceStep?.config.aiRoutes) {
          const routeIdx = sourceStep.config.aiRoutes.findIndex(r => r.branchId === params.sourceHandle);
          if (routeIdx >= 0) {
            color = routerColors[routeIdx % routerColors.length];
            label = params.sourceHandle;
          }
        }

        setEdges((eds) => addEdge({
          ...params,
          type: 'smoothstep',
          animated: isSimulating,
          style: { stroke: color, strokeWidth: 2 },
          label,
          labelStyle: { fill: color, fontWeight: 700, fontSize: 12 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 16,
            height: 16,
          },
        }, eds));

        onStepConnect?.(params.source, params.target, params.sourceHandle ?? undefined);
      }
    },
    [setEdges, isSimulating, onStepConnect]
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onStepClick(node.id);
    },
    [onStepClick]
  );

  // Handle node position change
  const handleNodesChange = useCallback(
    (changes: any[]) => {
      onNodesChange(changes);
      
      // Update step positions in workflow store
      changes.forEach((change: any) => {
        if (change.type === 'position' && change.position && onStepUpdate) {
          onStepUpdate(change.id, { position: change.position });
        }
      });
    },
    [onNodesChange, onStepUpdate]
  );

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        connectionLineStyle={{ stroke: '#22c55e', strokeWidth: 2 }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: '#22c55e', strokeWidth: 2 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />

        {/* Empty state */}
        {station.steps.length === 0 && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            padding: '2rem',
            background: 'var(--bg-secondary)',
            borderRadius: '16px',
            border: '2px dashed var(--border-color)',
          }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
              No steps in this stage yet.
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Use the Node Library to add steps.
            </p>
          </div>
        )}
      </ReactFlow>
    </div>
  );
}

// Helper function to get step execution status
function getStepStatus(stepId: string, stationId: string, execution?: Execution | null): string | undefined {
  if (!execution?.result) return undefined;

  const stationResult = execution.result.stations.find(s => s.stationId === stationId);
  if (!stationResult) return undefined;

  const stepResult = stationResult.steps.find(s => s.stepId === stepId);
  return stepResult?.status;
}

function hasStepData(stepId: string, stationId: string, execution?: Execution | null): boolean {
  if (!execution?.result) return false;

  const stationResult = execution.result.stations.find(s => s.stationId === stationId);
  if (!stationResult) return false;

  const stepResult = stationResult.steps.find(s => s.stepId === stepId);
  if (!stepResult) return false;

  return !!(stepResult.input && Object.keys(stepResult.input).length > 0) ||
         !!(stepResult.output && Object.keys(stepResult.output).length > 0);
}
