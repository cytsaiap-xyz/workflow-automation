import { Router, Request, Response } from 'express';
import { AssistantConversationModel } from '../models/assistantConversationModel';
import { PendingChangeModel } from '../models/pendingChangeModel';
import { WorkflowModel } from '../models/workflow';
import { applyDiff } from '../services/diffApplier';
import { runTurn } from '../services/assistantService';
import { SseWriter } from '../services/sseStream';

const router = Router();

router.post('/conversations', (req: Request, res: Response) => {
  const { workflowId, surface, nodeId } = req.body || {};
  if (!workflowId || !surface) {
    return res.status(400).json({ success: false, error: 'workflowId and surface required' });
  }
  const c = AssistantConversationModel.findOrCreate({ workflowId, surface, nodeId });
  res.json({ success: true, data: c });
});

router.get('/conversations/:id', (req: Request, res: Response) => {
  const c = AssistantConversationModel.getById(req.params.id);
  if (!c) return res.status(404).json({ success: false, error: 'not found' });
  res.json({ success: true, data: c });
});

router.post('/conversations/:id/messages', async (req: Request, res: Response) => {
  const conv = AssistantConversationModel.getById(req.params.id);
  if (!conv) return res.status(404).json({ success: false, error: 'not found' });
  const content: string = req.body?.content;
  if (!content) return res.status(400).json({ success: false, error: 'content required' });

  const sse = new SseWriter(res);
  try {
    await runTurn({
      conversationId: conv.id,
      userMessage: content,
      onEvent: (e) => sse.send(e),
    });
  } catch (e: any) {
    sse.send({ type: 'error', message: e.message });
  } finally {
    sse.close();
  }
});

router.get('/changes/:id', (req: Request, res: Response) => {
  const c = PendingChangeModel.getById(req.params.id);
  if (!c) return res.status(404).json({ success: false, error: 'not found' });
  res.json({ success: true, data: c });
});

router.post('/changes/:id/apply', (req: Request, res: Response) => {
  const c = PendingChangeModel.getById(req.params.id);
  if (!c) return res.status(404).json({ success: false, error: 'not found' });
  if (c.status !== 'pending') return res.status(409).json({ success: false, error: `change already ${c.status}` });
  const wf = WorkflowModel.getById(c.workflowId);
  if (!wf) return res.status(404).json({ success: false, error: 'workflow not found' });
  try {
    const updated = applyDiff(wf.definition, c.diff);
    WorkflowModel.update(c.workflowId, { definition: updated });
    PendingChangeModel.markApplied(c.id);
    res.json({ success: true, data: { applied: true } });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/changes/:id/reject', (req: Request, res: Response) => {
  const c = PendingChangeModel.getById(req.params.id);
  if (!c) return res.status(404).json({ success: false, error: 'not found' });
  if (c.status !== 'pending') return res.status(409).json({ success: false, error: `change already ${c.status}` });
  PendingChangeModel.markRejected(c.id);
  res.json({ success: true, data: { rejected: true } });
});

export default router;
