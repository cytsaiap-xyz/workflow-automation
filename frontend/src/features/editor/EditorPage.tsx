import { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '@xyflow/react/dist/style.css';

import { useWorkflowStore } from './stores/workflowStore';
import { useInput } from '../../shared/components/InputDialog';
import { useConfirm } from '../../shared/components/ConfirmDialog';
import StageCanvas from './components/StageCanvas';
import StepCanvas from './components/StepCanvas';
import EditorBreadcrumb from './components/EditorBreadcrumb';
import NodeLibrary from './components/NodeLibrary';
import NodeConfigPanel from './components/NodeConfigPanel';
import StationConfigPanel from './components/StationConfigPanel';
import SimulationPanel from './components/SimulationPanel';
import VersionHistoryPanel from './components/VersionHistoryPanel';
import ExecuteDialog from './components/ExecuteDialog';
import { RunWithInputDialog } from './RunWithInputDialog';
import { AssistantChatPanel } from '@/features/assistant/AssistantChatPanel';
import { toast } from '../../shared/stores/toastStore';
import type { StepType, Execution } from '../../shared/types/workflow';
import InputParametersEditor from './components/InputParametersEditor';
import {
  ArrowLeft,
  Save,
  Play,
  Plus,
  Layers,
  Clock,
  Settings
} from 'lucide-react';

// Editor view state
type EditorView = 
  | { type: 'stage-view' }
  | { type: 'step-view'; stageId: string };

function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentWorkflow,
    fetchWorkflow,
    saveWorkflow,
    setCurrentWorkflow,
    addStation,
    addStep,
    updateStep,
    deleteStep,
    selectStep,
    selectedStepId,
    selectedStationId,
    selectStation,
    updateStation,
    deleteStation,
    connectSteps,
    simulateWorkflow,
    executeWorkflow,
    isSimulating,
    currentExecution,
    executionLogs,
    isLoading,
    updateWorkflow,
  } = useWorkflowStore();

  // Input dialog hook
  const { prompt: showInputDialog } = useInput();
  const { confirm } = useConfirm();

  // View state
  const [editorView, setEditorView] = useState<EditorView>({ type: 'stage-view' });
  const [showLibrary, setShowLibrary] = useState(true);
  const [showSimulation, setShowSimulation] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showExecuteDialog, setShowExecuteDialog] = useState<'execute' | 'simulate' | null>(null);
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [showInputParams, setShowInputParams] = useState(false);
  
  // Track unsaved changes
  const originalWorkflowRef = useRef<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load workflow
  useEffect(() => {
    if (id) {
      fetchWorkflow(id);
    } else {
      setCurrentWorkflow(null);
    }
  }, [id, fetchWorkflow, setCurrentWorkflow]);

  // Store original workflow for change detection
  useEffect(() => {
    if (currentWorkflow && !originalWorkflowRef.current) {
      originalWorkflowRef.current = JSON.stringify(currentWorkflow.definition);
    }
  }, [currentWorkflow]);

  // Detect unsaved changes
  useEffect(() => {
    if (currentWorkflow && originalWorkflowRef.current) {
      const currentDef = JSON.stringify(currentWorkflow.definition);
      setHasUnsavedChanges(currentDef !== originalWorkflowRef.current);
    }
  }, [currentWorkflow]);

  // Browser beforeunload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Reset view when workflow changes
  useEffect(() => {
    setEditorView({ type: 'stage-view' });
    selectStep(null);
    originalWorkflowRef.current = null; // Reset original on new workflow
    setHasUnsavedChanges(false);
  }, [id]);

  // Get current stage for Step View
  const currentStage = useMemo(() => {
    if (editorView.type !== 'step-view') return null;
    return currentWorkflow?.definition.stations.find(s => s.id === editorView.stageId) || null;
  }, [editorView, currentWorkflow]);

  // Get selected step
  const selectedStep = useMemo(() => {
    if (!selectedStepId || !currentWorkflow) return null;
    return currentWorkflow.definition.stations
      .flatMap(s => s.steps)
      .find(s => s.id === selectedStepId) || null;
  }, [selectedStepId, currentWorkflow]);

  // Get selected station
  const selectedStation = useMemo(() => {
    if (!selectedStationId || !currentWorkflow) return null;
    return currentWorkflow.definition.stations.find(s => s.id === selectedStationId) || null;
  }, [selectedStationId, currentWorkflow]);

  // Breadcrumb items
  const breadcrumbItems = useMemo(() => {
    const items = [
      {
        id: 'workflow',
        label: currentWorkflow?.name || 'Workflow',
        onClick: editorView.type === 'step-view' 
          ? () => {
              setEditorView({ type: 'stage-view' });
              selectStep(null);
            }
          : undefined,
      },
    ];

    if (editorView.type === 'step-view' && currentStage) {
      items.push({
        id: 'stage',
        label: currentStage.name,
        onClick: undefined,
      });
    }

    return items;
  }, [currentWorkflow, editorView, currentStage]);

  // Handlers
  const handleStageDoubleClick = useCallback((stageId: string) => {
    setEditorView({ type: 'step-view', stageId });
    selectStep(null);
  }, [selectStep]);

  const handleBackToStageView = useCallback(() => {
    setEditorView({ type: 'stage-view' });
    selectStep(null);
    selectStation(null);
  }, [selectStep, selectStation]);

  // Navigate back with unsaved changes check
  const handleNavigateBack = useCallback(async () => {
    if (hasUnsavedChanges) {
      const shouldLeave = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Are you sure you want to leave? Your changes will be lost.',
        confirmText: 'Leave',
        cancelText: 'Stay',
        type: 'warning',
      });
      if (!shouldLeave) return;
    }
    navigate('/dashboard');
  }, [hasUnsavedChanges, confirm, navigate]);

  const handleAddStation = useCallback(async () => {
    const name = await showInputDialog({
      title: 'Add Stage',
      message: 'Enter a name for the new stage:',
      placeholder: 'Stage name...',
      confirmText: 'Create Stage',
    });
    if (name) {
      addStation(name);
    }
  }, [addStation, showInputDialog]);

  const handleAddStep = useCallback(async (stationId: string, type: StepType) => {
    const name = await showInputDialog({
      title: 'Add Step',
      message: `Enter a name for the new ${type.replace('-', ' ')} step:`,
      placeholder: 'Step name...',
      confirmText: 'Create Step',
    });
    if (name) {
      addStep(stationId, type, name);
    }
  }, [addStep, showInputDialog]);

  const handleSave = useCallback(async () => {
    try {
      await saveWorkflow();
      if (currentWorkflow) {
        originalWorkflowRef.current = JSON.stringify(currentWorkflow.definition);
        setHasUnsavedChanges(false);
      }
      toast.success('Workflow saved');
    } catch {
      toast.error('Failed to save workflow');
    }
  }, [saveWorkflow, currentWorkflow]);

  const handleSimulate = useCallback(async () => {
    const params = currentWorkflow?.definition.inputParameters;
    if (params && params.length > 0) {
      setShowExecuteDialog('simulate');
      return;
    }
    setShowSimulation(true);
    try {
      await simulateWorkflow();
    } catch (err) {
      console.error('Simulation failed:', err);
    }
  }, [simulateWorkflow, currentWorkflow]);

  const handleExecuteWithParams = useCallback(async (inputData: Record<string, any>) => {
    const mode = showExecuteDialog;
    setShowExecuteDialog(null);
    setShowSimulation(true);
    try {
      if (mode === 'simulate') {
        await simulateWorkflow(inputData);
      } else {
        await executeWorkflow(inputData);
      }
    } catch (err) {
      console.error('Execution failed:', err);
    }
  }, [showExecuteDialog, simulateWorkflow, executeWorkflow]);

  const handleRun = useCallback(() => {
    const params = currentWorkflow?.definition.inputParameters;
    if (params && params.length > 0) {
      if (params.some(p => p.type === 'file')) {
        setShowRunDialog(true);
      } else {
        setShowExecuteDialog('execute');
      }
      return;
    }
    // No input parameters — use existing JSON-body flow
    setShowSimulation(true);
    executeWorkflow({}).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Execution failed';
      toast.error(message);
    });
  }, [currentWorkflow, executeWorkflow]);

  const handleRunComplete = useCallback((_exec: Execution) => {
    setShowSimulation(true);
    toast.success('Workflow execution started');
  }, []);

  const handleStepClick = useCallback((stepId: string) => {
    selectStep(stepId);
  }, [selectStep]);

  const handleStationClick = useCallback((stationId: string) => {
    selectStation(stationId);
  }, [selectStation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedStepId) {
          selectStep(null);
        } else if (selectedStationId) {
          selectStation(null);
        } else if (editorView.type === 'step-view') {
          handleBackToStageView();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedStepId, selectedStationId, editorView, selectStep, selectStation, handleBackToStageView]);

  // Loading state
  if (isLoading && !currentWorkflow) {
    return (
      <div className="layout">
        <div className="flex items-center justify-center" style={{ height: '100vh' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  // Not found state
  if (!currentWorkflow && id) {
    return (
      <div className="layout">
        <div className="flex flex-col items-center justify-center" style={{ height: '100vh' }}>
          <p className="text-muted">Workflow not found</p>
          <button className="btn btn-primary mt-4" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="layout" style={{ height: '100vh' }}>
      {/* Header */}
      <header className="header">
        <div className="flex items-center gap-4">
          <button className="btn btn-ghost btn-icon" onClick={handleNavigateBack}>
            <ArrowLeft size={20} />
          </button>
          
          {/* Breadcrumb Navigation */}
          <EditorBreadcrumb items={breadcrumbItems} />
        </div>
        
        <div className="header-actions">
          {/* View indicator */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            padding: '6px 12px',
            background: 'var(--bg-tertiary)',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
          }}>
            <Layers size={14} />
            {editorView.type === 'stage-view' ? 'Stage View' : 'Step View'}
          </div>

          {editorView.type === 'step-view' && (
            <button 
              className="btn btn-secondary"
              onClick={handleBackToStageView}
            >
              <ArrowLeft size={18} />
              Back to Stages
            </button>
          )}

          {editorView.type === 'stage-view' ? (
            <button 
              className="btn btn-secondary"
              onClick={handleAddStation}
            >
              <Plus size={18} />
              Add Stage
            </button>
          ) : (
            <button 
              className="btn btn-secondary"
              onClick={() => setShowLibrary(!showLibrary)}
            >
              <Plus size={18} />
              Add Step
            </button>
          )}

          {/* Workflow Status */}
          {currentWorkflow && (
            <select
              className="form-select"
              value={currentWorkflow.status}
              onChange={(e) => updateWorkflow(currentWorkflow.id, { status: e.target.value as 'draft' | 'active' | 'paused' })}
              style={{ 
                width: 'auto', 
                fontSize: '12px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: currentWorkflow.status === 'active' ? 'rgba(34, 197, 94, 0.15)' : 
                            currentWorkflow.status === 'paused' ? 'rgba(234, 179, 8, 0.15)' : 'var(--bg-tertiary)',
                color: currentWorkflow.status === 'active' ? 'rgb(34, 197, 94)' : 
                       currentWorkflow.status === 'paused' ? 'rgb(234, 179, 8)' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)'
              }}
            >
              <option value="draft">📝 Draft</option>
              <option value="active">✅ Active</option>
              <option value="paused">⏸️ Paused</option>
            </select>
          )}

          <button
            className={`btn btn-secondary ${showInputParams ? 'btn-active' : ''}`}
            onClick={() => setShowInputParams(!showInputParams)}
            title="Input Parameters"
          >
            <Settings size={18} />
            Params
          </button>

          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setShowVersionHistory(!showVersionHistory)}
            title="Version History"
          >
            <Clock size={18} />
          </button>

          <button
            className={`btn ${hasUnsavedChanges ? 'btn-primary' : 'btn-secondary'}`}
            onClick={handleSave}
            disabled={isLoading}
            style={{
              position: 'relative',
            }}
          >
            <Save size={18} />
            {hasUnsavedChanges ? 'Save*' : 'Save'}
            {hasUnsavedChanges && (
              <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: '10px',
                height: '10px',
                background: 'var(--accent-warning)',
                borderRadius: '50%',
                border: '2px solid var(--bg-secondary)',
              }} />
            )}
          </button>
          
          <button
            className="btn btn-success"
            onClick={handleSimulate}
            disabled={isSimulating || !currentWorkflow?.definition.stations.length}
          >
            {isSimulating ? (
              <span className="loading-spinner" />
            ) : (
              <Play size={18} />
            )}
            Simulate
          </button>

          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={isSimulating || !currentWorkflow?.definition.stations.length}
          >
            <Play size={18} />
            Run
          </button>
        </div>
      </header>

      {/* Main Editor Area */}
      <div className="flex" style={{ flex: 1, overflow: 'hidden' }}>
        {/* Node Library Panel (only in Step View) */}
        {showLibrary && editorView.type === 'step-view' && currentStage && (
          <NodeLibrary 
            onAddStep={(type) => handleAddStep(currentStage.id, type)}
            stations={currentWorkflow?.definition.stations || []}
            onAddStepToStation={handleAddStep}
            onClose={() => setShowLibrary(false)}
          />
        )}

        {/* Canvas Area */}
        <div style={{ flex: 1, height: '100%' }}>
          {currentWorkflow && editorView.type === 'stage-view' && (
            <StageCanvas
              workflow={currentWorkflow}
              execution={currentExecution}
              isSimulating={isSimulating}
              onStageDoubleClick={handleStageDoubleClick}
              onStageClick={handleStationClick}
              onAddStation={handleAddStation}
            />
          )}

          {currentWorkflow && editorView.type === 'step-view' && currentStage && (
            <StepCanvas
              station={currentStage}
              execution={currentExecution}
              isSimulating={isSimulating}
              selectedStepId={selectedStepId}
              onStepClick={handleStepClick}
              onStepUpdate={updateStep}
              onStepConnect={(sourceId, targetId, sourceHandle) =>
                connectSteps(currentStage.id, sourceId, targetId, sourceHandle)
              }
            />
          )}
        </div>

        {/* Config Panel (hidden when simulation results are showing) */}
        {selectedStep && currentWorkflow && !(showSimulation && currentExecution?.result) && (
          <NodeConfigPanel 
            step={selectedStep}
            workflow={currentWorkflow}
            onUpdate={(data) => updateStep(selectedStep.id, data)}
            onDelete={() => deleteStep(selectedStep.id)}
            onClose={() => selectStep(null)}
          />
        )}

        {selectedStation && currentWorkflow && editorView.type === 'stage-view' && (
          <StationConfigPanel 
            station={selectedStation}
            workflow={currentWorkflow}
            onUpdate={(data) => {
              updateStation(selectedStation.id, data);
              saveWorkflow();
            }}
            onDelete={() => deleteStation(selectedStation.id)}
            onClose={() => selectStation(null)}
          />
        )}

        {/* Input Parameters Panel */}
        {showInputParams && currentWorkflow && (
          <div style={{
            width: '320px',
            background: 'var(--bg-secondary)',
            borderLeft: '1px solid var(--border-color)',
            padding: '16px',
            overflowY: 'auto',
          }}>
            <h3 style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>Input Parameters</h3>
            <InputParametersEditor
              parameters={currentWorkflow.definition.inputParameters || []}
              onChange={(params) => {
                setCurrentWorkflow({
                  ...currentWorkflow,
                  definition: {
                    ...currentWorkflow.definition,
                    inputParameters: params,
                  },
                });
              }}
            />
          </div>
        )}

        {/* Simulation Panel */}
        {showSimulation && (
          <SimulationPanel
            execution={currentExecution}
            logs={executionLogs}
            isRunning={isSimulating}
            selectedStepId={selectedStepId}
            onStepDeselect={() => selectStep(null)}
            onClose={() => setShowSimulation(false)}
          />
        )}

        {/* Version History Panel */}
        {showVersionHistory && currentWorkflow && (
          <VersionHistoryPanel
            workflowId={currentWorkflow.id}
            onRestore={() => {
              if (id) fetchWorkflow(id);
              setShowVersionHistory(false);
            }}
            onClose={() => setShowVersionHistory(false)}
          />
        )}
      </div>

      {/* Execute Dialog (for workflows with non-file input parameters) */}
      {showExecuteDialog && currentWorkflow?.definition.inputParameters && (
        <ExecuteDialog
          parameters={currentWorkflow.definition.inputParameters}
          mode={showExecuteDialog}
          onSubmit={handleExecuteWithParams}
          onCancel={() => setShowExecuteDialog(null)}
        />
      )}

      {/* Run-with-Input Dialog (for workflows with file upload parameters) */}
      {currentWorkflow?.definition.inputParameters && (
        <RunWithInputDialog
          workflowId={currentWorkflow.id}
          inputs={currentWorkflow.definition.inputParameters}
          open={showRunDialog}
          onClose={() => setShowRunDialog(false)}
          onComplete={handleRunComplete}
        />
      )}

      {/* AI Assistant Chat Panel */}
      {currentWorkflow && (
        <AssistantChatPanel
          workflowId={currentWorkflow.id}
          onWorkflowUpdated={() => {
            if (id) fetchWorkflow(id);
          }}
        />
      )}
    </div>
  );
}

export default EditorPage;
