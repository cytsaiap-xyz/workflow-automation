import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { ENV_UPLOADS_ROOT } from '../middleware/uploadHandler';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const requested = String(req.query.path || '');
  if (!requested) {
    return res.status(400).json({ success: false, error: 'path query param required' });
  }
  const resolved = path.resolve(requested);
  // Path-traversal guard: only allow files inside ENV_UPLOADS_ROOT.
  if (resolved !== ENV_UPLOADS_ROOT && !resolved.startsWith(ENV_UPLOADS_ROOT + path.sep)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return res.status(404).json({ success: false, error: 'not found' });
  }
  res.download(resolved);
});

export default router;
