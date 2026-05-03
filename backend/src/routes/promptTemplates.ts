import { Router, Request, Response } from 'express';
import { PromptTemplateModel } from '../models/promptTemplateModel';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const tag = req.query.tag as string | undefined;
  const role = req.query.role as 'system' | 'user' | undefined;
  let list = PromptTemplateModel.getAll();
  if (tag) list = list.filter(t => t.tags.includes(tag));
  if (role) list = list.filter(t => t.role === role);
  res.json({ success: true, data: list });
});

router.get('/:id', (req: Request, res: Response) => {
  const t = PromptTemplateModel.getById(req.params.id);
  if (!t) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: t });
});

router.post('/', (req: Request, res: Response) => {
  const t = PromptTemplateModel.create(req.body);
  res.status(201).json({ success: true, data: t });
});

router.put('/:id', (req: Request, res: Response) => {
  const t = PromptTemplateModel.update(req.params.id, req.body);
  if (!t) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: t });
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const ok = PromptTemplateModel.delete(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (e: any) {
    res.status(409).json({ success: false, error: e.message });
  }
});

export default router;
