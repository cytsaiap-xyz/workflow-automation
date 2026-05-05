import { WorkflowDefinitionV2, DagNode, DagEdge } from '../types/dag';
import { evaluateWhen } from './edgeWhen';
import { runWithPolicy } from './errorPolicy';
import { fanOutInputs, collectFanOutOutputs } from './fanOut';

export interface RunDagOptions {
  executeNode: (node: DagNode, input: Record<string, any>) => Promise<any>;
  maxConcurrency?: number;
  initialContext?: Record<string, any>;
  onNodeStatus?: (nodeId: string, status: NodeStatus, info?: any) => void;
}

export type NodeStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'skipped';

export interface RunDagResult {
  status: 'completed' | 'failed';
  nodeOutputs: Record<string, any>;
  failures: Record<string, string>;
}

export async function runDag(def: WorkflowDefinitionV2, opts: RunDagOptions): Promise<RunDagResult> {
  const cap = opts.maxConcurrency ?? Number(process.env.MAX_CONCURRENT_NODES || 4);

  // Build adjacency maps.
  const nodesById: Record<string, DagNode> = Object.fromEntries(def.nodes.map(n => [n.id, n]));
  const incoming: Record<string, DagEdge[]> = {};
  const outgoing: Record<string, DagEdge[]> = {};
  for (const n of def.nodes) { incoming[n.id] = []; outgoing[n.id] = []; }
  for (const e of def.edges) {
    incoming[e.target]?.push(e);
    outgoing[e.source]?.push(e);
  }

  // Execution state.
  const status: Record<string, NodeStatus> = {};
  for (const n of def.nodes) status[n.id] = 'pending';
  const outputs: Record<string, any> = {};
  const failures: Record<string, string> = {};
  const ready = new Set<string>();
  const running = new Set<string>();

  // Track which incoming edges have been "fired" (source completed with truthy when).
  const firedInbound: Record<string, Set<string>> = {};
  for (const n of def.nodes) firedInbound[n.id] = new Set();

  // Seed roots (no incoming edges).
  for (const n of def.nodes) {
    if (incoming[n.id].length === 0) {
      ready.add(n.id);
      status[n.id] = 'ready';
    }
  }

  function buildNodeInput(nodeId: string): Record<string, any> {
    const merged: Record<string, any> = { ...(opts.initialContext || {}) };
    const inEdges = incoming[nodeId];
    for (const e of inEdges) {
      if (!firedInbound[nodeId].has(e.id)) continue;
      const out = outputs[e.source];
      if (e.targetPort) {
        merged[e.targetPort] = out;
      } else {
        Object.assign(merged, out || {});
      }
    }
    return merged;
  }

  /**
   * Check if a target node's incoming edges are all resolved and decide whether
   * to mark it ready or skipped.
   *
   * An edge is considered "resolved without firing" when:
   *   - The source was skipped, OR
   *   - The source completed but the when-expression evaluated falsy, OR
   *   - The source failed.
   */
  function tryUnlockTarget(target: string): void {
    if (status[target] !== 'pending') return;
    const inEdges = incoming[target];
    if (inEdges.length === 0) return;

    const mode = inEdges[0].mergeMode || 'all';

    if (mode === 'all') {
      // Every incoming edge must be either fired or definitively resolved (skipped/failed/falsy-when).
      const allResolved = inEdges.every(e => {
        if (firedInbound[target].has(e.id)) return true;
        const src = e.source;
        if (status[src] === 'skipped') return true;
        if (status[src] === 'failed') return true;
        if (status[src] === 'completed') {
          // Edge is resolved-without-firing if its when-expression is falsy.
          const whenFalsy = !evaluateWhen(
            e.when,
            { output: outputs[src], ...(typeof outputs[src] === 'object' && outputs[src] !== null ? outputs[src] : {}) }
          );
          return whenFalsy;
        }
        return false;
      });

      const anyFired = inEdges.some(e => firedInbound[target].has(e.id));

      if (allResolved && anyFired) {
        // At least one edge fired — the node can run.
        status[target] = 'ready';
        ready.add(target);
      } else if (allResolved && !anyFired) {
        // No edge fired — skip this node and propagate.
        status[target] = 'skipped';
        opts.onNodeStatus?.(target, 'skipped');
        for (const oe of outgoing[target]) tryUnlockTarget(oe.target);
      }
      // Otherwise not all resolved yet — wait for more sources to complete.
    } else {
      // mode === 'any': the first fired edge is enough.
      const anyFired = inEdges.some(e => firedInbound[target].has(e.id));
      if (anyFired) {
        status[target] = 'ready';
        ready.add(target);
      }
    }
  }

  let stoppedByFailure = false;

  // Notification channel: each completed node posts to this callback.
  // The main loop waits on a promise that resolves when any node finishes.
  let notifyDone!: () => void;
  function makeBarrier(): Promise<void> {
    return new Promise<void>(resolve => { notifyDone = resolve; });
  }
  let barrier = makeBarrier();

  async function executeOne(nodeId: string): Promise<void> {
    const node = nodesById[nodeId];
    status[nodeId] = 'running';
    running.add(nodeId);
    opts.onNodeStatus?.(nodeId, 'running');
    const input = buildNodeInput(nodeId);

    let runResult: any;
    try {
      if (node.fanOut?.enabled) {
        // Fan-out: run executeNode for each element in the input array, bounded by cap.
        const fanInputs = fanOutInputs(input, node.fanOut.inputArrayPath);
        const results: any[] = new Array(fanInputs.length);
        let nextIdx = 0;

        const startWorker = async (): Promise<void> => {
          while (nextIdx < fanInputs.length) {
            const idx = nextIdx++;
            results[idx] = await opts.executeNode(node, fanInputs[idx]);
          }
        };

        const workerCount = Math.min(cap, fanInputs.length);
        const workers: Promise<void>[] = [];
        for (let w = 0; w < workerCount; w++) workers.push(startWorker());
        await Promise.all(workers);

        runResult = collectFanOutOutputs(results);
      } else {
        const outcome = await runWithPolicy(() => opts.executeNode(node, input), node.errorPolicy);

        if (outcome.kind === 'success') {
          runResult = outcome.value;
        } else if (outcome.kind === 'failure-continue') {
          // Node failed but policy says continue (possibly via error branch).
          status[nodeId] = 'failed';
          failures[nodeId] = outcome.error.message;
          outputs[nodeId] = { error: outcome.error.message };

          if (outcome.errorBranch) {
            // Fire the designated error-branch edge if it exists.
            const errEdge = outgoing[nodeId].find(e => e.target === outcome.errorBranch);
            if (errEdge) firedInbound[errEdge.target].add(errEdge.id);
          }

          // Unlock downstream nodes — they may see a failed source.
          for (const oe of outgoing[nodeId]) tryUnlockTarget(oe.target);
          opts.onNodeStatus?.(nodeId, 'failed', { error: outcome.error.message });
          running.delete(nodeId);
          notifyDone();
          barrier = makeBarrier();
          return;
        } else {
          // failure-stop: halt the entire DAG.
          status[nodeId] = 'failed';
          failures[nodeId] = outcome.error.message;
          opts.onNodeStatus?.(nodeId, 'failed', { error: outcome.error.message });
          running.delete(nodeId);
          stoppedByFailure = true;
          notifyDone();
          barrier = makeBarrier();
          return;
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      status[nodeId] = 'failed';
      failures[nodeId] = msg;
      opts.onNodeStatus?.(nodeId, 'failed', { error: msg });
      running.delete(nodeId);
      stoppedByFailure = true;
      notifyDone();
      barrier = makeBarrier();
      return;
    }

    outputs[nodeId] = runResult;
    status[nodeId] = 'completed';
    running.delete(nodeId);
    opts.onNodeStatus?.(nodeId, 'completed');

    // Evaluate outgoing edges and fire those with a truthy when-expression.
    for (const e of outgoing[nodeId]) {
      const ctx = {
        output: runResult,
        ...(typeof runResult === 'object' && runResult !== null ? runResult : {}),
      };
      const truthy = evaluateWhen(e.when, ctx);
      if (truthy) firedInbound[e.target].add(e.id);
      tryUnlockTarget(e.target);
    }

    notifyDone();
    barrier = makeBarrier();
  }

  // Drive the event loop with bounded parallelism.
  const inflight = new Set<Promise<void>>();

  while (!stoppedByFailure && (ready.size > 0 || running.size > 0)) {
    // Snapshot current barrier before dispatching so we don't miss a notification.
    const currentBarrier = barrier;

    // Dispatch as many ready nodes as concurrency allows.
    while (!stoppedByFailure && ready.size > 0 && running.size < cap) {
      const next: string = ready.values().next().value as string;
      ready.delete(next);
      const p = executeOne(next);
      inflight.add(p);
      p.finally(() => inflight.delete(p));
    }

    // If nodes are still running, wait for at least one to finish.
    if (running.size > 0) {
      await currentBarrier;
    } else if (ready.size === 0) {
      // Nothing running, nothing ready — all done or deadlock.
      break;
    }
  }

  // Drain any remaining in-flight promises.
  await Promise.all([...inflight]);

  return {
    status: stoppedByFailure ? 'failed' : 'completed',
    nodeOutputs: outputs,
    failures,
  };
}
