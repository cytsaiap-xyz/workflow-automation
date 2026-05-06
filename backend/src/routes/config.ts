import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      offlineMode: process.env.OFFLINE_MODE === 'true',
    },
  });
});

export default router;
