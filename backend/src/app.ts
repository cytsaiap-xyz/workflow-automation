import express from 'express';
import cors from 'cors';
import path from 'path';
import workflowRoutes from './routes/workflows';
import executionRoutes from './routes/executions';
import scheduleRoutes from './routes/schedules';
import metricsRoutes from './routes/metrics';
import webhookRoutes from './routes/webhooks';
import aiProvidersRouter from './routes/aiProviders';
import { requestLogger, createLogger } from './utils/logger';

const log = createLogger('app');

const app = express();

// Middleware
const corsOrigins = process.env.CORS_ORIGINS;
app.use(cors(
  corsOrigins
    ? { origin: corsOrigins.split(',').map(o => o.trim()), credentials: true }
    : undefined
));
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// Routes
app.use('/api/workflows', workflowRoutes);
app.use('/api/executions', executionRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/ai-providers', aiProvidersRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const publicDir = path.join(__dirname, '../public');
  app.use(express.static(publicDir));

  // SPA fallback: all non-API routes serve index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log.error('Error: %s', err);
  res.status(500).json({ success: false, error: err.message });
});

export default app;
