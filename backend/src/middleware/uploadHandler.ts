import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_DIR || 'data/uploads');

if (!fs.existsSync(UPLOADS_ROOT)) {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
}

export const ENV_UPLOADS_ROOT = UPLOADS_ROOT;

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const executionId = req.executionId || `pending-${uuidv4()}`;
    req.executionId = executionId;
    const dir = path.join(UPLOADS_ROOT, executionId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]/g, '_');
    cb(null, safe);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
}).any();
