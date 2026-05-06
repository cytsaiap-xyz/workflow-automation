import { Router, Request, Response } from 'express';
import { WorkflowModel } from '../models/workflow';
import { ExecutionModel } from '../models/execution';
import { ExecutionEngine } from '../services/executionEngine';
import { isV2 } from '../types/dag';

const router = Router();

/**
 * ALL /api/webhooks/:workflowId
 * Handle incoming webhooks for a specific workflow
 * Supports any method, but validates against configured method if available
 */
router.all('/:id', async (req: Request, res: Response) => {
  try {
    const workflowId = req.params.id;
    const workflow = WorkflowModel.getById(workflowId);

    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    if (workflow.status !== 'active') {
      return res.status(403).json({ success: false, error: 'Workflow is not active' });
    }

    // Find webhook trigger node and validate method
    let webhookTrigger: any;
    const def = workflow.definition as any;
    const allSteps = isV2(def)
      ? (def.nodes as any[])
      : (def.stations as any[]).flatMap((s: any) => s.steps as any[]);
    for (const step of allSteps) {
      if (step.type === 'trigger-webhook') {
        webhookTrigger = step;
        break;
      }
    }

    if (!webhookTrigger) {
      return res.status(400).json({ success: false, error: 'Workflow does not have a webhook trigger' });
    }

    const expectedMethod = webhookTrigger.config.webhookMethod || 'POST';
    if (req.method !== expectedMethod && expectedMethod !== 'any') {
      // Allowing any as a fallback if desired, though spec said POST/GET/PUT
      return res.status(405).json({ 
        success: false, 
        error: `Method ${req.method} not allowed. Expected ${expectedMethod}` 
      });
    }

    // Prepare input data from request
    const inputData = {
      body: req.body,
      query: req.query,
      headers: req.headers,
      method: req.method,
      url: req.url
    };

    // Create execution record synchronously to get the ID before responding
    const execution = ExecutionModel.create(workflow.id, workflow.name, 'webhook');

    // Fire-and-forget: run the execution asynchronously, passing the pre-created execution ID
    ExecutionEngine.executeWithId(execution.id, workflow, 'webhook', inputData)
      .catch(err => console.error(`Webhook execution failed for ${workflowId}:`, err));

    res.status(202).json({
      success: true,
      message: 'Webhook received and execution started',
      executionId: execution.id
    });

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
