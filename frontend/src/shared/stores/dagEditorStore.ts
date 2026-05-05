import { create } from 'zustand';
import type { DagNode, DagEdge } from '../types/workflow';

interface DagState {
  nodes: DagNode[];
  edges: DagEdge[];
  selectedNodeId?: string;
  selectedEdgeId?: string;
  setGraph: (nodes: DagNode[], edges: DagEdge[]) => void;
  upsertNode: (n: DagNode) => void;
  upsertEdge: (e: DagEdge) => void;
  removeNode: (id: string) => void;
  removeEdge: (id: string) => void;
  selectNode: (id?: string) => void;
  selectEdge: (id?: string) => void;
}

export const useDagEditorStore = create<DagState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: undefined,
  selectedEdgeId: undefined,

  setGraph: (nodes, edges) =>
    set({ nodes, edges, selectedNodeId: undefined, selectedEdgeId: undefined }),

  upsertNode: (n) =>
    set({ nodes: [...get().nodes.filter((x) => x.id !== n.id), n] }),

  upsertEdge: (e) =>
    set({ edges: [...get().edges.filter((x) => x.id !== e.id), e] }),

  removeNode: (id) =>
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
    }),

  removeEdge: (id) =>
    set({ edges: get().edges.filter((e) => e.id !== id) }),

  selectNode: (id) =>
    set({ selectedNodeId: id, selectedEdgeId: undefined }),

  selectEdge: (id) =>
    set({ selectedEdgeId: id, selectedNodeId: undefined }),
}));
