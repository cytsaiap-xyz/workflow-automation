import { useState, useEffect } from 'react';
import type { Step, Workflow } from '../../../shared/types/workflow';
import { STEP_TYPE_INFO, isV2 } from '../../../shared/types/workflow';
import X from 'lucide-react/dist/esm/icons/x';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import Save from 'lucide-react/dist/esm/icons/save';
import Database from 'lucide-react/dist/esm/icons/database';
import Package from 'lucide-react/dist/esm/icons/package';
import { VariablePicker } from './VariablePicker';
import { PromptHelperPopover } from '../../assistant/PromptHelperPopover';
import { NodeAdvancedSection } from '../dag/NodeAdvancedSection';
import { useDagEditorStore } from '../../../shared/stores/dagEditorStore';
import { aiProvidersApi } from '../../../shared/api/aiProvidersApi';
import type { AiProvider } from '../../../shared/api/aiProvidersApi';

interface NodeConfigPanelProps {
  step: Step;
  workflow: Workflow;
  onUpdate: (data: Partial<Step>) => void;
  onDelete: () => void;
  onClose: () => void;
}

function NodeConfigPanel({ step, workflow, onUpdate, onDelete, onClose }: NodeConfigPanelProps) {
  const [name, setName] = useState(step.name);
  const [code, setCode] = useState(step.config.code || '');
  const [url, setUrl] = useState(step.config.url || '');
  const [method, setMethod] = useState(step.config.method || 'GET');
  const [body, setBody] = useState(step.config.body || '');
  const [headers, setHeaders] = useState<{key: string, value: string}[]>(
    step.config.headers ? Object.entries(step.config.headers).map(([key, value]) => ({ key, value: value as string })) : []
  );
  const [timeout, setTimeout] = useState(step.timeout ? step.timeout / 1000 : 30);
  const [condition, setCondition] = useState(step.config.condition || '');
  const [variableName, setVariableName] = useState(step.config.variableName || '');
  const [variableValue, setVariableValue] = useState(step.config.variableValue || '');
  const [cronExpression, setCronExpression] = useState(step.config.cronExpression || '');
  const [duration, setDuration] = useState(step.config.duration || 5);
  const [unit, setUnit] = useState(step.config.unit || 'seconds');
  const [webhookMethod, setWebhookMethod] = useState(step.config.webhookMethod || 'POST');
  
  // Email fields
  const [emailTo, setEmailTo] = useState(step.config.emailTo || '');
  const [emailSubject, setEmailSubject] = useState(step.config.emailSubject || '');
  const [emailBody, setEmailBody] = useState(step.config.emailBody || '');
  
  // Slack fields
  const [slackWebhookUrl, setSlackWebhookUrl] = useState(step.config.slackWebhookUrl || '');
  const [slackMessage, setSlackMessage] = useState(step.config.slackMessage || '');

  // Database connector fields
  const [dbType, setDbType] = useState(step.config.dbType || 'postgres');
  const [dbHost, setDbHost] = useState(step.config.dbHost || '');
  const [dbPort, setDbPort] = useState(step.config.dbPort || 5432);
  const [dbName, setDbName] = useState(step.config.dbName || '');
  const [dbUser, setDbUser] = useState(step.config.dbUser || '');
  const [dbPassword, setDbPassword] = useState(step.config.dbPassword || '');
  const [dbQuery, setDbQuery] = useState(step.config.dbQuery || '');

  // AI fields
  const [aiProviderId, setAiProviderId] = useState(step.config.aiProviderId || '');
  const [aiProviders, setAiProviders] = useState<AiProvider[]>([]);
  const [aiBaseUrl, setAiBaseUrl] = useState(step.config.aiBaseUrl || '');
  const [aiApiKey, setAiApiKey] = useState(step.config.aiApiKey || '');
  const [aiModel, setAiModel] = useState(step.config.aiModel || '');
  const [aiPrompt, setAiPrompt] = useState(step.config.aiPrompt || '');
  const [aiSystemPrompt, setAiSystemPrompt] = useState(step.config.aiSystemPrompt || '');
  const [aiTemperature, setAiTemperature] = useState(step.config.aiTemperature ?? 0.7);
  const [aiMaxTokens, setAiMaxTokens] = useState(step.config.aiMaxTokens ?? 2048);
  const [aiHeaders, setAiHeaders] = useState<{key: string, value: string}[]>(
    step.config.aiHeaders ? Object.entries(step.config.aiHeaders).map(([key, value]) => ({ key, value })) : []
  );
  const [aiOutputSchema, setAiOutputSchema] = useState(step.config.aiOutputSchema ? JSON.stringify(step.config.aiOutputSchema, null, 2) : '');
  const [aiToolsJson, setAiToolsJson] = useState(step.config.aiTools ? JSON.stringify(step.config.aiTools, null, 2) : '');
  const [aiMaxIterations, setAiMaxIterations] = useState(step.config.aiMaxIterations || 10);
  const [aiRoutes, setAiRoutes] = useState<{branchId: string, description: string}[]>(
    step.config.aiRoutes || []
  );

  // json-output-writer fields
  const [jsonOutputFilename, setJsonOutputFilename] = useState(step.config.jsonOutputFilename || '');
  const [jsonOutputDirectory, setJsonOutputDirectory] = useState(step.config.jsonOutputDirectory || '');
  const [jsonOutputRootKey, setJsonOutputRootKey] = useState(step.config.jsonOutputRootKey || '');
  const [jsonOutputPretty, setJsonOutputPretty] = useState(step.config.jsonOutputPretty !== false);

  // load-document fields
  const [loadDocumentSourcePath, setLoadDocumentSourcePath] = useState(step.config.loadDocumentSourcePath || '');
  const [loadDocumentMaxChunkChars, setLoadDocumentMaxChunkChars] = useState(step.config.loadDocumentMaxChunkChars ?? 2000);

  // quiz-output-writer fields
  const [quizOutputFilename, setQuizOutputFilename] = useState(step.config.quizOutputFilename || '');
  const [quizOutputDirectory, setQuizOutputDirectory] = useState(step.config.quizOutputDirectory || '');

  // aggregate fields
  const [aggregateInputPath, setAggregateInputPath] = useState(step.config.aggregateInputPath || 'items');
  const [aggregateOperation, setAggregateOperation] = useState(step.config.aggregateOperation || 'count');
  const [aggregateField, setAggregateField] = useState(step.config.aggregateField || '');
  const [aggregateSeparator, setAggregateSeparator] = useState(step.config.aggregateSeparator || '');

  // transform field — edited as JSON text so the user can keep multi-key mappings readable
  const [transformMappingJson, setTransformMappingJson] = useState(
    step.config.transformMapping ? JSON.stringify(step.config.transformMapping, null, 2) : '{\n  \n}',
  );
  const [transformMappingError, setTransformMappingError] = useState<string | null>(null);

  // ai-loop fields — steps and earlyExitWhen edited as JSON; rounds is a plain number
  const [aiLoopRounds, setAiLoopRounds] = useState(step.config.aiLoopRounds ?? 3);
  const [aiLoopStepsJson, setAiLoopStepsJson] = useState(
    step.config.aiLoopSteps ? JSON.stringify(step.config.aiLoopSteps, null, 2) : '[\n  \n]',
  );
  const [aiLoopStepsError, setAiLoopStepsError] = useState<string | null>(null);
  const [aiLoopEarlyExitJson, setAiLoopEarlyExitJson] = useState(
    step.config.aiLoopEarlyExitWhen ? JSON.stringify(step.config.aiLoopEarlyExitWhen, null, 2) : '[]',
  );
  const [aiLoopEarlyExitError, setAiLoopEarlyExitError] = useState<string | null>(null);

  // Fetch AI providers when panel shows an AI node
  const isAiNode = ['ai-prompt', 'ai-structured-output', 'ai-agent', 'ai-router'].includes(step.type);
  useEffect(() => {
    if (!isAiNode) return;
    aiProvidersApi.list().then(setAiProviders).catch(() => setAiProviders([]));
  }, [isAiNode]);

  // Picker state
  const [activePicker, setActivePicker] = useState<string | null>(null);

  // Prompt helper popover state
  const [helperField, setHelperField] = useState<'aiSystemPrompt' | 'aiPrompt' | null>(null);

  // Retry Policy
  const [retryEnabled, setRetryEnabled] = useState(!!step.retryPolicy);
  const [maxAttempts, setMaxAttempts] = useState(step.retryPolicy?.maxAttempts || 3);
  const [initialInterval, setInitialInterval] = useState(step.retryPolicy?.initialInterval || 1000);
  const [backoffCoefficient, setBackoffCoefficient] = useState(step.retryPolicy?.backoffCoefficient || 2);

  // DAG v2 advanced section
  const dagNodes = useDagEditorStore(s => s.nodes);
  const upsertNode = useDagEditorStore(s => s.upsertNode);
  const isV2Workflow = isV2(workflow.definition);
  const dagNode = isV2Workflow ? dagNodes.find(n => n.id === step.id) ?? null : null;
  const otherIds = dagNode ? dagNodes.filter(n => n.id !== dagNode.id).map(n => n.id) : [];

  useEffect(() => {
    setName(step.name);
    setCode(step.config.code || '');
    setUrl(step.config.url || '');
    setMethod(step.config.method || 'GET');
    setBody(step.config.body || '');
    setHeaders(step.config.headers ? Object.entries(step.config.headers).map(([key, value]) => ({ key, value: value as string })) : []);
    setTimeout(step.timeout ? step.timeout / 1000 : 30);
    setCondition(step.config.condition || '');
    setVariableName(step.config.variableName || '');
    setVariableValue(step.config.variableValue || '');
    setCronExpression(step.config.cronExpression || '');
    setDuration(step.config.duration || 5);
    setUnit(step.config.unit || 'seconds');
    setWebhookMethod(step.config.webhookMethod || 'POST');
    setEmailTo(step.config.emailTo || '');
    setEmailSubject(step.config.emailSubject || '');
    setEmailBody(step.config.emailBody || '');
    setSlackWebhookUrl(step.config.slackWebhookUrl || '');
    setSlackMessage(step.config.slackMessage || '');
    setDbType(step.config.dbType || 'postgres');
    setDbHost(step.config.dbHost || '');
    setDbPort(step.config.dbPort || 5432);
    setDbName(step.config.dbName || '');
    setDbUser(step.config.dbUser || '');
    setDbPassword(step.config.dbPassword || '');
    setDbQuery(step.config.dbQuery || '');
    setRetryEnabled(!!step.retryPolicy);
    setMaxAttempts(step.retryPolicy?.maxAttempts || 3);
    setInitialInterval(step.retryPolicy?.initialInterval || 1000);
    setBackoffCoefficient(step.retryPolicy?.backoffCoefficient || 2);
    setAiProviderId(step.config.aiProviderId || '');
    setAiBaseUrl(step.config.aiBaseUrl || '');
    setAiApiKey(step.config.aiApiKey || '');
    setAiModel(step.config.aiModel || '');
    setAiPrompt(step.config.aiPrompt || '');
    setAiSystemPrompt(step.config.aiSystemPrompt || '');
    setAiTemperature(step.config.aiTemperature ?? 0.7);
    setAiMaxTokens(step.config.aiMaxTokens ?? 2048);
    setAiHeaders(step.config.aiHeaders ? Object.entries(step.config.aiHeaders).map(([key, value]) => ({ key, value })) : []);
    setAiOutputSchema(step.config.aiOutputSchema ? JSON.stringify(step.config.aiOutputSchema, null, 2) : '');
    setAiToolsJson(step.config.aiTools ? JSON.stringify(step.config.aiTools, null, 2) : '');
    setAiMaxIterations(step.config.aiMaxIterations || 10);
    setAiRoutes(step.config.aiRoutes || []);
    setJsonOutputFilename(step.config.jsonOutputFilename || '');
    setJsonOutputDirectory(step.config.jsonOutputDirectory || '');
    setJsonOutputRootKey(step.config.jsonOutputRootKey || '');
    setJsonOutputPretty(step.config.jsonOutputPretty !== false);
    setLoadDocumentSourcePath(step.config.loadDocumentSourcePath || '');
    setLoadDocumentMaxChunkChars(step.config.loadDocumentMaxChunkChars ?? 2000);
    setQuizOutputFilename(step.config.quizOutputFilename || '');
    setQuizOutputDirectory(step.config.quizOutputDirectory || '');
    setAggregateInputPath(step.config.aggregateInputPath || 'items');
    setAggregateOperation(step.config.aggregateOperation || 'count');
    setAggregateField(step.config.aggregateField || '');
    setAggregateSeparator(step.config.aggregateSeparator || '');
    setTransformMappingJson(
      step.config.transformMapping ? JSON.stringify(step.config.transformMapping, null, 2) : '{\n  \n}',
    );
    setTransformMappingError(null);
    setAiLoopRounds(step.config.aiLoopRounds ?? 3);
    setAiLoopStepsJson(
      step.config.aiLoopSteps ? JSON.stringify(step.config.aiLoopSteps, null, 2) : '[\n  \n]',
    );
    setAiLoopStepsError(null);
    setAiLoopEarlyExitJson(
      step.config.aiLoopEarlyExitWhen ? JSON.stringify(step.config.aiLoopEarlyExitWhen, null, 2) : '[]',
    );
    setAiLoopEarlyExitError(null);
  }, [step]);

  const handleSave = () => {
    const config = { ...step.config };

    switch (step.type) {
      case 'script-js':
      case 'script-python':
        config.code = code;
        break;
      case 'http-request':
        config.url = url;
        config.method = method as any;
        config.body = body;
        config.headers = headers.length > 0 ? Object.fromEntries(headers.filter(h => h.key).map(h => [h.key, h.value])) : undefined;
        break;
      case 'if-else':
        config.condition = condition;
        break;
      case 'set-variable':
        config.variableName = variableName;
        config.variableValue = variableValue;
        break;
      case 'trigger-cron':
        config.cronExpression = cronExpression;
        break;
      case 'wait':
        config.duration = Number(duration);
        config.unit = unit as any;
        break;
      case 'trigger-webhook':
        config.webhookMethod = webhookMethod as any;
        break;
      case 'action-email':
        config.emailTo = emailTo;
        config.emailSubject = emailSubject;
        config.emailBody = emailBody;
        break;
      case 'action-slack':
        config.slackWebhookUrl = slackWebhookUrl;
        config.slackMessage = slackMessage;
        break;
      case 'connector-db':
        config.dbType = dbType as any;
        config.dbHost = dbHost;
        config.dbPort = Number(dbPort);
        config.dbName = dbName;
        config.dbUser = dbUser;
        config.dbPassword = dbPassword;
        config.dbQuery = dbQuery;
        break;
      case 'ai-prompt':
        config.aiProviderId = aiProviderId || undefined;
        config.aiBaseUrl = aiBaseUrl;
        config.aiApiKey = aiApiKey;
        config.aiModel = aiModel;
        config.aiPrompt = aiPrompt;
        config.aiSystemPrompt = aiSystemPrompt;
        config.aiTemperature = Number(aiTemperature);
        config.aiMaxTokens = Number(aiMaxTokens);
        config.aiHeaders = aiHeaders.length > 0 ? Object.fromEntries(aiHeaders.filter(h => h.key).map(h => [h.key, h.value])) : undefined;
        break;
      case 'ai-structured-output':
        config.aiProviderId = aiProviderId || undefined;
        config.aiBaseUrl = aiBaseUrl;
        config.aiApiKey = aiApiKey;
        config.aiModel = aiModel;
        config.aiPrompt = aiPrompt;
        config.aiSystemPrompt = aiSystemPrompt;
        config.aiTemperature = Number(aiTemperature);
        config.aiMaxTokens = Number(aiMaxTokens);
        config.aiHeaders = aiHeaders.length > 0 ? Object.fromEntries(aiHeaders.filter(h => h.key).map(h => [h.key, h.value])) : undefined;
        try { config.aiOutputSchema = aiOutputSchema ? JSON.parse(aiOutputSchema) : undefined; } catch { /* keep existing */ }
        break;
      case 'ai-agent':
        config.aiProviderId = aiProviderId || undefined;
        config.aiBaseUrl = aiBaseUrl;
        config.aiApiKey = aiApiKey;
        config.aiModel = aiModel;
        config.aiPrompt = aiPrompt;
        config.aiSystemPrompt = aiSystemPrompt;
        config.aiTemperature = Number(aiTemperature);
        config.aiMaxTokens = Number(aiMaxTokens);
        config.aiHeaders = aiHeaders.length > 0 ? Object.fromEntries(aiHeaders.filter(h => h.key).map(h => [h.key, h.value])) : undefined;
        try { config.aiTools = aiToolsJson ? JSON.parse(aiToolsJson) : undefined; } catch { /* keep existing */ }
        config.aiMaxIterations = Number(aiMaxIterations);
        break;
      case 'ai-router':
        config.aiProviderId = aiProviderId || undefined;
        config.aiBaseUrl = aiBaseUrl;
        config.aiApiKey = aiApiKey;
        config.aiModel = aiModel;
        config.aiPrompt = aiPrompt;
        config.aiSystemPrompt = aiSystemPrompt;
        config.aiTemperature = Number(aiTemperature);
        config.aiMaxTokens = Number(aiMaxTokens);
        config.aiHeaders = aiHeaders.length > 0 ? Object.fromEntries(aiHeaders.filter(h => h.key).map(h => [h.key, h.value])) : undefined;
        config.aiRoutes = aiRoutes.filter(r => r.branchId.trim());
        break;
      case 'json-output-writer':
        config.jsonOutputFilename = jsonOutputFilename.trim() || undefined;
        config.jsonOutputDirectory = jsonOutputDirectory.trim() || undefined;
        config.jsonOutputRootKey = jsonOutputRootKey.trim() || undefined;
        config.jsonOutputPretty = jsonOutputPretty;
        break;
      case 'load-document':
        config.loadDocumentSourcePath = loadDocumentSourcePath.trim() || undefined;
        config.loadDocumentMaxChunkChars = Number(loadDocumentMaxChunkChars) || undefined;
        break;
      case 'quiz-output-writer':
        config.quizOutputFilename = quizOutputFilename.trim() || undefined;
        config.quizOutputDirectory = quizOutputDirectory.trim() || undefined;
        break;
      case 'aggregate':
        config.aggregateInputPath = aggregateInputPath.trim() || undefined;
        config.aggregateOperation = aggregateOperation;
        config.aggregateField = aggregateField.trim() || undefined;
        config.aggregateSeparator = aggregateSeparator || undefined;
        break;
      case 'transform':
        try {
          const parsed = JSON.parse(transformMappingJson);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            // Force all values to strings — mapping values must be interpolation expressions
            const clean: Record<string, string> = {};
            for (const [k, v] of Object.entries(parsed)) clean[k] = String(v);
            config.transformMapping = clean;
          }
        } catch {
          // Leave previous mapping in place; render() shows the parse error
        }
        break;
      case 'ai-loop':
        config.aiLoopRounds = Math.max(1, Math.floor(Number(aiLoopRounds) || 1));
        try {
          const steps = JSON.parse(aiLoopStepsJson);
          if (Array.isArray(steps)) config.aiLoopSteps = steps;
        } catch { /* keep previous */ }
        try {
          const exits = JSON.parse(aiLoopEarlyExitJson);
          if (Array.isArray(exits)) {
            config.aiLoopEarlyExitWhen = exits.map((s: unknown) => String(s)).filter(s => s.trim() !== '');
          }
        } catch { /* keep previous */ }
        break;
    }

    const updateData: Partial<Step> = { name, config, timeout: timeout * 1000 };
    
    if (retryEnabled) {
      updateData.retryPolicy = {
        maxAttempts: Number(maxAttempts),
        initialInterval: Number(initialInterval),
        backoffCoefficient: Number(backoffCoefficient)
      };
    } else {
      updateData.retryPolicy = undefined;
    }

    onUpdate(updateData);
  };

  const typeInfo = STEP_TYPE_INFO[step.type] || { label: step.type, icon: <Package size={16} />, color: '#64748b' };

  const renderConfigFields = () => {
    switch (step.type) {
      case 'script-js':
        return (
          <div className="form-group">
            <label className="form-label">JavaScript Code</label>
            <textarea
              className="form-textarea"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={`// Access input data via inputData object
// Return value will be the step output

const result = inputData.value * 2;
return { result };`}
              style={{ minHeight: '200px', fontFamily: 'monospace' }}
            />
            <p className="text-xs text-muted mt-2">
              Access previous step outputs via <code>inputData</code>. Return an object for the step output.
            </p>
          </div>
        );

      case 'script-python':
        return (
          <div className="form-group">
            <label className="form-label">Python Code</label>
            <textarea
              className="form-textarea"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={`# Access input data via input_data dict
# Print JSON for output

result = input_data.get('value', 0) * 2
print(json.dumps({'result': result}))`}
              style={{ minHeight: '200px', fontFamily: 'monospace' }}
            />
            <p className="text-xs text-muted mt-2">
              Access input via <code>input_data</code> dict. Print JSON for output.
            </p>
          </div>
        );

      case 'http-request':
        return (
          <>
            <div className="form-group">
              <div className="flex gap-2">
                <input
                  type="text"
                  className="form-input"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.example.com/data"
                />
                <button 
                  className={`btn btn-icon btn-sm ${activePicker === 'url' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setActivePicker(activePicker === 'url' ? null : 'url')}
                >
                  <Database size={14} />
                </button>
              </div>
              {activePicker === 'url' && (
                <div className="mt-2">
                  <VariablePicker 
                    workflow={workflow} 
                    currentStepId={step.id} 
                    onSelect={(v) => {
                      setUrl(url + v);
                      setActivePicker(null);
                    }} 
                  />
                </div>
              )}
              <p className="text-xs text-muted mt-2">
                Use <code>{'${variable}'}</code> for dynamic values or click the database icon to pick upstream outputs.
              </p>
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded text-xs border border-gray-200 dark:border-gray-700">
                <p className="font-semibold mb-1">Output Structure:</p>
                <div className="font-mono text-muted">
                  {'{'}<br/>
                  &nbsp;&nbsp;status: number,<br/>
                  &nbsp;&nbsp;statusText: string,<br/>
                  &nbsp;&nbsp;headers: object,<br/>
                  &nbsp;&nbsp;data: any // Response body<br/>
                  {'}'}
                </div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Method</label>
              <select
                className="form-select"
                value={method}
                onChange={(e) => setMethod(e.target.value as any)}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
            {method !== 'GET' && (
              <div className="form-group">
                <div className="flex justify-between items-center mb-1">
                  <label className="form-label">Request Body (JSON)</label>
                  <button 
                    className="btn btn-ghost btn-xs flex gap-1 items-center"
                    onClick={() => setActivePicker(activePicker === 'body' ? null : 'body')}
                  >
                    <Database size={10} /> Insert Variable
                  </button>
                </div>
                <textarea
                  className="form-textarea"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder='{"key": "value"}'
                  style={{ fontFamily: 'monospace' }}
                />
                {activePicker === 'body' && (
                  <div className="mt-2">
                    <VariablePicker 
                      workflow={workflow} 
                      currentStepId={step.id} 
                      onSelect={(v) => {
                        setBody(body + v);
                        setActivePicker(null);
                      }} 
                    />
                  </div>
                )}
              </div>
            )}

            {/* Headers Section */}
            <div className="form-group">
              <div className="flex justify-between items-center mb-2">
                <label className="form-label">Request Headers</label>
                <button 
                  className="btn btn-ghost btn-xs"
                  onClick={() => setHeaders([...headers, { key: '', value: '' }])}
                >
                  + Add Header
                </button>
              </div>
              {headers.length === 0 ? (
                <p className="text-xs text-muted italic">No custom headers configured.</p>
              ) : (
                <div className="space-y-2">
                  {headers.map((header, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Header Name"
                        value={header.key}
                        onChange={(e) => {
                          const newHeaders = [...headers];
                          newHeaders[idx].key = e.target.value;
                          setHeaders(newHeaders);
                        }}
                        style={{ flex: 1 }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Value"
                        value={header.value}
                        onChange={(e) => {
                          const newHeaders = [...headers];
                          newHeaders[idx].value = e.target.value;
                          setHeaders(newHeaders);
                        }}
                        style={{ flex: 2 }}
                      />
                      <button 
                        className="btn btn-ghost btn-icon btn-xs text-red-500"
                        onClick={() => setHeaders(headers.filter((_, i) => i !== idx))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Advanced Settings */}
            <details className="mt-4">
              <summary className="text-xs font-semibold cursor-pointer text-muted hover:text-primary">
                Advanced Settings
              </summary>
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                <div className="form-group">
                  <label className="form-label">Timeout (seconds)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={timeout}
                    onChange={(e) => setTimeout(Number(e.target.value))}
                    min={1}
                    max={300}
                  />
                  <p className="text-xs text-muted mt-1">Request will fail if it takes longer than this.</p>
                </div>
              </div>
            </details>
          </>
        );

      case 'if-else':
        return (
          <div className="form-group">
            <label className="form-label">Condition Expression</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="form-input"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                placeholder="${step1.output.value} > 10"
              />
              <button 
                className={`btn btn-icon btn-sm ${activePicker === 'condition' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActivePicker(activePicker === 'condition' ? null : 'condition')}
              >
                <Database size={14} />
              </button>
            </div>
            {activePicker === 'condition' && (
              <div className="mt-2">
                <VariablePicker 
                  workflow={workflow} 
                  currentStepId={step.id} 
                  onSelect={(v) => {
                    const cleanVar = v.replace(/[{}]/g, ''); // Conditions in ScriptRunner often don't want {{}} wrapper if they are evaluated directly as JS
                    setCondition(condition + (condition ? ' && ' : '') + cleanVar);
                    setActivePicker(null);
                  }} 
                />
              </div>
            )}
            <p className="text-xs text-muted mt-2">
              JavaScript expression that evaluates to true/false.
            </p>
          </div>
        );

      case 'set-variable':
        return (
          <>
            <div className="form-group">
              <label className="form-label">Variable Name</label>
              <input
                type="text"
                className="form-input"
                value={variableName}
                onChange={(e) => setVariableName(e.target.value)}
                placeholder="myVariable"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Value</label>
              <div className="flex gap-2">
              <input
                type="text"
                className="form-input"
                value={variableValue}
                onChange={(e) => setVariableValue(e.target.value)}
                placeholder="${step1.output.result}"
              />
              <button 
                className={`btn btn-icon btn-sm ${activePicker === 'variableValue' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActivePicker(activePicker === 'variableValue' ? null : 'variableValue')}
              >
                <Database size={14} />
              </button>
            </div>
            {activePicker === 'variableValue' && (
              <div className="mt-2">
                <VariablePicker 
                  workflow={workflow} 
                  currentStepId={step.id} 
                  onSelect={(v) => {
                    setVariableValue(variableValue + v);
                    setActivePicker(null);
                  }} 
                />
              </div>
            )}
            </div>
          </>
        );

      case 'trigger-cron':
        return (
          <div className="form-group">
            <label className="form-label">Cron Expression</label>
            <input
              type="text"
              className="form-input"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              placeholder="0 * * * *"
            />
            <p className="text-xs text-muted mt-2">
              Examples: <code>0 * * * *</code> (hourly), <code>0 9 * * *</code> (daily at 9am)
            </p>
          </div>
        );

      case 'trigger-manual':
        return (
          <div className="text-muted text-sm">
            This trigger is activated manually when you run the workflow.
          </div>
        );

      case 'wait':
        return (
          <div className="flex gap-4">
            <div className="form-group flex-1">
              <label className="form-label">Duration</label>
              <input
                type="number"
                className="form-input"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                min={1}
              />
            </div>
            <div className="form-group flex-1">
              <label className="form-label">Unit</label>
              <select
                className="form-select"
                value={unit}
                onChange={(e) => setUnit(e.target.value as any)}
              >
                <option value="seconds">Seconds</option>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>
          </div>
        );

      case 'trigger-webhook':
        const webhookUrl = `${window.location.protocol}//${window.location.host}/api/webhooks/${step.id}`;
        return (
          <>
            <div className="form-group">
              <label className="form-label">Webhook URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="form-input"
                  value={webhookUrl}
                  readOnly
                />
                <button 
                  className="btn btn-ghost btn-sm"
                  onClick={() => navigator.clipboard.writeText(webhookUrl)}
                >
                  Copy
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Expected Method</label>
              <select
                className="form-select"
                value={webhookMethod}
                onChange={(e) => setWebhookMethod(e.target.value as any)}
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
          </>
        );

      case 'action-email':
        return (
          <>
            <div className="form-group">
              <label className="form-label">To</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="form-input"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="user@example.com"
                />
                <button 
                  className={`btn btn-icon btn-sm ${activePicker === 'emailTo' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setActivePicker(activePicker === 'emailTo' ? null : 'emailTo')}
                >
                  <Database size={14} />
                </button>
              </div>
              {activePicker === 'emailTo' && (
                <div className="mt-2">
                  <VariablePicker 
                    workflow={workflow} 
                    currentStepId={step.id} 
                    onSelect={(v) => {
                      setEmailTo(emailTo + v);
                      setActivePicker(null);
                    }} 
                  />
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Subject</label>
              <input
                type="text"
                className="form-input"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Workflow Notification"
              />
            </div>
            <div className="form-group">
              <div className="flex justify-between items-center mb-1">
                <label className="form-label">Body</label>
                <button 
                  className="btn btn-ghost btn-xs flex gap-1 items-center"
                  onClick={() => setActivePicker(activePicker === 'emailBody' ? null : 'emailBody')}
                >
                  <Database size={10} /> Insert Variable
                </button>
              </div>
              <textarea
                className="form-textarea"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Hello, the result is {{path}}"
                style={{ minHeight: '120px' }}
              />
              {activePicker === 'emailBody' && (
                <div className="mt-2">
                  <VariablePicker 
                    workflow={workflow} 
                    currentStepId={step.id} 
                    onSelect={(v) => {
                      setEmailBody(emailBody + v);
                      setActivePicker(null);
                    }} 
                  />
                </div>
              )}
            </div>
          </>
        );

      case 'action-slack':
        return (
          <>
            <div className="form-group">
              <label className="form-label">Slack Webhook URL</label>
              <input
                type="text"
                className="form-input"
                value={slackWebhookUrl}
                onChange={(e) => setSlackWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
              />
            </div>
            <div className="form-group">
              <div className="flex justify-between items-center mb-1">
                <label className="form-label">Message</label>
                <button 
                  className="btn btn-ghost btn-xs flex gap-1 items-center"
                  onClick={() => setActivePicker(activePicker === 'slackMessage' ? null : 'slackMessage')}
                >
                  <Database size={10} /> Insert Variable
                </button>
              </div>
              <textarea
                className="form-textarea"
                value={slackMessage}
                onChange={(e) => setSlackMessage(e.target.value)}
                placeholder="Workflow notification: {{status}}"
                style={{ minHeight: '100px' }}
              />
              {activePicker === 'slackMessage' && (
                <div className="mt-2">
                  <VariablePicker 
                    workflow={workflow} 
                    currentStepId={step.id} 
                    onSelect={(v) => {
                      setSlackMessage(slackMessage + v);
                      setActivePicker(null);
                    }} 
                  />
                </div>
              )}
            </div>
          </>
        );

      case 'connector-db':
        return (
          <>
            <div className="form-group">
              <label className="form-label">Database Type</label>
              <select
                className="form-select"
                value={dbType}
                onChange={(e) => setDbType(e.target.value as any)}
              >
                <option value="postgres">PostgreSQL</option>
                <option value="mysql">MySQL</option>
              </select>
            </div>
            <div className="flex gap-2">
              <div className="form-group" style={{ flex: 3 }}>
                <label className="form-label">Host</label>
                <input
                  type="text"
                  className="form-input"
                  value={dbHost}
                  onChange={(e) => setDbHost(e.target.value)}
                  placeholder="localhost"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Port</label>
                <input
                  type="number"
                  className="form-input"
                  value={dbPort}
                  onChange={(e) => setDbPort(Number(e.target.value))}
                  placeholder="5432"
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Database Name</label>
              <input
                type="text"
                className="form-input"
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                placeholder="my_database"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-input"
                value={dbUser}
                onChange={(e) => setDbUser(e.target.value)}
                placeholder="db_user"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                value={dbPassword}
                onChange={(e) => setDbPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="form-group">
              <label className="form-label">SQL Query</label>
              <textarea
                className="form-textarea"
                value={dbQuery}
                onChange={(e) => setDbQuery(e.target.value)}
                placeholder="SELECT * FROM users WHERE active = true"
                style={{ minHeight: '120px', fontFamily: 'monospace' }}
              />
              <p className="text-xs text-muted mt-2">
                Use <code>{'${variable}'}</code> syntax for dynamic values.
              </p>
            </div>
          </>
        );

      case 'ai-prompt':
      case 'ai-structured-output':
      case 'ai-agent':
      case 'ai-router':
        return (
          <>
            {/* Provider selector */}
            {aiProviders.length === 0 && (
              <div className="form-group">
                <p className="text-xs" style={{ color: '#d97706', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, padding: '6px 8px' }}>
                  No providers configured. Visit <strong>/settings/ai-providers</strong> to add one.
                </p>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Provider</label>
              <select
                className="form-select"
                value={aiProviderId}
                onChange={(e) => setAiProviderId(e.target.value)}
              >
                <option value="">— (custom / inline)</option>
                {aiProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.model}){p.isDefault ? ' ★' : ''}
                  </option>
                ))}
              </select>
              {aiProviderId && (() => {
                const p = aiProviders.find(x => x.id === aiProviderId);
                return p ? (
                  <p className="text-xs text-muted mt-1">
                    Using provider: {p.name} ({p.baseUrl}). The Base URL / API Key / Model / Headers fields below are ignored at runtime.
                  </p>
                ) : null;
              })()}
            </div>

            {/* Connection */}
            <div className="form-group" style={aiProviderId ? { opacity: 0.5 } : undefined}>
              <label className="form-label">Base URL (vLLM Server){aiProviderId ? ' (ignored)' : ''}</label>
              <input
                type="text"
                className="form-input"
                value={aiBaseUrl}
                onChange={(e) => setAiBaseUrl(e.target.value)}
                placeholder="http://localhost:8000/v1"
              />
            </div>
            <div className="form-group" style={aiProviderId ? { opacity: 0.5 } : undefined}>
              <label className="form-label">API Key (optional){aiProviderId ? ' (ignored)' : ''}</label>
              <input
                type="password"
                className="form-input"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder="Leave empty if not required"
              />
            </div>
            <div className="form-group" style={aiProviderId ? { opacity: 0.5 } : undefined}>
              <label className="form-label">Model{aiProviderId ? ' (ignored)' : ''}</label>
              <input
                type="text"
                className="form-input"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="meta-llama/Llama-3-8B-Instruct"
              />
            </div>

            {/* Headers */}
            <div className="form-group" style={aiProviderId ? { opacity: 0.5 } : undefined}>
              <div className="flex justify-between items-center mb-2">
                <label className="form-label">Headers (Auth){aiProviderId ? ' (ignored)' : ''}</label>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => setAiHeaders([...aiHeaders, { key: '', value: '' }])}
                >
                  + Add Header
                </button>
              </div>
              {aiHeaders.length === 0 ? (
                <p className="text-xs text-muted italic">No custom headers configured.</p>
              ) : (
                <div className="space-y-2">
                  {aiHeaders.map((header, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Header Name"
                        value={header.key}
                        onChange={(e) => {
                          const newHeaders = [...aiHeaders];
                          newHeaders[idx].key = e.target.value;
                          setAiHeaders(newHeaders);
                        }}
                        style={{ flex: 1 }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Value"
                        value={header.value}
                        onChange={(e) => {
                          const newHeaders = [...aiHeaders];
                          newHeaders[idx].value = e.target.value;
                          setAiHeaders(newHeaders);
                        }}
                        style={{ flex: 2 }}
                      />
                      <button
                        className="btn btn-ghost btn-icon btn-xs text-red-500"
                        onClick={() => setAiHeaders(aiHeaders.filter((_, i) => i !== idx))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* System Prompt */}
            <div className="form-group">
              <div className="flex justify-between items-center mb-1">
                <label className="form-label">System Prompt</label>
                <div style={{ position: 'relative' }}>
                  <button
                    className="btn btn-ghost btn-xs flex gap-1 items-center"
                    onClick={() => setHelperField(helperField === 'aiSystemPrompt' ? null : 'aiSystemPrompt')}
                    title="Open prompt helper"
                  >
                    ✨ Help
                  </button>
                  {helperField === 'aiSystemPrompt' && (
                    <PromptHelperPopover
                      workflowId={workflow.id}
                      nodeId={step.id}
                      field="aiSystemPrompt"
                      onUse={(newValue) => {
                        setAiSystemPrompt(newValue);
                        setHelperField(null);
                      }}
                      onClose={() => setHelperField(null)}
                    />
                  )}
                </div>
              </div>
              <textarea
                className="form-textarea"
                value={aiSystemPrompt}
                onChange={(e) => setAiSystemPrompt(e.target.value)}
                placeholder="You are a helpful assistant..."
                style={{ minHeight: '80px' }}
              />
            </div>

            {/* User Prompt */}
            <div className="form-group">
              <div className="flex justify-between items-center mb-1">
                <label className="form-label">Prompt</label>
                <div className="flex gap-1 items-center">
                  <button
                    className="btn btn-ghost btn-xs flex gap-1 items-center"
                    onClick={() => setActivePicker(activePicker === 'aiPrompt' ? null : 'aiPrompt')}
                  >
                    <Database size={10} /> Insert Variable
                  </button>
                  <div style={{ position: 'relative' }}>
                    <button
                      className="btn btn-ghost btn-xs flex gap-1 items-center"
                      onClick={() => setHelperField(helperField === 'aiPrompt' ? null : 'aiPrompt')}
                      title="Open prompt helper"
                    >
                      ✨ Help
                    </button>
                    {helperField === 'aiPrompt' && (
                      <PromptHelperPopover
                        workflowId={workflow.id}
                        nodeId={step.id}
                        field="aiPrompt"
                        onUse={(newValue) => {
                          setAiPrompt(newValue);
                          setHelperField(null);
                        }}
                        onClose={() => setHelperField(null)}
                      />
                    )}
                  </div>
                </div>
              </div>
              <textarea
                className="form-textarea"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={'Analyze the following data: ${previousStep.output.data}'}
                style={{ minHeight: '120px' }}
              />
              {activePicker === 'aiPrompt' && (
                <div className="mt-2">
                  <VariablePicker
                    workflow={workflow}
                    currentStepId={step.id}
                    onSelect={(v) => {
                      setAiPrompt(aiPrompt + v);
                      setActivePicker(null);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Temperature & Max Tokens */}
            <div className="flex gap-4">
              <div className="form-group flex-1">
                <label className="form-label">Temperature</label>
                <input
                  type="number"
                  className="form-input"
                  value={aiTemperature}
                  onChange={(e) => setAiTemperature(Number(e.target.value))}
                  min={0}
                  max={2}
                  step={0.1}
                />
              </div>
              <div className="form-group flex-1">
                <label className="form-label">Max Tokens</label>
                <input
                  type="number"
                  className="form-input"
                  value={aiMaxTokens}
                  onChange={(e) => setAiMaxTokens(Number(e.target.value))}
                  min={1}
                  max={128000}
                />
              </div>
            </div>

            {/* Structured Output Schema (only for ai-structured-output) */}
            {step.type === 'ai-structured-output' && (
              <div className="form-group">
                <label className="form-label">Output JSON Schema</label>
                <textarea
                  className="form-textarea"
                  value={aiOutputSchema}
                  onChange={(e) => setAiOutputSchema(e.target.value)}
                  placeholder={'{\n  "type": "object",\n  "properties": {\n    "sentiment": { "type": "string" },\n    "score": { "type": "number" }\n  },\n  "required": ["sentiment", "score"]\n}'}
                  style={{ minHeight: '160px', fontFamily: 'monospace' }}
                />
                <p className="text-xs text-muted mt-2">
                  JSON Schema that the LLM response must conform to.
                </p>
              </div>
            )}

            {/* Agent Tools (only for ai-agent) */}
            {step.type === 'ai-agent' && (
              <>
                <div className="form-group">
                  <label className="form-label">Tools (JSON Array)</label>
                  <textarea
                    className="form-textarea"
                    value={aiToolsJson}
                    onChange={(e) => setAiToolsJson(e.target.value)}
                    placeholder={'[\n  {\n    "type": "function",\n    "function": {\n      "name": "search",\n      "description": "Search for information",\n      "parameters": {\n        "type": "object",\n        "properties": {\n          "query": { "type": "string" }\n        },\n        "required": ["query"]\n      }\n    }\n  }\n]'}
                    style={{ minHeight: '180px', fontFamily: 'monospace' }}
                  />
                  <p className="text-xs text-muted mt-2">
                    OpenAI-compatible tool definitions. The agent will loop until done or max iterations reached.
                  </p>
                </div>
                <div className="form-group">
                  <label className="form-label">Max Iterations</label>
                  <input
                    type="number"
                    className="form-input"
                    value={aiMaxIterations}
                    onChange={(e) => setAiMaxIterations(Number(e.target.value))}
                    min={1}
                    max={50}
                  />
                  <p className="text-xs text-muted mt-2">
                    Maximum number of tool-call rounds before stopping.
                  </p>
                </div>
              </>
            )}

            {/* Router Routes (only for ai-router) */}
            {step.type === 'ai-router' && (
              <div className="form-group">
                <div className="flex justify-between items-center mb-2">
                  <label className="form-label">Routes (Branches)</label>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => setAiRoutes([...aiRoutes, { branchId: '', description: '' }])}
                  >
                    + Add Route
                  </button>
                </div>
                {aiRoutes.length === 0 ? (
                  <p className="text-xs text-muted italic">No routes configured. Add at least 2 routes.</p>
                ) : (
                  <div className="space-y-3">
                    {aiRoutes.map((route, idx) => {
                      const colors = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
                      const color = colors[idx % colors.length];
                      return (
                        <div key={idx} style={{ borderLeft: `3px solid ${color}`, paddingLeft: '10px' }}>
                          <div className="flex gap-2 items-center mb-1">
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Branch ID (e.g. approve)"
                              value={route.branchId}
                              onChange={(e) => {
                                const updated = [...aiRoutes];
                                updated[idx].branchId = e.target.value.replace(/\s+/g, '_');
                                setAiRoutes(updated);
                              }}
                              style={{ flex: 1, fontWeight: 600 }}
                            />
                            <button
                              className="btn btn-ghost btn-icon btn-xs text-red-500"
                              onClick={() => setAiRoutes(aiRoutes.filter((_, i) => i !== idx))}
                            >
                              ×
                            </button>
                          </div>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Description (helps the LLM decide)"
                            value={route.description}
                            onChange={(e) => {
                              const updated = [...aiRoutes];
                              updated[idx].description = e.target.value;
                              setAiRoutes(updated);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted mt-2">
                  The LLM will read each route's description and pick the best one. Connect edges from each branch handle to downstream steps.
                </p>
              </div>
            )}

            {/* Output info */}
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded text-xs border border-gray-200 dark:border-gray-700">
              <p className="font-semibold mb-1">Output Structure:</p>
              <div className="font-mono text-muted">
                {'{'}<br/>
                {step.type === 'ai-router' ? (
                  <>
                    &nbsp;&nbsp;branch: string,<br/>
                    &nbsp;&nbsp;reasoning: string,<br/>
                    &nbsp;&nbsp;allRoutes: string[],<br/>
                  </>
                ) : (
                  <>
                    &nbsp;&nbsp;response: string,<br/>
                    &nbsp;&nbsp;parsed: any,<br/>
                  </>
                )}
                &nbsp;&nbsp;model: string,<br/>
                &nbsp;&nbsp;usage: {'{ promptTokens, completionTokens, totalTokens }'}<br/>
                {step.type === 'ai-agent' && <>&nbsp;&nbsp;toolCalls: array,<br/>&nbsp;&nbsp;iterations: number,<br/></>}
                {'}'}
              </div>
            </div>
          </>
        );

      case 'ai-loop':
        return (
          <>
            <div className="form-group">
              <label className="form-label">Max rounds</label>
              <input
                type="number"
                className="form-input"
                value={aiLoopRounds}
                onChange={(e) => setAiLoopRounds(Number(e.target.value))}
                min={1}
                max={20}
              />
              <p className="text-xs text-muted mt-1">
                Hard upper bound. The loop stops earlier when all <code>earlyExitWhen</code> expressions are truthy after a round.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Inner steps (JSON)</label>
              <textarea
                className="form-textarea"
                value={aiLoopStepsJson}
                onChange={(e) => {
                  setAiLoopStepsJson(e.target.value);
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setAiLoopStepsError(Array.isArray(parsed) ? null : 'Must be a JSON array');
                  } catch (err) {
                    setAiLoopStepsError((err as Error).message);
                  }
                }}
                placeholder={'[\n  {\n    "id": "fix",\n    "systemTemplate": "quiz-fixer-system",\n    "outputSchema": { "type": "object", "properties": { "fixed_questions": { "type": "array" } }, "required": ["fixed_questions"] }\n  },\n  {\n    "id": "verify",\n    "systemTemplate": "quiz-verifier-system",\n    "outputSchema": { "type": "object", "properties": { "results": { "type": "array" }, "all_pass": { "type": "boolean" } }, "required": ["results", "all_pass"] }\n  },\n  {\n    "id": "review",\n    "systemTemplate": "quiz-reviewer-system",\n    "outputSchema": { "type": "object", "properties": { "results": { "type": "array" }, "all_pass": { "type": "boolean" } }, "required": ["results", "all_pass"] }\n  }\n]'}
                style={{ minHeight: '180px', fontFamily: 'monospace' }}
              />
              {aiLoopStepsError && (
                <p className="text-xs" style={{ color: 'var(--accent-danger)' }}>{aiLoopStepsError}</p>
              )}
              <p className="text-xs text-muted mt-1">
                Each step is one <code>ai.call</code> with a prompt template (by name) and an optional JSON schema. Steps run in order each round; later steps can reference earlier ones via <code>{'${earlierId.parsed.field}'}</code>. Add <code>runWhen</code> to skip a step conditionally.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Early-exit conditions (JSON array)</label>
              <textarea
                className="form-textarea"
                value={aiLoopEarlyExitJson}
                onChange={(e) => {
                  setAiLoopEarlyExitJson(e.target.value);
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setAiLoopEarlyExitError(Array.isArray(parsed) ? null : 'Must be a JSON array');
                  } catch (err) {
                    setAiLoopEarlyExitError((err as Error).message);
                  }
                }}
                placeholder={'[\n  "${verify.parsed.all_pass}",\n  "${review.parsed.all_pass}"\n]'}
                style={{ minHeight: '80px', fontFamily: 'monospace' }}
              />
              {aiLoopEarlyExitError && (
                <p className="text-xs" style={{ color: 'var(--accent-danger)' }}>{aiLoopEarlyExitError}</p>
              )}
              <p className="text-xs text-muted mt-1">
                ALL expressions must be truthy to exit. Each is a single <code>{'${path}'}</code> evaluated for truthiness (empty / <code>false</code> / <code>0</code> / <code>null</code> / <code>undefined</code> are falsy).
              </p>
            </div>

            <div className="text-xs text-muted">
              <strong>Output:</strong> {'{ rounds, earlyExit, steps (last-round results keyed by step.id), history (every round) }'}
            </div>
          </>
        );

      case 'transform':
        return (
          <>
            <div className="form-group">
              <label className="form-label">Output mapping (JSON)</label>
              <textarea
                className="form-textarea"
                value={transformMappingJson}
                onChange={(e) => {
                  setTransformMappingJson(e.target.value);
                  try {
                    const parsed = JSON.parse(e.target.value);
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                      setTransformMappingError('Must be a JSON object');
                    } else {
                      setTransformMappingError(null);
                    }
                  } catch (err) {
                    setTransformMappingError((err as Error).message);
                  }
                }}
                placeholder={'{\n  "questions": "${inputData.generator.parsed.questions}",\n  "count": "${inputData.generator.parsed.questions.length}"\n}'}
                style={{ minHeight: '160px', fontFamily: 'monospace' }}
              />
              {transformMappingError && (
                <p className="text-xs" style={{ color: 'var(--accent-danger)' }}>{transformMappingError}</p>
              )}
              <p className="text-xs text-muted mt-1">
                Each value is interpolated against the same context as <code>inputVars</code>:{' '}
                <code>{'${inputData.x}'}</code>, <code>{'${nodeId.output.path}'}</code>,{' '}
                <code>{'${input.fieldName}'}</code>. Result is JSON-parsed when possible so objects/arrays come through as-is.
              </p>
            </div>
            <div className="text-xs text-muted">
              <strong>Output:</strong> the mapped object — each key becomes a top-level field on this node's output.
            </div>
          </>
        );

      case 'aggregate': {
        const needsField = ['sum', 'avg', 'min', 'max', 'group-by', 'pick'].includes(aggregateOperation);
        const isConcat = aggregateOperation === 'concat';
        return (
          <>
            <div className="form-group">
              <label className="form-label">Input array path</label>
              <input
                type="text"
                className="form-input"
                value={aggregateInputPath}
                onChange={(e) => setAggregateInputPath(e.target.value)}
                placeholder="items"
              />
              <p className="text-xs text-muted mt-1">
                Dot-path into the resolved input. Defaults to <code>items</code> (matches fan-out output). Leave empty if the input itself is the array.
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Operation</label>
              <select
                className="form-select"
                value={aggregateOperation}
                onChange={(e) => setAggregateOperation(e.target.value as typeof aggregateOperation)}
              >
                <option value="count">count — array length</option>
                <option value="sum">sum — numeric reduction</option>
                <option value="avg">avg — numeric mean</option>
                <option value="min">min</option>
                <option value="max">max</option>
                <option value="flatten">flatten — array-of-arrays to flat array</option>
                <option value="group-by">group-by — group items by a field value</option>
                <option value="pick">pick — extract one field from each item</option>
                <option value="concat">concat — join values into a string</option>
              </select>
            </div>
            {(needsField || isConcat) && (
              <div className="form-group">
                <label className="form-label">
                  Field path {needsField ? '(required)' : '(optional, defaults to whole item)'}
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={aggregateField}
                  onChange={(e) => setAggregateField(e.target.value)}
                  placeholder="parsed.questions.length"
                />
                <p className="text-xs text-muted mt-1">
                  Dot-path into each array element. Example: <code>parsed.usage.totalTokens</code> to sum LLM token usage across fan-out iterations.
                </p>
              </div>
            )}
            {isConcat && (
              <div className="form-group">
                <label className="form-label">Separator</label>
                <input
                  type="text"
                  className="form-input"
                  value={aggregateSeparator}
                  onChange={(e) => setAggregateSeparator(e.target.value)}
                  placeholder="(empty)"
                />
              </div>
            )}
            <div className="text-xs text-muted">
              <strong>Output:</strong> {'{ result, count }'}
            </div>
          </>
        );
      }

      case 'load-document':
        return (
          <>
            <div className="form-group">
              <label className="form-label">Source path</label>
              <input
                type="text"
                className="form-input"
                value={loadDocumentSourcePath}
                onChange={(e) => setLoadDocumentSourcePath(e.target.value)}
                placeholder="${input.file}"
              />
              <p className="text-xs text-muted mt-1">
                Path to a PDF / PPTX / TXT file. Supports <code>{'${input.file}'}</code> interpolation when the workflow has a file input parameter.
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Max chunk chars</label>
              <input
                type="number"
                className="form-input"
                value={loadDocumentMaxChunkChars}
                onChange={(e) => setLoadDocumentMaxChunkChars(Number(e.target.value))}
                min={0}
                placeholder="2000"
              />
              <p className="text-xs text-muted mt-1">
                Soft upper bound on per-chunk text length. <code>0</code> disables splitting.
              </p>
            </div>
            <div className="text-xs text-muted">
              <strong>Output:</strong> {'{ chunks: [{ pageId, text, imagePath }], count }'}
            </div>
          </>
        );

      case 'quiz-output-writer':
        return (
          <>
            <div className="form-group">
              <label className="form-label">Filename</label>
              <input
                type="text"
                className="form-input"
                value={quizOutputFilename}
                onChange={(e) => setQuizOutputFilename(e.target.value)}
                placeholder="quiz.json"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Directory (optional)</label>
              <input
                type="text"
                className="form-input"
                value={quizOutputDirectory}
                onChange={(e) => setQuizOutputDirectory(e.target.value)}
                placeholder="(default: per-execution uploads dir)"
              />
            </div>
            <p className="text-xs text-muted">
              Expects inputVars <code>questions</code>, <code>sourceFile</code>, <code>focusArea</code>. For general JSON output prefer the <code>json-output-writer</code> node.
            </p>
            <div className="text-xs text-muted mt-2">
              <strong>Output:</strong> {'{ filePath, json }'}
            </div>
          </>
        );

      case 'json-output-writer':
        return (
          <>
            <div className="form-group">
              <label className="form-label">Filename</label>
              <input
                type="text"
                className="form-input"
                value={jsonOutputFilename}
                onChange={(e) => setJsonOutputFilename(e.target.value)}
                placeholder="output.json"
              />
              <p className="text-xs text-muted mt-1">
                File name written under <code>data/uploads/&lt;execution-id&gt;/</code>. Defaults to <code>output.json</code>.
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Directory (optional)</label>
              <input
                type="text"
                className="form-input"
                value={jsonOutputDirectory}
                onChange={(e) => setJsonOutputDirectory(e.target.value)}
                placeholder="(default: per-execution uploads dir)"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Root key (optional)</label>
              <input
                type="text"
                className="form-input"
                value={jsonOutputRootKey}
                onChange={(e) => setJsonOutputRootKey(e.target.value)}
                placeholder="(default: write entire resolved input)"
              />
              <p className="text-xs text-muted mt-1">
                If set, writes only <code>inputData[&lt;rootKey&gt;]</code> instead of the whole resolved input object.
              </p>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={jsonOutputPretty}
                  onChange={(e) => setJsonOutputPretty(e.target.checked)}
                />
                Pretty-print (2-space indent)
              </label>
            </div>
            <div className="text-xs text-muted">
              <strong>Output:</strong> {'{ filePath: string }'}
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div
      style={{
        width: '360px',
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: `${typeInfo.color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            {typeInfo.icon}
          </span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Configure Step</div>
            <div style={{ fontSize: '12px', color: typeInfo.color }}>{typeInfo.label}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        <div className="form-group">
          <label className="form-label">Step Name</label>
          <input
            type="text"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {renderConfigFields()}

        {/* Retry Policy - Only for actions, not triggers */}
        {!step.type.startsWith('trigger-') && step.type !== 'if-else' && step.type !== 'wait' && (
          <div className="mt-8 pt-6 border-t border-color">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold">Retry Policy</h4>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={retryEnabled}
                  onChange={(e) => setRetryEnabled(e.target.checked)}
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {retryEnabled && (
              <div className="space-y-4">
                <div className="form-group">
                  <label className="form-label">Max Attempts</label>
                  <input
                    type="number"
                    className="form-input"
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Number(e.target.value))}
                    min={1}
                    max={10}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Initial Interval (ms)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={initialInterval}
                    onChange={(e) => setInitialInterval(Number(e.target.value))}
                    min={100}
                    step={100}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Backoff Coefficient</label>
                  <input
                    type="number"
                    className="form-input"
                    value={backoffCoefficient}
                    onChange={(e) => setBackoffCoefficient(Number(e.target.value))}
                    min={1}
                    step={0.1}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* DAG v2 Advanced Section - fan-out and error policy */}
        {dagNode && (
          <NodeAdvancedSection
            node={dagNode}
            otherNodeIds={otherIds}
            onChange={(patch) => upsertNode({ ...dagNode, ...patch })}
          />
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '16px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          gap: '8px',
        }}
      >
        <button className="btn btn-danger btn-sm" onClick={onDelete}>
          <Trash2 size={14} />
          Delete
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          style={{ marginLeft: 'auto' }}
        >
          <Save size={14} />
          Save
        </button>
      </div>
    </div>
  );
}

export default NodeConfigPanel;
