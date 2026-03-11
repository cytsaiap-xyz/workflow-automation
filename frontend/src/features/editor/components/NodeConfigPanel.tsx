import { useState, useEffect } from 'react';
import type { Step, Workflow } from '../../../shared/types/workflow';
import { STEP_TYPE_INFO } from '../../../shared/types/workflow';
import X from 'lucide-react/dist/esm/icons/x';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import Save from 'lucide-react/dist/esm/icons/save';
import Database from 'lucide-react/dist/esm/icons/database';
import Package from 'lucide-react/dist/esm/icons/package';
import { VariablePicker } from './VariablePicker';

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

  // Picker state
  const [activePicker, setActivePicker] = useState<string | null>(null);

  // Retry Policy
  const [retryEnabled, setRetryEnabled] = useState(!!step.retryPolicy);
  const [maxAttempts, setMaxAttempts] = useState(step.retryPolicy?.maxAttempts || 3);
  const [initialInterval, setInitialInterval] = useState(step.retryPolicy?.initialInterval || 1000);
  const [backoffCoefficient, setBackoffCoefficient] = useState(step.retryPolicy?.backoffCoefficient || 2);

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
        return (
          <>
            {/* Connection */}
            <div className="form-group">
              <label className="form-label">Base URL (vLLM Server)</label>
              <input
                type="text"
                className="form-input"
                value={aiBaseUrl}
                onChange={(e) => setAiBaseUrl(e.target.value)}
                placeholder="http://localhost:8000/v1"
              />
            </div>
            <div className="form-group">
              <label className="form-label">API Key (optional)</label>
              <input
                type="password"
                className="form-input"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder="Leave empty if not required"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Model</label>
              <input
                type="text"
                className="form-input"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="meta-llama/Llama-3-8B-Instruct"
              />
            </div>

            {/* Headers */}
            <div className="form-group">
              <div className="flex justify-between items-center mb-2">
                <label className="form-label">Headers (Auth)</label>
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
              <label className="form-label">System Prompt</label>
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
                <button
                  className="btn btn-ghost btn-xs flex gap-1 items-center"
                  onClick={() => setActivePicker(activePicker === 'aiPrompt' ? null : 'aiPrompt')}
                >
                  <Database size={10} /> Insert Variable
                </button>
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

            {/* Output info */}
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded text-xs border border-gray-200 dark:border-gray-700">
              <p className="font-semibold mb-1">Output Structure:</p>
              <div className="font-mono text-muted">
                {'{'}<br/>
                &nbsp;&nbsp;response: string,<br/>
                &nbsp;&nbsp;parsed: any,<br/>
                &nbsp;&nbsp;model: string,<br/>
                &nbsp;&nbsp;usage: {'{ promptTokens, completionTokens, totalTokens }'}<br/>
                {step.type === 'ai-agent' && <>&nbsp;&nbsp;toolCalls: array,<br/>&nbsp;&nbsp;iterations: number,<br/></>}
                {'}'}
              </div>
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
