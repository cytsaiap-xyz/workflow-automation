import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowModel } from '../models/workflow';
import { ExecutionModel } from '../models/execution';
import { VersionModel } from '../models/version';
import { ExecutionEngine } from '../services/executionEngine';
import { scheduler } from '../services/scheduler';
import { validateCreateWorkflow, validateUpdateWorkflow } from '../middleware/validateWorkflow';
import { uploadMiddleware } from '../middleware/uploadHandler';
import { validateDag } from '../services/dagValidator';
import {
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  ExecuteWorkflowRequest,
  ApiResponse,
  Workflow,
  isV2,
} from '../types/workflow';

const router = Router();

// Helper to iterate all steps in a workflow regardless of v1/v2 schema
function allSteps(workflow: Workflow): Array<{ type: string; config: Record<string, any> }> {
  const def = workflow.definition as any;
  if (isV2(def)) {
    return (def.nodes as any[]) as Array<{ type: string; config: Record<string, any> }>;
  }
  return (def.stations as any[]).flatMap((s: any) => s.steps);
}

// Helper to handle scheduling logic
const syncSchedule = async (workflow: Workflow) => {
  // Find cron trigger
  let cronExpression: string | undefined;
  for (const step of allSteps(workflow)) {
    if (step.type === 'trigger-cron' && step.config?.cronExpression) {
      cronExpression = step.config.cronExpression;
      break;
    }
  }

  if (workflow.status === 'active' && cronExpression) {
    await scheduler.scheduleWorkflow(workflow, cronExpression);
  } else {
    scheduler.unscheduleWorkflow(workflow.id);
  }
};

/**
 * GET /api/workflows
 * Get all workflows
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const workflows = WorkflowModel.getAll();
    res.json({ success: true, data: workflows } as ApiResponse<typeof workflows>);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/workflows/:id
 * Get a specific workflow
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const workflow = WorkflowModel.getById(req.params.id);
    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }
    res.json({ success: true, data: workflow });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/workflows
 * Create a new workflow
 */
