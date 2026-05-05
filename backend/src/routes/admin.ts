import { Router, Request, Response } from 'express';
import db from '../db/database';
import { migrateToV2 } from '../services/dagMigrator';

const router = Router();

router.post('/migrate-workflows', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT id, definition FROM workflows WHERE schema_version < 2').all();
  let migrated = 0;
  for (const r of rows) {
    const v2 = migrateToV2(JSON.parse(r.definition as string));
    db.prepare('UPDATE workflows SET definition = ?, schema_version = 2, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(v2), new Date().toISOString(), r.id as string);
    migrated++;
  }
  res.json({ success: true, data: { migrated } });
});

export default router;
