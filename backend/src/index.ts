import app from './app';
import { scheduler } from './services/scheduler';
import { initDatabase } from './db/database';
import { createLogger } from './utils/logger';
import { seedAiProvider } from './seeds/seedAiProvider';
import { seedPromptTemplates } from './seeds/seedPromptTemplates';
import { seedQuizWorkflow } from './seeds/seedQuizWorkflow';

const log = createLogger('index');
const PORT = process.env.PORT || 3002;

async function main() {
  // Database must be ready before accepting any requests
  await initDatabase();
  log.info('Database initialized');
  seedAiProvider();
  seedPromptTemplates();
  seedQuizWorkflow();

  const server = app.listen(PORT, async () => {
    log.info('Workflow Automation Backend running on http://localhost:%s', PORT);
    log.info('API endpoints:');
    log.info('   GET    /api/workflows          - List all workflows');
    log.info('   POST   /api/workflows          - Create workflow');
    log.info('   GET    /api/workflows/:id      - Get workflow');
    log.info('   PUT    /api/workflows/:id      - Update workflow');
    log.info('   DELETE /api/workflows/:id      - Delete workflow');
    log.info('   POST   /api/workflows/:id/execute  - Execute workflow');
    log.info('   POST   /api/workflows/:id/simulate - Simulate workflow');
    log.info('   GET    /api/executions         - List executions');
    log.info('   GET    /api/executions/:id     - Get execution');
    log.info('   GET    /api/executions/:id/logs - Get execution logs');
    log.info('   GET    /api/schedules          - List scheduled workflows');
    log.info('   PUT    /api/schedules/:id/pause - Pause schedule');
    log.info('   PUT    /api/schedules/:id/resume - Resume schedule');
    log.info('   ANY    /api/webhooks/:id       - Dynamic webhook endpoint');

    // Initialize scheduler
    try {
      await scheduler.initialize();
      log.info('Scheduler initialized');
    } catch (error) {
      log.error('Failed to initialize scheduler: %s', error);
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    log.info('SIGTERM received. Shutting down gracefully...');
    await scheduler.shutdown();
    server.close(() => {
      log.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    log.info('SIGINT received. Shutting down gracefully...');
    await scheduler.shutdown();
    server.close(() => {
      log.info('Server closed');
      process.exit(0);
    });
  });
}

main().catch(err => {
  log.error('Failed to start server: %s', err);
  process.exit(1);
});