router.post('/', validateCreateWorkflow, async (req: Request, res: Response) => {
  try {
    const data: CreateWorkflowRequest = req.body;

    if (data.definition && isV2(data.definition as any)) {
      const v = validateDag(data.definition as any);
      if (v.errors.length) {
        return res.status(400).json({
          success: false,
          error: 'invalid DAG',
          data: { errors: v.errors, warnings: v.warnings },
        });
      }
    }

    const workflow = WorkflowModel.create(data);
    await syncSchedule(workflow); // Sync with scheduler
    
    res.status(201).json({ success: true, data: workflow });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/workflows/:id
 * Update a workflow
 */
router.put('/:id', validateUpdateWorkflow, async (req: Request, res: Response) => {
  try {
    const data: UpdateWorkflowRequest = req.body;

    if (data.definition && isV2(data.definition as any)) {
      const v = validateDag(data.definition as any);
      if (v.errors.length) {
        return res.status(400).json({
          success: false,
          error: 'invalid DAG',
          data: { errors: v.errors, warnings: v.warnings },
        });
      }
    }

    // Auto-version: save current definition before updating
    if (data.definition) {
      const current = WorkflowModel.getById(req.params.id);
      if (current) {
        const nextVersion = VersionModel.getLatestVersion(req.params.id) + 1;
        VersionModel.create(req.params.id, nextVersion, current.definition);
        VersionModel.deleteOldVersions(req.params.id);
      }
    }

    const workflow = WorkflowModel.update(req.params.id, data);

    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    await syncSchedule(workflow);

    res.json({ success: true, data: workflow });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/workflows/:id
 * Delete a workflow
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = WorkflowModel.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }
    
    scheduler.unscheduleWorkflow(req.params.id); // Remove from scheduler

    res.json({ success: true, data: { deleted: true } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/workflows/:id/execute
 * Execute a workflow (supports both application/json and multipart/form-data)
 */
async function runExecute(req: Request, res: Response, fromMultipart: boolean): Promise<void> {
  try {
    const workflow = WorkflowModel.getById(req.params.id);
    if (!workflow) {
      res.status(404).json({ success: false, error: 'Workflow not found' });
      return;
    }

    const inputData: Record<string, any> = {};
    let triggeredBy: ExecuteWorkflowRequest['triggeredBy'] = 'manual';

    if (fromMultipart) {
      Object.assign(inputData, req.body);
      const files = (req.files as Express.Multer.File[]) || [];
      for (const f of files) {
        inputData[f.fieldname] = f.path;
      }
      triggeredBy = (req.body?.triggeredBy as ExecuteWorkflowRequest['triggeredBy']) ?? 'manual';
    } else {
      const body: ExecuteWorkflowRequest = req.body || {};
      Object.assign(inputData, body.inputData ?? {});
      triggeredBy = body.triggeredBy ?? 'manual';
    }

    const executionId = req.executionId as string;

    // INSERT the row only after inputs are successfully gathered.
    ExecutionModel.create(workflow.id, workflow.name, triggeredBy, executionId);

    const execution = await ExecutionEngine.executeWithId(executionId, workflow, triggeredBy, inputData);
    res.json({ success: true, data: execution });
  } catch (error: any) {
    const status = error.message?.startsWith('Missing required input parameter') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
}

router.post('/:id/execute', async (req: Request, res: Response) => {
  // Pre-allocate the ID so multer can use it for the upload directory; do NOT INSERT yet.
  req.executionId = uuidv4();

  const ct = (req.headers['content-type'] || '').toString();

  if (ct.startsWith('multipart/')) {
    // Multipart path — let multer parse the body and save files.
    return new Promise<void>(resolve => {
      uploadMiddleware(req, res, async (err) => {
        if (err) {
          res.status(400).json({ success: false, error: err.message });
          return resolve();
        }
        await runExecute(req, res, true);
        resolve();
      });
    });
  }

  // JSON (or no-body) path — req.body already parsed by express.json() middleware.
  await runExecute(req, res, false);
});

/**
 * POST /api/workflows/:id/simulate
 */
router.post('/:id/simulate', async (req: Request, res: Response) => {
  try {
    const workflow = WorkflowModel.getById(req.params.id);
    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    const { inputData = {} }: ExecuteWorkflowRequest = req.body;

    const execution = await ExecutionEngine.execute(workflow, 'manual', inputData, true);
    res.json({ success: true, data: execution });
  } catch (error: any) {
    const status = error.message?.startsWith('Missing required input parameter') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/workflows/:id/executions
 */
router.get('/:id/executions', (req: Request, res: Response) => {
  try {
    const workflow = WorkflowModel.getById(req.params.id);
    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const executions = ExecutionModel.getByWorkflowId(req.params.id, limit);
    res.json({ success: true, data: executions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/workflows/:id/versions
 */
router.get('/:id/versions', (req: Request, res: Response) => {
  try {
    const versions = VersionModel.getByWorkflowId(req.params.id);
    res.json({ success: true, data: versions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/workflows/:id/versions/:version
 */
router.get('/:id/versions/:version', (req: Request, res: Response) => {
  try {
    const version = VersionModel.getByVersion(req.params.id, parseInt(req.params.version));
    if (!version) {
      return res.status(404).json({ success: false, error: 'Version not found' });
    }
    res.json({ success: true, data: version });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/workflows/:id/versions/:version/restore
 */
router.post('/:id/versions/:version/restore', async (req: Request, res: Response) => {
  try {
    const version = VersionModel.getByVersion(req.params.id, parseInt(req.params.version));
    if (!version) {
      return res.status(404).json({ success: false, error: 'Version not found' });
    }
    // Save current as new version before restoring
    const current = WorkflowModel.getById(req.params.id);
    if (current) {
      const nextVer = VersionModel.getLatestVersion(req.params.id) + 1;
      VersionModel.create(req.params.id, nextVer, current.definition, `Before restore to v${version.version}`);
    }
    const updated = WorkflowModel.update(req.params.id, { definition: version.definition });
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
