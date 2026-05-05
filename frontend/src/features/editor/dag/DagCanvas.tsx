import { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
  type Node,
  type Connection,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useDagEditorStore } from '@/shared/stores/dagEditorStore';
import type { DagNode } from '@/shared/types/workflow';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function DagCanvas() {
  const { nodes, edges, upsertEdge, upsertNode, selectNode, selectEdge } =
    useDagEditorStore();

  const rfNodes: Node[] = nodes.map((n) => ({
    id: n.id,
    position: n.position,
    data: { label: n.name, raw: n },
    type: 'default',
  }));

  const rfEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourcePort,
    targetHandle: e.targetPort,
    label: e.when ? `when: ${e.when}` : (e.targetPort ?? ''),
  }));

  const onConnect = useCallback(
    (c: Connection) => {
      const id = generateId();
      upsertEdge({
        id,
        source: c.source,
        target: c.target,
        sourcePort: c.sourceHandle ?? undefined,
        targetPort: c.targetHandle ?? undefined,
      });
    },
    [upsertEdge],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Handle position changes — write back to the dag store
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          const node = nodes.find((n) => n.id === c.id);
          if (node) {
            upsertNode({ ...(node as DagNode), position: c.position });
          }
        }
      }
      // For remove/select changes we only need to apply locally; store handles
      // node removal via removeNode which is called from config panels.
    },
    [nodes, upsertNode],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, n: Node) => {
      selectNode(n.id);
    },
    [selectNode],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, e: Edge) => {
      selectEdge(e.id);
    },
    [selectEdge],
  );

  // Allow deselecting by clicking on the pane
  const onPaneClick = useCallback(() => {
    selectNode(undefined);
    selectEdge(undefined);
  }, [selectNode, selectEdge]);

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
