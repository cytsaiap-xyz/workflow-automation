import { Router, Request, Response } from 'express';
import { AiProviderModel } from '../models/aiProviderModel';
import { AppSettingsModel } from '../models/appSettingsModel';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, data: AiProviderModel.getAll() });
});

router.get('/:id', (req: Request, res: Response) => {
  const p = AiProviderModel.getById(req.params.id);
  if (!p) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: p });
});

router.post('/', (req: Request, res: Response) => {
  try {
    const p = AiProviderModel.create(req.body);
    res.status(201).json({ success: true, data: p });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  const p = AiProviderModel.update(req.params.id, req.body);
  if (!p) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: p });
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const ok = AiProviderModel.delete(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (e: any) {
    res.status(409).json({ success: false, error: e.message });
  }
});

router.post('/:id/promote', (req: Request, res: Response) => {
  const p = AiProviderModel.update(req.params.id, { isDefault: true });
  if (!p) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: p });
});

router.get('/_settings/assistant', (_req: Request, res: Response) => {
  const id = AppSettingsModel.get('assistant_provider_id');
  res.json({ success: true, data: { providerId: id || null } });
});

router.put('/_settings/assistant', (req: Request, res: Response) => {
  const { providerId } = req.body || {};
  if (!providerId) return res.status(400).json({ success: false, error: 'providerId required' });
  if (!AiProviderModel.getById(providerId)) return res.status(404).json({ success: false, error: 'provider not found' });
  AppSettingsModel.set('assistant_provider_id', providerId);
  res.json({ success: true, data: { providerId } });
});

export default router;
