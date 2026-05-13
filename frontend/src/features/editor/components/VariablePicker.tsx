import { useMemo } from 'react';
import type { Workflow, Step } from '../../../shared/types/workflow';
import { isV2 } from '../../../shared/types/workflow';
import Database from 'lucide-react/dist/esm/icons/database';

interface VariablePickerProps {
  workflow: Workflow;
  currentStepId: string;
  onSelect: (variablePath: string) => void;
}

export function VariablePicker({ workflow, currentStepId, onSelect }: VariablePickerProps) {
  const v2 = isV2(workflow.definition);

  // v1 references nodes by step name (`steps['name'].output`); v2 references
  // them by node id (`${nodeId.output}`), matching what the runV2 engine
  // exposes in the variables map.
  const stringPath = (step: Step) => (v2 ? `\${${step.id}.output}` : `\${steps['${step.name}'].output}`);
  const jsPath = (step: Step) => (v2 ? `${step.id}.output` : `steps['${step.name}'].output`);
  const fieldPath = (step: Step, field: string) =>
    v2 ? `${step.id}.output.${field}` : `steps['${step.name}'].output.${field}`;

  const availableSteps = useMemo(() => {
    const steps: Step[] = [];
    if (isV2(workflow.definition)) {
      // v2 DAG: list all nodes except the current one. Topological ordering would
      // be nicer, but we don't have a DAG walker here and showing every upstream
      // candidate is preferable to crashing.
      for (const node of workflow.definition.nodes ?? []) {
        if (node.id === currentStepId) continue;
        // DagNode and Step share the fields this picker reads (id, name, type,
        // outputVars), so we can render it through the same button list.
        steps.push(node as unknown as Step);
      }
      return steps;
    }

    let currentStepFound = false;
    for (const station of workflow.definition.stations ?? []) {
      if (currentStepFound) break;

      for (const step of station.steps) {
        if (step.id === currentStepId) {
          currentStepFound = true;
          break;
        }
        steps.push(step);
      }
    }
    return steps;
  }, [workflow, currentStepId]);

  if (availableSteps.length === 0) {
    return (
      <div className="p-3 text-xs text-muted italic border rounded bg-tertiary">
        No upstream variables available.
      </div>
    );
  }

  return (
    <div className="border rounded bg-secondary overflow-hidden">
      <div className="p-2 bg-tertiary border-b text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
        <Database size={12} />
        Available Variables
      </div>
      <div className="max-h-48 overflow-auto">
        {availableSteps.map((step) => (
          <div key={step.id} className="border-b last:border-0">
            <div className="p-2 py-1.5 bg-bg-primary/50 text-[11px] font-semibold flex items-center gap-1">
              <span className="opacity-70 dark:opacity-50">#</span> {step.name}
            </div>
            <div className="p-1 px-2 pb-2 flex flex-wrap gap-1">
              <button
                onClick={() => onSelect(jsPath(step))}
                className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors"
                title="Full output object (JS Object)"
              >
                output (JS)
              </button>
              <button
                onClick={() => onSelect(stringPath(step))}
                className="text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded hover:bg-purple-200 dark:hover:bg-purple-800/50 transition-colors"
                title="Interpolated string value"
              >
                output (String)
              </button>

              {/* Special helpers for HTTP requests */}
              {step.type === 'http-request' && (
                <>
                  <button
                    onClick={() => onSelect(fieldPath(step, 'data'))}
                    className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded hover:bg-green-200 dark:hover:bg-green-800/50 transition-colors"
                    title="Response Body"
                  >
                    .data
                  </button>
                  <button
                    onClick={() => onSelect(fieldPath(step, 'status'))}
                    className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    title="HTTP Status Code"
                  >
                    .status
                  </button>
                </>
              )}

              {step.outputVars?.map((v) => (
                <button
                  key={v.name}
                  onClick={() => onSelect(fieldPath(step, v.name))}
                  className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors"
                  title={v.description || v.name}
                >
                  .{v.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
